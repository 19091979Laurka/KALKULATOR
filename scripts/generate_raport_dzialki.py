#!/usr/bin/env python3
"""
Generuje raport o działce (Markdown) na podstawie analizy API.
Użycie: python scripts/generate_raport_dzialki.py [identyfikator] [gmina] [powiat]
        python scripts/generate_raport_dzialki.py "Szapsk 302/6" Raciąż płoński
"""
import asyncio
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def format_report(parcel_id: str, master_record: dict) -> str:
    """Formatuje master_record do raportu Markdown."""
    m = master_record
    meta = m.get("parcel_metadata") or {}
    geom = m.get("geometry") or {}
    plan = m.get("planning") or {}
    infra = m.get("infrastructure") or {}
    power = infra.get("power") or {}
    utilities = infra.get("utilities") or {}
    egib = m.get("egib") or {}
    market = m.get("market_data") or {}
    inv = m.get("investments") or {}
    build = m.get("buildings") or {}

    loc = " ".join(filter(None, [meta.get("commune"), meta.get("county"), meta.get("region")])) or "—"
    centroid = geom.get("centroid_ll") or [None, None]
    centroid_str = f"{centroid[0]}, {centroid[1]}" if (centroid[0] is not None and centroid[1] is not None) else "—"
    area = geom.get("area_m2")
    area_str = f"{area:,.0f} m²" if area is not None and area else "—"

    lines = [
        "# Raport o terenie",
        "",
        f"**Działka:** {parcel_id}",
        f"**Lokalizacja:** {loc}",
        f"**Data wygenerowania:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "---",
        "",
        "## 1. Dane geometryczne (ULDK)",
        "",
        f"- Powierzchnia: {area_str}",
        f"- Obwód: {geom.get('perimeter_m') or '—'} m",
        f"- Kształt: {geom.get('shape_class') or '—'}",
        f"- Centroid (długość, szerokość): {centroid_str}",
        "",
        "## 2. EGiB – użytki gruntowe",
        "",
    ]
    for u in egib.get("land_use") or []:
        a = u.get("area_m2")
        lines.append(f"- Klasa **{u.get('class', 'R')}**: {f'{a:,.0f} m²' if a else '—'}")
    if not egib.get("land_use"):
        lines.append("- Brak szczegółowego podziału (R)")
    lines.extend(["", "## 3. Infrastruktura i media", ""])
    lines.append(f"- **Linia napowietrzna:** {'WYKRYTO (kolizja)' if power.get('exists') else 'Brak kolizji'}")
    if power.get("exists"):
        lines.append(f"  - Napięcie: {power.get('voltage', '—')}")
        lines.append(f"  - Strefa ochronna: {power.get('buffer_zone_m') or '—'} m")
    lines.append(f"- Gaz: {'Tak' if utilities.get('gaz') else 'Brak'}")
    lines.append(f"- Woda: {'Tak' if utilities.get('woda') else 'Brak'}")
    lines.append(f"- Kanalizacja: {'Tak' if utilities.get('kanal') else 'Brak'}")
    lines.extend(["", "## 4. Sytuacja planistyczna i prawna", ""])
    lines.append(f"- **Plan miejscowy (MPZP):** {'Obowiązuje' if plan.get('mpzp_active') else 'Brak'}")
    lines.append(f"- Przeznaczenie (MPZP): {plan.get('usage_code') or plan.get('studium_usage') or '—'}")
    lines.append(f"- Status: {plan.get('status', '—')}")
    lines.extend(["", "## 5. Zabudowa i inwestycje", ""])
    lines.append(f"- Liczba obiektów (EGiB): {build.get('count', 0)}")
    lines.append(f"- Pozwolenia budowlane (GUNB): {inv.get('active_permits', 0)}")
    lines.extend(["", "## 6. Rynek nieruchomości (RCN)", ""])
    avg = market.get("average_price_m2") or market.get("avg_price_m2")
    lines.append(f"- Średnia cena: {f'{avg} zł/m²' if avg else 'n/d'}")
    lines.append(f"- Liczba transakcji w promieniu: {market.get('recent_transactions_count') or market.get('transactions_count') or 0}")
    lines.append(f"- Status: {market.get('status', '—')}")
    lines.extend(["", "---", "", "*Raport wygenerowany przez KALKULATOR (Spec v3.0). Źródła: ULDK, GUGiK, GESUT, GUNB, RCN.*"])
    return "\n".join(lines)


async def main():
    parcel_id = sys.argv[1] if len(sys.argv) > 1 else "Szapsk 302/6"
    municipality = sys.argv[2] if len(sys.argv) > 2 else "Raciąż"
    county = sys.argv[3] if len(sys.argv) > 3 else "płoński"

    from backend.modules.property import PropertyAggregator

    agg = PropertyAggregator()
    try:
        mr = await agg.generate_master_record(parcel_id, county=county, municipality=municipality)
    except Exception as e:
        print(f"Błąd analizy: {e}", file=sys.stderr)
        sys.exit(1)

    if mr.get("status") == "ERROR":
        print(f"Błąd: {mr.get('message', 'Nieznany')}", file=sys.stderr)
        sys.exit(1)

    report = format_report(parcel_id, mr)
    out_dir = ROOT / "raporty"
    out_dir.mkdir(exist_ok=True)
    safe_id = parcel_id.replace("/", "_").replace(" ", "_")[:40]
    out_file = out_dir / f"raport_dzialka_{safe_id}_{datetime.now().strftime('%Y%m%d_%H%M')}.md"
    out_file.write_text(report, encoding="utf-8")
    print(report)
    print("\n---")
    print(f"Zapisano: {out_file}")


if __name__ == "__main__":
    asyncio.run(main())
