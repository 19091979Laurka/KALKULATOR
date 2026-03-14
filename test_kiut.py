import asyncio
from backend.modules.infrastructure import _check_kiut_wms

async def test():
    out = await _check_kiut_wms(20.222858, 52.704209)
    print("Result:", out)

asyncio.run(test())