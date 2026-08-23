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

# Conda is optional — only Python nodes need it, and the backend starts
# without Python support when no environment is active (server.ts warns and
# continues). Mirrors scripts/electron-dev.sh, which has no conda check.
if ($env:CONDA_PREFIX) {
    Write-Host "Detected conda environment: $($env:CONDA_DEFAULT_ENV)"
} else {
    Write-Host "No conda environment active - Python nodes will be unavailable. Run 'conda activate <env>' first to enable them." -ForegroundColor Yellow
}

Write-Host "Building stale backend workspaces..."
npm run build-stale-backend
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Backend workspace build failed."
    exit 1
}

Write-Host "Starting web Vite server on $WebDevServerUrl..."

# Start-Process, not Start-Job: under Windows PowerShell 5.1 a job runs in a
# separate process rooted at the user's home directory, so `Set-Location web`
# fails there and Vite never starts — silently, because nothing reads the
# job's error stream. -NoNewWindow shares this console, so Vite's output and
# any startup error stay visible.
$WebUri = [Uri]$WebDevServerUrl
$WebDir = Join-Path $PSScriptRoot "..\web"
$WebProc = Start-Process -FilePath "npm.cmd" -ArgumentList @(
    "run",
    "dev",
    "--",
    "--host",
    $WebUri.Host,
    "--port",
    "$($WebUri.Port)",
    "--strictPort"
) -WorkingDirectory $WebDir -NoNewWindow -PassThru

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
