@echo off
title ZapVitrine - Iniciando...
echo.
echo  ⚡ ZapVitrine - Iniciando plataforma...
echo.

echo [1/2] Iniciando servidor backend (porta 3001)...
cd /d "%~dp0server"
start "ZapVitrine API" cmd /c "node src/index.js"

echo [2/2] Iniciando frontend (porta 5173)...
cd /d "%~dp0client"
start "ZapVitrine Frontend" cmd /c "npm run dev"

echo.
echo  ✅ Plataforma iniciada!
echo.
echo  🌐 Frontend:  http://localhost:5173
echo  🔌 API:       http://localhost:3001
echo.
echo  Pressione qualquer tecla para fechar esta janela...
pause >nul
