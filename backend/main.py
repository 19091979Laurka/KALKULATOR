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

# Serwowanie statycznych assetów React (JS, CSS, images) — musi być po /api/ routach
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    """SPA fallback — React Router obsługuje routing po stronie klienta."""
    # Próbuj plik statyczny
    static_file = FRONTEND_DIR / full_path
    if static_file.exists() and static_file.is_file():
        return FileResponse(static_file)
    # Fallback → index.html (React Router)
    html_file = FRONTEND_DIR / "index.html"
    if html_file.exists(): return FileResponse(html_file)
    return {"error": "not found"}

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
        # Read CSV (obsługa BOM, różnych kodowań, separatorów)
        content = await file.read()
        # Próbuj UTF-8 z BOM, potem bez, potem latin-1
        for enc in ('utf-8-sig', 'utf-8', 'cp1250', 'latin-1'):
            try:
                csv_str = content.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            csv_str = content.decode('utf-8', errors='replace')

        # Auto-detect separator (; lub ,)
        first_line = csv_str.split('\n')[0] if csv_str else ''
        delimiter = ';' if ';' in first_line and ',' not in first_line else ','

        csv_reader = csv.DictReader(StringIO(csv_str), delimiter=delimiter)
        rows = list(csv_reader)

        # Jeśli brak kolumny parcel_id, szukaj alternatywnych nazw
        if rows and 'parcel_id' not in rows[0]:
            alt_keys = [k for k in rows[0].keys() if k and k.strip().lower() in (
                'parcel_id', 'id', 'dzialka', 'działka', 'numer', 'identyfikator', 'nr_dzialki'
            )]
            if alt_keys:
                real_key = alt_keys[0]
                rows = [{**r, 'parcel_id': r[real_key]} for r in rows]
                logger.info("BATCH: Mapped column '%s' → 'parcel_id'", real_key)
            else:
                # Może CSV ma jedną kolumnę bez nagłówka — traktuj jako listę ID
                all_vals = [v.strip() for r in rows for v in r.values() if v and v.strip()]
                logger.warning("BATCH: No 'parcel_id' column found, keys=%s, trying first column", list(rows[0].keys()))
                first_key = list(rows[0].keys())[0] if rows[0] else None
                if first_key:
                    rows = [{'parcel_id': r[first_key].strip()} for r in rows if r.get(first_key, '').strip()]

        if not rows:
            raise ValueError("CSV jest pusty lub brak kolumny parcel_id")

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


class MapReportRequest(BaseModel):
    parcels: List[dict]   # [{parcel_id, master_record}]
    title: Optional[str] = "Mapa działek — analiza KSWS"

