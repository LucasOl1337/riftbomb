# Riftbomb Combat System

## Purpose

Riftbomb uses an explicit **0–100 HP scale** for every playable champion. The rules in this document are the canonical reference for gameplay, UI and future balance changes.

## Core rules

- Every champion starts each round with **100 / 100 HP**.
- A contestant is eliminated when HP reaches **0**.
- Arena bombs deal **35 damage** instead of causing an unconditional instant kill.
- A full-health contestant therefore survives two arena-bomb hits and is eliminated by the third unless healed or protected.
- Spawn protection remains **1.25 seconds**.
- Dash and champion-specific invulnerability windows continue to prevent damage while active.
- Shield pickups remain discrete spell-shield charges. One charge blocks one complete bomb or ability hit, then grants the existing short post-block invulnerability window.

## Damage conversion

The original prototype represented full health as `1` and encoded damage as fractions such as `0.28`. The compatibility layer converts legacy values to the readable 100-point scale at the combat boundary:

```text
0.28 legacy damage -> 28 HP damage
0.14 legacy healing -> 14 HP healing
```

New combat code should use integer HP values directly, including `1` for one HP.
Only non-integer values between `-1` and `1` are interpreted as legacy
fractions. The compatibility conversion exists so the current champion
implementations can be migrated incrementally without changing their effective
balance.

## Current reference values

| Source | Damage / effect |
| --- | ---: |
| Arena bomb | 35 damage |
| Katarina Shunpo | 18 damage |
| Katarina Voracity | 40 damage |
| Zed Shadow Slash | 28 damage |
| Renekton Cull the Meek | 24 damage |
| Renekton empowered Cull the Meek | 36 damage |
| Renekton Ruthless Predator | 27 damage |
| Renekton empowered Ruthless Predator | 39 damage |
| Vladimir Transfusion | 22 damage |
| Vladimir empowered Transfusion | 34 damage |
| Gangplank Parrrley | 22 damage |
| Gangplank Powder Keg | 30 damage plus chain bonus |

Multi-hit abilities keep their existing tick timing and convert each legacy tick to HP points. Death Mark keeps its existing stored-damage logic and caps its detonation at the equivalent of 62 damage.

## Health costs and healing

Vladimir's direct health costs are also expressed on the 100-point scale:

- Sanguine Pool costs up to **8 HP**, respecting its percentage-based limit.
- Tides of Blood costs up to **6.5 HP**, respecting its percentage-based limit.

Health costs are applied before the rest of a cast resolves, never raise current
HP and preserve healing earned by the cast. Healing values are converted at the
same boundary as damage. Healing never raises HP above the contestant's maximum
health.

## Player-facing clarity

The combat layer adds an exact health readout for both contestants:

```text
P1 KATARINA  72 / 100 HP
P2 ZED       41 / 100 HP
```

The existing bar and heart presentation remains as a quick visual indicator, while the exact value is the authoritative information. Damage announcements report remaining HP as a number instead of an opaque percentage derived from fractional health.

The champion-selection screen also presents the four governing rules: 100 HP per player, 35 arena-bomb damage, elimination at 0 HP and one complete blocked hit per shield charge.

## Architecture

The pure compatibility rules live in:

- `game/apply-combat-rules.js`

That module has no DOM, renderer or audio dependency. Both the browser match and
`game/create-authoritative-duel.mjs` install it before a round starts, so local
and online play share the same health, damage, healing and shield semantics.

The browser-only HUD and rule-card presentation live in:

- `game/apply-readable-combat.js`

Both files are loaded before the game runtime. The presentation adapter installs
the pure rules immediately after the browser `Game` instance is created and
before the first rendered frame.

The layer wraps these runtime boundaries:

- `Game.createPlayer`
- `Game.hitSkill`
- `Game.hitContestant`
- `Game.healChampion`
- Vladimir health-cost casts
- `BrowserMatchPresentation.update`

The canonical constants are exposed as `globalThis.RIFTBOMB_COMBAT`. Future champion work should use integer HP values and read shared rules from that object rather than adding new fractional combat semantics.

## Ability command buffer

Q/W/E/R share one postponed-spell contract in `Game.castAbility`:

- a valid spell pressed during the final **150 ms** of cooldown, stun or
  Sanguine Pool is retained until the first legal simulation tick;
- one command is retained per player and the most recent valid command replaces
  the previous one;
- commands expire from simulation time, never wall-clock time;
- invalid slots, locked skills and target/range/placement failures are not
  retried; spatial eligibility is captured when the input arrives, so a
  command cannot acquire a target, free landing or deployable capacity later;
- a command is executed at most once and is discarded on death, round reset,
  unexpected crowd control or expiry;
- Zed W and Renekton E recasts keep their authored recast windows, while
  Gangplank W remains available as a stun cleanse;
- the online client predicts only casts that are already legal. Postponed casts
  remain server-owned and arrive through the authoritative snapshot.

Death Lotus is an interruptible channel. A movement direction, crowd control,
death or another legal ability cancels it before the next damage tick and
removes its active Lotus VFX. Arena bombs remain immediate and outside the
ability buffer in this iteration.

## Balance policy

- Ordinary abilities should not eliminate a full-health contestant in one hit.
- Easy or repeatable attacks should generally deal **15–30 damage**.
- Empowered or difficult attacks should generally deal **30–40 damage**.
- A complete ultimate may deal approximately **45–65 damage**, including multi-hit totals.
- A strong, difficult combo may deal **70–90 damage**, leaving room for reaction or counterplay.
- Instant elimination should be reserved for an explicitly designed special rule and must be documented here.

## Testing checklist

For every combat change:

1. Confirm both players start at `100 / 100 HP`.
2. Confirm one arena bomb leaves an unshielded player at `65 HP`.
3. Confirm a shield charge blocks the full hit and is consumed.
4. Confirm two arena bombs do not eliminate a full-health player.
5. Confirm the third arena bomb eliminates without healing.
6. Confirm ability damage and healing match the exact HUD values.
7. Confirm online JSON snapshots preserve numeric `health`, `maxHealth` and shield state.
8. Confirm round resolution still occurs only after one or both contestants are eliminated.
