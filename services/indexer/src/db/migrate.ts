// Database migration runner — applies sequential numbered migrations
// Migrations live in services/indexer/migrations/NNN_description.sql
// Already-applied migrations are tracked in the schema_versions table.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool, closePool } from "./pool.js";

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

async function migrate(): Promise<void> {
  console.log("Running database migrations...");

  const migrationsDir = findMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pool = getPool();

  await ensureSchemaVersionsTable();
  const applied = await getAppliedVersions();

  let ran = 0;
  let skipped = 0;

  for (const file of files) {
    const version = parseMigrationVersion(file);
    if (version === null) {
      console.warn(`Skipping non-versioned file: ${file}`);
      continue;
    }

    if (applied.has(version)) {
      skipped++;
      continue;
    }

    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, "utf-8");

    console.log(`  Applying migration ${version}: ${file}`);
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

  console.log(`Migrations complete: ${ran} applied, ${skipped} already up-to-date.`);
}

// Run if executed directly
migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => {
    closePool().catch(() => undefined);
  });
