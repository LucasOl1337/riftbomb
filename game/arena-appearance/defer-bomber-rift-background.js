(() => {
  const template = document.getElementById("riftbomb-background");
  if (!(template instanceof HTMLTemplateElement)) return;

  const mountBackground = () => {
    if (!template.isConnected || document.documentElement.classList.contains("is-match-active")) {
      template.remove();
      return;
    }
    template.replaceWith(template.content.cloneNode(true));
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(mountBackground, { timeout: 1000 });
  } else {
    setTimeout(mountBackground, 0);
  }
})();
