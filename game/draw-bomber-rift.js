"use strict";

    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (a, b, t) => a + (b - a) * t;
    const TAU = Math.PI * 2;
    const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Strict phone/tablet only — never treat desktop touchscreens / hover:none as mobile.
    // (Earlier heuristics wrongly dropped PC resolution/HDR and made the arena look soft.)
    function detectMobilePerfTarget() {
      const ua = navigator.userAgent || "";
      if (/Android.+Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
      // iPadOS / Android tablets: coarse pointer and no mouse/fine pointer.
      if (/iPad|Android/i.test(ua)
        && matchMedia("(pointer: coarse)").matches
        && !matchMedia("(pointer: fine)").matches) {
        return true;
      }
      // Fallback: phone-sized short side, coarse-only, no fine pointer (rare hybrids).
      const shortSide = Math.min(screen.width || 0, screen.height || 0);
      if (shortSide > 0 && shortSide <= 500
        && matchMedia("(pointer: coarse)").matches
        && !matchMedia("(pointer: fine)").matches
        && matchMedia("(hover: none)").matches) {
        return true;
      }
      return false;
    }
    const mobilePerfTarget = detectMobilePerfTarget();
    function planVatTextureLayout(vertexCount, frameCount, maxTextureSize) {
      if (!Number.isSafeInteger(vertexCount) || vertexCount < 1 ||
          !Number.isSafeInteger(frameCount) || frameCount < 1 ||
          !Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1) {
        throw new Error("VAT texture dimensions must be positive safe integers");
      }
      const texelCount = vertexCount * frameCount;
      if (!Number.isSafeInteger(texelCount)) throw new Error("VAT texture is too large");
      const width = Math.min(vertexCount, maxTextureSize);
      const height = Math.ceil(texelCount / width);
      if (height > maxTextureSize) {
        throw new Error(
          `VAT texture needs ${width}x${height}, above GPU limit ${maxTextureSize}`
        );
      }
      return { width, height, texelCount, paddedTexelCount: width * height };
    }
    function sampleVatAnimationClip(animation, key, progress) {
      const clip = animation?.clips?.[key];
      const totalFrameCount = animation?.frameCount;
      if (!clip || !Number.isFinite(progress) ||
          !Number.isSafeInteger(totalFrameCount) || totalFrameCount < 1 ||
          !Number.isSafeInteger(clip.startFrame) || clip.startFrame < 0 ||
          !Number.isSafeInteger(clip.frameCount) || clip.frameCount < 1 ||
          clip.startFrame + clip.frameCount > totalFrameCount) {
        return null;
      }
      const phase = clip.loop
        ? ((progress % 1) + 1) % 1
        : clamp(progress, 0, 1);
      const localFrame = phase * (clip.loop ? clip.frameCount : clip.frameCount - 1);
      const localA = Math.floor(localFrame) % clip.frameCount;
      const localB = clip.loop
        ? (localA + 1) % clip.frameCount
        : Math.min(clip.frameCount - 1, localA + 1);
      return {
        frameA: clip.startFrame + localA,
        frameB: clip.startFrame + localB,
        mix: localFrame - Math.floor(localFrame)
      };
    }
    const modelReviewQuery = typeof URLSearchParams === "function"
      ? new URLSearchParams(location.search)
      : { get: () => null };
    const modelReviewTarget = modelReviewQuery.get("model") || "";
    const modelReviewPose = modelReviewQuery.get("pose") || "idle";
    const modelReviewAction = modelReviewQuery.get("action") || "";
    const requestedModelReviewFrame = Number.parseInt(modelReviewQuery.get("frame") || "0", 10);
    const modelReviewMode = ["nacre", "katarina", "dagger", "zed", "renekton", "vladimir", "gangplank", "minions", "herald", "baron", "bomb"].includes(modelReviewTarget);

    const UI = {
      app: $("#app"),
      canvas: $("#arena"),
      runtimeBootstrap: $("#runtime-bootstrap"),
      start: $("#start-game"),
      chrome: $("#chrome"),
      guide: $("#combat-guide"),
      guideOpen: $("#open-guide"),
      guideClose: $("#close-guide"),
      championPortrait: $("#champion-portrait"),
      playerName: $("#player-name"),
      matchSubtitle: $("#match-subtitle"),
      score: $("#score"),
      matchScoreline: $("#match-scoreline"),
      waveLabel: $("#wave-label"),
      waveNumber: $("#wave-number"),
      enemyCount: $("#enemy-count"),
      playerCard: $(".player-card"),
      resourceFill: $("#resource-fill"),
      combo: $("#combo"),
      comboLabel: $("#combo-label"),
      bossPanel: $("#boss-panel"),
      bossFill: $("#boss-fill"),
      bossText: $("#boss-hp-text"),
      eventKicker: $("#event-kicker"),
      abilityDock: $("#ability-dock"),
      arenaBombAction: $("#arena-bomb-action"),
      arenaBombLabel: $("#arena-bomb-label"),
      arenaBombFill: $("#arena-bomb-fill"),
      bombAction: $("#bomb-action"),
      bombLabel: $("#bomb-label"),
      bombIcon: $("#slot-q-icon"),
      bombKey: $("#slot-q-key"),
      bombFill: $("#bomb-fill"),
      dashAction: $("#dash-action"),
      dashLabel: $("#dash-label"),
      dashIcon: $("#slot-w-icon"),
      dashKey: $("#slot-w-key"),
      dashFill: $("#dash-fill"),
      mineAction: $("#mine-action"),
      rangeLabel: $("#range-label"),
      mineIcon: $("#slot-e-icon"),
      mineKey: $("#slot-e-key"),
      mineFill: $("#mine-fill"),
      ultAction: $("#ult-action"),
      shieldLabel: $("#shield-label"),
      ultIcon: $("#slot-r-icon"),
      ultKey: $("#slot-r-key"),
      ultFill: $("#ult-fill"),
      touchControls: $("#touch-controls"),
      touchMoveZone: $("#touch-move-zone"),
      touchStick: $("#touch-stick"),
      touchStickKnob: $("#touch-stick-knob"),
      touchQ: $("#touch-q"),
      touchQArt: $("#touch-q-art"),
      touchBomb: $("#touch-bomb"),
      touchDash: $("#touch-dash"),
      touchDashArt: $("#touch-dash-art"),
      touchMine: $("#touch-mine"),
      touchMineArt: $("#touch-mine-art"),
      touchUlt: $("#touch-ult"),
      touchUltArt: $("#touch-ult-art"),
      playerTwoHud: $("#player-two-hud"),
      playerTwoName: $("#player-two-name"),
      playerTwoSkillButtons: $$("[data-p2-slot]"),
      playerTwoBombButton: $("[data-p2-action='bomb']"),
      minimapPlayer: $("#minimap-player"),
      minimapEnemies: $("#minimap-enemies"),
      end: $("#end-screen"),
      endResult: $("#end-result"),
      endTitle: $("#end-title"),
      endScore: $("#end-score"),
      endChain: $("#end-chain"),
      endTime: $("#end-time"),
      restart: $("#restart-game"),
      live: $("#live-status"),
      gpuLabel: $("#gpu-label"),
      bpmLabel: $("#bpm-label"),
      fxLabel: $("#fx-label")
    };
    const KATARINA_ASSETS = {
      portrait: "",
      passive: "data:image/png;base64,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",
      q: "data:image/png;base64,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",
      w: "data:image/png;base64,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",
      e: "data:image/png;base64,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",
      r: "data:image/png;base64,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"
    };

    const KATARINA_PORTRAIT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AgaCwABQkUQAgAAAClpVFh0ZGF0ZTpjcmVhdGUAAAAAADIwMjMtMTEtMTVUMTk6MTU6NDkrMDA6MDAVunD9AAAAKWlUWHRkYXRlOm1vZGlmeQAAAAAAMjAyMy0xMS0xNVQxOToxNTo0OSswMDowMKFETMQAACAASURBVHic7LxZr2VJdt/3WzHs4Yx3vjkPVZXV1RO72U3RIiUTepAMAwZoA4bhB/lrGP4Aercf7AcbfpENQYYsG5JgkqDUbtJWd7Orm2RXTzVkTZlZmZWZdx7OtIeIWH7Y59y8lV3VJATxzYEE8tyNs/eJvVbEGv7rv0LAsxoCwt/QiJ93UUHA/jVuT5BAQBWjl+b8a37RED7vhTSRX/whRFlO41fnFlfXNZH9+5ONcmli7t/TQ///8e84/qYUoH/lhb/GuFhy+pn//7qP0r/elxUBXtoH+tL/f2NDPmuC/l1+74vusZfMjiX7gntTInzutCL24skWYy9JR/4qa+BA0YvnvmRiZPWQCIEkBJCEvPTQDKurtzMv7kNRB/azL67QcMm0feanloJN0ECEy68s8kIBajDduymYv4bNU8iWk3tx5dKPq774/IUP01/RYOeKdHVLQh3iPvsFXX1IKGARkETqrlskIQ3afafEzEkXMywwAi1xQetwZvUGCdpL2ipAocQAF08GPN6tbjHg7YuNaVdLTpAF1cUtunKvAWakBavZgLu8zQUBsSsRXJbs5XH5uqCyut0hBZL+qlv0125sAzMSL8yNbpD1MaykCbQv5s+IzCCfMIukK/QcxmPOqI9ouvnkmJokMMIkAPX4ljij8ohFBFFUl68sF6u4RBQGWP3M/NUjFrPUtNATUUigcEwUsIjCVSnM0rgxJ54TW1Xb6QypV4/7jA9QcGDAgr200C7e/LLgPIDK6gUc4hCBAnlJvgr5pTUbLun/pSHInFhgEjrAGySgV6XoYyLRIA1pomG4EoggmThgV4uGdFuGI/KHer4gWMgxI1xDqqGPsTDCCFTYGbXFGESQiPaxGXZODMT+ag0JAmqRDNMHVhvavjBWCiJIp90h5p4tFZ7EBoCkqOm+LDiRuaaTFPmsafmMAjr9mEs6uBhhJXRFO+NgUA8OI0g3SwuCZi9s5eXbUx9jYIFmX2yRKlKO8WiGuSI9YCR+U3IlnWtdEbuXH+pyAU4IUTWgN6W/I8WurD3V2Zk2C2IPN8YJUpMKTAEJNrAVekjdEg0GNKBrZJsUc0JFO16aHVWImE7oDsmRBN0rgFw4ywQREfCIUe6Y/Irxe6YFnhATTLRNqlNaRBWzkBS0s42fF4bKKix34C4pIKHdZwMZRkndtDx4jMMUiEMMWKRdTc6t7LtHBOPAIJ6kSLfZzTIefrG/DW2JblN6uEa/L37LFJW2B7roDGqJzzSb0spSiymJ25D8K2ajwDxP9ZN02lCvY0c4h50Tc0yBGSAl1qB71C2tW1p2hpgd3+8lo7FNiEdbyBCLa1EBJUUAUyIFUi51wGqRiWKskiAKlbZz5VVT7EoxA5CnaXGs7QdpvpcwaKbaR6aXnPDLJkhWy9+t9JFQi/jVFzLEIAp9jEMsNkMyAE1IAkU9olCCwzikwAABDWi2NKlLwxWR9Bk/1I4pvi1b6+S5MWu2rFL7IFVRmxLdIR/gGpJBBWaEaxRX7foNMxhL/kE8/WV6ts+sh2xTWMwp0WP6WGCMHePfY3ZKzLAsDaPu4LI8C+hg7vKUzqktMWI8piB0OogkoRjgPFIgfmXZu3BF0jJcC4Za2gexiUZ3Te817FjcPXGHhA1xD6ifabOASOCLFHBZE2m1AwQc+JXbMdDDWCTHlFggooGlIwLNkB7WQgklNkMiHNJkmLDUpfHYQAqQYRbLX1SFq/S/Ldt3ZPhl2Xjmq6k2j9P5XEOJGyMjvMKEsC1lQp02t2XwDXd1ou078ej9eDohOMw6WQ93TmzQAimRAjPAndE+ocowF0ttBzyaxEivr5g0rRRtCV0CMSZPpIgCLVqT+lizkom9kN3KoWWR6MSLPEpzQZ5R3pXiimSvmmJo3EgXLswmEk60vWzbP18Bcfkzai65XwOC9DAlFBiFhEZoEAULOeQYQfrYEpOjEU4Jc5KBU6KBNazHdpoosPXSs6kgVyn/M3PjNbMW0HNt5qn9KJwcpnlCezgHNSmhG2Qt4pC/ZbZ3TXkh/Yc6Ad2m6OPOaSeEEtdDPGYLd0B8n7m/FGQPoA8REwYjXVsXVabHBlNQVFSBOCFu4KfEhE5RJSpsYHNgudexYARR0ipiUcjEfJJmnxKfSPNbZrBLNiMG1YgmMFDA/NcrQJbxpdhltCMG+tg+NkEJ06WO1GH9ymG4pZ2VHBPQijAjzUmdxR9gtvANuiAajMO0pAYVTIYZ4/8b942KdkEA3tOTg3YmIuumAOrUOrBIRVwjM+IscsWUCw3vxvOP49kjnQhcobSYGW1LKjEDzBhbYM6J7zObEu1qrQxhAJB0ODIbGzJaU03MTu3sJCM3SEFxwqLElJgZsUHmqJAU1rEFRCSCRXuKg6ACiC73g0Vy5EzbP4pHm/g7toyofl4E/rIC7HKBaIHk4LAemy1dKBEVZIKCzSCDBAbNELvMBqXAzFGFU4JZBcVXKDbgFBIimAABBaNEQ/vbsv0P7d0jPatsbpBHejKwttCewJN4OtX6CoMNyrS0Bmmi8YYMNsnfjMcfcjJDr1MAA+wJEdwYD2GE7mCOiT+/JH2Fu8tcRGtUd9bWtwa93E/9MFUb+WymUJKDvkYZUEVL7BAzI0XSMakiruMKnC5XXmxgG5fQPMrhag03VJ2hO6TeS1MxtKiQ+GzK/bICdIVOlJgC51ampl0l8BbyVQhVQwEGCascIqFzQoJTmgFG0QHuDmOYPUEz5CKE6JzwAPcbsvlf2NtHWovIw3QC+iWz/UBPBHkQjloiSN/kV8xwkuqjNHfYG1JumfIH4ekhiy2yGXUPs4abr/ZlRNexu7BH+DPmR8TBas7lymgraotxNDalFFPq5b3s9itT46uPP1ScQLm2rqqTs+OE9rAsM0RN6AltThzhgUOiQSAm9BruyyCwjwbcKTGgDrMgPU9xql1ARfVrFABkK/cb0UDohJVhDS8DOgbm0Jkpt3qrBbEh9bGJdJvBGvkx1aST+aUR0U3878nW37bbR1q/lY4N8k1//XWz9XE6fqQns7CIxCtm9Hv5a2uSP2mPx9bcy7aDxoMw/UF4esDCYw6pb5KvYc+JCdaxEb2NL9G3mP2YxTHxwvSXsHFpsUlvsLl11eZFSklEJMuyK7vh6DicnYJR1SuvvH721g8Em9BtsiFpSmhJitakfeocWcckOCAABW4fNmEXBvhz3AnxlNiZlgbOSC9hPC8UoFCssl+BRGqXIdALp12v7rlAP3I0W4FQM1JFMkgPu0HWw66Rf8R595ACMVCv4tGr5L/D+lcYndK+lY488tt265bZ+ePw3kd6fM9sLmx53Y5f89u5eI9e86Ogac2UH7fHP4rPD6m6wGyMHWHTCuGoSffwJfIWi076dpWZl5BfSsKVQNkfjrdu3HqlDc3+/tPz+US8d1ub4ewIZHp2LMob3/jdD3725j6twggLtgKLOEwgLYjPiQ7ZwigcrjzzCRJZKKytAqduyKUk7mUFCFSQg0CLJLQgWUy7CpzjSj31CkHtL12oTeicqGgPHLJLliAQH3BiwGO7uzqEcht/l/5rMvaYN/VwEHjDbP+97MsfxOf/qv7zMxtvp2Kazr9mr73iN6vUGiE35cj0ptr8uH38nebDHv66Gz4PU0GuYgPBYXtYFf222TzX5m09fVvn3drPV9IvVv8WoIT1a/fWbt6+eevGG6/fqZvaOjHPP21np/Xu1sHeXpZnHD19/5P3Nr/2LdZGz08PJlbHrhj5QVYtNFQe2cAH3JQwIz0nGihZKLSYAbaPAyakmlRrSAQhRtIJqb20Bz7HBDWfTYMva0jBg18teVku/LAKK02BFCsYeUoNeGyOqyCiA8wIc5vBULIjqqSa4d4wW9/K7v7r+hdP9LgnXolRdC25TddbpDZocmIdZqLND5tH32sf5tjOG4cOYjP93+y/9v3JOwvqr5r1fa3v69kv9OQZweML8CtfVVzCoyIxpdi2zc0rV770yt35fJ6UUM8fnxwUvd69b379g7d+VkB1vHf09ltbX/+twx/922mzmMX6NFTXkr2CL7AJNTDCDWBKnBETSWCOzgg94jaZ/xWU+6XxOQrwUKzsjMAF8ndZ+rLcKAQ0raSfYwokwyyIFdGtpN8QI2aAWcdu4k6pWtUBbld637K7AX7QfPBEjxU9sM1a8mvqN/D77SQ3ftcPe8afafWj5tMft4+7vb9mC1X9Wr6TNN3Orn5YPZ1R/W7vy3U7/0n85Gd6ckjtsJZlIXH9s0h9pFnfubt+85XNV9/YP59MZ7OrOzsKMTYhVc8efpLl+evf/I0nP/g3jqI6en7ywdtjk02ZA7PYnGIzdB162C4sNOgQO8AG4pw4X6nhiLbL3S5yqZcqE5+vAEBQu4IcBOmsrUM95IigYWmmpAMecmyO6WEcWhFrUobJMQZpiQkdYjawHjknjCivSv+ujPrinqSJkB6lo25R34m9Exo0WaTS9ppbG5liEuZ/1n7683iYOtBYuOIHQdNVN0R4VD9/2B78bu/LizD7bnzyZjo8pu4McbFCYbvc53S5CcLazp31O69t3/uKyYoQ097hYb/X29nYkOLLceAVef7wkcuy8ZXXp88fCrLY/1SyUd8Vs1BH0oR4YR76qxJAh4l2atij6XTQOcUCY1ADOTLGnHwWC35ZAQYSBMjArSohQnLQwwo0RIeboxGNsIUUiFvGpjIDg8kxOVJiz4kRGWJ7ZIpM0Fu4N+hva442Z1Qz2gPqhrSFV3Su1abtXbdrB+3pvWx3w5YHuvin7f39eLaFM5CLv+bXbTIjW2pikdpnuvi7/sZenP00Hv5lOt+jqaDAlji/2qndh0GXsgy3iqtXNq5dMWmxORrfuX7lfHZ+Nju33iwmZ3fG49HXvvKW6vls1vvyqwfP33e2SBq2m0Y1zVGBBj0nKaGGEWmEHWAiyrK6wDa+gRPabh/UpA4vCJiaKEuMMsivMUFm+cF09Q3QEglEkITO0XaJ+ZhulRlESQEF26GkBmZohAHOgkHm6C2y18lH2DOaiLakPRoh3SZfkBTpmfy6HRfG382vbLvBYar+SfPex3q+LdYqHjs25cgUI5O1KajIfph+022cavjLcPi9ePSUWUXKsB7rIFutpGL1Xkoy3icjN+/eiTHcfuXO5qD/i3d+IYakqamrQW4318Y3b1x/+8OP7KAY3X7t/JNHao0PcYBsYo+JLVqjEFt0ToTcQh+T0C656WN60MMfECLaZVE1VOgCZWmI0hcqoDOdGeIxDtuVdSqiIC0RtEFHWIf0sZ7kkS7mEWy20l8NOTiMhwLTw3yF7AaZonNSQmbECaGHuUtpYEYzwu66jcJkQeNtv3Wg83/a3P8ona1LMVCJNIVxG25QmLxbH4dhes2vVan+YTz6fjx6ymJOyDA5tsDlYIldhcuscBrXG9nBaGN7p+z3t3Z21za3TFvPF4vJZOKdL8fjen4O0iuLteHwfHG2fu9edXLczmfHxDXsBq5GJ6SE1pBICQ6JisqyeKksk03tYxLOEo+JDapoIEVUXrgBeVkB3Sx1qQPxWJAu2EjLfZRKTB/bW650ybCQEmoQi5hVeVqgh4lohgyRNyi2cECAllRDTRrgdvEZekIYYHbxPZP3Te4wnzR7/yo9ezseXzW9UnyiyTFDU667ocfM43ya6tJkmZjvxMMfpqNPmAuS43JMjitxHo1Eg+ZIBZYElLvX/frWK/deX9/YXN/cQmQ0HJZFuX90NF/Mb17ZfT49s8aMBoNBv5eSZoPB4Nq1k/fvH9DmmD5mE9ug8+W6Xm70jrO0hawcpFgkokNMjhTIU+KUEFfl28vydpf/sCukvqsLKJpIikZUcDNCifXYdYyggyUOqDVJwWM66bernK6R1FO3S7ZDtoM/I0V0hJmTpqQ18btklcYH0q6b4pqUQ6zDbEv5MM2+2zz8c47vmHGmJmpwmL4ptmy/QOapCcSFNtf9+P9afPi2nn+kU7v0Qw60xHgkERLJ4UArSWvlWDWJz8bXrl69dXt7Z0dTFNHBYLQ+Hr13/70PP968dX03y30bQr+X57nted/MF/2Nzbh7dbZ/eBbrZLLC5WWgTm1a6iDlpHPUooru4PovquISUYdcwSU4oT1BWzQtsXfzmR2gCCQPXY1FsYHU0HaOpSU1+IJ8hFjEk/rYHgTSGSm8ICVIWHpyraG05tU43NFijWyf6QDn4YQQiTuSrYuviCe0Pd/bsMMttxZVi6Z5Lx78cfvpQ5qvMF6k1BAz6JnBjh2t4UI7X2hINo1s/mbz6ff08FRbi1ikh7GkrnYkpEAwpAyZEtRovnM1xahtc+P1O73hGmGhircymZ7t7m4Ni/z500/PZueDUf/w5GhaTzbWe9c2N54+eizWX/nqb7T1X5wc7zVW8zIfLLLQpDOCLFPLFpiiCe0jJbarR7kV86WCIXoLmSHP0ACJBF5f8gFmWdkHNJICyUNE50SLyZAtBGQDk61C4ENaMF1BOKEN6rCKgoxwX4qDr+o4oh/L9Iq6htQQHabEG+RYm6BpZIux6QeNVWoqDT+Lx/9n/KSHc0gXyeUYQTfE7xgf0ZnGTMyc9CzN/1l4lGH2iR4ZY7oQO8N5bEvsCuINcUE7pq8paopX3vjK2o2baCqyvGpiFVIW4p07d65du/bO2++898573/rNr8WYjBhr7dbV3Ta0n378OLb1YLw7PT9u22YxP7sZx46sqxN0K71DwIAjjMIO1sAAyWACc6hgE/t1RAmPXjAev8AJd/ZE0IoEeKTD1jcwm6uwN6IHtHNSgfRxgVSTLAYQZIj7PbN7I+XvyblBPGaPaowf4WuSoifaCOyaYt3kCxKqH7SHn4TTH6XzEVmHFReIFZlpHIi1IvupiaQdyZ3IgzT5x+1HffyP9WSdYg3TxwooVqEl1kSPy9E5TYYdUQawzu2+fi+GthxaRRGMiIiEGKyzR0fHH3340de/9vpkOnHODfrDp3tH1byKMapoijEvh2l21rTtjGadYkF8Sg3oKviZEy2uq2ZtYxt0tOL4nMACHWHu4R4RLlcFPkcBAg3JkTLEI2v4AjvErGO7grtBHlApDDBDXE1qVxUhRYf43zO7XzdrP0jPMzUCKmyQXQClkQQ6lqwQ1yXStYbvNQ8LXIlb5YoyJ3X1jZ6YE5qRuru2TOifhaN/mR4N8T/UkxJGmBtkp0RdFtekJgZShgkkhTFlRI01u/fubd2909R14S0qhbeANZJCfOXVV54++fTw+PDdD++PBqOmafYP9v/y//3h4d6B8y6p9tXmxQBNMj+/n6avYLbIJoQJcQG9VZXYwPGyAMUJNqBXYIzMYAHnpGPiNcwnhPiSAgSNWJCa5MGQHHZMvoZZw44wETqrJ7BHdNiEDslmpAY1mAUxUO/ibspg0+T/Jj7JSA1s4Lc1PzFtt1LqtEg223bDkfgZWmv9abP3XNtjEUO0ahJsQLUsd+sIZ9Vek3zDuqc6+Uk4/kBn67Z8N5zksCXFNbGZYZCYaMo0tcSa0MN6pMF4spnRtLW++cr1we5W9XTv5t1Xy6xfeNMFfKPcF5mrB4M+4aP79x9ubf6H/9Hf++GffP9f/JN/Nri+vXP35tbVq0fPnh1X5zqJfnqUGx+1eaJnVyg34IzGkC+IGSgsiIouMBPcBvEpOsHmS263nhCndNlcdoFKuEvrXlkC0fQwY2wn/SEmoFPiCDcjPqXx2IheIz+gEYxF5sQZYRP/TbP5G2br3XiSYw+ovsRgk3yfyqsxYiZpkpFfMYNSHGil4dMwf6rt27q4I3lEFXowX7ExRrix+HXje2Kfp+on8fiTNDfwdjiZ0O5KsUHRN0xinGoQkZp0RptjiyV+pcZlxdpuPtrSEG7dfe3a9VtN2xbeqGq3A0QIIdy4devGrds/+9nPqkX10x/95IN37/eGg9d/89vr29uHz55pSiQlJobDeH6+FfMT2ucs+tgRfg4RWUCGmhXc3XGrJqSIbuLM6uKlMPTzeEFAggFmAzvGrmEzZI/gkE0c8JTGQELXcHs0soJCE7pG9gYjr/YPwsNM7KuM/g6bCgdUFjPTWdCwZbdGbpxJPE3zx3F2npop8YFWdyUPqgjlamFEdB0f0aFxPXGfpsW7OnmWFg3p53o6JVyRYlOKTVMm5iJ02WJNjJAtWTAJEOfz0aZBb9x5NYTQFV4WTcz9JZReJIRw5eq1zY2tt9788Ze+9pVev/e1b32jv7WlKR09fercCtNURbu5ZSVxQQS1K6E3yBHNBplFTqg7W71AP6FdR80lw3+5IOAu/5lgjPHQwV4LtEV3cIpOCM9pLZLQddxT2gFmTgpoiV3Db5AH0iMmhbhXZXzXjDTM7zM1SEJzwo7bGdphLv44LT6Ns6dpdqq1xV6X7DJdT5bFMlrSHdsfiNtL9Tvp/ETaKeEjnZRYh92giEkxGGSmcaYJZEFy4JEZsSWt93f7u7eB3vqVm3debaoaMaoRERGpQsrckqKCEDUl1fl0/v7b777x9a9+6etf+eDg+HRvz1h7tPdMUmtMF2KoUWHF8J0R3aXmk4Qc0yi6TnZO0iW1i5ZUonbJKCSD5kIBaYX850vQ3BS4kixDSrTEJvSM+CltB62M4Yg2gxkpgYcd3BCXCDPSmpqvMtpU/zQdHVEDgbjr1gd2IyELaT+MJ8/C/FTrOUGwHtdoFKS3mkZENzAtetX2rfj7aVpp9IXZ1/qjei6IF3OzHCTVunCcLI6oAumIpofxaN8WVQpBo8MporFyRXHlq3dODw82xuNwdrS5vkY1k+RVVbzPpHBGrOrVYnRttPZ2MylMb3zz5uP9o6fPn1ljkzduUM7Pm9n0XAzz0plU9YL0NMuwJXFCY5csUhYgcEpoSWuYEW5ObEGJDbFCml+hRbjLdkkuMZBZMThPic8IgCJjmK6eYmG0RB0koX1xr9C7pUVL+gXHspRmejW/2vEASnGP4+R+OJloYzBdzNqSLozghLCG7XL9V8kM7mGatsRjql/WkydaAxYZWweEzG6eVB3U/Jymt6p7dHP2mMFoqxhv2cyPru6ueF+wBAO0atvcubptU5aJiLU2894a05GknfNNXavq9PRIjBHTxasyr+YxJSNSE5M0fc08psBVBFlhATOSoHPSnBRhjB0gZ6TTFfVWfj0r4pIypCIeESakDvQfLnklXNCwEkS0Ju1Iflf6W/gDrU5oOlxwKEVhs0VqhrYsxf5p/WSSmpqYUIN2gYFf8dSAbbIGDonfpBgg7+q0Rfe1+lgnh9QdrLTu/Mj7mbcIBlVkTkwrp12aok1to6FvytwVGPFlMb5xI8XPQPAiAjQhWGNUNSuKJx8/ePsv/vL06NhY09b1448+2L5+o/vyYnI+Pz9bLBZVXc0X85DiMNmuzhyIaZl7G5bVJxJUpE7hU6Jdgsrag3M4g+llYuIXJGJL0vac2GXYskrqOmPXSb9rLxnhf8OMb0uvRZ+nqqXp+JQGFloPpByZ4qA5/pj6MC3SCguMK4pSF5t2/KeaFDFfIQPeoWlU9qk+1vMzmoTmmA3rxtZ1Auwt2tpKEZkRdYk+GSe20saLHdhebrJaFcVmmYZ2ZepFRJoQgKS60R/0Bv3HDz5+5ydvHT5/ntKSPdU2jXVOjNTz2ezsFNXZYjZbzGIMSakIIsZrR+9Vh/ErFucAU2AOaLoCeFpuiGTRBuaQ0LACbD5HAbrkRWtD6OgLBu1wrnqlN7MiqUe4QnaPwVXN59oeUNWqXox0GJHWX/NXClO8EycP03l1wXaErplgxaQzXf25JTWkG6Yo8T9MZz1xQeMJ9Rw9BaB0NuXZRCSpVlXVxnQtFXNpp5q6OugA26Q6afI2T4WvNYgp+ttbmhKI2iyo1rGeVtOe84CqLoL94EdvPXj77Q8+up/a4LNssLl9Njk5PDx0WVmdnu89exra1oiEFKsYo5J756JIohWiJou4lDJMx3pLaB9nkEMq8H5JBZNAqJcVXAENJPncMLRbmw2pi4I8JluxyS6k38XXA2xA71D0MM90fkJjkSFZhc61HZn8jtsc2P6ft/tP43xKzOGibyCAgQ7WLpGKeEoYYm9TjI37yzRtRMciz7U+pj0lTWCAOiOts62qxhTakGFztZ/auo3kMMDmmIW2CXxeSObVm/7G+mB3V2MUEcQmOJ9XCP31MTGJMef7e09+8tOHH97/6OnH/bx39ZU3Nnau7h/vzWazx48eHp+fHhzuDfojQWZN06p6a/t5L49QtzGlaFSVzv26VexbEzfIIU0wq/Y/0kqMF5wwc4nE/5kR0AXRYQpMtqq8xws2Nijax/YwfWyL7lHNiV1NeEYbkLHJr9iBQX4ejt6JJx5jkWZVF7RogckwBcbAnLQgGeQaeR/7YZqfantVsqmGfdpntMdED7nN1HkJAdDRUBaH2ymbEg5dm0c8kmHmpIQ6MZkvBJP1eoPtHZ/nMYTO6NdNSE7P59V60xabG67In//p9z/56P7h+dHp7LxX9NZH68UsxRQns0manO6fHjZtW9cLEVm0jbd2XPTWy54YU88W7bzSlDrKUUC717RITayIaxSWuEBBA3TL/7N9QV+wAxLaLA2RKDRojcgqWkrgYIRNaICn1CWmwJTYgFakHdO/ZccnqXoQTt+jLi41GnbOo4Q+VpAGnRI7xOoOhcd8yGJf2xtSzDQ81uop7THRIWNsZmzSJCqMhzIel8+OetiHdjGTOEYGuIR2wfG4HFnrBSlH43JtLaUXb72oWxFJbZzt7ZU7W/NPn5289cvj04PzVDuRrdFGr+gtjh5rSueTU6Cqa2uYV3NAlXHR62V5z2eaexVSG0Ld6JIvqwvCEJ9hFT1kvk3vKu6MWKMTNF5ax5fs/RKK0NUFTUgFJdJRQusl54IOoDaYzkN0PXL7NOs4QSx2TsrF3jD9vin2dP7T8DzDOYjEVfYhBimhBAsz9IyQYAN3jazEvcfsnHiDdICZiAAAIABJREFULGp8qNVj6jOCQccYi5o22Cjt9oZeu5qdTDawkXgitU9JkD7umDpBgfSt99bmo7Xh9q4vco3RilgRi4pQL+r+qO+Mlar+8Dt/Mm+qKrOPD096eSH9/tPzg+Ozo9S5sRgULqInZ6Sf54IkQTT5zMXcp7rGSCtSRNsQI3iRkmyiYY/5iMFY7JnG6aoQltCuO0hQxSxrwoYIKBIJNb7EOFyNSaRy1biq0NIMyHSZIUfgnulHtMLUyLrJt0wR0bfDyaN06jBK06AWCqyiBVkPesteWV2gCbZxNygU87bMc+w19TOdV+gD5s8JW2CQSGzRvhv4re3jK2sp6XDRjkhTFk2oChiQZ2Qz5mPc9bxvqyobDEav3c53N7WZWzGlywpnCk2qKs5YkVJk9vZ7D54/qnT+blg8L7L14eAX4TQdHB9OTmYhiMhssTCX1uooz6MmawwWJ3jnTOFZCMaoz9uZFsFUaGmdIGup9zRNH9C8YvI1bJWYqQGplv0Waklx1Zj1mUQMyDCRZJZhvirJYwVG+K6kaZF18SOykWRP0mzTDm7YQSb2YZjcDyeBaJFD5h5TUgwwXYpbsMR5TpCaYJAd/C7ujHYiMVfjkWuU7zJ/k/kBYRU/dIZLphtD3R233uSzujeZN/CQeRf6bdM7YSFQ4lRVRfzWtpR9E9W7zIjJnffWd0/Ler0EKaUPHnyQUnr69NNDTTvXr4/6/Wo+P59ODw4PmjZI1yRqDJBSMnC2qGJKG8PBqm6uNvNZr2yqBrT1ZAGBSaxHtiiNH2lWKQ9ic8dm14wLKZyqWFSXoP0XFGQEapJg/CXDndCGMCcIbJC9ysCLUThM9VVT7tr+RMPPmr1nOjdoQyNIjt2RftDUwyZ0gOt6QvYhoGuY62QdlDQnOYxHbtH7pZy/qbN9goVr+AVtQkGz9Y24vS4pFdNWkhazKsCE5GEDn9B9qiEeRFPKdnaKGzdcv6+ajLjC+cw61a45gnoyzcaj+x+88+Dhxx89+pgY19fXM++n8/nB8fFkNospLZFLYza2tlPSo8P9zntN6mZtoCtQTq33xWgozOMitJk0LVmQuYYRJLQnrtW0QB/G5rbN7uAN6UPCGQkkYsyvwNEvdHB5RHRBHdEeso5/jUFLcpikummyTMx3m09PtPWYAhuIBvHYbelF1f6yZuCAPZhCiV6HDbzDRGjRKWlL/XXKX8r5d+3ePFgDd8g+plkHQ8o2Nosb14ksYmpzv7Z3WqFPme3ggTX8M6YCfZwCKWXb27YoNCVErDGZ9QlFtTmfIjK6ce3k/sd/+if/+qIhV2Aym83m86qunbUpJQVn7M2bN7du3Tra2zs83O+ij7Wy2BwOnLWqCqKqxrui16vOz9pcWk8WdGSySayHNr8goXrkeWwHaA8ZYU5WdKAvhKMtmgiB0EB7SSsF+jqDbUrgMM0cMo/1XzA7pOna2DwywG7TyzG5iiJz7BXscwJIiY5hHbuJLREvukdbkb5FT6z/i3j2L3S/H9yAauT7C9I1nGmD9Pp+Z8OYhHN96835zJ+eVTQdXbXEzkmJUIIflG1KXxpeiTfu1GWPlJzYDJM0xRiNyCjLFczh6Ydv/tvecOOdxbTVtGV9K+l0cjqb12l1roIUzvzm9YMv7fzOk/73379fOJZVikXlnOuVpYbm4hyK1uu8R6EquSwKsgkiy8ZSr6jKgpQL+0qLscgWHNJa4kVv6OdiQXLxX0e8vUP5t9loSU+YGWSE+SnTZzRpRdT1yAZujSzHZZgZoSYa7B6h20Zr2B2swgYW5CNq4BXNzyW+Fxd/oAcD3Iq7KiftdOx70Ba3XjFFrqoCakTaYBaztCqC97BH1AYixBi3yrXFvTtSFqgqGGuNsZfDUDHmzT/8l/uPP37fcRTae3k5SfHw5DysRG/GRXZ7PU3rxZuPzKytt9b+4T/4j//3//uPjSUm1oaFtaazZlastVbBJ9MrBwHdX8ycMbIy3UPNaipQWUHQgTQnLl7sAD5/B1wMRVt0iPtt1q5Q1KQ95jlmj8X3WcCyxyhHhtj+kouhCV0s6Y9dXs0mdhtbIhG9gpuT3pdqgL2h2bnEv2D2Q52ssGhd84PjdrruB6Ftel/9ivG+c1hqjD0+d08PwBq0xBniMXWFlrDZW9scbG4Va2xuJr9cWZpSjEHBWmutReT5xx8+ffxhjj8K1abzZzEchfYCyrdQbA/9N6/HkznWOO/+y3/wn4gz/9t3/lgS66PB+mDojFWwxnpjrLVAjCDsln1Fj6rFVNq++qmpB5pnQrNM017KAF5WwIW9ApihY+hBH3ub/pcZNqSHzHvIIfU+1cXBLQHdxPWR/oo/GtH5sqWJAjtD3yDbwVk4I1zDPaA9JX5b+z3sn5nJL8yi1uTixdkSctpO133/qJ1+rbw+EZOWPyUyr2RRizGr11BgjvYwNWlztKMpmS5oF1JSRZOqgnXOGhNjfPLowU+/+0c53iHAUbiwry+GJMwgkzvjtm6a7zz6/f/59//gu3/YzeF0Mm1D6Pd6mTHW2Mx5oE0hM2a9HKyXvTqkvdm0Nk0/+i7W8QZJBHCqXyz/SwUZJfOwjnNIhrmFv4s9Y3ZCSOgvmDcwRRXJl8XbZafgbCWSArOG7/DqdeyrmFtkBzTPaR1uSqjRrzCIyPeY/jhND1ILmmhLrC7Vljdt2CjXzN1rtQ0RFaV15upsnh2dHLa1WECN+CrMSgik3772Rnl8Ggb9sztX+iEWdSjywhrrwKdE02CMa9v2+28eYT6lMp/tFWhytMsYW6au2srkd8o72e+98jv/+Zf56o3v/Hc/3nDWWRdCfX1rfWNYOutgiehnZHnSXpaC0b+zuTUpzcPHe87biC6IfuGEoGiX1VZ8/ni5IGNgiF3HG2RGtMgn1F23n0JEHOoxGXaFDkmH4RZIH0mIgzv4LWyOfYd5TVrHXqMHFJgJ8Q85fpd5B/nJ6kCerrw3wLY0N+58VbxTCaoEIzuTpjepjpp6lsKa84Wxsxg6ha2bwme5q6rJt74RixxVUQxixBhUVMWYejF/7yd//kl9+oT6ApK9WJMS0BZ3tXTreTP2EkLdNj8/evw//qf/NZn75//HP/fWKWyO+5mzXW0GOi+DCC2chLhdmJ53X1sbvP94b492W3xC+8YuUkqaLo4t+iIFvBi6amfwGA/PaT6lnRFbVJCO8J0v0+bUdVpbzADjls+SdcwG9grunPgJdY58g9GE0PXO/znnP2f6EdV86YtEltVq7c40SaTNnRtZUciS4yNlm3anbVU1DZrLUlVnYdYJcTMbZ/sH87t3Uq/Xfb8jWoUUxbrc+6au9588fvTR+x9RvziCD9yttfD41AyLwTe3ZJSJN/7qcG1r6zpbdVtPZyfrfvDf/qN/NF8syqLQpNa9aNlSVWuMMzamVKdGUlLluGlvlvkbUn6sdVeWW6S0blwT265x8Qvkf0kBF6dzWGRCOCU0tOckszrGqAucGxBSd9bJxbEVnSfYwG+QzUnvUlfoq/jr5A45Iu3RHND8iLPnNPUqNris+AlpB5uX/bzfX0wnvf5QRFrDneO6F9MBqUpx5HwmZhpDB3IMTbHtx8k21c0bXZUrhrBYLEREoVatRepqcfT006BttWosVLC7A+llZrNf/N275be2pGdSGylsz4/G5/0k+l/91u//P49/+j/99/9DnuWqmlQ1pdQFQKrOGGusEZzzY+vyNG1TalJc9+4V8vepupUQVZ3YobEx6eUKzBcqYFWrSqe0DURi1yEjK8p/V8g3SLY8BGPZVt+DLdw61mJWFt++Tu8N/CnpPouauE/1M+Z7tBmAmCWdb5kKVcQRFnQ0GErTxrpuY5rZuJbYXjTPnewb9apZRCVVKQywgqyXfT+wR6ONpNG1rSC16pJtIFLV1dns/Hhy9uT548UlXrhCtjvUpH53ZKMW9+ejjfH46m5my+ywXduPN27cut3u/K//yz/eO9gvvC2zvMyLwbAcDcbOZSJijDEiqmTO3yj7W8Phg7Nzk/mJmOFGcWtWt4ugYIRAHIttTZoTO88cL59Y+asKSMicdE7SZV/ni1NqmlW9rId6xINFy2Ubv1X0mNgSG+hj7lHepaxo7jP/JZVHnlA/onFIxhISYXnMwfJ0HA+7ZIXPYoyoxul06uXLDaI8M2YmaQdM0u68jh4eYWM0inma9vN8MReXAWqdiIDEGMLkbH6yv3d2fFBNDTIu+9PFDOi57N7VeyJyNj8P+/V1GW0Nt0fNZt72shDW6hg+PP6Dd//k7bd/mhs0xsLb3Eqv6G9vbJmuOh9CDCGgBuln+W5/LRh/Xlf9/oBrk68f6pun+8aIiqmJfUwm1GB1efLcS7vhhQLSsu4oZtkgtpROWoWxHZjchaFu+TWTIy16RFC4Qn6PcgPvkIcsPmDxnLbDdg4IGVIiBgGNl4o8FvrYCfE6xcP5WWmzwmeIFLCuPDO00FeTYdylo9byLOuXZYxRVK3zMYW2rb0rjDEpxqZaLM5PziZn02ruochyNxyfL2bAl2688u1X/5YV+9HeR03TbL6+mw3yNobm9Ky3kHBy/tNf/sUv379fCmLIvFNVMeKcWx+NVLVqW5O0liiqViSpFs791q1bP3r08OpweHpezKpwc2Pw7GyO0orWpO4wt3qFrl0kay8rIC4tDJ4ldbFeESB6S8o0XXHZojk2w0T0mFBgB9hd/B3KkvyM9lOqR1T3abOVqgwyWHWsXxyCa5adBGqQ6+SntI9Ojzfzcne4qXBbnUE+cSRhR806mUG6U1qMka21dWttCkHEOJe37SKEOrVRU1pMzmPbNm01qxchxsJn/aJ3vJgLZNa9ceteL+9bMdvjbZT9T55VoYp1G0IIp5OT+w8OT0/7DqDM8yLPQ4zXtrY3trdHw+FkOp3OZrnijHHG5sYl1TLz/8Ht24fTaR1CUj1bNN++tfVHv3zcpZBzUoHpUK8v8gEvMYU69B8gXykjWwVIDZKhA1yEM2KHgt0mv0XukTPifc6PaAQ5ps0xZnmmkF4+m1JXmrYQ0AmxwLwi5ff0zMBRvUhy4pC/n68/MzStZiL9ZDbwc1JEvRhb9taHo1F/8KhtvMs7N+mzgqCLxbyaT9u2VrTMi15RAm2MR9MzL3Jj+8qsnp8/fq9tgzXGWrf/8PF8Ppnsn86Oz4wkRyh8l/vJ1a3to9NTgSbEOzdviYgx1okxmvo2y4y1xhgRZ4xac3dr65dPnmDcg5PJsF+2kjKxVqWRJQfHrE77k5fgaLMi1iWw2NVxNRRwUUJJS7+hPeyM1BAUrlGOyDaxY/xz4iHNMe2U6JAEBeZ8GV/GE9q0qgk3YMC9wALNmvEDMZlPB1Xq2nqPq9lvSxGb+p10PiPcIt81vczxCU2taacY6quvFLPmbLJ4Z9C7S4ixgeisVQ0us8mnJraZywpXppRSUpfLelsZkdF4+MH+g+zk8ZNnz1XVWlvNpyEEY8HinR/lww6/E+RssvAub9u2FmdNz/tsVNpGzj3BJ/3/KHuzWEuz6zzsW3v4pzPfsapuVXV19cBmd5OiOCmkRDGKNSQ0KeTFRhLLQR6SQIAhBMhDAsSJE0cIYAExDNuwoSh2EMGSo8GCJZmkRUsUB1Hi0Jx6qq7uruqahzuf8R/2sFYe/nNuVQ9s0Qf1UPfUrXv/s9fea6/1rW99K9eqa9OhTbYHPbvWH8ynbjpp8rVJcn1skl3T7Lgig2XwAhKAlKhDNJdWs/JNcHRLFYFGICgBpUAB5GhP0NJtZQCB5og96BGyAZK2HCrAHVQHcDWEgAwqBWbAHAKgQmwQCdQD3MqntS9lQATv0SX1YVu8EFp8aemazur0OrsbcAXUKZ0OyexKM6Wg2iQoBgZeSejMMiGD1qn3CwhEJE1yRbrX7w+Hw3KxOD482to5c+v5fWWMCKw2e0fH49k0ApujtVNbW1oTBALJkrTf7dZ1ffvWjSRJLlx8LAR/7eoVEpmPDwfrW8wx63ZRlRIjQ4zWW8PBqc1NCHZOnxIAwobolXv3lGCC0IGhFX+rEVnIAy8kK37cm9RSirddESf/SKAOVAe6C90Ah2gGSBRoAj9DcBCzbFaFAxbAAmj5Aatclx9efW0hgPeSE53Reibxe+FNuboGfZknddvsKQChJJ4gtvKfwwgmHGtkAVgy3UQpKzGISJrmaZpbY0MISZqev3hhfWvr7NGh0fr8+UeuXbvKzB989v2kKDJ3rTFqKQgQYmhcY4x54sn3Pnrx8bPnHvnyH39BKXXzxvX3nj7dH20QoS3tLBM6kSRJhtubqBusYFdF9MrerlKkgRrRrEjpJ7QSgrRw9Mkd8NAyPxSits0wgyXgTD3Ylkw4QUhgR0gVaArnEAFZScQKg+ZA9ZC6aQ5DwARLYE3a6j8j70OA5Fhtk7300OpH4MeQGwED27A/rQcbZG9IfYeaHnQHag++T/SyhVkZNIRG6yRJuy5MRThJMmtTUGSOWZ6fu3Bh49Qp0xlqrQB47y8+cr5F/1lkkCRWawEgEgHbKXZ2zkeOzFw39Sd/5md/45/9mta6mk4Xk+O6nDOzJoiICDJrhnmGuKRbXzy78+KdfQCtRQFqwEqWwq0PL/LDf32TAeKKeCKQDmgEk7aVphWWZIE+AMgYi0O4PoyBAahlGHrQFNJ241eIDhjCtCAPrVDZDDJMTKKVVFBA1eF/a0oT5LRORdF9C4Sw+eTFL+/tYjcrglpnOivYI6kBCzpCnAquhEqYN/qjqJmVESAKa/E2saPRZvvJjEg3Tdc3N9aL4SjpnP7IM5Oj3RtvvPzkxQtVhXb1e4Oe1SyI1qbGJKk23SRl3/aSAlWloZ98/Omrt29evX+33xsmJmFQzyRpknjmVNGpojhRyFaMwqIUHHkwkKmYEEGUgE/crwVykEd64g/eegI6QA/oAR20hfzQ1nhPFL7ngEMDIINSq/uDQAFcQtxStkBK8AhJH/oe3AKxWu0BaT+51gJMQhAWtVbQp56Wr13DK7vo6h/ZPk0CJXCQx8QUy+sfXdI1+BrqNc6m02MCRsP1tt4iIrm1LLI+GrV8WwBapJunvX4vxLjc4DGef/Tp8fEeGU+0Ulw2idbUGkALs3d4qIbDIk9eeOSNO7fuHux+4ImnQe0VRFFklOdPbW3tDIYnst4CaPWApL1QvmD9dgzoLR7+BxZkIligWsCZIW7lUtp4NH8AYrflHhkjTMEKiiENZB1JAX0fbrGKodry2RZgie47lym1nSQTDruB0U/xix+Tb91631fvnO1278znTuQim/dLMhB1g/weghIiQgF9MabfnxxZUoPpuNPpiUhmbJZYFoHIYDBIkkQALayFrTWD4SDGMJkcrK2fYo79wXpdjyfjSWs5q7UCgcAiCrTUXwZavVwReerRi5/76lcV0e7RwZmNLa3ehU+O527fp79EH+itr3eRrYQHezgF6sCaZQt8qx2usXLoGpgiTBA8REDVqrk3h14gztA2vxAvOXGIwCLEkmRobd/YaaLiuYy+c5Mio2vO9XtMUnMYdbLHwZks5TmHYu6J25d6wIoUi7AIJtOjbm+QWZtZA6BIElq9Wl2bpcwkkQhYZDI97A82AICoP+gvP2fbM9quWgwSHYwBgKYGEZEipR89d/76lfH9o72N4VqaGAHaH8jyENBMxCLMD4DPB0f+zRZ5e0lymQdoWFrd1zWIIV1ICtOKBZWIAiTQcaUi1+KmY3AFWBgHniJqUA9qC3aBuFitPoCUkAhS4FgRKw5gG0IM5XGaP7n93lDV468eAgjH8fRobS3tidF9dW2oMSK8Fvl6YY+NTkxvpz86WsxpPhalgnAzn6hej5JEgIYoSXVQAgl5khYgHUInTwuSCCTOEwSHuxBYQ14tT7A1aIlwAJBlCBnqGZoS1Rx1M6+rqNRTm/3J7rCqXUHcM+goGJKtzJ7Jk0wiFg1EiHmY52zsOLg2zamBWiFRIGjLwszNKkp8Cxh34pToJCewkBwqhTGrbluBJNCtiKQsjcStayqgZ4hTMC/ROtWA54iLVfLNkBRQRE4AQYBcUHYL6jq7q0fV2tef746GWaforg1PT+cdne0uxhXkaai+kjc47gt7bZwmq3Xe6TitMlcZpVlkXi+GTZUWReucRVEU7to8tdaIdBOTZYkm5FlaBfgoYA+AtDW85AMqZkUCAWKEjyADFpQziICjBB+J1jqF1caHxigyBE2iAUtkWz2+2HLJoYmEaJnz09JX8yogVKvz8BZE4qQi9qa7QS2hZolLoXSFVdoVEFugYorYg+pCTxFbFZ0UtA5TQO0jzJcFr2XhPhM4IBAM0BF1ikyA3JHgfBzv7peTaVLkrq7qmH33yqVJXZ7fPpMDU+HXOE5ESKSbpIM0DzGGGLtp7oLPbBKZ63LeH60vj7tIkaRr3V5irOGQUNRap6nVWmWiAPjIAIRItRw6joAIgSLDecQIo6EttEVYAdvAoOiyCBGNF2VmW51+aX/fiZsp65qICNidz0+WsUHsrITnf9Dr7VjQ0iO2GI5aEnUFgFvJDzUQAwygM+gp+BCxBmegEUwXagqeL8Wblore67ANvAOsgCA70KngdfH7Etv6Xl3VTVXDmluSXhkfdK0d9PrpQfUG+zEkijBzYdNR3onMLngWTo1tOVIco3eNsUmLNyXGZCZJjFVClihJbEtfyBPja+cBq1QUESLNrCHxxHTMFONym9kEYQm8LlwzKDqDPD8IoXYuMmNJ+ZaT8103jQ9LBaxZ07SJBa227Lu/zMl4DkFsKZG8itkVGEv5VgaZ2ApziVCSbHaGqnEH1WxXgocY0JDsGuxUwgGWWLle5hMmh2ngDaAgG2TXiuI+3BuORZseqchRAwR6VPSer/Mi/6DpfHDWvGFwtfFNCKbI83437XbI2rpuIikG5UnSJlNVCKFpMpuAloSAQEJKTJBERAm1wHdABIQgVotTCkALXC9B+hgIIgSOETFQZOLWtUThwMxnNjbmzjUxRqWsNonETFujjEQOUaKPBqqMotsQAMBqDVcGWPkUCJbG47cagBEAJUsDUIDQiokOEHQr2g+V2K3hVj/rXDu6d6+OUUSDhmRHKvUiRxLDKjFOIBZ6i7KxOAEMJIE6bfKQZdc5zERt6CRRNJFGg3JSTwT6amJOJ8NPzOSxu/v/dxLnsVFAsdYvNtdgde1jKRyVTm1CajlIYeF945oRegAShvfBgaGJorDjQNFaJYIKXkQUGKC2i55BiAL21DYEkTBJCFExa+/B1IRIhE6Ws8TTm1u3Do+qEIJSqTZDlaylhVXWeWGJljQzl4EPynKVB7TSVCcG0CvvshyPQ++iGYfldUxYVvJItIaItlZZk22ujdB9ff/2vfmRiGjQgOyWSlmwy/UCQS8TYwiwTtkG5TdkXgAE2rS5JrrnalZx26Q9ZRsJbWH5HKVzREA9XcvZgKnRWEwVUbI+ssOhSRMfQwihrUWTUXolSBuFZlW5FrzVBkRNXbvGaWNiWO6/lu5JSoX2AhBI66+VAkfECGGotvgUCVDMLSVAhI3JRUQk9jud1FqlFAEsUiRJkSQsTISTuVNNCFePDh7OA96WEbwV+cfbiVlv/m4SpWANdQvrKR0N0tHAFvmVl167Mztoi7p9MjsqZ8gdLsfwbVBHyx9NG5R1lFUMAYbK9pQto98LoZ8nQ2UZEljpEOfgiyq7FqtMsqe9AHg5IV9JMhwWZ8+oJOHIIrKMyxWpVRrYsq+UUtPFYq3XB0BKNU0TmQvhQmvNHGMEkSSp1aoJsfaBagdrkaawCUiwJGkJACGK1gJQIWhtmQOzMzptQjXqdsumaSkRbbaxIupCRFyMB4u5Vbr98odPx8xDxYGTMFRie0LThPpd9Lt60Nle2w7OS+TDl1+7Od1vRxAJsE1ZCrUrTasX1Ormt+DEAHaY926XRwCEsJHkiujQNx7UlmIEUETrOslax0Xq6QaPRhUgrygWUPfsjkpTiPjIXlhrlVErc7IsrLoQSSDCRC0ULcJCS14QGOKCFwERsdIAnA8+xGyVrJHREA1hYcEJViwiQDBGiJROpL0bWBSRUkqA9U6nZ2wvy0ZF4WMUIDLvzWeRpb2WFNFJBUX+smvYyGo3aegMIEgFWkBGRW9rc5PWOnqjp4edmffzW8fzO4fVZNY2uRcwZ01HR7rJ9RGaAM5gukhWOlI4suHop9772mc/q6G7a52bsQGgU9vR8JoXmpWiSIZ193wTEh+TrLdzVB/lxaWm/M7x4afPXYxJVvf62nkTXMmBG0chZlo7gEPQxrZq7nU9i1leNw0ClKhBr59oQ0RRGSEEZqt1DDVAoa4UYWF7lihVIr5GBJGN3ARXS4sCiTQxEuDygqIHi1JqenRwbmvrXlV1jClgtvJeP82jSGCe1jURFTb55vVbZdMA6Fg79z4FMULJzjLZVtTtnWzxpnpAu/3TouiMRv2tNdMvoJUaFFy7xe398v5Rdf9IGS0BXdhzuqOh7qM8RhOXTn9ZehSISZJf+Ad/71u/83saFOGf/ImfuPr1b/imAURrw6r1VCAgYd5ywSnacf6prCOCS656VuW+KEQRmEOeclTaN4CwJhLoqNoNr40N3tFymFfr2FVZlsYak6YuekNaABeDJqqqSikFkXb4nHMRRHC1OplNBUAkOMchtG8Q+/ZNIoorZhCLJInJrMGSH0eKKAJWq3vzeS9JWKRrbfB+WXVZ/uQfcAIe/oLBedHZeOR81usSCaxWg0IaH3Yni3uHi3b1gR7sedPVoLuxHEvTRrt92B6SdoRC2i3+6v/w3z31iU/86t/6xQzmPR/98f/07/7df/iZn3d1TbQkvcUYOYKSpUTWORfaisHvzA9fCuVfS4aBed4t2GgSgQhpZdKUlRKAmxCDo9U0CCKaV/M8y0++XNVAiCGBIxGMARGVZVkUD77N+6iB6BthJiJhjs5xjADY+yUnRyetx2ORtSQ5leUE20NDAAAgAElEQVSjPOsXeZrYh92LAF+5+kYdQ2ZMywz7IV8PnwDudPv9taGvaiKV9XIBxMd499i9fncxmyij0eookdWgO3ExFtemZmtIt5AzZI6Q5dl7P/6xix/6wD//b36xFbL4r3/1nz7/B7/333/2s//X3/gbR29cM3kaWr8rYup6x+jtECMRgMuuuhTq96rsfSb7Tq8rpB7eOG2LYFuS0iaJwT+46+hk3allKLZC/YrIKu05VlXdHpKyqpBl1prlf8ObghZalU90shLRESGdBJbtLGsRhTy1mX0wAVVE6hi/ef1GbmzPJiJvK8H8cAYQk9hjSy40vSK11ieUFY3208X83uF0NlF6ufprsAOye7GeiIuQdSQplABzuAYc+mn2oWf9z33kX/zGr1/71rcF+hOf/ee/t/v83dvXvvj3/96Tv/BfPPe7/yJ5/cYmJQbCRP0YzruZtel9X1mir9TjDeDZp59+iXnSSXVC7e1qvdVeRXYMYgnGwpEWwAcubFH6kiNXs6bfgTUkMzQ+ml5Xd3KGiAiH0IkBPuREEERuogenuYEXYdGGEMGRiYLSotsYRrRaJvPaN0/2MgJ8jBeHG6nW98fHRZYNOh2j1E6nM/H+z25cG3NdZDkRzSsHapm78CT8rvfwD0C3BaTI183x7buz3X1Sqt19I9guzJHU+1K1dQJGTEZr7IOfT2y/2/v4B8793H8YGze+9CppPXjfe1ViD7/0LUQmwDv3mf/8v3rtt3/3+KVLJk0AyZTeMPa2rwzR3VATsFZ02/3DUWLpbG6VVg9HagL4B5p3VPoSQBOaUpWCZHUYiJljjEYZgLTRgIZfxk7aVZDISSZphhioKQFAa4qsjWKAY1hVPwREbTbEwht51yrtYxx1u908ZxEDlM796euvf/HqlcyYajkk5ofe/z8wEVPkFtV8bzrfP1xK6QJD2A7MMfxYKgEiuAfTHW3G2oVqoWyW7ux0Lj7i54sbv/f56atvgOXJ/+2XDr/8XBtdKK1vXb969rEnLjz+hNo/OD48hFYN835oGNgN9b1QC7AxHK42gYAQmqCMoggIv1NwLbnNK1+xLEVPCeRcbawlKqh98mV/BEEpMItSFGNMc9AS1oXSbQxKZlkdBsAxAIhpoVxtfA2ABYFjP83Ob2z089SH0DgHrecxfPn6tTY1ECAzev62p/xhDEAhsAGECEo5Fn88jvsTyNIt9mDaYXQ1lqIuHdjHaOBMOpfa2KRz9mz/R5+lnVOT166GGCLH4Y88NX/5CjGTVqrVQoLcuXXjw+fO+Rs3d+/fVyaLJG3P1/1QAxgWnc21TY2loidHCIRjJGESFuHVHKL2kQGiJtSpSbFy32gr5hBm8S6wiLEGbZuZ1mCG0VEb5RpkRWxTFm0AgCOYibTSNoalQBWFRoUawlF4kGZPrp/umLTNw6wxRut5Xf/ZG9e+eu2NRCmIJEa7yACdsE5wAgD9IAPQqhmSyNiyLpSywuXxNMwrI04ICjRC1oE5ilWEVOJTmziSbc7XJblR11Xw+vwp/NgTfi2h516Ml292bhymMbGf/vjh3v3qYEKK/HQBAlyIii4dTWk0unD2kd6tu1rpCJlyWAAGONcZJnuHbwx7wpxER6KWmO8y4Gg/CzE0QSQENA2rZbJDgHfemybNMiVswR1tINAREMlKJwAYVIeq30mIbkzH23kaieISCiCtVKLArCiaCLFNTUTExJT3NG+kRaHVWpFkZlmPImPmdfXSlcuVsYXWAKhqJAZDHOPS3THYQsxq/tE7GYCWCAkgGZEKoXK+cYFiILAG9ZEWYqZcT6VptQO0TnY42UHuiJuqkgun6MNP+c1+uLWbvHqX5pX2Pn7q417i/PA4lDVpHeYLLGq4ELvZdFqtVb5X+4IRIIfsb4YagAfWGRX7WYwiMnC1IlLW0IPhYxABM6NVpRQBszbGKO1jIBAzMzMBBCmybGNtvXFNtSgVoEIEEQt88I/0isPGl/OSUk3KtON525BeE0hRmiaOoMuypAggo0SDrNKAJJqWhXeiqq5fuXfvheOxtfZBsC9QkCi8Gvv7sF79Oxng4YKMAIvahRCJKCEYUX2kXSQL+DbeDxALvcnJI5wz4CRILzPPPqq2RvH+obq5p2Y15nV45qJ/+lxz4/7i3mG+1q8nC1078gEi8DEpy87esZ1MWSknfBj9TNgAm8raGG/1Oy2kG5uGAS2pUkram1WRsHBkaHXS4qFJaVIeCBKWNVqiqiqVNo889vhiMb/84guJMQA881one8+pU7W1L45nm2liiRwhEimBlhM1pGUPDEBOGEACHmR5+/5DU9rpcDZ77tataz6ah0bchhhjjO03vKvveWCA5TcRyPnAkRlitVZEHZgubAV/jLoVebKggcoejTkRKglNrOjZ96ntNb53GG7dt5O5mpaxk4UPP67vHLmq8YtaJ9YvSl17CJAnzGKPp+l4ihCVoiAyZm+AHOq8ySAyTVMtIiBp6SRNI8YIlJBSWp2sQfRLzxklBlaKVHzoeoiRq6qKMfYGw7zT9XUlzB84v7XZL86s9f/xy9fvls3Tw257/CMJSUuJJBBEEGIM3hNFArFISrqb6MLaXprqkzlgWh8s5i/cvt0QpSt2DoEix/ZJfkg8zkCW1UoWaXg5El0LMlEpdM3xCHUEt23AI8rOqD4bNRZHWTbbXI/nN/l46u/t90pJ53KsfP6x9zvN/Mbt0LcSQrV/xNJO0EIkOxjPO8czCiEQzTnsc5gbm4HO6aQwyb5VElyAaG2ZhYAQnRFAW0ZkDgQipRGChEAQUuSc05ntFL26qVhEkRIWo83x0cHl73/nws7O0Kqy5sff+54feer88y+88EdfevHf1eYjO1sNw0NIKwNq21+FI5wjQIcQnZuVFYBhkXWgCNTLivXhwGhNRFB0vJh9797dG7OpTrKWGSTMJ5vg3wMNxapJMTJ7aLQNX6JyVl54Ji6AFZBAUtgd6p2S7ivpgmwenjrHn3iff/5yODoqkFyIvdrS5Uft6Se35t++VM+O/JwksghiZHRzNpTMFo/c3Os2DYyqOdwK9T0Cin4K2jFJI3Ipk9yXIpJmuQvSgjASRVmIJhEmIqWWHYNRxFpTjuskkaToVCGUoemFYH0Ukmk93QtX1+bHM+dOb2x85Gd/9vDO3b/9B1+4dufWT/2Vz5zq9ceLOgp3NCWkQBAiqRpMJlDKAOVivnf3qJelT3f7dWw6yZpJMt0tbGLRNCD61pVbv/3qy1WWgo1AhDn6GFygt7bC/+UGeNNLATmpQikRmYv3YLUaGX9ejbZVv2SntIpP7ISPPa3KBhxTss8cFmmgG090h2e25t+93Nw7VIkVH0DEgY3VQmQC79w9sj6IIoEsOC44Gq0UcIGUbx1LVUrWUUq5pjZEAKyyARGhUjBKGRFhDkpZItKkCTCJnU0mMUZrk6mvEePWYCNPMiIRpXbr5tp4/OSZndne3m987g+/e+ml//I/+aubpzaOZq3g8YNXm69qY2yajmfTb73yAqvB6WEviGTWDvrFaNDVilrenG+aKwcHt8eTblaIthCOzrW37lv2vvr3GuQmQA6lgZJZhLFa/QGlO9Q9pfqNhPs8jo8/5T75fgD2ay/V2v3o8fBUaV9cW+xbwRHXd/bVCqiKnpewDHDu1sFovIAIaZpx2GdfQRQoB51Ret5yY42tq0Wed0ipwMEoEzgAUNTWp0kpLQALa9Ltqg1Ha5Pjo3u3b3Z6/a1uZ1rOAGQ2LbIsCt+dzZ7Z3HpmfePX/+jzv/zPfu3s9nbjfWQ+afdtAWglaAggnOv1Nze2vvjcn1+7c+Ov/cSnntgcVd6/f2dr1O/0e/ky/jHmc88//0evXe4kySo4BgD2HkCibRObk/UsxNg3GfpdDdDaqhKW5Xhs0qA+pdu6exoDj3iDj55Qmy/+Rx+gyHRrj+/sneutPz4rXhrNX1mv9XFYVJVKzMOrr42y3WS4vxhMSpKlZtde9AccDJCBzipdQl5Xcj24Z889eev6a1W1yIouEbWrr0kraBYW9gC0Phm7AgJijIPRGogO9/f2Y00EF3yeZHdmasb0sbNn/9sPffj5e3f+p3/yj85tbH7qxz/RSmG1pFIFjIMPWg1IvQfm0eHmocQv/PmXP/8XX/yZj/7ke7bWau8JiJH7/c4J9AqWq0eH14/HvTR5SIxzmXudsCVWddm/JBAiteyfBUN60HpJ4qQebAptoU7p4kIy2NWRABPk0v/+84/+f89pqJfN0VHi//HsE5/r3ftidrcQE6al2x9TN4VRcLGjewIR0GA6v3BrNwLrilLCLXZ3uHGIAHJtdvJulaeXf+Ezm5ffOL589fzZC69ee5VFtmlFdRVRyhBpo6lIrdFaKJUVfca1RSit68Xs7r07jXOdvBgOR4MkOW3TJ4ZbhvTnb146v3lm+8LFqq63Lj7513vdL7347cgxED1xOP3EcGu72wfRc7u3/9H3/jwy/2ef/Olzp07frSYQnF4bfvCJx9EZLH1Jmv3Wv/38v/zuc7vRKwJBA4mI1FVZN01d15GjY09EDOmzHYhZExuhxxJn7GYSFksNUbcq3L7NJG2cxZAEal1lfZUEYQK058v/62fsvNYmeUHvTdD8neYnriXVTTXLWLfl6TaEF4B8FA0BRpPZYF4KkYYcMQzRAfsGEcCA7I7uzjrZ3Y9/wM7LwavX7zTVpddfeubxZ+7s3wsHe0mWk9InYTKLNCEIyBhaIdNIs5yImrpKi+5jjzx2887N+WIOYJaYY6vvlrPXxnu9NDsnfOPyyx/6mU/7GP/4xedq537ymQ+aPP/g3tGtmzf+9Uvf/vKd6zfn02dHa5/6+E+e2dquvBfQzvro1NroQbVS69euXfninRt3XJ0a0yboJxlYW/AhkFE6Sst+WClW/+AT8ANmyJAawq5TvmbSocqCMLG89nc+rUvXf3X3ebV3jPpXwk8dS/mHnRu7utKyAiyJYBVmrhUFjEoN5uXadN5mJoYwlWXDdw61qfMBmbGmxenN0avX2RgA1thLVy+d2dqxW2fK/fvaJtTKBEiL86DxIXKdp3mepixSA3XVdlLBeXdqc1tvn16U5bSajZtq3NSZsRLjvWuvv++TPweiw9s3/vQv/vRLv/L/ZL3+lRtXf/2L/+5Pnv/O/aYS4D2b25/+6MdOb2457wGIyM7G+tZo2DKlW8LW969fO5iMTzIvIjBzXVdN07w99BRgIDYVHX7wRfxWA7RMwg5ooOymyvqUSIzI7JW//R+bhete3h28unvUrf+B/yv3efqv1OVjgYaBIlJEiYZVmDYUBZ1EFD1+697adNFSAQ8FAMaCGohASnYgphp073z0SdO44bXbkiS9Tm9RzozS9/bvni0G6+ceXYyPgqtbfqUIQhSjUNZl1VR5mq8NRhJjukpTszQzSs/KeSYyzLOMWSB1CNfnR9sXn9p+7Mnn/+RzL774vSu//vvo9n/jD37zSy88d/3V18qmfmq4drbond7ePr21HZb1SDq9PgotZajdx8a8cePaF1/4/u54rBK7fJNAIBFZ1juxIuS82Qzv8noHAyiTqrwXVT4XM2f2vezGz3+Q/vXXgtaNyNVu86uHH7/Tmf7OxeOZ3VBVCPvjMJ6I89AaSQK7xMYG9+4Ux203ijhQRGzADnEnTYemgGCRqPLsWn/jzPz11/bPnq4ODhaNpywHSBNdXyzibHZ22M+7hasq3zQt3ksBGTSLHFaH5Op86wxEWoX5xXRWz6fldKyU5k6Xur1ur6dj/MDm6Q+lGX/769968Xv/x2f+Onbv/c//9O//7vPfvltXfzMbXuwMYsOjUeeJ8+fTVE9c3U8TFjnXKRKjq4i8v1aHJivS//MLn399MlZJxkoHYYZooSbUgcMSGvGVIXKxbVuC0EMdZT+MAQTStfkg646yvhn0ahdI5PanP8gQHSJAU/K/VD9xt+N/8+LxzDK04trF2YIbB7Q8V7QVucHMndmv2k1CQA2uEVsoW4EUEWIsR72DR8/w3n61t6+sFaLR5un55DgEByC3pnT+7mQ2LLJ1o2HMwnurdWGMdzHVOtH5YbmQK68qpeeTIxakwiQizALU1WJRlePxUa8/YO//1e0rpPTf/PDHTg9GP/rL/+Okrg68/4nzj27NvWq892G0vbX9xMXJwWEUmTt/ptcRkazTz/p9ECXGfOl73zmYz0SQal0BTjhVOiNVi/POv3WVBULow757DPoOJ6Al1ZBW6fHCbfR2P/EeCnHju9cOrW4Qf7F+bCb+jy4uppaFhKC4qsV7PATpkUh/5i/cbxVlCIAGxvAW1M4AUAAxhzRx/W6I0Y+n6XDYjMdtJ3RvMDo+3G3t1kls6fykajzJutWjLIsiCmS1bm/7XpqFzMwnx8617MfVPE2grsp5UxPo8GCPRAqOgrg3Hf/K53/73my6AD559pFRp6MWk+D9YGt94+zpmuPeouoktrCGiNJOJ+sP2qKoKvLf+sY3jhcLRRSEPaCJNKiJ0TvvnV8tOxTgl+r88q5b/80GEIiGabVaSaB9LB85NX7fecUYvnyLXAiJ/EJ57nWaXlHTw7TfRrxkFFeVrEp9QlAsg5k/u1/ZuMpxQFVmQl1roAczRxTm2CmmZ0/Nzp7SSlGv62azbDQCAYzI0dg0RFf7KCKJ0T7KIngfmhHzdp6HyLRin2ki1qbTH4YQFovZKrECgCjiW1QyBgV0DRh46c61aVU3wCfOPrLZ60WlYgij7c0P//zPnHni4vUr11mkl9huYlk46/SICMxI02+8/NL9ySRyVC1ESqodHtjEEJp2/1EbF3tuZ1xIB6YvtiVqPpjv8a4ngKy26OULgzhKcCZ3qsxvjP3NXZMmn7KP3N4w3+7qCl1CQgAUhb0xl41AiKjlifa8rE/KrK5bloMC1eB7vm75bAzuKeXz/LDbma51y45NJgupOSyWN1hoauaYKK0dBQRABEprRM9zF72vm4hhr7OmtWee1vUwz+Fdp5Pl6eb4DlPTnBBCmB7oJIlIHQOAg0Xd1eoicMazHI6HaabSlDbWhxce5yQf708GpiiSjlKq1yuyrR2QAtHR+OjXv/HcxDOZ1LN4jooUiFzwdfCB2tniRIEbzyykBREygM1Jd1VSS/DiPQLA9m1XtHnYd2it2XvXzeN6YX2TXB6rvUUTvbPJnTPZ5W4zTxKFhBwEIGPC3rG4JXVJiFIXN6Z1d14zWl13qsG7CPMYhxo9ayfOPd7pTQf9+ztrTS/XkzkfTMvacQjsHYCWQUZEOkqeJJFj4CAQoxUrU/vYxGrmgu501jsdx2y0Dr5BcJ08C0UneF71OAoUQa/Kk0JlgAIyUoWyF5NMlRWLJI6f+OhHnv3wh9jFq29cdk3oFrlSVoi21jcp7yBG5MVv//7vvHzvvmPJrY0SjaIg3PjYthNL2xfDDOEYRQElgm2H/iqriFgktmgwWL8tKHpbHiCispQAszvL9hfk2Q/z+tHBNzedCaKZQBAIKSVNI3UjzAQwkQ08mDS9SaOY2xJT2zU2RUxAhdFR5HTRGdpkMsjdsKN9zA5noW5cXSlQDF5bq4zlENgHAumW6NrygAy12ZD3YTpb3HBNFfy5wdAzA4jOc5pkg05V17FuSCsixYgK6No814nnIOHYi+ykWUJqkKRjV2faFMaur62dPnf29hvXd2/fydNcIIqoyLMkz8AMpV955cVvXXqh8WLNcq1YpHLOh6CUiks2IxC59TM1YgXpQA1VnpFpJPAqaX/H15s7ZFhUJwfA4ylKVoHcKGvOD/12N2lVGdoaG5E4F48n0pLIiGzg0aQZTWrNwqtS0ARxhkjABkzXmEXwF/v92aKcWW2akExL7UJUWptEEXSSpkWXDMWy4rKWGEMMQtKaITJrrazVMUaVmGldT+s60bqbZsaa4EP0PunkMuyW+x6AstpAZ6I20t5WOtCA8uUkxq42ltTCu6Om2s46G0Xn/rXr3wjeWGuTpD0vxuit9QFCADCdjv/lFz6bWuuqspfnAFwIZVM3qwFAgflhFhaB2s64oTJ9lSqik5v4nbIBAWDk5K4mEmtYEU/nAnEmq0d9f37kTneV5wf1ujYjGk+wWFiWCKIo69NmfVInvCyvBiBAFogOQsA6aW/VY3nXGdq3VINRNxxDtMSiEl0AICKdWJYgSkWjwKxEMbez0IhElIiCaAKviBov3rt3fjjaXusnRkcflYlprxMbX4+noam7aZ5pW0U3C2UPNlWqA0yCG5jklndpXvgk2VNyPJ/evDQ5c+r0+uYGQIlVpCnr95CmIHz5he++dOt6kSRaaaVUHUPJ0TFrpVo50lYHK7K0UUk71DQCa5TRkj3PAiaIBsJSpU0BLCfy9XLSvGGU72QswrOSEhvX+u7RUXpqQ/kABax0SaAhrknKup2p1oTQmzXrU5eyMAgAAzOEBaJAMsASORvWB72BC5cy2ltbqxIVVUDHAKJJ55QzJDhf12VYLLz3znmbJZnXEpZpqIUYxKigrap8DAARWa2v7e9NmvqpM9uZMQBYdGd7G8T1+Kh2MepEIIfVUWxcL0tJoIEZ+0m/s722cQT8ucQLW/3zwzVnszHJZpYOh4Vk+jAxG49fnN+4/gff+catqlJVlQw2Jq6ZxlATW2t0ZGHRQdq51y4yAUF4itjqjY0oVyAnwYuPEjQ4hWq5Lil0g/odBjoDkOliOYty1LebI9vrnLDJoOhENqgl7Jn9YxYezJvRtE4Cx6XnkQhZILY6WAw5m9ooslm6e530MEuigNq6BUhrU3T76xunqtn8/hvXDm7dUVq3LSdhVpJSqq3WESCklbJEUaR0D2q/WZbN6vrVe7tPbm9l1hAoel9sntJ5EQ72pawBUSJaG9IteCDoDc/0e5FZE51Z2+iZREWeSwOTaIHJ8uGFCwT4cvH7f/G1b712uZcXrQzvjIMDLykOUYj5xLErosC87+q26/px6pmWtLT0S29yQW8BqB+SLAsMqwlEnUyv9VWWPKya8KZvV2R3DwGYw8lwFhKmk2eJwByxhujlcaMIPJonRLjc7wS14kaL5N3u2ceePnXu4t7tK1e+/d3j+3vmIcYrkapCpUklKklUmmoy8AClWj+k6g4AWqlZ3Xz9yhv/weOP5soSiENIim56oc/ex8mEm9r0h0g6J3ieSCCi7bWN7Y3NtTQhkb5NTmfdoU2ZWVkzPHf+6je+8b/85v97erQGgEDH0dXCKSlFhLb/frWsiijT5mo9PXn6AH7C9O+jcT8ESfqhE0AACw06etij1AovwaYHJtNAbPM7EqPTO3tt0VaWjE0K4DliDVar/3QhS85l9vHUfnbYOblrRDjvDs8//sz2+ccObt984U++Mj04NNaKSG/QS7KkqRoQ0cIsmnkZyia6oFShldVkFPUzs9fUK1UMULsESfKNK9c++siFbpoSSJiFmZQya2vtr5QmAMBwg4W3U3X21GmIRJbIogkCsEg7L4IEfrF46ff/cNBvlWEEQC2ckVqCUZGX2391f4o8ABwYeMoM+SRkefCS1fP+AAOQSJOmnCbGamtJaaU8CTG0ImkHkIgole0env3T5yvCQkkfphONh7QTbSdwxwhqRY997Klzj4yrp4/dZ9c7d3rd9rdE59ZPXTj/ox8hou/80b+58s0/T0eF7ZrRU+fy9SGP56QU74+hiUi6pruYL6KP81gHRf00T7TpkOlbG0NoT11LxEwAmyTP3bq1M+g+tr7WT9OFC4smEKCVGnQ6yFQ/z/ppMiyKxFhmJwJrzFDrlCjEQOTPndk5d+7R2WT2m1/+yi+9/vJmvzMWSfJURPJk2cRBi1J8aKmOLoRxuVg0rl3ddj7aM9T/cX3q++GQiQOkFhUltUBBLUkvRsE0vpMBHrYTPfSXFtoUgLXO7+yvf/3SQlNJcQDbgXbELT7jIH7pIqm9OS9O6sfHzb8523uja6kla1bVe37qp0+/9323nn/+lS/98fxgP+10TJ4On7yYDfttl8Ri71hpVe5PdB0JZK0VAXOoo5cG3SSLwlqbsGqMtoAHHJAA2uj7s4UIHlsfJdqKiDWmXxQEnF9f76YpiwRm28otGdse3/ZPO84W2twsF3/r937rVH8gkDRPRcRaswzlGwcWgXSyTBHdq46nzYOGegABeEaPBMtWxQVzEMlJMeCEhURWUNU7GEAb/eaSQptMrs4W0dpfvJzfPxSjS+8SUAe61dZRIA9edRSjnVT4Y1Q8NnGv9ZKr3USLNM5tXnxi530/Uh4ffeXX/snR7duklDZWIBzi4s79g+9fAlHRGZyw20gpXztmNkYrSqITF8OkKVNt21akdjpzK4Xe2kADRqm9+YJFLq5vbA0GIUYChp3O0WLBzL08X+luUxNDEPYmBejcoPfR82eSPPmHX/j8L3/hc6f6AwDaGFlxe1HkmM3ROLFGCSrnGufLumlHofjVM7yP+h8wG98PB7ScMioZqQ6ZWiJWoxtneGj/v4teEIA2BAcLqmZ46Xq+ewSlhCghtYHUgSvE1p6tF6IV9rkDs0P2SqGudgwzcwynn3l/UnTe+Pqf3X/1lbqsldbLrsZW8PlwvGxfOZxgVdS0yhJARCFEw7HdNlG4Dt6QMVo7Xl6GKQCBX20ereiorET2L7KcWVvLrY0iLHJcliLSL4rSOwFSbTpJ/uzW+naeFcZ+88a933jxxW/dvdFL05PmU2OWMr9SN2CBNYp5UVbO+dr7snFYDXlsbfCMHrYPr0EL4SjSU7qrVOR2qMHDXma1sYGsfdMkRheF6RWmXyT9Ih31bacQRcr5zReur9/YdYw5o9DoRVhg2o62VXDgIBIhNSJr7KTdZzprIHrt/aeFJRBSY25Jfv2Fb7q65BDaJrk0Mb0is1ozt3dkQwBMHkPTssO1b+WmKASHwJqUEDgyCxMpGCMhEHNs+/cVmoBIJ8dbNJHRapDnT506vdbprPf7LNLGi0+PRmFO9TIAAAdrSURBVK0jsNqMyFw92v/avetvTI4jy5IYbxQESZaQtQAkxlSEAEUYT+vpZBZDiDH6EBhoWlYA8HGz/sn0/EFcgGg/LiYcvPBp0+0qe8x+ysGDj6U5lPowunr1oG87ASefgcBG2UW9dvl2sTsOURaCnJaqxvMl9k2VsCcmoiBSSyyU3UqKRJtA2J1MDIs15jsvXXJ55qrFktqqYbSyWrV9h4kybU8QEWJ0yx5enHhL0drE6EMIbdlLQTEzmMkYOLeqDMIQCAhLNggxxMd4VJbfvXkjMeaRjY3ILIKza2tuMQNglP7u7ZtBSRCee+c4Wm2yJGnBXVtYkpX7TRLtXN14AMwCIh9CW7l8kAqA3qP7hhQTjmLZ1gMKsiOdA8gJkdRY6rfHpe/sgoRI1747P8p3x537Y0RZCDKiTEERypXycw0ESEIqiEThkUkf7QzXk3y3KfdDvX9PWaWODo+m84VijwdLKy1bSylKjLVka1+3pFtlDcfIwZPWALyrtbFKaWNtFMTlXFSCMRQjmKGUBscWjyEogQGiYPkGgZlL5yrvX7t/vzX/nfFxpgSAIhqXpc6MXvH9281HIGUUKRLo9jGglPPhcFwyiwic8y3/WSklRIjRgH5EDw3RQSzb9POISxG9adIoLBDdFgHfKS14cyZMbQ2LRCtTu979aXYwVZFFUbvFWNBI6++EVoOJvXDFUYHWTJpAXS/H99yiEY5F9+jouHRuvd+f8GqK/QPkCUqR0drAZDZLTJKa9NCVvpxBKW3TVCVpknvfhOA1yFoLIMaVmyESZlqVxtqUMaxOjTnJTZZkKVRu+QCl87ldfVyBaVuLVv0f1MKwiUZLxxOAoII/OC4h0IpcEGZuEUms5uydouxZ048QQZxxM+G6ljCiLCPDywL5m8Kbd46ChNn4kDYurbRSlC+aYn8qLpRo54KgYQCIQAMQqAFbKAWaS4zAkJQnXCF3HKuK2MewmFeOY3eQJb2EjlyMS401pVVkqYOPDYdEUruSbWNy86ZXDEfrG+PxOO2NovdhMvFTF2JMjbXWCtD4qCUKYAghCtqMsXVEAshSKVXQ/suqQ0wbRRBAk7QDSltZdIISJq20VqS0EWVAFCMJ4LkiILhIwovaZYVhx75pd79mLKHQHpKzugsyJZiF99kdsM+UTY1tVGyDw0ZQtf2rAghFSCsM8rABCGAToiprJaJqJ4s6lLVXcMsPqFYpAWqAgAYSwQG8ADJSQuqA/a73UULgKATPvhgWJlGlazgwM3NkEEgICswITAoMqY1OBFxWi1T3oqftzVOba5t3ZtOyKlkpJsUhksTEaqPN/9/etezIUQTBiKzq2WmDfWC9cFhAmP//EeR/wAhZXpBA+8Iz3fXI4FD92vHuyhwQF+owmm519WRl9WRlRnVGHpPXomCoZHUBvjxd5ouH0SL4+ZjGeXfMCAchmYUYjTB6s410RypLUqmGPHjxkkqzbsdDKmNVEQCfuS52CK/Zv2D3uycAtxoGz0ehR0zmuRkLKstG4KB69DJ6wzVPJwAS1tSOXGLKUQ1uhoTD3AGz40XgCCTJISfv5R9zvS+Jgksv9y+0R4gc7kvNnqe0t8lVpbHruq7rYrTdjl/0L10q+xeX37355ed3Vx+u3vz4g25v0uGYh0HVzVhdQyq7GGK0Yawka0Nf5/yxh0H+Ek82u24SWi6YhfauI4PRSHcBqu6CQENeSZZyyXWsC+iTD41MmAEkWQUBPWPPcK/sngD8UY8kzxCy6k1dHGMYwuC6rsc7HwfUGaTgiQliquUMTEMSENxtwrkh4LgZ4HYtac5KlgvIKhm1j92r3b7K09HzoZbkLWsXQGMPazqTVGsl0cUeRgO//ury9cV53+/f/vT29vrm7JsLCyEdh1LyWYioyKWqkaMSuS7yPEQMZ+GMjb95TfgNYbZHQDBzKeXqqut4CFhZDr04iBbx+eicMH8FWs8uIBfUnru/lO8mGj0MKBAieV2HnrslsKXK4PXOxxF1AcqmDZmTvZqUV6zRgSWBLW0v2nTJ4FydiIB2IbzqvzSzq9s/YziDwJlIcH6rWS1lQ55i10l+czuoEecV/fr+/bffX55fnF99+M0OH0OMEiCW4hBcyKW60YjsiiscdypXeywcGzdxonNuNZo1plKqnif2YaGgro/5WLaz7HLRAg1iAu40hlmGPQjgWgnQ2CzbLNCo0ojkHapoqaxNIsblInIqo0sDKrhhW9+KWTfT0YpWAjCY4BXFJxBjWjMCd1Vp4ejY6mnyPFZk14EIejwzuZlEohRKbUPYH/ZaFfWUBp++TJuzyzQGM4Otmx7N6Bblkx8gnJBAhwEkwn6+Y50VpU1AtXQTmuGSbyr5cC7Ug/b3emI8YvN9prZ1XjfMdCAmTtcVjf0n9FFyPUWh5gsJUnvR4Vm9n972E20sWlYDbjGtJFzYk4BG9zdnvGyeHq26kx50Add0YGkqdPqoPOsEPIsFbRrXMTwWTkyGipvD+dtnp6v9t20D769nHtPgc+Ph8vGEmj5tnzsB/7d/qf0N3QHgBo2zf1cAAAAASUVORK5CYII=";

    const ZED_ASSETS = {
      portrait: "data:image/webp;base64,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",
      passive: "data:image/webp;base64,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",
      q: "data:image/webp;base64,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",
      w: "data:image/webp;base64,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",
      e: "data:image/webp;base64,",
      r: "data:image/webp;base64,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"
    };

    const RENEKTON_ASSETS = {
      portrait: "data:image/webp;base64,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",
      passive: "data:image/webp;base64,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",
      q: "data:image/webp;base64,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",
      w: "data:image/webp;base64,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",
      e: "data:image/webp;base64,",
      r: "data:image/webp;base64,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"
    };

    const VLADIMIR_ASSETS = {
      portrait: "data:image/webp;base64,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",
      passive: "data:image/webp;base64,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",
      q: "data:image/webp;base64,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",
      w: "data:image/webp;base64,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",
      e: "data:image/webp;base64,",
      r: "data:image/webp;base64,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"
    };

    const GANGPLANK_ASSETS = {
      portrait: "data:image/webp;base64,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",
      passive: "data:image/webp;base64,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",
      q: "data:image/webp;base64,UklGRgIFAABXRUJQVlA4IPYEAABwFgCdASpAAEAAPm0skUWkIqGXDbY4QAbEtABZf/uDsklV1t5B7ITW3z58DzzN8l3myzx2w2fT6T7QMvaGY8y+YVu0+h92Ti50ik0/9jPQH9WewR+s/W79GZq6/TRN6aMhqw3h2bneyf8A0YgS6ymFWx2SMgKG1EWZ+WdaMsLDXfyTRkkKBf8aAcwOTu+oAQrkWpMDDefrA9AlKoo4G77IbUg85DsrbhMPfaYijvO1RXRwAhcv/TsOHtx6AAD+/7EiZzVFPswTe/X09zczEiEWk7lrUrA2DoF2elzCIiWy0pSShNw4Rr0tzvHKY9/LTCHFWppxP/O62VG5FX1xS9i+eDVOT6CJbBXy16EQc6DWukmdk+zv2Hm85IiTdWvEMdMb5I6cqIg06ZKAkCyb00YGM+yAkbBki59JWIUlm4CgO19jXcgEtPKaRAdhn96efwOwqZ4QzHIjsyVanl0zFuJmzjdUBE6XUKH584sDrqYCVcVsFhhNQWEse6OGk1wAov3aFihwcqXKEXAcwjLO0FOPXvAgYgQaHvyp1DMI7cD3pdJZlnYSfo3p3SLNfyNvXD1DPgCR4epiS6A217salk9caQpz9JGb+xHMmlUb+giaF/26X9G5cOGs13B+sBX5Nfsn45+ePEoB7MncNjH6oL1COZPTrxVyZ3OVWFg+EWjl7fv59L1Fs6W9iNEvn8K76D71T1L3qUnidopbuv4dT8IG5mfFa0zaZ72iH+tREpHoi8xNGOSmGvSTpbPFAvY9t2bcZLDJjj0L/rnp5DXyKwWr1/3Rk8iJ1r/JZ3zgOZIEGwfbd9gcvahktyvW8N5/O/yutGROd3fkrSf/7zPYpYCq3Q5AdYYsiqmIU4tjreVYEVykTwCmP5/ilLbGN4WHXJTtphjAkthTrVMq1VvKh+lZmPpC+5ijvZnfNJOL7605gGUv0RGUDmuRDMktZTleBTQLMR7as1h6qq+EinqinMjFqVvlMnPIVL+4X6LO5jBwILvmLQ2VcJN3+Daq06KzgUQOxXq2yLo73X9tS9nGMpOlOcLpiL19seRPVOSRG0sZuOObiYfa+YP+7OWM+UXJ4cOe8kWDxM+Est4O/+/bdJr9gXk4bfy+YVSYkXhGV38fxGVUkl01/F9FnPhaDSKD1dIyCfsGoJ4RGZ609OGijBWFG+QtfuGfpPp8jLPwdIb0jKyB9KK12mhsRpydg10IyXcSO/q6BL0Ys+Cjn7xmv5wtQ9bv4ffiBp4kDprHzMgEemKXiF8ceZixQt5p1Jetb7U6Fjt8HRfsFZM1t0tNITd045xzrITqbYLSbBqfe9n7gjd314nadW/aUzzbFrqRkRWr9DWBRe1V7B2EcikNpbxw/q7czSmfrJDDxKG3RT9HPjf/9pgseMx6u/icVr6fzzzQpS45S2cAwfZ+IVRGlauv6q8lVjR7nhHDuvyTjSVFcpgb6T+ESrlMflqUDCu5yYtrMyFuiNlGMxbMdZdM61vwO8DT+af9RLB2+U3LwWtNc1UvU3WQzPdSFKU5t0QHa0I1oFCGA1XQ9QyN2Nk9ic//Y/F/VKS7bBIh+NB3URml/b/Yod6OT5LxFRgBewQyF6qF6rZYxjdZUVsdq3z2w7M4KdAU9H25FhXDQ18/l9GGvq51xZqaSS4UELAAV+CnSQZo3arNfblt6WxpiACwDn65GGZVAAAA",
      w: "data:image/webp;base64,UklGRvQEAABXRUJQVlA4IOgEAABwFgCdASpAAEAAPm0ukkakIqGhKhzMWIANiWwAnTLVQ3eieZFUP61+AOCsJZmS9sHb1+aHHQPQa6U/90vSkwOppPqy+l4lEQ51Yw5N2dFh7J/QAZuhWO9Rq69ZDCLovH8yNdjT7TDEM3hUnXCUMOq/P21xA5KVp/SYl+6S2YCCgMlDmG2dkc2KHGKCKKoN68QqvwO+0+A27wA14Apc+yETUZ0RCM0W0dbzIbOHcfnAaVI3l+DwtdgfT5TUwAD+/vWnaO3uEsdEM+ajFhcCa/4NMHGUdy/+Evrl/VYoO+erGNGBrSJek2DdstsWHzH2S+u6vp+6rjBdSGT/hBq71z5zki29DJcu+0fDiJT0WgUmrfjUpLWZvWXXvigGfvYWLf+GuBNr4kAjx1v52xGck+TBUsTlDHWv7lbuyveH31kLSb88ZEbMURTGf0j85FAGzZBPuJdfrNqmFfPfpuJ14x7LaAU+UcggnbE2C/4YUKM/Zf2Zn1Q/Y+Z+vrrjR8ZynVg6zhKdtrCG4CcHfZKBz0MTNd914ns1KVHcuoJdriM2uXpVWyFPwryLFSCOD1/WmKE5FmMtlPrWr2Rk8fhb0UM2xET+myFhhBzQzxlDrFRS3CiWUkWUbbKR+jnWLOWKEN5wtzPv/sDT0XAeH1+EDX2vDw8EOdQWc5V8zVJh9QrDEFQ42gglpIigyDfvdQ74iZJRTG4XHb7A39/lvHYU2vDty2NCSoQYiWQAX/vO++gWpe+Lyt4osl8W+zUhpMvq1ROddE76oxd2ZSayx0uim+2g2G51YQAX2hPKx3XxUAr6xHsN+YuD6PLzlj6yXKRJBjQxJV9vk1iBK+i5HIiIDN0A+dUP1Fm2ax7egP1uuzko7vtOS6+iLjhZbSdyzlINMif9RXfMl9HrUKy5GVSrQGf37//OpcSo7z2X3u8f9YzF3CxiftH/drOvMBHUYSdsLzosDekEoPvq80czr2pF9akjNkWcEVYdrFYgCRtSYOKGTovscDB3Yy4KeCx0Hc/Aps4Lg+W8k5gfeN8HYerCmaMeL3j3PQFId1+RPxZTrc+XWNJb8zUt3AZQYpQ4Dl8zekyINjTqJB028tEbDgR7muMNE9+C+6XDQVBWOoV1iEMrY6QLQmDmbYzh4OTHkv4T3T6S3STTqtg1UI6t0SBPweRgpatBN4Tbc1Dy7KIU2KYp2m7lwMwAZZj3TXPh10DAxgevNWHRtGWn8+R6zYQVH7wvQ1c4oYfQjhpqh/jLYMmihjheiRmxDKiUDG9pXyY/bCmmaJdiIA3JW3PKIf8+W+ZF++TL+XqeUecfPZbCE1figqVG3veilM0ROKy/wm+QS5OfD/+mGWHGaxyJW/l5Yx55tp/+md9/TzyPCeWRCeojmK7/q8/agQ0JKZ9AcqJXaagWrYJJwqlCh37oAK8aQKCpWSJ+yLteDItfX/Jry987jb3k0XHKHOK96etye+rUnBHGTml5hyeeq+5RYXEGX0VbKltgFYHksnZKo5oLH8TL+5vIYZCTB6J9JKP7aFvZpZ4kINybyN4vsRZmOWOglMWcyGBCBM0e5hEZHae1959QtIQhZ/jJaB3mj9yExhlX+1oCzjNFjfXQZETbCtwnvwS5hLGY5dIYGEOYVBfLwzlsl1w2lU9yoTao9NPZjVYUC3UJCffwzAAAAA==",
      e: "data:image/webp;base64,UklGRnQFAABXRUJQVlA4IGgFAACQFwCdASpAAEAAPm0ukkYkIqGhLhkpyIANiWgApd+cxFe4eapZH8tuTJyIZeFZ9H/1M28q2YJtN+7+Bvji+K51OIO0f6o4wWVm2HvucJtLXNW8lWof0qv3AWNe1KUZOQqYEhO4Dv7y4A3k7Co9MbeLtPbLDvuTjPHcZkTkg+oYFCB//cRJZDvD8eYW6hyXaa8E6yD0XdJMl7neB5a/JhPLKlT5JPDEaJPnh16cQpVt+mvbadDz8IlNVkGzd60wJfsC7pA5UgD+/lK8Oa3z+d9/I3gHcwQFHtDHH8AAJb+A34tqqidFBZyGo5EmSgH0v/8W3GwLgBCYM90xAdfzgC9ihaCsuzhMOsd5fmz/ibfb/3ZPI+HWRoO4n4FZuYzcVv2/TvcPYql9qFQVlC1FH6spUCWdg5iwFz4KPSxe96LtwV7rX7VstHYgMG7oD2237jmYoNnbqcPaUCqcBxp9qJNXP+9z352hzlcyVXePWfLuawDoheTfpJke5eynYzYTJLX4RMwaQn1Jtm8TdyxX4/mmm6XpCMerIq+M4uJOdNV0LoQY9ZWkKr/Ef7P+eXTQ/QJxd8bSq8oLdUR5PLAo/iluB23I6X2bBFWL6h+voJChWQgy1yjNah+f0CB+EyiVb29tNsSX/mot01re2TwNm4tdKbA1sFrof4ppvie0jo50EEGxknfd7rr339YA9v/BTcXXTH69+6M+Z+atBNdC1ZRrYJfgB+Hdr6MlvVV7BFRwluxXTTjDUAEllbfpcTl/yaJm8boQ5yTYUZzF5z1dY1dXCHiAhVsKPUk3+baZ1/+Z2nI6jZo9AsfWEM2uWZRZXdd7vzPaoODtpEJxFyfxyO15177j+ADFlvbcpcaeK9XOqOUxj4BtpEsPVqcLugBy6b5YCDI8ytuhp/2lprL/CccNfuLOCCihuqEZp8B5TiM43PWW/Q00cS0S+OyudlIwh8LDZCnzY5s2Ery0yyDxiHzxPu7gsChnOqKUX4IHq4LjhB/wBApBSrEtIB1m13TPZ9LAcbedNVFg4k02sPfDDntm29uH7YguvDImgvmsJah+5leZIG3MMUCuRt1zAHDFMXVJTIS9nL/nGZNZhbrXE4h/QiWT2rx/bUHZLqDB+fnOuYlPxCtuS2oTiWuv+MpgQhAuepQ+4dCZb3zRsuK1p/9rW6WM3GYkkvuw2EjxqQ+hNHQX+LLQlM4TT25A6GwJHZZjVD+z7mXwJWk5GO+969c+kG7j5TgRwYXYggqftVoEp0I8T4AYw1cXBlpBw+KR5pn32yq8a1I6HP9/zAwmsYGuEJBfzZXVOWvtS9zKwJWLhfJup0HQhObN+mB+QdVsG8t7pbNb3nLOJEuJvNv9V4Q88xOT1hGM5It59hAqSOE9Oxedxe1lhwCcoilz8dRDEBjvAfZZLVJeDEqdbfLNYr3KkW2iSJp2vYhW05q+10kE+JgBa2TLsvy4G3D63cIb304h/E2uLlUWKpgKZYlVbJFAFlBpvAQp4Kz7anaIapIrkHucU7e5yJbLIRn5vnfc2a+JQxc6gseso4nVkqPstL/F1q7Vzbtsxrx2eE/qHLYkmZ2s4CvdQw0XTAg5BMW3eDDhRiuQ47EWJBFa6GEqnjmN69hWY/jZ187IO2PwMzs/8c7lJt06w7z22dws+AYY8RljxqqOwVvIR9JcTekgvv4BFLXZi1vo+X48mIKkkGyAKKa6uvnDxjs5N7xRN79iFg7RjzWqZYE3a25MMJkzYMg5/p9HaEVtptPdsM+eain/NCJDI6qwxSOlJXYlTcPrxVC6WdQGsehIPbx3bYurwYcgM9pmA/wmzdOR3ImTkVM68jFSboSAAAAA",
      r: "data:image/webp;base64,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"
    };

    // Real LoL ability art for skill crate drops (DOM tokens + spawn metadata).
    const RIFTBOMB_SKILL_ART = {
      katarina: [KATARINA_ASSETS.q, KATARINA_ASSETS.w, KATARINA_ASSETS.e, KATARINA_ASSETS.r],
      zed: [ZED_ASSETS.q, ZED_ASSETS.w, ZED_ASSETS.e, ZED_ASSETS.r],
      renekton: [RENEKTON_ASSETS.q, RENEKTON_ASSETS.w, RENEKTON_ASSETS.e, RENEKTON_ASSETS.r],
      vladimir: [VLADIMIR_ASSETS.q, VLADIMIR_ASSETS.w, VLADIMIR_ASSETS.e, VLADIMIR_ASSETS.r],
      gangplank: [GANGPLANK_ASSETS.q, GANGPLANK_ASSETS.w, GANGPLANK_ASSETS.e, GANGPLANK_ASSETS.r]
    };
    const skillArtUrl = (champion, slot) =>
      RIFTBOMB_SKILL_ART[champion]?.[slot] || null;

    const hexToRgb = (hex) => {
      const n = parseInt(hex.replace("#", ""), 16);
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    };

    const v3 = {
      sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
      dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
      cross: (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ],
      norm: (a) => {
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / l, a[1] / l, a[2] / l];
      }
    };

    function mat4Multiply(a, b) {
      const out = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          out[c * 4 + r] =
            a[r] * b[c * 4] +
            a[4 + r] * b[c * 4 + 1] +
            a[8 + r] * b[c * 4 + 2] +
            a[12 + r] * b[c * 4 + 3];
        }
      }
      return out;
    }

    function mat4Perspective(fov, aspect, near, far) {
      const f = 1 / Math.tan(fov / 2);
      const nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    }

    function mat4LookAt(eye, target, up = [0, 1, 0]) {
      const z = v3.norm(v3.sub(eye, target));
      const x = v3.norm(v3.cross(up, z));
      const y = v3.cross(z, x);
      return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1
      ]);
    }

    function modelMatrix(x, y, z, sx, sy, sz, ry = 0, rz = 0, rx = 0) {
      const cy = Math.cos(ry), syR = Math.sin(ry);
      const cz = Math.cos(rz), szR = Math.sin(rz);
      const base = new Float32Array([
        cy * cz * sx, szR * sx, -syR * cz * sx, 0,
        -cy * szR * sy, cz * sy, syR * szR * sy, 0,
        syR * sz, 0, cy * sz, 0,
        x, y, z, 1
      ]);
      if (!rx) return base;
      const cx = Math.cos(rx), sxR = Math.sin(rx);
      return mat4Multiply(base, new Float32Array([
        1, 0, 0, 0,
        0, cx, sxR, 0,
        0, -sxR, cx, 0,
        0, 0, 0, 1
      ]));
    }

    function projectPoint(m, p) {
      const x = p[0], y = p[1], z = p[2];
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0.001) return [-2, -2];
      return [cx / cw * 0.5 + 0.5, cy / cw * 0.5 + 0.5];
    }

    function buildCube() {
      const p = [];
      const faces = [
        [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
        [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
        [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
        [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
        [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
        [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]]
      ];
      for (const [normal, verts] of faces) {
        for (const i of [0, 1, 2, 0, 2, 3]) {
          p.push(...verts[i], ...normal);
        }
      }
      return new Float32Array(p);
    }

    function buildSphere(lat = 12, lon = 18) {
      const p = [];
      const point = (a, b) => {
        const y = Math.cos(a);
        const s = Math.sin(a);
        return [s * Math.cos(b), y, s * Math.sin(b)];
      };
      for (let y = 0; y < lat; y++) {
        const a0 = y / lat * Math.PI;
        const a1 = (y + 1) / lat * Math.PI;
        for (let x = 0; x < lon; x++) {
          const b0 = x / lon * TAU;
          const b1 = (x + 1) / lon * TAU;
          const q = [point(a0, b0), point(a1, b0), point(a1, b1), point(a0, b1)];
          for (const i of [0, 2, 1, 0, 3, 2]) p.push(...q[i], ...q[i]);
        }
      }
      return new Float32Array(p);
    }

    function buildOctahedron() {
      const top = [0, 1, 0], bottom = [0, -1, 0];
      const ring = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
      const data = [];
      const face = (a, b, c) => {
        const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
        data.push(...a, ...n, ...b, ...n, ...c, ...n);
      };
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        face(top, ring[i], ring[j]);
        face(bottom, ring[j], ring[i]);
      }
      return new Float32Array(data);
    }

    function buildCylinder(segments = 18, topRadius = 1, bottomRadius = 1) {
      const data = [];
      const push = (point, normal) => data.push(...point, ...normal);
      for (let i = 0; i < segments; i++) {
        const a0 = i / segments * TAU;
        const a1 = (i + 1) / segments * TAU;
        const n0 = v3.norm([Math.cos(a0), (bottomRadius - topRadius) * 0.5, Math.sin(a0)]);
        const n1 = v3.norm([Math.cos(a1), (bottomRadius - topRadius) * 0.5, Math.sin(a1)]);
        const b0 = [Math.cos(a0) * bottomRadius, -1, Math.sin(a0) * bottomRadius];
        const b1 = [Math.cos(a1) * bottomRadius, -1, Math.sin(a1) * bottomRadius];
        const t0 = [Math.cos(a0) * topRadius, 1, Math.sin(a0) * topRadius];
        const t1 = [Math.cos(a1) * topRadius, 1, Math.sin(a1) * topRadius];
        push(b0, n0); push(t0, n0); push(b1, n1);
        push(t0, n0); push(t1, n1); push(b1, n1);
        push([0, 1, 0], [0, 1, 0]); push(t1, [0, 1, 0]); push(t0, [0, 1, 0]);
        push([0, -1, 0], [0, -1, 0]); push(b0, [0, -1, 0]); push(b1, [0, -1, 0]);
      }
      return new Float32Array(data);
    }

    function buildTorus(radialSegments = 18, tubeSegments = 8, major = 0.72, minor = 0.28) {
      const data = [];
      const point = (u, v) => {
        const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
        return [
          [(major + minor * cv) * cu, (major + minor * cv) * su, minor * sv],
          [cu * cv, su * cv, sv]
        ];
      };
      for (let i = 0; i < radialSegments; i++) {
        const u0 = i / radialSegments * TAU;
        const u1 = (i + 1) / radialSegments * TAU;
        for (let j = 0; j < tubeSegments; j++) {
          const v0 = j / tubeSegments * TAU;
          const v1 = (j + 1) / tubeSegments * TAU;
          const q = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)];
          for (const k of [0, 1, 2, 0, 2, 3]) data.push(...q[k][0], ...q[k][1]);
        }
      }
      return new Float32Array(data);
    }

    /**
     * Circular skill-face disc (TOP only, +Y normals).
     * Local x/z in [-1,1] on unit circle → UV = xz*0.5+0.5 for mapId 4.
     * No side faces (sides were reading as black rectangles in iso view).
     */
    function buildSkillDisc(segments = 48) {
      const data = [];
      const up = [0, 1, 0];
      const push = (p) => data.push(...p, ...up);
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * TAU;
        const a1 = ((i + 1) / segments) * TAU;
        const p0 = [Math.cos(a0), 0, Math.sin(a0)];
        const p1 = [Math.cos(a1), 0, Math.sin(a1)];
        push([0, 0, 0]);
        push(p0);
        push(p1);
      }
      return new Float32Array(data);
    }

    /** Thick coin body: top disc, bottom disc, cylindrical rim (true 3D token). */
    function buildSkillCoin(segments = 40) {
      const data = [];
      const pushTri = (a, b, c) => {
        const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
        data.push(...a, ...n, ...b, ...n, ...c, ...n);
      };
      const yTop = 0.35;
      const yBot = -0.35;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * TAU;
        const a1 = ((i + 1) / segments) * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const t0 = [c0, yTop, s0];
        const t1 = [c1, yTop, s1];
        const b0 = [c0, yBot, s0];
        const b1 = [c1, yBot, s1];
        // Top (for solid body — icon is separate disc above)
        pushTri([0, yTop, 0], t0, t1);
        // Bottom
        pushTri([0, yBot, 0], b1, b0);
        // Rim
        pushTri(t0, b0, b1);
        pushTri(t0, b1, t1);
      }
      return new Float32Array(data);
    }

    // Riot Katarina game mesh, skinned into grounded gameplay poses and packed for this single-file build.

    class Renderer {
      constructor(canvas) {
        this.canvas = canvas;
        // Opaque buffer: no page-grey bleed behind the arena void.
        const gl = canvas.getContext("webgl2", {
          alpha: false,
          antialias: false,
          depth: true,
          powerPreference: "high-performance",
          premultipliedAlpha: true
        });
        if (!gl) throw new Error("WebGL2 is unavailable in this browser.");
        this.gl = gl;
        // Render at up to 2 backing pixels per CSS pixel on phones (DPR 2 cap),
        // matching the menu previews. The adaptive scaler may still step down
        // under sustained load, but never starts blurry; the pixel budget keeps
        // weak devices protected.
        this.mobilePerf = mobilePerfTarget;
        this.maxScale = this.mobilePerf ? Math.min(devicePixelRatio || 1, 2) : Math.min(devicePixelRatio || 1, 1.45);
        this.minScale = this.mobilePerf ? 0.9 : 0.7;
        this.pixelBudget = this.mobilePerf ? 1920 * 1080 : 2560 * 1440;
        this.scale = this.mobilePerf
          ? Math.min(devicePixelRatio || 1, 2)
          : Math.min(devicePixelRatio || 1, 1.45);
        this.targetScale = this.scale;
        this.frameSamples = [];
        this.lastQualityCheck = performance.now();
        this.particleData = null;
        this.shocks = [];
        this.cameraShake = 0;
        this.seenBombIds = new Set();
        this.viewPlayerId = 0;
        this.viewZoom = 0;
        this.lastViewProjection = new Float32Array(16);
        this.mainProgram = this.createProgram(Renderer.mainVertex, Renderer.mainFragment);
        this.arenaFxProgram = this.createProgram(Renderer.arenaFxVertex, Renderer.arenaFxFragment);
        this.katarinaProgram = this.createProgram(Renderer.katarinaVertex, Renderer.katarinaFragment);
        this.vatChampionProgram = this.createProgram(
          Renderer.vatChampionVertex,
          Renderer.katarinaFragment
        );
        this.particleProgram = this.createProgram(Renderer.particleVertex, Renderer.particleFragment);
        this.postProgram = this.createProgram(Renderer.postVertex, Renderer.postFragment);
        this.mainUniforms = this.uniforms(this.mainProgram, [
          "uModel", "uViewProjection", "uColor", "uCamera", "uTime", "uBeat",
          "uEmissive", "uMaterial", "uAlpha", "uAlbedo", "uAlbedoTop", "uMapId",
          "uFloorProfile", "uArenaProfile"
        ]);
        this.arenaFxUniforms = this.uniforms(this.arenaFxProgram, [
          "uModel", "uViewProjection", "uTime", "uBeat", "uPrimary", "uSecondary",
          "uMotif", "uIntensity", "uSpeed", "uDensity", "uReduced"
        ]);
        this.particleUniforms = this.uniforms(this.particleProgram, [
          "uViewProjection", "uResolution", "uTime"
        ]);
        this.katarinaUniforms = this.uniforms(this.katarinaProgram, [
          "uModel", "uViewProjection", "uChampion", "uCamera", "uTime", "uBeat",
          "uIdleMix", "uRunMix", "uMoving", "uCast", "uHurt", "uInvulnerable",
          "uLotus", "uVoracity", "uDash", "uShadow", "uStyle", "uAlpha"
        ]);
        this.vatChampionUniforms = this.uniforms(this.vatChampionProgram, [
          "uModel", "uViewProjection", "uChampion", "uPositionFrames", "uNormalFrames",
          "uPositionMin", "uPositionRange", "uVertexCount", "uFrameA", "uFrameB", "uFrameMix",
          "uPreviousFrameA", "uPreviousFrameB", "uPreviousFrameMix", "uTransition",
          "uCamera", "uTime", "uBeat", "uHurt", "uInvulnerable", "uLotus",
          "uVoracity", "uDash", "uShadow", "uStyle", "uAlpha", "uSkill"
        ]);
        this.postUniforms = this.uniforms(this.postProgram, [
          "uScene", "uResolution", "uTime", "uBeat", "uEnergy", "uHit",
          "uHealth", "uShock0", "uShock1", "uShock2", "uShock3", "uReduced"
        ]);
        this.meshes = {
          cube: this.createMesh(buildCube()),
          sphere: this.createMesh(buildSphere()),
          crystal: this.createMesh(buildOctahedron()),
          cylinder: this.createMesh(buildCylinder()),
          cone: this.createMesh(buildCylinder(16, 0.06, 1)),
          torus: this.createMesh(buildTorus()),
          skillDisc: this.createMesh(buildSkillDisc(this.mobilePerf ? 24 : 56)),
          skillCoin: this.createMesh(buildSkillCoin(this.mobilePerf ? 20 : 48))
        };
        if (typeof RIFTBOMB_NACRE_APPEARANCE !== "undefined"
          && RIFTBOMB_NACRE_APPEARANCE?.buildGrowthMesh) {
          this.meshes.nacreGrowth = this.createMesh(
            RIFTBOMB_NACRE_APPEARANCE.buildGrowthMesh(this.mobilePerf, 0)
          );
          this.meshes.nacreGrowthTall = this.createMesh(
            RIFTBOMB_NACRE_APPEARANCE.buildGrowthMesh(this.mobilePerf, 1)
          );
          this.meshes.nacreGrowthFan = this.createMesh(
            RIFTBOMB_NACRE_APPEARANCE.buildGrowthMesh(this.mobilePerf, 2)
          );
          this.meshes.nacreCavernShelf = this.createMesh(
            RIFTBOMB_NACRE_APPEARANCE.buildCavernShelfMesh(this.mobilePerf)
          );
        }
        this.initialiseKatarinaDagger(PLAYABLE_CHAMPIONS?.katarina);
        this.championModelInitialised = new Set();
        this.championModelLoadPromises = {};
        this.championAnimationStates = new Map();
        // Decode and upload only the champions requested by the match or model review.
        // Warming the full VAT catalog would synchronously decode and reserve roughly
        // 71 MiB of animation textures before the player chooses an arena.
        this.createArenaTextures();
        this.createSkillIconTextures();
        this.particleVao = gl.createVertexArray();
        this.particleBuffer = gl.createBuffer();
        gl.bindVertexArray(this.particleVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, 8 * 4 * (this.mobilePerf ? 128 : 16), gl.DYNAMIC_DRAW);
        const pLoc = gl.getAttribLocation(this.particleProgram, "aPosition");
        const sLoc = gl.getAttribLocation(this.particleProgram, "aSize");
        const cLoc = gl.getAttribLocation(this.particleProgram, "aColor");
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 8 * 4, 0);
        gl.enableVertexAttribArray(sLoc);
        gl.vertexAttribPointer(sLoc, 1, gl.FLOAT, false, 8 * 4, 3 * 4);
        gl.enableVertexAttribArray(cLoc);
        gl.vertexAttribPointer(cLoc, 4, gl.FLOAT, false, 8 * 4, 4 * 4);
        gl.bindVertexArray(null);

        this.postVao = gl.createVertexArray();
        this.fbo = null;
        this.sceneTexture = null;
        this.depthBuffer = null;
        this.width = 0;
        this.height = 0;
        // Half-float HDR FBO is a common mobile stall path — keep 8-bit on phones.
        this.ext = this.mobilePerf ? null : gl.getExtension("EXT_color_buffer_float");
        this.hitPulse = 0;
        this.lost = false;
        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          this.lost = true;
        });
        canvas.addEventListener("webglcontextrestored", () => location.reload());
      }

      setViewPlayer(playerId = 0) {
        this.viewPlayerId = playerId === 2 ? 2 : playerId === 1 ? 1 : 0;
      }

      adjustViewZoom(delta) {
        this.viewZoom = clamp(this.viewZoom + delta, 0, 1.35);
        return this.viewZoom;
      }

      initialiseKatarinaDagger(packed) {
        const packagedDaggerPresentation = packed?.daggerPresentation || {};
        this.katarinaDaggerPresentation = Object.freeze({
          readyScale: Number.isFinite(packagedDaggerPresentation.readyScale)
            ? packagedDaggerPresentation.readyScale : 0.95,
          readyPitch: Number.isFinite(packagedDaggerPresentation.readyPitch)
            ? packagedDaggerPresentation.readyPitch : Math.PI * 0.4,
          readyHeading: Number.isFinite(packagedDaggerPresentation.readyHeading)
            ? packagedDaggerPresentation.readyHeading : Math.PI * (2 / 3),
          readyHeadingSwing: Number.isFinite(packagedDaggerPresentation.readyHeadingSwing)
            ? packagedDaggerPresentation.readyHeadingSwing : 0.12,
          readyHeight: Number.isFinite(packagedDaggerPresentation.readyHeight)
            ? packagedDaggerPresentation.readyHeight : 0.34,
          readyHover: Number.isFinite(packagedDaggerPresentation.readyHover)
            ? packagedDaggerPresentation.readyHover : 0.04
        });
        if (!packed?.dagger || this.meshes.katarinaDagger) return;

        const binary = atob(packed.dagger);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const daggerVertices = new Float32Array(bytes.buffer);
        this.meshes.katarinaDagger = this.createMesh(daggerVertices);
        const partNames = ["pommel", "grip", "guard", "blade"];
        if (partNames.every((name) => {
          const part = packed.daggerParts?.[name];
          return Number.isInteger(part?.first) && Number.isInteger(part?.count) &&
            part.first >= 0 && part.count > 0 &&
            (part.first + part.count) * 6 <= daggerVertices.length;
        })) {
          this.meshes.katarinaDaggerParts = Object.fromEntries(partNames.map((name) => {
            const { first, count } = packed.daggerParts[name];
            return [name, this.createMesh(daggerVertices.subarray(first * 6, (first + count) * 6))];
          }));
        }
      }

      initialiseChampionModel(champion) {
        if (this.championModelInitialised.has(champion)) {
          return this[`${champion}ModelReadyPromise`] || Promise.resolve(Boolean(this[`${champion}Ready`]));
        }
        const packed = PLAYABLE_CHAMPIONS[champion];
        if (!packed) return Promise.resolve(false);
        if (champion === "katarina") this.initialiseKatarinaDagger(packed);
        // Register the in-flight promise BEFORE any await so concurrent
        // ensureChampionModel calls share the same load instead of resolving false.
        let settleReady;
        this[`${champion}ModelReadyPromise`] = new Promise((resolve) => {
          settleReady = resolve;
        });
        this.championModelInitialised.add(champion);

        const finish = (ok) => {
          settleReady(Boolean(ok));
          return Boolean(ok);
        };
        const fail = (error) => {
          console.error(`Playable model ${champion} failed to initialise.`, error);
          this.championModelInitialised.delete(champion);
          this[`${champion}Ready`] = false;
          return finish(false);
        };

        try {
          if (packed.animation?.runtime === "vat-v1") {
            // Decode poses once into tiled GPU textures. Per-frame animation then
            // changes only uniforms; no vertex arrays cross the CPU/GPU boundary.
            const animatedFallbackColors = {
              katarina: [42, 8, 18, 255],
              zed: [14, 13, 17, 255],
              renekton: [24, 26, 21, 255],
              vladimir: [48, 5, 18, 255],
              gangplank: [92, 58, 28, 255]
            };
            const fallbackToCpu = (error) => {
              if (this.lost || this.gl.isContextLost?.()) return fail(error);
              console.warn(`GPU VAT unavailable for ${champion}; using CPU fallback.`, error);
              return this.createCpuAnimatedChampionModel(
                champion,
                packed,
                animatedFallbackColors[champion]
              ).then(finish, fail);
            };
            return this.createVatChampionModel(
              champion,
              packed,
              animatedFallbackColors[champion]
            ).then(
              (ok) => ok ? finish(true) : fallbackToCpu(new Error("GPU VAT was not ready")),
              fallbackToCpu
            );
          }
          if (champion === "katarina") {
            return Promise.resolve(this.createKatarinaModel()).then(finish, fail);
          }
          if (champion === "zed") {
            return Promise.resolve(this.createZedModel()).then(finish, fail);
          }
          const fallbackColors = {
            renekton: [24, 26, 21, 255],
            vladimir: [48, 5, 18, 255],
            gangplank: [92, 58, 28, 255]
          };
          return Promise.resolve(this.createPackedChampionModel(
            champion,
            packed.vertices,
            packed.indices,
            packed.texture,
            fallbackColors[champion] || [24, 24, 24, 255]
          )).then(finish, fail);
        } catch (error) {
          return Promise.resolve(fail(error));
        }
      }

      ensureChampionModel(champion) {
        if (!["katarina", "zed", "renekton", "vladimir", "gangplank"].includes(champion)) {
          return Promise.resolve(false);
        }
        if (PLAYABLE_CHAMPIONS[champion]) return this.initialiseChampionModel(champion);
        if (this.championModelLoadPromises[champion]) {
          return this.championModelLoadPromises[champion];
        }
        const sources = typeof PLAYABLE_CHAMPION_MODEL_SOURCES !== "undefined"
          ? PLAYABLE_CHAMPION_MODEL_SOURCES
          : {};
        const source = sources[champion];
        if (!source) {
          console.warn(`Playable model source missing: ${champion}`);
          return Promise.resolve(false);
        }

        this.championModelLoadPromises[champion] = new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = source;
          script.async = true;
          script.onload = () => {
            Promise.resolve(this.initialiseChampionModel(champion)).then(resolve, (error) => {
              console.error(`Playable model ${champion} failed to initialise.`, error);
              resolve(false);
            });
          };
          script.onerror = () => {
            console.error(`Playable model ${champion} failed to load.`);
            delete this.championModelLoadPromises[champion];
            resolve(false);
          };
          document.head.appendChild(script);
        });
        return this.championModelLoadPromises[champion];
      }

      ensureChampionModels(champions) {
        return Promise.all(
          [...new Set(champions)].map((champion) => this.ensureChampionModel(champion))
        );
      }

      createKatarinaModel() {
        const gl = this.gl;
        const decode = (base64) => {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        };

        const vertexBytes = decode(PLAYABLE_CHAMPIONS.katarina.vertices);
        const indexBytes = decode(PLAYABLE_CHAMPIONS.katarina.indices);
        const stride = 26 * 4;
        const attributes = [
          ["aIdleA", 3, 0], ["aIdleB", 3, 3],
          ["aRunA", 3, 6], ["aRunB", 3, 9],
          ["aCast", 3, 12], ["aLotus", 3, 15],
          ["aNormalIdle", 3, 18], ["aNormalLotus", 3, 21],
          ["aUv", 2, 24]
        ];

        this.katarinaVao = gl.createVertexArray();
        this.katarinaVertexBuffer = gl.createBuffer();
        this.katarinaIndexBuffer = gl.createBuffer();
        this.katarinaIndexCount = indexBytes.byteLength / 2;
        gl.bindVertexArray(this.katarinaVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.katarinaVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexBytes, gl.STATIC_DRAW);
        for (const [name, size, offset] of attributes) {
          const location = gl.getAttribLocation(this.katarinaProgram, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.katarinaIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBytes, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        this.katarinaTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.katarinaTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA,
          gl.UNSIGNED_BYTE, new Uint8Array([18, 12, 16, 255]));

        this.katarinaReady = false;
        this.katarinaModelReadyPromise = new Promise((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, this.katarinaTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.generateMipmap(gl.TEXTURE_2D);
            const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
            if (anisotropic) {
              const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
              gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
            }
            this.katarinaReady = true;
            resolve(true);
          };
          image.onerror = () => {
            console.error("Katarina game texture failed to decode.");
            resolve(false);
          };
          image.src = PLAYABLE_CHAMPIONS.katarina.texture;
        });
        return this.katarinaModelReadyPromise;
      }

      createZedModel() {
        const gl = this.gl;
        const decode = (base64) => {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        };

        const vertexBytes = decode(PLAYABLE_CHAMPIONS.zed.vertices);
        const indexBytes = decode(PLAYABLE_CHAMPIONS.zed.indices);
        const stride = 26 * 4;
        const attributes = [
          ["aIdleA", 3, 0], ["aIdleB", 3, 3],
          ["aRunA", 3, 6], ["aRunB", 3, 9],
          ["aCast", 3, 12], ["aLotus", 3, 15],
          ["aNormalIdle", 3, 18], ["aNormalLotus", 3, 21],
          ["aUv", 2, 24]
        ];

        this.zedVao = gl.createVertexArray();
        this.zedVertexBuffer = gl.createBuffer();
        this.zedIndexBuffer = gl.createBuffer();
        this.zedIndexCount = indexBytes.byteLength / 2;
        gl.bindVertexArray(this.zedVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.zedVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexBytes, gl.STATIC_DRAW);
        for (const [name, size, offset] of attributes) {
          const location = gl.getAttribLocation(this.katarinaProgram, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.zedIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBytes, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        this.zedTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.zedTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA,
          gl.UNSIGNED_BYTE, new Uint8Array([14, 13, 17, 255]));

        this.zedReady = false;
        this.zedModelReadyPromise = new Promise((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, this.zedTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.generateMipmap(gl.TEXTURE_2D);
            const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
            if (anisotropic) {
              const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
              gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
            }
            this.zedReady = true;
            resolve(true);
          };
          image.onerror = () => {
            console.error("Zed game texture failed to decode.");
            resolve(false);
          };
          image.src = PLAYABLE_CHAMPIONS.zed.texture;
        });
        return this.zedModelReadyPromise;
      }

      decodePackedBinary(value) {
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (typeof value !== "string" || !value) {
          throw new Error("Packed model binary is missing");
        }
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }

      async loadPackedBinary(value, url, label) {
        if (value) return this.decodePackedBinary(value);
        if (!url) throw new Error(`${label} binary is missing`);
        const request = globalThis["fetch"];
        if (typeof request !== "function") throw new Error(`${label} network loader is unavailable`);
        const response = await request(url);
        if (!response.ok) {
          throw new Error(`${label} failed to load (${response.status})`);
        }
        return new Uint8Array(await response.arrayBuffer());
      }

      async createCpuAnimatedChampionModel(key, packed, fallbackRgba) {
        const gl = this.gl;
        const vertexBytes = this.decodePackedBinary(packed.vertices);
        const indexBytes = this.decodePackedBinary(packed.indices);
        // Copy into fresh buffers so typed views stay aligned after network fetch.
        const [frameBytes, normalBytes] = await Promise.all([
          this.loadPackedBinary(packed.frames, packed.framesUrl, `${key} frames`),
          this.loadPackedBinary(packed.normals, packed.normalsUrl, `${key} normals`),
        ]);
        const frameCopy = frameBytes.byteOffset === 0 && (frameBytes.byteLength % 2) === 0
          ? frameBytes
          : frameBytes.slice();
        const normalCopy = normalBytes.byteOffset === 0
          ? normalBytes
          : normalBytes.slice();
        const animation = packed.animation;
        const vertexCount = animation.vertexCount;
        const componentsPerTexel = animation.componentsPerTexel || 4;
        if (componentsPerTexel !== 3 && componentsPerTexel !== 4) {
          throw new Error(`${key} animation component count is unsupported`);
        }
        const sourceUv = new Float32Array(
          vertexBytes.buffer.slice(vertexBytes.byteOffset, vertexBytes.byteOffset + vertexBytes.byteLength)
        );
        const frameData = new Uint16Array(
          frameCopy.buffer, frameCopy.byteOffset, frameCopy.byteLength / 2
        );
        const normalData = new Uint8Array(
          normalCopy.buffer, normalCopy.byteOffset, normalCopy.byteLength
        );
        if (sourceUv.length !== vertexCount * 2 ||
            frameData.length !== vertexCount * animation.frameCount * componentsPerTexel ||
            normalData.length !== vertexCount * animation.frameCount * componentsPerTexel) {
          throw new Error(`${key} animated model data is inconsistent`);
        }

        const vao = gl.createVertexArray();
        const vertexBuffer = gl.createBuffer();
        const indexBuffer = gl.createBuffer();
        const dynamicVertices = new Float32Array(vertexCount * 26);
        for (let index = 0; index < vertexCount; index += 1) {
          dynamicVertices[index * 26 + 24] = sourceUv[index * 2];
          dynamicVertices[index * 26 + 25] = sourceUv[index * 2 + 1];
        }
        const attributes = [
          ["aIdleA", 3, 0], ["aIdleB", 3, 3],
          ["aRunA", 3, 6], ["aRunB", 3, 9],
          ["aCast", 3, 12], ["aLotus", 3, 15],
          ["aNormalIdle", 3, 18], ["aNormalLotus", 3, 21], ["aUv", 2, 24]
        ];
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, dynamicVertices, gl.DYNAMIC_DRAW);
        for (const [name, size, offset] of attributes) {
          const location = gl.getAttribLocation(this.katarinaProgram, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 26 * 4, offset * 4);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBytes, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA,
          gl.UNSIGNED_BYTE, new Uint8Array(fallbackRgba));

        this[`${key}Vao`] = vao;
        this[`${key}VertexBuffer`] = vertexBuffer;
        this[`${key}IndexBuffer`] = indexBuffer;
        this[`${key}IndexCount`] = indexBytes.byteLength / 2;
        this[`${key}Texture`] = texture;
        this[`${key}Animation`] = animation;
        this[`${key}CpuAnimation`] = {
          frameData,
          normalData,
          dynamicVertices,
          vertexCount,
          componentsPerTexel
        };
        this[`${key}Ready`] = false;
        // Texture decode only — outer initialiseChampionModel already owns the shared promise.
        return new Promise((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            // Model Viewer glTF UVs are already in atlas orientation. Flipping the
            // extracted image samples unrelated pieces of the champion atlas.
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.generateMipmap(gl.TEXTURE_2D);
            const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
            if (anisotropic) {
              const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
              gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
            }
            this[`${key}Ready`] = true;
            resolve(true);
          };
          image.onerror = () => {
            console.warn(`${key} game texture failed to decode; using its fallback material.`);
            this[`${key}Ready`] = true;
            resolve(true);
          };
          image.src = packed.texture;
        });
      }

      async createVatChampionModel(key, packed, fallbackRgba) {
        const gl = this.gl;
        const vertexBytes = this.decodePackedBinary(packed.vertices);
        const indexBytes = this.decodePackedBinary(packed.indices);
        const [frameBytes, normalBytes] = await Promise.all([
          this.loadPackedBinary(packed.frames, packed.framesUrl, `${key} frames`),
          this.loadPackedBinary(packed.normals, packed.normalsUrl, `${key} normals`),
        ]);
        const animation = packed.animation;
        const vertexCount = animation.vertexCount;
        const frameCount = animation.frameCount;
        const componentsPerTexel = animation.componentsPerTexel || 4;
        if (componentsPerTexel !== 3 && componentsPerTexel !== 4) {
          throw new Error(`${key} animation component count is unsupported`);
        }
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const layout = planVatTextureLayout(vertexCount, frameCount, maxTextureSize);
        if (vertexBytes.byteLength !== vertexCount * 2 * Float32Array.BYTES_PER_ELEMENT ||
            frameBytes.byteLength !== layout.texelCount * componentsPerTexel * Uint16Array.BYTES_PER_ELEMENT ||
            normalBytes.byteLength !== layout.texelCount * componentsPerTexel) {
          throw new Error(`${key} animated model data is inconsistent`);
        }
        const frameCopy = frameBytes.byteOffset % Uint16Array.BYTES_PER_ELEMENT === 0
          ? frameBytes
          : frameBytes.slice();
        const positionSource = new Uint16Array(
          frameCopy.buffer,
          frameCopy.byteOffset,
          frameCopy.byteLength / Uint16Array.BYTES_PER_ELEMENT
        );
        let positionData;
        let normalData;
        if (componentsPerTexel === 4 && layout.paddedTexelCount === layout.texelCount) {
          positionData = positionSource;
          normalData = normalBytes;
        } else {
          positionData = new Uint16Array(layout.paddedTexelCount * 4);
          normalData = new Uint8Array(layout.paddedTexelCount * 4);
          for (let texel = 0; texel < layout.texelCount; texel += 1) {
            const source = texel * componentsPerTexel;
            const target = texel * 4;
            positionData[target] = positionSource[source];
            positionData[target + 1] = positionSource[source + 1];
            positionData[target + 2] = positionSource[source + 2];
            positionData[target + 3] = componentsPerTexel === 4
              ? positionSource[source + 3]
              : 65535;
            normalData[target] = normalBytes[source];
            normalData[target + 1] = normalBytes[source + 1];
            normalData[target + 2] = normalBytes[source + 2];
            normalData[target + 3] = componentsPerTexel === 4
              ? normalBytes[source + 3]
              : 255;
          }
        }

        const assertContextAvailable = () => {
          if (this.lost || gl.isContextLost?.()) {
            throw new Error(`${key} VAT upload stopped because the WebGL context was lost`);
          }
        };
        const clearGlErrors = () => {
          for (let attempt = 0; attempt < 8; attempt += 1) {
            if (gl.getError() === gl.NO_ERROR) break;
          }
        };
        const assertVatOperation = (label) => {
          const error = gl.getError();
          if (error !== gl.NO_ERROR) {
            throw new Error(`${key} ${label} failed with WebGL error 0x${error.toString(16)}`);
          }
        };
        const vao = gl.createVertexArray();
        const vertexBuffer = gl.createBuffer();
        const indexBuffer = gl.createBuffer();
        let positionFrames = null;
        let normalFrames = null;
        let texture = null;
        const disposeIncompleteVat = () => {
          if (positionFrames) gl.deleteTexture?.(positionFrames);
          if (normalFrames) gl.deleteTexture?.(normalFrames);
          if (texture) gl.deleteTexture?.(texture);
          if (vertexBuffer) gl.deleteBuffer?.(vertexBuffer);
          if (indexBuffer) gl.deleteBuffer?.(indexBuffer);
          if (vao) gl.deleteVertexArray?.(vao);
        };
        try {
          assertContextAvailable();
          clearGlErrors();
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, vertexBytes, gl.STATIC_DRAW);
          const uvLocation = gl.getAttribLocation(this.vatChampionProgram, "aUv");
          gl.enableVertexAttribArray(uvLocation);
          gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 2 * 4, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBytes, gl.STATIC_DRAW);
          gl.bindVertexArray(null);
          assertVatOperation("mesh upload");

          positionFrames = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, positionFrames);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA16UI,
            layout.width,
            layout.height,
            0,
            gl.RGBA_INTEGER,
            gl.UNSIGNED_SHORT,
            positionData
          );
          assertVatOperation("position texture upload");

          normalFrames = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, normalFrames);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            layout.width,
            layout.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            normalData
          );
          assertVatOperation("normal texture upload");

          texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array(fallbackRgba)
          );
          assertVatOperation("fallback material upload");
        } catch (error) {
          disposeIncompleteVat();
          throw error;
        }

        this[`${key}Vao`] = vao;
        this[`${key}VertexBuffer`] = vertexBuffer;
        this[`${key}IndexBuffer`] = indexBuffer;
        this[`${key}IndexCount`] = indexBytes.byteLength / 2;
        this[`${key}PositionFrames`] = positionFrames;
        this[`${key}NormalFrames`] = normalFrames;
        this[`${key}FrameTextureLayout`] = layout;
        this[`${key}Animation`] = animation;
        this[`${key}Texture`] = texture;
        this[`${key}Ready`] = false;
        this[`${key}ModelReadyPromise`] = new Promise((resolve, reject) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => {
            try {
              assertContextAvailable();
              clearGlErrors();
              gl.bindTexture(gl.TEXTURE_2D, texture);
              // Model Viewer glTF UVs are already in atlas orientation.
              gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
              gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
              gl.generateMipmap(gl.TEXTURE_2D);
              const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
              if (anisotropic) {
                const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
                gl.texParameterf(
                  gl.TEXTURE_2D,
                  anisotropic.TEXTURE_MAX_ANISOTROPY_EXT,
                  Math.min(8, max)
                );
              }
              assertVatOperation("diffuse texture upload");
              this[`${key}Ready`] = true;
              resolve(true);
            } catch (error) {
              if (this.lost || gl.isContextLost?.()) {
                reject(error);
                return;
              }
              console.warn(`${key} diffuse upload failed; using its fallback material.`, error);
              this[`${key}Ready`] = true;
              resolve(true);
            }
          };
          image.onerror = () => {
            console.warn(`${key} game texture failed to decode; using its fallback material.`);
            this[`${key}Ready`] = true;
            resolve(true);
          };
          image.src = packed.texture;
        });
        return this[`${key}ModelReadyPromise`];
      }

      createPackedChampionModel(key, encodedVertices, encodedIndices, textureSource, fallbackRgba) {
        const gl = this.gl;
        const decode = (base64) => {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        };
        const vertexBytes = decode(encodedVertices);
        const indexBytes = decode(encodedIndices);
        // Gangplank bake stored invertUvV while upload still UNPACK_FLIP_Y — double flip
        // samples the wrong half of the atlas (dark leather blob instead of face/gold).
        if (key === "gangplank") {
          const floats = new Float32Array(
            vertexBytes.buffer, vertexBytes.byteOffset, vertexBytes.byteLength / 4);
          for (let i = 25; i < floats.length; i += 26) floats[i] = 1 - floats[i];
        }
        const stride = 26 * 4;
        const attributes = [
          ["aIdleA", 3, 0], ["aIdleB", 3, 3],
          ["aRunA", 3, 6], ["aRunB", 3, 9],
          ["aCast", 3, 12], ["aLotus", 3, 15],
          ["aNormalIdle", 3, 18], ["aNormalLotus", 3, 21],
          ["aUv", 2, 24]
        ];

        const vao = gl.createVertexArray();
        const vertexBuffer = gl.createBuffer();
        const indexBuffer = gl.createBuffer();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexBytes, gl.STATIC_DRAW);
        for (const [name, size, offset] of attributes) {
          const location = gl.getAttribLocation(this.katarinaProgram, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBytes, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA,
          gl.UNSIGNED_BYTE, new Uint8Array(fallbackRgba));

        this[`${key}Vao`] = vao;
        this[`${key}VertexBuffer`] = vertexBuffer;
        this[`${key}IndexBuffer`] = indexBuffer;
        this[`${key}IndexCount`] = indexBytes.byteLength / 2;
        this[`${key}Texture`] = texture;
        this[`${key}Ready`] = false;
        this[`${key}ModelReadyPromise`] = new Promise((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            // RGBA8 display-referred (same as arena). SRGB8_ALPHA8 + no gamma out crushed
            // dark leather/skin into a brown silhouette after the post rewrite.
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.generateMipmap(gl.TEXTURE_2D);
            const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
            if (anisotropic) {
              const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
              gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
            }
            this[`${key}Ready`] = true;
            resolve(true);
          };
          image.onerror = () => {
            console.error(`${key} game texture failed to decode.`);
            resolve(false);
          };
          image.src = textureSource;
        });
        return this[`${key}ModelReadyPromise`];
      }

      createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(shader) || "shader compile failed";
          const kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
          console.error(`WebGL ${kind} shader error:\n`, log, "\n--- source head ---\n", source.slice(0, 400));
          throw new Error(`${kind}: ${log}`);
        }
        return shader;
      }

      createProgram(vertex, fragment) {
        const gl = this.gl;
        const program = gl.createProgram();
        gl.attachShader(program, this.createShader(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, this.createShader(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program));
        }
        return program;
      }

      uniforms(program, names) {
        const out = {};
        for (const name of names) out[name] = this.gl.getUniformLocation(program, name);
        return out;
      }

      createMesh(data) {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        const buffer = gl.createBuffer();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const pLoc = gl.getAttribLocation(this.mainProgram, "aPosition");
        const nLoc = gl.getAttribLocation(this.mainProgram, "aNormal");
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 6 * 4, 0);
        gl.enableVertexAttribArray(nLoc);
        gl.vertexAttribPointer(nLoc, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
        gl.bindVertexArray(null);
        return { vao, count: data.length / 6 };
      }

      createArenaTextures() {
        const gl = this.gl;
        const sources = (typeof ARENA_TEXTURES !== "undefined" && ARENA_TEXTURES) || {};

        // Always-valid white so uAlbedo unit is never incomplete when mapId=0.
        this.arenaWhiteTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.arenaWhiteTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA,
          gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

        this.arenaTextureLoaders = Object.create(null);
        const make = (key, aliases, fallbackRgba) => {
          const texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          // LINEAR until mips exist — LINEAR_MIPMAP_LINEAR on incomplete tex blacks out draws
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          // Mid-brown fallback (not near-black) so missing load is still readable
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA,
            gl.UNSIGNED_BYTE, new Uint8Array(fallbackRgba));
          let loadPromise;
          this.arenaTextureLoaders[key] = () => {
            if (loadPromise) return loadPromise;
            loadPromise = new Promise((resolve) => {
              const image = new Image();
              image.decoding = "async";
              image.onload = () => {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                // Linear RGBA — sRGB path crushed dark forest wood to pure black under fog
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
                if (anisotropic) {
                  const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
                  gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, max));
                }
                for (const alias of aliases) this.arenaTextureReady[alias] = true;
                resolve(true);
              };
              image.onerror = () => {
                console.error(`Arena texture ${key} failed to decode.`);
                resolve(false);
              };
              if (sources[key]) image.src = sources[key];
              else {
                console.warn(`Arena texture source missing: ${key}`);
                resolve(false);
              }
            });
            return loadPromise;
          };
          return texture;
        };
        // Modular kit: each of the five arenas owns floor + wall side + wall top.
        const textureGroups = {
          crate: ["crate"],
          crateTop: ["crateTop"],
          floorLattice: ["floorLattice"],
          floorClearing: ["floorClearing"],
          nacreGrowth: ["nacreGrowth"],
          nacreReef: ["nacreReef"],
          floorLabyrinth: ["floorLabyrinth"],
          floorForts: ["floorForts"],
          floorPit: ["floorPit"],
          wallLattice: ["wallLattice"],
          wallClearing: ["wallClearing"],
          wallLabyrinth: ["wallLabyrinth"],
          wallForts: ["wallForts"],
          wallPit: ["wallPit"],
          wallTopLattice: ["wallTopLattice", "wallTopStone"],
          wallTopClearing: ["wallTopClearing"],
          wallTopLabyrinth: ["wallTopLabyrinth", "wallTopMetal"],
          wallTopForts: ["wallTopForts"],
          wallTopPit: ["wallTopPit"]
        };
        const keys = Object.values(textureGroups).flat();
        const fallbacks = {
          crate: [120, 82, 48, 255],
          crateTop: [90, 62, 40, 255],
          floorLattice: [138, 90, 58, 255],
          floorClearing: [40, 90, 96, 255],
          nacreGrowth: [108, 94, 88, 255],
          nacreReef: [34, 58, 62, 255],
          floorLabyrinth: [28, 40, 52, 255],
          floorForts: [52, 110, 48, 255],
          floorPit: [28, 36, 58, 255],
          wallLattice: [74, 92, 100, 255],
          wallClearing: [150, 168, 170, 255],
          wallLabyrinth: [36, 48, 62, 255],
          wallForts: [180, 172, 150, 255],
          wallPit: [42, 48, 68, 255],
          wallTopLattice: [48, 58, 64, 255],
          wallTopClearing: [200, 214, 210, 255],
          wallTopLabyrinth: [40, 56, 72, 255],
          wallTopForts: [210, 200, 176, 255],
          wallTopPit: [48, 54, 72, 255],
          wallTopStone: [48, 52, 56, 255],
          wallTopMetal: [50, 56, 62, 255]
        };
        this.arenaTextureReady = Object.fromEntries(keys.map((key) => [key, false]));
        this.arenaTextures = {};
        // Modular kit: one GPU allocation per packed source group (floors + 3 wall pairs + crates).
        for (const [sourceKey, aliases] of Object.entries(textureGroups)) {
          const texture = make(sourceKey, aliases, fallbacks[sourceKey] || [80, 80, 80, 255]);
          for (const alias of aliases) this.arenaTextures[alias] = texture;
        }
        this.arenaTexturesReady = Promise.resolve([]);
        // Aliases used by draw path
        this.arenaTextures.wall = this.arenaTextures.wallLattice;
        this.arenaTextures.wallTop = this.arenaTextures.wallTopLattice;
        // mapId 1 = floor plate. mapId 2 = crate multi-face. mapId 3 = wall multi-face.
        // mapId 4 = skill icon plate (face UV, single albedo — bound per draw).
        this.arenaMapTextures = [
          null,
          this.arenaTextures.floorLattice,
          this.arenaTextures.crate,
          this.arenaTextures.wallLattice,
          null,
          this.arenaTextures.nacreGrowth,
          this.arenaTextures.nacreReef
        ];
      }

      ensureArenaTextures(theme) {
        const keys = RIFTBOMB_ARENA_TEXTURE_PLAN.forTheme(theme);
        const loads = keys
          .map((key) => this.arenaTextureLoaders[key])
          .filter(Boolean)
          .map((load) => load());
        this.arenaTexturesReady = Promise.all(loads);
        return this.arenaTexturesReady;
      }

      /** Bind floor/wall albedos for the active arena theme (layout + look). */
      bindArenaTheme(theme) {
        if (!theme || !this.arenaTextures) return;
        const floorKey = this.arenaTextures[theme.floor] ? theme.floor : "floorLattice";
        const floor = this.arenaTextures[floorKey];
        const wall = this.arenaTextures[theme.wall] || this.arenaTextures.wallLattice;
        const wallTop = this.arenaTextures[theme.wallTop]
          || this.arenaTextures.wallTopLattice
          || wall;
        this.arenaMapTextures[1] = floor;
        this.arenaMapTextures[3] = wall;
        this.arenaMapTextures[5] = this.arenaTextures[theme.soft] || this.arenaTextures.nacreGrowth;
        this.arenaMapTextures[6] = this.arenaTextures.nacreReef;
        this.arenaTextures.wall = wall;
        this.arenaTextures.wallTop = wallTop;
        this.arenaFloorProfile = floorKey === "floorLattice" || floorKey === "floorPit"
          ? 1
          : 0;
        this.arenaMaterialProfile = floorKey === "floorClearing" ? 1 : 0;
      }

      themeColor(theme, key, fallback) {
        const hex = theme?.[key];
        if (!hex || typeof hex !== "string") return fallback;
        return hexToRgb(hex);
      }

      /**
       * One gameplay-safe environmental pass for all arena ambience.
       * A single additive top face replaces hundreds of decorative sprites/draws.
       */
      drawArenaSurfaceFx(theme, halfW, halfD, vp, t, beat) {
        const fx = theme?.fx;
        if (!fx || modelReviewMode || this.scale < 0.82) return;
        const gl = this.gl;
        const primary = typeof fx.primary === "string" ? hexToRgb(fx.primary) : [0.3, 0.8, 0.85];
        const secondary = typeof fx.secondary === "string" ? hexToRgb(fx.secondary) : [1, 0.45, 0.25];

        gl.useProgram(this.arenaFxProgram);
        gl.uniformMatrix4fv(this.arenaFxUniforms.uModel, false,
          modelMatrix(0, -0.011, 0, halfW, 0.002, halfD, 0));
        gl.uniformMatrix4fv(this.arenaFxUniforms.uViewProjection, false, vp);
        gl.uniform1f(this.arenaFxUniforms.uTime, t);
        gl.uniform1f(this.arenaFxUniforms.uBeat, beat);
        gl.uniform3fv(this.arenaFxUniforms.uPrimary, primary);
        gl.uniform3fv(this.arenaFxUniforms.uSecondary, secondary);
        gl.uniform1f(this.arenaFxUniforms.uMotif, fx.motif ?? 0);
        gl.uniform1f(this.arenaFxUniforms.uIntensity, fx.intensity ?? 0.7);
        gl.uniform1f(this.arenaFxUniforms.uSpeed, fx.speed ?? 0.45);
        gl.uniform1f(this.arenaFxUniforms.uDensity, fx.density ?? 1);
        gl.uniform1f(this.arenaFxUniforms.uReduced, prefersReducedMotion ? 1 : 0);

        // Opaque-stage helper: later walls/crates restore normal depth occlusion.
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        gl.bindVertexArray(this.meshes.cube.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.cube.count);
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.useProgram(this.mainProgram);
      }

      /**
       * Skill drops: LoL-style circular skill tokens.
       * Art is circular-cropped and shown flat/readable — no noisy heightfield.
       */
      createSkillIconTextures() {
        const banks = {
          katarina: [KATARINA_ASSETS.q, KATARINA_ASSETS.w, KATARINA_ASSETS.e, KATARINA_ASSETS.r],
          zed: [ZED_ASSETS.q, ZED_ASSETS.w, ZED_ASSETS.e, ZED_ASSETS.r],
          renekton: [RENEKTON_ASSETS.q, RENEKTON_ASSETS.w, RENEKTON_ASSETS.e, RENEKTON_ASSETS.r],
          vladimir: [VLADIMIR_ASSETS.q, VLADIMIR_ASSETS.w, VLADIMIR_ASSETS.e, VLADIMIR_ASSETS.r],
          gangplank: [GANGPLANK_ASSETS.q, GANGPLANK_ASSETS.w, GANGPLANK_ASSETS.e, GANGPLANK_ASSETS.r]
        };
        this.skillIconTextures = {};
        this.skillIconReady = {};
        for (const [champion, urls] of Object.entries(banks)) {
          this.skillIconTextures[champion] = urls.map((src, slot) =>
            this.loadSkillIconTexture(champion, slot, src)
          );
          this.skillIconReady[champion] = [false, false, false, false];
        }
      }

      loadSkillIconTexture(champion, slot, src) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA,
          gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 40, 255]));
        if (!src || typeof src !== "string" || src.length < 32) return texture;
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          try {
            // Circular LoL skill disc: crop art into a clean circle with dark ring
            const size = 128;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, size, size);
            // Outer gold-ish ring baked into texture for sharp silhouette
            const cx = size * 0.5, cy = size * 0.5, r = size * 0.48;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = "#1a1208";
            ctx.fill();
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(image, 0, 0, size, size);
            ctx.restore();
            // Thin rim stroke
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(246, 207, 120, 0.95)";
            ctx.lineWidth = size * 0.045;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.lineWidth = size * 0.02;
            ctx.stroke();

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            if (this.skillIconReady?.[champion]) this.skillIconReady[champion][slot] = true;
          } catch (error) {
            console.warn("[skills] icon bake failed", champion, slot, error);
          }
        };
        image.onerror = () => console.warn("[skills] ability icon failed", champion, slot);
        image.src = src;
        return texture;
      }

      getSkillIconTexture(champion, slot) {
        return this.skillIconTextures?.[champion]?.[slot] || null;
      }

      resize() {
        const cssW = Math.max(1, this.canvas.clientWidth);
        const cssH = Math.max(1, this.canvas.clientHeight);
        const pixels = cssW * cssH * this.scale * this.scale;
        const budget = this.pixelBudget || 2560 * 1440;
        const scale = pixels > budget ? this.scale * Math.sqrt(budget / pixels) : this.scale;
        const w = Math.max(1, Math.round(cssW * scale));
        const h = Math.max(1, Math.round(cssH * scale));
        if (w === this.width && h === this.height) return;
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        this.createFramebuffer();
      }

      createFramebuffer() {
        const gl = this.gl;
        if (this.fbo) {
          gl.deleteFramebuffer(this.fbo);
          gl.deleteTexture(this.sceneTexture);
          gl.deleteRenderbuffer(this.depthBuffer);
        }
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        this.sceneTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const internal = this.ext ? gl.RGBA16F : gl.RGBA8;
        const type = this.ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, this.width, this.height, 0, gl.RGBA, type, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);
        this.depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthBuffer);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.ext) {
          this.ext = null;
          this.createFramebuffer();
          return;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      addShock(x, z, strength = 1) {
        this.shocks.unshift({ x, z, age: 0, strength });
        this.shocks.length = Math.min(this.shocks.length, 8);
        this.cameraShake = Math.max(this.cameraShake, strength * 0.44);
        this.hitPulse = Math.max(this.hitPulse, strength);
      }

      draw(meshName, position, scale, color, material, emissive, rotation = 0, alpha = 1, rz = 0, rx = 0, mapId = 0, textureOverride = null) {
        const gl = this.gl;
        const mesh = this.meshes[meshName];
        gl.uniformMatrix4fv(this.mainUniforms.uModel, false,
          modelMatrix(position[0], position[1], position[2], scale[0], scale[1], scale[2], rotation, rz, rx));
        gl.uniform3fv(this.mainUniforms.uColor, color);
        gl.uniform1f(this.mainUniforms.uMaterial, material);
        gl.uniform1f(this.mainUniforms.uEmissive, emissive);
        gl.uniform1f(this.mainUniforms.uAlpha, alpha);
        // mapId 4 = skill icon (textureOverride required); 2/3 = arena multi-face
        const useMap = mapId === 4 && textureOverride
          ? 4
          : (mapId > 0 && this.arenaMapTextures?.[mapId] ? mapId : 0);
        gl.uniform1f(this.mainUniforms.uMapId, useMap);
        gl.uniform1f(
          this.mainUniforms.uFloorProfile,
          useMap === 1 ? (this.arenaFloorProfile || 0) : 0
        );
        gl.uniform1f(this.mainUniforms.uArenaProfile, this.arenaMaterialProfile || 0);
        const white = this.arenaWhiteTexture;
        let side = white;
        let top = white;
        if (useMap === 4 && textureOverride) {
          side = textureOverride;
          top = textureOverride;
        } else if (useMap > 0) {
          side = this.arenaMapTextures[useMap] || white;
          top = side;
          if (useMap === 2 && this.arenaTextures?.crateTop) top = this.arenaTextures.crateTop;
          else if (useMap === 3 && this.arenaTextures?.wallTop) top = this.arenaTextures.wallTop;
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, side || white);
        gl.uniform1i(this.mainUniforms.uAlbedo, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, top || white);
        gl.uniform1i(this.mainUniforms.uAlbedoTop, 2);
        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      }

      drawMesh(mesh, position, scale, color, material, emissive, rotation = 0, alpha = 1, rz = 0, rx = 0, mapId = 0, textureOverride = null) {
        if (!mesh) return;
        const gl = this.gl;
        gl.uniformMatrix4fv(this.mainUniforms.uModel, false,
          modelMatrix(position[0], position[1], position[2], scale[0], scale[1], scale[2], rotation, rz, rx));
        gl.uniform3fv(this.mainUniforms.uColor, color);
        gl.uniform1f(this.mainUniforms.uMaterial, material);
        gl.uniform1f(this.mainUniforms.uEmissive, emissive);
        gl.uniform1f(this.mainUniforms.uAlpha, alpha);
        const useMap = mapId === 4 && textureOverride
          ? 4
          : (mapId > 0 && this.arenaMapTextures?.[mapId] ? mapId : 0);
        gl.uniform1f(this.mainUniforms.uMapId, useMap);
        gl.uniform1f(
          this.mainUniforms.uFloorProfile,
          useMap === 1 ? (this.arenaFloorProfile || 0) : 0
        );
        gl.uniform1f(this.mainUniforms.uArenaProfile, this.arenaMaterialProfile || 0);
        const white = this.arenaWhiteTexture;
        let side = white;
        let top = white;
        if (useMap === 4 && textureOverride) {
          side = textureOverride;
          top = textureOverride;
        } else if (useMap > 0) {
          side = this.arenaMapTextures[useMap] || white;
          top = side;
          if (useMap === 2 && this.arenaTextures?.crateTop) top = this.arenaTextures.crateTop;
          else if (useMap === 3 && this.arenaTextures?.wallTop) top = this.arenaTextures.wallTop;
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, side || white);
        gl.uniform1i(this.mainUniforms.uAlbedo, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, top || white);
        gl.uniform1i(this.mainUniforms.uAlbedoTop, 2);
        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      }

      drawKatarinaDagger(position, scale, heading, pitch, emissive, energized = false, alpha = 1) {
        const C = Renderer.colors;
        const scaleVector = [scale, scale, scale];
        const parts = this.meshes.katarinaDaggerParts;
        if (parts) {
          const materials = {
            pommel: [C.katCrimsonDark, 2, 0.08 + emissive * 0.12],
            grip: [C.katHilt, 0, 0.03 + emissive * 0.05],
            guard: [energized ? C.katCrimson : C.katSteel, 2, 0.12 + emissive * 0.14],
            blade: [C.zedSteel, 2, 0.04 + emissive * 0.025]
          };
          for (const name of ["pommel", "grip", "guard", "blade"]) {
            const [color, material, partEmissive] = materials[name];
            this.drawMesh(parts[name], position, scaleVector, color, material,
              partEmissive, heading, alpha, 0, pitch);
          }
          return true;
        }
        if (!this.meshes.katarinaDagger) return false;
        this.drawMesh(this.meshes.katarinaDagger, position, scaleVector,
          energized ? C.katBladeEdge : C.katBlade, 3, emissive,
          heading, alpha, 0, pitch);
        return true;
      }

      drawReadyKatarinaDagger(dagger, t, beat) {
        const C = Renderer.colors;
        const katarinaDaggerPresentation = this.katarinaDaggerPresentation;
        const pulse = 0.9 + Math.sin(t * 7 + dagger.id) * 0.08;
        const showcasePhase = t * 1.35 + dagger.id * 0.73;
        const heading = katarinaDaggerPresentation.readyHeading +
          Math.sin(showcasePhase) * katarinaDaggerPresentation.readyHeadingSwing;
        const y = katarinaDaggerPresentation.readyHeight +
          Math.sin(t * 2.1 + dagger.id) * katarinaDaggerPresentation.readyHover;
        this.draw("sphere", [dagger.x, 0.066, dagger.z], [0.42, 0.026, 0.42],
          C.katCrimsonDark, 0, 0.16, 0, 0.84);
        this.draw("torus", [dagger.x, 0.07, dagger.z], [0.54 * pulse, 0.055, 0.54 * pulse],
          C.katCrimson, 4, 1.45 + beat * 0.24, t * 1.4,
          0.64, 0, Math.PI * 0.5);
        if (!this.drawKatarinaDagger([dagger.x, y, dagger.z], katarinaDaggerPresentation.readyScale,
          heading, katarinaDaggerPresentation.readyPitch, 1.9 + beat * 0.25, true)) {
          this.draw("crystal", [dagger.x, y, dagger.z], [0.11, 0.55, 0.08],
            C.katBlade, 3, 2 + beat, heading, 1, 0, katarinaDaggerPresentation.readyPitch);
          this.draw("cylinder", [dagger.x, y, dagger.z], [0.065, 0.16, 0.065],
            C.katHilt, 0, 0.2, heading, 1, 0, katarinaDaggerPresentation.readyPitch);
        }
      }

      /**
       * Skill pickup pedestal in WebGL. Real ability art is a DOM disc projected over
       * this coin (syncSkillTokenDom) — avoids broken mapId-4 white-blob path.
       */
      drawSkillPickup(pickup, t, beat) {
        const phase = t * 2.2 + (pickup.slot || 0) * 1.1 + (pickup.r || 0) * 0.17;
        const bob = 0.58 + Math.sin(phase) * 0.04;
        const spin = t * 0.55 + (pickup.slot || 0);
        const pulse = 1 + Math.sin(phase * 1.4) * 0.015;
        // Steel + thin gold bezel — no pink/red hazard ring
        const steel = [0.16, 0.17, 0.19];
        const steelDeep = [0.07, 0.07, 0.08];
        const gold = [0.78, 0.62, 0.32];
        const x = pickup.x;
        const z = pickup.z;
        const R = 0.38 * pulse;

        this.draw("cylinder", [x, 0.018, z], [0.3, 0.014, 0.3], steelDeep, 0, 0.04, spin);
        this.draw("cylinder", [x, 0.03, z], [0.26, 0.01, 0.26], steel, 0, 0.05, spin);
        this.draw("cylinder", [x, 0.1, z], [0.09, 0.08, 0.09], steelDeep, 0, 0.08, spin);
        this.draw("cylinder", [x, 0.2, z], [0.14, 0.03, 0.14], steel, 0, 0.1, spin);
        this.draw("cylinder", [x, 0.24, z], [0.15, 0.012, 0.15], gold, 0, 0.18, spin);

        this.draw("skillCoin", [x, bob, z], [R, R * 0.28, R], steelDeep, 0, 0.1, spin);
        this.draw("torus", [x, bob + R * 0.1, z],
          [R * 1.0, 0.028, R * 1.0], gold, 0, 0.22 + beat * 0.08, spin, 1, 0, Math.PI * 0.5);
        this.draw("torus", [x, bob - R * 0.08, z],
          [R * 0.96, 0.022, R * 0.96], steel, 0, 0.08, -spin, 1, 0, Math.PI * 0.5);
        this.draw("skillDisc", [x, bob + R * 0.3, z],
          [R * 0.84, 1, R * 0.84], steelDeep, 0, 0.05, spin * 0.12, 1);
      }

      /**
       * Project skill pickups to screen and pin real ability art as circular DOM tokens.
       * Uses the same data-URL art as the HUD ability dock (never a white WebGL blob).
       */
      syncSkillTokenDom(pickups, t) {
        let layer = this.skillTokenLayer;
        if (!layer) {
          layer = document.getElementById("skill-token-layer");
          this.skillTokenLayer = layer;
        }
        if (!layer) return;

        const skills = (pickups || []).filter((p) => p.type === "skill");
        while (layer.children.length > skills.length) layer.removeChild(layer.lastChild);
        while (layer.children.length < skills.length) {
          const el = document.createElement("div");
          el.className = "skill-token";
          layer.appendChild(el);
        }

        const vp = this.lastViewProjection;
        const cam = this.lastCamera || [0, 12, 11];
        for (let i = 0; i < skills.length; i++) {
          const p = skills[i];
          const el = layer.children[i];
          const phase = t * 2.2 + (p.slot || 0) * 1.1 + (p.r || 0) * 0.17;
          const bob = 0.58 + Math.sin(phase) * 0.04;
          const R = 0.4 * (1 + Math.sin(phase * 1.4) * 0.02);
          const worldY = bob + R * 0.36;
          const uv = projectPoint(vp, [p.x, worldY, p.z]);
          if (uv[0] < -0.08 || uv[0] > 1.08 || uv[1] < -0.08 || uv[1] > 1.08) {
            el.style.visibility = "hidden";
            continue;
          }
          el.style.visibility = "visible";
          el.style.left = `${(uv[0] * 100).toFixed(2)}%`;
          el.style.top = `${((1 - uv[1]) * 100).toFixed(2)}%`;
          const art = p.art || skillArtUrl(p.champion, p.slot);
          const artKey = `${p.champion || "?"}:${p.slot}`;
          if (art && el.dataset.art !== artKey) {
            el.dataset.art = artKey;
            el.style.backgroundImage = `url("${art}")`;
          } else if (!art) {
            el.style.backgroundImage = "";
          }
          // Distance-based scale so near tokens read large and far ones stay tight
          const dist = Math.hypot(p.x - cam[0], worldY - cam[1], p.z - cam[2]);
          const distScale = clamp(8.4 / Math.max(dist, 4.5), 0.62, 1.38);
          const pulse = 1 + Math.sin(phase * 1.6) * 0.045;
          el.style.transform = `translate3d(0,0,0) scale(${(distScale * pulse).toFixed(3)})`;
          el.title = p.label || "Skill unlock";
        }
      }

      /** Keep each contestant's health attached to their champion in the arena. */
      syncCharacterHealthDom(players) {
        let layer = this.characterHealthLayer;
        if (!layer) {
          layer = document.getElementById("character-health-layer");
          this.characterHealthLayer = layer;
        }
        if (!layer) return;

        const contestants = (players || []).filter(Boolean);
        while (layer.children.length > contestants.length) layer.removeChild(layer.lastChild);
        while (layer.children.length < contestants.length) {
          const el = document.createElement("div");
          el.className = "character-health";
          el.innerHTML = `
            <div class="character-health__label"></div>
            <div class="character-health__meter">
              <b class="character-health__level"></b>
              <div class="character-health__track"><i></i></div>
            </div>
          `;
          layer.appendChild(el);
        }

        const vp = this.lastViewProjection;
        const cam = this.lastCamera || [0, 12, 11];
        const canvasRect = this.canvas.getBoundingClientRect();
        for (let i = 0; i < contestants.length; i++) {
          const player = contestants[i];
          const el = layer.children[i];
          const champion = String(player.champion || "unit").toLowerCase();
          const barHeight = champion === "renekton" ? 2.55
            : champion === "katarina" ? 2.05
              : champion === "zed" ? 2.25
                : 2.35;
          const uv = projectPoint(vp, [player.x, barHeight, player.z]);
          const visible = player.alive !== false &&
            uv[0] >= -0.05 && uv[0] <= 1.05 && uv[1] >= -0.05 && uv[1] <= 1.05;
          el.style.visibility = visible ? "visible" : "hidden";
          if (!visible) continue;

          const maxHealth = Math.max(1, Number(player.maxHealth) || 100);
          const health = clamp(Number(player.health) || 0, 0, maxHealth);
          const ratio = health / maxHealth;
          el.style.left = `${(canvasRect.left + uv[0] * canvasRect.width).toFixed(1)}px`;
          el.style.top = `${(canvasRect.top + (1 - uv[1]) * canvasRect.height).toFixed(1)}px`;
          const dist = Math.hypot(player.x - cam[0], barHeight - cam[1], player.z - cam[2]);
          const scale = clamp(10 / Math.max(dist, 5), 0.72, 1.08);
          el.style.setProperty("--health-scale", scale.toFixed(3));
          const championName = champion.charAt(0).toUpperCase() + champion.slice(1);
          const level = (player.skillsUnlocked || []).filter(Boolean).length;
          el.querySelector(".character-health__label").textContent = championName;
          el.querySelector(".character-health__level").textContent = String(level);
          el.querySelector("i").style.transform = `scaleX(${ratio.toFixed(4)})`;
        }
      }

      drawClassicPickup(pickup, t, beat) {
        const C = Renderer.colors;
        const phase = t * 2.5 + (pickup.r || 0) * 0.4 + (pickup.c || 0) * 0.3;
        const bob = 0.44 + Math.sin(phase) * 0.05;
        const spin = t * 1.15;
        const x = pickup.x;
        const z = pickup.z;
        const type = pickup.type;
        const steel = [0.14, 0.15, 0.17];
        const steelDeep = [0.06, 0.06, 0.07];
        // Hard contact plate only — no soft pink/violet ground bloom
        this.draw("cylinder", [x, 0.016, z], [0.28, 0.012, 0.28], steelDeep, 0, 0.04, spin * 0.2);
        this.draw("cylinder", [x, 0.028, z], [0.24, 0.01, 0.24], steel, 0, 0.05, spin * 0.2);

        if (type === "bomb") {
          // Extra bomb capacity — readable mini bomb, dark body + fuse
          this.draw("sphere", [x, bob, z], [0.2, 0.2, 0.2], C.bomb || [0.12, 0.12, 0.12], 0, 0.12, spin);
          this.draw("sphere", [x, bob, z], [0.17, 0.17, 0.17], [0.28, 0.14, 0.42], 0, 0.35 + beat * 0.1, spin, 0.7);
          this.draw("cylinder", [x, bob + 0.18, z], [0.05, 0.05, 0.05], steel, 0, 0.15, spin);
          this.draw("crystal", [x + 0.03, bob + 0.28, z], [0.035, 0.09, 0.035], C.gold, 2, 1.4 + beat * 0.2, 0.35);
        } else if (type === "range") {
          // Blast range — gold rings, solid core
          this.draw("sphere", [x, bob, z], [0.11, 0.11, 0.11], C.gold, 2, 0.9 + beat * 0.15, spin);
          this.draw("torus", [x, bob, z], [0.2, 0.03, 0.2], C.whiteGold || C.gold, 2, 0.85 + beat * 0.1, spin, 0.9, 0, Math.PI * 0.5);
          this.draw("torus", [x, bob, z], [0.3, 0.022, 0.3], C.gold, 2, 0.55 + beat * 0.1, -spin, 0.7, 0, Math.PI * 0.5);
        } else if (type === "speed") {
          // Speed — mint arrow/chevron
          this.draw("cube", [x, bob, z], [0.09, 0.07, 0.24], C.mint, 2, 0.7 + beat * 0.12, spin);
          this.draw("cone", [x, bob, z + 0.16], [0.11, 0.14, 0.11], C.ice || C.mint, 2, 0.9 + beat * 0.12, spin + Math.PI);
          this.draw("cone", [x, bob, z - 0.09], [0.08, 0.1, 0.08], C.mint, 2, 0.55 + beat * 0.1, spin);
        } else if (type === "shield") {
          // Shield — ice shell, restrained glow
          this.draw("sphere", [x, bob, z], [0.22, 0.22, 0.22], C.ice, 2, 0.55 + beat * 0.1, spin, 0.45);
          this.draw("torus", [x, bob, z], [0.24, 0.03, 0.24], C.rift || C.ice, 2, 0.75 + beat * 0.12, spin, 0.8, 0, Math.PI * 0.5);
          this.draw("sphere", [x, bob + 0.02, z], [0.08, 0.08, 0.08], C.whiteGold || C.gold, 2, 0.85 + beat * 0.1, 0);
        } else {
          this.draw("crystal", [x, bob, z], [0.16, 0.28, 0.16], C.gold, 2, 0.9 + beat * 0.15, spin);
        }
      }

      drawPart(mesh, base, facing, local, scale, color, material = 0, emissive = 0,
        rz = 0, rx = 0, ryOffset = 0, alpha = 1) {
        const c = Math.cos(facing), s = Math.sin(facing);
        const x = base.x + local[0] * c + local[2] * s;
        const z = base.z - local[0] * s + local[2] * c;
        this.draw(mesh, [x, local[1], z], scale, color, material, emissive,
          facing + ryOffset, alpha, rz, rx);
      }

      drawShieldField(player, t, beat, centerY, radius, height) {
        const gl = this.gl;
        const C = Renderer.colors;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        // A very faint shell preserves the champion silhouette; animated rings
        // carry the shield read without turning the character into a white blob.
        this.draw("sphere", [player.x, centerY, player.z], [radius, height, radius],
          C.ice, 4, 0.55 + beat * 0.25, 0, 0.045);
        this.draw("torus", [player.x, 0.16, player.z], [radius * 1.04, 0.045, radius * 1.04],
          C.rift, 4, 1.65 + beat * 0.45, t * 0.9, 0.62, 0, Math.PI * 0.5);
        this.draw("torus", [player.x, centerY, player.z], [radius * 0.96, height * 0.9, 0.035],
          C.ice, 4, 1.15 + beat * 0.3, t * 0.42, 0.3);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

drawKatarinaFallback(player, t, beat) {
        const C = Renderer.colors;
        const blink = (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) || player.hurt > 0;
        const lotus = player.ultChannel > 0;
        const voracity = player.spin > 0;
        const facing = player.facing + (lotus ? t * 9.5 : voracity ? t * 13 : 0);
        const bob = Math.sin(t * 8.2) * 0.025;
        const stride = Math.sin(t * 12) * 0.14;
        const skin = blink ? C.white : C.katSkin;
        const hair = blink ? C.white : C.katHair;
        const armSpread = lotus ? 1.35 : 0.52;
        const part = (mesh, local, scale, color, material = 0, emissive = 0,
          rz = 0, rx = 0, ryOffset = 0, alpha = 1) =>
          this.drawPart(mesh, player, facing, local, scale, color, material,
            emissive, rz, rx, ryOffset, alpha);

        // Blue-side selection ring and a thin Noxian red inner blade mark.
        part("sphere", [0, 0.035, 0], [0.69, 0.035, 0.69], C.blueSide, 4, 0.7 + beat, 0, 0, 0, 0.38);
        part("torus", [0, 0.07, 0], [0.48, 0.48, 0.055], C.katCrimson, 4, 1.2 + beat, 0, 0, 0, 0.62);
        part("sphere", [0, 0.08, 0], [0.42, 0.035, 0.34], C.shadow, 0, 0.02, 0, 0, 0, 0.84);

        // Long assassin proportions, plated boots and asymmetric thigh armor.
        part("cylinder", [-0.18, 0.46 + bob, 0], [0.105, 0.34, 0.105], C.katLeather, 0, 0.06, -0.08 + stride);
        part("cylinder", [0.18, 0.46 + bob, 0], [0.105, 0.34, 0.105], C.katLeather, 0, 0.06, 0.08 - stride);
        part("cone", [-0.19, 0.16 + bob, 0.14], [0.14, 0.25, 0.17], C.katBoot, 2, 0.12, 0.12 + stride);
        part("cone", [0.19, 0.16 + bob, 0.14], [0.14, 0.25, 0.17], C.katBoot, 2, 0.12, -0.12 - stride);
        part("cube", [-0.2, 0.58 + bob, 0.13], [0.14, 0.19, 0.08], C.katSteel, 2, 0.4, -0.08);

        // Corset, shoulder harness and the crimson Noxian sash.
        part("sphere", [0, 0.91 + bob, 0], [0.32, 0.45, 0.24], C.katLeather, 2, 0.18);
        part("cube", [0, 0.98 + bob, 0.22], [0.25, 0.28, 0.055], C.katCrimsonDark, 0, 0.16);
        part("cube", [0, 0.72 + bob, 0.24], [0.34, 0.055, 0.055], C.katSteel, 2, 0.5);
        part("cube", [-0.21, 1.13 + bob, 0.08], [0.18, 0.08, 0.2], C.katSteel, 2, 0.45, -0.28);
        part("cube", [0.21, 1.13 + bob, 0.08], [0.18, 0.08, 0.2], C.katLeather, 2, 0.2, 0.28);
        part("crystal", [0.32, 0.64 + bob, -0.08], [0.08, 0.34, 0.08], C.katSash, 2, 0.42, 0.44);

        // Arms open dramatically during Death Lotus; otherwise blades stay low and ready.
        part("cylinder", [-0.43, 0.98 + bob, 0.02], [0.085, 0.3, 0.085], skin, 0, 0.08, -armSpread);
        part("cylinder", [0.43, 0.98 + bob, 0.02], [0.085, 0.3, 0.085], skin, 0, 0.08, armSpread);
        part("sphere", [-0.61, 0.78 + bob, 0.12], [0.11, 0.11, 0.12], C.katGlove, 0, 0.12);
        part("sphere", [0.61, 0.78 + bob, 0.12], [0.11, 0.11, 0.12], C.katGlove, 0, 0.12);

        // Pale face, green eyes and the diagonal scar are essential Katarina cues.
        part("sphere", [0, 1.48 + bob, 0.03], [0.31, 0.38, 0.28], skin, 0, 0.12);
        for (const side of [-1, 1]) {
          part("cube", [side * 0.11, 1.59 + bob, 0.292], [0.078, 0.012, 0.014], C.katLeather, 0, 0.08, side * 0.11);
          part("sphere", [side * 0.11, 1.52 + bob, 0.303], [0.038, 0.024, 0.018], C.katEye, 4, 0.72 + beat * 0.2);
          part("sphere", [side * 0.11, 1.52 + bob, 0.325], [0.014, 0.014, 0.009], C.katLeather, 0, 0.04);
        }
        part("crystal", [0, 1.46 + bob, 0.318], [0.022, 0.065, 0.018], skin, 0, 0.08, 0, 0.08);
        part("cube", [-0.105, 1.5 + bob, 0.332], [0.012, 0.18, 0.012], C.katScar, 0, 0.2, -0.42);
        part("sphere", [0, 1.35 + bob, 0.292], [0.09, 0.017, 0.024], C.katMouth, 0, 0.04);

        // Wild crimson hair: a swept crown plus long, independently readable locks.
        part("sphere", [0, 1.7 + bob, -0.02], [0.36, 0.22, 0.31], hair, 2, 0.25);
        part("crystal", [-0.27, 1.52 + bob, 0.01], [0.12, 0.34, 0.1], hair, 2, 0.24, -0.38, -0.08);
        part("crystal", [0.28, 1.49 + bob, -0.03], [0.13, 0.38, 0.1], C.katHairLight, 2, 0.3, 0.42, 0.06);
        part("crystal", [-0.11, 1.7 + bob, 0.23], [0.075, 0.24, 0.055], C.katHairLight, 2, 0.24, -0.34, -0.1);
        part("crystal", [0.1, 1.72 + bob, 0.22], [0.065, 0.2, 0.05], hair, 2, 0.2, 0.28, 0.08);
        for (let i = -2; i <= 2; i++) {
          part("crystal", [i * 0.12, 1.27 + bob, -0.25 - Math.abs(i) * 0.02],
            [0.085, 0.5 - Math.abs(i) * 0.045, 0.085], i % 2 ? C.katHairLight : hair,
            2, 0.28, i * 0.13, -0.16);
        }

        // Twin serrated daggers and dark wrapped hilts.
        for (const side of [-1, 1]) {
          const x = side * 0.67;
          part("cylinder", [x, 0.76 + bob, 0.12], [0.055, 0.19, 0.055], C.katHilt, 0, 0.16, side * 1.04);
          part("cube", [x + side * 0.07, 0.68 + bob, 0.15], [0.16, 0.035, 0.055], C.katSteel, 2, 0.34, side * 0.98);
          part("crystal", [x + side * 0.17, 0.59 + bob, 0.17], [0.105, 0.48, 0.075],
            C.katBlade, 2, 0.9 + beat * 0.25, side * 1.08, 0.08);
          part("crystal", [x + side * 0.24, 0.53 + bob, 0.12], [0.065, 0.25, 0.045],
            C.katBladeEdge, 4, 1.8 + beat, side * 1.18, -0.08);
        }

        if (voracity) {
          part("torus", [0, 0.46, 0], [1.05, 1.05, 0.08], C.katCrimson, 4, 3 + beat, 0, 0, t * 8, 0.72);
          part("torus", [0, 0.48, 0], [0.78, 0.78, 0.05], C.katBlade, 4, 2 + beat, 0, 0, -t * 7, 0.45);
        }

        if (lotus) {
          for (let i = 0; i < 12; i++) {
            const angle = t * 9 + i / 12 * TAU;
            const radius = 0.72 + (i % 3) * 0.22;
            this.draw("crystal",
              [player.x + Math.cos(angle) * radius, 0.48 + (i % 2) * 0.24, player.z + Math.sin(angle) * radius],
              [0.06, 0.3, 0.045], i % 2 ? C.katBlade : C.katCrimson,
              3, 2.8 + beat, angle, 0.82, Math.PI * 0.5);
          }
        }

        if (player.shield > 0) {
          this.drawShieldField(player, t, beat, 0.98 + bob, 0.7, 1.05);
        }
      }

      drawKatarina(player, t, beat) {
        if (!this.katarinaReady) {
          this.drawKatarinaFallback(player, t, beat);
          return;
        }
        if (this.katarinaCpuAnimation && !this.prepareCpuAnimatedChampion(player, t, "katarina")) {
          this.drawKatarinaFallback(player, t, beat);
          return;
        }

        const gl = this.gl;
        const C = Renderer.colors;
        const lotus = player.ultChannel > 0 ? 1 : 0;
        const voracity = player.spin > 0 ? 1 : 0;
        const dash = player.dashing > 0 ? 1 : 0;
        const hurt = player.hurt > 0 ? 1 : 0;
        const invulnerable = player.invulnerable > 0 ? 1 : 0;
        const moving = player.moving || dash ? 1 : 0;
        const castProgress = player.castAnim > 0
          ? clamp(1 - player.castAnim / 0.42, 0, 1)
          : 0;
        const cast = player.castAnim > 0 ? Math.sin(castProgress * Math.PI) : 0;
        const idleMix = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * 2.7 + player.id) * 0.5;
        const runMix = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * 13.5 + player.id) * 0.5;
        const bob = prefersReducedMotion ? 0 : Math.sin(t * (lotus ? 14 : moving ? 13.5 : 2.7)) *
          (lotus ? 0.025 : moving ? 0.018 : 0.01) + dash * 0.045;

        // The selection ring and contact shadow ground the same skinned 3D mesh used by the game asset.
        this.draw("sphere", [player.x, 0.035, player.z], [0.72, 0.035, 0.72],
          C.blueSide, 4, 0.8 + beat, t, 0.4);
        this.draw("torus", [player.x, 0.065, player.z], [0.53, 0.052, 0.53],
          C.katCrimsonDark, 4, 0.45 + beat * 0.16 + lotus * 2.4,
          -t * 2.2, 0.66, 0, Math.PI * 0.5);
        this.draw("sphere", [player.x, 0.075, player.z], [0.48, 0.035, 0.36],
          C.shadow, 0, 0.02, 0, 0.88);

        // The mesh and animations now come from the same Battle Queen rig, so
        // its authored forward axis can follow gameplay directly.
        const facing = player.facing + (lotus ? t * 10.8 : voracity ? t * 12.4 : 0);
        const reviewScale = modelReviewMode ? 1.12 : 1;
        const model = modelMatrix(player.x, 0.02 + bob, player.z,
          reviewScale, reviewScale, reviewScale, facing);

        if (this.katarinaPositionFrames) {
          this.drawVatChampion(player, t, beat, "katarina", 0, {
            grounding: false,
            model,
            invulnerable: Boolean(invulnerable),
            lotus,
            voracity,
            dash,
            skill: Math.max(lotus, voracity * 0.72, cast * 0.5, dash * 0.32),
            alpha: invulnerable && Math.floor(player.invulnerable * 14) % 2 === 0 ? 0.5 : 1
          });
        } else {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.disable(gl.CULL_FACE);
          gl.depthMask(true);
          gl.useProgram(this.katarinaProgram);
          gl.uniformMatrix4fv(this.katarinaUniforms.uModel, false, model);
          gl.uniformMatrix4fv(this.katarinaUniforms.uViewProjection, false, this.lastViewProjection);
          gl.uniform3fv(this.katarinaUniforms.uCamera, this.lastCamera);
          gl.uniform1f(this.katarinaUniforms.uTime, t);
          gl.uniform1f(this.katarinaUniforms.uBeat, beat);
          gl.uniform1f(this.katarinaUniforms.uIdleMix, idleMix);
          gl.uniform1f(this.katarinaUniforms.uRunMix, runMix);
          gl.uniform1f(this.katarinaUniforms.uMoving, moving);
          gl.uniform1f(this.katarinaUniforms.uCast, cast);
          gl.uniform1f(this.katarinaUniforms.uHurt, hurt);
          gl.uniform1f(this.katarinaUniforms.uInvulnerable, invulnerable);
          gl.uniform1f(this.katarinaUniforms.uLotus, lotus);
          gl.uniform1f(this.katarinaUniforms.uVoracity, voracity);
          gl.uniform1f(this.katarinaUniforms.uDash, dash);
          gl.uniform1f(this.katarinaUniforms.uShadow, 0);
          gl.uniform1f(this.katarinaUniforms.uStyle, 0);
          gl.uniform1f(this.katarinaUniforms.uAlpha,
            invulnerable && Math.floor(player.invulnerable * 14) % 2 === 0 ? 0.5 : 1);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.katarinaTexture);
          gl.uniform1i(this.katarinaUniforms.uChampion, 0);
          gl.bindVertexArray(this.katarinaVao);
          gl.drawElements(gl.TRIANGLES, this.katarinaIndexCount, gl.UNSIGNED_SHORT, 0);
          gl.bindVertexArray(null);
        }

        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.useProgram(this.mainProgram);
        gl.uniformMatrix4fv(this.mainUniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(this.mainUniforms.uCamera, this.lastCamera);
        gl.uniform1f(this.mainUniforms.uTime, t);
        gl.uniform1f(this.mainUniforms.uBeat, beat);

        if (voracity) {
          this.draw("torus", [player.x, 0.19, player.z], [1.05, 0.08, 1.05],
            C.katCrimson, 4, 3 + beat, t * 8, 0.72, 0, Math.PI * 0.5);
          this.draw("torus", [player.x, 0.22, player.z], [0.78, 0.05, 0.78],
            C.katBlade, 4, 2 + beat, -t * 7, 0.45, 0, Math.PI * 0.5);
        }

        if (lotus) {
          for (let i = 0; i < 12; i++) {
            const angle = t * 9 + i / 12 * TAU;
            const radius = 0.72 + (i % 3) * 0.22;
            this.draw("crystal",
              [player.x + Math.cos(angle) * radius, 0.48 + (i % 2) * 0.24,
                player.z + Math.sin(angle) * radius],
              [0.06, 0.3, 0.045], i % 2 ? C.katBlade : C.katCrimson,
              3, 2.8 + beat, angle, 0.82, 0, Math.PI * 0.5);
          }
        }

        if (player.shield > 0) {
          this.drawShieldField(player, t, beat, 1.04 + bob, 0.78, 1.12);
        }
      }

      drawZed(player, t, beat, shadow = false) {
        const C = Renderer.colors;
        const deathMarkCommitment = !shadow ? player.zedDeathMarkCommitment : null;
        const deathMarkAlpha = deathMarkCommitment?.phase === "windup" ? 0.28 : 0.55;
        if (!this.zedReady) {
          this.draw("sphere", [player.x, 0.72, player.z], [0.34, 0.72, 0.3],
            shadow ? C.zedShadow : C.zedSteel, 2, shadow ? 1.4 : 0.18, player.facing,
            shadow ? 0.48 : deathMarkCommitment ? deathMarkAlpha : 1);
          this.draw("crystal", [player.x, 1.38, player.z], [0.3, 0.38, 0.28],
            C.zedCrimson, 3, 1.8 + beat, player.facing,
            shadow ? 0.5 : deathMarkCommitment ? deathMarkAlpha : 1);
          return;
        }
        if (this.zedCpuAnimation && !this.prepareCpuAnimatedChampion(player, t, "zed")) {
          this.draw("sphere", [player.x, 0.72, player.z], [0.34, 0.72, 0.3],
            shadow ? C.zedShadow : C.zedSteel, 2, shadow ? 1.4 : 0.18, player.facing,
            shadow ? 0.48 : deathMarkCommitment ? deathMarkAlpha : 1);
          this.draw("crystal", [player.x, 1.38, player.z], [0.3, 0.38, 0.28],
            C.zedCrimson, 3, 1.8 + beat, player.facing,
            shadow ? 0.5 : deathMarkCommitment ? deathMarkAlpha : 1);
          return;
        }

        const gl = this.gl;
        const teleport = player.zedUltAnim > 0 ? 1 : 0;
        const slash = player.zedSlashAnim > 0 ? 1 : 0;
        const hurt = player.hurt > 0 ? 1 : 0;
        const invulnerable = player.invulnerable > 0 || deathMarkCommitment ? 1 : 0;
        const moving = player.moving ? 1 : 0;
        const castDuration = player.castDuration || 0.48;
        const castProgress = player.castAnim > 0
          ? clamp(1 - player.castAnim / castDuration, 0, 1)
          : 0;
        const cast = player.castAnim > 0 ? Math.sin(castProgress * Math.PI) : 0;
        const ultProgress = player.zedUltAnim > 0
          ? clamp(1 - player.zedUltAnim / 0.95, 0, 1)
          : 0;
        const ultPose = player.zedUltAnim > 0 ? Math.sin(ultProgress * Math.PI) : 0;
        const idleMix = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * 2.25 + (player.id || 0)) * 0.5;
        const runMix = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * 12.2 + (player.id || 0)) * 0.5;
        const bob = prefersReducedMotion ? 0 : Math.sin(t * (moving ? 12.2 : 2.25)) * (moving ? 0.016 : 0.009);

        if (!shadow) {
          this.draw("sphere", [player.x, 0.035, player.z], [0.72, 0.035, 0.72],
            C.blueSide, 4, 0.78 + beat, t, 0.38);
          this.draw("torus", [player.x, 0.065, player.z], [0.54, 0.052, 0.54],
            C.zedCrimsonDark, 4, 0.72 + beat * 0.2 + teleport * 2.1,
            -t * 1.8, 0.72, 0, Math.PI * 0.5);
        } else {
          const fade = clamp(1 - (player.age || 0) / Math.max(0.01, player.life || 5), 0.18, 1);
          this.draw("torus", [player.x, 0.055, player.z], [0.56, 0.055, 0.56],
            C.zedCrimson, 4, 1.6 + beat, t * 2.6, 0.34 * fade, 0, Math.PI * 0.5);
          this.draw("sphere", [player.x, 0.07, player.z], [0.52, 0.03, 0.4],
            C.zedShadow, 4, 0.3, 0, 0.7 * fade);
        }
        this.draw("sphere", [player.x, 0.074, player.z], [0.48, 0.034, 0.36],
          C.shadow, 0, 0.02, 0, shadow ? 0.68 : 0.88);

        const scale = modelReviewMode ? 1.14 : 1;
        const model = modelMatrix(player.x, 0.02 + bob, player.z, scale, scale, scale, player.facing || 0);
        if (this.zedPositionFrames) {
          this.drawVatChampion(player, t, beat, "zed", 1, {
            grounding: false,
            model,
            shadow,
            invulnerable: Boolean(invulnerable),
            lotus: ultPose,
            voracity: slash,
            dash: teleport * 0.35,
            skill: Math.max(ultPose, slash * 0.72, cast * 0.5, teleport * 0.35 * 0.32),
            alpha: shadow ? 0.8 : deathMarkCommitment ? deathMarkAlpha :
              (invulnerable && Math.floor(player.invulnerable * 14) % 2 === 0 ? 0.5 : 1)
          });
        } else {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.disable(gl.CULL_FACE);
          gl.depthMask(!shadow);
          gl.useProgram(this.katarinaProgram);
          gl.uniformMatrix4fv(this.katarinaUniforms.uModel, false, model);
          gl.uniformMatrix4fv(this.katarinaUniforms.uViewProjection, false, this.lastViewProjection);
          gl.uniform3fv(this.katarinaUniforms.uCamera, this.lastCamera);
          gl.uniform1f(this.katarinaUniforms.uTime, t);
          gl.uniform1f(this.katarinaUniforms.uBeat, beat);
          gl.uniform1f(this.katarinaUniforms.uIdleMix, idleMix);
          gl.uniform1f(this.katarinaUniforms.uRunMix, runMix);
          gl.uniform1f(this.katarinaUniforms.uMoving, moving);
          gl.uniform1f(this.katarinaUniforms.uCast, cast);
          gl.uniform1f(this.katarinaUniforms.uHurt, hurt);
          gl.uniform1f(this.katarinaUniforms.uInvulnerable, invulnerable);
          gl.uniform1f(this.katarinaUniforms.uLotus, ultPose);
          gl.uniform1f(this.katarinaUniforms.uVoracity, slash);
          gl.uniform1f(this.katarinaUniforms.uDash, teleport * 0.35);
          gl.uniform1f(this.katarinaUniforms.uShadow, shadow ? 1 : 0);
          gl.uniform1f(this.katarinaUniforms.uStyle, 1);
          gl.uniform1f(this.katarinaUniforms.uAlpha, shadow ? 0.8 :
            deathMarkCommitment ? deathMarkAlpha :
              (invulnerable && Math.floor(player.invulnerable * 14) % 2 === 0 ? 0.5 : 1));
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.zedTexture);
          gl.uniform1i(this.katarinaUniforms.uChampion, 0);
          gl.bindVertexArray(this.zedVao);
          gl.drawElements(gl.TRIANGLES, this.zedIndexCount, gl.UNSIGNED_SHORT, 0);
          gl.bindVertexArray(null);
        }

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.useProgram(this.mainProgram);
        gl.uniformMatrix4fv(this.mainUniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(this.mainUniforms.uCamera, this.lastCamera);
        gl.uniform1f(this.mainUniforms.uTime, t);
        gl.uniform1f(this.mainUniforms.uBeat, beat);

        if (teleport) {
          for (let i = 0; i < 7; i++) {
            const angle = i / 7 * TAU + t * 2.1;
            this.draw("crystal", [player.x + Math.cos(angle) * 0.56, 0.35 + i * 0.11, player.z + Math.sin(angle) * 0.56],
              [0.035, 0.32, 0.035], i % 2 ? C.zedCrimson : C.zedSteel,
              3, 2.4 + beat, angle, 0.64, 0, Math.PI * 0.5);
          }
        }
        if (!shadow && player.shield > 0) this.drawShieldField(player, t, beat, 1.02 + bob, 0.78, 1.12);
      }

      sampleVatClip(animation, key, progress) {
        const sample = sampleVatAnimationClip(animation, key, progress);
        return sample ? { key, ...sample } : null;
      }

      sampleChampionAction(animation, action, progress) {
        const clipKey = animation.actions?.[action];
        if (!clipKey) return null;
        const sample = this.sampleVatClip(animation, clipKey, progress);
        return sample ? { ...sample, key: action, clipKey } : null;
      }

      resolveChampionAnimation(player, t, key) {
        const animation = this[`${key}Animation`];
        if (!animation?.clips || !animation?.actions) return null;
        if (modelReviewMode && key === modelReviewTarget &&
            modelReviewAction && animation.actions[modelReviewAction]) {
          const clipKey = animation.actions[modelReviewAction];
          const clip = animation.clips[clipKey];
          if (clip?.frameCount > 0) {
            const localFrame = clamp(
              Number.isFinite(requestedModelReviewFrame) ? requestedModelReviewFrame : 0,
              0,
              clip.frameCount - 1
            );
            const denominator = clip.loop ? clip.frameCount : Math.max(1, clip.frameCount - 1);
            const sample = this.sampleChampionAction(
              animation,
              modelReviewAction,
              localFrame / denominator
            );
            if (sample) {
              return { ...sample, previous: sample, transition: 1, hidden: false };
            }
          }
        }
        const poolRemaining = player.vladimirPool || 0;
        let desired;
        const usesSemanticAbilityAnimations = !modelReviewMode &&
          Object.prototype.hasOwnProperty.call(player, "abilityAnimRemaining");
        const abilityAnimRemaining = Math.max(0, Number(player.abilityAnimRemaining) || 0);
        const abilityAnimDuration = Math.max(0, Number(player.abilityAnimDuration) || 0);
        const abilityAnimAction = abilityAnimRemaining > 0 && abilityAnimDuration > 0 &&
          ["q", "w", "e", "r", "rStrike"].includes(player.abilityAnimAction) &&
          animation.actions[player.abilityAnimAction]
          ? player.abilityAnimAction
          : "";
        const action = (name, remaining, duration) => this.sampleChampionAction(
          animation,
          name,
          clamp(1 - remaining / duration, 0, 1)
        );
        const locomotion = () => {
          const preferred = player.moving ? "run" : "idle";
          const available = animation.actions[preferred]
            ? preferred
            : animation.actions.idle
              ? "idle"
              : animation.actions.run
                ? "run"
                : Object.keys(animation.actions)[0];
          if (!available) return null;
          const clip = animation.clips[animation.actions[available]];
          if (!clip?.duration) return null;
          const speed = available === "run" ? 1.52 : 1;
          const phase = prefersReducedMotion
            ? 0.35
            : (t * speed + player.id * 0.173) / clip.duration;
          return this.sampleChampionAction(animation, available, phase);
        };
        if (key === "vladimir" && poolRemaining > 0) {
          if (poolRemaining > 1.18) {
            desired = this.sampleChampionAction(
              animation, "poolDown",
              clamp((1.45 - poolRemaining) / 0.27, 0, 1)
            );
          } else if (poolRemaining < 0.24) {
            desired = this.sampleChampionAction(
              animation, "poolUp",
              clamp(1 - poolRemaining / 0.24, 0, 1)
            );
          } else {
            this.championAnimationStates.delete(`${key}:${player.id}`);
            return { hidden: true, key: "pool" };
          }
        } else if (abilityAnimAction) {
          // The authoritative game publishes the exact authored Q/W/E/R action
          // (plus Zed's separate R strike phase)
          // and its own visual lifetime. This outranks overlapping legacy VFX
          // timers, so one ability cannot briefly borrow another ability's clip.
          desired = action(abilityAnimAction, abilityAnimRemaining, abilityAnimDuration);
        } else if (!usesSemanticAbilityAnimations && key === "vladimir" && player.vladimirQAnim > 0) {
          desired = action("q", player.vladimirQAnim, 0.56);
        } else if (!usesSemanticAbilityAnimations && key === "vladimir" && player.vladimirEAnim > 0) {
          desired = action("e", player.vladimirEAnim, 0.62);
        } else if (!usesSemanticAbilityAnimations && key === "vladimir" && player.vladimirUltAnim > 0) {
          desired = action("r", player.vladimirUltAnim, 0.66);
        } else if (key === "vladimir" && player.vladimirAttackAnim > 0) {
          desired = action("attack", player.vladimirAttackAnim, 0.42);
        } else if (!usesSemanticAbilityAnimations && key === "katarina" && player.ultChannel > 0) {
          desired = action("r", player.ultChannel, 1.65);
        } else if (key === "katarina" && player.spin > 0) {
          desired = action("w", player.spin, 0.58);
        } else if (key === "katarina" && player.dashing > 0) {
          desired = action("e", player.dashing, 0.18);
        } else if (!usesSemanticAbilityAnimations && key === "zed" && player.zedUltAnim > 0) {
          desired = action("r", player.zedUltAnim, 0.68);
        } else if (!usesSemanticAbilityAnimations && key === "zed" && player.zedSlashAnim > 0) {
          desired = action("e", player.zedSlashAnim, 0.52);
        } else if (!usesSemanticAbilityAnimations && key === "renekton" && player.renektonUltAnim > 0) {
          desired = action("r", player.renektonUltAnim, 0.72);
        } else if (!usesSemanticAbilityAnimations && key === "renekton" && player.renektonDashAnim > 0) {
          desired = action("e", player.renektonDashAnim, 0.46);
        } else if (!usesSemanticAbilityAnimations && key === "renekton" && player.renektonSlashAnim > 0) {
          desired = action("q", player.renektonSlashAnim, 0.58);
        } else if (!usesSemanticAbilityAnimations && key === "gangplank" && player.gangplankUltAnim > 0) {
          desired = action("r", player.gangplankUltAnim, 0.7);
        } else if (!usesSemanticAbilityAnimations && key === "gangplank" && player.gangplankKegAnim > 0) {
          desired = action("e", player.gangplankKegAnim, 0.42);
        } else if (!usesSemanticAbilityAnimations && key === "gangplank" && player.gangplankShotAnim > 0) {
          desired = action("q", player.gangplankShotAnim, 0.48);
        } else if (!usesSemanticAbilityAnimations && player.castAnim > 0) {
          desired = action("q", player.castAnim, player.castDuration || 0.5);
        } else {
          desired = locomotion();
        }

        // A malformed or partially loaded action catalog must never stop the
        // render loop. Fall back to locomotion, or omit only this champion frame.
        if (!desired) desired = locomotion();
        if (!desired) return null;

        const stateKey = `${key}:${player.id}`;
        let state = this.championAnimationStates.get(stateKey);
        if (!state) {
          state = {
            key: desired.key,
            changedAt: t,
            previous: desired,
            current: desired
          };
          this.championAnimationStates.set(stateKey, state);
        } else if (state.key !== desired.key) {
          state.previous = state.current;
          state.key = desired.key;
          state.changedAt = t;
        }
        state.current = desired;
        const transition = prefersReducedMotion
          ? 1
          : clamp((t - state.changedAt) / 0.12, 0, 1);
        if (transition >= 1) state.previous = desired;
        return { ...desired, previous: state.previous, transition, hidden: false };
      }

      resolveVladimirAnimation(player, t) {
        return this.resolveChampionAnimation(player, t, "vladimir");
      }

      prepareCpuAnimatedChampion(player, t, key) {
        const frame = this.resolveChampionAnimation(player, t, key);
        if (!frame || frame.hidden) return false;
        this.updateCpuAnimatedChampion(key, frame);
        return true;
      }

      updateCpuAnimatedChampion(key, frame) {
        const animation = this[`${key}Animation`];
        const cpu = this[`${key}CpuAnimation`];
        const componentsPerTexel = cpu.componentsPerTexel || 4;
        const min = animation.positionMin;
        const range = animation.positionRange;
        const sample = (frameIndex, vertexIndex, axis) => {
          const offset = (frameIndex * cpu.vertexCount + vertexIndex) *
            componentsPerTexel + axis;
          return min[axis] + cpu.frameData[offset] / 65535 * range[axis];
        };
        const normal = (frameIndex, vertexIndex, axis) => {
          const offset = (frameIndex * cpu.vertexCount + vertexIndex) *
            componentsPerTexel + axis;
          return cpu.normalData[offset] / 255 * 2 - 1;
        };
        for (let vertex = 0; vertex < cpu.vertexCount; vertex += 1) {
          const target = vertex * 26;
          for (let axis = 0; axis < 3; axis += 1) {
            const current = sample(frame.frameA, vertex, axis) +
              (sample(frame.frameB, vertex, axis) - sample(frame.frameA, vertex, axis)) * frame.mix;
            const previous = sample(frame.previous.frameA, vertex, axis) +
              (sample(frame.previous.frameB, vertex, axis) - sample(frame.previous.frameA, vertex, axis)) * frame.previous.mix;
            const position = previous + (current - previous) * frame.transition;
            for (let slot = 0; slot < 6; slot += 1) cpu.dynamicVertices[target + slot * 3 + axis] = position;
            const currentNormal = normal(frame.frameA, vertex, axis) +
              (normal(frame.frameB, vertex, axis) - normal(frame.frameA, vertex, axis)) * frame.mix;
            const previousNormal = normal(frame.previous.frameA, vertex, axis) +
              (normal(frame.previous.frameB, vertex, axis) - normal(frame.previous.frameA, vertex, axis)) * frame.previous.mix;
            const blendedNormal = previousNormal + (currentNormal - previousNormal) * frame.transition;
            cpu.dynamicVertices[target + 18 + axis] = blendedNormal;
            cpu.dynamicVertices[target + 21 + axis] = blendedNormal;
          }
        }
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this[`${key}VertexBuffer`]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, cpu.dynamicVertices);
      }

      drawCpuAnimatedChampion(player, t, beat, key, style, options = {}) {
        if (!this[`${key}Ready`]) return this.drawVatChampion(player, t, beat, key, style, options);
        const frame = this.resolveChampionAnimation(player, t, key);
        if (frame.hidden) return false;
        this.updateCpuAnimatedChampion(key, frame);
        const C = Renderer.colors;
        // CPU-streamed poses still need a fixed contact shadow. Without it, a
        // grounded mesh reads as floating whenever the camera angle changes.
        this.draw("sphere", [player.x, 0.035, player.z], [0.74, 0.035, 0.74],
          C.blueSide, 4, 0.8 + beat, t, 0.38);
        this.draw("torus", [player.x, 0.064, player.z], [0.56, 0.052, 0.56],
          C.vladimirCrimson, 4, 0.68 + beat * 0.2, -t * 1.9, 0.72, 0, Math.PI * 0.5);
        this.draw("sphere", [player.x, 0.073, player.z], [0.5, 0.034, 0.38],
          C.vladimirBloodDark, 0, 0.025, 0, 0.88);
        const gl = this.gl;
        const model = modelMatrix(player.x, 0.02, player.z,
          options.scale || 1, options.scale || 1, options.scale || 1, player.facing || 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(this.katarinaProgram);
        const uniforms = this.katarinaUniforms;
        gl.uniformMatrix4fv(uniforms.uModel, false, model);
        gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(uniforms.uCamera, this.lastCamera);
        gl.uniform1f(uniforms.uTime, t);
        gl.uniform1f(uniforms.uBeat, beat);
        gl.uniform1f(uniforms.uIdleMix, 0);
        gl.uniform1f(uniforms.uRunMix, 0);
        gl.uniform1f(uniforms.uMoving, 0);
        gl.uniform1f(uniforms.uCast, 0);
        gl.uniform1f(uniforms.uHurt, player.hurt > 0 ? 1 : 0);
        gl.uniform1f(uniforms.uInvulnerable, player.invulnerable > 0 ? 1 : 0);
        gl.uniform1f(uniforms.uLotus, 0);
        gl.uniform1f(uniforms.uVoracity, 0);
        gl.uniform1f(uniforms.uDash, 0);
        gl.uniform1f(uniforms.uShadow, 0);
        gl.uniform1f(uniforms.uStyle, style);
        gl.uniform1f(uniforms.uAlpha, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this[`${key}Texture`]);
        gl.uniform1i(uniforms.uChampion, 0);
        gl.bindVertexArray(this[`${key}Vao`]);
        gl.drawElements(gl.TRIANGLES, this[`${key}IndexCount`], gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.useProgram(this.mainProgram);
        gl.uniformMatrix4fv(this.mainUniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(this.mainUniforms.uCamera, this.lastCamera);
        gl.uniform1f(this.mainUniforms.uTime, t);
        gl.uniform1f(this.mainUniforms.uBeat, beat);
        return true;
      }

      drawVatChampion(player, t, beat, key, style, options = {}) {
        const C = Renderer.colors;
        const accent = key === "katarina" ? C.katCrimsonDark
          : key === "zed" ? C.zedCrimsonDark
            : key === "renekton" ? C.renektonTeal
              : key === "gangplank" ? C.gangplankGold
                : C.vladimirCrimson;
        const dark = key === "katarina" || key === "zed" ? C.shadow
          : key === "renekton" ? C.renektonDark
            : key === "gangplank" ? C.gangplankDark
              : C.vladimirBloodDark;
        if (!this[`${key}Ready`]) {
          this.draw(
            "sphere",
            [player.x, 0.76, player.z],
            [0.4, 0.76, 0.34],
            accent,
            2,
            0.3,
            player.facing
          );
          this.draw(
            "crystal",
            [player.x, 1.45, player.z],
            [0.28, 0.4, 0.26],
            accent,
            3,
            1.6 + beat,
            player.facing
          );
          return false;
        }

        const frame = this.resolveChampionAnimation(player, t, key);
        if (!frame || frame.hidden) return false;
        const gl = this.gl;
        const animation = this[`${key}Animation`];
        const invulnerable = options.invulnerable ?? (player.invulnerable > 0);
        const action = ["attack", "q", "poolDown", "poolUp", "e", "r"].includes(frame.key);
        const authoredSkill = frame.key === "r" ? 1
          : frame.key === "e" ? 0.72
            : frame.key === "poolDown" || frame.key === "poolUp" ? 0
            : action ? 0.5
              : 0;
        const skill = options.skill ?? Math.max(
          authoredSkill,
          options.ult || 0,
          (options.slash || 0) * 0.72,
          (options.dash || 0) * 0.32
        );
        const bob = prefersReducedMotion || action
          ? 0
          : Math.sin(t * (frame.key === "run" ? 11 : 2.2)) *
            (frame.key === "run" ? 0.016 : 0.009);

        if (options.grounding !== false) {
          this.draw(
            "sphere",
            [player.x, 0.035, player.z],
            [0.74, 0.035, 0.74],
            C.blueSide,
            4,
            0.8 + beat,
            t,
            options.shadow ? 0.22 : 0.38
          );
          this.draw(
            "torus",
            [player.x, 0.064, player.z],
            [0.56, 0.052, 0.56],
            accent,
            4,
            0.68 + beat * 0.2 + (frame.key === "r" ? 2.2 : 0),
            -t * 1.9,
            options.shadow ? 0.34 : 0.72,
            0,
            Math.PI * 0.5
          );
          this.draw(
            "sphere",
            [player.x, 0.073, player.z],
            [0.5, 0.034, 0.38],
            dark,
            0,
            0.025,
            0,
            options.shadow ? 0.68 : 0.88
          );
        }

        const scale = options.scale || 1;
        const model = options.model || modelMatrix(
          player.x,
          0.02 + bob,
          player.z,
          scale,
          scale,
          scale,
          options.facing ?? player.facing ?? 0
        );
        const uniforms = this.vatChampionUniforms;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(!options.shadow);
        gl.useProgram(this.vatChampionProgram);
        gl.uniformMatrix4fv(uniforms.uModel, false, model);
        gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(uniforms.uCamera, this.lastCamera);
        gl.uniform3fv(uniforms.uPositionMin, animation.positionMin);
        gl.uniform3fv(uniforms.uPositionRange, animation.positionRange);
        gl.uniform1i(uniforms.uVertexCount, animation.vertexCount);
        gl.uniform1i(uniforms.uFrameA, frame.frameA);
        gl.uniform1i(uniforms.uFrameB, frame.frameB);
        gl.uniform1f(uniforms.uFrameMix, frame.mix);
        gl.uniform1i(uniforms.uPreviousFrameA, frame.previous.frameA);
        gl.uniform1i(uniforms.uPreviousFrameB, frame.previous.frameB);
        gl.uniform1f(uniforms.uPreviousFrameMix, frame.previous.mix);
        gl.uniform1f(uniforms.uTransition, frame.transition);
        gl.uniform1f(uniforms.uTime, t);
        gl.uniform1f(uniforms.uBeat, beat);
        gl.uniform1f(uniforms.uHurt, player.hurt > 0 ? 1 : 0);
        gl.uniform1f(uniforms.uInvulnerable, invulnerable ? 1 : 0);
        gl.uniform1f(uniforms.uLotus,
          options.lotus ?? options.ult ?? (frame.key === "r" ? skill : 0));
        gl.uniform1f(uniforms.uVoracity,
          options.voracity ?? options.slash ?? (frame.key === "e" ? skill : 0));
        gl.uniform1f(uniforms.uDash, options.dash ?? (frame.key === "q" ? skill * 0.4 : 0));
        gl.uniform1f(uniforms.uShadow, options.shadow ? 1 : 0);
        gl.uniform1f(uniforms.uStyle, style);
        gl.uniform1f(uniforms.uSkill, skill);
        gl.uniform1f(
          uniforms.uAlpha,
          options.alpha ?? (
            player.invulnerable > 0 && Math.floor(player.invulnerable * 14) % 2 === 0
              ? 0.52
              : 1
          )
        );
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this[`${key}Texture`]);
        gl.uniform1i(uniforms.uChampion, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this[`${key}PositionFrames`]);
        gl.uniform1i(uniforms.uPositionFrames, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this[`${key}NormalFrames`]);
        gl.uniform1i(uniforms.uNormalFrames, 2);
        gl.bindVertexArray(this[`${key}Vao`]);
        gl.drawElements(gl.TRIANGLES, this[`${key}IndexCount`], gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.useProgram(this.mainProgram);
        gl.uniformMatrix4fv(this.mainUniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(this.mainUniforms.uCamera, this.lastCamera);
        gl.uniform1f(this.mainUniforms.uTime, t);
        gl.uniform1f(this.mainUniforms.uBeat, beat);
        return true;
      }

      drawPackedChampion(player, t, beat, key, style, options = {}) {
        const C = Renderer.colors;
        if (!this[`${key}Ready`]) {
          const color = key === "renekton" ? C.renektonBronze
            : key === "gangplank" ? C.gangplankBronze
            : C.vladimirCrimson;
          this.draw("sphere", [player.x, 0.76, player.z], [0.4, 0.76, 0.34], color, 2, 0.3, player.facing);
          this.draw("crystal", [player.x, 1.45, player.z], [0.28, 0.4, 0.26], color, 3, 1.6 + beat, player.facing);
          return;
        }

        const gl = this.gl;
        const moving = player.moving || options.dash ? 1 : 0;
        const invulnerable = player.invulnerable > 0 || options.pool ? 1 : 0;
        const castDuration = player.castDuration || 0.5;
        const castProgress = player.castAnim > 0
          ? clamp(1 - player.castAnim / castDuration, 0, 1)
          : 0;
        const cast = player.castAnim > 0 ? Math.sin(castProgress * Math.PI) : 0;
        const idleMix = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * (key === "renekton" ? 2.05 : key === "gangplank" ? 2.15 : 2.38) + player.id) * 0.5;
        const runMix = prefersReducedMotion ? 0.5 : 0.5 + Math.sin(t * (key === "renekton" ? 10.8 : key === "gangplank" ? 10.2 : 9.6) + player.id) * 0.5;
        const bob = prefersReducedMotion || options.pool ? 0 : Math.sin(t * (moving ? 11 : 2.2)) * (moving ? 0.016 : 0.009);
        const accent = key === "renekton" ? C.renektonTeal : key === "gangplank" ? C.gangplankGold : C.vladimirCrimson;
        const dark = key === "renekton" ? C.renektonDark : key === "gangplank" ? C.gangplankDark : C.vladimirBloodDark;

        if (!options.pool) {
          this.draw("sphere", [player.x, 0.035, player.z], [0.74, 0.035, 0.74],
            C.blueSide, 4, 0.8 + beat, t, 0.38);
          this.draw("torus", [player.x, 0.064, player.z], [0.56, 0.052, 0.56],
            accent, 4, 0.68 + beat * 0.2 + (options.ult || 0) * 2.2,
            -t * 1.9, 0.72, 0, Math.PI * 0.5);
          this.draw("sphere", [player.x, 0.073, player.z], [0.5, 0.034, 0.38],
            dark, 0, 0.025, 0, 0.88);
        } else {
          // Sanguine Pool removes Vladimir's body entirely; the dedicated liquid pass below
          // is the only readable silhouette while he is untargetable.
          return;
        }

        const scale = options.scale || 1;
        const yScale = options.pool ? scale * 0.075 : scale;
        const model = modelMatrix(player.x, options.pool ? 0.015 : 0.02 + bob, player.z,
          scale, yScale, scale, player.facing || 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(!options.pool);
        gl.useProgram(this.katarinaProgram);
        gl.uniformMatrix4fv(this.katarinaUniforms.uModel, false, model);
        gl.uniformMatrix4fv(this.katarinaUniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(this.katarinaUniforms.uCamera, this.lastCamera);
        gl.uniform1f(this.katarinaUniforms.uTime, t);
        gl.uniform1f(this.katarinaUniforms.uBeat, beat);
        gl.uniform1f(this.katarinaUniforms.uIdleMix, idleMix);
        gl.uniform1f(this.katarinaUniforms.uRunMix, runMix);
        gl.uniform1f(this.katarinaUniforms.uMoving, moving);
        gl.uniform1f(this.katarinaUniforms.uCast, cast);
        gl.uniform1f(this.katarinaUniforms.uHurt, player.hurt > 0 ? 1 : 0);
        gl.uniform1f(this.katarinaUniforms.uInvulnerable, invulnerable);
        gl.uniform1f(this.katarinaUniforms.uLotus, options.ult || 0);
        gl.uniform1f(this.katarinaUniforms.uVoracity, options.slash || 0);
        gl.uniform1f(this.katarinaUniforms.uDash, options.dash || 0);
        gl.uniform1f(this.katarinaUniforms.uShadow, 0);
        gl.uniform1f(this.katarinaUniforms.uStyle, style);
        gl.uniform1f(this.katarinaUniforms.uAlpha,
          player.invulnerable > 0 && Math.floor(player.invulnerable * 14) % 2 === 0 ? 0.52 : 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this[`${key}Texture`]);
        gl.uniform1i(this.katarinaUniforms.uChampion, 0);
        gl.bindVertexArray(this[`${key}Vao`]);
        gl.drawElements(gl.TRIANGLES, this[`${key}IndexCount`], gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.useProgram(this.mainProgram);
        gl.uniformMatrix4fv(this.mainUniforms.uViewProjection, false, this.lastViewProjection);
        gl.uniform3fv(this.mainUniforms.uCamera, this.lastCamera);
        gl.uniform1f(this.mainUniforms.uTime, t);
        gl.uniform1f(this.mainUniforms.uBeat, beat);
      }

      drawRenekton(player, t, beat) {
        const C = Renderer.colors;
        const dominus = player.renektonDominus > 0;
        const ultProgress = player.renektonUltAnim > 0
          ? clamp(1 - player.renektonUltAnim / 0.72, 0, 1)
          : 0;
        const ultPose = player.renektonUltAnim > 0
          ? Math.sin(ultProgress * Math.PI)
          : dominus ? 0.12 + Math.sin(t * 2.8) * 0.035 : 0;
        const scale = (modelReviewMode ? 1.08 : 0.92) * (dominus ? 1.16 : 1);
        const options = {
          scale,
          ult: ultPose,
          slash: player.renektonSlashAnim > 0 ? 1 : 0,
          dash: player.renektonDashAnim > 0 ? 0.72 : 0
        };
        if (this.renektonCpuAnimation) {
          if (!this.prepareCpuAnimatedChampion(player, t, "renekton")) {
            this.draw("sphere", [player.x, 0.76, player.z], [0.4, 0.76, 0.34],
              C.renektonTeal || C.vladimirCrimson, 2, 0.3, player.facing);
            return;
          }
          this.drawPackedChampion(player, t, beat, "renekton", 2, options);
        } else if (this.renektonPositionFrames) {
          this.drawVatChampion(player, t, beat, "renekton", 2, options);
        } else {
          this.drawPackedChampion(player, t, beat, "renekton", 2, options);
        }

        if (dominus) {
          const pulse = 0.94 + Math.sin(t * 4.2) * 0.08;
          this.draw("torus", [player.x, 0.18, player.z], [1.18 * pulse, 0.09, 1.18 * pulse],
            C.renektonTeal, 4, 2.8 + beat, t * 2.6, 0.66, 0, Math.PI * 0.5);
          this.draw("torus", [player.x, 0.23, player.z], [0.84 * pulse, 0.055, 0.84 * pulse],
            C.renektonGold, 4, 2 + beat, -t * 3.3, 0.42, 0, Math.PI * 0.5);
          for (let i = 0; i < 5; i++) {
            const angle = t * 1.7 + i / 5 * TAU;
            this.draw("crystal", [player.x + Math.cos(angle) * 0.86, 0.38 + i * 0.12,
              player.z + Math.sin(angle) * 0.86], [0.045, 0.25, 0.04],
              i % 2 ? C.renektonTeal : C.renektonGold, 3, 2.2 + beat, angle, 0.54);
          }
        }
        if (player.shield > 0) this.drawShieldField(player, t, beat, 1.04, 0.82, 1.16);
      }

      drawVladimir(player, t, beat) {
        const C = Renderer.colors;
        const pool = player.vladimirPool > 0;
        const ultProgress = player.vladimirUltAnim > 0
          ? clamp(1 - player.vladimirUltAnim / 0.66, 0, 1)
          : 0;
        const ultPose = player.vladimirUltAnim > 0 ? Math.sin(ultProgress * Math.PI) : 0;
        const options = {
          scale: modelReviewMode ? 1.14 : 1.02,
          ult: ultPose,
          slash: player.vladimirEAnim > 0 ? 1 : 0,
          pool
        };
        if (this.vladimirCpuAnimation) {
          this.drawCpuAnimatedChampion(player, t, beat, "vladimir", 3, options);
        } else if (this.vladimirPositionFrames) {
          this.drawVatChampion(player, t, beat, "vladimir", 3, options);
        } else {
          this.drawPackedChampion(player, t, beat, "vladimir", 3, options);
        }

        if (pool) {
          const pulse = 0.9 + Math.sin(t * 7) * 0.08;
          this.draw("sphere", [player.x, 0.055, player.z], [1.08 * pulse, 0.035, 0.84 * pulse],
            C.vladimirBloodDark, 0, 0.12 + beat * 0.08, t, 0.9);
          this.draw("torus", [player.x, 0.078, player.z], [0.94 * pulse, 0.05, 0.94 * pulse],
            C.vladimirBlood, 0, 0.28 + beat * 0.12, -t * 3.6, 0.62, 0, Math.PI * 0.5);
          for (let i = 0; i < 6; i++) {
            const angle = t * 2.8 + i / 6 * TAU;
            this.draw("sphere", [player.x + Math.cos(angle) * 0.72, 0.08,
              player.z + Math.sin(angle) * 0.56], [0.11, 0.035, 0.11],
              C.vladimirCrimson, 0, 0.38 + beat * 0.16, angle, 0.52);
          }
        }
        if (player.shield > 0) this.drawShieldField(player, t, beat, 1.02, 0.76, 1.1);
      }

      drawGangplank(player, t, beat) {
        const C = Renderer.colors;
        const ultProgress = player.gangplankUltAnim > 0
          ? clamp(1 - player.gangplankUltAnim / 0.7, 0, 1)
          : 0;
        const ultPose = player.gangplankUltAnim > 0 ? Math.sin(ultProgress * Math.PI) : 0;
        const options = {
          scale: modelReviewMode ? 1.14 : 1.05,
          ult: ultPose,
          slash: player.gangplankShotAnim > 0 ? 1 : 0,
          dash: player.gangplankKegAnim > 0 ? 0.55 : 0
        };
        if (this.gangplankCpuAnimation) {
          if (!this.prepareCpuAnimatedChampion(player, t, "gangplank")) {
            this.draw("sphere", [player.x, 0.76, player.z], [0.4, 0.76, 0.34],
              C.gangplankWood || C.vladimirCrimson, 2, 0.3, player.facing);
            return;
          }
          this.drawPackedChampion(player, t, beat, "gangplank", 4, options);
        } else if (this.gangplankPositionFrames) {
          this.drawVatChampion(player, t, beat, "gangplank", 4, options);
        } else {
          this.drawPackedChampion(player, t, beat, "gangplank", 4, options);
        }
        if (player.shield > 0) this.drawShieldField(player, t, beat, 1.02, 0.8, 1.12);
      }

      drawMinion(enemy, t, beat, hurt) {
        const C = Renderer.colors;
        const bob = Math.sin(t * 5.6 + enemy.id) * 0.035;
        const red = hurt ? C.white : C.minionRed;
        const part = (mesh, local, scale, color, material = 0, emissive = 0,
          rz = 0, rx = 0, ryOffset = 0, alpha = 1) =>
          this.drawPart(mesh, enemy, enemy.facing, local, scale, color, material,
            emissive, rz, rx, ryOffset, alpha);

        part("sphere", [0, 0.025, 0], [0.39, 0.025, 0.39], C.redSide, 4, 0.45 + beat, 0, 0, 0, 0.32);
        if (enemy.kind === 0) {
          part("sphere", [0, 0.37 + bob, 0], [0.27, 0.33, 0.24], C.minionCloth, 0, 0.06);
          part("cube", [0, 0.46 + bob, 0.12], [0.24, 0.18, 0.12], red, 2, 0.18);
          part("sphere", [0, 0.72 + bob, 0.03], [0.23, 0.22, 0.22], C.minionFace, 0, 0.08);
          part("sphere", [0, 0.88 + bob, -0.01], [0.28, 0.18, 0.27], red, 2, 0.24);
          part("cube", [0, 0.72 + bob, 0.23], [0.21, 0.065, 0.045], C.minionVisor, 2, 0.22);
          for (const side of [-1, 1]) {
            part("sphere", [side * 0.09, 0.72 + bob, 0.275], [0.035, 0.035, 0.025],
              C.minionEye, 4, 2.2 + beat);
          }
          part("sphere", [-0.32, 0.47 + bob, 0.08], [0.16, 0.23, 0.055],
            red, 2, 0.18, -0.15);
          part("crystal", [0.31, 0.55 + bob, 0.12], [0.055, 0.34, 0.055],
            C.minionBlade, 2, 0.42, -0.55);
        } else {
          part("sphere", [0, 0.38 + bob, 0], [0.29, 0.34, 0.25], C.minionCloth, 0, 0.08);
          part("cone", [0, 0.67 + bob, -0.02], [0.34, 0.43, 0.31], red, 2, 0.22);
          part("sphere", [0, 0.69 + bob, 0.12], [0.19, 0.18, 0.18], C.minionFace, 0, 0.08);
          for (const side of [-1, 1]) {
            part("sphere", [side * 0.075, 0.72 + bob, 0.285], [0.034, 0.034, 0.02],
              C.minionEye, 4, 2.4 + beat);
          }
          part("cylinder", [0.32, 0.52 + bob, 0.04], [0.045, 0.43, 0.045],
            C.minionStaff, 0, 0.12, 0.18);
          part("sphere", [0.24, 0.94 + bob, 0.04], [0.13, 0.13, 0.13],
            C.minionRed, 4, 1.7 + beat);
          part("torus", [0.24, 0.94 + bob, 0.17], [0.16, 0.16, 0.065],
            C.minionGold, 2, 0.5);
        }
      }

      drawHerald(enemy, t, beat, hurt) {
        const C = Renderer.colors;
        const bob = Math.sin(t * 3.6 + enemy.id) * 0.045;
        const hide = hurt ? C.white : C.heraldHide;
        const part = (mesh, local, scale, color, material = 0, emissive = 0,
          rz = 0, rx = 0, ryOffset = 0, alpha = 1) =>
          this.drawPart(mesh, enemy, enemy.facing, local, scale, color, material,
            emissive, rz, rx, ryOffset, alpha);

        part("sphere", [0, 0.03, 0], [0.78, 0.04, 0.78], C.violet, 4, 0.8 + beat, 0, 0, 0, 0.32);
        part("sphere", [0, 0.62 + bob, -0.04], [0.66, 0.65, 0.58], hide, 2, 0.75);
        part("sphere", [0, 1.06 + bob, 0.14], [0.55, 0.46, 0.5], C.heraldArmor, 2, 0.52);
        part("crystal", [-0.48, 1.2 + bob, -0.05], [0.19, 0.52, 0.18], C.heraldHorn, 2, 0.5, -0.75);
        part("crystal", [0.48, 1.2 + bob, -0.05], [0.19, 0.52, 0.18], C.heraldHorn, 2, 0.5, 0.75);
        part("sphere", [0, 1.05 + bob, 0.59], [0.28, 0.24, 0.08], C.heraldEyeDark, 0, 0.12);
        part("sphere", [0, 1.07 + bob, 0.66], [0.17, 0.15, 0.045], C.heraldEye, 4, 3 + beat);
        part("sphere", [-0.04, 1.12 + bob, 0.7], [0.045, 0.045, 0.025], C.white, 4, 3.4);
        for (const side of [-1, 1]) {
          part("cylinder", [side * 0.48, 0.42 + bob, 0.05], [0.16, 0.39, 0.16],
            hide, 2, 0.32, side * 0.72);
          part("crystal", [side * 0.67, 0.14 + bob, 0.18], [0.16, 0.28, 0.16],
            C.heraldClaw, 2, 0.4, side * 0.55);
        }
        for (let i = -1; i <= 1; i++) {
          part("crystal", [i * 0.22, 1.48 + bob - Math.abs(i) * 0.08, -0.18],
            [0.12, 0.34 + (1 - Math.abs(i)) * 0.16, 0.12], C.heraldHorn, 2, 0.7, i * 0.2);
        }
      }

      drawBaron(enemy, t, beat, hurt) {
        const C = Renderer.colors;
        const bob = Math.sin(t * 2.4) * 0.055;
        const hide = hurt ? C.white : C.baronHide;
        const part = (mesh, local, scale, color, material = 0, emissive = 0,
          rz = 0, rx = 0, ryOffset = 0, alpha = 1) =>
          this.drawPart(mesh, enemy, enemy.facing, local, scale, color, material,
            emissive, rz, rx, ryOffset, alpha);

        part("sphere", [0, 0.02, 0], [1.35, 0.05, 1.35], C.violet, 4, 1.15 + beat, 0, 0, 0, 0.36);
        part("torus", [0, 0.08, 0], [1.16 + beat * 0.06, 1.16 + beat * 0.06, 0.12],
          C.baronRift, 4, 1.8 + beat, 0, -Math.PI * 0.5, 0, 0.5);

        // Serpentine body segments create the rising Nashor silhouette.
        part("sphere", [0, 0.45 + bob, -0.22], [1.0, 0.48, 0.9], C.baronShell, 2, 0.45);
        part("sphere", [0, 0.9 + bob, -0.04], [0.88, 0.62, 0.77], hide, 2, 0.85 + beat * 0.18);
        part("sphere", [0, 1.44 + bob, 0.18], [0.76, 0.59, 0.67], C.baronShell, 2, 0.7);
        part("sphere", [0, 1.78 + bob, 0.35], [0.7, 0.5, 0.62], hide, 2, 1.05 + beat * 0.2);

        // Face plate, four hot eyes, and the teal maw.
        part("sphere", [0, 1.72 + bob, 0.84], [0.5, 0.32, 0.13], C.baronFace, 2, 0.55);
        for (const side of [-1, 1]) {
          part("sphere", [side * 0.21, 1.86 + bob, 0.97], [0.09, 0.07, 0.035],
            C.baronEye, 4, 3.1 + beat);
          part("sphere", [side * 0.34, 1.72 + bob, 0.93], [0.07, 0.055, 0.03],
            C.baronEye, 4, 2.7 + beat);
        }
        part("sphere", [0, 1.55 + bob, 0.96], [0.36, 0.14, 0.05],
          C.baronMouth, 4, 2.3 + beat);
        for (let i = -3; i <= 3; i++) {
          part("cone", [i * 0.085, 1.6 + bob, 1.015], [0.035, 0.11, 0.035],
            C.baronTeeth, 2, 0.6, Math.PI);
        }

        // Crown and lateral spikes.
        for (let i = -2; i <= 2; i++) {
          part("crystal", [i * 0.24, 2.22 + bob - Math.abs(i) * 0.09, 0.12],
            [0.13, 0.5 - Math.abs(i) * 0.06, 0.13], C.baronHorn, 2, 1.1, i * 0.18);
        }
        for (const side of [-1, 1]) {
          part("crystal", [side * 0.72, 1.64 + bob, 0.12], [0.18, 0.58, 0.18],
            C.baronHorn, 2, 0.9, side * 0.88);
          part("cylinder", [side * 0.75, 0.74 + bob, 0.05], [0.16, 0.5, 0.16],
            hide, 2, 0.4, side * 0.74);
          part("crystal", [side * 0.95, 0.34 + bob, 0.32], [0.19, 0.36, 0.19],
            C.baronClaw, 2, 0.72, side * 0.58);
        }
        for (let i = -2; i <= 2; i++) {
          part("crystal", [i * 0.3, 1.05 + bob - Math.abs(i) * 0.06, -0.65],
            [0.11, 0.34 + (2 - Math.abs(i)) * 0.05, 0.11], C.baronSpine, 2, 0.75, i * 0.16);
        }
      }

      render(game, sfx, dt, now) {
        if (this.lost) return;
        const gl = this.gl;
        this.resize();
        this.hitPulse = Math.max(0, this.hitPulse - dt * 2.6);
        this.cameraShake = Math.max(0, this.cameraShake - dt * 2.9);
        for (const shock of this.shocks) shock.age += dt;
        this.shocks = this.shocks.filter((s) => s.age < 1.15);

        const aspect = this.width / this.height;
        const compact = aspect < 0.8;
        const t = now * 0.001;
        const beat = sfx.visualPulse();
        const essentialShake = (prefersReducedMotion || this.mobilePerf) ? 0 : this.cameraShake;
        const shakeX = Math.sin(t * 61) * essentialShake * 0.2;
        const shakeZ = Math.cos(t * 47) * essentialShake * 0.16;
        const orbit = prefersReducedMotion || this.mobilePerf ? 0 : Math.sin(t * 0.16) * 0.32;
        const nacreReviewCameras = {
          overview: { eye: [0, 16.8, 13.2], target: [0, 0.16, 0.4], fov: 0.76 },
          left: { eye: [-11.5, 10.2, 11.8], target: [0, 0.18, 0], fov: 0.76 },
          right: { eye: [11.5, 10.2, 11.8], target: [0, 0.18, 0], fov: 0.76 },
          rear: { eye: [0, 10.4, -14.2], target: [0, 0.18, 0], fov: 0.76 },
          grazing: { eye: [10.8, 5.8, 13.5], target: [0, 0.28, 0], fov: 0.7 },
          close: { eye: [4.8, 5.2, 6.4], target: [2.1, 0.3, 1.4], fov: 0.62 }
        };
        const reviewCamera = modelReviewTarget === "nacre"
          ? (nacreReviewCameras[modelReviewPose] || nacreReviewCameras.overview)
          : modelReviewTarget === "dagger"
          ? {
              eye: compact ? [0, 19.5, 15.5] : [0, 14.6, 13.4],
              target: [0, 0.2, compact ? 0.05 : 0.12],
              fov: compact ? 0.84 : 0.74
            }
          : modelReviewTarget === "bomb"
          ? { eye: [0, 2.15, 4.0], target: [0, 0.72, 0], fov: 0.54 }
          : modelReviewTarget === "baron"
          ? { eye: [0, 3.75, 7.2], target: [0, 1.2, 0], fov: 0.68 }
          : modelReviewTarget === "herald"
            ? { eye: [0, 2.8, 5.2], target: [0, 0.85, 0], fov: 0.62 }
            : modelReviewTarget === "minions"
              ? { eye: [0, 2.25, 4.35], target: [0, 0.55, 0], fov: 0.58 }
              : modelReviewTarget === "renekton" || modelReviewTarget === "gangplank"
                ? { eye: [0, 3.0, 7.25], target: [0, 1.28, 0], fov: 0.6 }
              : ["katarina", "zed", "vladimir"].includes(modelReviewTarget)
                ? { eye: [0, 2.48, 5.65], target: [0, 1.2, 0], fov: 0.57 }
              : { eye: [0, 2.65, 4.45], target: [0, 0.88, 0], fov: 0.58 };
        const focusPlayer = !modelReviewMode && this.viewPlayerId
          ? game.players?.find((player) => player.id === this.viewPlayerId)
          : null;
        const nacreCamera = game.arenaTemplate?.().theme?.floor === "floorClearing";
        const overviewEye = compact
          ? [shakeX + orbit, 19.5, 15.5 + shakeZ]
          : nacreCamera
            ? [shakeX + orbit, 16.8, 13.2 + shakeZ]
            : [shakeX + orbit, 14.6, 13.4 + shakeZ];
        const overviewTarget = [0, 0.2, compact ? 0.05 : (nacreCamera ? 0.4 : 0.12)];
        // Keep the widest zoom centered on the whole arena, then progressively
        // converge on the local player. At close zoom the champion is centered;
        // at overview zoom the maximum useful arena remains visible.
        const closeEye = compact
          ? [shakeX + orbit, 12.2, 9.8 + shakeZ]
          : [shakeX + orbit, 8.8, 7.6 + shakeZ];
        const zoom = focusPlayer ? this.viewZoom : 0;
        const followZoom = clamp((zoom - 0.1) / 0.9, 0, 1);
        const framedX = focusPlayer ? focusPlayer.x * followZoom : 0;
        const framedZ = focusPlayer ? focusPlayer.z * followZoom : 0;
        const zoomEye = overviewEye.map((value, index) => lerp(value, closeEye[index], zoom));
        const eye = modelReviewMode
          ? reviewCamera.eye
          : focusPlayer
            ? [zoomEye[0] + framedX, zoomEye[1], zoomEye[2] + framedZ]
            : overviewEye;
        const target = modelReviewMode
          ? reviewCamera.target
          : focusPlayer
            ? [overviewTarget[0] + framedX, overviewTarget[1], overviewTarget[2] + framedZ]
            : overviewTarget;
        const projection = mat4Perspective(
          modelReviewMode ? reviewCamera.fov : focusPlayer
            ? lerp(compact ? 0.84 : 0.74, compact ? 0.7 : 0.62, zoom)
            : (compact ? 0.84 : (nacreCamera ? 0.77 : 0.74)),
          aspect,
          0.1,
          70
        );
        const view = mat4LookAt(eye, target);
        const vp = mat4Multiply(projection, view);
        this.lastViewProjection = vp;
        this.lastCamera = eye;
        const forwardX = target[0] - eye[0];
        const forwardZ = target[2] - eye[2];
        const horizontalLength = Math.max(0.0001, Math.hypot(forwardX, forwardZ));
        this.cameraRight = [-forwardZ / horizontalLength, 0, forwardX / horizontalLength];

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.width, this.height);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.disable(gl.BLEND);
        const C = Renderer.colors;
        const theme = game.arenaTemplate ? game.arenaTemplate().theme : null;
        const nacreAppearance = typeof RIFTBOMB_NACRE_APPEARANCE !== "undefined" &&
          RIFTBOMB_NACRE_APPEARANCE.isTheme(theme)
          ? RIFTBOMB_NACRE_APPEARANCE
          : null;
        this.bindArenaTheme(theme);
        // Every arena is one opaque 3D scene. Nacre must share this depth buffer
        // with champions, bombs and pickups; a screen-space beauty plate cannot.
        const clear = this.themeColor(theme, "clear", [0.05, 0.08, 0.07]);
        gl.clearColor(clear[0], clear[1], clear[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProgram);
        gl.uniformMatrix4fv(this.mainUniforms.uViewProjection, false, vp);
        gl.uniform3fv(this.mainUniforms.uCamera, eye);
        gl.uniform1f(this.mainUniforms.uTime, t);
        gl.uniform1f(this.mainUniforms.uBeat, beat);

        const floorA = this.themeColor(theme, "floorA", C.arenaFloorA);
        const accent = this.themeColor(theme, "accent", C.gold);
        const textureTint = [1, 1, 1];

        // Clean stage in deep tactical void (no outer tile mud)
        const halfW = (game.cols * game.tile) * 0.5;
        const halfD = (game.rows * game.tile) * 0.5;
        // Hard stage plinth in tactical void — no soft cyan bloom disc
        const plinth = [
          clear[0] * 0.35 + 0.02,
          clear[1] * 0.38 + 0.025,
          clear[2] * 0.4 + 0.03
        ];
        const lip = [
          Math.min(1, floorA[0] * 0.55 + 0.08),
          Math.min(1, floorA[1] * 0.55 + 0.09),
          Math.min(1, floorA[2] * 0.55 + 0.1)
        ];
        this.draw("cube", [0, -0.42, 0], [halfW + 0.85, 0.18, halfD + 0.85], plinth, 0, 0.02);
        this.draw("cube", [0, -0.24, 0], [halfW + 0.52, 0.1, halfD + 0.52], lip, 0, 0.06);
        this.draw("cube", [0, -0.12, 0], [halfW + 0.22, 0.07, halfD + 0.22], floorA, 0, 0.04);
        nacreAppearance?.drawBackdrop(this, halfW, halfD, t);
        // Hazard registration marks on stage corners (telemetry, not soft glow)
        const mark = nacreAppearance ? accent : (C.ember || [0.9, 0.16, 0.16]);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            this.draw("cube",
              [sx * (halfW + 0.35), -0.02, sz * (halfD + 0.35)],
              [0.14, 0.03, 0.04], mark, 2, 0.4, 0);
            this.draw("cube",
              [sx * (halfW + 0.35), -0.02, sz * (halfD + 0.35)],
              [0.04, 0.03, 0.14], mark, 2, 0.4, 0);
          }
        }
        // Cell geometry preserves the grid; world-continuous albedo avoids micro-tile repetition.
        for (let r = 1; r < game.rows - 1; r++) {
          for (let c = 1; c < game.cols - 1; c++) {
            const [fx, fz] = game.worldFromCell(r, c);
            const floorHalf = nacreAppearance ? game.tile * 0.496 : game.tile * 0.5;
            this.draw("cube", [fx, -0.055, fz],
              [floorHalf, 0.04, floorHalf],
              textureTint, 0, 0.01, 0, 1, 0, 0, 1);
          }
        }
        this.drawArenaSurfaceFx(theme, halfW, halfD, vp, t, beat);
        nacreAppearance?.drawFloorOrnaments(this, t, beat);
        // Stage edge stripe — low emissive, hard edge (not toy glow)
        this.draw("cube", [0, -0.02, halfD + 0.12], [halfW + 0.35, 0.04, 0.1], lip, 0, 0.12);
        this.draw("cube", [0, -0.02, -(halfD + 0.12)], [halfW + 0.35, 0.04, 0.1], lip, 0, 0.12);
        this.draw("cube", [halfW + 0.12, -0.02, 0], [0.1, 0.04, halfD + 0.35], lip, 0, 0.12);
        this.draw("cube", [-(halfW + 0.12), -0.02, 0], [0.1, 0.04, halfD + 0.35], lip, 0, 0.12);

        const crystalPulse = 0.88 + beat * 0.16;
        const nexuses = [
          { x: -9.0, z: 7.15, color: C.blueSide },
          { x: 9.0, z: -7.15, color: C.redSide }
        ];
        nexuses.forEach((nexus, i) => {
          if (nacreAppearance?.drawTeamNexus) {
            nacreAppearance.drawTeamNexus(this, nexus, i, t, beat);
            return;
          }
          this.draw("sphere", [nexus.x, 0.04, nexus.z], [0.95, 0.05, 0.95],
            nexus.color, 4, 0.9 + beat * 0.25, t);
          this.draw("crystal", [nexus.x, 0.68 + Math.sin(t * 1.7 + i) * 0.06, nexus.z],
            [0.38 * crystalPulse, 0.95 * crystalPulse, 0.38 * crystalPulse],
            nexus.color, 2, 2.2 + beat, t * (i ? -0.35 : 0.35));
        });

        const turrets = [
          { x: -9.05, z: 3.8, color: C.blueSide },
          { x: -9.05, z: 0.8, color: C.blueSide },
          { x: 9.05, z: -0.8, color: C.redSide },
          { x: 9.05, z: -3.8, color: C.redSide }
        ];
        turrets.forEach((turret, i) => {
          if (nacreAppearance?.drawTeamTurret) {
            nacreAppearance.drawTeamTurret(this, turret, i, t, beat);
            return;
          }
          this.draw("cube", [turret.x, 0.22, turret.z], [0.34, 0.28, 0.34], C.arenaStone, 0, 0.15);
          this.draw("crystal", [turret.x, 0.72, turret.z], [0.18, 0.4, 0.18],
            turret.color, 2, 1.6 + beat * 0.3, (i % 2 ? -1 : 1) * t * 0.18);
        });

        // Authored materials: cold indestructible stone vs warm destructible wood.
        const half = game.tile * 0.5;
        for (let r = 0; r < game.rows; r++) {
          for (let c = 0; c < game.cols; c++) {
            const tile = game.grid[r][c];
            const [x, z] = game.worldFromCell(r, c);
            const edge = r === 0 || c === 0 || r === game.rows - 1 || c === game.cols - 1;
            if (["katarina", "zed", "renekton", "vladimir", "gangplank"].includes(modelReviewTarget) && !edge) continue;
            if (!tile) continue;
            if (tile === 1) {
              const frontEdge = r === game.rows - 1;
              if (nacreAppearance) {
                nacreAppearance.drawHardTile(this, {
                  x, z, half, edge, frontEdge, row: r, col: c,
                  rows: game.rows, cols: game.cols, t, beat
                });
                continue;
              }
              const s = edge ? half * 0.96 : half * 0.82;
              // The camera looks from +Z: lower the near wall so it frames instead of occluding P1.
              const h = frontEdge ? 0.24 : (edge ? 0.4 : 0.34);
              this.draw("cube", [x, 0.015, z], [s * 1.04, 0.018, s * 1.04],
                [0.018, 0.024, 0.03], 0, 0, 0, 0.72);
              this.draw("cube", [x, h + 0.035, z], [s, h, s],
                textureTint, 0, 0.015, 0, 1, 0, 0, 3);
            } else if (tile === 2) {
              if (nacreAppearance) {
                nacreAppearance.drawBreakableTile(this, {
                  x, z, half, row: r, col: c, t, beat
                });
                continue;
              }
              const s = half * 0.72;
              this.draw("cube", [x, 0.012, z], [s * 1.08, 0.016, s * 1.08], [0.05, 0.03, 0.02], 0, 0, 0, 0.55);
              this.draw("cube", [x, 0.33, z], [s, 0.31, s],
                textureTint, 0, 0.02, 0, 1, 0, 0, 2);
              // A shallow lid lip gives the authored top face a physical silhouette.
              this.draw("cube", [x, 0.655, z], [s * 1.025, 0.025, s * 1.025],
                textureTint, 0, 0.015, 0, 1, 0, 0, 2);
            }
          }
        }
        for (const ultimate of game.ultimates) {
          const progress = clamp(ultimate.age / ultimate.fuse, 0, 1);
          const warning = 0.82 + Math.sin(t * 18) * 0.12;
          this.draw("sphere", [ultimate.x, -0.01, ultimate.z],
            [1.7 * warning, 0.035, 1.7 * warning], C.redSide, 4, 1.3 + beat, t, 0.7);
          this.draw("sphere", [ultimate.x, 0.01, ultimate.z],
            [0.72 + progress * 0.55, 0.025, 0.72 + progress * 0.55], C.gold, 4, 2.1 + beat, -t, 0.78);
          this.draw("crystal", [ultimate.x, 5.8 * (1 - progress) + 0.55, ultimate.z],
            [0.46 + progress * 0.28, 0.8 + progress * 0.45, 0.46 + progress * 0.28],
            C.whiteGold, 3, 3.4 + progress * 3, t * 4);
        }

        for (const blast of game.blasts) {
          const [x, z] = game.worldFromCell(blast.r, blast.c);
          RIFTBOMB_BOMB_APPEARANCE.drawExplosion(this, blast, x, z, t, beat, game.tile);
        }

        // Plant impact: a small camera kick the moment a new bomb lands.
        for (const bomb of game.bombs) {
          if (this.seenBombIds.has(bomb.id)) continue;
          this.seenBombIds.add(bomb.id);
          if (bomb.age < 0.25) this.cameraShake = Math.max(this.cameraShake, 0.1);
        }
        if (this.seenBombIds.size > 24) {
          const liveBombIds = new Set(game.bombs.map((bomb) => bomb.id));
          for (const id of this.seenBombIds) {
            if (!liveBombIds.has(id)) this.seenBombIds.delete(id);
          }
        }

        for (const bomb of game.bombs) {
          const progress = clamp(bomb.age / bomb.fuse, 0, 1);
          const teamGlow = bomb.ownerId === 2 ? C.redSide : C.blueSide;

          // Landing pose: the shell drops, bounces once and squashes on impact.
          const fall = clamp(bomb.age / 0.24, 0, 1);
          const bounceT = clamp((bomb.age - 0.24) / 0.34, 0, 1);
          const bounce = Math.abs(Math.sin(bounceT * Math.PI)) * (1 - bounceT) * 0.2;
          const squashT = clamp((bomb.age - 0.22) / 0.13, 0, 1);
          const squash = bomb.age < 0.62
            ? Math.sin(squashT * Math.PI) * 0.26 * (1 - bounceT * 0.45)
            : 0;
          const bodyY = 0.34 + (1 - fall * fall) * 1.5 + bounce;

          const heat = progress * progress;
          const flash = 0.5 + 0.5 * Math.sin(bomb.age * (6 + heat * 34) + bomb.id * 1.7);
          const pulse = 0.86 + Math.pow(progress, 3) * 0.28 + flash * heat * 0.12;

          // Plant shockwave: a team ring that expands and fades in 0.45s.
          const landRing = clamp(bomb.age / 0.45, 0, 1);
          if (landRing < 1) {
            const ringRadius = 0.42 + landRing * 1.15;
            this.draw("sphere", [bomb.x, 0.045, bomb.z], [ringRadius, 0.028, ringRadius],
              teamGlow, 4, (1 - landRing) * 2.6, t, 0.55 * (1 - landRing));
          }
          this.draw("sphere", [bomb.x, 0.055, bomb.z], [0.55, 0.035, 0.55],
            teamGlow, 4, 1.2 + beat + flash * heat * 2.4, t, 0.42);
          RIFTBOMB_BOMB_APPEARANCE.drawBomb(this, bomb, t, beat, {
            bodyY,
            progress,
            pulse,
            squash,
            teamGlow
          });
        }

        for (const pickup of game.pickups) {
          if (pickup.type === "skill") this.drawSkillPickup(pickup, t, beat);
          else this.drawClassicPickup(pickup, t, beat);
        }

        for (const dagger of game.daggers || []) {
          const ready = dagger.age >= dagger.readyAt;
          if (ready) {
            this.drawReadyKatarinaDagger(dagger, t, beat);
            continue;
          }
          const fall = clamp(1 - dagger.age / Math.max(0.01, dagger.readyAt), 0, 1);
          const spin = t * 4 + dagger.id;
          const heading = spin;
          const pitch = 0.18;
          const y = 0.45 + Math.sin((1 - fall) * Math.PI) * 1.5;
          this.draw("sphere", [dagger.x, 0.066, dagger.z], [0.42, 0.026, 0.42],
            C.katCrimsonDark, 0, 0.04, 0, 0.4);
          this.draw("torus", [dagger.x, 0.07, dagger.z], [0.49, 0.055, 0.49],
            C.katCrimson, 4, 0.6, t * 1.4, 0.22, 0, Math.PI * 0.5);
          if (!this.drawKatarinaDagger([dagger.x, y, dagger.z], 0.9,
            heading, pitch, 0.8, false)) {
            this.draw("crystal", [dagger.x, y, dagger.z], [0.11, 0.55, 0.08],
              C.katCrimson, 3, 1,
              heading, 1, 0, pitch);
            this.draw("cylinder", [dagger.x, y, dagger.z], [0.065, 0.16, 0.065],
              C.katHilt, 0, 0.2, heading, 1, 0, pitch);
          }
        }

        for (const projectile of game.projectiles || []) {
          if (projectile.kind === "zed") {
            const angle = Math.atan2(projectile.dx, projectile.dz);
            for (let blade = 0; blade < 4; blade++) {
              const spin = t * 17 + blade * Math.PI * 0.5;
              this.draw("crystal",
                [projectile.x + Math.cos(spin) * 0.11, projectile.y, projectile.z + Math.sin(spin) * 0.11],
                [0.055, 0.26, 0.042], blade % 2 ? C.zedCrimson : C.zedSteelLight,
                3, 3.4 + beat, angle + spin, 0.95, 0, Math.PI * 0.5);
            }
            this.draw("sphere", [projectile.x, projectile.y, projectile.z], [0.22, 0.22, 0.22],
              C.zedCrimson, 4, 2.2 + beat, t, 0.2);
          } else if (projectile.kind === "gangplank") {
            const angle = Math.atan2(projectile.dx, projectile.dz);
            this.draw("sphere", [projectile.x, projectile.y, projectile.z], [0.14, 0.14, 0.14],
              C.gangplankGold, 4, 2.6 + beat, t, 0.35);
            this.draw("crystal", [projectile.x, projectile.y, projectile.z], [0.06, 0.22, 0.06],
              C.gangplankOrange, 3, 2.8 + beat, angle, 0.9, 0, Math.PI * 0.5);
          } else {
            const angle = Math.atan2(projectile.dx, projectile.dz);
            if (!this.drawKatarinaDagger(
              [projectile.x, projectile.y, projectile.z], 0.88,
              angle, Math.PI * 0.5, 2.8 + beat, true
            )) {
              this.draw("crystal", [projectile.x, projectile.y, projectile.z], [0.075, 0.38, 0.055],
                C.katBladeEdge, 3, 3.2 + beat, t * 11, 1, 1.12);
            }
            this.draw("sphere", [projectile.x, projectile.y, projectile.z], [0.18, 0.18, 0.18],
              C.katCrimson, 4, 1.6 + beat, t, 0.22);
          }
        }

        for (const trail of game.skillTrails || []) {
          const life = clamp(1 - trail.age / trail.life, 0, 1);
          for (let i = 1; i <= 7; i++) {
            const q = i / 8;
            const x = lerp(trail.x1, trail.x2, q);
            const z = lerp(trail.z1, trail.z2, q);
            const side = i % 2 ? 1 : -1;
            const trailA = trail.vladimir ? C.vladimirCrimson :
              trail.gangplank ? C.gangplankGold :
              trail.renekton ? C.renektonTeal : trail.zed ? C.zedCrimson : C.katCrimson;
            const trailB = trail.vladimir ? C.vladimirPale :
              trail.gangplank ? C.gangplankOrange :
              trail.renekton ? C.renektonGold : trail.zed ? C.zedSteelLight : C.katBlade;
            this.draw("crystal", [x, 0.24 + q * 0.35, z], [0.045, 0.2 * life, 0.035],
              side > 0 ? trailA : trailB, 3, 2.8 * life, trail.angle + side * 0.72, life, 0.9);
          }
        }

        for (const slash of game.slashes || []) {
          const life = clamp(1 - slash.age / slash.life, 0, 1);
          const radius = slash.radius * (1.1 - life * 0.16);
          const slashA = slash.vladimir ? C.vladimirCrimson :
            slash.gangplank ? C.gangplankGold :
            slash.renekton ? C.renektonTeal : slash.zed ? C.zedCrimson : C.katCrimson;
          const slashB = slash.vladimir ? C.vladimirPale :
            slash.gangplank ? C.gangplankOrange :
            slash.renekton ? C.renektonGold : slash.zed ? C.zedSteelLight : C.katBladeEdge;
          this.draw("torus", [slash.x, 0.28, slash.z], [radius, 0.075 * life, radius],
            slashA, 4, 3.8 * life + beat, t * 5, 0.72 * life, 0, Math.PI * 0.5);
          this.draw("torus", [slash.x, 0.31, slash.z],
            [radius * 0.72, 0.045 * life, radius * 0.72],
            slashB, 4, 2.5 * life, -t * 6, 0.42 * life, 0, Math.PI * 0.5);
        }

        for (const mark of game.zedMarks || []) {
          const target = game.players?.find((candidate) => candidate.id === mark.targetId && candidate.alive);
          if (!target) continue;
          const warning = clamp(mark.age / mark.fuse, 0, 1);
          const pulse = 0.82 + Math.sin(t * (8 + warning * 14)) * (0.06 + warning * 0.1);
          this.draw("torus", [target.x, 0.16, target.z], [0.58 * pulse, 0.055, 0.58 * pulse],
            C.zedCrimson, 4, 1.8 + warning * 4 + beat, -t * 4.2, 0.78, 0, Math.PI * 0.5);
          this.draw("crystal", [target.x, 1.86 + Math.sin(t * 5) * 0.06, target.z],
            [0.12 + warning * 0.05, 0.32, 0.12 + warning * 0.05],
            warning > 0.72 ? C.whiteGold : C.zedCrimson, 3, 2.4 + warning * 5, t * 3.6);
        }


        for (const barrel of game.gangplankBarrels || []) {
          if (barrel.exploded) continue;
          const pulse = 0.92 + Math.sin(t * 5.5 + barrel.id) * 0.08;
          this.draw("cylinder", [barrel.x, 0.28, barrel.z], [0.28 * pulse, 0.34, 0.28 * pulse],
            C.gangplankBronze, 2, 0.4 + beat, t * 0.4);
          this.draw("sphere", [barrel.x, 0.52, barrel.z], [0.16, 0.1, 0.16],
            C.gangplankOrange, 4, 1.8 + beat, t, 0.7);
          this.draw("torus", [barrel.x, 0.08, barrel.z], [0.38, 0.04, 0.38],
            C.gangplankGold, 4, 1.2 + beat, -t * 2, 0.5, 0, Math.PI * 0.5);
        }
        for (const barrage of game.gangplankBarrages || []) {
          if (barrage.detonated) continue;
          const progress = clamp(barrage.age / barrage.fuse, 0, 1);
          const pulse = 0.85 + Math.sin(t * 8) * 0.12 + progress * 0.2;
          this.draw("torus", [barrage.x, 0.1, barrage.z], [barrage.radius * pulse, 0.07, barrage.radius * pulse],
            C.gangplankOrange, 4, 2.4 + beat, -t * 2.4, 0.7, 0, Math.PI * 0.5);
          this.draw("torus", [barrage.x, 0.14, barrage.z], [barrage.radius * 0.72 * pulse, 0.05, barrage.radius * 0.72 * pulse],
            C.gangplankGold, 4, 1.6 + beat, t * 1.8, 0.55, 0, Math.PI * 0.5);
        }
        for (const mark of game.vladimirMarks || []) {
          const pulse = 0.9 + Math.sin(t * 6.2 + mark.age * 5) * 0.08;
          const radius = mark.radius * (0.92 + clamp(mark.age / mark.fuse, 0, 1) * 0.12);
          this.draw("torus", [mark.x, 0.11, mark.z], [radius * pulse, 0.07, radius * pulse],
            C.vladimirCrimson, 4, 2.1 + beat, -t * 2.8, 0.72, 0, Math.PI * 0.5);
          this.draw("sphere", [mark.x, 0.055, mark.z], [radius * 0.88, 0.028, radius * 0.88],
            C.vladimirBloodDark, 4, 0.8 + beat, t, 0.5);
          for (let i = 0; i < 7; i++) {
            const angle = i / 7 * TAU + t * 0.6;
            this.draw("sphere", [mark.x + Math.cos(angle) * radius * 0.78, 0.1,
              mark.z + Math.sin(angle) * radius * 0.78], [0.08, 0.04, 0.08],
              i % 2 ? C.vladimirBlood : C.vladimirPale, 4, 1.5 + beat, angle, 0.56);
          }
        }

        for (const enemy of game.enemies) {
          const hurt = enemy.hurt > 0 ? 1 : 0;
          if (enemy.boss) this.drawBaron(enemy, t, beat, hurt);
          else if (enemy.kind === 2) this.drawHerald(enemy, t, beat, hurt);
          else this.drawMinion(enemy, t, beat, hurt);
        }

        if (!modelReviewMode) {
          for (const shadow of game.zedShadows || []) this.drawZed(shadow, t, beat, true);
        }

        const player = game.player;
        if (modelReviewMode && modelReviewTarget === "bomb") {
          RIFTBOMB_BOMB_APPEARANCE.drawBomb(this, {
            id: 1,
            x: 0,
            z: 0,
            age: 0.45,
            fuse: 2.35,
            ownerId: 1
          }, t, beat, { review: true });
        } else if (modelReviewMode && modelReviewTarget === "dagger") {
          // Bottom-left spawn-safe cell keeps the gameplay-scale silhouette in
          // the real arena camera without a random crate obscuring the blade.
          this.drawReadyKatarinaDagger({ id: 0, x: -5.28, z: 5.28 }, t, beat);
        } else if (modelReviewMode && modelReviewTarget === "katarina" && player) {
          this.drawKatarina({
            ...player,
            champion: "katarina",
            x: 0,
            z: 0,
            facing: modelReviewPose === "lotus" ? Math.PI - t * 10.8 : -0.36,
            invulnerable: 0,
            shield: modelReviewPose === "shield" ? 4 : 0,
            dashing: modelReviewPose === "run" ? 1 : 0,
            moving: modelReviewPose === "run",
            ultChannel: modelReviewPose === "lotus" ? 1 : 0,
            spin: modelReviewPose === "voracity" ? 1 : 0,
            castAnim: modelReviewPose === "cast" ? 0.21 : 0
          }, t, beat);
        } else if (modelReviewMode && modelReviewTarget === "zed" && player) {
          this.drawZed({
            ...player,
            champion: "zed",
            x: 0,
            z: 0,
            facing: -0.34,
            invulnerable: 0,
            shield: modelReviewPose === "shield" ? 4 : 0,
            moving: modelReviewPose === "run",
            zedUltAnim: modelReviewPose === "ult" ? 0.34 : 0,
            zedSlashAnim: modelReviewPose === "slash" ? 0.34 : 0,
            castAnim: modelReviewPose === "cast" ? 0.24 : 0,
            castDuration: 0.48
          }, t, beat, modelReviewPose === "shadow");
        } else if (modelReviewMode && modelReviewTarget === "renekton" && player) {
          this.drawRenekton({
            ...player,
            champion: "renekton",
            x: 0,
            z: 0,
            facing: -0.34,
            invulnerable: 0,
            shield: modelReviewPose === "shield" ? 4 : 0,
            moving: modelReviewPose === "run",
            renektonDominus: modelReviewPose === "ult" ? 4 : 0,
            renektonUltAnim: modelReviewPose === "ult" ? 0.36 : 0,
            renektonSlashAnim: modelReviewPose === "slash" ? 0.4 : 0,
            renektonDashAnim: modelReviewPose === "dash" ? 0.3 : 0,
            castAnim: modelReviewPose === "cast" ? 0.25 : 0,
            castDuration: 0.5
          }, t, beat);
        } else if (modelReviewMode && modelReviewTarget === "vladimir" && player) {
          this.drawVladimir({
            ...player,
            champion: "vladimir",
            x: 0,
            z: 0,
            facing: -0.34,
            invulnerable: 0,
            shield: modelReviewPose === "shield" ? 4 : 0,
            moving: modelReviewPose === "run",
            vladimirPool: modelReviewPose === "pool" ? 2 : 0,
            vladimirAttackAnim: modelReviewPose === "attack" ? 0.21 : 0,
            vladimirQAnim: modelReviewPose === "cast" ? 0.28 : 0,
            vladimirUltAnim: modelReviewPose === "ult" ? 0.33 : 0,
            vladimirEAnim: modelReviewPose === "burst" ? 0.4 : 0,
            castAnim: modelReviewPose === "cast" ? 0.28 : 0,
            castDuration: 0.55
          }, t, beat);
        } else if (modelReviewMode && modelReviewTarget === "gangplank" && player) {
          this.drawGangplank({
            ...player,
            champion: "gangplank",
            x: 0,
            z: 0,
            facing: -0.34,
            invulnerable: 0,
            shield: modelReviewPose === "shield" ? 4 : 0,
            moving: modelReviewPose === "run",
            gangplankShotAnim: modelReviewPose === "slash" || modelReviewPose === "cast" ? 0.4 : 0,
            gangplankKegAnim: modelReviewPose === "dash" ? 0.3 : 0,
            gangplankUltAnim: modelReviewPose === "ult" ? 0.35 : 0,
            castAnim: modelReviewPose === "cast" ? 0.28 : 0,
            castDuration: 0.42
          }, t, beat);
        } else if (!modelReviewMode) {
          for (const contestant of game.players || [player]) {
            if (contestant?.alive === false) continue;
            if (contestant.champion === "katarina") this.drawKatarina(contestant, t, beat);
            else if (contestant.champion === "zed") this.drawZed(contestant, t, beat);
            else if (contestant.champion === "renekton") this.drawRenekton(contestant, t, beat);
            else if (contestant.champion === "vladimir") this.drawVladimir(contestant, t, beat);
            else if (contestant.champion === "gangplank") this.drawGangplank(contestant, t, beat);
          }
        }

        this.drawParticles(game.particles, vp, t);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(this.postProgram);
        gl.bindVertexArray(this.postVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.uniform1i(this.postUniforms.uScene, 0);
        gl.uniform2f(this.postUniforms.uResolution, this.width, this.height);
        gl.uniform1f(this.postUniforms.uTime, t);
        gl.uniform1f(this.postUniforms.uBeat, beat);
        gl.uniform1f(this.postUniforms.uEnergy, this.mobilePerf ? sfx.intensity * 0.55 : sfx.intensity);
        gl.uniform1f(this.postUniforms.uHit, this.mobilePerf ? this.hitPulse * 0.55 : this.hitPulse);
        gl.uniform1f(this.postUniforms.uHealth, player ? player.health / player.maxHealth : 1);
        gl.uniform1f(this.postUniforms.uReduced, (prefersReducedMotion || this.mobilePerf) ? 1 : 0);
        const shocks = this.mobilePerf ? this.shocks.slice(0, 2) : this.shocks.slice(0, 4);
        for (let i = 0; i < 4; i++) {
          const s = shocks[i];
          const loc = this.postUniforms[`uShock${i}`];
          if (s) {
            const uv = projectPoint(vp, [s.x, 0.2, s.z]);
            gl.uniform4f(loc, uv[0], uv[1], s.age, this.mobilePerf ? s.strength * 0.7 : s.strength);
          } else {
            gl.uniform4f(loc, -2, -2, 2, 0);
          }
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);

        // Real skill icons as DOM discs over the WebGL pedestals
        if (!modelReviewMode) {
          // DOM layout thrash is expensive on phones — refresh less often.
          if (!this.mobilePerf || (now - (this.lastSkillTokenSync || 0)) > 48) {
            this.syncSkillTokenDom(game.pickups, t);
            this.lastSkillTokenSync = now;
          }
          this.syncCharacterHealthDom(game.players || [player]);
        } else if (this.characterHealthLayer) {
          this.characterHealthLayer.replaceChildren();
        }

        const frameMs = dt * 1000;
        this.frameSamples.push(frameMs);
        if (this.frameSamples.length > (this.mobilePerf ? 45 : 120)) this.frameSamples.shift();
        const qualityInterval = this.mobilePerf ? 900 : 2600;
        if (now - this.lastQualityCheck > qualityInterval && this.frameSamples.length > 12) {
          const avg = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
          const maxScale = this.maxScale ?? Math.min(devicePixelRatio || 1, 1.45);
          const minScale = this.minScale ?? 0.7;
          if (avg > (this.mobilePerf ? 18 : 22) && this.scale > minScale) {
            this.scale = Math.max(minScale, this.scale - (this.mobilePerf ? 0.1 : 0.12));
          } else if (avg < (this.mobilePerf ? 14 : 15) && this.scale < maxScale) {
            this.scale = Math.min(maxScale, this.scale + (this.mobilePerf ? 0.04 : 0.06));
          }
          UI.gpuLabel.textContent = `WebGL2 · ${Math.round(this.scale * 100)}%${this.mobilePerf ? " · mobile" : ""}`;
          this.lastQualityCheck = now;
          this.frameSamples.length = 0;
        }
      }

      drawParticles(particles, vp, t) {
        if (!particles.length) return;
        const gl = this.gl;
        const maxDraw = this.mobilePerf ? 80 : particles.length;
        const list = particles.length > maxDraw ? particles.slice(particles.length - maxDraw) : particles;
        const needed = list.length * 8;
        if (!this.particleData || this.particleData.length < needed) {
          this.particleData = new Float32Array(Math.max(needed, this.mobilePerf ? 640 : 256));
        }
        const data = this.particleData;
        let o = 0;
        for (const p of list) {
          const life = clamp(1 - p.age / p.life, 0, 1);
          data[o++] = p.x;
          data[o++] = p.y;
          data[o++] = p.z;
          data[o++] = p.size * life * (this.mobilePerf ? 0.92 : 1);
          data[o++] = p.color[0];
          data[o++] = p.color[1];
          data[o++] = p.color[2];
          data[o++] = life * p.alpha;
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        gl.useProgram(this.particleProgram);
        gl.uniformMatrix4fv(this.particleUniforms.uViewProjection, false, vp);
        gl.uniform2f(this.particleUniforms.uResolution, this.width, this.height);
        gl.uniform1f(this.particleUniforms.uTime, t);
        gl.bindVertexArray(this.particleVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, needed), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.POINTS, 0, list.length);
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.useProgram(this.mainProgram);
      }
    }

    Renderer.colors = {
      floor: hexToRgb("#8a5a3a"),
      lane: hexToRgb("#a87850"),
      river: hexToRgb("#1a757e"),
      riverLight: hexToRgb("#4dcecf"),
      forest: hexToRgb("#2c6a42"),
      forestDark: hexToRgb("#1c4a34"),
      moss: hexToRgb("#4a7a48"),
      brushA: hexToRgb("#387848"),
      brushB: hexToRgb("#54894a"),
      bark: hexToRgb("#5a4a34"),
      stone: hexToRgb("#62706a"),
      arenaFloorA: hexToRgb("#8a5a3a"),
      arenaFloorB: hexToRgb("#6e452c"),
      arenaStone: hexToRgb("#4a5c64"),
      arenaStoneTop: hexToRgb("#82928c"),
      crate: hexToRgb("#5a3824"),
      crateDark: hexToRgb("#2a1814"),
      crateTrim: hexToRgb("#c6954d"),
      bomb: hexToRgb("#20221e"),
      player: hexToRgb("#e2bf72"),
      katSkin: hexToRgb("#ead0c2"),
      katHair: hexToRgb("#9e2135"),
      katHairLight: hexToRgb("#d3484b"),
      katCrimson: hexToRgb("#bd263f"),
      katCrimsonDark: hexToRgb("#571529"),
      katLeather: hexToRgb("#211821"),
      katBoot: hexToRgb("#0d1118"),
      katGlove: hexToRgb("#29171f"),
      katSteel: hexToRgb("#8f9ca2"),
      katBlade: hexToRgb("#becbd0"),
      katBladeEdge: hexToRgb("#f0f5ef"),
      katHilt: hexToRgb("#27151c"),
      katSash: hexToRgb("#77182c"),
      katEye: hexToRgb("#63e69e"),
      katScar: hexToRgb("#9d3a43"),
      katMouth: hexToRgb("#6d2433"),
      zedSteel: hexToRgb("#565c68"),
      zedSteelLight: hexToRgb("#a7acb6"),
      zedCrimson: hexToRgb("#d31d3d"),
      zedCrimsonDark: hexToRgb("#49040f"),
      zedShadow: hexToRgb("#100108"),
      renektonBronze: hexToRgb("#8f6428"),
      renektonGold: hexToRgb("#d3ae56"),
      renektonTeal: hexToRgb("#2e9d8a"),
      renektonBlood: hexToRgb("#8f271d"),
      renektonDark: hexToRgb("#111d1a"),
      vladimirCrimson: hexToRgb("#a20c2d"),
      vladimirBlood: hexToRgb("#650416"),
      vladimirBloodDark: hexToRgb("#160006"),
      vladimirPale: hexToRgb("#d8c1ba"),
      vladimirGold: hexToRgb("#b98c59"),
      gangplankBronze: hexToRgb("#8a5a2b"),
      gangplankGold: hexToRgb("#d4a84b"),
      gangplankOrange: hexToRgb("#e07028"),
      gangplankDark: hexToRgb("#1a120c"),
      gangplankSea: hexToRgb("#2a6b7c"),
      voidling: hexToRgb("#be3f4a"),
      hunter: hexToRgb("#d35b4f"),
      minionRed: hexToRgb("#ad2638"),
      minionCloth: hexToRgb("#302a43"),
      minionFace: hexToRgb("#515063"),
      minionVisor: hexToRgb("#561c2a"),
      minionEye: hexToRgb("#ffca55"),
      minionBlade: hexToRgb("#b7c8cb"),
      minionStaff: hexToRgb("#4f3446"),
      minionGold: hexToRgb("#d7a44b"),
      heraldHide: hexToRgb("#603a83"),
      heraldArmor: hexToRgb("#372852"),
      heraldHorn: hexToRgb("#a96fbd"),
      heraldClaw: hexToRgb("#8670aa"),
      heraldEyeDark: hexToRgb("#180e2b"),
      heraldEye: hexToRgb("#de65ff"),
      boss: hexToRgb("#63418e"),
      baronHide: hexToRgb("#6b3f83"),
      baronShell: hexToRgb("#2d2348"),
      baronFace: hexToRgb("#3b2752"),
      baronHorn: hexToRgb("#c48ce5"),
      baronSpine: hexToRgb("#8d5ab6"),
      baronClaw: hexToRgb("#b47bd2"),
      baronEye: hexToRgb("#ff9a45"),
      baronMouth: hexToRgb("#32c8bf"),
      baronTeeth: hexToRgb("#d8f3df"),
      baronRift: hexToRgb("#8a4cbd"),
      blueSide: hexToRgb("#2fb8ec"),
      redSide: hexToRgb("#df414d"),
      rift: hexToRgb("#2ba8d0"),
      violet: hexToRgb("#8667d8"),
      gold: hexToRgb("#f6cf78"),
      whiteGold: hexToRgb("#fff2bf"),
      ember: hexToRgb("#e44b55"),
      ice: hexToRgb("#8ee5df"),
      mint: hexToRgb("#59f2b2"),
      white: hexToRgb("#ffffff"),
      shadow: hexToRgb("#07151b")
    };

    Renderer.redColors = {
      ...Renderer.colors,
      blueSide: Renderer.colors.redSide,
    };

    Renderer.mainVertex = `#version 300 es
      precision highp float;
      layout(location = 0) in vec3 aPosition;
      layout(location = 1) in vec3 aNormal;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec3 vLocal;
      void main() {
        vec4 world = uModel * vec4(aPosition, 1.0);
        vWorld = world.xyz;
          vNormal = normalize(transpose(inverse(mat3(uModel))) * aNormal);
        vLocal = aPosition;
        gl_Position = uViewProjection * world;
      }
    `;

    Renderer.mainFragment = `#version 300 es
      precision highp float;
      in vec3 vWorld;
      in vec3 vNormal;
      in vec3 vLocal;
      uniform vec3 uColor;
      uniform vec3 uCamera;
      uniform float uTime;
      uniform float uBeat;
      uniform float uEmissive;
      uniform float uMaterial;
      uniform float uAlpha;
      uniform sampler2D uAlbedo;
      uniform sampler2D uAlbedoTop;
      uniform float uMapId;
      uniform float uFloorProfile;
      uniform float uArenaProfile;
      out vec4 outColor;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float lum(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      vec2 faceUv(vec3 local, vec3 n) {
        vec3 a = abs(n);
        if (a.y >= a.x && a.y >= a.z) return local.xz * 0.5 + 0.5;
        if (a.x >= a.z) return local.zy * 0.5 + 0.5;
        return local.xy * 0.5 + 0.5;
      }

      vec2 mirroredTile(vec2 uv) {
        vec2 doubled = fract(uv * 0.5) * 2.0;
        vec2 mirrored = 1.0 - abs(doubled - 1.0);
        vec2 halfTexel = vec2(0.5 / 1024.0);
        return mix(halfTexel, vec2(1.0) - halfTexel, mirrored);
      }

      // Legacy multi-scale path retained byte-for-byte in behavior for the other arenas.
      vec3 sampleAlbedoDetail(sampler2D map, vec2 uv, float detailScale, float detailMix) {
        vec3 base = texture(map, uv).rgb;
        vec3 detail = texture(map, uv * detailScale).rgb;
        vec3 over = mix(2.0 * base * detail, 1.0 - 2.0 * (1.0 - base) * (1.0 - detail), step(0.5, lum(base)));
        return mix(base, over, detailMix);
      }

      // Low-noise floor profile: preserve authored macro values while rotating and
      // mirroring the quiet micro layer so repeated stones never align as a grid.
      vec3 sampleCombatBandDetail(sampler2D map, vec2 uv, float detailScale, float detailMix) {
        vec3 base = texture(map, uv).rgb;
        mat2 detailRotation = mat2(0.8, -0.6, 0.6, 0.8);
        vec2 detailCoord = detailRotation * ((uv - 0.5) * detailScale) + vec2(0.37, 0.61);
        vec3 detail = texture(map, mirroredTile(detailCoord)).rgb;
        // Overlay blend keeps grain without washing midtones
        vec3 over = mix(2.0 * base * detail, 1.0 - 2.0 * (1.0 - base) * (1.0 - detail), step(0.5, lum(base)));
        return mix(base, over, detailMix);
      }

      // Fake surface normal from albedo luminance (cheap height-map relief).
      vec3 bumpFromAlbedo(sampler2D map, vec2 uv, vec3 N, float strength) {
        // Floor/wall albedos are now 1024+ — sample a true texel, not a soft 512 blob.
        vec2 texel = vec2(1.0 / 1024.0);
        float hC = lum(texture(map, uv).rgb);
        float hX = lum(texture(map, uv + vec2(texel.x * 2.0, 0.0)).rgb);
        float hY = lum(texture(map, uv + vec2(0.0, texel.y * 2.0)).rgb);
        vec3 T = normalize(cross(N, vec3(0.0, 1.0, 0.001)));
        if (length(T) < 0.01) T = normalize(cross(N, vec3(1.0, 0.0, 0.0)));
        vec3 B = normalize(cross(N, T));
        vec3 bump = normalize(vec3((hC - hX) * strength, (hC - hY) * strength, 1.0));
        return normalize(T * bump.x + B * bump.y + N * bump.z);
      }

      // Mild filmic compress — scene is display-referred; post must NOT re-tonemap.
      vec3 tonemap(vec3 x) {
        x = max(x, vec3(0.0));
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      void main() {
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(uCamera - vWorld);
        float nacreProfile = step(0.5, uArenaProfile);
        vec3 Lkey = normalize(mix(vec3(-0.28, 0.92, 0.24), vec3(-0.46, 0.78, 0.43), nacreProfile));
        vec3 Lfill = normalize(mix(vec3(0.62, 0.42, -0.48), vec3(0.58, 0.24, -0.6), nacreProfile));
        float ndlKey = max(dot(N, Lkey), 0.0);
        float ndlFill = max(dot(N, Lfill), 0.0);
        float wrapKey = max(dot(N, Lkey) * 0.55 + 0.45, 0.0);
        float hemi = N.y * 0.5 + 0.5;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
        float edge = pow(max(max(abs(vLocal.x), abs(vLocal.y)), abs(vLocal.z)), 10.0);
        float spec = pow(max(dot(N, normalize(Lkey + V)), 0.0), 42.0);

        // mapped: texture is ground truth. solid: stylized uColor.
        vec3 albedo = uColor;
        float mapped = 0.0;
        vec2 mapUv = vec2(0.0);
        float topFace = step(0.55, abs(N.y));
        if (uMapId > 0.5) {
          vec2 uv;
          if (uMapId > 3.5 && uMapId < 4.5) {
            // skillDisc: unit circle in XZ, y=0, normals +Y — UV from xz covers full icon
            uv = clamp(vLocal.xz * 0.5 + 0.5, 0.0, 1.0);
            albedo = texture(uAlbedo, uv).rgb;
            mapUv = uv;
          } else if (uMapId > 5.5 && uMapId < 6.5) {
            // The cave shelf spans the whole arena, so sample in world space.
            // Local-space UVs stretched a single texel field across the huge
            // slab and turned the reef into soft, repeated blobs.
            vec3 weights = pow(abs(N), vec3(4.0));
            weights /= max(weights.x + weights.y + weights.z, 0.001);
            vec3 sampleX = texture(uAlbedo, mirroredTile(vWorld.zy * 0.105 + 0.5)).rgb;
            vec3 sampleY = texture(uAlbedo, mirroredTile(vWorld.xz * 0.105 + 0.5)).rgb;
            vec3 sampleZ = texture(uAlbedo, mirroredTile(vWorld.xy * 0.105 + 0.5)).rgb;
            albedo = sampleX * weights.x + sampleY * weights.y + sampleZ * weights.z;
          } else if (uMapId > 4.5 && uMapId < 5.5) {
            vec3 weights = pow(abs(N), vec3(4.0));
            weights /= max(weights.x + weights.y + weights.z, 0.001);
            vec3 sampleX = texture(uAlbedo, mirroredTile(vLocal.zy * 0.38 + vWorld.zy * 0.07 + 0.5)).rgb;
            vec3 sampleY = texture(uAlbedo, mirroredTile(vLocal.xz * 0.38 + vWorld.xz * 0.07 + 0.5)).rgb;
            vec3 sampleZ = texture(uAlbedo, mirroredTile(vLocal.xy * 0.38 + vWorld.xy * 0.07 + 0.5)).rgb;
            albedo = sampleX * weights.x + sampleY * weights.y + sampleZ * weights.z;
          } else if (uMapId > 1.5 && uMapId < 2.5) {
            // CRATE: one full face of the X-panel art — never tile/fract or multi-scale
            // (tiling turned the X into a pixel soup).
            uv = clamp(faceUv(vLocal, N), 0.0, 1.0);
            mapUv = uv;
            vec3 sideAlbedo = texture(uAlbedo, uv).rgb;
            vec3 topAlbedo = texture(uAlbedoTop, uv).rgb;
            albedo = mix(sideAlbedo, topAlbedo, topFace);
            // Soft wood bump only (low strength — high contrast braces otherwise noise)
            vec3 NbSide = bumpFromAlbedo(uAlbedo, uv, N, 0.85);
            vec3 NbTop = bumpFromAlbedo(uAlbedoTop, uv, N, 0.7);
            vec3 Nb = mix(NbSide, NbTop, topFace);
            N = normalize(mix(N, Nb, 0.28));
          } else if (uMapId > 2.5 && uMapId < 3.5) {
            // WALL: one authored material across each block; no micro-tiling.
            uv = clamp(faceUv(vLocal, N), 0.0, 1.0);
            mapUv = uv;
            vec3 sideAlbedo = texture(uAlbedo, uv).rgb;
            vec3 topAlbedo = texture(uAlbedoTop, uv).rgb;
            albedo = mix(sideAlbedo, topAlbedo, topFace);
            vec3 NbSide = bumpFromAlbedo(uAlbedo, uv, N, 1.15);
            vec3 NbTop = bumpFromAlbedo(uAlbedoTop, uv, N, 0.95);
            vec3 Nb = mix(NbSide, NbTop, topFace);
            N = normalize(mix(N, Nb, 0.3));
          } else {
            if (uArenaProfile > 0.5) {
              // Nacre's 4x4 carved atlas is authored for the whole arena. Keep
              // its central rings centered and expose the engraved cell seams.
              uv = clamp(vWorld.xz * vec2(0.051, 0.061) + 0.5, 0.0, 1.0);
              mapUv = uv;
              albedo = sampleCombatBandDetail(uAlbedo, uv, 4.25, 0.32);
              vec3 Nb = bumpFromAlbedo(uAlbedo, uv, N, 1.25);
              N = normalize(mix(N, Nb, 0.36));
            } else if (uFloorProfile > 0.5) {
              // Authored low-noise floors use one arena-scale material with restrained
              // microdetail. UVs remain independent from the 99 floor cells.
              uv = fract(vWorld.xz * 0.066 + 0.5);
              mapUv = uv;
              albedo = sampleCombatBandDetail(uAlbedo, uv, 5.25, 0.16);
              vec3 Nb = bumpFromAlbedo(uAlbedo, uv, N, 0.8);
              N = normalize(mix(N, Nb, 0.22));
            } else {
              // Preserve the established material response of the other four arenas.
              uv = clamp(vWorld.xz * 0.072 + 0.5, 0.0, 1.0);
              mapUv = uv;
              albedo = sampleAlbedoDetail(uAlbedo, uv, 5.5, 0.28);
              vec3 Nb = bumpFromAlbedo(uAlbedo, uv, N, 1.15);
              N = normalize(mix(N, Nb, 0.32));
            }
          }
          mapped = 1.0;
          if (uMapId > 4.5) edge *= 0.12;
          // Nacre albedos are authored as bright oyster stone. Grade them in-scene
          // so the material keeps detail under the shared HDR/post stack instead of
          // clipping into the white prototype look.
          if (uArenaProfile > 0.5) {
            if (uMapId > 5.5 && uMapId < 6.5) {
              // The outer cavern owns a separate dark reef material. It is a
              // real world-space mesh, but recedes behind the playable pearls.
              float reefVein = smoothstep(0.045, 0.12, 0.5 * (albedo.g + albedo.b) - albedo.r);
              albedo = mix(albedo, sqrt(max(albedo, vec3(0.0))), 0.06);
              albedo *= vec3(0.42, 0.56, 0.64);
              albedo += vec3(0.01, 0.24, 0.3) * reefVein * 0.24;
            } else if (uMapId > 4.5 && uMapId < 5.5) {
              albedo *= vec3(0.36, 0.39, 0.42);
            } else if (uMapId > 0.5 && uMapId < 1.5) {
              albedo *= vec3(0.84, 0.85, 0.84);
            } else if (uMapId > 2.5 && uMapId < 3.5) {
              albedo *= vec3(0.58, 0.62, 0.64);
            } else {
              albedo *= vec3(0.78, 0.8, 0.79);
            }
            if (uMapId > 2.5 && uMapId < 3.5
               && uMaterial > 0.5 && uMaterial < 1.5) {
              // Interior blockers use the same authored carved wall texture with
              // a deep wet-stone grade; perimeter blocks remain pale pearl.
              albedo *= vec3(0.58, 0.62, 0.64);
            }
          }
          // Recompute lighting terms after bump
          ndlKey = max(dot(N, Lkey), 0.0);
          ndlFill = max(dot(N, Lfill), 0.0);
          wrapKey = max(dot(N, Lkey) * 0.55 + 0.45, 0.0);
          hemi = N.y * 0.5 + 0.5;
          rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
          spec = pow(max(dot(N, normalize(Lkey + V)), 0.0), 48.0);
        }

        // Crash N.Sane lighting: warm key, cool fill, soft half-lambert, readable ramps
        vec3 sky = vec3(0.35, 0.55, 0.75);
        vec3 groundAmb = vec3(0.22, 0.14, 0.08);
        vec3 ambient = mix(groundAmb, sky, hemi);
        float ao = mix(0.72, 1.0, smoothstep(0.4, 0.97, 1.0 - edge * 0.55));
        ao *= mix(0.88, 1.0, smoothstep(-0.1, 0.55, vLocal.y));
        float softLit = clamp(wrapKey * 0.72 + ndlKey * 0.38 + ndlFill * 0.22, 0.0, 1.0);
        // Soft 3-band ramp (Crash toy-shading without hard toon edges)
        float ramp = smoothstep(0.0, 0.35, softLit) * 0.42
          + smoothstep(0.35, 0.7, softLit) * 0.38
          + smoothstep(0.7, 1.0, softLit) * 0.2;

        vec3 color;
        if (mapped > 0.5) {
          if (uMapId > 3.5 && uMapId < 4.5) {
            float shade = 0.94 + wrapKey * 0.06;
            color = albedo * shade;
            color += albedo * uEmissive * 0.7;
            color += vec3(1.0, 0.94, 0.78) * rim * 0.04;
          } else {
            // Authored albedo stays grounded; lighting adds form without bleaching it.
            float shade = 0.5 + ramp * 0.62;
            shade *= ao;
            color = albedo * shade;
            color += albedo * ambient * 0.1;
            color += albedo * edge * 0.06;
            color += vec3(1.0, 0.95, 0.85) * spec * 0.04;
            if (uArenaProfile > 0.5) {
              // Thin-film oyster response derived from view angle, normal and world
              // position. It relights with the mesh instead of baking highlights into
              // a screenshot, while the low energy keeps the pale stone from clipping.
              float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.1);
              float band = 0.5 + 0.5 * sin(dot(N, V) * 17.0
                + vWorld.x * 0.31 - vWorld.z * 0.27);
              vec3 roseSheen = vec3(0.34, 0.16, 0.28);
              vec3 cyanSheen = vec3(0.08, 0.34, 0.38);
              vec3 nacreSheen = mix(roseSheen, cyanSheen, band);
              float growthSheen = (uMapId > 4.5 && uMapId < 5.5)
                ? 1.85
                 : ((uMapId > 5.5 && uMapId < 6.5) ? 0.35 : 1.0);
              color += nacreSheen * (0.018 + fresnel * 0.09) * growthSheen;
              color += vec3(0.72, 0.86, 0.9) * spec * 0.075 * growthSheen;
              float broadPearl = pow(max(dot(N, normalize(Lkey + V)), 0.0), 18.0);
              float pearlEnergy = (uMapId > 4.5 && uMapId < 5.5)
                ? 0.16
                : ((uMapId > 5.5 && uMapId < 6.5) ? 0.09 : 0.11);
              color += vec3(0.72, 0.82, 0.86) * broadPearl * pearlEnergy;
            }
          }
        } else {
          // PRIMARY Crash solid path — saturated, chunky, readable
          float shade = 0.34 + ramp * 0.78;
          shade *= ao;
          color = albedo * shade;
          color += albedo * ambient * 0.22;
          color += vec3(1.0, 0.92, 0.75) * ndlKey * 0.12 * albedo;
          color += vec3(0.55, 0.75, 1.0) * ndlFill * 0.08 * albedo;
          // Cartoon volume edge
          color *= mix(0.78, 1.0, 1.0 - edge * 0.55);
          color += albedo * rim * (0.12 + uEmissive * 0.15);
          color += vec3(1.0, 0.96, 0.88) * spec * 0.22;
          color += albedo * uEmissive * 0.35;
          // Pop saturation (Crash toys are candy-colored)
          float L = lum(color);
          color = mix(vec3(L), color, 1.22);

          if (uMaterial > 0.5 && uMaterial < 1.5) {
            // subtle stage noise only
            color *= 0.97 + hash21(floor(vWorld.xz * 3.0)) * 0.04;
          } else if (uMaterial > 1.5 && uMaterial < 2.5) {
            float facets = 0.6 + 0.4 * sin((vWorld.x + vWorld.y * 1.7 + vWorld.z) * 10.0 + uTime * 1.2);
            color += albedo * facets * (0.1 + uEmissive * 0.08);
            color += vec3(0.6, 0.85, 1.0) * rim * 0.35;
          } else if (uMaterial > 2.5 && uMaterial < 3.5) {
            float bands = 0.5 + 0.5 * sin((vLocal.y + length(vLocal.xz)) * 16.0 - uTime * 9.0);
            color += albedo * (uEmissive * (0.3 + bands * 0.22));
            color += vec3(1.0, 0.9, 0.55) * rim * uEmissive * 0.25;
          } else if (uMaterial > 3.5) {
            color = albedo * (0.58 + uEmissive * 0.52);
            color += albedo * (rim + edge) * (0.5 + uBeat * 0.3);
          }
        }

        // Restrained distance separation; never wash the material palette blue.
        float dist = length(uCamera - vWorld);
        float fog = smoothstep(11.0, 30.0, dist);
        vec3 fogColor = vec3(0.055, 0.085, 0.11);
        color = mix(color, fogColor, fog * 0.16);

        color = tonemap(color * 1.12);
        outColor = vec4(color, uAlpha);
      }
    `;

    Renderer.arenaFxVertex = `#version 300 es
      precision highp float;
      layout(location = 0) in vec3 aPosition;
      layout(location = 1) in vec3 aNormal;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      out vec3 vWorld;
      out vec3 vLocal;
      out float vTop;
      void main() {
        vec4 world = uModel * vec4(aPosition, 1.0);
        vWorld = world.xyz;
        vLocal = aPosition;
        vTop = aNormal.y;
        gl_Position = uViewProjection * world;
      }
    `;

    Renderer.arenaFxFragment = `#version 300 es
      precision highp float;
      in vec3 vWorld;
      in vec3 vLocal;
      in float vTop;
      uniform float uTime;
      uniform float uBeat;
      uniform vec3 uPrimary;
      uniform vec3 uSecondary;
      uniform float uMotif;
      uniform float uIntensity;
      uniform float uSpeed;
      uniform float uDensity;
      uniform float uReduced;
      out vec4 outColor;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float lineAA(float value, float width) {
        float d = abs(fract(value) - 0.5);
        float aa = max(fwidth(value) * 1.35, 0.001);
        return 1.0 - smoothstep(width, width + aa, d);
      }

      void main() {
        if (vTop < 0.5) discard;
        vec2 w = vWorld.xz * uDensity;
        float motion = uTime * uSpeed * (1.0 - uReduced);
        float safeBeat = uBeat * (1.0 - uReduced);
        float signal = 0.0;
        float accent = 0.0;

        if (uMotif < 0.5) {
          // Salt Lens Array: optical contours cross sparse mineral survey lines.
          float lens = lineAA(length(w * vec2(0.72, 0.94)) * 0.42 - motion * 0.025, 0.028);
          float survey = lineAA((w.x + w.y) * 0.19 + sin(w.y * 0.55) * 0.05, 0.016);
          float sparse = smoothstep(0.76, 0.96, hash21(floor(w * 0.72)));
          signal = lens * (0.42 + sparse * 0.38) + survey * 0.16;
          accent = lineAA(length(w - vec2(2.2, -1.1)) * 0.66 + motion * 0.035, 0.018) * sparse;
        } else if (uMotif < 1.5) {
          // Nacre Hollow: two slow interference pools create shell-like iridescence.
          float shellA = lineAA(length(w - vec2(-1.7, 0.8)) * 0.48 - motion * 0.025, 0.025);
          float shellB = lineAA(length(w - vec2(2.1, -1.4)) * 0.44 + motion * 0.018, 0.022);
          float pearl = pow(0.5 + 0.5 * sin(w.x * 0.55 - w.y * 0.37 + motion * 0.32), 8.0);
          signal = max(shellA, shellB) * 0.48 + pearl * 0.12;
          accent = min(shellA, shellB) * 0.74;
        } else if (uMotif < 2.5) {
          // Cinderfrost Works: cold conduits with rare hot pulses at intersections.
          float railX = lineAA(w.x * 0.32, 0.018);
          float railY = lineAA(w.y * 0.27, 0.018);
          float conduit = max(railX, railY);
          float thermal = pow(0.5 + 0.5 * sin((w.x + w.y) * 1.25 - motion * 2.2), 10.0);
          signal = conduit * (0.18 + thermal * 0.5);
          accent = railX * railY * (0.55 + thermal * 0.45);
        } else if (uMotif < 3.5) {
          // Aeolian Bastions: long directional ribbons reveal the storm flow.
          float wind = pow(0.5 + 0.5 * sin(
            w.x * 0.58 + w.y * 0.83 - motion * 1.25 + sin(w.y * 0.31) * 0.7
          ), 12.0);
          float vane = lineAA(w.x * 0.22 + w.y * 0.36 - motion * 0.055, 0.014);
          float gust = smoothstep(0.62, 0.98, hash21(floor(w * vec2(0.34, 0.72))));
          signal = wind * (0.22 + gust * 0.36) + vane * 0.12;
          accent = wind * vane * 0.62;
        } else {
          // Storm-Eye Basin: concentric charge bands spiral around a calm center.
          float radius = length(w);
          float angle = atan(w.y, w.x);
          float ring = lineAA(radius * 0.34 - motion * 0.07, 0.026);
          float spiral = pow(0.5 + 0.5 * sin(angle * 5.0 - radius * 1.5 - motion * 1.3), 11.0);
          float eye = 1.0 - smoothstep(0.6, 2.5, radius);
          signal = ring * (0.34 + spiral * 0.42) * (1.0 - eye * 0.72);
          accent = spiral * smoothstep(2.0, 5.5, radius) * 0.28;
        }

        float edge = 1.0 - smoothstep(0.82, 0.985, max(abs(vLocal.x), abs(vLocal.z)));
        float reducedGain = mix(1.0, 0.58, uReduced);
        float alpha = clamp(
          (signal * 0.58 + accent * 0.62) * uIntensity * (0.115 + safeBeat * 0.035),
          0.0,
          0.22
        ) * edge * reducedGain;
        vec3 color = mix(uPrimary, uSecondary, clamp(accent * 1.4, 0.0, 1.0));
        outColor = vec4(color, alpha);
      }
    `;

    Renderer.katarinaVertex = `#version 300 es
      precision highp float;
      in vec3 aIdleA;
      in vec3 aIdleB;
      in vec3 aRunA;
      in vec3 aRunB;
      in vec3 aCast;
      in vec3 aLotus;
      in vec3 aNormalIdle;
      in vec3 aNormalLotus;
      in vec2 aUv;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      uniform float uTime;
      uniform float uIdleMix;
      uniform float uRunMix;
      uniform float uMoving;
      uniform float uCast;
      uniform float uLotus;
      uniform float uVoracity;
      uniform float uDash;
      out vec2 vUv;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec3 vLocal;
      out float vSkill;

      void main() {
        vec3 idle = mix(aIdleA, aIdleB, uIdleMix);
        vec3 run = mix(aRunA, aRunB, uRunMix);
        vec3 position = mix(idle, run, smoothstep(0.0, 1.0, uMoving));
        position = mix(position, aCast, uCast);
        float upper = smoothstep(0.55, 1.75, position.y);
        position.x += sin(position.y * 3.1 + uTime * 5.0) * uCast * upper * 0.035;
        position.z += upper * (uDash * 0.11 + uCast * 0.045);
        position = mix(position, aLotus, uLotus);

        vec3 normal = normalize(mix(aNormalIdle, aNormalLotus, uLotus));
        vec4 world = uModel * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(uModel) * normal);
        vLocal = position;
        vUv = aUv;
        vSkill = max(uLotus, max(uVoracity * 0.72, max(uCast * 0.5, uDash * 0.32)));
        gl_Position = uViewProjection * world;
      }
    `;

    Renderer.vatChampionVertex = `#version 300 es
      precision highp float;
      precision highp usampler2D;
      in vec2 aUv;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      uniform usampler2D uPositionFrames;
      uniform sampler2D uNormalFrames;
      uniform vec3 uPositionMin;
      uniform vec3 uPositionRange;
      uniform int uVertexCount;
      uniform int uFrameA;
      uniform int uFrameB;
      uniform float uFrameMix;
      uniform int uPreviousFrameA;
      uniform int uPreviousFrameB;
      uniform float uPreviousFrameMix;
      uniform float uTransition;
      uniform float uSkill;
      out vec2 vUv;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec3 vLocal;
      out float vSkill;

      ivec2 frameTexel(int frame) {
        int width = textureSize(uPositionFrames, 0).x;
        int linear = frame * uVertexCount + gl_VertexID;
        return ivec2(linear % width, linear / width);
      }

      vec3 framePosition(int frame) {
        uvec3 packed = texelFetch(uPositionFrames, frameTexel(frame), 0).xyz;
        return uPositionMin + (vec3(packed) / 65535.0) * uPositionRange;
      }

      vec3 frameNormal(int frame) {
        return texelFetch(uNormalFrames, frameTexel(frame), 0).xyz * 2.0 - 1.0;
      }

      void main() {
        vec3 currentPosition = mix(
          framePosition(uFrameA),
          framePosition(uFrameB),
          uFrameMix
        );
        vec3 previousPosition = mix(
          framePosition(uPreviousFrameA),
          framePosition(uPreviousFrameB),
          uPreviousFrameMix
        );
        vec3 currentNormal = mix(
          frameNormal(uFrameA),
          frameNormal(uFrameB),
          uFrameMix
        );
        vec3 previousNormal = mix(
          frameNormal(uPreviousFrameA),
          frameNormal(uPreviousFrameB),
          uPreviousFrameMix
        );
        vec3 position = mix(previousPosition, currentPosition, uTransition);
        vec3 normal = normalize(mix(previousNormal, currentNormal, uTransition));
        vec4 world = uModel * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(uModel) * normal);
        vLocal = position;
        vUv = aUv;
        vSkill = uSkill;
        gl_Position = uViewProjection * world;
      }
    `;

    Renderer.katarinaFragment = `#version 300 es
      precision highp float;
      in vec2 vUv;
      in vec3 vWorld;
      in vec3 vNormal;
      in vec3 vLocal;
      in float vSkill;
      uniform sampler2D uChampion;
      uniform vec3 uCamera;
      uniform float uTime;
      uniform float uBeat;
      uniform float uHurt;
      uniform float uInvulnerable;
      uniform float uLotus;
      uniform float uVoracity;
      uniform float uDash;
      uniform float uShadow;
      uniform float uStyle;
      uniform float uAlpha;
      out vec4 outColor;

      vec3 tonemap(vec3 x) {
        x = max(x, vec3(0.0));
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      void main() {
        vec3 normal = normalize(vNormal);
        if (!gl_FrontFacing) normal = -normal;
        vec3 view = normalize(uCamera - vWorld);
        // Same key/fill as main arena so champions share world light
        vec3 light = normalize(vec3(-0.28, 0.92, 0.24));
        vec3 fillLight = normalize(vec3(0.62, 0.42, -0.48));
        float wrapped = smoothstep(-0.18, 0.88, dot(normal, light));
        float fill = smoothstep(-0.4, 0.75, dot(normal, fillLight));
        float hemisphere = normal.y * 0.5 + 0.5;
        float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.5);
        float specular = pow(max(dot(normal, normalize(light + view)), 0.0), 48.0);

        vec4 texel = texture(uChampion, vUv);
        if (texel.a < 0.08) discard;
        // Display-referred albedo (RGBA8 atlas) — keep hue/contrast of the bake texture
        vec3 albedo = texel.rgb;
        float luminance = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
        albedo = max(vec3(0.0), mix(vec3(luminance), albedo, 1.06));
        float chroma = max(albedo.r, max(albedo.g, albedo.b)) -
          min(albedo.r, min(albedo.g, albedo.b));
        float metal = smoothstep(0.18, 0.03, chroma) * smoothstep(0.28, 0.66, luminance);
        // Soft key wrap so dark leather/cloth still reads (GP coat was pure silhouette)
        vec3 ambient = mix(vec3(0.14, 0.13, 0.12), vec3(0.32, 0.30, 0.34), hemisphere);
        float shade = 0.34 + wrapped * 0.88 + fill * 0.38 + hemisphere * 0.1;
        vec3 color = albedo * shade * 1.18;
        color += albedo * ambient * 0.28;
        color += vec3(1.0, 0.92, 0.8) * specular * (0.06 + metal * 0.85);
        vec3 skillAccent = vec3(0.95, 0.018, 0.065);
        vec3 lowAccent = vec3(0.07, 0.16, 0.34);
        if (uStyle > 3.5) {
          skillAccent = vec3(0.95, 0.55, 0.12);
          lowAccent = vec3(0.18, 0.1, 0.04);
        } else if (uStyle > 2.5) {
          skillAccent = vec3(0.98, 0.045, 0.16);
          lowAccent = vec3(0.25, 0.008, 0.035);
        } else if (uStyle > 1.5) {
          skillAccent = vec3(0.12, 0.72, 0.6);
          lowAccent = vec3(0.42, 0.22, 0.045);
        } else if (uStyle > 0.5) {
          skillAccent = vec3(0.9, 0.012, 0.075);
          lowAccent = vec3(0.025, 0.015, 0.055);
        }
        // Skill rim only when actually casting — idle lowAccent was muddying GP brown
        color += mix(lowAccent, skillAccent, vSkill) *
          rim * (0.06 + vSkill * 0.78 + uBeat * 0.06);

        float pulse = 0.5 + 0.5 * sin(uTime * 13.0 + vLocal.y * 8.0);
        color += vec3(0.52, 0.012, 0.035) * uLotus * (0.07 + pulse * 0.1);
        color += vec3(0.72, 0.025, 0.07) * uVoracity * rim * (0.18 + pulse * 0.15);
        color += vec3(0.08, 0.17, 0.22) * uDash * rim * 0.3;
        if (uStyle > 3.5) {
          color += vec3(0.72, 0.32, 0.04) * (uLotus * 0.16 + uVoracity * rim * 0.2);
        } else if (uStyle > 2.5) {
          color += vec3(0.58, 0.008, 0.055) * (uLotus * 0.18 + uVoracity * rim * 0.22);
        } else if (uStyle > 1.5) {
          color += vec3(0.05, 0.48, 0.38) * (uLotus * 0.14 + uVoracity * rim * 0.18);
        }
        vec3 shadowInk = vec3(0.01, 0.006, 0.012) +
          vec3(0.28, 0.004, 0.01) * (rim * 0.7 + pulse * 0.04);
        color = mix(color, shadowInk, uShadow);
        color = mix(color, vec3(1.0, 0.9, 0.86), uHurt * 0.65);
        color += vec3(0.12, 0.22, 0.25) * uInvulnerable * rim * 0.3;

        // Match main fog — old path crushed champions into black-green
        float fog = smoothstep(16.0, 40.0, length(uCamera - vWorld));
        color = mix(color, vec3(0.055, 0.085, 0.10), fog * 0.22);
        color = tonemap(color);
        outColor = vec4(color, uAlpha * mix(1.0, 0.9, uShadow));
      }
    `;

    Renderer.particleVertex = `#version 300 es
      precision highp float;
      in vec3 aPosition;
      in float aSize;
      in vec4 aColor;
      uniform mat4 uViewProjection;
      uniform vec2 uResolution;
      uniform float uTime;
      out vec4 vColor;
      void main() {
        vec4 clip = uViewProjection * vec4(aPosition, 1.0);
        gl_Position = clip;
        gl_PointSize = clamp(aSize * uResolution.y / max(clip.w, 0.1), 1.0, 92.0);
        vColor = aColor;
      }
    `;

    Renderer.particleFragment = `#version 300 es
      precision highp float;
      in vec4 vColor;
      out vec4 outColor;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float core = smoothstep(1.0, 0.0, d);
        outColor = vec4(vColor.rgb * (1.25 + core * 1.8), vColor.a * core);
      }
    `;

    Renderer.postVertex = `#version 300 es
      precision highp float;
      out vec2 vUv;
      void main() {
        vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        vUv = p;
        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
      }
    `;

    Renderer.postFragment = `#version 300 es
      precision highp float;
      in vec2 vUv;
      uniform sampler2D uScene;
      uniform vec2 uResolution;
      uniform float uTime;
      uniform float uBeat;
      uniform float uEnergy;
      uniform float uHit;
      uniform float uHealth;
      uniform vec4 uShock0;
      uniform vec4 uShock1;
      uniform vec4 uShock2;
      uniform vec4 uShock3;
      uniform float uReduced;
      out vec4 outColor;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      vec2 shockWarp(vec2 uv, vec4 s, inout float ring) {
        float d = distance(uv, s.xy);
        float radius = s.z * 0.35;
        float wave = exp(-pow((d - radius) * 52.0, 2.0)) * (1.0 - smoothstep(0.0, 1.1, s.z)) * s.w;
        ring += wave;
        vec2 dir = normalize(uv - s.xy + vec2(0.0001));
        return uv - dir * wave * 0.01 * (1.0 - uReduced);
      }

      vec3 sampleScene(vec2 uv) {
        vec2 px = 1.0 / uResolution;
        // Aberration only on hit — not constant wash
        float aberr = (uHit * 1.1 + uEnergy * 0.18) * px.x * (1.0 - uReduced);
        float r = texture(uScene, uv + vec2(aberr, 0.0)).r;
        float g = texture(uScene, uv).g;
        float b = texture(uScene, uv - vec2(aberr, 0.0)).b;
        return vec3(r, g, b);
      }

      void main() {
        // Scene is already tonemapped (display-referred). Post only grades FX.
        // Never reinhard/ACES again — that was bleaching albedos and crushing grain.
        vec2 uv = vUv;
        float ring = 0.0;
        uv = shockWarp(uv, uShock0, ring);
        uv = shockWarp(uv, uShock1, ring);
        uv = shockWarp(uv, uShock2, ring);
        uv = shockWarp(uv, uShock3, ring);

        vec4 baseTex = texture(uScene, uv);
        vec3 color = sampleScene(uv);
        vec2 px = 1.0 / uResolution;
        float safeBeat = uBeat * (1.0 - uReduced);

        // Bloom only true highlights (crystals, FX) — threshold high so wood never blooms
        vec3 bloom = vec3(0.0);
        float weights = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 dir = vec2(cos(a), sin(a));
          for (int j = 1; j <= 2; j++) {
            float fj = float(j);
            vec3 s = texture(uScene, uv + dir * px * fj * (1.6 + uEnergy * 1.4)).rgb;
            float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
            bloom += s * smoothstep(0.78, 1.05, lum);
            weights += 1.0;
          }
        }
        color += bloom / max(weights, 1.0) * (0.28 + uEnergy * 0.35);
        color += vec3(1.0, 0.78, 0.35) * ring * 1.15;

        // Soft grade only — preserve midtone chroma of mapped materials
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luma), color, 1.08);
        color *= vec3(1.02, 1.0, 1.03);
        color *= 1.04;

        // CRT cockpit vignette — frames the board, kills edge wash
        float vignette = smoothstep(1.12, 0.22, length(vUv - 0.5));
        color *= 0.82 + vignette * 0.22;

        float lowHealth = 1.0 - uHealth;
        color += vec3(0.38, 0.02, 0.03) * lowHealth * lowHealth
          * (1.0 - vignette) * (0.45 + safeBeat * 0.4);
        float grain = (hash21(vUv * uResolution + fract(uTime) * 71.0) - 0.5) * 0.016;
        color += grain * (1.0 - uReduced);
        color += vec3(0.03, 0.06, 0.12) * safeBeat * 0.02;

        color = clamp(color, 0.0, 1.0);
        // Opaque composite — transparent post was the mid-grey page bleed
        outColor = vec4(color, 1.0);
      }
    `;
