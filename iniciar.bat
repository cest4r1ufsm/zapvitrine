@echo off
title Pedido Pronto Bot - Iniciando...
echo.
echo  ⚡ Pedido Pronto Bot - Iniciando plataforma...
echo.

echo [1/2] Iniciando servidor backend (porta 3001)...
cd /d "%~dp0server"
start "Pedido Pronto Bot API" cmd /c "node src/index.js"

echo [2/2] Iniciando frontend (porta 5007)...
cd /d "%~dp0client"
start "Pedido Pronto Bot Frontend" cmd /c "npm run dev"

echo.
echo  ✅ Plataforma iniciada!
echo.
echo  🌐 Frontend:  http://localhost:5007
echo  🔌 API:       http://localhost:3001
echo.
echo  Pressione qualquer tecla para fechar esta janela...
pause >nul
