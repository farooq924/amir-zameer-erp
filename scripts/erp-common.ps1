# AMIR ZAMEER ERP - helpers shared by setup-auto-start.ps1 and update-erp.ps1 (Windows PowerShell 5.1+).

$script:Root = Split-Path -Parent $PSScriptRoot
$script:TaskName = 'AMIR ZAMEER ERP'
$script:LogDir = Join-Path $script:Root 'logs'

function Say([string]$text, [string]$color = 'Gray') { Write-Host $text -ForegroundColor $color }

function Stop-WithError([string]$text) {
  Say ''
  Say "ERROR: $text" 'Red'
  Read-Host 'Press Enter to close'
  exit 1
}

# Re-opens this script as Administrator (Windows asks "Allow this app to make changes?" - click Yes).
function Ensure-Admin([string]$scriptPath, [string]$extraArgs = '') {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $isAdmin = (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" $extraArgs"
    exit 0
  }
}

function Get-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { Stop-WithError 'Node.js was not found. Install Node.js 22 LTS from https://nodejs.org and run this again.' }
  return $cmd.Source
}

function Get-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

# Sets KEY=value in apps\backend\.env (adds the line when missing). Writes UTF-8 without BOM.
function Set-EnvValue([string]$key, [string]$value) {
  $file = Join-Path $script:Root 'apps\backend\.env'
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($l in [IO.File]::ReadAllLines($file)) { $lines.Add($l) }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($key))\s*=") { $lines[$i] = "$key=$value"; $found = $true }
  }
  if (-not $found) { $lines.Add("$key=$value") }
  [IO.File]::WriteAllLines($file, $lines.ToArray(), (New-Object Text.UTF8Encoding($false)))
}

function Invoke-Step([string]$title, [scriptblock]$block) {
  Say $title 'Cyan'
  & $block
  if ($LASTEXITCODE -ne 0) { Stop-WithError "$title failed (see the messages above)." }
}

# Installs packages, builds everything and updates the database.
function Build-Erp {
  Set-Location $script:Root
  Invoke-Step 'Installing packages...' { pnpm install }
  Invoke-Step 'Building shared package...' { pnpm --filter '@az/shared' build }
  Invoke-Step 'Preparing database client...' { pnpm --filter '@az/backend' exec prisma generate }
  Invoke-Step 'Updating database...' { pnpm --filter '@az/backend' db:migrate }
  Invoke-Step 'Loading default data...' { pnpm --filter '@az/backend' db:seed }
  Invoke-Step 'Building backend...' { pnpm --filter '@az/backend' build }
  Invoke-Step 'Building web app (about 1 minute)...' { pnpm --filter '@az/frontend' build }
}

# Stops the background ERP server (the scheduled task and its node process).
function Stop-ErpServer {
  if (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
  }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*apps\backend\dist\main.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

function Test-PortBusy([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-ErpHealthy([int]$seconds = 120) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $null = Invoke-WebRequest -Uri 'http://127.0.0.1:4000/api/health' -UseBasicParsing -TimeoutSec 3
      return $true
    } catch { Start-Sleep -Seconds 3 }
  }
  return $false
}
