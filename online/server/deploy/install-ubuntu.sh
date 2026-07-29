#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:-/tmp/riftbomb-release}"
if [[ ! -f "$release_dir/online/server/package-lock.json" ]]; then
  echo "Missing Riftbomb server release at $release_dir" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(`.`)[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id -u riftbomb >/dev/null 2>&1 || useradd --system --home /opt/riftbomb --shell /usr/sbin/nologin riftbomb
install -d -o riftbomb -g riftbomb /opt/riftbomb
install -d /opt/riftbomb/game /opt/riftbomb/online/server
cp -a "$release_dir/game/." /opt/riftbomb/game/
cp -a "$release_dir/online/server/." /opt/riftbomb/online/server/
chown -R riftbomb:riftbomb /opt/riftbomb
npm --prefix /opt/riftbomb/online/server ci --omit=dev --ignore-scripts

install -m 0644 "$release_dir/online/server/deploy/riftbomb-game.service" \
  /etc/systemd/system/riftbomb-game.service
touch /etc/riftbomb-game.env
chmod 0600 /etc/riftbomb-game.env

systemctl daemon-reload
systemctl enable riftbomb-game.service

echo "Install complete. Set GAME_SERVER_PROXY_SECRET in /etc/riftbomb-game.env, expose the WebSocket path through the local reverse proxy, then start the service."
