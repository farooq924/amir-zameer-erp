@echo off
REM AMIR ZAMEER ERP - after pasting an update zip, double-click this to rebuild and restart the ERP.
REM Windows will ask "Allow this app to make changes?" - click Yes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-erp.ps1"
