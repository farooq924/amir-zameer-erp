@echo off
REM AMIR ZAMEER ERP - one-time setup: start the ERP automatically with Windows and put it online at your domain.
REM Windows will ask "Allow this app to make changes?" - click Yes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-auto-start.ps1" %*
