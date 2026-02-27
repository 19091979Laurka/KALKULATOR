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
    WFS_URL = "https://mapy.geoportal.gov.pl/wss/service/rcn"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    
    async def get_transactions(self, lon: float, lat: float, radius_km: float = 5.0, land_type: str = "budowlana") -> List[Dict[str, Any]]:
        """
        Pobierz transakcje z ostatnich 24 miesięcy w promieniu X km.
        """
        # 1. Oblicz BBOX dla promienia (uproszczone)
        # 1 stopień ~ 111km (Lat), ~68km (Lon w PL)
        d_lat = radius_km / 111.0
        d_lon = radius_km / 68.0
        bbox = f"{lon-d_lon},{lat-d_lat},{lon+d_lon},{lat+d_lat}"
        
        try:
            params = {
                "service": "WFS",
                "version": "1.1.0",
                "request": "GetFeature",
                "typeName": "ms:dzialki", 
                "outputFormat": "application/json", # Try JSON first
                "srsName": "EPSG:4326",
                "bbox": f"{bbox},EPSG:4326"
            }
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: requests.get(self.WFS_URL, params=params, headers=self.HEADERS, timeout=15))
            
            if response.status_code == 200:
                try:
                    data = response.json()
                except:
                    logger.debug("RCN response not JSON")
                    return []
                    
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
