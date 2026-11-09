import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { monthlyDate, isoDate, todayBrazil } from './math.js';

let client, initialized;
export function db() {
  if (!process.env.DATABASE_URL) throw Error('Conecte o armazenamento do Crivo Finance na Vercel.');
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}
export async function ensureSchema() {
  if (!initialized) initialized = (async () => {
    const q = db();
    await q`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    await q`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('income','expense')), UNIQUE (name, kind))`;
    await q`CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, name TEXT NOT NULL, limit_cents BIGINT NOT NULL CHECK (limit_cents > 0), close_day INTEGER NOT NULL CHECK (close_day BETWEEN 1 AND 31), due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31))`;
    await q`CREATE TABLE IF NOT EXISTS recurrences (id TEXT PRIMARY KEY, description TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('income','expense')), source TEXT NOT NULL, amount_cents BIGINT NOT NULL, category_id TEXT, payment_method TEXT, essential BOOLEAN NOT NULL DEFAULT FALSE, notes TEXT NOT NULL DEFAULT '', start_date DATE NOT NULL, day INTEGER NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)`;
    await q`CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, description TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('income','expense')), source TEXT NOT NULL, amount_cents BIGINT NOT NULL CHECK (amount_cents > 0), due_date DATE NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','paid')), deleted BOOLEAN NOT NULL DEFAULT FALSE, category_id TEXT, payment_method TEXT NOT NULL, card_id TEXT, essential BOOLEAN NOT NULL DEFAULT FALSE, notes TEXT NOT NULL DEFAULT '', group_id TEXT, installment_index INTEGER, installment_count INTEGER, recurrence_id TEXT, reference_month TEXT, manually_edited BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (recurrence_id,due_date))`;
    await q`ALTER TABLE entries ADD COLUMN IF NOT EXISTS reference_month TEXT`;
    await q`ALTER TABLE entries ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN NOT NULL DEFAULT FALSE`;
    await q`UPDATE entries SET reference_month=to_char(due_date,'YYYY-MM') WHERE recurrence_id IS NOT NULL AND reference_month IS NULL`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS entries_recurrence_month_idx ON entries (recurrence_id,reference_month)`;
    await q`CREATE INDEX IF NOT EXISTS entries_due_idx ON entries (due_date)`;
    await q`CREATE INDEX IF NOT EXISTS entries_group_idx ON entries (group_id)`;
    await q`CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, target_cents BIGINT NOT NULL CHECK (target_cents > 0), due_date DATE)`;
    await q`CREATE TABLE IF NOT EXISTS goal_changes (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await q`CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, subscription JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await q`CREATE TABLE IF NOT EXISTS alert_logs (key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await q`CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, first_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    const cats = [
      ['Salário','income'], ['Freelancer','income'], ['Outras entradas','income'],
      ['Alimentação','expense'], ['Transporte','expense'], ['Moradia','expense'], ['Saúde','expense'],
      ['Lazer','expense'], ['Compras','expense'], ['Assinaturas','expense'], ['Educação','expense'], ['Outros','expense']
    ];
    for (const [name, kind] of cats) await q`INSERT INTO categories (id,name,kind) VALUES (${crypto.randomUUID()},${name},${kind}) ON CONFLICT (name,kind) DO NOTHING`;
  })().catch(e => { initialized = null; throw e; });
  return initialized;
}
export function secretHash(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}
export function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || !stored) return false;
    const parts = stored.split('$');
    let expected, actual;
    if (parts[0] === 'scrypt' && parts.length === 3 && /^[0-9a-f]{32}$/.test(parts[1]) && /^[0-9a-f]{128}$/.test(parts[2])) {
      expected = Buffer.from(parts[2], 'hex');
      actual = crypto.scryptSync(password, Buffer.from(parts[1],'hex'), 64, { N:16384, r:8, p:1 });
    } else if (parts[0] === 'pbkdf2' && parts.length === 4 && parts[1] === '310000' && /^[0-9a-f]{32}$/.test(parts[2]) && /^[0-9a-f]{64}$/.test(parts[3])) {
      expected = Buffer.from(parts[3], 'hex');
      actual = crypto.pbkdf2Sync(password, Buffer.from(parts[2],'hex'), 310000, 32, 'sha256');
    } else return false;
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
export async function effectiveHash() {
  await ensureSchema();
  const rows = await db()`SELECT value FROM settings WHERE key = 'password_hash'`;
  return rows[0]?.value ?? process.env.AUTH_PASSWORD_HASH;
}
const sessionAge = 30 * 24 * 60 * 60;
const b64 = s => Buffer.from(s).toString('base64url');
const getSecret = () => { if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw Error('Configure SESSION_SECRET.'); return process.env.SESSION_SECRET; };
function signature(body) { return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url'); }
const passwordMarker = hash => crypto.createHash('sha256').update(hash || '').digest('base64url').slice(0, 16);
export function makeSession(hash) {
  const body = b64(JSON.stringify({ expires: Math.floor(Date.now()/1000) + sessionAge, marker: passwordMarker(hash) }));
  return `${body}.${signature(body)}`;
}
export function sessionCookie(token, clear = false) {
  return `crivo_session=${clear ? '' : token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : sessionAge}`;
}
export async function isAuthenticated(req) {
  try {
    const cookies = (req.headers.cookie || '').split(';').map(v=>v.trim());
    const raw = cookies.find(v=>v.startsWith('crivo_session='))?.slice('crivo_session='.length);
    if (!raw) return false;
    const [body, sig, other] = raw.split('.');
    if (!body || !sig || other) return false;
    const expected = Buffer.from(signature(body)); const provided = Buffer.from(sig);
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return false;
    const obj = JSON.parse(Buffer.from(body,'base64url').toString());
    if (!Number.isInteger(obj.expires) || obj.expires <= Math.floor(Date.now()/1000)) return false;
    return obj.marker === passwordMarker(await effectiveHash());
  } catch { return false; }
}
export async function requireAuth(req, res) {
  if (await isAuthenticated(req)) return true;
  res.status(401).json({ error:'Sua sessão terminou. Entre novamente.' });
  return false;
}
export function mutationSafe(req, res) {
  const origin = req.headers.origin;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin && new URL(origin).host !== host) { res.status(403).json({error:'Origem não autorizada.'}); return false; }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) { res.status(415).json({error:'Envie dados no formato correto.'}); return false; }
  return true;
}
export function errorResponse(res, error) {
  console.error('[Crivo]',error);
  const known = /inválid|obrigat|não encontrad|não permitid|insuficiente|incorret|Já existe|Escolha|Preencha|existente|entre 1 e 31|parcela/i.test(error.message || '');
  res.status(known ? 400 : 500).json({ error: known ? error.message : 'Não foi possível concluir a operação. Tente novamente.' });
}
export async function generateRecurring(month) {
  isoDate(`${month}-01`);
  const q = db();
  const nextMonth = monthlyDate(`${month}-01`,1);
  const rules = await q`SELECT * FROM recurrences WHERE active = true AND start_date < ${nextMonth}::date`;
  for (const rule of rules) {
    const day = Number(rule.day);
    const due = monthlyDate(`${month}-01`, 0, day);
    if (due < (rule.start_date instanceof Date ? rule.start_date.toISOString().slice(0,10) : String(rule.start_date).slice(0,10))) continue;
    await q`INSERT INTO entries (id, description, kind, source, amount_cents, due_date, status, category_id, payment_method, essential, notes, recurrence_id, reference_month)
      VALUES (${crypto.randomUUID()},${rule.description},${rule.kind},${rule.source},${rule.amount_cents},${due},'pending',${rule.category_id},${rule.payment_method || 'other'},${rule.essential},${rule.notes},${rule.id},${month})
      ON CONFLICT (recurrence_id,reference_month) DO UPDATE SET
        description=EXCLUDED.description,kind=EXCLUDED.kind,source=EXCLUDED.source,amount_cents=EXCLUDED.amount_cents,
        due_date=EXCLUDED.due_date,category_id=EXCLUDED.category_id,payment_method=EXCLUDED.payment_method,
        essential=EXCLUDED.essential,notes=EXCLUDED.notes
      WHERE entries.status='pending' AND entries.deleted=false AND entries.manually_edited=false AND entries.due_date >= ${todayBrazil()}::date`;
  }
}
export function normalizeRow(row) {
  const result={...row};
  for(const key of ['due_date','start_date']) if (result[key] instanceof Date) result[key] = result[key].toISOString().slice(0,10);
  for(const key of ['amount_cents','limit_cents','target_cents']) if (result[key]!=null) result[key] = Number(result[key]);
  return result;
}
export function nowMonth() { return todayBrazil().slice(0,7); }
