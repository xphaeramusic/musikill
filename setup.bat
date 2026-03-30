@echo off
setlocal enabledelayedexpansion
title Musikill — Build de Dependencias

echo.
echo  ============================================
echo    Musikill -- Build de Dependencias
echo  ============================================
echo.

set SCRIPT_DIR=%~dp0
set PYTHON_VERSION=3.11.10
set PBS_TAG=20241016
set PBS_TRIPLE=x86_64-pc-windows-msvc
set PBS_FILE=cpython-%PYTHON_VERSION%+%PBS_TAG%-%PBS_TRIPLE%-install_only.tar.gz
set PBS_URL=https://github.com/indygreg/python-build-standalone/releases/download/%PBS_TAG%/%PBS_FILE%
set PYTHON_DIR=%SCRIPT_DIR%resources\python
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
if not exist "%SCRIPT_DIR%resources" mkdir "%SCRIPT_DIR%resources"

set TMP_TAR=%TEMP%\musikill-python.tar.gz
curl -L --progress-bar "%PBS_URL%" -o "%TMP_TAR%"
if %errorlevel% neq 0 (
    echo  [ERRO] Falha ao baixar Python standalone.
    pause & exit /b 1
)

echo.
echo  Extraindo Python...
tar xzf "%TMP_TAR%" -C "%SCRIPT_DIR%resources\"
del /q "%TMP_TAR%"
echo  [OK] Python pronto.

:: ── 2. Instalar dependências ─────────────────────────────────────────────
echo.
echo  [2/4] Instalando dependencias Python (pode demorar 10-20 min)...

"%PIP_BIN%" install --upgrade pip --quiet
if %errorlevel% neq 0 ( echo [ERRO] pip & pause & exit /b 1 )

echo  PyTorch CPU (~800 MB)...
"%PIP_BIN%" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
if %errorlevel% neq 0 ( echo [ERRO] torch & pause & exit /b 1 )

echo  Demucs...
"%PIP_BIN%" install demucs --quiet
if %errorlevel% neq 0 ( echo [ERRO] demucs & pause & exit /b 1 )

echo  torchcodec...
"%PIP_BIN%" install torchcodec --quiet

echo  certifi...
"%PIP_BIN%" install certifi --quiet

echo  [OK] Dependencias instaladas.

:: ── 3. Baixar modelo Demucs ──────────────────────────────────────────────
echo.
echo  [3/4] Baixando modelo htdemucs (~80 MB)...

if not exist "%SCRIPT_DIR%resources\models" mkdir "%SCRIPT_DIR%resources\models"
set TORCH_HOME=%SCRIPT_DIR%resources\models

"%PYTHON_BIN%" -c "import os,certifi; os.environ['SSL_CERT_FILE']=certifi.where(); os.environ['REQUESTS_CA_BUNDLE']=certifi.where(); from demucs.pretrained import get_model; get_model('htdemucs'); print('[OK] Modelo htdemucs pronto!')"
if %errorlevel% neq 0 (
    echo  [ERRO] Falha ao baixar modelo Demucs.
    pause & exit /b 1
)

:: ── 4. Node deps ─────────────────────────────────────────────────────────
echo.
echo  [4/4] Instalando dependencias Node.js...
npm install --quiet
if %errorlevel% neq 0 ( echo [ERRO] npm install & pause & exit /b 1 )

:: ── Concluído ─────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo    Pronto para build!
echo.
echo    Dev:    npm start
echo    Build:  npm run build:win
echo  ============================================
echo.
pause
