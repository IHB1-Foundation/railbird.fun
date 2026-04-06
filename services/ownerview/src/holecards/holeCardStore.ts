import { mkdir, readFile, writeFile, unlink, readdir, access } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { HoleCardRecord } from "./types.js";

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
 *
 * Records store only ECIES-encrypted cards — no plaintext.
 */
export class HoleCardStore {
  private memStore: Map<string, HoleCardRecord> = new Map();
  private dataDir: string | null;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? null;
  }

  async init(): Promise<void> {
    if (this.dataDir) {
      await mkdir(this.dataDir, { recursive: true });
    }
  }

  private makeKey(tableId: string, handId: string, seatIndex: number): string {
    return `${tableId}:${handId}:${seatIndex}`;
  }

  private handFilePath(tableId: string, handId: string): string {
    // Reject inputs containing path separators or traversal sequences
    if (!tableId || !handId || /[/\\.]/.test(tableId) || /[/\\.]/.test(handId)) {
      throw new Error(`Invalid tableId or handId: path traversal not allowed`);
    }
    const resolved = resolve(this.dataDir!, `${tableId}_${handId}.json`);
    // Ensure the resolved path stays within dataDir
    const dataDirResolved = resolve(this.dataDir!) + sep;
    if (!resolved.startsWith(dataDirResolved)) {
      throw new Error(`Path traversal detected for tableId=${tableId} handId=${handId}`);
    }
    return resolved;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async readHandFile(tableId: string, handId: string): Promise<HoleCardRecord[]> {
    if (!this.dataDir) return [];
    const filePath = this.handFilePath(tableId, handId);
    if (!(await this.fileExists(filePath))) return [];
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data) as HoleCardRecord[];
  }

  private async writeHandFile(tableId: string, handId: string, records: HoleCardRecord[]): Promise<void> {
    if (!this.dataDir) return;
    const filePath = this.handFilePath(tableId, handId);
    if (records.length === 0) {
      if (await this.fileExists(filePath)) await unlink(filePath);
      return;
    }
    await writeFile(filePath, JSON.stringify(records, null, 2), "utf-8");
  }

  async set(record: HoleCardRecord): Promise<void> {
    // Validate required encrypted payload fields
    if (!record.encryptedCards ||
        !record.encryptedCards.ephemeralPubKey ||
        !record.encryptedCards.iv ||
        !record.encryptedCards.ciphertext ||
        !record.encryptedCards.mac) {
      throw new HoleCardError("Invalid encrypted payload: missing fields", "INVALID_CARDS");
    }

    const key = this.makeKey(record.tableId, record.handId, record.seatIndex);

    if (this.dataDir) {
      const records = await this.readHandFile(record.tableId, record.handId);
      if (records.some((r) => r.seatIndex === record.seatIndex)) {
        throw new HoleCardError(
          `Hole cards already exist for table=${record.tableId}, hand=${record.handId}, seat=${record.seatIndex}`,
          "ALREADY_EXISTS"
        );
      }
      records.push(record);
      await this.writeHandFile(record.tableId, record.handId, records);
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

  async get(tableId: string, handId: string, seatIndex: number): Promise<HoleCardRecord | null> {
    if (this.dataDir) {
      const records = await this.readHandFile(tableId, handId);
      return records.find((r) => r.seatIndex === seatIndex) ?? null;
    }
    const key = this.makeKey(tableId, handId, seatIndex);
    return this.memStore.get(key) ?? null;
  }

  async has(tableId: string, handId: string, seatIndex: number): Promise<boolean> {
    return (await this.get(tableId, handId, seatIndex)) !== null;
  }

  async delete(tableId: string, handId: string, seatIndex: number): Promise<boolean> {
    if (this.dataDir) {
      const records = await this.readHandFile(tableId, handId);
      const filtered = records.filter((r) => r.seatIndex !== seatIndex);
      if (filtered.length === records.length) return false;
      await this.writeHandFile(tableId, handId, filtered);
      return true;
    }
    const key = this.makeKey(tableId, handId, seatIndex);
    return this.memStore.delete(key);
  }

  async deleteHand(tableId: string, handId: string): Promise<number> {
    if (this.dataDir) {
      const records = await this.readHandFile(tableId, handId);
      await this.writeHandFile(tableId, handId, []);
      return records.length;
    }

    const prefix = `${tableId}:${handId}:`;
    let deleted = 0;
    for (const key of this.memStore.keys()) {
      if (key.startsWith(prefix)) {
        this.memStore.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async getHand(tableId: string, handId: string): Promise<HoleCardRecord[]> {
    if (this.dataDir) {
      return this.readHandFile(tableId, handId);
    }
    const prefix = `${tableId}:${handId}:`;
    const records: HoleCardRecord[] = [];
    for (const [key, record] of this.memStore.entries()) {
      if (key.startsWith(prefix)) {
        records.push(record);
      }
    }
    records.sort((a, b) => a.seatIndex - b.seatIndex);
    return records;
  }

  /**
   * Delete records older than maxAgeMs. Returns count of deleted records.
   */
  async deleteOlderThan(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let deleted = 0;

    if (this.dataDir) {
      let files: string[] = [];
      try {
        files = await readdir(this.dataDir);
      } catch {
        return 0;
      }
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(this.dataDir, file);
        try {
          const data = await readFile(filePath, "utf-8");
          const records = JSON.parse(data) as HoleCardRecord[];
          if (records.length > 0 && records[0].createdAt < cutoff) {
            await unlink(filePath);
            deleted += records.length;
          }
        } catch {
          // Corrupt file, remove it
          await unlink(filePath).catch(() => undefined);
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

  async clear(): Promise<void> {
    if (this.dataDir) {
      let files: string[] = [];
      try {
        files = await readdir(this.dataDir);
      } catch {
        return;
      }
      await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map((f) => unlink(join(this.dataDir!, f)))
      );
    } else {
      this.memStore.clear();
    }
  }

  async size(): Promise<number> {
    if (this.dataDir) {
      let count = 0;
      let files: string[] = [];
      try {
        files = await readdir(this.dataDir);
      } catch {
        return 0;
      }
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await readFile(join(this.dataDir, file), "utf-8");
          const records = JSON.parse(data) as HoleCardRecord[];
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
