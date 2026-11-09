import {db,requireAuth,mutationSafe,errorResponse,ensureSchema} from '../../lib/server.js';
export default async function handler(req,res) {
  if(req.method!=='POST') return res.status(405).end();
  if(!mutationSafe(req,res)||!(await requireAuth(req,res))) return;
  try {
    await ensureSchema();
    const subscription=req.body?.subscription;
    if(!subscription || typeof subscription.endpoint!=='string' || !subscription.endpoint.startsWith('https://') ||
       typeof subscription.keys?.p256dh!=='string' || typeof subscription.keys?.auth!=='string') throw Error('Assinatura de avisos inválida.');
    if (JSON.stringify(subscription).length > 4096) throw Error('Assinatura inválida.');
    await db()`INSERT INTO push_subscriptions(endpoint,subscription) VALUES (${subscription.endpoint},${JSON.stringify(subscription)}::jsonb)
      ON CONFLICT(endpoint) DO UPDATE SET subscription=EXCLUDED.subscription`;
    res.json({ok:true});
  } catch(e) {errorResponse(res,e);}
}
