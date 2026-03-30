#!/bin/bash
# ─── Musikill — Setup (macOS) ──────────────────────────────────────────────
# Baixa um Python standalone (sem depender do Python do sistema),
# instala todas as dependências Python nele e baixa o modelo Demucs.
# O resultado fica em resources/python/ — totalmente encapsulado.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Musikill — Build de Dependências       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Detectar arquitetura ───────────────────────────────────────────────────
ARCH=$(uname -m)   # arm64 ou x86_64
PYTHON_VERSION="3.11.10"
PBS_TAG="20241016"

if [ "$ARCH" = "arm64" ]; then
    PBS_TRIPLE="aarch64-apple-darwin"
else
    PBS_TRIPLE="x86_64-apple-darwin"
fi

PBS_FILE="cpython-${PYTHON_VERSION}+${PBS_TAG}-${PBS_TRIPLE}-install_only.tar.gz"
PBS_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PBS_TAG}/${PBS_FILE}"

PYTHON_DIR="$SCRIPT_DIR/resources/python"
PYTHON_BIN="$PYTHON_DIR/bin/python3"
PIP_BIN="$PYTHON_DIR/bin/pip3"

# ── 1. Baixar Python standalone ────────────────────────────────────────────
echo "📥  Baixando Python ${PYTHON_VERSION} standalone (${ARCH})..."
echo "    Isso pode levar alguns minutos na primeira vez."
echo ""

TMP_TAR=$(mktemp /tmp/musikill-python.XXXXXX.tar.gz)
curl -L --progress-bar "$PBS_URL" -o "$TMP_TAR"

echo ""
echo "📦  Extraindo Python em resources/python/..."
rm -rf "$PYTHON_DIR"
mkdir -p "$SCRIPT_DIR/resources"
tar xzf "$TMP_TAR" -C "$SCRIPT_DIR/resources/"
# python-build-standalone extrai como "python/"
mv "$SCRIPT_DIR/resources/python" "$PYTHON_DIR" 2>/dev/null || true
rm -f "$TMP_TAR"

chmod -R 755 "$PYTHON_DIR/bin/"
echo "✅  Python standalone pronto: $("$PYTHON_BIN" --version)"

# ── 2. Instalar dependências Python ───────────────────────────────────────
echo ""
echo "📦  Instalando PyTorch CPU (~800 MB — aguarde)..."
"$PIP_BIN" install --upgrade pip --quiet
"$PIP_BIN" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet

echo "📦  Instalando Demucs..."
"$PIP_BIN" install demucs --quiet

echo "📦  Instalando torchcodec..."
"$PIP_BIN" install torchcodec --quiet || echo "    (torchcodec indisponível nesta plataforma — ignorado)"

echo "📦  Instalando certifi..."
"$PIP_BIN" install certifi --quiet

# ── 3. Baixar modelo htdemucs ─────────────────────────────────────────────
echo ""
echo "📥  Baixando modelo htdemucs (~80 MB)..."
mkdir -p "$SCRIPT_DIR/resources/models"

CERT_FILE=$("$PYTHON_BIN" -c "import certifi; print(certifi.where())")
TORCH_HOME="$SCRIPT_DIR/resources/models" \
SSL_CERT_FILE="$CERT_FILE" \
REQUESTS_CA_BUNDLE="$CERT_FILE" \
"$PYTHON_BIN" - <<'PYEOF'
import os, certifi
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
from demucs.pretrained import get_model
get_model('htdemucs')
print("✅  Modelo htdemucs pronto!")
PYEOF

# ── 4. Node dependencies + copiar ffmpeg ─────────────────────────────────
echo ""
echo "📦  Instalando dependências Node.js..."
npm install --quiet

echo "📦  Copiando ffmpeg e ffprobe para resources/..."
node -e "
const fs = require('fs');
fs.copyFileSync(require('ffmpeg-static'), 'resources/ffmpeg');
fs.copyFileSync(require('@ffprobe-installer/ffprobe').path, 'resources/ffprobe');
fs.chmodSync('resources/ffmpeg', 0o755);
fs.chmodSync('resources/ffprobe', 0o755);
console.log('ffmpeg e ffprobe copiados.');
"

# ── Concluído ─────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅  Pronto para build!                  ║"
echo "║                                          ║"
echo "║  Dev:    npm start                       ║"
echo "║  Build:  npm run build:mac               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
