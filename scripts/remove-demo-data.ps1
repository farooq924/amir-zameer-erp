<#
  AMIR ZAMEER ERP - remove the DEMO login and ALL demo data. Your real customers, orders, stock and staff are kept.
  In an Administrator PowerShell, in the project folder:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\remove-demo-data.ps1
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
Set-Location $Root

Say ''
Say '=== TailoringERP - Remove demo data ===' 'Yellow'
Say ''
if (-not (Test-Path (Join-Path $Root 'apps\backend\dist\demo\cli.js'))) {
  Stop-WithError 'This version is not built yet. Run scripts\update-erp.ps1 first, then run this again.'
}
$answer = Read-Host 'This deletes the demo user and all demo records. Type YES to continue'
if ($answer -ne 'YES') { Say 'Cancelled. Nothing was changed.' 'Yellow'; Read-Host 'Press Enter to close'; exit 0 }
Set-Location (Join-Path $Root 'apps\backend')
& node 'dist\demo\cli.js' remove
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Demo data could not be removed (see the message above). Nothing was changed.' }
Say ''
Say 'Done. Demo data removed.' 'Green'
Read-Host 'Press Enter to close'
