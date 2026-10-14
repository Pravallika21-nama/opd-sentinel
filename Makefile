# OPD Sentinel task runner.
# Recipes stay compatible with cmd.exe (Windows) and sh (Unix).

ifeq ($(OS),Windows_NT)
PY := .venv/Scripts/python.exe
else
PY := .venv/bin/python
endif

.PHONY: help setup data train eval api web test demo lint

help:
	@echo OPD Sentinel
	@echo   make setup   Create the virtualenv and install dependencies
	@echo   make test    Lint, type-check, and run backend and frontend tests
	@echo   make api     Start the API on 127.0.0.1:8000
	@echo   make web     Start the dashboard on 127.0.0.1:5173
	@echo   make data    Build the dataset (Phase 1)
	@echo   make train   Train models (Phases 4 and 5)
	@echo   make eval    Evaluate on held-out data (Phase 7)
	@echo   make demo    Walk through the demo flow (Phase 11)

setup:
	python -m venv .venv
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
	$(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

web:
	cd frontend && npm run dev

data:
	$(PY) scripts/make_synthetic.py

train:
	$(PY) -m ml.train

eval:
	$(PY) -m eval.evaluate

demo:
	$(PY) scripts/run_demo.py
