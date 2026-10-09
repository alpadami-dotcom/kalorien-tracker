@echo off
cd /d "%~dp0"
echo Schluessel aus der Anthropic-Konsole einfuegen (Rechtsklick fuegt ein), dann Enter:
set /p KEY=
>.env echo ANTHROPIC_API_KEY=%KEY%
echo.
echo Gespeichert: %cd%\.env
pause
