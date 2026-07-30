"use client";

import Link from "next/link";

import styles from "./not-found.module.css";

type LandingErrorProps = {
  reset: () => void;
};

export default function LandingError({ reset }: LandingErrorProps) {
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

      <section className={styles.message} aria-labelledby="error-title">
        <p className={styles.eyebrow}>CONEXÃO INTERROMPIDA · A ARENA SEGUE ABERTA</p>
        <div className={styles.signal} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1 id="error-title">A partida não carregou desta vez.</h1>
        <p className={styles.copy}>
          Tente reconectar agora. Se o Rift continuar instável, volte à entrada
          e inicie uma nova disputa.
        </p>
        <div className={styles.actions}>
          <button className={styles.cta} type="button" onClick={reset}>
            Tentar novamente
            <span aria-hidden="true">↻</span>
          </button>
          <Link className={styles.secondaryCta} href="/">
            Voltar à entrada
          </Link>
        </div>
        <p className={styles.hint}>Seu navegador permanece nesta sessão</p>
      </section>

      <p className={styles.coordinate} aria-hidden="true">
        SINAL // RECONECTANDO
      </p>
    </main>
  );
}
