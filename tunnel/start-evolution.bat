@echo off
title Afiliado Auto - Evolution API (Baileys)
echo ========================================================
echo   Afiliado Auto - Evolution API WhatsApp Service
echo ========================================================
echo.

set PORT=8080
set AUTHENTICATION_API_KEY=afiliado-auto-secret-key-2026

echo Iniciando Evolution API na porta %PORT%...
cd /d "%~dp0..\whatsapp-worker"
node src\index.js

pause
