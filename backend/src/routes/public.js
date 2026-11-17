const express = require('express');
const { randomUUID, randomBytes } = require('node:crypto');
const { text, email, phone, requiredText } = require('../utils/validation');
const { hashIp } = require('../middleware/request');
const { audit } = require('../services/audit');

const REWARD_RULES = Object.freeze({
  basic_application: 50000,
  advanced_application: 100000,
  plan_1_month: 20000,
  plan_3_months: 80000,
  plan_6_months: 180000,
  plan_12_months: 400000
});

function publicRoutes({ pool, enquiryLimiter, referralLimiter }) {
  const router = express.Router();

  // Health is intentionally separate from detailed database health diagnostics.
  router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'oqentra-api' }));

  router.post('/enquiries', enquiryLimiter, async (req, res, next) => {
    try {
      // Honeypot is silently accepted but never stored, reducing bot feedback.
      if (text(req.body.website, 300)) return res.status(201).json({ message: 'Enquiry received.' });
      const name = requiredText(req.body.name, 'Name', 100);
      const contactPhone = phone(req.body.phone);
      const contactEmail = email(req.body.email);
      const businessName = text(req.body.business_name, 120);
      const service = requiredText(req.body.service, 'Service', 120);
      const message = requiredText(req.body.message, 'Project details', 5000);
      const consent = req.body.consent === true || req.body.consent === 'yes';
      // Existing frontend versions do not send consent in JSON. The form's
      // required checkbox is client-side; this API still stores an explicit
      // timestamp only when the caller sends consent=true/yes. See README.
      if (!consent) return res.status(400).json({ error: 'Consent is required to submit this enquiry.' });

      const referralCode = text(req.body.referral_code, 32).toUpperCase();
      let referralId = null;
      if (referralCode) {
        const referral = await pool.query(
          `SELECT id FROM referrals WHERE referral_code=$1 AND status='active' AND expires_at > NOW()`,
          [referralCode]
        );
        referralId = referral.rows[0]?.id || null;
      }
      const id = randomUUID();
      const reference = `OQ-${randomBytes(4).toString('hex').toUpperCase()}`;
      const result = await pool.query(
        `INSERT INTO enquiries
          (id, reference_code, referral_id, name, phone, email, business_name, service, message, consent_at, source_ip_hash, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, reference_code, created_at`,
        [id, reference, referralId, name, contactPhone, contactEmail || null, businessName || null, service, message,
          consent ? new Date() : null, hashIp(req.ip), text(req.get('user-agent'), 500) || null]
      );
      await audit(pool, 'public', null, 'enquiry.created', 'enquiry', id, { service, referralAttributed: Boolean(referralId) });
      return res.status(201).json({ message: 'Your enquiry has been received.', id: result.rows[0].id, reference: result.rows[0].reference_code });
    } catch (error) { return next(error); }
  });

  // A visitor registers once to receive a permanent, shareable referral link.
  router.post('/referrals/link', referralLimiter, async (req, res, next) => {
    try {
      if (text(req.body.website, 300)) return res.status(201).json({ message: 'Referral registration received.' });
      const name = requiredText(req.body.referrer_name, 'Your name', 100);
      const contactPhone = phone(req.body.referrer_phone);
      const contactEmail = email(req.body.referrer_email);
      const normalizedPhone = contactPhone.replace(/\D/g, '');
      const id = randomUUID();
      const code = `OQ${randomBytes(6).toString('hex').toUpperCase()}`;
      const result = await pool.query(
        `INSERT INTO referrals(id, referral_code, referrer_name, referrer_phone, referrer_phone_normalized, referrer_email, expires_at)
         VALUES($1,$2,$3,$4,$5,$6,NOW() + INTERVAL '12 months')
         RETURNING id, referral_code, registered_at, expires_at`,
        [id, code, name, contactPhone, normalizedPhone, contactEmail || null]
      );
      await audit(pool, 'public', null, 'referral.registered', 'referral', id, {});
      const referralUrl = `${process.env.PUBLIC_SITE_URL || ''}/?ref=${encodeURIComponent(code)}#contact`;
      return res.status(201).json({
        message: 'Your referral link is ready.',
        referral_code: result.rows[0].referral_code,
        referral_url: referralUrl,
        expires_at: result.rows[0].expires_at
      });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A referral account already exists for these details. Please contact OQENTRA for help.' });
      return next(error);
    }
  });

  // Record a link visit for basic programme analytics; never creates a reward.
  router.post('/referrals/track', referralLimiter, async (req, res, next) => {
    try {
      const code = requiredText(req.body.referral_code, 'Referral code', 32).toUpperCase();
      const landingPath = text(req.body.landing_path, 500);
      const found = await pool.query(`SELECT id FROM referrals WHERE referral_code=$1 AND status='active' AND expires_at > NOW()`, [code]);
      if (found.rowCount) {
        await pool.query('INSERT INTO referral_clicks(referral_id, landing_path) VALUES($1,$2)', [found.rows[0].id, landingPath || null]);
      }
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  // Public catalogue is static in the frontend for now; endpoint provides a
  // simple API health/config check without exposing customer or admin data.
  router.get('/public-info', (_req, res) => res.json({ brand: 'OQENTRA', referralRewardWindowMonths: 12 }));

  return router;
}

module.exports = { publicRoutes, REWARD_RULES };
