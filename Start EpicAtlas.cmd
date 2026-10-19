@echo off
setlocal
title EpicAtlas - close to stop
cd /d "%~dp0"
if errorlevel 1 goto folder_error

where node.exe >nul 2>&1
if errorlevel 1 goto node_missing
if not exist "node_modules\vite\bin\vite.js" goto dependencies_missing
if not exist "node_modules\maplibre-gl\package.json" goto dependencies_missing

echo Starting EpicAtlas at http://127.0.0.1:5173/
echo Keep this window open while using the atlas. Close it to stop.
echo.
node.exe "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5173 --strictPort --open
if errorlevel 1 goto startup_error
exit /b 0

:node_missing
echo EpicAtlas needs Node.js installed on this computer.
echo Install Node.js 20.19+ or 22.12+ from https://nodejs.org/
echo Then reopen this launcher.
goto failed

:dependencies_missing
echo EpicAtlas's project dependencies are missing.
echo Open a terminal in this project folder and run: npm ci
echo Then reopen this launcher. Nothing has been installed automatically.
goto failed

:startup_error
echo.
echo EpicAtlas could not start. See the error above.
echo If port 5173 is already in use, an atlas may already be running:
echo http://127.0.0.1:5173/
echo Use that browser address if it is your atlas, or close the other
echo server window and reopen this launcher.
echo For dependency errors, run npm ci in the project folder.
goto failed

:folder_error
echo Could not open the EpicAtlas project folder.
echo Check that the project still exists at the shortcut's target.

:failed
echo.
pause
exit /b 1
