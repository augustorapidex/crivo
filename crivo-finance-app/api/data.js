import crypto from 'node:crypto';
import {db, ensureSchema, requireAuth, mutationSafe, errorResponse, generateRecurring, normalizeRow, nowMonth} from '../lib/server.js';
import {isoDate, monthKey, monthlyDate, splitCents, cardFirstDue, positiveCents} from '../lib/math.js';

const id = () => crypto.randomUUID();
const allowed = (value, values, label='Opção') => {if (!values.includes(value)) throw Error(`${label} inválida.`); return value;};
const str = (v,max=150) => String(v??'').trim().slice(0,max);
const label = v => {const s=str(v); if (!s) throw Error('Preencha a descrição.'); return s;};
const cnt = v => positiveCents(v);
const date = v => isoDate(v);
const day = v => {const n=Number(v); if (!Number.isInteger(n)||n<1||n>31) throw Error('Escolha um dia entre 1 e 31.'); return n;};
const month = v => {date(`${v}-01`); return v;};
const boolean = v => v===true;
const method = v => allowed(v, ['pix','cash','debit','credit','other'], 'Forma de pagamento');
const kind = v => allowed(v,['income','expense'],'Tipo');
const status = v => allowed(v,['paid','pending'],'Situação');
async function context(monthWanted) {
  const q=db(); const m=month(monthWanted || nowMonth());
  // Generate the active view and the 12 subsequent months for the projection.
  for(let i=0;i<13;i++) await generateRecurring(monthlyDate(`${m}-01`,i).slice(0,7));
  const [categories,cards,recurrences,entries,goals,goalChanges] = await Promise.all([
    q`SELECT * FROM categories ORDER BY kind,name`,
    q`SELECT * FROM cards ORDER BY name`,
    q`SELECT * FROM recurrences ORDER BY description`,
    q`SELECT * FROM entries WHERE deleted = false ORDER BY due_date DESC,created_at DESC LIMIT 20000`,
    q`SELECT * FROM goals ORDER BY name`,
    q`SELECT * FROM goal_changes ORDER BY created_at DESC`
  ]);
  return {categories, cards:cards.map(normalizeRow), recurrences:recurrences.map(normalizeRow), entries:entries.map(normalizeRow), goals:goals.map(normalizeRow), goalChanges:goalChanges.map(normalizeRow), month:m, publicKey:process.env.VAPID_PUBLIC_KEY || ''};
}
async function action(body) {
  const q=db(); const type = str(body.action,50), v=body.data || {};
  if(type === 'add-category') {
    const name=label(v.name); const k=kind(v.kind);
    await q`INSERT INTO categories (id,name,kind) VALUES (${id()},${name},${k}) ON CONFLICT(name,kind) DO NOTHING`;
  } else if(type === 'edit-category') {
    const name=label(v.name);
    await q`UPDATE categories SET name=${name} WHERE id=${str(v.id)}`;
  } else if(type === 'delete-category') {
    const used=await q`SELECT 1 FROM entries WHERE category_id=${str(v.id)} AND deleted=false LIMIT 1`;
    if(used.length) throw Error('Esta categoria tem movimentações. Edite o nome em vez de excluir.');
    await q`DELETE FROM categories WHERE id=${str(v.id)}`;
  } else if(type === 'save-card') {
    const card={name:label(v.name),limit:cnt(v.limitCents),close:day(v.closeDay),due:day(v.dueDay)};
    if(v.id) await q`UPDATE cards SET name=${card.name},limit_cents=${card.limit},close_day=${card.close},due_day=${card.due} WHERE id=${str(v.id)}`;
    else await q`INSERT INTO cards (id,name,limit_cents,close_day,due_day) VALUES (${id()},${card.name},${card.limit},${card.close},${card.due})`;
  } else if(type === 'delete-card') {
    const cardId=str(v.id);
    const used=await q`SELECT 1 FROM entries WHERE card_id=${cardId} AND deleted=false LIMIT 1`;
    if(used.length) throw Error('Este cartão tem compras. Não é possível excluí-lo.');
    await q`DELETE FROM cards WHERE id=${cardId}`;
  } else if(type === 'add-entry') {
    const k=kind(v.kind), src=allowed(str(v.source),['salary','freelance','other','purchase','bill'],'Origem');
    const description=label(v.description), amount=cnt(v.amountCents), start=date(v.date);
    const cat=str(v.categoryId,70)||null, payment= k==='income'?'other':method(v.paymentMethod || 'other');
    const essential=boolean(v.essential), notes=str(v.notes,1000);
    const count=Number(v.installments || 1);
    if(!Number.isInteger(count)||count<1||count>120) throw Error('Número de parcelas inválido.');
    if(k==='income' && count>1) throw Error('Entrada parcelada não permitida.');
    const items=splitCents(amount,count), group=count>1?id():null;
    let firstDate=start, cardId=null;
    if(payment==='credit') {
      cardId=str(v.cardId,80); const rows=await q`SELECT * FROM cards WHERE id=${cardId}`;
      if(!rows.length) throw Error('Escolha um cartão cadastrado.');
      firstDate=cardFirstDue(start, Number(rows[0].close_day),Number(rows[0].due_day));
    }
    // Grava todas as parcelas juntas: nenhuma compra pode ficar pela metade
    // caso haja uma falha na conexão durante o cadastro.
    const inserts=[];
    for(let i=0;i<count;i++) {
      const due=monthlyDate(firstDate,i), paid=k==='income' ? status(v.status||'pending') :
        (payment==='credit' || count>1 || src==='bill') ? 'pending' : status(v.status||'paid');
      inserts.push(q`INSERT INTO entries (id,description,kind,source,amount_cents,due_date,status,category_id,payment_method,card_id,essential,notes,group_id,installment_index,installment_count)
        VALUES (${id()},${description},${k},${src},${items[i]},${due},${paid},${cat},${payment},${cardId},${essential},${notes},${group},${count>1?i+1:null},${count>1?count:null})`);
    }
    await q.transaction(inserts);
  } else if(type === 'update-entry') {
    const target=str(v.id,80);
    const exists=await q`SELECT * FROM entries WHERE id=${target} AND deleted=false`;
    if(!exists.length) throw Error('Movimentação não encontrada.');
    const old=exists[0];
    // Credit entries can only be paid with the entire card statement.
    if(old.payment_method==='credit' && v.status && v.status !== old.status) throw Error('Marque a fatura inteira como paga na tela Parcelas.');
    await q`UPDATE entries SET description=${label(v.description)},amount_cents=${cnt(v.amountCents)},due_date=${date(v.date)},status=${old.payment_method==='credit' ? old.status : status(v.status)},category_id=${str(v.categoryId,70)||null},essential=${boolean(v.essential)},notes=${str(v.notes,1000)},manually_edited=true WHERE id=${target}`;
  } else if(type === 'delete-entry') {
    if(boolean(v.wholeGroup)) {
      const item=await q`SELECT group_id FROM entries WHERE id=${str(v.id)}`;
      if(!item.length||!item[0].group_id) throw Error('Compra parcelada não encontrada.');
      await q`UPDATE entries SET deleted=true WHERE group_id=${item[0].group_id}`;
    } else await q`UPDATE entries SET deleted=true WHERE id=${str(v.id)}`;
  } else if(type === 'set-paid') {
    const target=str(v.id,80), s=status(v.status);
    const item=await q`SELECT payment_method FROM entries WHERE id=${target} AND deleted=false`;
    if(!item.length) throw Error('Movimentação não encontrada.');
    if(item[0].payment_method==='credit') throw Error('Pague a fatura inteira na tela Parcelas.');
    await q`UPDATE entries SET status=${s} WHERE id=${target}`;
  } else if(type === 'pay-statement') {
    const c=str(v.cardId,80), monthValue=month(v.month);
    const start=`${monthValue}-01`, end=monthlyDate(start,1);
    // One atomic update. Already-paid parts cannot be charged a second time.
    const paid=await q`UPDATE entries SET status='paid' WHERE card_id=${c} AND payment_method='credit' AND status='pending' AND deleted=false AND due_date >= ${start}::date AND due_date < ${end}::date RETURNING id`;
    if(!paid.length) throw Error('Não há parcelas pendentes nesta fatura.');
  } else if(type === 'save-recurrence') {
    const k=kind(v.kind), desc=label(v.description), src=allowed(str(v.source),['salary','other','bill'],'Origem');
    const amount=cnt(v.amountCents), start=date(v.startDate), d=day(v.day), cat=str(v.categoryId,70)||null;
    const payment=k==='income'?'other':method(v.paymentMethod||'other');
    if(payment==='credit') throw Error('Conta recorrente no cartão não está disponível. Cadastre as compras no cartão.');
    const essential=boolean(v.essential), notes=str(v.notes,1000);
    if(v.id) {
      const rid=str(v.id,80);
      await q`UPDATE recurrences SET description=${desc},kind=${k},source=${src},amount_cents=${amount},category_id=${cat},payment_method=${payment},essential=${essential},notes=${notes},start_date=${start},day=${d},active=true WHERE id=${rid}`;
      // Registros já confirmados e meses excluídos continuam intactos.
      // As próximas ocorrências ainda pendentes serão atualizadas pelo mês de referência.
    } else await q`INSERT INTO recurrences (id,description,kind,source,amount_cents,category_id,payment_method,essential,notes,start_date,day) VALUES (${id()},${desc},${k},${src},${amount},${cat},${payment},${essential},${notes},${start},${d})`;
  } else if(type === 'stop-recurrence') {
    const rid=str(v.id,80);
    await q`UPDATE recurrences SET active=false WHERE id=${rid}`;
    await q`UPDATE entries SET deleted=true WHERE recurrence_id=${rid} AND status='pending' AND due_date >= CURRENT_DATE`;
  } else if(type === 'add-goal') {
    const name=label(v.name), target=cnt(v.targetCents), due=v.dueDate?date(v.dueDate):null;
    await q`INSERT INTO goals(id,name,target_cents,due_date) VALUES (${id()},${name},${target},${due})`;
  } else if(type === 'edit-goal') {
    await q`UPDATE goals SET name=${label(v.name)},target_cents=${cnt(v.targetCents)},due_date=${v.dueDate?date(v.dueDate):null} WHERE id=${str(v.id)}`;
  } else if(type === 'goal-transfer') {
    const goalId=str(v.id,80), amount=cnt(v.amountCents)*(v.direction==='withdraw'?-1:1);
    const [rows,allEntries,allChanges]=await Promise.all([
      q`SELECT id FROM goals WHERE id=${goalId}`,
      q`SELECT kind,amount_cents,status FROM entries WHERE deleted=false AND status='paid'`,
      q`SELECT goal_id,amount_cents FROM goal_changes`
    ]);
    if(!rows.length) throw Error('Meta não encontrada.');
    const reserved=allChanges.reduce((a,x)=>a+Number(x.amount_cents),0);
    const balance=allEntries.reduce((a,x)=>a+(x.kind==='income'?1:-1)*Number(x.amount_cents),0);
    const own=allChanges.filter(x=>x.goal_id===goalId).reduce((a,x)=>a+Number(x.amount_cents),0);
    if(amount>0 && amount>balance-reserved) throw Error('Saldo disponível insuficiente para reservar esse valor.');
    if(amount<0 && -amount>own) throw Error('Esta meta não tem todo esse valor reservado.');
    await q`INSERT INTO goal_changes(id,goal_id,amount_cents) VALUES (${id()},${goalId},${amount})`;
  } else if(type === 'delete-goal') {
    const goalId=str(v.id,80);
    const changes=await q`SELECT COALESCE(SUM(amount_cents),0) AS total FROM goal_changes WHERE goal_id=${goalId}`;
    if(Number(changes[0]?.total)>0) throw Error('Retire o dinheiro reservado antes de excluir a meta.');
    await q`DELETE FROM goal_changes WHERE goal_id=${goalId}`;
    await q`DELETE FROM goals WHERE id=${goalId}`;
  } else throw Error('Operação inválida.');
  return {ok:true};
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).end();
  if(!(await requireAuth(req,res))) return;
  try {
    await ensureSchema();
    if(req.method==='GET') return res.json(await context(String(req.query.month || nowMonth())));
    if(!mutationSafe(req,res)) return;
    const result=await action(req.body||{});
    return res.json(result);
  } catch(e) {errorResponse(res,e);}
}
