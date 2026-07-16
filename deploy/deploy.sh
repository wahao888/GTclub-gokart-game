#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-ubuntu@3.0.46.141}"
DEPLOY_KEY="${DEPLOY_KEY:-/Users/barrywang/project/good-together-website/goodtogether-website-20260413.pem}"
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}"
REMOTE_ROOT="/var/www/formula-kart"
REMOTE_RELEASE="$REMOTE_ROOT/releases/$RELEASE_ID"

cd "$ROOT_DIR"
npm run build

ssh -i "$DEPLOY_KEY" "$DEPLOY_HOST" "sudo mkdir -p '$REMOTE_RELEASE/web' '$REMOTE_RELEASE/server' '$REMOTE_ROOT/shared' /var/log/formula-kart
sudo chown -R ubuntu:ubuntu '$REMOTE_ROOT' /var/log/formula-kart"

rsync -a --delete -e "ssh -i $DEPLOY_KEY" apps/web/dist/ "$DEPLOY_HOST:$REMOTE_RELEASE/web/"
rsync -a --delete -e "ssh -i $DEPLOY_KEY" apps/server/dist/ "$DEPLOY_HOST:$REMOTE_RELEASE/server/"
rsync -a -e "ssh -i $DEPLOY_KEY" \
  deploy/ecosystem.config.cjs \
  deploy/cloudwatch-alarms.sh \
  deploy/nginx-kart-http.conf \
  deploy/nginx-kart-https.conf \
  "$DEPLOY_HOST:$REMOTE_ROOT/shared/"

ssh -i "$DEPLOY_KEY" "$DEPLOY_HOST" "ln -sfn '$REMOTE_RELEASE' '$REMOTE_ROOT/current'
cd '$REMOTE_ROOT'
pm2 startOrReload '$REMOTE_ROOT/shared/ecosystem.config.cjs' --update-env
pm2 save
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error http://127.0.0.1:8080/healthz; then
    exit 0
  fi
  sleep 1
done
exit 1"

echo
echo "Formula Kart release $RELEASE_ID deployed to $DEPLOY_HOST"
