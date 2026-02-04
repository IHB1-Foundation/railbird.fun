// Database migration script

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool, closePool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  console.log("Running database migrations...");

  const schemaPath = path.join(__dirname, "schema.sql");

  // In development, read from src; in production, schema.sql should be copied to dist
  let sql: string;
  if (fs.existsSync(schemaPath)) {
    sql = fs.readFileSync(schemaPath, "utf-8");
  } else {
    // Try src directory (for development)
    const srcSchemaPath = path.join(__dirname, "..", "..", "src", "db", "schema.sql");
    if (fs.existsSync(srcSchemaPath)) {
      sql = fs.readFileSync(srcSchemaPath, "utf-8");
    } else {
      throw new Error(`Schema file not found at ${schemaPath} or ${srcSchemaPath}`);
    }
  }

  const pool = getPool();

  try {
    await pool.query(sql);
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if executed directly
migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
