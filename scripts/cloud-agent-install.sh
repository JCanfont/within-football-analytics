#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for WITHIN Football Analytics.
# Prepares the FastAPI backend virtualenv and the Vite/React frontend deps.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Some base images ship Python without the venv/ensurepip module. Install it
# only when missing so repeated runs stay fast and network-light.
if ! python3 -c "import ensurepip" >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends python3-venv
fi

# Backend: isolated virtualenv with pinned requirements.
if [ ! -x backend/.venv/bin/python ]; then
  python3 -m venv backend/.venv
fi
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt

# Frontend: install locked npm dependencies.
npm --prefix frontend ci

echo "Cloud Agent install complete."
