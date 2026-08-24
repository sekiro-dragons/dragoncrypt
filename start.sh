#!/usr/bin/env bash
set -e

echo "Starting Dragoncrypt..."

cleanup() { kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; }
trap cleanup EXIT

echo "  Building CLI (dc)..."
cargo install --path cli --debug --quiet 2>/dev/null

echo "  Starting backend on :3001..."
cargo run -p dragoncrypt-backend --quiet &
BACKEND_PID=$!

sleep 2

echo "  Starting frontend on :5173..."
(cd frontend && npm run dev --quiet) &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "  CLI:      dragoncrypt / dc"
echo ""
echo "  Press Ctrl+C to stop."

wait
