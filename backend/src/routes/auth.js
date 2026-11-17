const express = require('express');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createToken, requireRole } = require('../middleware/auth');
const { requiredText, email, phone, password, text } = require('../utils/validation');
const { audit } = require('../services/audit');

function authRoutes({ pool, config, loginLimiter, signupLimiter }) {
  const router = express.Router();
  const requireCustomer = requireRole(config, 'customer');

  router.post('/signup', signupLimiter, async (req, res, next) => {
    try {
      const name = requiredText(req.body.name, 'Name', 100);
      const contactEmail = email(req.body.email, true);
      const contactPhone = req.body.phone ? phone(req.body.phone) : null;
      const rawPassword = password(req.body.password);
      const passwordHash = await bcrypt.hash(rawPassword, 12);
      const id = randomUUID();
      const inserted = await pool.query(
        `INSERT INTO customers(id,name,email,phone,password_hash) VALUES($1,$2,$3,$4,$5)
         RETURNING id,name,email,phone,created_at`,
        [id, name, contactEmail, contactPhone, passwordHash]
      );
      const customer = inserted.rows[0];
      const token = createToken(config, { ...customer, role: 'customer' });
      await audit(pool, 'customer', id, 'customer.registered', 'customer', id, {});
      return res.status(201).json({ message: 'Your OQENTRA account has been created.', token, customer });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
      return next(error);
    }
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const contactEmail = email(req.body.email, true);
      const rawPassword = typeof req.body.password === 'string' ? req.body.password : '';
      const found = await pool.query(
        'SELECT id,name,email,phone,password_hash,is_active FROM customers WHERE email=$1', [contactEmail]
      );
      const customer = found.rows[0];
      const valid = customer && customer.is_active && await bcrypt.compare(rawPassword, customer.password_hash);
      if (!valid) return res.status(401).json({ error: 'Incorrect email or password.' });
      const token = createToken(config, { ...customer, role: 'customer' });
      return res.json({ message: 'Signed in successfully.', token, customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } });
    } catch (error) { return next(error); }
  });

  router.get('/me', requireCustomer, async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id,name,email,phone,created_at FROM customers WHERE id=$1 AND is_active=TRUE', [req.auth.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Customer account not found.' });
      return res.json({ customer: result.rows[0] });
    } catch (error) { return next(error); }
  });

  router.patch('/me', requireCustomer, async (req, res, next) => {
    try {
      const name = requiredText(req.body.name, 'Name', 100);
      const contactPhone = req.body.phone ? phone(req.body.phone) : null;
      const result = await pool.query(
        'UPDATE customers SET name=$1, phone=$2, updated_at=NOW() WHERE id=$3 AND is_active=TRUE RETURNING id,name,email,phone',
        [name, contactPhone, req.auth.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Customer account not found.' });
      await audit(pool, 'customer', req.auth.id, 'customer.profile_updated', 'customer', req.auth.id, {});
      return res.json({ customer: result.rows[0] });
    } catch (error) { return next(error); }
  });

  return router;
}

function adminAuthRoutes({ pool, config, loginLimiter }) {
  const router = express.Router();
  const requireAdmin = requireRole(config, 'admin');
  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const contactEmail = email(req.body.email, true);
      const rawPassword = typeof req.body.password === 'string' ? req.body.password : '';
      const found = await pool.query('SELECT id,name,email,password_hash,is_active FROM admins WHERE email=$1', [contactEmail]);
      const admin = found.rows[0];
      const valid = admin && admin.is_active && await bcrypt.compare(rawPassword, admin.password_hash);
      if (!valid) return res.status(401).json({ error: 'Incorrect email or password.' });
      const token = createToken(config, { ...admin, role: 'admin' });
      await audit(pool, 'admin', admin.id, 'admin.login', 'admin', admin.id, {});
      return res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email }, expiresIn: config.jwtExpiresIn });
    } catch (error) { return next(error); }
  });
  router.get('/me', requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id,name,email FROM admins WHERE id=$1 AND is_active=TRUE', [req.auth.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Administrator account not found.' });
      return res.json({ admin: result.rows[0] });
    } catch (error) { return next(error); }
  });
  return router;
}

async function ensureInitialAdmin(pool, config, logger) {
  if (!config.adminEmail || !config.adminPassword) {
    logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD is not configured; no initial admin will be created.');
    return;
  }
  if (config.adminPassword.length < 16) throw new Error('ADMIN_PASSWORD must be at least 16 characters.');
  const existing = await pool.query('SELECT id FROM admins WHERE email=$1', [config.adminEmail]);
  if (existing.rowCount) return;
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  await pool.query('INSERT INTO admins(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [randomUUID(), text(config.adminName, 100), config.adminEmail, passwordHash]);
  logger.info({ email: config.adminEmail }, 'initial_admin_created');
}

module.exports = { authRoutes, adminAuthRoutes, ensureInitialAdmin };
