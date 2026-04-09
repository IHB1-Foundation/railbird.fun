// Database migration runner — applies sequential numbered migrations
// Migrations live in services/indexer/migrations/NNN_description.sql
// Already-applied migrations are tracked in the schema_versions table.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool, closePool } from "./pool.js";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Locate the migrations directory.
// In dev (tsc watch / ts-node): __dirname = src/db → go up two levels
// In production (compiled): __dirname = dist/db → go up two levels
function findMigrationsDir(): string {
  const candidates = [
    path.join(__dirname, "..", "..", "migrations"),          // dist/db → ../../migrations
    path.join(__dirname, "..", "..", "..", "migrations"),    // src/db → ../../../migrations
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(`Migrations directory not found. Searched: ${candidates.join(", ")}`);
}

async function ensureSchemaVersionsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version     INTEGER PRIMARY KEY,
      applied_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(): Promise<Set<number>> {
  const pool = getPool();
  const result = await pool.query<{ version: number }>(
    "SELECT version FROM schema_versions ORDER BY version"
  );
  return new Set(result.rows.map((r) => r.version));
}

function parseMigrationVersion(filename: string): number | null {
  const match = filename.match(/^(\d+)_/);
  return match ? parseInt(match[1], 10) : null;
}

/** Advisory lock key — arbitrary but stable integer to identify the migration lock. */
const MIGRATION_LOCK_KEY = 8_675_309;

async function migrate(): Promise<void> {
  logger.info("Running database migrations...");

  const migrationsDir = findMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Validate file-system consistency: no duplicate version numbers
  const seenVersions = new Set<number>();
  for (const file of files) {
    const version = parseMigrationVersion(file);
    if (version === null) continue;
    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version ${version} detected (file: ${file})`);
    }
    seenVersions.add(version);
  }

  const pool = getPool();

  await ensureSchemaVersionsTable();

  // Acquire a PostgreSQL advisory lock to prevent concurrent migration runs
  // (e.g. two pods starting simultaneously in a rolling deploy).
  const lockClient = await pool.connect();
  try {
    const lockResult = await lockClient.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1)",
      [MIGRATION_LOCK_KEY]
    );
    if (!lockResult.rows[0].pg_try_advisory_lock) {
      logger.info("Another process is already running migrations — skipping");
      return;
    }

    const applied = await getAppliedVersions();

    let ran = 0;
    let skipped = 0;

    for (const file of files) {
      const version = parseMigrationVersion(file);
      if (version === null) {
        logger.warn({ file }, "Skipping non-versioned migration file");
        continue;
      }

      if (applied.has(version)) {
        skipped++;
        continue;
      }

      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, "utf-8");

      logger.info({ version, file }, "Applying migration");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_versions (version) VALUES ($1)",
          [version]
        );
        await client.query("COMMIT");
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        client.release();
      }
    }

    logger.info({ ran, skipped }, "Migrations complete");
  } finally {
    // Release advisory lock when done (connection close also releases it)
    await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    lockClient.release();
  }
}

// Run if executed directly
migrate()
  .catch((err) => {
    logger.error({ err }, "Migration failed");
    process.exit(1);
  })
  .finally(() => {
    closePool().catch(() => undefined);
  });
