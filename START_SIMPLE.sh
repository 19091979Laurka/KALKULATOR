#!/bin/bash

# Simple startup - just tell user what to do

cd /Users/szwrk/Documents/GitHub/KALKULATOR

cat << 'EOF'

╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  🚀 KALKULATOR STARTUP - Open 2 Terminal Windows                 ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

WINDOW 1 - BACKEND API:
─────────────────────────────────────────────────────────────────────

Paste this command:

    cd /Users/szwrk/Documents/GitHub/KALKULATOR
    uvicorn backend.main:app --port 8080

Wait for:
    Application startup complete [uvicorn/main] Uvicorn running on http://0.0.0.0:8080

Then move to WINDOW 2.

═════════════════════════════════════════════════════════════════════

WINDOW 2 - FRONTEND REACT:
─────────────────────────────────────────────────────────────────────

Paste this command:

    cd /Users/szwrk/Documents/GitHub/KALKULATOR/frontend-react
    npm start

Wait for browser to open at:
    http://localhost:3001

═════════════════════════════════════════════════════════════════════

Then BOTH are running! ✅

Test it:
  1. Open http://localhost:3001
  2. See the form
  3. Enter parcel ID
  4. Click "Analizuj"
  5. Wait for results

═════════════════════════════════════════════════════════════════════

If frontend says "Cannot GET /api" or shows connection error:
  → Backend on port 8080 MUST be running first!

If frontend can't connect:
  1. Check: Is backend running? (look at WINDOW 1)
  2. If not running: Start it in WINDOW 1
  3. Wait 5 seconds
  4. Refresh frontend in browser (Cmd+R)

═════════════════════════════════════════════════════════════════════

✅ EVERYTHING IS INSTALLED AND READY

Just follow the steps above!

EOF
