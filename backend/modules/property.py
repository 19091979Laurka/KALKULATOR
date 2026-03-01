"""
Moduł: Agregator Property_Master_Record (Spec v3.0)
Główny koordynator zbierania danych z zachowaniem jawności statusu (REAL/TEST/ERROR).
"""
import logging
import asyncio
from typing import Dict, Any, Optional

from backend.integrations.uldk import ULDKClient
from backend.integrations.kieg import KIEGClient
from backend.integrations.gesut import GESUTClient
from backend.integrations.gunb import GUNBClient
from backend.integrations.rcn_gugik import GUGikRCNClient
from backend.integrations.gus_fixed import GUSClientFixed
from backend.modules.terrain import fetch_terrain
from backend.modules.planning import fetch_planning
from backend.modules.infrastructure import fetch_infrastructure

logger = logging.getLogger(__name__)

class PropertyAggregator:
    def __init__(self):
        self.uldk = ULDKClient()
        self.kieg = KIEGClient()
        self.gunb = GUNBClient()
        self.rcn = GUGikRCNClient()
        self.gus = GUSClientFixed()

    async def generate_master_record(
        self, 
        parcel_id: str, 
        infra_type_pref: str = "elektro_SN",
        county: Optional[str] = None,
        municipality: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Główna logika agregacji 14 punktów danych.
        ZASADA 2: Jawność statusu danych.
        """
        # 1. Start: Podstawowa geometria (ULDK)
        terrain = await fetch_terrain(parcel_id, county=county, municipality=municipality)
        
        # Jeśli nawet podstawowa geometria nie pochodzi z ULDK, przerywamy (Zasada 6)
        if not terrain.get("ok") or terrain.get("status") != "REAL":
            return {
                "status": "ERROR",
                "message": terrain.get("error", "Nie znaleziono rzeczywistych danych w ULDK"),
                "data": None
            }

        resolved_pid = terrain.get("parcel_id") or parcel_id
        centroid = terrain.get("centroid") or {}
        lon, lat = centroid.get("lon"), centroid.get("lat")
        
        # Pobierz BBOX 2180 dla pozostałych integracji
        bbox_2180 = self.uldk.get_parcel_bbox(resolved_pid, srid="2180")

        # Rozbij TERYT na składowe
        parts = resolved_pid.split('.')
        teryt_unit = parts[0] if len(parts) > 1 else "" 
        parcel_nr = parts[-1] if len(parts) > 0 else resolved_pid

        # 2. Równoległe pobieranie danych ze wszystkich źródeł
        tasks = {
            "planning": fetch_planning(lon, lat),
            "infra_base": fetch_infrastructure(resolved_pid, lon, lat, terrain.get("geometry"), infra_type_pref),
            "land_use": self.kieg.get_land_use(bbox_2180) if bbox_2180 else self._empty_list(),
            "buildings": self.kieg.get_buildings(bbox_2180) if bbox_2180 else self._empty_list(),
            "permits": self.gunb.get_permits(teryt_unit, parcel_nr),
            "transactions": self.rcn.get_transactions_near_bbox(
                bbox_2180[0]-1000, bbox_2180[1]-1000, bbox_2180[2]+1000, bbox_2180[3]+1000
            ) if bbox_2180 else self._empty_list(),
            "gus_price": self.gus.fetch_market_price(terrain.get("voivodeship") or ""),
        }
        
        results = await asyncio.gather(*tasks.values())
        data = dict(zip(tasks.keys(), results))

        # 3. Mapowanie na Master JSON Schema z JAWNOŚCIĄ STATUSU
        pl = data["infra_base"].get("energie", {})
        media = data["infra_base"].get("media", {})
        geom_geojson = terrain.get("geometry")
        centroid = terrain.get("centroid") or {}

        master_record = {
            "metadata": {
                "teryt_id": resolved_pid,
                "status": "REAL",
                "source": "ULDK GUGiK"
            },
            "parcel_metadata": {
                "commune": terrain.get("commune"),
                "county": terrain.get("county"),
                "region": terrain.get("voivodeship"),
            },
            "geometry": {
                "area_m2": terrain.get("area_m2"),
                "perimeter_m": terrain.get("perimeter_m"),
                "shape_class": terrain.get("shape_class"),
                "status": terrain.get("status"),
                "geojson": geom_geojson,
                "geojson_ll": geom_geojson,
                "centroid_ll": [centroid.get("lon"), centroid.get("lat")] if centroid else None,
            },
            "planning": {
                "mpzp_active": data["planning"].get("mpzp", {}).get("has_mpzp", False),
                "usage": data["planning"].get("mpzp", {}).get("przeznaczenie"),
                "usage_code": data["planning"].get("mpzp", {}).get("przeznaczenie"),
                "studium_usage": data["planning"].get("studium", {}).get("przeznaczenie"),
                "status": "REAL (planowanie.gov.pl)" if data["planning"].get("mpzp", {}).get("ok") else "ERROR/BRAK"
            },
            "infrastructure": {
                "power_lines": {
                    "detected": pl.get("detected", False),
                    "voltage": pl.get("voltage"),
                    "length_m": pl.get("length_m", 0.0),
                    "status": pl.get("status", "UNKNOWN"),
                    "info": pl.get("info", "")
                },
                "power": {
                    "exists": pl.get("detected", False),
                    "voltage": pl.get("voltage") or "—",
                    "poles_count": None,
                    "buffer_zone_m": data["infra_base"].get("energie", {}).get("strefa_m"),
                    "occupied_area_m2": None,
                },
                "utilities": {
                    "gaz": media.get("gaz", {}).get("detected", False),
                    "woda": media.get("woda", {}).get("detected", False),
                    "kanal": media.get("kanal", {}).get("detected", False),
                },
                "telecom": {"fiber_ready": False},
                "other_media": media,
            },
            "egib": {
                "land_use": self._map_land_use(data["land_use"], terrain.get("area_m2")),
            },
            "buildings": {"count": len(data["buildings"]) if data["buildings"] else 0},
            "access": {"public_road_access": None, "road_type": None},
            "market_data": {
                "transactions_count": len(data["transactions"]),
                "rcn_price_m2": self._calculate_avg_price(data["transactions"]),
                "gus_price_m2": data["gus_price"].get("price_m2") if data["gus_price"].get("ok") else None,
                "average_price_m2": self._calculate_avg_price(data["transactions"]) or (
                    data["gus_price"].get("price_m2") if data["gus_price"].get("ok") else None
                ),
                "recent_transactions_count": len(data["transactions"]),
                "last_transaction_date": None,
                "status": "REAL (RCN GUGiK)" if data["transactions"] else (
                    "GUS BDL" if data["gus_price"].get("ok") else "BRAK DANYCH"
                )
            },
            "investments": {
                "permits_count": len(data["permits"]),
                "active_permits": len(data["permits"]),
                "status": "REAL (GUNB)" if data["permits"] else "BRAK"
            }
        }

        return master_record

    async def _empty_list(self): return []

    def _map_land_use(self, features: list, fallback_area: Optional[float] = None) -> list:
        """Mapuje wyniki KIEG (WFS) na listę { class, area_m2 } dla frontendu."""
        if not features:
            return [{"class": "R", "area_m2": fallback_area or 0}]
        out = []
        for f in features:
            props = f.get("properties", {}) if isinstance(f, dict) else {}
            cls = props.get("klasa") or props.get("oznacz") or props.get("id") or "R"
            area = None
            for key in ("powierzchnia", "area_m2", "pow"):
                if props.get(key) is not None:
                    try:
                        area = float(props[key])
                        break
                    except (TypeError, ValueError):
                        pass
            out.append({"class": str(cls), "area_m2": area if area is not None else 0})
        return out if out else [{"class": "R", "area_m2": fallback_area or 0}]

    def _calculate_avg_price(self, transactions: list) -> Optional[float]:
        prices = []
        for t in transactions:
            try:
                p = t.get("dzi_cena_brutto") or t.get("nier_cena_brutto")
                if p: prices.append(float(p))
            except: pass
        return round(sum(prices) / len(prices), 2) if prices else None
