import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dateFromName, monthKeyOf } from '../lib/mediaDate.ts';

test('lê a data do nome padrão do WhatsApp', () => {
  const date = dateFromName('AUD-20261014-WA0007.opus');
  assert.ok(date);
  assert.equal(monthKeyOf(date), '2026-10');
  assert.equal(dateFromName('IMG-20250915-WA0012.jpg')?.toISOString().slice(0, 10), '2025-09-15');
});

test('número solto no nome não vira pasta 7200-03', () => {
  assert.equal(dateFromName('NF 72000315.pdf'), null);
  assert.equal(dateFromName('relatorio72000315.pdf'), null);
  assert.equal(dateFromName('72000315.pdf'), null);
});

test('data ISO no nome do comprovante não é YYYYMMDD do WhatsApp', () => {
  assert.equal(dateFromName('Comprovantes BB - 2026-10-19T144945.654.pdf'), null);
});
