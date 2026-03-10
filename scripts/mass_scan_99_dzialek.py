#!/usr/bin/env python3
"""
Masowy skan 99 działek powiatu płońskiego — kolizje z liniami energetycznymi.
Źródło cen: GUS BDL (Płońsk), korekta ręczna: cena_rolna_m2 = 6.65 PLN/m².
Użycie: python scripts/mass_scan_99_dzialek.py
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
from backend.modules.property import PropertyAggregator

# --- LISTA DZIAŁEK (rozszerz do 99 gdy masz pełne dane) ---
PARCEL_IDS = [
    # Baboszewo - Bożewo
    "142003_2.0002.81/5", "142003_2.0002.81/8",
    # Baboszewo - Brzeście Samo
    "142003_2.0003.101/1", "142003_2.0003.42", "142003_2.0003.99",
    # Baboszewo - Cieszkowo Kolonia
    "142003_2.0006.14", "142003_2.0006.145/1", "142003_2.0006.145/2",
    "142003_2.0006.24", "142003_2.0006.26", "142003_2.0006.27",
    "142003_2.0006.29/3", "142003_2.0006.45", "142003_2.0006.46",
    "142003_2.0006.7", "142003_2.0006.73", "142003_2.0006.74/4",
    "142003_2.0006.75", "142003_2.0006.76", "142003_2.0006.77/1",
    "142003_2.0006.77/2", "142003_2.0006.95",
    # Baboszewo - Cywiny Dynguny / Wojskie
    "142003_2.0007.117", "142003_2.0009.13", "142003_2.0009.23", "142003_2.0009.96",
    # Mystkowo
    "142003_2.0026.14/1", "142003_2.0026.14/2", "142003_2.0026.148", "142003_2.0026.167",
    # Raciąż - Szapsk
    "142010_2.0052.302/6", "142010_2.0052.326/1", "142010_2.0052.327/2",
]


async def run_massive_scan():
    agg = PropertyAggregator()
    cena_rolna_m2 = 6.65  # Wg GUS Płońsk (rolne)
    wyniki = []

    print(f"🚀 START MASOWEJ ANALIZY: {len(PARCEL_IDS)} DZIAŁEK (POWIAT PŁOŃSKI)")
    print(f"⚖️ METODA: Rygorystyczny skan wektorowy GUGiK")
    print(f"💰 Cena rolna (korekta ręczna): {cena_rolna_m2} PLN/m²")
    print()

    for pid in PARCEL_IDS:
        try:
            print(f"🔍 Skanuję {pid}...", end=" ", flush=True)
            data = await agg.generate_master_record(
                pid,
                manual_price_m2=cena_rolna_m2,
            )

            # Obsługa błędu ULDK (działka nie znaleziona)
            if data.get("status") == "ERROR":
                print("⚠️ BŁĄD")
                wyniki.append({
                    "Działka": pid,
                    "Status": "ERROR",
                    "Napięcie": "-",
                    "Długość linii [m]": 0,
                    "Pow. Działki [ha]": 0,
                    "ROSZCZENIE [PLN]": 0,
                    "Uwagi": data.get("message", "Błąd API"),
                })
                await asyncio.sleep(0.5)
                continue

            infra = data.get("infrastructure", {}).get("power_lines", {})
            wykryto = infra.get("detected", False)
            geom = data.get("geometry", {})
            area_m2 = geom.get("area_m2") or 0
            area_ha = area_m2 / 10000 if area_m2 else 0

            # Roszczenie: KSWS Track B (ścieżka negocjacyjna) gdy linia wykryta
            compensation = data.get("compensation", {})
            track_b = compensation.get("track_b", {})
            roszczenie = track_b.get("total", 0) if wykryto else 0

            if wykryto:
                print("✅ WYKRYTO LINIĘ!")
                wyniki.append({
                    "Działka": pid,
                    "Status": "KOLIZJA",
                    "Napięcie": infra.get("voltage") or "Nieznane",
                    "Długość linii [m]": infra.get("length_m", 0),
                    "Pow. Działki [ha]": round(area_ha, 4),
                    "ROSZCZENIE [PLN]": roszczenie,
                    "Uwagi": "",
                })
            else:
                print("❌ Brak linii.")
                wyniki.append({
                    "Działka": pid,
                    "Status": "CZYSTA",
                    "Napięcie": "-",
                    "Długość linii [m]": 0,
                    "Pow. Działki [ha]": round(area_ha, 4),
                    "ROSZCZENIE [PLN]": 0,
                    "Uwagi": "",
                })

            await asyncio.sleep(0.5)

        except Exception as e:
            print(f"⚠️ Błąd: {e}")
            wyniki.append({
                "Działka": pid,
                "Status": "ERROR",
                "Napięcie": "-",
                "Długość linii [m]": 0,
                "Pow. Działki [ha]": 0,
                "ROSZCZENIE [PLN]": 0,
                "Uwagi": str(e),
            })

    # Tworzenie raportu Excel
    df = pd.DataFrame(wyniki)
    out_path = ROOT / "RAPORT_RZETELNY_99_DZIALEK.xlsx"
    df.to_excel(out_path, index=False)

    sum_claim = df["ROSZCZENIE [PLN]"].sum()
    kolizje = (df["Status"] == "KOLIZJA").sum()
    bledy = (df["Status"] == "ERROR").sum()

    print("\n" + "=" * 50)
    print("🏁 ANALIZA ZAKOŃCZONA")
    print(f"   Przeanalizowano: {len(df)} działek")
    print(f"   Kolizje: {kolizje}, Czyste: {len(df) - kolizje - bledy}, Błędy: {bledy}")
    print(f"💰 Łączna suma roszczeń: {sum_claim:,.2f} PLN")
    print(f"📂 Plik: {out_path}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(run_massive_scan())
