<#
  AMIR ZAMEER ERP - background server. Started by the Windows scheduled task "AMIR ZAMEER ERP"
  every time the PC starts (no login needed). Runs the built ERP (API + web app) on port 4000
  and restarts it automatically if it stops (for example while PostgreSQL is still starting).
  Do not run this by hand; use SETUP-AUTO-START.cmd / UPDATE-ERP.cmd.
#>
param([Parameter(Mandatory = $true)][string]$Node)

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$out = Join-Path $logDir 'erp-server.log'
$err = Join-Path $logDir 'erp-server-errors.log'
$events = Join-Path $logDir 'erp-server-events.log'
$main = Join-Path $root 'apps\backend\dist\main.js'

$env:NODE_ENV = 'production'
$env:TRUST_PROXY = 'true'
Set-Location (Join-Path $root 'apps\backend')

while ($true) {
  foreach ($f in $out, $err) { if (Test-Path $f) { Move-Item $f "$f.old" -Force -ErrorAction SilentlyContinue } }
  Add-Content $events "$(Get-Date -Format 's') Starting ERP server"
  $p = Start-Process -FilePath $Node -ArgumentList "`"$main`"" -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $out -RedirectStandardError $err
  Add-Content $events "$(Get-Date -Format 's') ERP server stopped (exit code $($p.ExitCode)). Restarting in 10 seconds."
  Start-Sleep -Seconds 10
}
