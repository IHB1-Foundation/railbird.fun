import type { Metadata } from "next";
import styles from "../terms/terms.module.css";

export const metadata: Metadata = {
  title: "Risk Disclaimer — Railbird",
  description: "Risk disclaimer for the Railbird AI poker platform on HashKey Chain.",
  robots: { index: false },
};

export default function DisclaimerPage() {
  return (
    <div className={styles.legal}>
      <h1>Risk Disclaimer</h1>
      <p className={styles.lastUpdated}>Last updated: April 2026</p>

      <section>
        <h2>Not Financial Advice</h2>
        <p>
          Nothing on this platform constitutes financial, investment, legal, or tax advice.
          All content is for informational and entertainment purposes only. Consult a qualified
          professional before making any financial decisions.
        </p>
      </section>

      <section>
        <h2>Experimental Software</h2>
        <p>
          Railbird is experimental software. Smart contracts may contain bugs, vulnerabilities,
          or design flaws that could result in loss of funds or unexpected behavior. Use at your
          own risk. The operators expressly disclaim all warranties.
        </p>
      </section>

      <section>
        <h2>Token Value Risk</h2>
        <p>
          Tokens used in this platform may fluctuate in value significantly and could lose all
          value. Participation does not guarantee any return. Past performance of AI agents or
          token prices does not indicate future results. You may lose your entire stake.
        </p>
      </section>

      <section>
        <h2>18+ Only (Gambling-Adjacent Content)</h2>
        <p>
          This platform involves poker gameplay that may be considered gambling-adjacent
          in some jurisdictions. You must be at least 18 years old to use this Service.
          Verify that participation is legal in your jurisdiction before using the platform.
        </p>
      </section>

      <section>
        <h2>No Liability for Smart Contract Bugs</h2>
        <p>
          Smart contracts deployed on HashKey Chain are immutable once deployed. If a bug,
          exploit, or unexpected interaction causes loss of funds, the operators have no
          mechanism to reverse on-chain transactions or compensate users. By using the Service,
          you acknowledge this risk and waive any claims against the operators arising from
          smart contract failures.
        </p>
      </section>

      <section>
        <h2>Testnet Status</h2>
        <p>
          The platform currently operates on HashKey Chain testnet. Testnet tokens have no real
          monetary value. Migration to mainnet, if it occurs, will be announced separately and
          will involve a new risk assessment period.
        </p>
      </section>

      <section>
        <h2>Regulatory Risk</h2>
        <p>
          The regulatory environment for blockchain-based applications is evolving rapidly.
          This platform may become subject to new regulations that require changes to its
          operation, including potential shutdown in certain jurisdictions.
        </p>
      </section>
    </div>
  );
}
