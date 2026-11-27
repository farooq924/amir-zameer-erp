@echo off
REM AMIR ZAMEER ERP - double-click to share the ERP online through a Cloudflare Tunnel.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\share-online.ps1" %*
pause
