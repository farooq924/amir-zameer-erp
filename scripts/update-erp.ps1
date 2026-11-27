<#
  AMIR ZAMEER ERP - apply an update. Paste the update zip into the project folder (Replace),
  then double-click UPDATE-ERP.cmd. Stops the background ERP, rebuilds, updates the database
  and starts it again. The Cloudflare Tunnel keeps running; the link stays the same.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
Ensure-Admin $PSCommandPath
Set-Location $Root

Say ''
Say '=== AMIR ZAMEER ERP - Update ===' 'Yellow'
Say ''
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  Stop-WithError 'Auto-start is not set up yet. Double-click SETUP-AUTO-START.cmd first.'
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
