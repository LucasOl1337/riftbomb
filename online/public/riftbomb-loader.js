(async () => {
  const progress = document.getElementById("progress");
  const status = document.getElementById("status");
  const pieces = [];

  try {
    for (let index = 0; index < 10; index += 1) {
      const name = String(index).padStart(2, "0");
      const response = await fetch(`/riftbomb-parts/part-${name}`);
      if (!response.ok) throw new Error(`Parte ${name} indisponível`);

      pieces.push(await response.text());
      progress.value = index + 1;
      status.textContent = `Carregando a arena… ${index + 1}/10`;
    }

    const game = pieces
      .join("")
      .replace(
        "</head>",
        '<link rel="stylesheet" href="/online-duel.css"></head>',
      )
      .replace(
        "</body>",
        '<script src="/online-duel.js"></script></body>',
      );

    document.open();
    document.write(game);
    document.close();
  } catch (error) {
    status.textContent = "Não foi possível carregar o jogo. Atualize a página.";
    console.error(error);
  }
})();
