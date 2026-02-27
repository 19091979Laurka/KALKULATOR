"""
KALKULATOR — Kalkulator Roszczeń Odszkodowawczych Przesyłowych
FastAPI backend: API + serwowanie frontend/index.html
"""
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.modules.terrain import fetch_terrain

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Kalkulator Roszczeń Przesyłowych", version="1.0.0")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


# ── Modele żądania / odpowiedzi ───────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    parcel_ids: str                     # np. "061802_2.0004.109" lub "109, 110"
    county: Optional[str] = None        # np. "płoński"
    municipality: Optional[str] = None  # np. "Baboszewo"
    infra_type: str = "elektro_SN"
    years_unauthorized: int = 10


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
    
    aggregator = PropertyAggregator()
    ids = [i.strip() for i in req.parcel_ids.replace("\n", ",").split(",") if i.strip()]
    results = []

    for pid in ids:
        try:
            # 1. Agregacja danych (14 punktów) -> Master JSON Record
            master_record = await aggregator.generate_master_record(
                pid, 
                req.infra_type,
                county=req.county,
                municipality=req.municipality
            )

            # 2. Złożenie finalnej odpowiedzi (BEZ WYCENY)
            res = {
                "parcel_id": pid,
                "master_record": master_record
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
            "timestamp": datetime.now(timezone.utc).isoformat()
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
