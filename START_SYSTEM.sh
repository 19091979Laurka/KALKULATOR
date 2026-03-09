#!/bin/bash

# KALKULATOR Full System Startup Script
# Run this to start backend + frontend together

PROJECT_DIR="/Users/szwrk/Documents/GitHub/KALKULATOR"
cd "$PROJECT_DIR"

echo "════════════════════════════════════════════════════════════════"
echo "  🚀 KALKULATOR ROSZCZEŃ - SYSTEM STARTUP"
echo "════════════════════════════════════════════════════════════════"

# Kill any existing processes on ports 8080 and 3001
echo ""
echo "Cleaning up old processes..."
lsof -ti :8080 | xargs kill -9 2>/dev/null || true
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
sleep 1

# Start Backend
echo ""
echo "1️⃣  Starting Backend API on port 8080..."
uvicorn backend.main:app --port 8080 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to be ready
sleep 3

# Check if backend is running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ Backend failed to start!"
    exit 1
fi

# Test backend
echo ""
echo "Testing backend..."
if curl -s http://localhost:8080/docs > /dev/null; then
    echo "✅ Backend responding at http://localhost:8080"
    echo "   API docs: http://localhost:8080/docs"
else
    echo "⚠️  Backend not responding yet..."
fi

# Start Frontend
echo ""
echo "2️⃣  Starting Frontend React on port 3001..."
cd frontend-react
npm start &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "✅ SYSTEM STARTED"
echo ""
echo "   Backend API:  http://localhost:8080"
echo "   Frontend:     http://localhost:3001"
echo "   API Docs:     http://localhost:8080/docs"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""
echo "════════════════════════════════════════════════════════════════"

# Wait for both
wait
