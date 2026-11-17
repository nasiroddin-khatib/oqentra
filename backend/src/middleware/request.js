const { randomUUID, createHash } = require('node:crypto');
const logger = require('../utils/logger');

function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info({ requestId: req.requestId, method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Math.round(durationMs * 100) / 100 }, 'http_request');
  });
  next();
}

function hashIp(ip) {
  if (!ip) return null;
  // Hashing avoids storing raw visitor IP addresses in the lead database.
  return createHash('sha256').update(`${process.env.IP_HASH_SALT || 'oqentra-ip-salt-change-me'}:${ip}`).digest('hex');
}
module.exports = { requestContext, hashIp };
