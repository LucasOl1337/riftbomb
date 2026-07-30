/** Product-facing identity and measured record for the trained V1 bot. */
export const V1_RENEKTON_PROFILE = Object.freeze({
  id: "v1-renekton",
  name: "V1 Renekton",
  callsign: "Dominus-01",
  champion: "renekton",
  version: "1.0",
  intelligence: Object.freeze({ level: 4, maximum: 5, label: "Tático adaptativo" }),
  description: "Um duelista treinado para abrir a arena, sobreviver ao próprio cerco e converter vantagem em combos de Renekton.",
  specialties: Object.freeze([
    "Fuga temporal de explosões",
    "Abertura de rotas com bombas",
    "Leitura dos hábitos do rival",
    "Combo E → R → W → Q → Dice"
  ]),
  stats: Object.freeze([
    Object.freeze({ value: "100–0", label: "certificação vs baseline", detail: "100 partidas · seed 42" }),
    Object.freeze({ value: "100%", label: "sobrevivência à 1ª bomba", detail: "certificação oficial" }),
    Object.freeze({ value: "60%", label: "vitórias no espelho V1", detail: "100 partidas de self-play" })
  ]),
  weakness: "Especialista em Renekton; ainda não pilota kits de outros campeões."
});
