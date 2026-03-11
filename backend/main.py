"""
KALKULATOR — Kalkulator Roszczeń Odszkodowawczych Przesyłowych
Spec v3.0 (Strict Real Data Policy)
BATCH: CSV upload for 99 parcels + History storage
"""
import logging
import os
import csv
import json
import asyncio
from io import StringIO
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.modules.terrain import fetch_terrain
from backend.modules.property import PropertyAggregator
from backend.modules.infrastructure import prefetch_regional_osm, clear_regional_cache
from backend.core.valuation import calculate_compensation
from backend.core.reports import create_summary_dict
from backend.modules.pdf_report import generate_pdf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Kalkulator Roszczeń (Spec 3.0)", version="3.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (development)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
HISTORY_DIR = Path(__file__).parent / ".." / "data" / "history"
HISTORY_DIR.mkdir(parents=True, exist_ok=True)

class AnalyzeRequest(BaseModel):
    parcel_ids: str
    obreb: Optional[str] = None        # obręb ewidencyjny (np. "Cieszkowo Kolonia") — wymagany dla GetParcelByIdOrNr
    county: Optional[str] = None       # powiat — pomocniczo
    municipality: Optional[str] = None # gmina — pomocniczo (NIE jest obrebem!)
    infra_type_pref: str = "elektro_SN"
    # Korekta ręczna — nadpisuje dane z API gdy rzeczywistość się nie zgadza
    manual_price_m2: Optional[float] = None       # Ręczna cena rynkowa [PLN/m²]
    manual_land_type: Optional[str] = None        # "agricultural" | "building"
    manual_infra_detected: Optional[bool] = None  # Ręczne potwierdzenie infrastruktury
    manual_voltage: Optional[str] = None          # "WN" | "SN" | "nN"

class BatchParcelRow(BaseModel):
    parcel_id: str
    obreb: Optional[str] = None
    county: Optional[str] = None
    municipality: Optional[str] = None

class ValuationRequest(BaseModel):
    parcel_area_m2: float              # Całkowita powierzchnia działki [m²]
    value_per_m2: float                # Jednostkowa wartość gruntu [PLN/m²]
    occupied_area_m2: float            # Powierzchnia zajęta przez pas ochronny [m²]
    voltage: Optional[str] = None      # Napięcie (np. "400kV", "110kV")

@app.get("/")
async def index():
    html_file = FRONTEND_DIR / "index.html"
    if html_file.exists(): return FileResponse(html_file)
    return {"message": "KALKULATOR API v3.0 — BRAK FRONTENDU"}

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    """
    Główny endpoint analizy dzialek.
    Zapewnia jawność pochodzenia danych (Rule 2).
    """
    aggregator = PropertyAggregator()
    ids = [i.strip() for i in req.parcel_ids.replace("\n", ",").split(",") if i.strip()]
    results = []

    for pid in ids:
        try:
            # Agregacja z zachowaniem statusu REAL/TEST/ERROR
            master_record = await aggregator.generate_master_record(
                pid,
                req.infra_type_pref,
                obreb=req.obreb,
                county=req.county,
                municipality=req.municipality,
                manual_price_m2=req.manual_price_m2,
                manual_land_type=req.manual_land_type,
                manual_infra_detected=req.manual_infra_detected,
                manual_voltage=req.manual_voltage,
            )
            
            results.append({
                "parcel_id": pid,
                "data_status": master_record.get("status", "REAL"),
                "master_record": master_record
            })
        except Exception as e:
            logger.error(f"Błąd analizy {pid}: {e}")
            results.append({
                "parcel_id": pid,
                "data_status": "ERROR",
                "error": str(e)
            })

    return {
        "summary": {
            "count": len(results),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "policy": "STRICT REAL DATA ONLY (Spec 3.0)"
        },
        "parcels": results
    }

