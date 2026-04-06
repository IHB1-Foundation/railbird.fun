// @playerco/shared - Transaction nonce manager
// Serializes transaction submissions to prevent nonce conflicts when
// concurrent writes happen within a single process (e.g., overlapping
// bot tick intervals or parallel action submissions).

export interface NonceManagerOptions {
  /** Called to fetch the current pending nonce from the chain. */
  getNonceFromChain: () => Promise<number>;
}

/**
 * NonceManager serializes transaction submissions for a single account.
 *
 * Usage:
 *   const mgr = new NonceManager({ getNonceFromChain: () => client.getTransactionCount(addr) });
 *   const hash = await mgr.withNonce(nonce => walletClient.writeContract({ ..., nonce }));
 *
 * On error, the cached nonce is reset so the next call re-fetches from chain.
 */
export class NonceManager {
  private nonce: number | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private opts: NonceManagerOptions) {}

  /**
   * Execute `fn` with the next nonce, serialized relative to all other
   * withNonce calls. If `fn` throws, the nonce cache is cleared so the
   * next call re-fetches from chain.
   */
  async withNonce<T>(fn: (nonce: number) => Promise<T>): Promise<T> {
    // Chain onto the existing queue so submissions are serialized
    const result = this.queue.then(async () => {
      if (this.nonce === null) {
        this.nonce = await this.opts.getNonceFromChain();
      }
      const nonce = this.nonce!;
      this.nonce! += 1;
      try {
        return await fn(nonce);
      } catch (err) {
        // Resync on any error — the tx may have been dropped or replaced
        this.nonce = null;
        throw err;
      }
    });

    // Update queue pointer; ignore rejection so next call still runs
    this.queue = result.catch(() => undefined);
    return result as Promise<T>;
  }

  /**
   * Manually reset the cached nonce (e.g., after a known chain reorganization).
   */
  reset(): void {
    this.nonce = null;
  }
}
