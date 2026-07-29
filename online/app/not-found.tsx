import Link from "next/link";

import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.arena} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.brand} aria-label="Riftbomb">
        <span className={styles.brandMark} aria-hidden="true">
          <b>R</b>
        </span>
        <span>
          <strong>RIFTBOMB</strong>
          <small>BOMBER RIFT</small>
        </span>
      </header>

      <section className={styles.message} aria-labelledby="not-found-title">
        <p className={styles.eyebrow}>ERRO 404 · ROTA FORA DA ARENA</p>
        <div className={styles.code} aria-hidden="true">
          <span>4</span>
          <span className={styles.bomb}>0</span>
          <span>4</span>
        </div>
        <h1 id="not-found-title">Esta passagem não leva a uma partida.</h1>
        <p className={styles.copy}>
          Volte à entrada, escolha seu campeão e encontre um rival no Rift.
        </p>
        <Link className={styles.cta} href="/">
          Entrar na arena
          <span aria-hidden="true">→</span>
        </Link>
        <p className={styles.hint}>Partidas rápidas · sem download</p>
      </section>

      <p className={styles.coordinate} aria-hidden="true">
        SETOR // DESCONHECIDO
      </p>
    </main>
  );
}
