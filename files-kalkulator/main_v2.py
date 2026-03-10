"""
KALKULATOR v4.0 — Nowoczesny backend z kolejkowaniem i cache
Improvements:
- Async parallel processing dla wielu działek
- Redis cache dla API responses
- WebSocket progress tracking
- Background tasks (Celery alternative)
"""
import logging
import os
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from collections import defaultdict
import hashlib
import json

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.modules.terrain import fetch_terrain
from backend.modules.property import PropertyAggregator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Kalkulator Roszczeń v4.0",
    version="4.0.0",
    description="System analizy działek z kolejkowaniem i cache"
)

# CORS dla frontendu React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # W produkcji: ["https://yourdomain.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "build"

# =====================================================
# SIMPLE IN-MEMORY CACHE (zamiast Redis na start)
# =====================================================
class SimpleCache:
    def __init__(self, ttl_seconds=3600):
        self.cache: Dict[str, tuple] = {}  # {key: (data, timestamp)}
        self.ttl = ttl_seconds
    
    def get(self, key: str) -> Optional[Any]:
        if key in self.cache:
            data, timestamp = self.cache[key]
            age = (datetime.now(timezone.utc) - timestamp).total_seconds()
            if age < self.ttl:
                logger.info(f"Cache HIT: {key}")
                return data
            else:
                del self.cache[key]
        return None
    
    def set(self, key: str, data: Any):
        self.cache[key] = (data, datetime.now(timezone.utc))
        logger.info(f"Cache SET: {key}")
    
    def clear(self):
        self.cache.clear()

cache = SimpleCache(ttl_seconds=3600)  # 1 godzina

