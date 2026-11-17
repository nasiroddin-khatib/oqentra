require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { loadAwsSecretsIfConfigured } = require('../config/secrets');
const { loadConfig } = require('../config/env');
const { createPool } = require('./pool');
const logger = require('../utils/logger');

async function migrate() {
  await loadAwsSecretsIfConfigured();
  const config = loadConfig();
  const pool = createPool(config);
  const directory = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    for (const file of files) {
      const already = await pool.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
      if (already.rowCount) continue;
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
        await client.query('COMMIT');
        logger.info({ migration: file }, 'database_migration_applied');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
    logger.info('database_migrations_complete');
  } finally { await pool.end(); }
}

migrate().catch((error) => { logger.fatal({ err: error }, 'database_migration_failed'); process.exit(1); });
