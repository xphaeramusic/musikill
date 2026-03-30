@echo off
setlocal enabledelayedexpansion
title Musikill — Build de Dependencias

echo.
echo  ============================================
echo    Musikill -- Build de Dependencias
echo  ============================================
echo.

:: Remove trailing backslash do SCRIPT_DIR
set SCRIPT_DIR=%~dp0
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

set PYTHON_VERSION=3.11.10
set PBS_TAG=20241016
set PBS_TRIPLE=x86_64-pc-windows-msvc
set PBS_FILE=cpython-%PYTHON_VERSION%+%PBS_TAG%-%PBS_TRIPLE%-install_only.tar.gz
set PBS_URL=https://github.com/indygreg/python-build-standalone/releases/download/%PBS_TAG%/%PBS_FILE%
set RES_DIR=%SCRIPT_DIR%\resources
set PYTHON_DIR=%RES_DIR%\python
set PYTHON_BIN=%PYTHON_DIR%\python.exe
set PIP_BIN=%PYTHON_DIR%\Scripts\pip.exe

:: ── 1. Baixar Python standalone ──────────────────────────────────────────
echo  [1/4] Baixando Python %PYTHON_VERSION% standalone...
echo        Pode demorar alguns minutos.
echo.

if exist "%PYTHON_DIR%" (
    echo  Removendo Python antigo...
    rmdir /s /q "%PYTHON_DIR%"
)
if not exist "%RES_DIR%" mkdir "%RES_DIR%"

set TMP_TAR=%TEMP%\musikill-python.tar.gz
curl -L --progress-bar "%PBS_URL%" -o "%TMP_TAR%"
if %errorlevel% neq 0 (
    echo  [ERRO] Falha ao baixar Python standalone.
    pause & exit /b 1
)

echo.
echo  Extraindo Python...
tar xzf "%TMP_TAR%" -C "%RES_DIR%"
if %errorlevel% neq 0 (
    echo  [ERRO] Falha ao extrair Python.
    pause & exit /b 1
)
del /q "%TMP_TAR%"

:: python-build-standalone extrai para resources\python\
if not exist "%PYTHON_BIN%" (
    echo  [ERRO] python.exe nao encontrado em %PYTHON_DIR%
    echo  Conteudo de %RES_DIR%:
    dir "%RES_DIR%"
    pause & exit /b 1
)
echo  [OK] Python pronto:
"%PYTHON_BIN%" --version

:: ── 2. Instalar dependências ─────────────────────────────────────────────
echo.
echo  [2/4] Instalando dependencias Python (pode demorar 10-20 min)...

echo  Atualizando pip...
"%PYTHON_BIN%" -m pip install --upgrade pip --quiet
if %errorlevel% neq 0 ( echo [ERRO] pip upgrade & pause & exit /b 1 )

echo  PyTorch CPU (~800 MB)...
"%PYTHON_BIN%" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
if %errorlevel% neq 0 ( echo [ERRO] torch & pause & exit /b 1 )

echo  Demucs...
"%PYTHON_BIN%" -m pip install demucs --quiet
if %errorlevel% neq 0 ( echo [ERRO] demucs & pause & exit /b 1 )

echo  torchcodec...
"%PYTHON_BIN%" -m pip install torchcodec --quiet

echo  certifi...
"%PYTHON_BIN%" -m pip install certifi --quiet

echo  [OK] Dependencias instaladas.

:: ── 3. Baixar modelo Demucs ──────────────────────────────────────────────
echo.
echo  [3/4] Baixando modelo htdemucs (~80 MB)...

if not exist "%RES_DIR%\models" mkdir "%RES_DIR%\models"
set TORCH_HOME=%RES_DIR%\models

"%PYTHON_BIN%" -c "import os,certifi; os.environ['SSL_CERT_FILE']=certifi.where(); os.environ['REQUESTS_CA_BUNDLE']=certifi.where(); from demucs.pretrained import get_model; get_model('htdemucs'); print('[OK] Modelo htdemucs pronto!')"
if %errorlevel% neq 0 (
    echo  [ERRO] Falha ao baixar modelo Demucs.
    pause & exit /b 1
)

:: ── 4. Node deps ─────────────────────────────────────────────────────────
echo.
echo  [4/4] Instalando dependencias Node.js...
npm install
if %errorlevel% neq 0 ( echo [ERRO] npm install & pause & exit /b 1 )

:: ── Concluido ─────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo    Pronto!
echo.
echo    Dev:    npm start
echo    Build:  npm run build:win
echo  ============================================
echo.
pause
