@echo off
setlocal
cd /d "%~dp0..\agent"
echo Alamida muss offen sein (Tab Termine) fuer Live-Sync.
dotnet run --project Alamida.Monitoring.Agent -c Release -- --sync
pause