@app.post("/api/analyze/batch")
async def analyze_batch_csv(file: UploadFile = File(...)):
    """
    Batch analysis from CSV upload.
    CSV format: parcel_id,obreb,county,municipality

    Returns analysis for all parcels + saves to history.
    """
    try:
        # Read CSV
        content = await file.read()
        csv_str = content.decode('utf-8')
        csv_reader = csv.DictReader(StringIO(csv_str))
        rows = list(csv_reader)

        if not rows:
            raise ValueError("CSV jest pusty")

        aggregator = PropertyAggregator()
        all_results = []

        # ====== KROK 0: Pre-fetch geometrii działek → regional OSM cache ======
        # Pobierz geometrie wszystkich działek (ULDK) → compute regional BBOX
        # → jedno zapytanie Overpass zamiast 99 osobnych
        logger.info("BATCH: Krok 0 — pobieranie geometrii %d działek z ULDK...", len(rows))
        parcel_ids = [row.get('parcel_id', '').strip() for row in rows if row.get('parcel_id', '').strip()]
        parcel_geometries = []

        async def fetch_geom(pid):
            try:
                t = await fetch_terrain(pid)
                if t.get("ok") and t.get("geometry"):
                    return t["geometry"]
            except:
                pass
            return None

        # Pobierz geometrie równolegle (max 20 jednocześnie — throttle ULDK)
        CHUNK_SIZE = 20
        for i in range(0, len(parcel_ids), CHUNK_SIZE):
            chunk = parcel_ids[i:i + CHUNK_SIZE]
            geom_tasks = [fetch_geom(pid) for pid in chunk]
            geom_results = await asyncio.gather(*geom_tasks)
            parcel_geometries.extend([g for g in geom_results if g])

        logger.info("BATCH: Pobrano %d/%d geometrii", len(parcel_geometries), len(parcel_ids))

        # Jedno zapytanie Overpass dla CAŁEGO regionu
        try:
            osm_count = await prefetch_regional_osm(parcel_geometries)
            logger.info("BATCH: Regional OSM cache: %d linii energetycznych", osm_count)
        except Exception as e:
            logger.warning("BATCH: Regional OSM prefetch error: %s — parcels will use individual queries", e)

        # ====== KROK 1: Analiza wszystkich działek (z cache) ======
        async def analyze_single(row):
            try:
                parcel_id = row.get('parcel_id', '').strip()
                if not parcel_id:
                    return None

                master_record = await aggregator.generate_master_record(
                    parcel_id,
                    infra_type_pref="elektro_SN",
                    obreb=row.get('obreb'),
                    county=row.get('county'),
                    municipality=row.get('municipality'),
                )

                return {
                    "parcel_id": parcel_id,
                    "status": master_record.get("status", "REAL"),
                    "data": master_record,
                    "error": None
                }
            except Exception as e:
                logger.error(f"Błąd analizy {row.get('parcel_id', '?')}: {e}")
                return {
                    "parcel_id": row.get('parcel_id', '?'),
                    "status": "ERROR",
                    "data": None,
                    "error": str(e)
                }

        # Parallel analysis (z regional cache — bez rate-limitingu Overpass)
        tasks = [analyze_single(row) for row in rows]
        results = await asyncio.gather(*tasks)
        all_results = [r for r in results if r is not None]

        # Wyczyść cache po batch
        clear_regional_cache()

        # Save to history
        batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        history_file = HISTORY_DIR / f"batch_{batch_id}.json"

        history_data = {
            "batch_id": batch_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "file_name": file.filename,
            "parcel_count": len(all_results),
            "successful": sum(1 for r in all_results if r["status"] != "ERROR"),
            "results": all_results
        }

        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history_data, f, indent=2, ensure_ascii=False)

        logger.info(f"Batch analysis saved to {history_file}")

        return {
            "ok": True,
            "batch_id": batch_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total": len(all_results),
                "successful": sum(1 for r in all_results if r["status"] != "ERROR"),
                "failed": sum(1 for r in all_results if r["status"] == "ERROR")
            },
            "parcels": all_results
        }

    except Exception as e:
        logger.error(f"Błąd batch upload: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/history")
