import styles from "./loading.module.css";

export default function Loading() {
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

      <section
        className={styles.status}
        role="status"
        aria-live="polite"
        aria-labelledby="loading-title"
      >
        <p className={styles.eyebrow}>ENTRADA LIBERADA · PREPARANDO O DUELO</p>
        <h1 id="loading-title">Montando sua arena.</h1>
        <p className={styles.copy}>
          Carregando champions, cenário e conexão para você começar sem
          instalar nada.
        </p>

        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext="Carregando arena"
        >
          <span aria-hidden="true" />
        </div>

        <p className={styles.proof}>PvP em tempo real · sem download</p>
      </section>

      <p className={styles.coordinate} aria-hidden="true">
        NÓ // SÃO PAULO
      </p>
    </main>
  );
}
