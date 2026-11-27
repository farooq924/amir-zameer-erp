<#
  AMIR ZAMEER ERP - one-time setup: ERP always online at your own domain.

  After this runs once, whenever this PC is switched on:
    - the ERP starts by itself in the background (Windows scheduled task "AMIR ZAMEER ERP", no login needed),
    - the Cloudflare Tunnel starts by itself (Windows service "cloudflared"),
    - the ERP opens at https://<Domain> from anywhere, and at http://localhost:4000 on this PC.

  Run by double-clicking SETUP-AUTO-START.cmd in the project folder. Safe to run again.
  Remove everything again:  SETUP-AUTO-START.cmd -Uninstall
#>
param(
  [string]$Domain = 'tr-erp.brandistan.pk',
  [string]$TunnelToken = '',
  [switch]$SkipBuild,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'erp-common.ps1')
$passArgs = "-Domain $Domain"
if ($SkipBuild) { $passArgs += ' -SkipBuild' }
if ($Uninstall) { $passArgs += ' -Uninstall' }
Ensure-Admin $PSCommandPath $passArgs
Set-Location $Root

Say ''
Say '=== AMIR ZAMEER ERP - Always online setup ===' 'Yellow'
Say ''

if ($Uninstall) {
  Stop-ErpServer
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  $cf = Get-CloudflaredPath
  if ($cf -and (Get-Service cloudflared -ErrorAction SilentlyContinue)) { & $cf service uninstall }
  Say 'Auto-start and the Cloudflare Tunnel service were removed. The ERP is no longer online.' 'Yellow'
  Read-Host 'Press Enter to close'
  exit 0
}

# 1. Checks -----------------------------------------------------------------
$node = Get-NodePath
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Stop-WithError 'pnpm was not found. Run: npm install -g pnpm@10.28.0' }
if (-not (Test-Path (Join-Path $Root 'apps\backend\.env'))) { Stop-WithError 'apps\backend\.env is missing. See docs\RUN-ON-WINDOWS.md step 4.' }

# 2. Settings ---------------------------------------------------------------
Say "Saving settings for https://$Domain ..." 'Cyan'
Set-EnvValue 'APP_URL' "https://$Domain"
Set-EnvValue 'TRUST_PROXY' 'true'

# 3. Build ------------------------------------------------------------------
Stop-ErpServer
if (Test-PortBusy 4000) {
  Stop-WithError 'Port 4000 is in use. Close any PowerShell window running "pnpm dev:backend" and run this again.'
}
if (-not $SkipBuild) { Build-Erp }

# 4. Auto-start of the ERP --------------------------------------------------
Say 'Registering auto-start (Windows Task Scheduler)...' 'Cyan'
$serverScript = Join-Path $Root 'scripts\erp-server.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $Root `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serverScript`" -Node `"$node`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'Runs AMIR ZAMEER ERP on port 4000 whenever the PC is on.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Say 'Waiting for the ERP to start...' 'Cyan'
if (-not (Wait-ErpHealthy 120)) { Stop-WithError "The ERP did not start. See $LogDir\erp-server-errors.log" }
Say 'ERP is running on this PC: http://localhost:4000' 'Green'

# 5. Cloudflare Tunnel as a Windows service ---------------------------------
$cf = Get-CloudflaredPath
if (-not $cf) {
  Say 'Installing cloudflared...' 'Cyan'
  winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
  $cf = Get-CloudflaredPath
  if (-not $cf) { Stop-WithError 'cloudflared could not be installed. Install it from https://github.com/cloudflare/cloudflared/releases/latest (cloudflared-windows-amd64.msi) and run this again.' }
}

$service = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($service -and -not $TunnelToken) {
  Say 'Cloudflare Tunnel service is already installed.' 'Green'
  if ($service.Status -ne 'Running') { Start-Service cloudflared }
} else {
  if (-not $TunnelToken) {
    Say ''
    Say 'Paste the tunnel install command or token from the Cloudflare dashboard' 'Yellow'
    Say '(Networks > Tunnels > your tunnel > "Install and run a connector"), then press Enter.' 'Yellow'
    Say 'Press Enter without pasting to skip this for now.' 'Yellow'
    $TunnelToken = Read-Host 'Token'
  }
  # Accept the whole "cloudflared.exe service install eyJ..." command or only the token.
  $m = [regex]::Match($TunnelToken, 'eyJ[A-Za-z0-9_\-=\.]+')
  if ($m.Success) {
    if ($service) { & $cf service uninstall; Start-Sleep -Seconds 3 }
    & $cf service install $m.Value
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'Cloudflare Tunnel service could not be installed (see above).' }
    Say 'Cloudflare Tunnel service installed. It starts by itself with Windows.' 'Green'
  } elseif ($TunnelToken) {
    Stop-WithError 'That does not look like a tunnel token (it starts with eyJ). Copy it again from the Cloudflare dashboard.'
  } else {
    Say 'Tunnel skipped. Run SETUP-AUTO-START.cmd again when you have the token.' 'Yellow'
  }
}

Say ''
Say '==================================================================' 'Green'
Say '  Done. From now on the ERP starts by itself whenever this PC is on.' 'Green'
Say ''
Say "     Online:      https://$Domain" 'Yellow'
Say '     On this PC:  http://localhost:4000' 'Yellow'
Say ''
Say '  Keep the PC from sleeping: Settings > System > Power > Sleep = Never.' 'Green'
Say '  After pasting an update zip, double-click UPDATE-ERP.cmd.' 'Green'
Say '==================================================================' 'Green'
Read-Host 'Press Enter to close'