async def get_analysis_history():
    """
    Get list of all batch analyses from history.
    """
    try:
        history_files = sorted(HISTORY_DIR.glob("batch_*.json"), reverse=True)

        summaries = []
        for hfile in history_files[:20]:  # Last 20 batches
            with open(hfile, 'r', encoding='utf-8') as f:
                data = json.load(f)
                summaries.append({
                    "batch_id": data["batch_id"],
                    "timestamp": data["timestamp"],
                    "file_name": data["file_name"],
                    "total": data["parcel_count"],
                    "successful": data["successful"]
                })

        return {
            "ok": True,
            "history": summaries
        }
    except Exception as e:
        logger.error(f"Błąd pobierania historii: {e}")
        return {"ok": False, "error": str(e), "history": []}

@app.get("/api/history/{batch_id}")
async def get_batch_details(batch_id: str):
    """
    Get detailed results for a specific batch.
    """
    try:
        history_file = HISTORY_DIR / f"batch_{batch_id}.json"
        if not history_file.exists():
            raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

        with open(history_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return {
            "ok": True,
            "data": data
        }
    except Exception as e:
        logger.error(f"Błąd pobierania szczegółów batch: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/parcel/{parcel_id}")
async def get_parcel_preview(parcel_id: str):
    """Szybki podgląd tylko z ULDK (Rule 6)."""
    terrain = await fetch_terrain(parcel_id)
    return terrain

@app.post("/api/valuation")
async def calculate_valuation(req: ValuationRequest):
    """
    Szybka kalkulacja wartości roszczenia na podstawie danych geometrycznych.

    Zwraca rozbicie wg art. 124, 305², 225 KC + odsetki.
    """
    try:
        result = calculate_compensation(
            parcel_area_m2=req.parcel_area_m2,
            value_per_m2=req.value_per_m2,
            occupied_area_m2=req.occupied_area_m2,
            voltage=req.voltage
        )

        return {
            "ok": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "input": {
                "parcel_area_m2": req.parcel_area_m2,
                "value_per_m2": req.value_per_m2,
                "occupied_area_m2": req.occupied_area_m2,
                "voltage": req.voltage
            },
            "result": result
        }
    except Exception as e:
        logger.error(f"Błąd kalkulacji wyceny: {e}")
        return {
            "ok": False,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

@app.post("/api/summary")
async def get_analysis_summary(results: List[dict]):
    """
    Tworzy podsumowanie statystyczne z listy wyników analizy.
    """
    try:
        summary = create_summary_dict(results)
        return {
            "ok": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": summary
        }
    except Exception as e:
        logger.error(f"Błąd tworzenia podsumowania: {e}")
        return {
            "ok": False,
            "error": str(e)
        }

class PdfReportRequest(BaseModel):
    parcels: List[dict]          # lista {parcel_id, master_record}
    owner_name: Optional[str] = "Właściciel"
    kw_number: Optional[str] = ""
    address: Optional[str] = ""

@app.post("/api/report/pdf")
async def report_pdf(req: PdfReportRequest):
    """
    Generuje raport PDF z danych analizy i zwraca plik do pobrania.
    Dane wejściowe: lista wyników z /api/analyze (pole parcels).
    """
    try:
        masters = [p.get("master_record", {}) for p in req.parcels]
        ids     = [p.get("parcel_id", f"Dz.{i+1}") for i, p in enumerate(req.parcels)]
        pdf_bytes = generate_pdf(
            parcels_data=masters,
            parcel_ids=ids,
            owner_name=req.owner_name or "Właściciel",
            kw_number=req.kw_number or "",
            address=req.address or "",
        )
        filename = f"raport_KSWS_{ids[0].replace('/','_')}_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.error(f"Błąd generowania PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
