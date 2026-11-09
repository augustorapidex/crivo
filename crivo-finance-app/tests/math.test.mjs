import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCents, monthlyDate, cardFirstDue, dayDifference } from '../lib/math.js';
test('parcelamento distribui centavos restantes somente na última', () => {
  assert.deepEqual(splitCents(10000, 3), [3333, 3333, 3334]);
  assert.equal(splitCents(10000, 3).reduce((a,b)=>a+b,0), 10000);
  assert.deepEqual(splitCents(120000, 5), [24000,24000,24000,24000,24000]);
});
test('mensal mantém dia original e limita mês curto', () => {
  assert.equal(monthlyDate('2026-01-31',1), '2026-02-28');
  assert.equal(monthlyDate('2026-01-31',2), '2026-03-31');
  assert.equal(monthlyDate('2028-01-31',1), '2028-02-29');
  assert.equal(monthlyDate('2026-03-30',1), '2026-04-30');
});
test('cartão identifica primeiro mês pela data de fechamento', () => {
  assert.equal(cardFirstDue('2026-11-04',5,12),'2026-11-12');
  assert.equal(cardFirstDue('2026-11-06',5,12),'2026-12-12');
  assert.equal(cardFirstDue('2026-11-04',20,10),'2026-12-10');
  assert.equal(cardFirstDue('2026-11-21',20,10),'2027-01-10');
});
test('avisos por dias do calendário', () => {
  assert.equal(dayDifference('2026-11-12','2026-11-09'),3);
  assert.equal(dayDifference('2026-11-08','2026-11-09'),-1);
});
