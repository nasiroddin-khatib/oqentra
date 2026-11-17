const { Pool } = require('pg');

/** Shared PostgreSQL connection pool. Queries always use parameterized SQL. */
function createPool(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.ssl,
    max: config.dbPoolMax,
    idleTimeoutMillis: config.dbIdleTimeoutMs,
    connectionTimeoutMillis: config.dbConnectionTimeoutMs,
    application_name: 'oqentra-api'
  });
  pool.on('error', (error) => {
    // An idle client error is logged; node-postgres will discard that client.
    require('../utils/logger').error({ err: error }, 'postgres_idle_client_error');
  });
  return pool;
}

module.exports = { createPool };
