#!/bin/bash
# =============================================================================
# Prime Home Devis — Script de déploiement production
# Usage :
#   ./deploy.sh backend    → rebuild + push Backend uniquement
#   ./deploy.sh frontend   → rebuild + push Frontend uniquement
#   ./deploy.sh all        → rebuild + push Backend + Frontend
# =============================================================================

set -euo pipefail

REGISTRY="ghcr.io/yassirskalli"
BACKEND_IMAGE="$REGISTRY/primehome-devis-backend"
FRONTEND_IMAGE="$REGISTRY/primehome-devis-frontend"
COMPOSE_FILE="docker-compose.prod.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}   $1"; }
fail() { echo -e "${RED}[error]${NC}  $1"; exit 1; }

# ── Vérifications ─────────────────────────────────────────────────────────────

[ -f ".env" ]              || fail ".env introuvable — copier .env.example et renseigner les valeurs"
[ -f "$COMPOSE_FILE" ]     || fail "$COMPOSE_FILE introuvable"
command -v docker &>/dev/null || fail "Docker non installé"

TARGET="${1:-all}"
[[ "$TARGET" =~ ^(backend|frontend|all)$ ]] || fail "Usage: ./deploy.sh [backend|frontend|all]"

# ── Commit automatique si des changements non commités existent ───────────────

if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "Changements non commités détectés."
    read -rp "Message de commit (entrée = 'fix: patch prod'): " MSG
    MSG="${MSG:-fix: patch prod}"
    git add -A
    git commit -m "$MSG"
    log "Commit créé : $MSG"
fi

GIT_SHA=$(git rev-parse --short HEAD)
log "SHA commit : $GIT_SHA"

# ── Push git ──────────────────────────────────────────────────────────────────

log "Push git..."
git push origin main

# ── Build + Push images ───────────────────────────────────────────────────────

build_push_backend() {
    log "Build Backend..."
    docker build -t "$BACKEND_IMAGE:latest" -t "$BACKEND_IMAGE:$GIT_SHA" ./backend
    log "Push Backend → ghcr.io..."
    docker push "$BACKEND_IMAGE:latest"
    docker push "$BACKEND_IMAGE:$GIT_SHA"
}

build_push_frontend() {
    log "Build Frontend..."
    docker build -t "$FRONTEND_IMAGE:latest" -t "$FRONTEND_IMAGE:$GIT_SHA" ./frontend
    log "Push Frontend → ghcr.io..."
    docker push "$FRONTEND_IMAGE:latest"
    docker push "$FRONTEND_IMAGE:$GIT_SHA"
}

case "$TARGET" in
    backend)  build_push_backend ;;
    frontend) build_push_frontend ;;
    all)      build_push_backend; build_push_frontend ;;
esac

# ── Redémarrage des conteneurs ────────────────────────────────────────────────

log "Redémarrage des services..."
case "$TARGET" in
    backend)  docker compose -f "$COMPOSE_FILE" pull devis_backend && \
              docker compose -f "$COMPOSE_FILE" up -d --no-deps devis_backend ;;
    frontend) docker compose -f "$COMPOSE_FILE" pull devis_frontend && \
              docker compose -f "$COMPOSE_FILE" up -d --no-deps devis_frontend ;;
    all)      docker compose -f "$COMPOSE_FILE" pull && \
              docker compose -f "$COMPOSE_FILE" up -d ;;
esac

log "✅ Déploiement Devis terminé — sha: $GIT_SHA"
echo ""
echo "  Images publiées :"
[ "$TARGET" != "frontend" ] && echo "    $BACKEND_IMAGE:$GIT_SHA"
[ "$TARGET" != "backend"  ] && echo "    $FRONTEND_IMAGE:$GIT_SHA"
