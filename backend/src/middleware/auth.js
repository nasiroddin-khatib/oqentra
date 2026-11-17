const jwt = require('jsonwebtoken');

function createToken(config, user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    issuer: 'oqentra-api',
    audience: `oqentra-${user.role}`
  });
}

function requireRole(config, role) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Authentication is required.' });
    try {
      const decoded = jwt.verify(token, config.jwtSecret, { issuer: 'oqentra-api', audience: `oqentra-${role}` });
      if (decoded.role !== role || !decoded.sub) return res.status(403).json({ error: 'You do not have permission to access this resource.' });
      req.auth = { id: decoded.sub, role: decoded.role, email: decoded.email };
      return next();
    } catch {
      return res.status(401).json({ error: 'Your session is invalid or has expired. Please sign in again.' });
    }
  };
}

module.exports = { createToken, requireRole };
