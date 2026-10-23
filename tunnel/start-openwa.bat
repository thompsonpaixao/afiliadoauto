@echo off
title Afiliado Auto - OpenWA + Cloudflare Tunnel
echo ========================================================
echo   Afiliado Auto - Iniciar Servico OpenWA + Tunnel
echo ========================================================
echo.

set OPENWA_PORT=8080
set OPENWA_SESSION=afiliado-auto
set OPENWA_KEY=OpeNwA

echo [1/2] Iniciando OpenWA Easy API HTTP na porta %OPENWA_PORT%...
start "OpenWA Service" cmd /k "npx @open-wa/wa-automate@latest --session-id %OPENWA_SESSION% --host 127.0.0.1 --port %OPENWA_PORT% --api-key %OPENWA_KEY%"

timeout /t 5 /nobreak >nul

echo [2/2] Para iniciar o Cloudflare Tunnel (cloudflared):
echo Execute:
echo   cloudflared tunnel run wa-tunnel
echo Ou para teste rapido sem dominio proprio:
echo   cloudflared tunnel --url http://127.0.0.1:%OPENWA_PORT%
echo.
echo ========================================================
pause
