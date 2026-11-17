const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function email(value, required = false) {
  const result = text(value, 254).toLowerCase();
  if (!result && !required) return '';
  if (!EMAIL_RE.test(result)) throw Object.assign(new Error('Please provide a valid email address.'), { status: 400 });
  return result;
}
function phone(value) {
  const result = text(value, 30);
  const digits = result.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) throw Object.assign(new Error('Please provide a valid phone number.'), { status: 400 });
  return result;
}
function requiredText(value, label, max) {
  const result = text(value, max);
  if (!result) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  return result;
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw Object.assign(new Error('Password must be between 12 and 128 characters.'), { status: 400 });
  }
  return value;
}
function pagination(query) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), 100);
  const offset = Math.max(Number.parseInt(query.offset, 10) || 0, 0);
  return { limit, offset };
}
module.exports = { text, email, phone, requiredText, password, pagination };
