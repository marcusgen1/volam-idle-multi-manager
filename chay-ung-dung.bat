@echo off
rem Mo ung dung Vo Lam Manager (Electron) tren Windows. Can Node.js 18.11+ va mang o lan dau.
cd /d "%~dp0"
if not exist node_modules\electron call npm install --no-audit --no-fund
if not exist node_modules\electron\dist node node_modules\electron\install.js
set ELECTRON_RUN_AS_NODE=
call node_modules\.bin\electron.cmd .
