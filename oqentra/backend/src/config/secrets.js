const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

/**
 * Optionally load runtime secrets from AWS Secrets Manager before validating
 * configuration. The secret value must be a JSON object of environment keys.
 * IAM instance/task role credentials are preferred over static AWS keys.
 */
async function loadAwsSecretsIfConfigured() {
  const secretId = process.env.AWS_SECRET_ID;
  if (!secretId) return;
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = result.SecretString;
  if (!raw) throw new Error('AWS Secrets Manager secret has no SecretString value.');
  const values = JSON.parse(raw);
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && !process.env[key]) process.env[key] = value;
  }
}

module.exports = { loadAwsSecretsIfConfigured };
