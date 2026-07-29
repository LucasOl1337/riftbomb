(async () => {
  const progress = document.getElementById("progress");
  const status = document.getElementById("status");
  const bootStartedAt = performance.now();
  const benchmarkRun = new URLSearchParams(location.search).get("perf-run");
  const embeddedManifest = document.currentScript?.dataset.riftbombManifest;

  try {
    let manifest;
    if (embeddedManifest) {
      manifest = JSON.parse(embeddedManifest);
    } else {
      const manifestResponse = await fetch("/riftbomb-parts/manifest.json", {
        cache: "no-store",
      });
      if (!manifestResponse.ok) throw new Error("Manifesto da arena indisponível");
      manifest = await manifestResponse.json();
    }
    if (
      manifest.version !== 2
      || !Number.isSafeInteger(manifest.partCount)
      || manifest.partCount < 1
      || manifest.partCount > 999
      || !Number.isSafeInteger(manifest.byteLength)
      || manifest.byteLength < 1
      || !/^[a-f0-9]{64}$/.test(manifest.sha256)
      || manifest.partsPath !== `/riftbomb-parts/${manifest.sha256}`
    ) {
      throw new Error("Manifesto da arena inválido");
    }

    progress.max = manifest.partCount;
    let completedParts = 0;
    const pieces = await Promise.all(
      Array.from({ length: manifest.partCount }, async (_, index) => {
        const name = String(index).padStart(2, "0");
        const query = benchmarkRun
          ? `?${new URLSearchParams({ "perf-run": benchmarkRun })}`
          : "";
        const response = await fetch(`${manifest.partsPath}/part-${name}${query}`);
        if (!response.ok) throw new Error(`Parte ${name} indisponível`);

        const piece = new Uint8Array(await response.arrayBuffer());
        completedParts += 1;
        progress.value = completedParts;
        status.textContent = `Carregando a arena… ${completedParts}/${manifest.partCount}`;
        return piece;
      }),
    );

    const fetchedAt = performance.now();
    const receivedBytes = pieces.reduce((total, piece) => total + piece.byteLength, 0);
    if (receivedBytes !== manifest.byteLength) {
      throw new Error(`Arena incompleta: ${receivedBytes}/${manifest.byteLength} bytes`);
    }

    const joined = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const piece of pieces) {
      joined.set(piece, offset);
      offset += piece.byteLength;
    }

    if (globalThis.crypto?.subtle) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
      const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (sha256 !== manifest.sha256) throw new Error("Arena corrompida");
    }

    const game = new TextDecoder()
      .decode(joined)
      .replace(
        "</head>",
        '<link rel="stylesheet" href="/online-duel.css"></head>',
      )
      .replace(
        "</body>",
        [
          '<script src="/authoritative-audio.js"></script>',
          '<script src="/online-duel.js"></script>',
          "<script>",
          `document.documentElement.dataset.riftbombFetchMs = "${(fetchedAt - bootStartedAt).toFixed(1)}";`,
          `document.documentElement.dataset.riftbombReadyMs = (performance.now() - ${bootStartedAt}).toFixed(1);`,
          "</script>",
          "</body>",
        ].join(""),
      );

    document.open();
    document.write(game);
    document.close();
  } catch (error) {
    status.textContent = "Não foi possível carregar o jogo. Atualize a página.";
    console.error(error);
  }
})();
