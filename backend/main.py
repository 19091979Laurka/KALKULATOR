"""
KALKULATOR — Kalkulator Roszczeń Odszkodowawczych Przesyłowych
Spec v3.0 (Strict Real Data Policy)
"""
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from backend.modules.terrain import fetch_terrain
from backend.modules.property import PropertyAggregator
from backend.core.valuation import calculate_compensation
from backend.core.reports import create_summary_dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Kalkulator Roszczeń (Spec 3.0)", version="3.0.0")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

class AnalyzeRequest(BaseModel):
    parcel_ids: str
    obreb: Optional[str] = None        # obręb ewidencyjny (np. "Cieszkowo Kolonia") — wymagany dla GetParcelByIdOrNr
    county: Optional[str] = None       # powiat — pomocniczo
    municipality: Optional[str] = None # gmina — pomocniczo (NIE jest obrebem!)
    infra_type_pref: str = "elektro_SN"

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

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
