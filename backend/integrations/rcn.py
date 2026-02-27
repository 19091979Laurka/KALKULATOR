import requests
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)

class RCNClient:
    """
    Rejestr Cen Nieruchomości (RCN) Client via Geoportal.gov.pl WFS.
    Free access to transaction locations and basic data as of 13.02.2026.
    Level 1 data source.
    """
    # WFS service for RCN (National Integration of Real Estate Prices)
    WFS_URL = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaCenNieruchomosci"
    
    async def get_transactions(self, lon: float, lat: float, radius_km: float = 5.0, land_type: str = "budowlana") -> List[Dict[str, Any]]:
        """
        Pobierz transakcje z ostatnich 24 miesięcy w promieniu X km.
        """
        # 1. Oblicz BBOX dla promienia (uproszczone)
        # 1 stopień ~ 111km (Lat), ~68km (Lon w PL)
        d_lat = radius_km / 111.0
        d_lon = radius_km / 68.0
        bbox = f"{lon-d_lon},{lat-d_lat},{lon+d_lon},{lat+d_lat}"
        
        params = {
            "service": "WFS",
            "version": "1.1.0",
            "request": "GetFeature",
            "typeName": "transakcje", # Corrected for integracja.gugik.gov.pl
            "outputFormat": "json",
            "srsName": "EPSG:4326",
            "bbox": f"{bbox},EPSG:4326"
        }
        
        try:
            # Note: Using requests synchronously for now as per project pattern, 
            # or wrap in run_in_executor if needed.
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: requests.get(self.WFS_URL, params=params, timeout=15))
            
            if response.status_code == 200:
                data = response.json()
                features = data.get("features", [])
                
                # Filter by date (last 24 months)
                cutoff_date = datetime.now() - timedelta(days=24*30)
                valid_transactions = []
                
                for f in features:
                    props = f.get("properties", {})
                    # Try to parse date from common RCN fields
                    date_str = props.get("data_transakcji", props.get("date", ""))
                    try:
                        t_date = datetime.strptime(date_str[:10], "%Y-%m-%d")
                        if t_date < cutoff_date:
                            continue
                            
                        # Filter by land type (simplified check)
                        f_type = str(props.get("przeznaczenie", "")).lower()
                        if land_type == "budowlana" and "bud" not in f_type and "mn" not in f_type:
                            continue
                        if land_type == "rolna" and "rol" not in f_type:
                            continue
                            
                        # Extract price
                        price_m2 = props.get("cena_m2", props.get("price_sqm"))
                        if price_m2:
                            valid_transactions.append({
                                "price": Decimal(str(price_m2)),
                                "date": t_date,
                                "type": f_type
                            })
                    except:
                        continue
                
                return valid_transactions
                
        except Exception as e:
            logger.error(f"RCN WFS Error: {e}")
            
        return []

    def calculate_median(self, transactions: List[Dict[str, Any]]) -> Optional[Decimal]:
        if not transactions:
            return None
        prices = sorted([t["price"] for t in transactions])
        n = len(prices)
        if n % 2 == 1:
            return prices[n // 2]
        else:
            return (prices[n // 2 - 1] + prices[n // 2]) / 2
