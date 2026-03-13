#!/usr/bin/env python3
"""
Test runner: API i moduły (ULDK, KIEG, GESUT, GUNB, RCN, Planning).

Użycie:
  # Z uruchomionym serwerem (np. uvicorn backend.main:app --port 8080):
  python tests/run_api_tests.py
  python tests/run_api_tests.py --analyze 142003_2.0001.74/1

  # Wiele działek z pliku (np. z różnych województw):
  python tests/run_api_tests.py --analyze-file tests/parcels_multi_wojewodztwa.txt

  # Bez serwera — tylko diagnostyka modułów (import bezpośredni):
  python tests/run_api_tests.py --local
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

# repo root
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def run_via_api(base_url: str, run_analyze: bool = False, parcel_id: str = "142003_2.0001.74/1") -> bool:
    """Wywołuje GET /api/health, GET /api/diagnostics i opcjonalnie POST /api/analyze."""
    try:
        import requests
    except ImportError:
        print("Brak 'requests'. Zainstaluj: pip install requests")
        return False

    ok = True

    # Health
    try:
        r = requests.get(f"{base_url}/api/health", timeout=5)
        r.raise_for_status()
        data = r.json()
        print("GET /api/health:", data.get("status"), data.get("service", ""))
    except Exception as e:
        print("GET /api/health FAIL:", e)
        ok = False

    # Diagnostics
    try:
        r = requests.get(f"{base_url}/api/diagnostics", timeout=60)
        r.raise_for_status()
        data = r.json()
        summary = data.get("summary", {})
        print("GET /api/diagnostics: moduły OK =", summary.get("ok"), "/", summary.get("total"))
        for name, res in data.get("modules", {}).items():
            status = "OK" if res.get("ok") else "FAIL"
            msg = res.get("message", res.get("status", ""))[:60]
            print(f"  - {name}: {status}  {msg}")
    except Exception as e:
        print("GET /api/diagnostics FAIL:", e)
        ok = False

    # Analyze (opcjonalnie)
    if run_analyze:
        try:
            r = requests.post(
                f"{base_url}/api/analyze",
                json={"parcel_ids": parcel_id, "county": None, "municipality": None},
                timeout=90,
            )
            r.raise_for_status()
            data = r.json()
            parcels = data.get("parcels", [])
            if not parcels:
                print("POST /api/analyze: brak parcel w odpowiedzi")
                ok = False
            else:
                p = parcels[0]
                if p.get("error"):
                    print("POST /api/analyze:", p.get("parcel_id"), "ERROR:", p.get("error"))
                    ok = False
                else:
                    mr = p.get("master_record", {})
                    geom = mr.get("geometry", {})
                    print("POST /api/analyze:", p.get("parcel_id"), "data_status=", p.get("data_status"),
                          "area_m2=", geom.get("area_m2"))
        except Exception as e:
            print("POST /api/analyze FAIL:", e)
            ok = False

    return ok


def run_analyze_file(base_url: str, file_path: Path) -> bool:
    """Dla każdej działki z pliku (1 ID na linię, # = komentarz) wywołuje POST /api/analyze."""
    try:
        import requests
    except ImportError:
        print("Brak 'requests'. Zainstaluj: pip install requests")
        return False

    lines = file_path.read_text(encoding="utf-8").strip().splitlines()
    ids = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        ids.append(line.split("#")[0].strip())
    if not ids:
        print(f"Brak działek w pliku: {file_path}")
        return False

    print(f"Analiza {len(ids)} działek z {file_path}")
    ok_count, err_count = 0, 0
    for i, pid in enumerate(ids, 1):
        try:
            r = requests.post(
                f"{base_url}/api/analyze",
                json={"parcel_ids": pid},
                timeout=90,
            )
            if r.status_code != 200:
                print(f"  [{i}/{len(ids)}] {pid}: HTTP {r.status_code}")
                err_count += 1
                continue
            data = r.json()
            parcels = data.get("parcels", [])
            if not parcels:
                print(f"  [{i}/{len(ids)}] {pid}: brak parcels")
                err_count += 1
                continue
            p = parcels[0]
            if p.get("error"):
                print(f"  [{i}/{len(ids)}] {pid}: ERROR {str(p.get('error', ''))[:60]}")
                err_count += 1
            else:
                status = p.get("data_status", "?")
                geom = (p.get("master_record") or {}).get("geometry", {})
                area = geom.get("area_m2", "?")
                print(f"  [{i}/{len(ids)}] {pid}: OK ({status}) area={area}")
                ok_count += 1
        except Exception as e:
            print(f"  [{i}/{len(ids)}] {pid}: EXCEPTION {e}")
            err_count += 1

    print(f"\nPodsumowanie: OK={ok_count} ERROR={err_count}")
    return err_count == 0


def run_local_diagnostics() -> bool:
    """Uruchamia diagnostykę bez HTTP (bezpośredni import modułów)."""
    async def _run():
        from backend.modules.diagnostics import run_all_diagnostics
        return await run_all_diagnostics()

    try:
        data = asyncio.run(_run())
        summary = data.get("summary", {})
        print("Diagnostyka (local): moduły OK =", summary.get("ok"), "/", summary.get("total"))
        for name, res in data.get("modules", {}).items():
            status = "OK" if res.get("ok") else "FAIL"
            msg = res.get("message", res.get("status", ""))[:60]
            print(f"  - {name}: {status}  {msg}")
        return summary.get("ok", 0) == summary.get("total", 0)
    except Exception as e:
        print("Diagnostyka (local) FAIL:", e)
        import traceback
        traceback.print_exc()
        return False


def main():
    parser = argparse.ArgumentParser(description="Testy API i modułów KALKULATOR")
    parser.add_argument("--api-url", default="http://127.0.0.1:8080", help="Bazowy URL API")
    parser.add_argument("--local", action="store_true", help="Tylko diagnostyka modułów (bez serwera)")
    parser.add_argument("--analyze", metavar="PARCEL_ID", nargs="?", const="142003_2.0001.74/1",
                        help="Wywołaj też POST /api/analyze z podaną działką")
    parser.add_argument("--analyze-file", metavar="FILE", type=Path,
                        help="Plik z działkami (1 ID na linię, # = komentarz). Przykład: tests/parcels_multi_wojewodztwa.txt")
    args = parser.parse_args()

    if args.local:
        ok = run_local_diagnostics()
    elif args.analyze_file:
        ok = run_analyze_file(args.api_url, args.analyze_file)
    else:
        ok = run_via_api(args.api_url, run_analyze=args.analyze is not None, parcel_id=args.analyze or "142003_2.0001.74/1")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
