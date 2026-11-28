<#
  AMIR ZAMEER ERP - restore an encrypted backup (.azbak). Use this when the ERP does not start, on a new PC,
  or for a backup made by an older ERP version. (When the ERP is running, the Owner can also restore from the Backup page.)

  In an Administrator PowerShell, in the project folder:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-backup.ps1
  or with a file:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-backup.ps1 -File "E:\ERP-Backups\AZ-backup-20261128-230000-auto.azbak"

  Steps: stops the ERP, checks the backup, test-restores it, makes a safety backup of the current data, restores,
  updates the database structure to this ERP version, and starts the ERP again.
  On a new PC: first put the recovery key in apps\backend\.env as BACKUP_ENCRYPTION_KEY=<key>.
#>
param([string]$File = '')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
if ($File) { Ensure-Admin $PSCommandPath "-File `"$File`"" } else { Ensure-Admin $PSCommandPath }
Set-Location $Root

Say ''
Say '=== AMIR ZAMEER ERP - Restore a backup ===' 'Yellow'
Say ''
$cli = Join-Path $Root 'apps\backend\dist\modules\backup\cli.js'
if (-not (Test-Path $cli)) { Stop-WithError 'This version is not built yet. Run scripts\update-erp.ps1 first, then run this again.' }
Set-Location (Join-Path $Root 'apps\backend')

if (-not $File) {
  Say 'Backups in the backups folder (newest first):' 'Cyan'
  & node 'dist\modules\backup\cli.js' list
  Say ''
  $File = Read-Host 'Type or paste the backup file name (or a full path to an .azbak file)'
  if (-not $File) { Stop-WithError 'No backup was chosen.' }
}
$File = $File.Trim('"', ' ')

Say ''
Say 'WARNING: all current ERP data will be replaced with the data in this backup.' 'Red'
Say 'A safety backup of the current data is made first.' 'Yellow'
$answer = Read-Host 'Type RESTORE to continue'
if ($answer -ne 'RESTORE') { Stop-WithError 'Restore cancelled. Nothing was changed.' }

$hasTask = [bool](Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)
Say 'Stopping the ERP...' 'Cyan'
Stop-ErpServer

Say 'Restoring (this can take a few minutes)...' 'Cyan'
& node 'dist\modules\backup\cli.js' restore $File
$restoreOk = ($LASTEXITCODE -eq 0)

Set-Location $Root
if ($restoreOk) {
  Invoke-Step 'Updating database structure...' { pnpm --filter '@az/backend' db:migrate }
  Invoke-Step 'Loading default data...' { pnpm --filter '@az/backend' db:seed }
}

if ($hasTask) {
  Say 'Starting the ERP...' 'Cyan'
  Start-ScheduledTask -TaskName $TaskName
  if (-not (Wait-ErpHealthy 120)) { Say "The ERP did not start. See $LogDir\erp-server-errors.log" 'Red' }
}

if (-not $restoreOk) { Stop-WithError 'The restore failed (see the message above). Your data was NOT changed.' }
Say ''
Say 'Restore finished. Open the ERP and sign in again.' 'Green'
Read-Host 'Press Enter to close'
