import {requireAuth,mutationSafe,errorResponse,db,effectiveHash,verifyPassword,secretHash,sessionCookie,makeSession} from '../../lib/server.js';
export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!mutationSafe(req,res) || !(await requireAuth(req,res))) return;
  try {
    const oldPassword = String(req.body?.oldPassword || ''); const newPassword = String(req.body?.newPassword || '');
    if (!verifyPassword(oldPassword,await effectiveHash())) throw Error('Senha atual incorreta.');
    if (newPassword.length < 12 || newPassword.length > 128) throw Error('A senha precisa ter entre 12 e 128 caracteres.');
    const hash = secretHash(newPassword);
    await db()`INSERT INTO settings(key,value) VALUES('password_hash',${hash}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
    res.setHeader('Set-Cookie',sessionCookie(makeSession(hash)));
    res.json({ok:true});
  } catch (e) {errorResponse(res,e);}
}
