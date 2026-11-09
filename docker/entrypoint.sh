#!/usr/bin/env bash
# PI Studio container entrypoint (STUDIO.md §7.2). Idempotent: every step can
# run at each start, on an empty or an existing volume.
#
#   1. Pi's agent folder and the packs folder exist.
#   2. The packs folder is trusted in $PI_CODING_AGENT_DIR/trust.json.
#   3. The packs folder is a Git repository Git accepts (safe.directory),
#      with a minimal .gitignore in its first version.
#   4. The server starts on 0.0.0.0:${PORT:-30141}, no browser opened.
#      Arguments, if any, run instead (docker compose run … bash).
#
# pi-mcp-adapter is not installed: the Studio uses Pi's built-in MCP
# (.pi/mcp.json), see STUDIO.md §1 and §7.2.
set -euo pipefail

APP_DIR="${STUDIO_APP_DIR:-/opt/pi-studio}"
PACKS_DIR="${STUDIO_PACKS_DIR:-/workspace/packs}"
export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
export STUDIO_PACKS_DIR="$PACKS_DIR"

log() { printf '[entrypoint] %s\n' "$*"; }

# 1. Folders (volumes may be mounted empty).
mkdir -p "$PI_CODING_AGENT_DIR" "$PACKS_DIR"
PACKS_REAL="$(cd "$PACKS_DIR" && pwd -P)"

# 2. Project trust, through Pi's own trust store.
node "$APP_DIR/lib/studio/trust-packs.mjs"

# 3. Git: accept a volume owned by another user, then make it a repository.
if ! git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "$PACKS_REAL"; then
  git config --global --add safe.directory "$PACKS_REAL"
  log "safe.directory: $PACKS_REAL"
fi

if [ "$(git -C "$PACKS_REAL" rev-parse --show-toplevel 2>/dev/null || true)" != "$PACKS_REAL" ]; then
  git init -q "$PACKS_REAL"
  log "packs repository created in $PACKS_REAL"
fi

if ! git -C "$PACKS_REAL" rev-parse --verify -q HEAD >/dev/null; then
  if [ ! -e "$PACKS_REAL/.gitignore" ]; then
    # Same content as DEFAULT_GITIGNORE in lib/studio/git.ts.
    printf '%s\n' '# Créé par PI Studio' '.DS_Store' '*.log' 'node_modules/' '.pi/mcp-traces/' > "$PACKS_REAL/.gitignore"
  fi
  git -C "$PACKS_REAL" add -- .gitignore
  git -C "$PACKS_REAL" -c user.name="PI Studio" -c user.email="studio@studio.invalid" \
    commit -q --no-verify -m "Initialise le dépôt des packs" -- .gitignore
  log "first version of the packs repository recorded"
fi

# 4. The server, or the given command.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
log "starting PI Studio on 0.0.0.0:${PORT:-30141}"
exec node "$APP_DIR/bin/pi-web.js" --hostname 0.0.0.0 --port "${PORT:-30141}" --no-open
