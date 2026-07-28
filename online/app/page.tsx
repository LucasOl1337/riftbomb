"use client";

export default function Home() {
  async function enterMobileGame() {
    const root = document.documentElement;
    try {
      if (!document.fullscreenElement) await root.requestFullscreen?.();
    } catch {}
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (value: "landscape") => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {}
  }

  return (
    <main className="game-shell">
      <iframe
        className="game-frame"
        src="/riftbomb.html"
        title="Riftbomb Online"
        allow="autoplay; fullscreen; gamepad; screen-wake-lock"
      />
      <button className="mobile-launch" type="button" onClick={enterMobileGame}>
        <strong>JOGAR EM TELA CHEIA</strong>
        <span>Toque para virar o celular na horizontal</span>
      </button>
    </main>
  );
}
