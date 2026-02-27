
import asyncio
import logging
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

from backend.modules.property import PropertyAggregator

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

async def test_parcel(pid, county=None, municipality=None):
    print(f"\n{'='*60}")
    print(f"PARCEL: {pid} | gmina: {municipality} | powiat: {county}")
    print('='*60)
    aggregator = PropertyAggregator()
    try:
        record = await aggregator.generate_master_record(pid, county=county, municipality=municipality)
        pm = record['parcel_metadata']
        g = record['geometry']
        infra = record['infrastructure']['power']
        media = record['infrastructure']['utilities']
        market = record.get('market_data', {})
        planning = record.get('planning', {})

        print(f"\n[OK] TERYT:    {pm['teryt_id']}")
        print(f"     Woj:      {pm.get('region', '?')}, Powiat: {pm['county']}, Gmina: {pm['commune']}")
        print(f"     Pow:      {g['area_m2']} m² ({round((g['area_m2'] or 0)/10000, 4)} ha)")
        print(f"     Centroid: {g['centroid_ll']}")
        print(f"\n[MPZP]        {planning.get('mpzp_active', False)}")
        print(f"\n[INFRASTRUKTURA ENERGETYCZNA]")
        print(f"     Wykryto: {'TAK' if infra['exists'] else 'NIE'}")
        if infra['exists']:
            print(f"     Napięcie:  {infra['voltage']}")
            print(f"     Długość:   {infra['line_length_m']} m")
            print(f"     Strefa:    {infra['buffer_zone_m']} m")
        print(f"\n[MEDIA]       Gaz: {media.get('gaz', False)} | Woda: {media.get('woda', False)} | "
              f"Kanal: {media.get('kanal', False)}")
        print(f"\n[RYNEK RCN]   {market.get('recent_transactions_count', 0)} transakcji "
              f"| Avg: {market.get('average_price_m2') or '—'} zł/m²")

    except Exception as e:
        import traceback
        print(f"[BLAD] {e}")
        traceback.print_exc()

async def main():
    # Test 1: działka 326/1 Szapsk, Raciąż, Płoński
    await test_parcel("326/1", county="płoński", municipality="Szapsk")

    # Test 2: działka 74/4 Baboszewo
    await test_parcel("74/4", county="płoński", municipality="Baboszewo")

    # Test 3: pełny TERYT
    await test_parcel("142010_2.0052.326/1")

if __name__ == "__main__":
    asyncio.run(main())
