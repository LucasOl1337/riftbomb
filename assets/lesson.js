for (const quiz of document.querySelectorAll("[data-quiz]")) {
  const correct = quiz.getAttribute("data-correct");
  const feedback = quiz.querySelector("[data-feedback]");
  const buttons = [...quiz.querySelectorAll("button[data-answer]")];

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const answer = button.getAttribute("data-answer");
      const isCorrect = answer === correct;

      for (const candidate of buttons) {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      }

      feedback.dataset.state = isCorrect ? "correct" : "incorrect";
      feedback.textContent = isCorrect
        ? quiz.getAttribute("data-success")
        : quiz.getAttribute("data-retry");
    });
  }
}
