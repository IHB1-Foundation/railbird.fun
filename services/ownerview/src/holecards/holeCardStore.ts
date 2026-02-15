import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { HoleCardRecord, Card } from "./types.js";

const MAX_SEATS = 4;

/**
 * Error thrown when hole card operations fail
 */
export class HoleCardError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_FOUND"
      | "ALREADY_EXISTS"
      | "INVALID_CARDS"
  ) {
    super(message);
    this.name = "HoleCardError";
  }
}

/**
 * Persistent file-backed store for hole cards.
 *
 * Each hand is stored as a JSON file: `{dataDir}/{tableId}_{handId}.json`
 * containing an array of HoleCardRecord objects (one per seat).
 *
 * Falls back to in-memory when no dataDir is provided (for tests).
 */
export class HoleCardStore {
  private memStore: Map<string, HoleCardRecord> = new Map();
  private dataDir: string | null;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? null;
    if (this.dataDir) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private makeKey(tableId: string, handId: string, seatIndex: number): string {
    return `${tableId}:${handId}:${seatIndex}`;
  }

  private handFilePath(tableId: string, handId: string): string {
    return join(this.dataDir!, `${tableId}_${handId}.json`);
  }

  private readHandFile(tableId: string, handId: string): HoleCardRecord[] {
    if (!this.dataDir) return [];
    const filePath = this.handFilePath(tableId, handId);
    if (!existsSync(filePath)) return [];
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data) as HoleCardRecord[];
  }

  private writeHandFile(tableId: string, handId: string, records: HoleCardRecord[]): void {
    if (!this.dataDir) return;
    const filePath = this.handFilePath(tableId, handId);
    if (records.length === 0) {
      if (existsSync(filePath)) unlinkSync(filePath);
      return;
    }
    writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
  }

  set(record: HoleCardRecord): void {
    for (const card of record.cards) {
      if (card < 0 || card > 51) {
        throw new HoleCardError(`Invalid card value: ${card}`, "INVALID_CARDS");
      }
    }

    const key = this.makeKey(record.tableId, record.handId, record.seatIndex);

    if (this.dataDir) {
      const records = this.readHandFile(record.tableId, record.handId);
      if (records.some((r) => r.seatIndex === record.seatIndex)) {
        throw new HoleCardError(
          `Hole cards already exist for table=${record.tableId}, hand=${record.handId}, seat=${record.seatIndex}`,
          "ALREADY_EXISTS"
        );
      }
      records.push(record);
      this.writeHandFile(record.tableId, record.handId, records);
    } else {
      if (this.memStore.has(key)) {
        throw new HoleCardError(
          `Hole cards already exist for table=${record.tableId}, hand=${record.handId}, seat=${record.seatIndex}`,
          "ALREADY_EXISTS"
        );
      }
      this.memStore.set(key, record);
    }
  }

  get(tableId: string, handId: string, seatIndex: number): HoleCardRecord | null {
    if (this.dataDir) {
      const records = this.readHandFile(tableId, handId);
      return records.find((r) => r.seatIndex === seatIndex) ?? null;
    }
    const key = this.makeKey(tableId, handId, seatIndex);
    return this.memStore.get(key) ?? null;
  }

  has(tableId: string, handId: string, seatIndex: number): boolean {
    return this.get(tableId, handId, seatIndex) !== null;
  }

  delete(tableId: string, handId: string, seatIndex: number): boolean {
    if (this.dataDir) {
      const records = this.readHandFile(tableId, handId);
      const filtered = records.filter((r) => r.seatIndex !== seatIndex);
      if (filtered.length === records.length) return false;
      this.writeHandFile(tableId, handId, filtered);
      return true;
    }
    const key = this.makeKey(tableId, handId, seatIndex);
    return this.memStore.delete(key);
  }

  deleteHand(tableId: string, handId: string): number {
    let deleted = 0;
    for (let seatIndex = 0; seatIndex < MAX_SEATS; seatIndex++) {
      if (this.delete(tableId, handId, seatIndex)) {
        deleted++;
      }
    }
    return deleted;
  }

  getHand(tableId: string, handId: string): HoleCardRecord[] {
    if (this.dataDir) {
      return this.readHandFile(tableId, handId);
    }
    const records: HoleCardRecord[] = [];
    for (let seatIndex = 0; seatIndex < MAX_SEATS; seatIndex++) {
      const record = this.get(tableId, handId, seatIndex);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  /**
   * Delete records older than maxAgeMs. Returns count of deleted records.
   */
  deleteOlderThan(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let deleted = 0;

    if (this.dataDir) {
      const files = existsSync(this.dataDir) ? readdirSync(this.dataDir) : [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(this.dataDir, file);
        try {
          const records = JSON.parse(readFileSync(filePath, "utf-8")) as HoleCardRecord[];
          if (records.length > 0 && records[0].createdAt < cutoff) {
            unlinkSync(filePath);
            deleted += records.length;
          }
        } catch {
          // Corrupt file, remove it
          unlinkSync(filePath);
        }
      }
    } else {
      for (const [key, record] of this.memStore.entries()) {
        if (record.createdAt < cutoff) {
          this.memStore.delete(key);
          deleted++;
        }
      }
    }
    return deleted;
  }

  clear(): void {
    if (this.dataDir) {
      const files = existsSync(this.dataDir) ? readdirSync(this.dataDir) : [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          unlinkSync(join(this.dataDir, file));
        }
      }
    } else {
      this.memStore.clear();
    }
  }

  size(): number {
    if (this.dataDir) {
      let count = 0;
      const files = existsSync(this.dataDir) ? readdirSync(this.dataDir) : [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const records = JSON.parse(readFileSync(join(this.dataDir, file), "utf-8")) as HoleCardRecord[];
          count += records.length;
        } catch {
          // skip
        }
      }
      return count;
    }
    return this.memStore.size;
  }
}
