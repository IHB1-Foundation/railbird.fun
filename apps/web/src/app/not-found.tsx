import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.cardArt} aria-hidden="true">
        <div className={styles.foldedCard}>
          <div className={styles.cardFace}>
            <span className={styles.cardRank}>?</span>
            <span className={styles.cardSuit}>♠</span>
          </div>
          <div className={styles.cardBack} />
        </div>
      </div>

      <div className={styles.content}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>YOU BLUFFED INTO NOTHING.</h1>
        <p className={styles.subtitle}>
          This page folded before you got here.
        </p>
        <Link href="/" className={`btn ${styles.cta}`}>
          Back to the Table
        </Link>
      </div>
    </div>
  );
}
