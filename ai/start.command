#!/bin/bash
# Audiograph AI bridge launcher (double-click in Finder, or run from a terminal).
# Venv lives outside the repo: ~/.audiograph-ai/venv. Extra args pass through, e.g. ./start.command --mock
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$HOME/.audiograph-ai"
VENV="$HOME_DIR/venv"
PY="$VENV/bin/python"
REQ="$HERE/requirements.txt"
STAMP="$HOME_DIR/requirements.stamp"
mkdir -p "$HOME_DIR"

UV="$(command -v uv || true)"
for c in "$HOME/.local/bin/uv" "$HOME/.cargo/bin/uv" /opt/homebrew/bin/uv /usr/local/bin/uv; do
  [ -z "$UV" ] && [ -x "$c" ] && UV="$c"
done

if [ ! -x "$PY" ]; then
  echo "Creating Python environment in $VENV …"
  if [ -n "$UV" ]; then
    "$UV" venv --python 3.12 "$VENV"
  else
    python3 -m venv "$VENV"
  fi
fi

if [ ! -f "$STAMP" ] || ! cmp -s "$REQ" "$STAMP"; then
  echo "Installing requirements (first run downloads PyTorch, a few minutes) …"
  if [ -n "$UV" ]; then
    "$UV" pip install --python "$PY" -r "$REQ"
  else
    "$PY" -m pip install --upgrade pip
    "$PY" -m pip install -r "$REQ"
  fi
  cp "$REQ" "$STAMP"
fi

exec "$PY" "$HERE/bridge.py" "$@"
