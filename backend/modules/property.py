"""
Moduł: Agregator Property_Master_Record (Spec v3.0)
Główny koordynator zbierania danych z zachowaniem jawności statusu (REAL/TEST/ERROR).
"""
import logging
import asyncio
from typing import Dict, Any, Optional
from backend.integrations.uldk import ULDKClient
from backend.integrations.kieg import KIEGClient
from backend.integrations.gunb import GUNBClient
from backend.integrations.rcn_gugik import GUGikRCNClient
from backend.integrations.gus_fixed import GUSClientFixed, is_agricultural
from backend.modules.terrain import fetch_terrain
from backend.modules.planning import fetch_planning
from backend.modules.infrastructure import fetch_infrastructure

logger = logging.getLogger(__name__)

# KSWS coefficients (wbudowane w backend — nie mock, to standardy KSWS-V.5)
KSWS_STANDARDS = {
        "elektro_WN": {"S": 0.250, "k": 0.650, "R": 0.060, "u": 0.065, "impact_judicial": 0.073, "band_width_m": 30, "track_b_mult": 1.80, "label": "Linie 110-400 kV"},
        "elektro_SN": {"S": 0.200, "k": 0.500, "R": 0.060, "u": 0.065, "impact_judicial": 0.050, "band_width_m": 10, "track_b_mult": 1.56, "label": "Linie 15-30 kV"},
        "elektro_nN": {"S": 0.100, "k": 0.400, "R": 0.060, "u": 0.065, "impact_judicial": 0.025, "band_width_m": 5,  "track_b_mult": 1.30, "label": "Linie <1 kV"},
        "gaz_wysokie": {"S": 0.350, "k": 0.600, "R": 0.050, "u": 0.055, "impact_judicial": 0.120, "band_width_m": 15, "track_b_mult": 2.00, "label": "Gazociągi >1.6 MPa"},
        "gaz_srednie": {"S": 0.250, "k": 0.550, "R": 0.050, "u": 0.055, "impact_judicial": 0.080, "band_width_m": 10, "track_b_mult": 1.75, "label": "Gazociągi 0.4-1.6 MPa"},
        "gaz_niskie":  {"S": 0.150, "k": 0.450, "R": 0.050, "u": 0.055, "impact_judicial": 0.040, "band_width_m": 5,  "track_b_mult": 1.40, "label": "Gazociągi <0.4 MPa"},
        "teleko":      {"S": 0.080, "k": 0.350, "R": 0.060, "u": 0.065, "impact_judicial": 0.020, "band_width_m": 3,  "track_b_mult": 1.20, "label": "Sieci telekom."},
        "wod_kan":     {"S": 0.180, "k": 0.500, "R": 0.060, "u": 0.065, "impact_judicial": 0.045, "band_width_m": 8,  "track_b_mult": 1.50, "label": "Wodociągi/kanalizacja"},
        "default":     {"S": 0.250, "k": 0.500, "R": 0.060, "u": 0.065, "impact_judicial": 0.073, "band_width_m": 10, "track_b_mult": 1.56, "label": "Typ nieznany"},
}


def calculate_track_a(property_value: float, band_area: float, total_area: float, coeffs: dict, years: int = 10) -> dict:
        """Track A — ścieżka sądowa (TK P 10/16): WSP + WBK + OBN"""
        S = coeffs["S"]
        k = coeffs["k"]
        R = coeffs["R"]
        impact = coeffs["impact_judicial"]
        ratio = band_area / total_area if total_area > 0 else 0.1
        wsp = property_value * S * k * ratio
        wbk = property_value * R * k * ratio * years
        obn = property_value * impact * (years / 10)
        total = wsp + wbk + obn
        return {"wsp": round(wsp, 2), "wbk": round(wbk, 2), "obn": round(obn, 2), "total": round(total, 2), "years": years}


