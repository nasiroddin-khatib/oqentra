const fs = require('node:fs');
const path = require('node:path');

/** Load and validate environment settings once at process startup. */
function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters. Generate one with: openssl rand -base64 48');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

  const frontendOrigins = (process.env.FRONTEND_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (nodeEnv === 'production' && (!frontendOrigins.length || frontendOrigins.includes('*'))) {
    throw new Error('Production FRONTEND_ORIGINS must contain explicit website origins; wildcard is not allowed.');
  }

  const dbSsl = String(process.env.DB_SSL || 'false').toLowerCase() === 'true';
  let ssl = false;
  if (dbSsl) {
    const caPath = process.env.DB_SSL_CA_PATH;
    ssl = caPath
      ? { rejectUnauthorized: true, ca: fs.readFileSync(path.resolve(caPath), 'utf8') }
      : { rejectUnauthorized: true };
  }

  return Object.freeze({
    nodeEnv,
    port: Number(process.env.PORT || 4000),
    host: process.env.HOST || '127.0.0.1',
    trustProxy: process.env.TRUST_PROXY === undefined ? 1 : process.env.TRUST_PROXY,
    frontendOrigins,
    publicSiteUrl: (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, ''),
    databaseUrl: process.env.DATABASE_URL,
    dbSsl,
    ssl,
    dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
    dbIdleTimeoutMs: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    dbConnectionTimeoutMs: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    adminName: process.env.ADMIN_NAME || 'OQENTRA Administrator',
    adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: process.env.ADMIN_PASSWORD || '',
    awsRegion: process.env.AWS_REGION || 'ap-south-1',
    awsSecretId: process.env.AWS_SECRET_ID || '',
    logLevel: process.env.LOG_LEVEL || 'info',
    metricsEnabled: String(process.env.METRICS_ENABLED || 'true').toLowerCase() === 'true',
    metricsPath: process.env.METRICS_PATH || '/metrics'
  });
}

module.exports = { loadConfig };
