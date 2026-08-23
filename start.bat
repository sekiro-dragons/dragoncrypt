@echo off
echo Starting Dragoncrypt...

echo   Building CLI (dc)...
cargo install --path cli --debug --quiet

echo   Starting backend on :3001...
start "dragoncrypt-backend" cmd /k "cargo run -p dragoncrypt-backend"

timeout /t 3 /nobreak >nul

echo   Starting frontend on :5173...
start "dragoncrypt-frontend" cmd /k "cd frontend && npm run dev"

echo.
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173
echo   CLI:      dragoncrypt / dc
echo.
echo   Close both terminal windows to stop.
