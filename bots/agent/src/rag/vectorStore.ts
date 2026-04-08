// In-memory vector store with disk persistence
// Stores up to MAX_CAPACITY hand vectors and supports cosine similarity search.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createLogger } from "@playerco/shared";
import { cosineSimilarity } from "./embedder.js";
import type { HandVector, HandVectorSerialized } from "./types.js";

const logger = createLogger({ service: "agent-bot:rag" });

const MAX_CAPACITY = 500;
const PERSIST_PATH_DEFAULT = "./data/rag/vectors.json";

export class VectorStore {
  private vectors: HandVector[] = [];
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? PERSIST_PATH_DEFAULT;
  }

  /** Load vectors from disk (call once on startup). Graceful — errors just start fresh. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.persistPath, "utf-8");
      const serialized = JSON.parse(raw) as HandVectorSerialized[];
      this.vectors = serialized.map(deserialize);
      logger.info({ count: this.vectors.length, path: this.persistPath }, "VectorStore loaded from disk");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "VectorStore load failed — starting empty");
      }
    }
  }

  /** Add a vector; evict oldest if over capacity. */
  add(vector: HandVector): void {
    // Deduplicate by handId
    const existing = this.vectors.findIndex((v) => v.handId === vector.handId);
    if (existing !== -1) {
      this.vectors[existing] = vector;
      return;
    }
    this.vectors.push(vector);
    if (this.vectors.length > MAX_CAPACITY) {
      // FIFO eviction
      this.vectors.shift();
    }
  }

  /** Return top-K most similar vectors to the query embedding. */
  search(query: number[], topK: number): HandVector[] {
    if (this.vectors.length === 0) return [];

    const scored = this.vectors.map((v) => ({
      vector: v,
      score: cosineSimilarity(query, v.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.vector);
  }

  /** Persist current state to disk (fire-and-forget friendly). */
  async persist(): Promise<void> {
    try {
      const serialized: HandVectorSerialized[] = this.vectors.map(serialize);
      const dir = dirname(this.persistPath);
      await mkdir(dir, { recursive: true });
      await writeFile(this.persistPath, JSON.stringify(serialized, null, 2), "utf-8");
      logger.debug({ count: serialized.length, path: this.persistPath }, "VectorStore persisted");
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "VectorStore persist failed");
    }
  }

  get size(): number {
    return this.vectors.length;
  }

  getLastUpdated(): Date | null {
    if (this.vectors.length === 0) return null;
    return new Date();
  }
}

function serialize(v: HandVector): HandVectorSerialized {
  return {
    handId: v.handId,
    summary: { ...v.summary, pnl: v.summary.pnl.toString() },
    embedding: v.embedding,
  };
}

function deserialize(s: HandVectorSerialized): HandVector {
  return {
    handId: s.handId,
    summary: { ...s.summary, pnl: BigInt(s.summary.pnl) },
    embedding: s.embedding,
  };
}
