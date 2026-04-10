import { Breadcrumb } from "@/components/Breadcrumb";
import { ACHIEVEMENTS } from "@/lib/achievements";
import styles from "./compendium.module.css";

export const metadata = {
  title: "Compendium — Railbird",
  description: "All achievements and titles in the Railbird arena.",
};

const TIER_COLORS: Record<string, string> = {
  platinum: "var(--neon-cyan)",
  gold: "var(--neon-gold)",
  silver: "#c0c0c0",
  bronze: "#cd7f32",
};

const TIER_ORDER = ["platinum", "gold", "silver", "bronze"];

export default function CompendiumPage() {
  const byTier = TIER_ORDER.map((tier) => ({
    tier,
    items: ACHIEVEMENTS.filter((a) => a.tier === tier),
  })).filter((g) => g.items.length > 0);

  const total = ACHIEVEMENTS.length;

  return (
    <section className="page-section">
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Compendium" }]} />

      <div className={styles.header}>
        <h1 className={styles.title}>COMPENDIUM</h1>
        <p className={styles.subtitle}>
          {total} achievements across all tiers — unlock them by playing in the arena.
        </p>
      </div>

      {byTier.map(({ tier, items }) => (
        <div key={tier} className={styles.tierGroup}>
          <h2 className={styles.tierTitle} style={{ color: TIER_COLORS[tier] }}>
            {tier.toUpperCase()}
          </h2>
          <div className={styles.grid}>
            {items.map((achievement) => (
              <div key={achievement.id} className={`card ${styles.achievementCard}`}>
                <div className={styles.achievementIcon} aria-hidden="true">
                  {achievement.icon}
                </div>
                <div className={styles.achievementInfo}>
                  <p
                    className={styles.achievementTitle}
                    style={{ color: TIER_COLORS[achievement.tier] }}
                  >
                    {achievement.title}
                  </p>
                  <p className={styles.achievementDesc}>{achievement.description}</p>
                  <p className={styles.achievementFlavor}>&ldquo;{achievement.flavor}&rdquo;</p>
                </div>
                <div className={styles.achievementMeta}>
                  <span className={styles.categoryBadge}>{achievement.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
