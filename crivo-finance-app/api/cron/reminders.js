import crypto from 'node:crypto';
import webpush from 'web-push';
import {db,ensureSchema,generateRecurring,errorResponse} from '../../lib/server.js';
import {todayBrazil,dayDifference,monthlyDate} from '../../lib/math.js';
export default async function handler(req,res) {
  if (req.method!=='GET') return res.status(405).end();
  if (!process.env.CRON_SECRET || req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'Acesso negado.'});
  try {
    await ensureSchema();
    const today=todayBrazil(), month=today.slice(0,7);
    await generateRecurring(month);
    await generateRecurring(monthlyDate(`${month}-01`,1).slice(0,7));
    const q=db();
    const entries=await q`SELECT id,description,due_date,card_id,payment_method,amount_cents FROM entries
      WHERE deleted=false AND status='pending' AND kind='expense' AND due_date <= ${monthlyDate(today,0)}::date + INTERVAL '3 days'`;
    const devices=await q`SELECT endpoint,subscription FROM push_subscriptions`;
    if(!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) return res.json({ok:true,notices:0,devices:devices.length,info:'Chaves de notificações não configuradas.'});
    webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    const alertItems=new Map();
    for(const row of entries) {
      const due=row.due_date instanceof Date ? row.due_date.toISOString().slice(0,10) : String(row.due_date).slice(0,10), diff=dayDifference(due,today);
      if(diff>3 || (diff>0 && diff!==3)) continue;
      const billKey=row.payment_method==='credit' ? `card:${row.card_id}:${due.slice(0,7)}` : `entry:${row.id}`;
      if(!alertItems.has(billKey)) alertItems.set(billKey,{description:row.payment_method==='credit'?'Fatura do cartão':row.description,due,diff});
    }
    let sent=0;
    for(const [billKey,alert] of alertItems) {
      const caption=alert.diff<0?'está atrasada':alert.diff===0?'vence hoje':'vence em 3 dias';
      for(const device of devices) {
        const identity=crypto.createHash('sha256').update(device.endpoint).digest('hex').slice(0,16);
        const logKey=`${today}:${billKey}:${identity}`;
        // Log only after sending; concurrent invocations normally won't overlap for a daily schedule.
        const logged=await q`SELECT key FROM alert_logs WHERE key=${logKey}`;
        if(logged.length) continue;
        try {
          const payload=JSON.stringify({title:'Crivo Finance',body:`${alert.description} ${caption}.`,url:'/'});
          await webpush.sendNotification(device.subscription,payload,{TTL:86400});
          await q`INSERT INTO alert_logs(key) VALUES(${logKey}) ON CONFLICT DO NOTHING`;
          sent++;
        } catch(e) {
          if(e.statusCode===404 || e.statusCode===410) await q`DELETE FROM push_subscriptions WHERE endpoint=${device.endpoint}`;
          else console.error('[Crivo push]',e.message);
        }
      }
    }
    return res.json({ok:true,notices:alertItems.size,delivered:sent});
  } catch(e) {errorResponse(res,e);}
}
