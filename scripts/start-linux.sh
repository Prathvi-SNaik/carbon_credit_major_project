#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 -m pip install -r ai-module/requirements.txt
(cd backend && npm install)
(cd frontend && npm install)
trap 'kill 0' EXIT
(cd ai-module && PYTHONPATH=. python3 -m uvicorn app:app --host 127.0.0.1 --port 43122) &
(cd backend && npm start) &
(cd frontend && npm run dev) &
echo "Open http://127.0.0.1:43123"
wait
