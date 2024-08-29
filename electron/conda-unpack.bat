@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PYTHON_ENV_DIR=%SCRIPT_DIR%python

if not exist "%PYTHON_ENV_DIR%\.conda_unpacked" (
    echo Unpacking conda environment...
    call "%PYTHON_ENV_DIR%\Scripts\activate.bat"
    conda-unpack
    type nul > "%PYTHON_ENV_DIR%\.conda_unpacked"
    echo Conda environment unpacked successfully.
) else (
    echo Conda environment already unpacked. Skipping.
)

endlocal
