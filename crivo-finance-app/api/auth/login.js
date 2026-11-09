import crypto from 'node:crypto';
import {db, ensureSchema, effectiveHash, verifyPassword, makeSession, sessionCookie, mutationSafe, errorResponse} from '../../lib/server.js';
export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!mutationSafe(req,res)) return;
  try {
    await ensureSchema();
    const q=db(), now = new Date();
    const ip = String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
    const ipHash = crypto.createHash('sha256').update(ip + process.env.SESSION_SECRET).digest('hex');
    const attempts = await q`SELECT count, first_at FROM login_attempts WHERE ip_hash = ${ipHash}`;
    const current = attempts[0];
    const age = current ? (now.getTime() - new Date(current.first_at).getTime()) : Infinity;
    if (current && age < 15*60*1000 && current.count >= 5) return res.status(429).json({error:'Muitas tentativas. Tente novamente em 15 minutos.'});
    const hash = await effectiveHash();
    if (!hash) return res.status(503).json({error:'Configure a senha de acesso antes de entrar.'});
    const pass = String(req.body?.password || '');
    if (!verifyPassword(pass, hash)) {
      if (!current || age >= 15*60*1000) await q`INSERT INTO login_attempts (ip_hash,count,first_at) VALUES (${ipHash},1,NOW()) ON CONFLICT (ip_hash) DO UPDATE SET count=1,first_at=NOW()`;
      else await q`UPDATE login_attempts SET count=count+1 WHERE ip_hash=${ipHash}`;
      return res.status(401).json({error:'Senha incorreta.'});
    }
    await q`DELETE FROM login_attempts WHERE ip_hash=${ipHash}`;
    res.setHeader('Set-Cookie',sessionCookie(makeSession(hash)));
    res.status(200).json({ok:true});
  } catch(e) { errorResponse(res,e); }
}
