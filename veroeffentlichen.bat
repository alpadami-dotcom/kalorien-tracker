@echo off
rem Veroeffentlicht den Ordner web/ auf GitHub Pages (Zweig gh-pages).
cd /d "%~dp0"
for /f %%i in ('git subtree split --prefix web main') do set STAND=%%i
git push origin main
git push --force origin %STAND%:refs/heads/gh-pages
echo.
echo Fertig - in 1-2 Minuten ist die neue Version online.
pause