# =====================================================
# PROGRESS TRACKING dla WebSocket
# =====================================================
class ProgressTracker:
    def __init__(self):
        self.jobs: Dict[str, Dict] = {}
        self.websockets: Dict[str, List[WebSocket]] = defaultdict(list)
    
    def create_job(self, job_id: str, total: int):
        self.jobs[job_id] = {
            "total": total,
            "completed": 0,
            "errors": 0,
            "status": "running",
            "results": [],
            "started_at": datetime.now(timezone.utc).isoformat()
        }
    
    def update_progress(self, job_id: str, parcel_id: str, result: Dict):
        if job_id not in self.jobs:
            return
        
        job = self.jobs[job_id]
        job["completed"] += 1
        if result.get("data_status") == "ERROR":
            job["errors"] += 1
        job["results"].append(result)
        
        # Broadcast do wszystkich WebSocket subscribers
        asyncio.create_task(self._broadcast(job_id, {
            "type": "progress",
            "job_id": job_id,
            "completed": job["completed"],
            "total": job["total"],
            "errors": job["errors"],
            "current_parcel": parcel_id
        }))
    
    def complete_job(self, job_id: str):
        if job_id in self.jobs:
            self.jobs[job_id]["status"] = "completed"
            self.jobs[job_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
            asyncio.create_task(self._broadcast(job_id, {
                "type": "complete",
                "job_id": job_id
            }))
    
    async def _broadcast(self, job_id: str, message: Dict):
        if job_id in self.websockets:
            dead_sockets = []
            for ws in self.websockets[job_id]:
                try:
                    await ws.send_json(message)
                except:
                    dead_sockets.append(ws)
            # Cleanup
            for ws in dead_sockets:
                self.websockets[job_id].remove(ws)

tracker = ProgressTracker()

# =====================================================
# REQUEST MODELS
# =====================================================
class AnalyzeRequest(BaseModel):
    parcel_ids: str
    obreb: Optional[str] = None
    county: Optional[str] = None
    municipality: Optional[str] = None
    infra_type_pref: str = "elektro_SN"
    use_cache: bool = True

class ParcelAnalysisResult(BaseModel):
    parcel_id: str
    data_status: str
    master_record: Optional[Dict] = None
    error: Optional[str] = None
    cached: bool = False

# =====================================================
# HELPER FUNCTIONS
# =====================================================
def make_cache_key(parcel_id: str, infra_type: str, obreb: Optional[str] = None) -> str:
    """Generuje klucz cache dla działki"""
    parts = [parcel_id, infra_type]
    if obreb:
        parts.append(obreb)
    combined = "|".join(parts)
    return hashlib.md5(combined.encode()).hexdigest()

async def analyze_single_parcel(
    parcel_id: str,
    infra_type_pref: str,
    obreb: Optional[str] = None,
    county: Optional[str] = None,
    municipality: Optional[str] = None,
    use_cache: bool = True
) -> ParcelAnalysisResult:
    """Analizuje pojedynczą działkę z cache"""
    
    # 1. Check cache
    cache_key = make_cache_key(parcel_id, infra_type_pref, obreb)
    if use_cache:
        cached_data = cache.get(cache_key)
        if cached_data:
            return ParcelAnalysisResult(
                parcel_id=parcel_id,
                data_status=cached_data.get("status", "REAL"),
                master_record=cached_data,
                cached=True
            )
    
    # 2. Fetch fresh data
    aggregator = PropertyAggregator()
    try:
        master_record = await aggregator.generate_master_record(
            parcel_id,
            infra_type_pref,
            obreb=obreb,
            county=county,
            municipality=municipality,
        )
        
        # 3. Cache result
        if use_cache and master_record.get("status") != "ERROR":
            cache.set(cache_key, master_record)
        
        return ParcelAnalysisResult(
            parcel_id=parcel_id,
            data_status=master_record.get("status", "REAL"),
            master_record=master_record,
            cached=False
        )
        
    except Exception as e:
        logger.error(f"Błąd analizy {parcel_id}: {e}")
        return ParcelAnalysisResult(
            parcel_id=parcel_id,
            data_status="ERROR",
            error=str(e),
            cached=False
        )

# =====================================================
# BACKGROUND TASK - Batch Analysis
# =====================================================
async def analyze_batch_background(
    job_id: str,
    parcel_ids: List[str],
    infra_type_pref: str,
    obreb: Optional[str] = None,
    county: Optional[str] = None,
    municipality: Optional[str] = None,
    use_cache: bool = True
):
    """Background task dla batch analysis z progress tracking"""
    
    tracker.create_job(job_id, len(parcel_ids))
    
    # Parallel processing w batchach po 10
    BATCH_SIZE = 10
    
    for i in range(0, len(parcel_ids), BATCH_SIZE):
        batch = parcel_ids[i:i + BATCH_SIZE]
        
        tasks = [
            analyze_single_parcel(
                pid, infra_type_pref, obreb, county, municipality, use_cache
            )
            for pid in batch
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for pid, result in zip(batch, results):
            if isinstance(result, Exception):
                result = ParcelAnalysisResult(
                    parcel_id=pid,
                    data_status="ERROR",
                    error=str(result)
                )
            tracker.update_progress(job_id, pid, result.dict())
    
    tracker.complete_job(job_id)

# =====================================================
# API ENDPOINTS
# =====================================================
@app.get("/")
async def index():
    """Serve React frontend"""
    html_file = FRONTEND_DIR / "index.html"
    if html_file.exists():
        return FileResponse(html_file)
    return {
        "message": "KALKULATOR API v4.0",
        "docs": "/docs",
        "endpoints": {
            "analyze": "/api/analyze",
            "status": "/api/status/{job_id}",
            "preview": "/api/parcel/{parcel_id}"
        }
    }

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Endpoint analizy działek z background processing.
    
    Dla 1-3 działek: synchroniczne
    Dla 4+ działek: background task z job_id
    """
    # Parse parcel IDs
    ids = [i.strip() for i in req.parcel_ids.replace("\n", ",").split(",") if i.strip()]
    
    if not ids:
        raise HTTPException(status_code=400, detail="Brak działek do analizy")
    
    # Small batch - synchronous
    if len(ids) <= 3:
        results = []
        for pid in ids:
            result = await analyze_single_parcel(
                pid, req.infra_type_pref, req.obreb, req.county, req.municipality, req.use_cache
            )
            results.append(result.dict())
        
        return {
            "mode": "sync",
            "summary": {
                "count": len(results),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "policy": "STRICT REAL DATA ONLY (Spec 3.0)"
            },
            "parcels": results
        }
    
    # Large batch - background task
    job_id = hashlib.md5(f"{datetime.now().isoformat()}{ids[0]}".encode()).hexdigest()[:12]
    
    background_tasks.add_task(
        analyze_batch_background,
        job_id, ids, req.infra_type_pref, req.obreb, req.county, req.municipality, req.use_cache
    )
    
    return {
        "mode": "async",
        "job_id": job_id,
        "status_url": f"/api/status/{job_id}",
        "websocket_url": f"/ws/{job_id}",
        "message": f"Analiza {len(ids)} działek rozpoczęta w tle"
    }

@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    """Pobierz status zadania"""
    if job_id not in tracker.jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = tracker.jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": {
            "completed": job["completed"],
            "total": job["total"],
            "errors": job["errors"],
            "percentage": round(job["completed"] / job["total"] * 100, 1)
        },
        "started_at": job["started_at"],
        "completed_at": job.get("completed_at"),
        "results": job["results"] if job["status"] == "completed" else []
    }

@app.websocket("/ws/{job_id}")
async def websocket_progress(websocket: WebSocket, job_id: str):
    """WebSocket dla real-time progress updates"""
    await websocket.accept()
    tracker.websockets[job_id].append(websocket)
    
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        tracker.websockets[job_id].remove(websocket)

@app.get("/api/parcel/{parcel_id}")
async def get_parcel_preview(parcel_id: str):
    """Szybki podgląd tylko z ULDK"""
    cache_key = f"preview_{parcel_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    terrain = await fetch_terrain(parcel_id)
    cache.set(cache_key, terrain)
    return terrain

@app.post("/api/cache/clear")
async def clear_cache():
    """Wyczyść cache (admin endpoint)"""
    cache.clear()
    return {"message": "Cache cleared"}

@app.get("/api/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "version": "4.0.0",
        "cache_size": len(cache.cache),
        "active_jobs": len([j for j in tracker.jobs.values() if j["status"] == "running"])
    }

# =====================================================
# STARTUP
# =====================================================
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,  # Development mode
        log_level="info"
    )
