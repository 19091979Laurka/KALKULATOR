"""
Moduł: Agregator Property_Master_Record
Główny koordynator zbierania danych z 14 punktów wg specyfikacji Architekta.
"""
import logging
import asyncio
from typing import Dict, Any, Optional
from decimal import Decimal

from backend.integrations.uldk import ULDKClient
from backend.integrations.kieg import KIEGClient
from backend.integrations.gesut import GESUTClient
from backend.integrations.gunb import GUNBClient
from backend.integrations.pit import PITClient
from backend.modules.terrain import fetch_terrain
from backend.modules.planning import fetch_planning
from backend.modules.infrastructure import fetch_infrastructure

logger = logging.getLogger(__name__)

class PropertyAggregator:
    def __init__(self):
        self.uldk = ULDKClient()
        self.kieg = KIEGClient()
        self.gesut = GESUTClient()
        self.gunb = GUNBClient()
        self.pit = PITClient()

    async def generate_master_record(self, parcel_id: str, infra_type_pref: str = "elektro_SN") -> Dict[str, Any]:
        """
        Główna logika agregacji 14 punktów danych.
        """
        # 1. Start: Podstawowa geometria i TERYT
        terrain = await fetch_terrain(parcel_id)
        if not terrain.get("ok"):
            raise ValueError(f"Could not initialize property record for {parcel_id}")

        centroid = terrain.get("centroid", {})
        lon, lat = centroid.get("lon"), centroid.get("lat")
        bbox_2180 = self.uldk.get_parcel_bbox(parcel_id, srid="2180")

        # Rozbij TERYT na składowe do GUNB/KIEG
        # Format: 061802_2.0004.109
        parts = parcel_id.split('.')
        teryt_unit = parts[0] # 061802_2
        parcel_nr = parts[-1]  # 109

        # 2. Równoległe pobieranie danych ze wszystkich źródeł
        tasks = {
            "planning": fetch_planning(lon, lat),
            "infra_base": fetch_infrastructure(parcel_id, lon, lat, terrain.get("geometry"), infra_type_pref),
            "land_use": self.kieg.get_land_use(bbox_2180) if bbox_2180 else asyncio.sleep(0, []),
            "buildings": self.kieg.get_buildings(bbox_2180) if bbox_2180 else asyncio.sleep(0, []),
            "permits": self.gunb.get_permits(teryt_unit, parcel_nr),
            "telecom": self.pit.check_telecom_availability(lon, lat)
        }
        
        results = await asyncio.gather(*tasks.values())
        data = dict(zip(tasks.keys(), results))

        # 3. Mapowanie na Master JSON Schema
        master_record = {
            "parcel_metadata": {
                "teryt_id": parcel_id,
                "county": terrain.get("county"),
                "commune": terrain.get("commune"),
                "region": terrain.get("region")
            },
            "geometry": {
                "area_m2": terrain.get("area_m2"),
                "geojson_ll": terrain.get("geometry"),
                "bbox_2180": list(bbox_2180) if bbox_2180 else None,
                "centroid_ll": [lon, lat]
            },
            "egib": {
                "land_use": self._map_land_use(data["land_use"]),
                "soil_classification": self._map_land_use(data["land_use"]), # Uproszczone: kontury = uzytki
                "legal_status": "nieznany"
            },
            "planning": {
                "mpzp_active": data["planning"].get("mpzp", {}).get("has_mpzp", False),
                "usage_code": data["planning"].get("mpzp", {}).get("przeznaczenie"),
                "general_plan_status": data["planning"].get("plan_ogolny", {}).get("status", "brak"),
                "studium_usage": data["planning"].get("studium", {}).get("przeznaczenie"),
                "protection_zones": data["infra_base"].get("energie", {}).get("detected", False)
            },
            "infrastructure": {
                "power": {
                    "exists": data["infra_base"].get("energie", {}).get("detected", False),
                    "voltage": self._map_voltage(infra_type_pref),
                    "line_length_m": data["infra_base"].get("energie", {}).get("length_m"),
                    "buffer_zone_m": data["infra_base"].get("energie", {}).get("strefa_m")
                },
                "utilities": data["infra_base"].get("media", {}),
                "telecom": {
                    "fiber_ready": data["telecom"].get("fiber_ready", False),
                    "node_distance_m": data["telecom"].get("node_distance_m")
                }
            },
            "investments": {
                "active_permits": len(data["permits"]),
                "last_permit_year": self._get_last_year(data["permits"])
            },
            "buildings": {
                "exists": len(data["buildings"]) > 0,
                "count": len(data["buildings"]),
                "footprints": [b.get("geometry") for b in data["buildings"][:10]]
            },
            "access": {
                "public_road_access": data["infra_base"].get("droga", {}).get("access", False),
                "road_type": data["infra_base"].get("droga", {}).get("type")
            }
        }

        return master_record

    def _map_land_use(self, features: list) -> list:
        res = []
        for f in features:
            props = f.get("properties", {})
            res.append({
                "class": props.get("oznaczenie") or props.get("funkcja"),
                "area_m2": props.get("pole_powierzchni") or 0.0
            })
        return res

    def _map_voltage(self, infra_type: str) -> str:
        if "WN" in infra_type: return "WN"
        if "SN" in infra_type: return "SN"
        if "nN" in infra_type: return "nN"
        return "SN"

    def _get_last_year(self, permits: list) -> Optional[int]:
        years = []
        for p in permits:
            date = p.get("data_decyzji") or p.get("data_wniosku")
            if date and len(date) >= 4:
                try: years.append(int(date[:4]))
                except: pass
        return max(years) if years else None
