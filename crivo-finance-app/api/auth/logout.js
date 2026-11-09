import {sessionCookie,mutationSafe} from '../../lib/server.js';
export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!mutationSafe(req,res)) return;
  res.setHeader('Set-Cookie',sessionCookie('',true));
  res.json({ok:true});
}
