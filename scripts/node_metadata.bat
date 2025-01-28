@echo off
REM Set Python path
set PYTHONPATH=%PYTHONPATH%;src

REM Run Python script
python scripts/node_metadata.py