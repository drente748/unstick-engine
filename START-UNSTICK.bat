@echo off
title Unstick — task initiation companion
cd /d "%~dp0"

echo.
echo  ============================================
echo    Unstick - can't start? make it tiny.
echo  ============================================
echo.

REM first run: install dependencies automatically
if not exist "node_modules\" (
  echo  First run detected - installing dependencies...
  echo  ^(one time only, takes about a minute^)
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  [X] npm install failed. Is Node.js installed? Get it from https://nodejs.org
    pause
    exit /b 1
  )
)

echo  Starting Unstick...
echo.
start "" http://localhost:3000
call npm run dev
