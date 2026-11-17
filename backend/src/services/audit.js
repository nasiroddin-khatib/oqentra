const { randomUUID } = require('node:crypto');

async function audit(pool, actorType, actorId, action, entityType, entityId, metadata = {}) {
  await pool.query(
    `INSERT INTO audit_logs(id, actor_type, actor_id, action, entity_type, entity_id, metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(), actorType, actorId || null, action, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata)]
  );
}
module.exports = { audit };
