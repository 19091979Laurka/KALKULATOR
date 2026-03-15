"""Debug infrastructure detection for a given parcel geometry."""

import asyncio
import logging
import os
import sys
from shapely.geometry import shape

# Ensure repo root is on sys.path so we can import backend modules when running the script directly
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.integrations.overpass import fetch_power_lines
from backend.integrations.openinframap import fetch_power_lines_oim
from backend.integrations.gesut_client import GESUTClient
from backend.integrations.bdot10k import BDOT10kClient
from backend.modules.infrastructure import _check_kiut_wms

logging.basicConfig(level=logging.INFO)

parcel_geom = {
    'type': 'Polygon',
    'coordinates': [[[20.226915383894, 52.7090546862869], [20.217183868487, 52.7105872308172],
                     [20.2171409813393, 52.7105940475433], [20.2176516922869, 52.7092762115747],
                     [20.2182855532497, 52.7091631094136], [20.2262358354902, 52.7079124756613],
                     [20.2268194785667, 52.7081852695704], [20.2267162922755, 52.7082803101965],
                     [20.225744692119, 52.7084915493982], [20.2257163154883, 52.7084395080207],
                     [20.2243114953796, 52.7086649813187], [20.2244975088376, 52.7090062732857],
                     [20.225902043084, 52.7087807959028], [20.225761030547, 52.7085214935508],
                     [20.2267467899337, 52.7083045048845], [20.2268614843981, 52.7082029786266],
                     [20.2275179212861, 52.7084766031888], [20.2271825609612, 52.7087648836903],
                     [20.2268340626028, 52.7088502367734], [20.2267928952918, 52.7088603934578],
                     [20.226915383894, 52.7090546862869]]]
}

async def main():
    print('--- Overpass ---')
    try:
        res = await fetch_power_lines(parcel_geom, include_poles=True)
        print('ok', res.get('ok') if res else None)
        print('lines', len(res.get('lines', [])) if res else None)
        print('poles_count', res.get('poles_count') if res else None)
    except Exception as e:
        print('overpass error', e)

    print('--- OpenInfraMap ---')
    try:
        res = await fetch_power_lines_oim(parcel_geom)
        feats = res.get('line_geojson', {}).get('features', [])
        print('oim count', len(feats))
    except Exception as e:
        print('oim error', e)

    print('--- GESUT ---')
    try:
        gc = GESUTClient()
        parcel = shape(parcel_geom)
        b = parcel.bounds
        bbox = {'minx': b[0] - 0.01, 'miny': b[1] - 0.01, 'maxx': b[2] + 0.01, 'maxy': b[3] + 0.01}
        feats = gc.get_infrastructure_wfs(bbox)
        print('gesut count', len(feats) if feats else 0)
    except Exception as e:
        print('gesut error', e)

    print('--- BDOT10k ---')
    try:
        bc = BDOT10kClient()
        parcel = shape(parcel_geom)
        b = parcel.bounds
        bbox = (b[0] - 0.01, b[1] - 0.01, b[2] + 0.01, b[3] + 0.01)
        feats = await bc.get_infrastructure_in_bbox(bbox)
        print('bdot count', len(feats) if feats else 0)
    except Exception as e:
        print('bdot error', e)

    print('--- KIUT WMS ---')
    try:
        centroid = shape(parcel_geom).centroid
        kiut = await _check_kiut_wms(centroid.x, centroid.y)
        print('kiut centroid', kiut)
    except Exception as e:
        print('kiut error', e)


if __name__ == '__main__':
    asyncio.run(main())
