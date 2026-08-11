# PROTOTYPE — collaborative human-like playtest

**Question:** does the state model preserve enough context for an AI player to observe the game, record expectations before acting, distinguish evidence from hypotheses, receive human judgment in Hermes, and launch a focused retest without treating every suspicion as a confirmed bug?

This is a throwaway terminal prototype next to the offline game capability it may later inform. It does not open the game, call an LLM, save screenshots, or persist state. It exists only to push the proposed collaboration loop through awkward transitions before building the real controller.

Run:

```bash
npm run prototype:human-playtest
```

Non-interactive walkthrough:

```bash
npm run prototype:human-playtest -- --demo
```
