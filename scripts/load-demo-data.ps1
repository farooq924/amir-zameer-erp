<#
  AMIR ZAMEER ERP - add the DEMO login and Karachi demo data (customers, orders, fabric, suppliers, staff, payroll).
  Run AFTER scripts\update-erp.ps1 has built this version. In an Administrator PowerShell, in the project folder:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\load-demo-data.ps1
  Safe to run twice (the second run changes nothing). Remove everything later with scripts\remove-demo-data.ps1.
  Demo login: username demo / password Demo@12345 (role: Manager).
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
Set-Location $Root

Say ''
Say '=== AMIR ZAMEER ERP - Load demo data ===' 'Yellow'
Say ''
if (-not (Test-Path (Join-Path $Root 'apps\backend\dist\demo\cli.js'))) {
  Stop-WithError 'This version is not built yet. Run scripts\update-erp.ps1 first, then run this again.'
}
Set-Location (Join-Path $Root 'apps\backend')
& node 'dist\demo\cli.js' load
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Demo data could not be loaded (see the message above).' }
Say ''
Say 'Done. Open the ERP and sign in with  demo / Demo@12345' 'Green'
Read-Host 'Press Enter to close'
