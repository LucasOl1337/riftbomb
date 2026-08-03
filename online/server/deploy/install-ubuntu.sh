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
systemctl restart riftbomb-game.service

# INSTALL_VM_HEALTH_GATE_V1 — fail closed if /health version drifts from package.json
expected_version="$(node --input-type=module -e 'import { readFileSync } from "node:fs"; const v = JSON.parse(readFileSync("/opt/riftbomb/online/server/package.json", "utf8")).version; if (typeof v !== "string" || !v.trim()) process.exit(2); process.stdout.write(v.trim());')"
health_body=""
for _ in $(seq 1 30); do
  health_body="$(curl -fsS http://127.0.0.1:8788/health 2>/dev/null || true)"
  if [[ -n "$health_body" ]]; then
    break
  fi
  sleep 1
done
if [[ -z "$health_body" ]]; then
  echo "Install health gate failed: /health did not respond on 127.0.0.1:8788" >&2
  exit 1
fi
node --input-type=module -e '
const expected = process.argv[1];
const body = process.argv[2];
let health;
try { health = JSON.parse(body); } catch {
  console.error("Install health gate failed: /health is not JSON");
  process.exit(1);
}
if (health.ok !== true) {
  console.error("Install health gate failed: ok!=true");
  process.exit(1);
}
if (health.service !== "riftbomb-authoritative") {
  console.error(`Install health gate failed: service=${health.service}`);
  process.exit(1);
}
if (health.version !== expected) {
  console.error(`Install health gate failed: version=${health.version} expected=${expected}`);
  process.exit(1);
}
console.log(`HEALTH_VERSION=${health.version}`);
' "$expected_version" "$health_body"

echo "Install complete. Set GAME_SERVER_PROXY_SECRET in /etc/riftbomb-game.env and expose the WebSocket path through the local reverse proxy."
