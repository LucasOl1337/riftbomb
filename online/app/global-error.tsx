"use client";

import Link from "next/link";

import styles from "./not-found.module.css";

type GlobalLandingErrorProps = {
  reset: () => void;
};

export default function GlobalLandingError({ reset }: GlobalLandingErrorProps) {
  return (
    <html lang="pt-BR" className={styles.globalRoot}>
      <body className={styles.globalBody}>
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

          <section className={styles.message} aria-labelledby="global-error-title">
            <p className={styles.eyebrow}>SISTEMA FORA DE COMBATE · A ARENA SEGUE ABERTA</p>
            <div className={styles.signal} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h1 id="global-error-title">Vamos reabrir o Riftbomb.</h1>
            <p className={styles.copy}>
              A entrada inteira perdeu a conexão. Recarregue a arena agora ou
              volte ao início para abrir uma sessão nova.
            </p>
            <div className={styles.actions}>
              <button className={styles.cta} type="button" onClick={reset}>
                Recarregar arena
                <span aria-hidden="true">↻</span>
              </button>
              <Link className={styles.secondaryCta} href="/">
                Voltar ao início
              </Link>
            </div>
            <p className={styles.hint}>Nenhum download necessário</p>
          </section>

          <p className={styles.coordinate} aria-hidden="true">
            SISTEMA // RECUPERANDO
          </p>
        </main>
      </body>
    </html>
  );
}
