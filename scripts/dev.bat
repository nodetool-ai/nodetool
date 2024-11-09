@echo off

start cmd /c "cd web && npm start"

set PYTHONPATH=src
python -m nodetool.cli serve 