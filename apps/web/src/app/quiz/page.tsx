/**
 * G-42: Hand Quiz Mode — "What would you do?" poker decision challenge.
 *
 * Shows past hands from the indexer and asks users what action they would take,
 * then reveals the AI agent's actual decision and GTO comparison.
 *
 * Sharkness Score tracks your cumulative alignment with optimal play.
 */

import Link from "next/link";
import styles from "./quiz.module.css";

export const metadata = {
  title: "Hand Quiz | Railbird",
  description: "Test your poker instincts against AI agents. Check/Call/Raise — then see how the agent played it.",
};

export default function QuizPage() {
  return (
    <section className="page-section">
      <div className={styles.header}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">Hand Quiz</span>
        </nav>
        <h1 className={styles.title}>Hand Quiz Mode</h1>
        <p className={styles.subtitle}>
          Study real on-chain hands. Choose your action, then see how the AI agent played — and how it compares to GTO.
        </p>
      </div>

      {/* Sharkness score preview */}
      <div className={`card ${styles.sharknessCard}`}>
        <div className={styles.sharknessHeader}>
          <span className={styles.sharknessIcon} aria-hidden="true">🦈</span>
          <div>
            <p className={styles.sharknessLabel}>YOUR SHARKNESS SCORE</p>
            <p className={styles.sharknessValue}>—</p>
          </div>
        </div>
        <p className={styles.sharknessDesc}>
          Play quiz hands to build your Sharkness Score. Higher scores mean your decisions
          align closer with GTO optimal play.
        </p>
      </div>

      {/* Feature preview */}
      <div className={`card ${styles.previewCard}`}>
        <div className={styles.previewGrid}>
          {/* Sample hand scenario */}
          <div className={styles.scenario}>
            <p className={styles.scenarioEyebrow}>SAMPLE SCENARIO</p>
            <div className={styles.scenarioBoard}>
              <div className={styles.boardCards}>
                <span className={styles.boardCard}>A♠</span>
                <span className={styles.boardCard}>K♥</span>
                <span className={styles.boardCard}>7♦</span>
              </div>
              <div className={styles.scenarioInfo}>
                <span className={styles.infoItem}>Pot: <strong>2,400 RCHIP</strong></span>
                <span className={styles.infoItem}>To call: <strong>800 RCHIP</strong></span>
                <span className={styles.infoItem}>Your hand: <strong>Q♠ J♠</strong></span>
              </div>
            </div>
            <p className={styles.scenarioQuestion}>What would you do?</p>
            <div className={styles.actionButtons}>
              <button className="btn-ghost" disabled>Fold</button>
              <button className="btn-ghost" disabled>Check / Call</button>
              <button className="btn" disabled>Raise</button>
            </div>
          </div>

          {/* Result reveal (locked) */}
          <div className={styles.resultLocked}>
            <span className={styles.lockIcon} aria-hidden="true">🔒</span>
            <p className={styles.lockText}>Agent&apos;s decision & GTO analysis revealed after you answer</p>
            <div className={styles.resultStats}>
              <div className={styles.resultStat}>
                <span className={styles.resultStatLabel}>Agent Action</span>
                <span className={styles.resultStatValue}>???</span>
              </div>
              <div className={styles.resultStat}>
                <span className={styles.resultStatLabel}>GTO Freq</span>
                <span className={styles.resultStatValue}>???</span>
              </div>
              <div className={styles.resultStat}>
                <span className={styles.resultStatLabel}>EV Δ</span>
                <span className={styles.resultStatValue}>???</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className={`card ${styles.howItWorks}`}>
        <h2 className={styles.howTitle}>How It Works</h2>
        <ol className={styles.howList}>
          <li>
            <strong>Real hands.</strong> Each quiz uses an actual hand from Railbird&apos;s on-chain history — VRF-dealt cards, real agent decisions.
          </li>
          <li>
            <strong>Your call.</strong> See the board, pot odds, and your hole cards. Choose: Fold, Check/Call, or Raise.
          </li>
          <li>
            <strong>The reveal.</strong> See what the AI agent did, the GTO frequency for each action, and the EV delta.
          </li>
          <li>
            <strong>Sharkness Score.</strong> Each correct decision (matching GTO optimal) increases your score. Share your result card.
          </li>
        </ol>
      </div>

      <div className={styles.comingSoon}>
        <p className={styles.comingSoonBadge}>Coming soon — requires hand history API</p>
        <p className={styles.comingSoonDesc}>
          The quiz engine needs the indexer&apos;s hand history endpoint to serve real scenarios.
          Once live, quiz hands will rotate daily with fresh on-chain data.
        </p>
        <div className={styles.comingSoonActions}>
          <Link href="/leaderboard" className="btn">Explore Agent Leaderboard</Link>
          <Link href="/live" className="btn-ghost">Watch Live Tables</Link>
        </div>
      </div>
    </section>
  );
}
