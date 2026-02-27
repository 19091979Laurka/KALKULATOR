"""
KALKULATOR — Kalkulator Roszczeń Odszkodowawczych Przesyłowych
FastAPI backend: API + serwowanie frontend/index.html
"""
import asyncio
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.modules.terrain import fetch_terrain
from backend.modules.planning import fetch_planning
from backend.modules.infrastructure import fetch_infrastructure
from backend.modules.calculator import calculate_valuation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Kalkulator Roszczeń Przesyłowych", version="1.0.0")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


# ── Modele żądania / odpowiedzi ───────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    parcel_ids: str                     # np. "061802_2.0004.109" lub "109, 110"
    infra_type: str = "elektro_SN"      # typ infrastruktury (domyślny)
    years_unauthorized: int = 10        # lata bezumownego korzystania (domyślny)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
async def index():
    """Serwuje stronę główną."""
    html_file = FRONTEND_DIR / "index.html"
    if html_file.exists():
        return FileResponse(html_file)
    return {"message": "KALKULATOR API — brak frontend/index.html"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "kalkulator"}


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    """
    Główny endpoint analizy działek (Spec v3.0 - Architecture: Only Logic).
    Zwraca Property_Master_Record dla każdej działki.
    """
    from backend.modules.property import PropertyAggregator
    from backend.modules.calculator import calculate_valuation
    
    aggregator = PropertyAggregator()
    ids = [i.strip() for i in req.parcel_ids.replace("\n", ",").split(",") if i.strip()]
    results = []

    for pid in ids:
        try:
            # 1. Agregacja danych (14 punktów) -> Master JSON Record
            master_record = await aggregator.generate_master_record(pid, req.infra_type)
            
            # 2. Silnik wyceny KSWS (korzysta z Master Record)
            # Adaptacja: przekazujemy dane z master_record
            geom = master_record["geometry"]
            infra = master_record["infrastructure"]["power"]
            
            valuation = await calculate_valuation(
                lon=geom["centroid_ll"][0],
                lat=geom["centroid_ll"][1],
                area_m2=geom["area_m2"],
                infra_type=req.infra_type,
                infra_length_m=infra["line_length_m"] or 0.0,
                strefa_m=infra["buffer_zone_m"] or 10,
                teryt=pid.replace("_", "").replace(".", "")[:6],
                years_unauthorized=req.years_unauthorized,
            )

            # 3. Złożenie finalnej odpowiedzi
            res = {
                "parcel_id": pid,
                "master_record": master_record,
                "valuation": valuation
            }
            results.append(res)
        except Exception as e:
            logger.error(f"Błąd analizy działki {pid}: {e}")

    if not results:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono żadnej z podanych działek lub błąd agregacji danych."
        )

    return {
        "summary": {
            "count": len(results),
            "timestamp": "2026-02-27T11:34:00Z"
        },
        "parcels": results
    }


@app.get("/api/parcel/{parcel_id}")
async def get_parcel(parcel_id: str):
    """Pobierz tylko dane geometryczne działki (podgląd przed analizą)."""
    terrain = await fetch_terrain(parcel_id)
    return terrain


# ── Uruchomienie lokalne ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
