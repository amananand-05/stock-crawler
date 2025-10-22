@echo off
REM -----------------------------------------
REM Script: update-and-start.bat
REM Description: Pull latest changes and start Node.js app
REM -----------------------------------------

REM Navigate to project directory
cd /d "C:\path\to\your\project"

REM Print status
echo.
echo === Pulling latest code from Git ===
git pull

REM Check if git pull succeeded
if %errorlevel% neq 0 (
    echo Git pull failed. Exiting...
    pause
    exit /b %errorlevel%
)

REM Print status
echo.
echo === Installing dependencies (if needed) ===
npm install

REM Start the app
echo.
echo === Starting application ===
npm start

REM Keep window open
pause
