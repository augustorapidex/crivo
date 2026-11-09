import test from 'node:test';
import assert from 'node:assert/strict';
import {splitCents, monthlyDate, cardFirstDue, isoDate, dayDifference} from '../lib/math.js';

test('valores exatos em centavos para parcelamentos de 1 a 120 vezes', () => {
  for (let installments=1; installments<=120; installments++) {
    for (const surplus of [0, 1, 2, 33, 99]) {
      const total=installments*137+surplus;
      const parts=splitCents(total,installments);
      assert.equal(parts.length,installments);
      assert.equal(parts.reduce((sum,n)=>sum+n,0),total);
      assert.ok(parts.every(n=>Number.isInteger(n)&&n>0));
      assert.ok(parts.slice(0,-1).every(n=>n===Math.floor(total/installments)));
    }
  }
});

test('parcelas mantêm o dia original, sem cair no início do mês seguinte', () => {
  const expected=['2027-01-31','2027-02-28','2027-03-31','2027-04-30','2027-05-31','2027-06-30'];
  assert.deepEqual(expected.map((_,i)=>monthlyDate('2027-01-31',i)),expected);
});

test('parcela em ano bissexto chega a 29 de fevereiro', () => {
  assert.equal(monthlyDate('2028-01-31',1),'2028-02-29');
});

test('cartão com vencimento anterior ao fechamento vai para o mês seguinte', () => {
  assert.equal(cardFirstDue('2026-11-15',25,5),'2026-12-05');
  assert.equal(cardFirstDue('2026-11-26',25,5),'2027-01-05');
});

test('cartão com vencimento posterior ao fechamento respeita compra antes e depois', () => {
  assert.equal(cardFirstDue('2026-11-05',5,20),'2026-11-20');
  assert.equal(cardFirstDue('2026-11-06',5,20),'2026-12-20');
});

test('rejeita datas impossíveis e quantidades sem valor mínimo por parcela', () => {
  assert.throws(()=>isoDate('2027-02-29'));
  assert.throws(()=>isoDate('2026-13-01'));
  assert.throws(()=>splitCents(5,6));
  assert.throws(()=>splitCents(100,121));
});

test('avisos utilizam dias de calendário, não horas aproximadas', () => {
  assert.equal(dayDifference('2027-01-01','2026-12-29'),3);
  assert.equal(dayDifference('2026-11-09','2026-11-09'),0);
  assert.equal(dayDifference('2026-11-06','2026-11-09'),-3);
});
