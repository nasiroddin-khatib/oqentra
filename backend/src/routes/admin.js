const express = require('express');
const { randomUUID } = require('node:crypto');
const { requireRole } = require('../middleware/auth');
const { pagination, text, requiredText } = require('../utils/validation');
const { audit } = require('../services/audit');
const { REWARD_RULES } = require('./public');

function adminRoutes({ pool, config }) {
  const router = express.Router();
  const requireAdmin = requireRole(config, 'admin');
  router.use(requireAdmin);

  router.get('/dashboard', async (_req, res, next) => {
    try {
      const [enquiries, customers, referrals, pendingRewards] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS count FROM enquiries WHERE status='new'"),
        pool.query('SELECT COUNT(*)::int AS count FROM customers WHERE is_active=TRUE'),
        pool.query("SELECT COUNT(*)::int AS count FROM referrals WHERE status='active' AND expires_at>NOW()"),
        pool.query("SELECT COALESCE(SUM(reward_amount_paise),0)::bigint AS amount_paise, COUNT(*)::int AS count FROM referral_rewards WHERE status IN ('pending','approved')")
      ]);
      return res.json({
        newEnquiries: enquiries.rows[0].count,
        activeCustomers: customers.rows[0].count,
        activeReferrals: referrals.rows[0].count,
        pendingRewards: { count: pendingRewards.rows[0].count, amountRupees: Number(pendingRewards.rows[0].amount_paise) / 100 }
      });
    } catch (error) { return next(error); }
  });

  router.get('/enquiries', async (req, res, next) => {
    try {
      const { limit, offset } = pagination(req.query);
      const status = text(req.query.status, 20);
      const result = await pool.query(
        `SELECT e.id,e.reference_code,e.name,e.phone,e.email,e.business_name,e.service,e.message,e.status,e.created_at,
                r.referral_code
         FROM enquiries e LEFT JOIN referrals r ON r.id=e.referral_id
         WHERE ($1='' OR e.status=$1) ORDER BY e.created_at DESC LIMIT $2 OFFSET $3`, [status, limit, offset]
      );
      return res.json({ items: result.rows, limit, offset });
    } catch (error) { return next(error); }
  });

  router.patch('/enquiries/:id/status', async (req, res, next) => {
    try {
      const allowed = ['new','contacted','qualified','quoted','converted','closed','spam'];
      const status = requiredText(req.body.status, 'Status', 20);
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid enquiry status.' });
      const result = await pool.query('UPDATE enquiries SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id,status', [status, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Enquiry not found.' });
      await audit(pool, 'admin', req.auth.id, 'enquiry.status_updated', 'enquiry', req.params.id, { status });
      return res.json({ enquiry: result.rows[0] });
    } catch (error) { return next(error); }
  });

  router.get('/referrals', async (req, res, next) => {
    try {
      const { limit, offset } = pagination(req.query);
      const result = await pool.query(
        `SELECT r.id,r.referral_code,r.referrer_name,r.referrer_phone,r.referrer_email,r.status,r.registered_at,r.expires_at,
          (SELECT COUNT(*)::int FROM referral_clicks c WHERE c.referral_id=r.id) AS clicks,
          (SELECT COUNT(*)::int FROM enquiries e WHERE e.referral_id=r.id) AS enquiries,
          (SELECT COALESCE(SUM(rr.reward_amount_paise),0)::bigint FROM referral_rewards rr WHERE rr.referral_id=r.id AND rr.status <> 'cancelled') AS reward_paise
         FROM referrals r ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
      );
      return res.json({ items: result.rows.map((r) => ({ ...r, reward_rupees: Number(r.reward_paise) / 100 })), limit, offset });
    } catch (error) { return next(error); }
  });

  router.patch('/referrals/:id/status', async (req, res, next) => {
    try {
      const status = requiredText(req.body.status, 'Status', 20);
      if (!['active','paused','blocked'].includes(status)) return res.status(400).json({ error: 'Invalid referral status.' });
      const result = await pool.query('UPDATE referrals SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id,status', [status, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Referral not found.' });
      await audit(pool, 'admin', req.auth.id, 'referral.status_updated', 'referral', req.params.id, { status });
      return res.json({ referral: result.rows[0] });
    } catch (error) { return next(error); }
  });

  router.get('/customers', async (req, res, next) => {
    try {
      const { limit, offset } = pagination(req.query);
      const result = await pool.query('SELECT id,name,email,phone,is_active,created_at FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
      return res.json({ items: result.rows, limit, offset });
    } catch (error) { return next(error); }
  });

  router.get('/rewards', async (req, res, next) => {
    try {
      const { limit, offset } = pagination(req.query);
      const result = await pool.query(
        `SELECT rr.id,rr.reward_type,rr.reward_amount_paise,rr.status,rr.created_at,rr.paid_at,rr.payout_reference,
          r.referral_code,r.referrer_name,r.referrer_phone,rc.conversion_type,rc.payment_reference
         FROM referral_rewards rr JOIN referrals r ON r.id=rr.referral_id JOIN referral_conversions rc ON rc.id=rr.conversion_id
         ORDER BY rr.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
      );
      return res.json({ items: result.rows.map((r) => ({ ...r, reward_rupees: Number(r.reward_amount_paise) / 100 })), limit, offset });
    } catch (error) { return next(error); }
  });

  // Admin verifies a real customer payment. This is the only operation that
  // creates a reward; clicking links or submitting forms never creates one.
  router.post('/referrals/:id/conversions', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const conversionType = requiredText(req.body.conversion_type, 'Conversion type', 32);
      if (!Object.hasOwn(REWARD_RULES, conversionType)) return res.status(400).json({ error: 'Unsupported conversion type.' });
      const paymentReference = requiredText(req.body.payment_reference, 'Payment reference', 120);
      const paidAmount = Number(req.body.paid_amount_rupees);
      if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > 100000000) return res.status(400).json({ error: 'Enter a valid paid amount in rupees.' });
      const notes = text(req.body.notes, 2000);
      await client.query('BEGIN');
      const referralResult = await client.query('SELECT id,expires_at,status FROM referrals WHERE id=$1 FOR UPDATE', [req.params.id]);
      const referral = referralResult.rows[0];
      if (!referral) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Referral not found.' }); }
      if (referral.status !== 'active' || new Date(referral.expires_at) < new Date()) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'This referral is not eligible for a new reward.' });
      }
      if (req.body.enquiry_id) {
        const enquiry = await client.query('SELECT id FROM enquiries WHERE id=$1 AND referral_id=$2', [req.body.enquiry_id, referral.id]);
        if (!enquiry.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'The enquiry does not belong to this referral.' }); }
      }
      const conversionId = randomUUID();
      const conversion = await client.query(
        `INSERT INTO referral_conversions(id,referral_id,enquiry_id,conversion_type,payment_reference,paid_amount_paise,verified_by,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,conversion_type,payment_reference,payment_verified_at`,
        [conversionId, referral.id, req.body.enquiry_id || null, conversionType, paymentReference, Math.round(paidAmount * 100), req.auth.id, notes || null]
      );
      const rewardId = randomUUID();
      const reward = await client.query(
        `INSERT INTO referral_rewards(id,referral_id,conversion_id,reward_type,reward_amount_paise)
         VALUES($1,$2,$3,$4,$5) RETURNING id,reward_type,reward_amount_paise,status`,
        [rewardId, referral.id, conversionId, conversionType, REWARD_RULES[conversionType]]
      );
      await client.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata)
         VALUES('admin',$1,'referral.conversion_verified','referral',$2,$3::jsonb)`,
        [req.auth.id, referral.id, JSON.stringify({ conversionType, paymentReference })]
      );
      await client.query('COMMIT');
      return res.status(201).json({ conversion: conversion.rows[0], reward: { ...reward.rows[0], reward_rupees: Number(reward.rows[0].reward_amount_paise) / 100 } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') return res.status(409).json({ error: 'This payment reference has already been recorded.' });
      return next(error);
    } finally { client.release(); }
  });

  router.patch('/rewards/:id/status', async (req, res, next) => {
    try {
      const status = requiredText(req.body.status, 'Status', 20);
      if (!['approved','paid','cancelled'].includes(status)) return res.status(400).json({ error: 'Status must be approved, paid or cancelled.' });
      const payoutReference = text(req.body.payout_reference, 120);
      if (status === 'paid' && !payoutReference) return res.status(400).json({ error: 'A payout reference is required when marking a reward paid.' });
      const result = await pool.query(
        `UPDATE referral_rewards SET status=$1,
           approved_by=CASE WHEN $1='approved' THEN $2 ELSE approved_by END,
           approved_at=CASE WHEN $1='approved' THEN NOW() ELSE approved_at END,
           paid_by=CASE WHEN $1='paid' THEN $2 ELSE paid_by END,
           paid_at=CASE WHEN $1='paid' THEN NOW() ELSE paid_at END,
           payout_reference=CASE WHEN $1='paid' THEN $3 ELSE payout_reference END,
           updated_at=NOW()
         WHERE id=$4 RETURNING id,status,reward_amount_paise,paid_at,payout_reference`,
        [status, req.auth.id, payoutReference || null, req.params.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Reward not found.' });
      await audit(pool, 'admin', req.auth.id, `reward.${status}`, 'reward', req.params.id, { payoutReference: payoutReference || null });
      return res.json({ reward: { ...result.rows[0], reward_rupees: Number(result.rows[0].reward_amount_paise) / 100 } });
    } catch (error) { return next(error); }
  });

  router.get('/audit-logs', async (req, res, next) => {
    try {
      const { limit, offset } = pagination(req.query);
      const result = await pool.query('SELECT actor_type,actor_id,action,entity_type,entity_id,metadata,created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
      return res.json({ items: result.rows, limit, offset });
    } catch (error) { return next(error); }
  });

  return router;
}
module.exports = { adminRoutes };
