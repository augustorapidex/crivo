import {db,requireAuth,ensureSchema,errorResponse} from '../lib/server.js';
const csvCell = value => {
  let s=String(value??'');
  if (/^[\s]*[=+\-@]/.test(s)) s=`'${s}`;
  return '"'+s.replaceAll('"','""')+'"';
};
export default async function handler(req,res) {
  if(req.method!=='GET') return res.status(405).end();
  if(!(await requireAuth(req,res))) return;
  try {
    await ensureSchema();
    const rows=await db()`SELECT e.*,c.name AS category_name,k.name AS card_name FROM entries e
      LEFT JOIN categories c ON c.id=e.category_id LEFT JOIN cards k ON k.id=e.card_id
      WHERE e.deleted=false ORDER BY e.due_date ASC,e.created_at ASC`;
    const headers=['Data prevista','Descrição','Tipo','Origem','Valor (R$)','Situação','Categoria','Forma de pagamento','Cartão','Essencial','Parcela','Observações'];
    const body=rows.map(r=>[
      String(r.due_date).slice(0,10),r.description,r.kind==='income'?'Entrada':'Despesa',r.source,
      (Number(r.amount_cents)/100).toFixed(2).replace('.',','),r.status==='paid'?'Confirmada':'Pendente',
      r.category_name||'',r.payment_method,r.card_name||'',r.essential?'Sim':'Não',
      r.installment_index?`${r.installment_index}/${r.installment_count}`:'',r.notes||''
    ]);
    const csv='\ufeff'+[headers,...body].map(line=>line.map(csvCell).join(';')).join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="crivo-finance-movimentacoes.csv"');
    res.setHeader('Cache-Control','no-store');
    res.status(200).send(csv);
  } catch(e) {errorResponse(res,e);}
}
