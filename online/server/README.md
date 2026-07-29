# Riftbomb authoritative server

This service runs the canonical duel rules from `game/run-champion-bomb-duel.js`
at 60 ticks per second and publishes state at 30 snapshots per second. Browsers
only send input and render/predict their own player; neither browser owns the
match clock, bombs, damage, score, or round transitions.

Production traffic follows this path:

`browser -> wss://bombpvp.com/game-ws -> Cloudflare Worker -> Oracle São Paulo`

The Oracle origin accepts WebSocket upgrades only when the Worker supplies the
shared `x-riftbomb-proxy` secret. `/health` stays available for monitoring.

Run locally with `npm install && npm test`, then `npm start`. Override `PORT`,
`MAX_ROOMS`, and `GAME_SERVER_PROXY_SECRET` through the environment.
