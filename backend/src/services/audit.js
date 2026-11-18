
/**
 * OQENTRA Audit Service
 *
 * Stores application activities in PostgreSQL.
 * The audit_logs.id column is BIGINT and PostgreSQL
 * automatically generates its value using a sequence.
 */

async function audit(
  pool,
  actorType,
  actorId,
  action,
  entityType,
  entityId,
  metadata = {}
) {
  await pool.query(
    `INSERT INTO audit_logs
      (actor_type, actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actorType,
      actorId || null,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify(metadata)
    ]
  );
}

module.exports = { audit };

