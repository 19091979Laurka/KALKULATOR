"""
Moduł: Agregator Property_Master_Record
Główny koordynator zbierania danych z 14 punktów wg specyfikacji Architekta.
"""
import logging
import asyncio
from typing import Dict, Any, Optional


async def _empty_list():
    return []

from backend.integrations.uldk import ULDKClient
from backend.integrations.kieg import KIEGClient
from backend.integrations.gesut import GESUTClient
from backend.integrations.gunb import GUNBClient
from backend.integrations.rcn_gugik import GUGikRCNClient
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
        self.rcn = GUGikRCNClient()

    async def generate_master_record(
        self, 
        parcel_id: str, 
        infra_type_pref: str = "elektro_SN",
        county: Optional[str] = None,
        municipality: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Główna logika agregacji 14 punktów danych.
        """
        # 1. Start: Podstawowa geometria i TERYT
        # TODO: Use county/municipality to resolve short parcel IDs if needed
        terrain = await fetch_terrain(parcel_id, county=county, municipality=municipality)
        if not terrain.get("ok"):
            raise ValueError(f"Could not initialize property record for {parcel_id}")

        # Update parcel_id to the resolved TERYT if we found it
        resolved_pid = terrain.get("parcel_id") or parcel_id
        
        centroid = terrain.get("centroid", {})
        lon, lat = centroid.get("lon"), centroid.get("lat")
        bbox_2180 = self.uldk.get_parcel_bbox(resolved_pid, srid="2180")

        # Rozbij TERYT na składowe do GUNB/KIEG
        # Format: 061802_2.0004.109
        parts = resolved_pid.split('.')
        teryt_unit = parts[0] if len(parts) > 1 else "" 
        parcel_nr = parts[-1] if len(parts) > 0 else resolved_pid


        # 2. Równoległe pobieranie danych ze wszystkich źródeł
        tasks = {
            "planning": fetch_planning(lon, lat),
            "infra_base": fetch_infrastructure(resolved_pid, lon, lat, terrain.get("geometry"), infra_type_pref),
            "land_use": self.kieg.get_land_use(bbox_2180) if bbox_2180 else _empty_list(),
            "buildings": self.kieg.get_buildings(bbox_2180) if bbox_2180 else _empty_list(),
            "permits": self.gunb.get_permits(teryt_unit, parcel_nr),
            "transactions": self.rcn.get_transactions_near_bbox(
                bbox_2180[0]-1000, bbox_2180[1]-1000, bbox_2180[2]+1000, bbox_2180[3]+1000
            ) if bbox_2180 else _empty_list()
        }
        
        results = await asyncio.gather(*tasks.values())
        data = dict(zip(tasks.keys(), results))

        # 3. Mapowanie na Master JSON Schema
        master_record = {
            "parcel_metadata": {
                "teryt_id": resolved_pid, # Use full TERYT ID
                "input_id": parcel_id,    # Keep original for reference
                "county": terrain.get("county"),
                "commune": terrain.get("commune"),
                "region": terrain.get("region")
            },

            "geometry": {
                "area_m2": terrain.get("area_m2"),
                "perimeter_m": terrain.get("perimeter_m"),
                "shape_coef": terrain.get("shape_coef"),
                "shape_class": terrain.get("shape_class"),
                "segments": terrain.get("segments", []),
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
                    "voltage": data["infra_base"].get("energie", {}).get("voltage") or self._map_voltage(infra_type_pref),
                    "circuit_nr": data["infra_base"].get("energie", {}).get("circuit_nr"),
                    "line_length_m": data["infra_base"].get("energie", {}).get("length_m"),
                    "buffer_zone_m": data["infra_base"].get("energie", {}).get("strefa_m"),
                    "poles_count": data["infra_base"].get("details_extended", {}).get("poles_count", 0),
                    "occupied_area_m2": data["infra_base"].get("details_extended", {}).get("intersection_area_m2", 0),
                    "line_geojson": data["infra_base"].get("details_extended", {}).get("line_geojson"),
                    "buffer_geojson": data["infra_base"].get("details_extended", {}).get("buffer_geojson")
                },
                "utilities": data["infra_base"].get("media", {}),
                "telecom": {
                    "fiber_ready": data["infra_base"].get("swiatlowod", False),
                    "node_distance_m": None
                }
            },
            "view_3d_url": data["infra_base"].get("view_3d_url"),
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
            },
            "market_data": {
                "recent_transactions_count": len(data["transactions"]),
                "average_price_m2": self._calculate_avg_price(data["transactions"]),
                "last_transaction_date": self._get_last_transaction_date(data["transactions"])
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
    def _calculate_avg_price(self, transactions: list) -> Optional[float]:
        prices = []
        for t in transactions:
            try:
                p = t.get("dzi_cena_brutto") or t.get("nier_cena_brutto")
                if p: prices.append(float(p))
            except: pass
        return round(sum(prices) / len(prices), 2) if prices else None

    def _get_last_transaction_date(self, transactions: list) -> Optional[str]:
        dates = [t.get("dok_data") for t in transactions if t.get("dok_data")]
        return max(dates) if dates else None

    def _get_last_year(self, permits: list) -> Optional[int]:
        years = []
        for p in permits:
            date = p.get("data_decyzji") or p.get("data_wniosku")
            if date and len(date) >= 4:
                try: years.append(int(date[:4]))
                except: pass
        return max(years) if years else None
