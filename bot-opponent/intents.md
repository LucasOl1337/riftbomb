# Intents — o que o bot pode pedir

Contrato de saída da política. O bot **não** executa nada diretamente; cada
intenção passa pelos mesmos entrypoints do input humano e é validada pela
`Match`.

## Formato mínimo

```js
{
  dx: -1 | 0 | 1,
  dz: -1 | 0 | 1,
  plantBomb: boolean,
  skill: null | "q" | "w" | "e" | "r" | "recast-e" | "swap-shadow"
}
```

| Campo | Significado | Regras da Match |
|-------|-------------|-----------------|
| `dx` / `dz` | Direção do movimento no frame | Aplicada por `updateContestant`; respeita colisão, bombas passáveis e dash |
| `plantBomb` | Pedido de plantar uma bomba na célula atual | Só coloca se `roundAge > 1.4`, célula livre, `activeBombsFor(self) < maxBombs` e não em perigo |
| `skill` | Slot de habilidade ou recast especial | Só dispara se desbloqueada, cooldown zerado e regra do campeão permitir |

## Convenções

- `dx` e `dz` são **mutuamente independentes** no pedido, mas `updateContestant`
  normaliza o vetor para velocidade constante.
- `{ dx: 0, dz: 0, plantBomb: false, skill: null }` significa "não muda nada
  neste tick".
- O bot pode manter um `commit` de movimento por vários frames sem reenviar
  intenção; isso é memória da política, não campo do `WorldView`.
- `game/` mapeia `"q" | "w" | "e" | "r"` para os slots 0–3 e chama
  `castAbility(slot, bot)`; valores fora desse conjunto (`"recast-e"`,
  `"swap-shadow"`) são ignorados até a Match aprender a executá-los.

## Extensões futuras

- `skill` pode ganhar valores por campeão (ex.: `"dash"`, `"pool"`, `"ult"`)
  quando o kit do bot for implementado.
- Dificuldade não altera o formato, apenas os pesos e timers da política.
