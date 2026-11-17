const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie',
      'password', 'password_hash', 'token', 'jwt',
      '*.password', '*.password_hash', '*.token', '*.jwt',
      'DATABASE_URL', 'databaseUrl'
    ],
    censor: '[REDACTED]'
  },
  base: { service: 'oqentra-api' },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