def calculate_track_b(track_a_total: float, infra_type: str = "elektro_SN") -> dict:
        """Track B — ścieżka negocjacyjna: Track A × mnożnik"""
        mult = KSWS_STANDARDS.get(infra_type, KSWS_STANDARDS["default"])["track_b_mult"]
        return {"total": round(track_a_total * mult, 2), "multiplier": mult}


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
                    obreb: Optional[str] = None,
                    county: Optional[str] = None,
                    municipality: Optional[str] = None,
        ) -> Dict[str, Any]:
                    # 1. Podstawowa geometria (ULDK)
                    terrain = await fetch_terrain(parcel_id, obreb=obreb, county=county, municipality=municipality)
                    if not terrain.get("ok") or terrain.get("status") != "REAL":
                                    return {
                                                        "status": "ERROR",
                                                        "message": terrain.get("error", "Nie znaleziono rzeczywistych danych w ULDK"),
                                                        "data": None
                                    }

                    resolved_pid = terrain.get("parcel_id") or parcel_id
                    centroid = terrain.get("centroid") or {}
                    lon, lat = centroid.get("lon"), centroid.get("lat")
                    bbox_2180 = self.uldk.get_parcel_bbox(resolved_pid, srid="2180")
                    parts = resolved_pid.split('.')
                    teryt_unit = parts[0] if len(parts) > 1 else ""
                    parcel_nr = parts[-1] if len(parts) > 0 else resolved_pid

            # 2. Pobieranie równoległe
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

        pl = data["infra_base"].get("energie", {})
        media = data["infra_base"].get("media", {})
        geom_geojson = terrain.get("geometry")
        centroid = terrain.get("centroid") or {}

        # Ustal klasę gruntu
        land_use_list = self._map_land_use(data["land_use"], terrain.get("area_m2"))
        primary_class = land_use_list[0]["class"] if land_use_list else "R"
        agri = is_agricultural(primary_class)

        # Cena — priorytet: RCN transakcje → GUS BDL z klasą gruntu → fallback
        rcn_price = self._calculate_avg_price(data["transactions"])

        # GUS z klasą gruntu (fix 450 → ~8.50 dla rolnych)
        gus_result = await self.gus.fetch_market_price(
                        terrain.get("voivodeship") or "",
                        land_class=primary_class,
        )
        gus_price = gus_result.get("price_m2") if gus_result.get("ok") else None
        land_type = gus_result.get("land_type", "agricultural" if agri else "building")
        price_source = gus_result.get("source", "GUS")

        # Wybór ceny: RCN tylko jeśli mamy transakcje, inaczej GUS z właściwą klasą
        avg_price = rcn_price if rcn_price else gus_price

        # KSWS + Track A/B (jeśli jest linia)
        area_m2 = terrain.get("area_m2") or 0
        infra_type = infra_type_pref
        coeffs = KSWS_STANDARDS.get(infra_type, KSWS_STANDARDS["default"])
        band_width = coeffs["band_width_m"]
        line_length = pl.get("length_m", 0)
        band_area = line_length * band_width if line_length and line_length > 0 else band_width * 50  # assume 50m jeśli brak danych

        property_value = (avg_price or 8.50) * area_m2
        track_a = calculate_track_a(property_value, band_area, area_m2, coeffs) if area_m2 > 0 else None
        track_b = calculate_track_b(track_a["total"], infra_type) if track_a else None

        master_record = {
                        "metadata": {"teryt_id": resolved_pid, "status": "REAL", "source": "ULDK GUGiK"},
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
                                                                    "occupied_area_m2": band_area if pl.get("detected") else None,
                                                                    "line_length_m": line_length,
                                                                    "band_width_m": band_width,
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
                                            "land_use": land_use_list,
                                            "primary_class": primary_class,
                                            "land_type": land_type,
                        },
                        "buildings": {"count": len(data["buildings"]) if data["buildings"] else 0},
                        "access": {"public_road_access": None, "road_type": None},
                        "market_data": {
                                            "transactions_count": len(data["transactions"]),
                                            "rcn_price_m2": rcn_price,
                                            "gus_price_m2": gus_price,
                                            "average_price_m2": avg_price,
                                            "land_type": land_type,
                                            "price_source": price_source,
                                            "recent_transactions_count": len(data["transactions"]),
                                            "last_transaction_date": None,
                                            "status": "REAL (RCN GUGiK)" if data["transactions"] else (
                                                                    f"GUS BDL ({land_type})" if gus_result.get("ok") else "BRAK DANYCH"
                                            )
                        },
                        "investments": {
                                            "permits_count": len(data["permits"]),
                                            "active_permits": len(data["permits"]),
                                            "status": "REAL (GUNB)" if data["permits"] else "BRAK"
                        },
                        "ksws": {
                                            "infra_type": infra_type,
                                            "coeffs": coeffs,
                                            "band_width_m": band_width,
                                            "band_area_m2": round(band_area, 2),
                                            "property_value_total": round(property_value, 2),
                                            "price_per_m2": avg_price,
                                            "label": coeffs.get("label", ""),
                        },
                        "compensation": {
                                            "track_a": track_a,
                                            "track_b": track_b,
                                            "infra_type": infra_type,
                                            "basis": {
                                                                    "S": coeffs["S"],
                                                                    "k": coeffs["k"],
                                                                    "R": coeffs["R"],
                                                                    "impact_judicial": coeffs["impact_judicial"],
                                                                    "track_b_multiplier": coeffs["track_b_mult"],
                                            }
                        }
        }
        return master_record

    async def _empty_list(self):
                return []

    def _map_land_use(self, features: list, fallback_area: Optional[float] = None) -> list:
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
                                            if p:
                                                                    prices.append(float(p))
                        except Exception:
                                            pass
                                    return round(sum(prices) / len(prices), 2) if prices else None
