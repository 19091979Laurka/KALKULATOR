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
    parcel_id: str                      # np. "061802_2.0004.109"
    infra_type: str = "elektro_SN"      # typ infrastruktury
    lon: Optional[float] = None         # opcjonalnie: współrzędne
    lat: Optional[float] = None
    years_unauthorized: int = 10        # lata bezumownego korzystania
    # Pola manualne (formalnoprawne)
    has_building_permit: Optional[bool] = None
    building_permit_year: Optional[int] = None


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
    Główny endpoint analizy działki.
    Pobiera dane z ULDK, GESUT, WFS planowania, RCN/GUS i oblicza odszkodowanie.
    """
    # 1. Cechy terenu
    terrain = await fetch_terrain(req.parcel_id, req.lon, req.lat)

    # Ustal centroid do dalszych zapytań
    centroid = terrain.get("centroid", {})
    lon = centroid.get("lon") or req.lon
    lat = centroid.get("lat") or req.lat

    if not lon or not lat:
        raise HTTPException(
            status_code=400,
            detail="Nie można ustalić współrzędnych działki. Podaj lon/lat lub poprawny parcel_id."
        )

    area_m2 = terrain.get("area_m2") or 1000.0

    # Pobierz TERYT z parcel_id (pierwsze 6 znaków bez separatorów)
    teryt = req.parcel_id.replace("_", "").replace(".", "")[:6] if req.parcel_id else None

    # 2-4: Pobierz pozostałe dane równolegle
    planning_task = fetch_planning(lon, lat)
    infra_task = fetch_infrastructure(lon, lat, terrain.get("geometry"), req.infra_type)

    planning, infra = await asyncio.gather(planning_task, infra_task)

    # Wyciągnij dane infrastruktury do kalkulatora
    energie = infra.get("energie", {})
    infra_length = energie.get("length_m") or 50.0  # domyślnie 50m jeśli brak danych GESUT
    strefa_m = energie.get("strefa_m", 10)

    # 5. Wycena
    valuation = await calculate_valuation(
        lon=lon,
        lat=lat,
        area_m2=area_m2,
        infra_type=req.infra_type,
        infra_length_m=infra_length,
        strefa_m=strefa_m,
        teryt=teryt,
        years_unauthorized=req.years_unauthorized,
    )

    return {
        "parcel_id": req.parcel_id,
        "infra_type": req.infra_type,
        "terrain": terrain,
        "planning": planning,
        "infrastructure": infra,
        "valuation": valuation,
        "manual_inputs": {
            "has_building_permit": req.has_building_permit,
            "building_permit_year": req.building_permit_year,
        },
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
