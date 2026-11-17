require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const logger = require('./utils/logger');
const { loadAwsSecretsIfConfigured } = require('./config/secrets');
const { loadConfig } = require('./config/env');
const { createPool } = require('./db/pool');
const { requestContext } = require('./middleware/request');
const { authRoutes, adminAuthRoutes, ensureInitialAdmin } = require('./routes/auth');
const { publicRoutes } = require('./routes/public');
const { adminRoutes } = require('./routes/admin');

async function start() {
  await loadAwsSecretsIfConfigured();
  const config = loadConfig();
  const pool = createPool(config);
  await pool.query('SELECT 1');

  // Refuse to start before the schema exists; this avoids silently accepting
  // requests against a database that has not been migrated.
  const migrationCheck = await pool.query("SELECT to_regclass('public.enquiries') AS enquiries_table");
  if (!migrationCheck.rows[0].enquiries_table) throw new Error('Database schema is missing. Run npm run db:migrate first.');
  await ensureInitialAdmin(pool, config, logger);

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy !== 'false') app.set('trust proxy', config.trustProxy === 'true' ? 1 : config.trustProxy);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false
  }));
  app.use(cors({
    origin(origin, callback) {
      // No Origin is normal for server-to-server/health checks. Browser origins
      // must match the explicit allow-list configured by the site owner.
      if (!origin || config.frontendOrigins.includes(origin)) return callback(null, true);
      return callback(Object.assign(new Error('Origin not allowed by CORS.'), { status: 403 }));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600
  }));
  app.use(express.json({ limit: '20kb', strict: true }));
  app.use(requestContext);

  const registry = new client.Registry();
  registry.setDefaultLabels({ service: 'oqentra-api', environment: config.nodeEnv });
  client.collectDefaultMetrics({ register: registry, prefix: 'oqentra_' });
  const requestCounter = new client.Counter({
    name: 'oqentra_http_requests_total', help: 'Total HTTP requests handled by OQENTRA API',
    labelNames: ['method', 'route', 'status_code'], registers: [registry]
  });
  const requestDuration = new client.Histogram({
    name: 'oqentra_http_request_duration_seconds', help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [registry]
  });
  app.use((req, res, next) => {
    const end = requestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      requestCounter.inc(labels);
      end(labels);
    });
    next();
  });

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please try again later.' } });
  const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many account creation attempts. Please try again later.' } });
  const enquiryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many enquiries from this connection. Please try again later.' } });
  const referralLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many referral requests. Please try again later.' } });

  app.get('/api/ready', async (_req, res) => {
    try { await pool.query('SELECT 1'); return res.json({ status: 'ready', database: 'connected' }); }
    catch { return res.status(503).json({ status: 'not_ready', database: 'unavailable' }); }
  });
  app.use('/api', publicRoutes({ pool, enquiryLimiter, referralLimiter }));
  app.use('/api/auth', authRoutes({ pool, config, loginLimiter, signupLimiter }));
  app.use('/api/admin/auth', adminAuthRoutes({ pool, config, loginLimiter }));
  app.use('/api/admin', adminRoutes({ pool, config }));

  if (config.metricsEnabled) {
    app.get(config.metricsPath, async (_req, res, next) => {
      try {
        res.set('Content-Type', registry.contentType);
        return res.end(await registry.metrics());
      } catch (error) { return next(error); }
    });
  }

  app.use((req, res) => res.status(404).json({ error: 'API route not found.', requestId: req.requestId }));
  app.use((error, req, res, _next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    logger.error({ err: error, requestId: req.requestId, status }, 'request_failed');
    const message = status === 500 ? 'An unexpected server error occurred. Please try again later.' : error.message;
    return res.status(status).json({ error: message, requestId: req.requestId });
  });

  const server = app.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port, environment: config.nodeEnv }, 'oqentra_api_started');
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown_started');
    const forceTimer = setTimeout(() => process.exit(1), 10000);
    forceTimer.unref();
    server.close(async (error) => {
      try { await pool.end(); } catch (poolError) { logger.error({ err: poolError }, 'postgres_pool_close_failed'); }
      if (error) logger.error({ err: error }, 'http_server_close_failed');
      clearTimeout(forceTimer);
      logger.info('shutdown_complete');
      process.exit(error ? 1 : 0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.fatal({ err: error }, 'oqentra_api_startup_failed');
  process.exit(1);
});
