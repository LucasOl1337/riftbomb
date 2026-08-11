"use strict";

// RIFTBOMB_ONLINE_DUEL_LAZY_V1: the War Table can render its initial setup
// state without parsing the full networking bridge. Direct game visits,
// saved sessions and the first command still load the same runtime exactly
// once, then replay the queued command through the existing message bridge.
(() => {
  const CLIENT_SOURCE = "riftbomb-client";
  const RUNTIME_SOURCE = "riftbomb-runtime";
  const CLIENT_BRIDGE_VERSION = 1;
  const CONTINUITY_URL = "/match-continuity.js";
  const RUNTIME_URL = "/online-duel.js";
  const INITIAL_STATE = Object.freeze({
    phase: "setup",
    role: "offline",
    roomCode: "",
    connected: false,
    rivalConnected: false,
    guestReady: false,
    inviteMode: false,
    inviteUrl: "",
    busy: false,
    matchmaking: false,
    quickMatch: false,
    hostChampion: "katarina",
    guestChampion: "zed",
    arena: "lattice",
    matchTarget: 3,
    status: "Arena pronta.",
    tone: ""
  });

  let runtimePromise = null;
  let runtimeLoaded = false;
  const pendingCommands = [];

  function publishState(reason) {
    if (window.parent === window) return;
    window.parent.postMessage({
      source: RUNTIME_SOURCE,
      version: CLIENT_BRIDGE_VERSION,
      type: "state",
      reason,
      state: { ...INITIAL_STATE }
    }, window.location.origin);
  }

  function parentUrl() {
    try { return new URL(window.parent.location.href); }
    catch { return null; }
  }

  function hasSavedSession() {
    try {
      return Boolean(
        sessionStorage.getItem("riftbomb-online-session-v1") ||
        sessionStorage.getItem("riftbomb-online-resume-pending-v1")
      );
    } catch {
      return false;
    }
  }

  function needsImmediateRuntime() {
    if (window.parent === window || hasSavedSession()) return true;
    const url = parentUrl();
    return Boolean(url?.searchParams.get("room") || url?.searchParams.get("invite"));
  }

  function replayCommands() {
    const commands = pendingCommands.splice(0);
    for (const message of commands) {
      window.dispatchEvent(new MessageEvent("message", message));
    }
  }

  function loadRuntime() {
    if (runtimeLoaded) return Promise.resolve(true);
    if (runtimePromise) return runtimePromise;

    const loadScript = (url) => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(`Online runtime dependency failed: ${url}`));
      const parent = document.head || document.body;
      if (!parent) return reject(new Error("Online duel runtime has no document parent"));
      parent.append(script);
    });
    runtimePromise = loadScript(CONTINUITY_URL)
      .then(() => loadScript(RUNTIME_URL))
      .then(() => {
        runtimeLoaded = true;
        replayCommands();
        return true;
      })
      .catch((error) => {
        runtimePromise = null;
        pendingCommands.splice(0);
        throw error;
      });
    return runtimePromise;
  }

  addEventListener("message", (event) => {
    if (runtimeLoaded || event.source !== window.parent ||
        event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== CLIENT_SOURCE ||
        message.version !== CLIENT_BRIDGE_VERSION ||
        message.type !== "command" || typeof message.action !== "string") return;
    if (message.action === "sync") {
      publishState("sync");
      return;
    }
    pendingCommands.push({
      data: message,
      origin: event.origin,
      source: event.source
    });
    void loadRuntime().catch(() => publishState("error"));
  });

  if (needsImmediateRuntime()) {
    void loadRuntime().catch(() => publishState("error"));
  } else {
    publishState("ready");
  }
})();
