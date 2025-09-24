<#
.SYNOPSIS
    Nodetool Windows bootstrapper: creates/updates conda env, syncs sibling repos, installs deps, and launches services.

.DESCRIPTION
    - Ensures environment.yml exists
    - Validates conda & npm are available
    - Updates/creates the nodetool conda environment
    - Clones or updates nodetool-core, nodetool-base, nodetool-huggingface beside this repo
    - Installs editable Python packages via uv
    - Installs npm dependencies for web/apps/electron
    - Launches backend amd web in new PowerShell windows
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Path $MyInvocation.MyCommand.Path -Parent }
$repoRoot = $scriptDir
$condaEnv = 'nodetool'
$pythonRepos = @(
  @{ Name = 'nodetool-core'; SkipOnWindows = $false; Required = $true },
  @{ Name = 'nodetool-base'; SkipOnWindows = $false; Required = $true },
  @{ Name = 'nodetool-huggingface'; SkipOnWindows = $true; Required = $false }
)
$siblingRoot = (Resolve-Path (Join-Path $repoRoot '..')).Path
$onWindows = $true

function Test-Command {
  param(
    [Parameter(Mandatory)][string]$Name,
    [string]$InstallHint
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    if ($InstallHint) {
      throw "Required command '$Name' not found. $InstallHint"
    }
    throw "Required command '$Name' not found."
  }
}

function Get-ShellCommand {
  if (Get-Command pwsh -ErrorAction SilentlyContinue) {
    return 'pwsh'
  }
  return 'powershell'
}

Write-Host "=== Validating prerequisites ==="
if (-not (Test-Path (Join-Path $repoRoot 'environment.yml'))) {
  throw "environment.yml not found at $repoRoot"
}

Test-Command -Name 'conda' -InstallHint 'Install Miniconda/Anaconda and reopen the shell.'
Test-Command -Name 'npm' -InstallHint 'Install Node.js (LTS) and reopen the shell.'

Write-Host "=== Loading Conda session ==="
& conda shell.powershell hook | Out-String | Invoke-Expression

Write-Host "=== Ensuring '$condaEnv' conda environment matches environment.yml ==="
$envList = conda env list | Out-String
if ($envList -match "(?m)^$condaEnv\s") {
  conda env update -n $condaEnv -f (Join-Path $repoRoot 'environment.yml') --prune | Out-Null
}
else {
  conda env create -n $condaEnv -f (Join-Path $repoRoot 'environment.yml') | Out-Null
}

conda activate $condaEnv | Out-Null

Write-Host "=== Ensuring required Python repositories are present beside nodetool ==="
if (-not (Test-Path $siblingRoot)) {
  New-Item -ItemType Directory -Path $siblingRoot | Out-Null
}

foreach ($repoInfo in $pythonRepos) {
  $repo = $repoInfo.Name
  if ($onWindows -and $repoInfo.SkipOnWindows) {
    Write-Warning "Skipping $repo editable install on Windows."
    continue
  }

  $projectPath = [System.IO.Path]::Combine($siblingRoot, $repo)
  if (-not (Test-Path $projectPath)) {
    if ($repoInfo.Required) {
      Write-Warning "$repo repository missing; skipping editable install."
    }
    continue
  }

  $pyproject = [System.IO.Path]::Combine($projectPath, 'pyproject.toml')
  if (-not (Test-Path $pyproject)) {
    Write-Warning "$repo missing pyproject.toml; skipping editable install."
    continue
  }

  try {
    uv pip install -e $projectPath | Out-Null
  }
  catch {
    Write-Warning ("Failed to install {0}: {1}" -f $repo, $_)
    continue
  }
}

Write-Host "=== Installing/updating Node dependencies ==="
foreach ($dir in @('web', 'electron')) {
  $dirPath = [System.IO.Path]::Combine($repoRoot, $dir)
  $packageJson = [System.IO.Path]::Combine($dirPath, 'package.json')
  if (Test-Path $packageJson) {
    if (Test-Path ([System.IO.Path]::Combine($dirPath, 'node_modules'))) {
      Write-Host "Updating npm dependencies in $dir..."
    }
    else {
      Write-Host "Installing npm dependencies in $dir..."
    }
    Push-Location $dirPath
    try {
      npm install | Out-Null
    }
    finally {
      Pop-Location
    }
  }
  else {
    Write-Host "[INFO] Skipping npm install in $dir (package.json not found)."
  }
}

$shellCommand = Get-ShellCommand

Write-Host "=== Launching services in new $shellCommand windows ==="
Start-Process $shellCommand -ArgumentList '-NoExit', '-Command', "conda activate $condaEnv; cd '$repoRoot'; nodetool serve --reload" -WindowStyle Normal -WorkingDirectory $repoRoot -ErrorAction Stop
Start-Process $shellCommand -ArgumentList '-NoExit', '-Command', "cd '$repoRoot\web'; npm start" -WindowStyle Normal -WorkingDirectory ([System.IO.Path]::Combine($repoRoot, 'web')) -ErrorAction Stop

Write-Host
Write-Host "Setup complete. Backend, web, and electron processes are starting in separate windows."

