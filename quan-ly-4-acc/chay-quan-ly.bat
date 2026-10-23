@echo off
rem Chay may chu cuc bo (can Node.js 18.11 tro len) roi mo trang quan ly 4 cua so trong trinh duyet.
rem Dung "node --watch": sua server.js thi may chu tu khoi dong lai, khong can tat mo lai.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Cai tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
rem Lay ban moi tu GitHub (neu la ban clone va co git). Loi thi bo qua, van chay ban hien co.
where git >nul 2>nul && git -C .. rev-parse --is-inside-work-tree >nul 2>nul && (
  echo Dang kiem tra ban moi tren GitHub...
  set GIT_TERMINAL_PROMPT=0
  git -C .. pull --ff-only --quiet || echo Khong cap nhat duoc, chay ban hien co.
)
start "" http://127.0.0.1:8800/
echo Dang chay. Dong cua so nay de tat may chu (4 khung game se mat ket noi).
node --watch server.js
pause
