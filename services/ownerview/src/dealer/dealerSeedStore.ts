import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Stores dealer seeds separately from hole card records.
 *
 * Security rationale: vrfRandomness is stored in HoleCardRecord (alongside
 * encrypted cards). The dealerSeed + vrfRandomness together can reconstruct
 * all hole cards via verifiableShuffle(). By storing them in separate
 * directories, a single breach of one location is not sufficient to expose
 * hole cards before showdown.
 *
 * File layout: `{dataDir}/{tableId}_{handId}.seed`
 */
export class DealerSeedStore {
  private memStore: Map<string, string> = new Map(); // key → dealerSeed
  private dataDir: string | null;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? null;
    if (this.dataDir) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private makeKey(tableId: string, handId: string): string {
    return `${tableId}:${handId}`;
  }

  private seedFilePath(tableId: string, handId: string): string {
    return join(this.dataDir!, `${tableId}_${handId}.seed`);
  }

  set(tableId: string, handId: string, dealerSeed: string): void {
    if (this.dataDir) {
      writeFileSync(this.seedFilePath(tableId, handId), dealerSeed, "utf-8");
    } else {
      this.memStore.set(this.makeKey(tableId, handId), dealerSeed);
    }
  }

  get(tableId: string, handId: string): string | null {
    if (this.dataDir) {
      const filePath = this.seedFilePath(tableId, handId);
      if (!existsSync(filePath)) return null;
      return readFileSync(filePath, "utf-8").trim();
    }
    return this.memStore.get(this.makeKey(tableId, handId)) ?? null;
  }

  has(tableId: string, handId: string): boolean {
    return this.get(tableId, handId) !== null;
  }

  delete(tableId: string, handId: string): boolean {
    if (this.dataDir) {
      const filePath = this.seedFilePath(tableId, handId);
      if (!existsSync(filePath)) return false;
      unlinkSync(filePath);
      return true;
    }
    return this.memStore.delete(this.makeKey(tableId, handId));
  }

  clear(): void {
    if (this.dataDir) {
      if (existsSync(this.dataDir)) {
        for (const file of readdirSync(this.dataDir)) {
          if (file.endsWith(".seed")) {
            unlinkSync(join(this.dataDir, file));
          }
        }
      }
    } else {
      this.memStore.clear();
    }
  }
}
