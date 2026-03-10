#!/bin/bash

echo "Starting frontend on port 3001..."
cd frontend-react
npm start &
FRONTEND_PID=$!

# Wait for it to start
sleep 8

echo "Testing if frontend is accessible..."
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "✅ Frontend is running on http://localhost:3001"
else
    echo "❌ Frontend failed to start"
fi

# Kill the process
kill $FRONTEND_PID 2>/dev/null
wait $FRONTEND_PID 2>/dev/null

echo "Done"
