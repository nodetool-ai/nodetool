#!/usr/bin/env pwsh
param(
    [string]$WebDevServerUrl = $env:NT_WEB_DEV_SERVER_URL
)

if (-not $WebDevServerUrl) {
    $WebDevServerUrl = "http://127.0.0.1:3000"
}

$WebServerPid = $null

function Cleanup {
    if ($WebServerPid) {
        # /T kills the whole tree — stopping only npm.cmd would orphan the
        # Vite node child it spawned.
        & taskkill /PID $WebServerPid /T /F 2>$null | Out-Null
    }
}

trap {
    Cleanup
    exit 1
}

# Check for conda environment - try multiple detection methods
$CondaActive = $false

# Method 1: Check CONDA_PREFIX environment variable
if ($env:CONDA_PREFIX) {
    $CondaActive = $true
}

# Method 2: Check CONDA_DEFAULT_ENV environment variable
if (-not $CondaActive -and $env:CONDA_DEFAULT_ENV -and $env:CONDA_DEFAULT_ENV -ne "base") {
    $CondaActive = $true
}

# Method 3: Try to run 'conda info' and check if there's an active env
if (-not $CondaActive) {
    try {
        $CondaInfo = & conda info --envs 2>$null | Select-String "\*"
        if ($CondaInfo) {
            $CondaActive = $true
        }
    } catch {
        # conda not in PATH or command failed
    }
}

if (-not $CondaActive) {
    Write-Error "ERROR: No active conda environment detected."
    Write-Host "Activate your conda environment first, e.g. 'conda activate nodetool'." -ForegroundColor Yellow
    exit 1
}

Write-Host "Detected conda environment: $($env:CONDA_DEFAULT_ENV)"
Write-Host "Starting web Vite server on $WebDevServerUrl..."

# Start-Process, not Start-Job: under Windows PowerShell 5.1 a job runs in a
# separate process rooted at the user's home directory, so `Set-Location web`
# fails there and Vite never starts — silently, because nothing reads the
# job's error stream. -NoNewWindow shares this console, so Vite's output and
# any startup error stay visible.
$WebDir = Join-Path $PSScriptRoot "..\web"
$WebProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" `
    -WorkingDirectory $WebDir -NoNewWindow -PassThru

$WebServerPid = $WebProc.Id

Write-Host "Waiting for Vite server..."
$MaxAttempts = 300
$Ready = $false

for ($i = 0; $i -lt $MaxAttempts; $i++) {
    Start-Sleep -Seconds 1
    try {
        $Response = Invoke-WebRequest -Uri $WebDevServerUrl -Method HEAD -UseBasicParsing -ErrorAction Stop
        if ($Response.StatusCode -eq 200) {
            $Ready = $true
            break
        }
    } catch {
        # Server not ready yet
    }
}

if (-not $Ready) {
    Write-Error "ERROR: Vite server did not become ready at $WebDevServerUrl."
    Cleanup
    exit 1
}

Write-Host "Building Electron main/preload bundle..."
npm --prefix electron run vite:build

Write-Host "Starting Electron in dev mode..."
$env:NT_ELECTRON_DEV_MODE = "1"
$env:NT_WEB_DEV_SERVER_URL = $WebDevServerUrl
npm --prefix electron run start:devmode

Cleanup
