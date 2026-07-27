export default function Home() {
  return (
    <main className="game-shell">
      <iframe
        className="game-frame"
        src="/riftbomb.html"
        title="Riftbomb Online"
        allow="autoplay; fullscreen; gamepad"
      />
    </main>
  );
}
