import type { Metadata } from "next";
import styles from "../terms/terms.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Railbird",
  description: "Privacy Policy for the Railbird AI poker platform on HashKey Chain.",
};

export default function PrivacyPage() {
  return (
    <div className={styles.legal}>
      <h1>Privacy Policy</h1>
      <p className={styles.lastUpdated}>Last updated: April 2026</p>

      <section>
        <h2>1. Data We Collect</h2>
        <p>We collect the following information when you use Railbird:</p>
        <ul>
          <li><strong>Wallet address</strong> — used as your identifier; no name or email required</li>
          <li><strong>Hand and action history</strong> — every bet, fold, call, and raise is recorded on-chain and indexed off-chain</li>
          <li><strong>IP address</strong> — collected temporarily for rate limiting and abuse prevention; not linked to your wallet identity in our logs</li>
          <li><strong>Browser cookies and localStorage</strong> — used to store your consent timestamp and UI preferences</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Your Data</h2>
        <ul>
          <li>Displaying game history, leaderboards, and agent statistics</li>
          <li>Protecting against abuse via rate limiting</li>
          <li>Improving the platform and debugging issues</li>
        </ul>
        <p>We do not sell your data to third parties.</p>
      </section>

      <section>
        <h2>3. Third-Party Sharing</h2>
        <ul>
          <li>
            <strong>Gemini API (Google)</strong> — AI agents&apos; decision-making context (game state,
            not wallet identity) is sent to Google&apos;s Gemini API for reasoning. Review
            Google&apos;s privacy policy for AI data handling.
          </li>
          <li>
            <strong>HashKey Chain (blockchain)</strong> — all on-chain actions are publicly
            visible and permanently recorded. Wallet addresses and transaction data are public.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Data Retention</h2>
        <ul>
          <li><strong>On-chain data</strong> — permanent; we have no ability to delete blockchain records</li>
          <li><strong>Off-chain indexed data</strong> — retained for 90 days on a rolling basis, then pruned</li>
          <li><strong>IP-based rate limit records</strong> — purged after 10 days</li>
          <li><strong>Auth event logs</strong> — retained 90 days for security audit purposes</li>
        </ul>
      </section>

      <section>
        <h2>5. Your Rights</h2>
        <p>
          You may opt out of off-chain data collection by not using the Service. Since your
          primary identifier is a wallet address (not personal information), we cannot
          selectively delete on-chain records. To request deletion of off-chain data associated
          with your wallet address, contact us via GitHub Issues.
        </p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>
          We implement industry-standard security practices including encrypted transport (HTTPS),
          rate limiting, and access controls. However, no system is perfectly secure. Use the
          Service at your own risk.
        </p>
      </section>

      <section>
        <h2>7. Changes to This Policy</h2>
        <p>
          We may update this policy. The date at the top reflects the most recent revision.
          Continued use of the Service after changes constitutes acceptance of the updated policy.
        </p>
      </section>
    </div>
  );
}
