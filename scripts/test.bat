@echo off

set PYTHONPATH=src
set PYTHONUNBUFFERED=1

pytest --cov=src --cov-report=term-missing --cov-report=html tests