import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Address } from "@playerco/shared";

interface EncryptionKeyRecord {
  pubKey: `0x${string}`;
  updatedAt: number;
}

type EncryptionKeyStoreData = Record<string, EncryptionKeyRecord>;

export class EncryptionKeyStore {
  private readonly persistPath: string | null;
  private readonly memStore = new Map<string, EncryptionKeyRecord>();

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? null;
  }

  async init(): Promise<void> {
    if (!this.persistPath) {
      return;
    }
    await mkdir(dirname(this.persistPath), { recursive: true });
  }

  async set(address: Address, pubKey: `0x${string}`): Promise<void> {
    const normalizedAddress = this.normalizeAddress(address);
    const record: EncryptionKeyRecord = {
      pubKey,
      updatedAt: Date.now(),
    };

    if (!this.persistPath) {
      this.memStore.set(normalizedAddress, record);
      return;
    }

    const data = await this.readData();
    data[normalizedAddress] = record;
    await this.writeData(data);
  }

  async get(address: Address): Promise<`0x${string}` | null> {
    const normalizedAddress = this.normalizeAddress(address);

    if (!this.persistPath) {
      return this.memStore.get(normalizedAddress)?.pubKey ?? null;
    }

    const data = await this.readData();
    return data[normalizedAddress]?.pubKey ?? null;
  }

  private normalizeAddress(address: Address): string {
    return address.toLowerCase();
  }

  private async readData(): Promise<EncryptionKeyStoreData> {
    if (!this.persistPath) {
      return {};
    }

    try {
      const raw = await readFile(this.persistPath, "utf-8");
      return JSON.parse(raw) as EncryptionKeyStoreData;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        return {};
      }
      throw error;
    }
  }

  private async writeData(data: EncryptionKeyStoreData): Promise<void> {
    if (!this.persistPath) {
      return;
    }
    await writeFile(this.persistPath, JSON.stringify(data, null, 2), "utf-8");
  }
}