@app.post("/api/report/map")
async def report_interactive_map(req: MapReportRequest):
    """Generuje standalone HTML z interaktywną mapą Leaflet (99 działek + linie)."""
    try:
        html = _generate_map_html(req.parcels, req.title or "Mapa KSWS")
        return Response(
            content=html.encode("utf-8"),
            media_type="text/html",
            headers={"Content-Disposition": 'attachment; filename="Mapa_KSWS.html"'},
        )
    except Exception as e:
        logger.error(f"Map HTML error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _generate_map_html(parcels: list, title: str) -> str:
    """Buduje standalone HTML z Leaflet, satelitą, działkami i liniami."""
    import json as _json

    features_parcels = []
    features_lines = []
    total_a = 0
    total_b = 0
    collision_count = 0

    for p in parcels:
        pid = p.get("parcel_id", "?")
        mr = p.get("master_record", {})
        geom = mr.get("geometry", {})
        infra = mr.get("infrastructure", {})
        pl = infra.get("power_lines", {})
        comp = mr.get("compensation", {})
        ksws = mr.get("ksws", {})
        ta = comp.get("track_a", {}).get("total", 0) or 0
        tb = comp.get("track_b", {}).get("total", 0) or 0
        total_a += ta
        total_b += tb
        detected = pl.get("detected", False)
        if detected:
            collision_count += 1

        gj = geom.get("geojson_ll") or geom.get("geojson")
        if gj and gj.get("coordinates"):
            features_parcels.append({
                "type": "Feature",
                "geometry": gj,
                "properties": {
                    "id": pid, "detected": detected,
                    "voltage": pl.get("voltage", "—"),
                    "area_m2": geom.get("area_m2", 0),
                    "track_a": round(ta, 2), "track_b": round(tb, 2),
                    "band_area": ksws.get("band_area_m2", 0),
                    "line_length": infra.get("power", {}).get("line_length_m", 0),
                },
            })

        pl_geo = pl.get("geojson", {})
        if pl_geo and pl_geo.get("features"):
            for feat in pl_geo["features"]:
                feat_copy = {
                    "type": "Feature",
                    "geometry": feat.get("geometry"),
                    "properties": {"voltage": feat.get("properties", {}).get("voltage", "SN"), "parcel": pid},
                }
                features_lines.append(feat_copy)

    parcels_json = _json.dumps({"type": "FeatureCollection", "features": features_parcels}, ensure_ascii=False)
    lines_json = _json.dumps({"type": "FeatureCollection", "features": features_lines}, ensure_ascii=False)
    n = len(features_parcels)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:'Segoe UI',system-ui,sans-serif;background:#111}}
  #map{{position:absolute;top:0;left:0;right:0;bottom:0;z-index:1}}
  .panel{{position:absolute;top:12px;left:12px;z-index:999;background:rgba(20,20,35,.92);
    color:#eee;padding:16px 20px;border-radius:10px;max-width:340px;font-size:13px;
    box-shadow:0 4px 20px rgba(0,0,0,.5);backdrop-filter:blur(8px)}}
  .panel h2{{font-size:15px;margin-bottom:8px;color:#f39c12}}
  .panel .row{{display:flex;justify-content:space-between;padding:3px 0}}
  .panel .row .val{{font-weight:700}}
  .panel .total{{margin-top:8px;padding:8px;background:linear-gradient(135deg,#27ae60,#2ecc71);
    border-radius:6px;text-align:center;font-size:16px;font-weight:800;color:#fff}}
  .panel .sub{{font-size:11px;color:#999;margin-top:6px}}
  .legend{{position:absolute;bottom:20px;left:12px;z-index:999;background:rgba(20,20,35,.9);
    color:#ddd;padding:12px 16px;border-radius:8px;font-size:12px}}
  .legend div{{display:flex;align-items:center;gap:6px;padding:2px 0}}
  .legend .sw{{width:14px;height:14px;border-radius:3px;flex-shrink:0}}
  .filter-bar{{position:absolute;top:12px;right:12px;z-index:999;display:flex;gap:6px}}
  .filter-bar button{{padding:6px 12px;border:none;border-radius:6px;font-size:12px;
    font-weight:600;cursor:pointer;opacity:.85;transition:.2s}}
  .filter-bar button:hover{{opacity:1}}
  .filter-bar button.active{{box-shadow:0 0 0 2px #fff}}
</style>
</head>
<body>
<div id="map"></div>
<div class="panel">
  <h2>⚡ {title}</h2>
  <div class="row"><span>Działek:</span><span class="val">{n}</span></div>
  <div class="row"><span>Kolizja z linią:</span><span class="val" style="color:#e74c3c">{collision_count}</span></div>
  <div class="row"><span>Bez kolizji:</span><span class="val" style="color:#2ecc71">{n - collision_count}</span></div>
  <div class="row"><span>Track A (sąd):</span><span class="val">{total_a:,.0f} PLN</span></div>
  <div class="row"><span>Track B (neg.):</span><span class="val" style="color:#f39c12">{total_b:,.0f} PLN</span></div>
  <div class="total">RAZEM: {total_a + total_b:,.0f} PLN</div>
  <div class="sub">Raport: {now_str} · KSWS v3.0</div>
</div>
<div class="legend">
  <div><div class="sw" style="background:#e74c3c"></div> Działka z kolizją</div>
  <div><div class="sw" style="background:#2ecc71"></div> Działka bez kolizji</div>
  <div><div class="sw" style="background:#00bb00"></div> Linia SN (15-30 kV)</div>
  <div><div class="sw" style="background:#ffcc00"></div> Linia 110 kV</div>
  <div><div class="sw" style="background:#e60000"></div> Linia WN (220-400 kV)</div>
  <div style="color:#888;margin-top:4px;font-size:10px">Warstwy: ESRI · OSM Overpass · KIUT GUGiK</div>
</div>
<div class="filter-bar">
  <button id="btnAll" style="background:#555;color:#fff" class="active" onclick="filterParcels('all')">Wszystkie ({n})</button>
  <button id="btnCol" style="background:#e74c3c;color:#fff" onclick="filterParcels('collision')">Kolizja ({collision_count})</button>
  <button id="btnOk" style="background:#2ecc71;color:#fff" onclick="filterParcels('ok')">Bez ({n - collision_count})</button>
</div>
<script>
var parcelsData = {parcels_json};
var linesData = {lines_json};

var map = L.map('map',{{zoomControl:true}}).setView([52,20],7);

// Satellite
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}',
  {{maxZoom:19,attribution:'ESRI'}}).addTo(map);

// KIUT WMS (uzbrojenie)
var kiutUrl = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu';
var elektro = L.tileLayer.wms(kiutUrl,{{layers:'przewod_elektroenergetyczny',format:'image/png',transparent:true,opacity:.6}});
var gaz = L.tileLayer.wms(kiutUrl,{{layers:'przewod_gazowy',format:'image/png',transparent:true,opacity:.5}});
var woda = L.tileLayer.wms(kiutUrl,{{layers:'przewod_wodociagowy',format:'image/png',transparent:true,opacity:.5}});
elektro.addTo(map);
L.control.layers(null,{{'⚡ Elektroenergetyczny':elektro,'🔥 Gazowy':gaz,'💧 Wodociągowy':woda}},{{collapsed:false,position:'topright'}}).addTo(map);

// Power lines (Overpass) — grube neonowe linie
var vColors = {{'WN':'#ff2200','SN':'#00ff44','110kV':'#ffcc00','nN':'#00ccff'}};
function voltColor(v) {{
  if(!v) return '#00ff44';
  if(v==='WN'||parseInt(v)>=200) return '#ff2200';
  if(parseInt(v)>=100) return '#ffcc00';
  if(parseInt(v)>=10||v==='SN') return '#00ff44';
  return '#00ccff';
}}
var linesLayer = L.geoJSON(linesData,{{
  style:function(f){{
    var c=voltColor(f.properties.voltage);
    return {{color:c,weight:6,opacity:1}}
  }},
  onEachFeature:function(f,layer){{
    layer.bindTooltip('⚡ '+f.properties.voltage,{{sticky:true,className:'tt'}});
  }}
}}).addTo(map);

// Labels group
var labelsLayer = L.layerGroup().addTo(map);

// Parcels — mocne kolory, gruby border, etykiety numerów
var parcelsLayer;
function renderParcels(filter) {{
  if(parcelsLayer) map.removeLayer(parcelsLayer);
  labelsLayer.clearLayers();
  var filtered = parcelsData.features.filter(function(f){{
    if(filter==='collision') return f.properties.detected;
    if(filter==='ok') return !f.properties.detected;
    return true;
  }});
  parcelsLayer = L.geoJSON({{type:'FeatureCollection',features:filtered}},{{
    style:function(f){{
      var d=f.properties.detected;
      return {{color:d?'#ff0000':'#00cc44',weight:4,fillColor:d?'#ff3300':'#00dd44',fillOpacity:d?.55:.25}}
    }},
    onEachFeature:function(f,layer){{
      var p=f.properties;
      var razem=Math.round(p.track_a+p.track_b);
      var nr=p.id.split('.').pop()||p.id;
      layer.bindPopup(
        '<div style="font:13px/1.6 Arial;min-width:240px;padding:4px">'+
        '<b style="font-size:15px;color:#1a2035">'+p.id+'</b><br>'+
        (p.detected?'<span style="background:#ff3300;color:#fff;padding:1px 6px;border-radius:4px;font-size:11px">⚡ KOLIZJA · '+p.voltage+'</span>':
                    '<span style="background:#27ae60;color:#fff;padding:1px 6px;border-radius:4px;font-size:11px">✓ Bez kolizji</span>')+'<br><br>'+
        '<b>Pow. działki:</b> '+Math.round(p.area_m2).toLocaleString()+' m²<br>'+
        (p.detected?'<b>Pas ochronny:</b> '+Math.round(p.band_area).toLocaleString()+' m²<br>':'')+
        '<hr style="margin:6px 0;border:0;border-top:1px solid #eee">'+
        '<table style="width:100%;font-size:12px">'+
        '<tr><td>Track A (sąd):</td><td align="right"><b style="color:#27ae60">'+Math.round(p.track_a).toLocaleString()+' PLN</b></td></tr>'+
        '<tr><td>Track B (neg.):</td><td align="right"><b style="color:#e67e22">'+Math.round(p.track_b).toLocaleString()+' PLN</b></td></tr>'+
        '<tr style="border-top:2px solid #2575fc"><td><b>RAZEM:</b></td><td align="right"><b style="font-size:15px;color:#2575fc">'+razem.toLocaleString()+' PLN</b></td></tr>'+
        '</table></div>'
      ,{{maxWidth:300}});
      // Etykieta numeru na środku działki (tylko przy zoom >= 14)
      layer.on('add', function() {{
        try {{
          var center = layer.getBounds().getCenter();
          var lbl = L.marker(center, {{
            icon: L.divIcon({{
              html: '<div style="background:'+(p.detected?'rgba(255,0,0,.85)':'rgba(0,180,50,.85)')
                   +';color:#fff;font:700 11px Arial;padding:2px 5px;border-radius:3px;white-space:nowrap;'
                   +'box-shadow:0 1px 4px rgba(0,0,0,.5)">'+nr+'</div>',
              className:'', iconAnchor:[0,0]
            }}),
            interactive: false,
          }});
          labelsLayer.addLayer(lbl);
        }} catch(_) {{}}
      }});
    }}
  }}).addTo(map);
  return filtered.length;
}}
renderParcels('all');

// Auto-fit — pokaż wszystkie działki i linie na ekranie
var allBounds = L.featureGroup([parcelsLayer,linesLayer]).getBounds();
if(allBounds.isValid()) map.fitBounds(allBounds,{{padding:[50,50],maxZoom:17}});
else map.setView([52,20],7);

// Zoom event — ukryj etykiety przy dużym oddaleniu
map.on('zoomend',function(){{
  if(map.getZoom()<13) labelsLayer.clearLayers();
  else renderParcels(document.querySelector('.filter-bar button.active')?.id==='btnCol'?'collision':
                     document.querySelector('.filter-bar button.active')?.id==='btnOk'?'ok':'all');
}});

// Filter buttons
function filterParcels(mode) {{
  renderParcels(mode);
  document.querySelectorAll('.filter-bar button').forEach(function(b){{b.classList.remove('active')}});
  document.getElementById(mode==='collision'?'btnCol':mode==='ok'?'btnOk':'btnAll').classList.add('active');
}}
</script>
</body>
</html>"""


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
