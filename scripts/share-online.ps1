<#
  AMIR ZAMEER ERP - share the ERP running on this PC through a Cloudflare Tunnel.

  Starts the backend, the frontend and a Cloudflare Tunnel, then prints one public HTTPS link.
  Keep this window open while the client is testing. Press Ctrl+C to stop everything.

  Usage (from the project folder):
    pnpm share                                   Quick Tunnel, free, no account, new link every time
    .\SHARE-ERP-ONLINE.cmd                       Same, by double-click
    powershell -ExecutionPolicy Bypass -File scripts\share-online.ps1 -Dev
                                                 Use the Vite dev server instead of the faster built version
    powershell -ExecutionPolicy Bypass -File scripts\share-online.ps1 -TunnelName amir-erp -Hostname erp.example.com
                                                 Named tunnel on your own domain (fixed link, see docs\SHARE-ONLINE.md)
#>
param(
  [switch]$Dev,
  [switch]$SkipBuild,
  [string]$TunnelName = '',
  [string]$Hostname = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Say([string]$text, [string]$color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail([string]$text) { Say "ERROR: $text" 'Red'; Read-Host 'Press Enter to close'; exit 1 }

function Wait-Url([string]$url, [int]$seconds, [string]$name) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      return $true
    } catch {
      # A 4xx/5xx answer still means the server is up.
      if ($_.Exception.Response) { return $true }
    }
    Start-Sleep -Seconds 2
  }
  Say "$name did not start within $seconds seconds. Check its window for the error." 'Red'
  return $false
}

function Test-PortBusy([int]$port) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

Say ''
Say '=== AMIR ZAMEER ERP - Share online (Cloudflare Tunnel) ===' 'Yellow'
Say ''

# 1. Checks ------------------------------------------------------------------
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) {
  foreach ($p in @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe")) {
    if ($p -and (Test-Path $p)) { $cloudflared = $p; break }
  }
}
if (-not $cloudflared) {
  Fail "cloudflared is not installed. Run this once, then close and reopen PowerShell:`n  winget install --id Cloudflare.cloudflared"
}
if (-not (Test-Path (Join-Path $root 'apps\backend\.env'))) { Fail 'apps\backend\.env is missing. See docs\RUN-ON-WINDOWS.md step 4.' }
if ($TunnelName -and -not $Hostname) { Fail '-TunnelName also needs -Hostname (for example -Hostname erp.example.com).' }
foreach ($port in 4000, 5173) {
  if (Test-PortBusy $port) { Fail "Port $port is already in use. Close the other window running the ERP (pnpm dev:backend / dev:frontend) and try again." }
}

# 2. Build -------------------------------------------------------------------
if (-not $SkipBuild) {
  Say 'Building shared package...' 'Cyan'
  pnpm --filter '@az/shared' build
  if ($LASTEXITCODE -ne 0) { Fail 'Shared package build failed.' }
  if (-not $Dev) {
    Say 'Building frontend (about 1 minute)...' 'Cyan'
    pnpm --filter '@az/frontend' build
    if ($LASTEXITCODE -ne 0) { Fail 'Frontend build failed.' }
  }
}

$procs = @()
try {
  # 3. Backend ---------------------------------------------------------------
  Say 'Starting backend (new window "AZ ERP - Backend")...' 'Cyan'
  $backendCmd = "`$Host.UI.RawUI.WindowTitle = 'AZ ERP - Backend'; `$env:TRUST_PROXY = 'true'; Set-Location '$root'; pnpm dev:backend"
  $procs += Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $backendCmd -PassThru
  if (-not (Wait-Url 'http://127.0.0.1:4000/api/health' 180 'Backend')) { throw 'backend' }

  # 4. Frontend --------------------------------------------------------------
  if ($Dev) { $viteArgs = 'vite --host 127.0.0.1 --port 5173 --strictPort' } else { $viteArgs = 'vite preview --host 127.0.0.1' }
  Say 'Starting frontend (new window "AZ ERP - Frontend")...' 'Cyan'
  $frontendCmd = "`$Host.UI.RawUI.WindowTitle = 'AZ ERP - Frontend'; `$env:ERP_ALLOWED_HOSTS = '$Hostname'; Set-Location '$root'; pnpm --filter '@az/frontend' exec $viteArgs"
  $procs += Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $frontendCmd -PassThru
  if (-not (Wait-Url 'http://127.0.0.1:5173/' 120 'Frontend')) { throw 'frontend' }

  # 5. Tunnel ----------------------------------------------------------------
  $tunnelLog = Join-Path $logDir 'cloudflared.log'
  $tunnelOut = Join-Path $logDir 'cloudflared-out.log'
  Remove-Item $tunnelLog, $tunnelOut -ErrorAction SilentlyContinue
  if ($TunnelName) {
    $tunnelArgs = @('tunnel', '--no-autoupdate', 'run', '--url', 'http://127.0.0.1:5173', $TunnelName)
  } else {
    $tunnelArgs = @('tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:5173')
  }
  Say 'Starting Cloudflare Tunnel...' 'Cyan'
  $tunnel = Start-Process $cloudflared -ArgumentList $tunnelArgs -NoNewWindow -PassThru `
    -RedirectStandardError $tunnelLog -RedirectStandardOutput $tunnelOut
  $procs += $tunnel

  $publicUrl = ''
  if ($TunnelName) {
    $publicUrl = "https://$Hostname"
    Start-Sleep -Seconds 5
  } else {
    $deadline = (Get-Date).AddSeconds(60)
    while (-not $publicUrl -and (Get-Date) -lt $deadline -and -not $tunnel.HasExited) {
      Start-Sleep -Seconds 1
      if (Test-Path $tunnelLog) {
        $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { $publicUrl = $m.Matches[0].Value }
      }
    }
    if (-not $publicUrl) { Say "Could not get the tunnel link. See $tunnelLog" 'Red'; throw 'tunnel' }
  }
  try { Set-Clipboard -Value $publicUrl } catch { }

  Say ''
  Say '==================================================================' 'Green'
  Say '  ERP is online. Send this link to the client:' 'Green'
  Say ''
  Say "     $publicUrl" 'Yellow'
  Say ''
  Say '  (Copied to clipboard. A new Quick Tunnel link can take up to 30 seconds to open.)' 'Green'
  Say '  Keep this window and your PC on. Press Ctrl+C here to stop sharing.' 'Green'
  Say '==================================================================' 'Green'
  Say ''

  while (-not $tunnel.HasExited) { Start-Sleep -Seconds 2 }
  Say "Cloudflare Tunnel stopped. See $tunnelLog" 'Red'
}
catch {
  Say "Sharing could not start ($($_.Exception.Message)). Check the backend/frontend windows or the logs folder." 'Red'
}
finally {
  Say 'Stopping backend, frontend and tunnel...' 'Cyan'
  foreach ($p in $procs) {
    if ($p -and -not $p.HasExited) { cmd.exe /c "taskkill /PID $($p.Id) /T /F >nul 2>&1" }
  }
  Say 'Stopped. The ERP is no longer online.' 'Yellow'
}
