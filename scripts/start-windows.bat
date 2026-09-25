@echo off
cd /d "%~dp0.."
echo Installing Python packages...
python -m pip install -r ai-module\requirements.txt
echo Installing Node packages...
cd backend && call npm install && cd ..
cd frontend && call npm install && cd ..
echo Starting AI, backend, and frontend...
start "CCF-AI" cmd /k "cd /d %~dp0..\ai-module && set PYTHONPATH=%cd% && python -m uvicorn app:app --host 127.0.0.1 --port 43122"
start "CCF-API" cmd /k "cd /d %~dp0..\backend && npm start"
start "CCF-WEB" cmd /k "cd /d %~dp0..\frontend && npm run dev"
echo Open http://127.0.0.1:43123 in your browser after the three windows start.
pause
