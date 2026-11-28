<#
  TailoringERP - create (or reset) the Super Admin login: the Brandistan account that manages all companies.
  Run AFTER scripts\update-erp.ps1 has built version 2.0.0. In an Administrator PowerShell, in the project folder:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-super-admin.ps1
  Running it again with the same username only changes that Super Admin's password.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
Set-Location $Root

Say ''
Say '=== TailoringERP - Create Super Admin ===' 'Yellow'
Say ''
$cli = Join-Path $Root 'apps\backend\dist\modules\platform\cli.js'
if (-not (Test-Path $cli)) {
  Stop-WithError 'This version is not built yet. Run scripts\update-erp.ps1 first, then run this again.'
}
Set-Location (Join-Path $Root 'apps\backend')
Say 'Existing Super Admin logins:' 'Cyan'
& node 'dist\modules\platform\cli.js' list-super-admins
Say ''

$username = (Read-Host 'Super Admin username (e.g. brandistan)').Trim()
$fullName = (Read-Host 'Full name (e.g. Brandistan Admin)').Trim()
$email = (Read-Host 'Email (optional, press Enter to skip)').Trim()
Say 'Password: at least 10 characters, with capital and small letters and a number.' 'Cyan'
$p1 = Read-Host 'Password' -AsSecureString
$p2 = Read-Host 'Password again' -AsSecureString
$plain1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
$plain2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
if ($plain1 -ne $plain2) { Stop-WithError 'The two passwords are not the same. Nothing was changed.' }

$env:SA_USERNAME = $username
$env:SA_NAME = $fullName
$env:SA_EMAIL = $email
$env:SA_PASSWORD = $plain1
try {
  & node 'dist\modules\platform\cli.js' create-super-admin
  $ok = ($LASTEXITCODE -eq 0)
} finally {
  Remove-Item Env:SA_PASSWORD -ErrorAction SilentlyContinue
  $plain1 = $null; $plain2 = $null
}
if (-not $ok) { Stop-WithError 'The Super Admin could not be saved (see the message above).' }
Say ''
Say "Done. Open the ERP and sign in as  $username  to open the Super Admin panel." 'Green'
Read-Host 'Press Enter to close'
