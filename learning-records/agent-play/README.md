# Agent play sessions (local Training)

Structured match telemetry for an agent playing Training at the local Vite shell. Not a second War Table. Not published to bombpvp.com.

## Start recording

```bash
npm run dev
```

Open [http://127.0.0.1:4174/](http://127.0.0.1:4174/), choose **Training**, start the match. The iframe at `/riftbomb.html` is the same game as always.

Recording is automatic on `127.0.0.1` / `localhost` while that dev server is up. Production (`bombpvp.com`) does not write sessions.

## Where the file is

| Path | What |
|------|------|
| `learning-records/agent-play/current.json` | Pointer to the active session |
| `learning-records/agent-play/ap-<utc>-<id>.jsonl` | One JSON object per line |
| `learning-records/agent-play/sample-session.jsonl` | Checked-in fixture of the schema |

Same data over HTTP on the Vite origin:

```bash
curl -s http://127.0.0.1:4174/__agent-play/status
curl -s http://127.0.0.1:4174/__agent-play/sessions/current
```

`Read` the JSONL on disk, or `GET` those URLs. Do not scrape screenshots into this folder.

## Write a note (feel / unfair / death / hypothesis)

Mid-session or after the match:

```bash
npm run note:agent-play -- --text "Death after crate starve; Dominus felt unanswerable" --kind feel
npm run note:agent-play -- --text "Arrow/Enter flipped P2 to human" --kind unfair
npm run note:agent-play -- --kind hypothesis --text "Need more bombs before all-in" --hypothesis "crate pathing is the bottleneck"
```

Or:

```bash
curl -s -X POST http://127.0.0.1:4174/__agent-play/notes \
  -H 'content-type: application/json' \
  -d '{"text":"Round 2 death was my bomb","kind":"death_reason"}'
```

`kind`: `feel` · `unfair` · `death_reason` · `hypothesis` · `retest`

The CLI posts to the local URL first; if `npm run dev` is down it appends to the latest JSONL on disk.

## What is recorded

Events, not frames: session start, champion / map / Training bot, round start/end, score, HP, bomb plant, death (who + cause when the match already knows), skill unlock / lock / cast, P2 `CPU controls Red` vs human handoff, 1 Hz heartbeat (crates + clock + score).

Arrow or Enter flipping Red to human emits `p2_control` with `hud: "Player 2 online/local"`.

## Do not

- Start Playwright or `headless_shell`
- Treat this as a second frontend URL
- Deploy this sink to bombpvp.com
