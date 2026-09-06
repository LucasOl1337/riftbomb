"use strict";

    // Presentation decorator: tap the same announce/update/prepareRound/finish
    // calls the HUD already receives. No second combat brain.

    function agentPlayLocalHost(location = globalThis.location) {
      const host = location?.hostname;
      return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    }

    function agentPlayForced(location = globalThis.location) {
      return /(?:\?|&)agent-play=1(?:&|$)/.test(String(location?.search || ""));
    }

    function createAgentPlayHttpSink(base = "/__agent-play") {
      const queue = [];
      let available = null;
      let flushing = false;

      async function probe() {
        const response = await fetch(`${base}/status`, { headers: { accept: "application/json" } });
        if (!response.ok) return false;
        const body = await response.json();
        return body?.ok === true;
      }

      async function flush() {
        if (flushing) return;
        flushing = true;
        try {
          if (available === null) {
            try { available = await probe(); }
            catch { available = false; }
          }
          if (!available || queue.length === 0) return;
          const batch = queue.splice(0, queue.length);
          const response = await fetch(`${base}/events`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ events: batch })
          });
          if (!response.ok) queue.unshift(...batch);
        } catch {
          // Keep the in-memory session even if the local sink is down.
        } finally {
          flushing = false;
        }
      }

      return {
        write(event) {
          queue.push(event);
          void flush();
        }
      };
    }

    function wrapAgentPlayPresentation(inner, options = {}) {
      if (!inner || typeof createAgentPlaySession !== "function") return inner;
      const memory = options.events || [];
      const sink = options.sink;
      const session = createAgentPlaySession({
        now: options.now,
        sessionId: options.sessionId,
        events: memory,
        emit(event) {
          if (typeof options.emit === "function") options.emit(event);
          sink?.write?.(event);
        }
      });
      let latestMatch = null;

      function remember(match) {
        if (match && typeof match === "object" && "mode" in match) latestMatch = match;
      }

      return {
        selectChampion(...args) {
          const result = inner.selectChampion?.(...args);
          session.ingestMatch(latestMatch, "selectChampion");
          return result;
        },
        prepareRound(...args) {
          const result = inner.prepareRound?.(...args);
          session.ingestMatch(latestMatch, "prepareRound");
          return result;
        },
        announce(text, ...rest) {
          const result = inner.announce?.(text, ...rest);
          session.ingestAnnounce(text, latestMatch);
          return result;
        },
        update(match, ...rest) {
          remember(match);
          const result = inner.update?.(match, ...rest);
          session.ingestMatch(match, "update");
          return result;
        },
        finish(winner, roundWins, elapsed, ...rest) {
          const result = inner.finish?.(winner, roundWins, elapsed, ...rest);
          session.end(latestMatch, { winner, roundWins, elapsed });
          return result;
        },
        get agentPlaySession() {
          return session;
        }
      };
    }

    function attachAgentPlayPresentation(inner, options = {}) {
      const location = options.location || globalThis.location;
      const enabled = options.force || agentPlayForced(location) || agentPlayLocalHost(location);
      if (!enabled) return inner;
      const memory = [];
      const wrapped = wrapAgentPlayPresentation(inner, {
        ...options,
        events: memory,
        sink: options.sink || createAgentPlayHttpSink(options.base)
      });
      const api = {
        session: wrapped.agentPlaySession,
        events: memory,
        note(text, extra) {
          return wrapped.agentPlaySession.note(text, extra);
        }
      };
      globalThis.RIFTBOMB_AGENT_PLAY = api;
      return wrapped;
    }

    Object.assign(globalThis, {
      wrapAgentPlayPresentation,
      attachAgentPlayPresentation,
      createAgentPlayHttpSink,
      agentPlayLocalHost
    });
