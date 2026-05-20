#!/usr/bin/env bash
# Sobe backend (Flask) + frontend (Vite) juntos. Ctrl+C encerra os dois.

set -e
cd "$(dirname "$(readlink -f "$0")")"

# Carrega nvm se existir (necessário quando rodando via .desktop / GUI)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi
# Fallback: adiciona o node mais recente do nvm ao PATH manualmente
if ! command -v npm >/dev/null && [ -d "$NVM_DIR/versions/node" ]; then
  NODE_BIN="$(ls -d "$NVM_DIR"/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi

if ! command -v npm >/dev/null; then
  echo "❌ npm não encontrado. Instale Node.js ou configure nvm."
  exit 1
fi

# ---- Verificações ----
if [ ! -d .venv ]; then
  echo "❌ Falta o venv. Rode: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo "❌ Falta node_modules. Rode: cd frontend && npm install"
  exit 1
fi

LOG_DIR="${TMPDIR:-/tmp}/audiobook-gen"
mkdir -p "$LOG_DIR"
BACK_LOG="$LOG_DIR/backend.log"
FRONT_LOG="$LOG_DIR/frontend.log"

# ---- Cleanup ----
cleanup() {
  echo ""
  echo "🛑 Encerrando..."
  # Mata todo o grupo de processos pra capturar filhos do npm/vite/flask
  if [ -n "${BACK_PID:-}" ];  then kill -- -$BACK_PID  2>/dev/null || kill $BACK_PID  2>/dev/null || true; fi
  if [ -n "${FRONT_PID:-}" ]; then kill -- -$FRONT_PID 2>/dev/null || kill $FRONT_PID 2>/dev/null || true; fi
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# ---- Backend ----
echo "🐍 Iniciando Flask (logs: $BACK_LOG)..."
(
  source .venv/bin/activate
  exec python app.py
) > "$BACK_LOG" 2>&1 &
BACK_PID=$!

# ---- Frontend ----
echo "⚡ Iniciando Vite (logs: $FRONT_LOG)..."
(
  cd frontend
  exec npm run dev
) > "$FRONT_LOG" 2>&1 &
FRONT_PID=$!

# ---- Aguarda o Vite estar pronto e abre o navegador ----
echo "⏳ Aguardando frontend..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:5173 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if command -v xdg-open >/dev/null; then
  xdg-open http://localhost:5173 >/dev/null 2>&1 &
fi

echo ""
echo "════════════════════════════════════════════"
echo "  📖 Audiobook Generator rodando!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:5000"
echo "  Logs ao vivo abaixo. Ctrl+C encerra tudo."
echo "════════════════════════════════════════════"
echo ""

# ---- Tail dos logs até alguém morrer ou Ctrl+C ----
tail -f "$BACK_LOG" "$FRONT_LOG" &
TAIL_PID=$!

# Se qualquer um dos servers morrer, encerra
wait -n $BACK_PID $FRONT_PID 2>/dev/null || true
echo "⚠️  Um dos servers caiu — encerrando o outro."
kill $TAIL_PID 2>/dev/null || true
cleanup
