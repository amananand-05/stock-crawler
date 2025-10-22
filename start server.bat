@echo off
call git pull
call npm install --no-audit --no-fund
call npm start
pause
