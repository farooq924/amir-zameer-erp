<#
  TailoringERP - apply an update. Paste the update zip into the project folder (Replace),
  then in an Administrator PowerShell run:
    Get-ChildItem -Recurse -File | Unblock-File
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-erp.ps1
  (Windows Smart App Control may block double-clicking UPDATE-ERP.cmd.) Stops the background ERP, rebuilds, updates the database
  and starts it again. The Cloudflare Tunnel keeps running; the link stays the same.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
Ensure-Admin $PSCommandPath
Set-Location $Root

Say ''
Say '=== TailoringERP - Update ===' 'Yellow'
Say ''
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  Stop-WithError 'Auto-start is not set up yet. Double-click SETUP-AUTO-START.cmd first.'
}

# Safety first: an encrypted backup of the current data before anything changes (from version 1.10.0 on).
$backupCli = Join-Path $Root 'apps\backend\dist\modules\backup\cli.js'
if (Test-Path $backupCli) {
  Say 'Making a backup before the update...' 'Cyan'
  Push-Location (Join-Path $Root 'apps\backend')
  & node 'dist\modules\backup\cli.js' create 'Before update'
  $backupOk = ($LASTEXITCODE -eq 0)
  Pop-Location
  if (-not $backupOk) {
    Say 'The backup before the update failed (see above).' 'Red'
    $go = Read-Host 'Type YES to update anyway, or press Enter to stop'
    if ($go -ne 'YES') { Stop-WithError 'Update cancelled. Nothing was changed.' }
  }
}

Say 'Stopping the ERP...' 'Cyan'
Stop-ErpServer
Build-Erp

Say 'Starting the ERP...' 'Cyan'
Start-ScheduledTask -TaskName $TaskName
if (-not (Wait-ErpHealthy 120)) { Stop-WithError "The ERP did not start. See $LogDir\erp-server-errors.log" }

Say ''
Say 'Update finished. The ERP is running again.' 'Green'
Read-Host 'Press Enter to close'
