<#
  AMIR ZAMEER ERP - make an encrypted backup now (also works while the ERP is stopped).
  In PowerShell, in the project folder:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-now.ps1
  The backup (.azbak) is saved in the "backups" folder of the project and shows on the Backup page.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
Set-Location $Root

Say ''
Say '=== TailoringERP - Backup now ===' 'Yellow'
Say ''
$cli = Join-Path $Root 'apps\backend\dist\modules\backup\cli.js'
if (-not (Test-Path $cli)) { Stop-WithError 'This version is not built yet. Run scripts\update-erp.ps1 first, then run this again.' }
Set-Location (Join-Path $Root 'apps\backend')
& node 'dist\modules\backup\cli.js' create 'Made with backup-now.ps1'
if ($LASTEXITCODE -ne 0) { Stop-WithError 'The backup failed (see the message above).' }
Say ''
Say "Done. Backups folder: $(Join-Path $Root 'backups')" 'Green'
Read-Host 'Press Enter to close'
