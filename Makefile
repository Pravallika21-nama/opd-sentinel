# OPD Sentinel task runner.
# Recipes stay compatible with cmd.exe (Windows) and sh (Unix).

ifeq ($(OS),Windows_NT)
PY := .venv/Scripts/python.exe
SYS_PY := py -3.12
else
PY := .venv/bin/python
SYS_PY := python3
endif

.PHONY: help setup ktas mimic-demo data train eval mimic api web test demo lint

help:
	@echo OPD Sentinel
	@echo   make setup   Create the virtualenv and install dependencies
	@echo   make test    Lint, type-check, and run backend and frontend tests
	@echo   make api     Start the API on 127.0.0.1:8000
	@echo   make web     Start the dashboard on 127.0.0.1:5173
	@echo   make ktas    Download and prepare the public KTAS dataset (CC BY 4.0)
	@echo   make mimic-demo  Download the open MIMIC-IV-ED Demo (ODbL) as an external test set
	@echo   make data    Build the splits (official, then KTAS, then synthetic)
	@echo   make train   Train models (Phases 4 and 5)
	@echo   make eval    Evaluate on held-out data (Phase 7)
	@echo   make demo    Walk through the demo flow (Phase 11)

setup:
	$(SYS_PY) -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -e ".[dev,ml]"
	$(PY) -m pre_commit install
	cd frontend && npm ci

lint:
	$(PY) -m ruff check backend scripts
	$(PY) -m ruff format --check backend scripts
	$(PY) -m mypy
	cd frontend && npm run typecheck

test: lint
	$(PY) -m pytest
	cd frontend && npm test

api:
	$(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir backend

web:
	cd frontend && npm run dev

ktas:
	$(PY) scripts/prepare_ktas.py --download

data:
	$(PY) scripts/make_synthetic.py

train:
	$(PY) -m ml.train

eval:
	$(PY) -m eval.evaluate

mimic:
	$(PY) scripts/prepare_mimic_iv_ed.py

mimic-demo:
	$(PY) scripts/prepare_mimic_demo.py --download

demo:
	$(PY) scripts/run_demo.py
