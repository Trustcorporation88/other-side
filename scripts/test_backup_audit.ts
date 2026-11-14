import assert from 'node:assert/strict';
import test from 'node:test';

import { categoryOfKind, percentOnDrive, summarizeAudit } from '../lib/backupAudit.ts';

test('conta o que falta por tipo e por mês, do mais antigo ao mais novo', () => {
  const audit = summarizeAudit([
    { category: 'audio', monthKey: '2026-10', onDrive: true },
    { category: 'audio', monthKey: '2026-03', onDrive: false },
    { category: 'audio', monthKey: '2026-10', onDrive: false },
    { category: 'audio', monthKey: '2026-03', onDrive: false },
    { category: 'gallery', monthKey: '2026-01', onDrive: true },
  ]);
  assert.deepEqual(audit, [
    {
      category: 'audio',
      total: 4,
      onDrive: 1,
      missing: 3,
      gaps: [
        { monthKey: '2026-03', missing: 2 },
        { monthKey: '2026-10', missing: 1 },
      ],
    },
    { category: 'gallery', total: 1, onDrive: 1, missing: 0, gaps: [] },
  ]);
});

test('só mostra 100% quando não falta nada', () => {
  assert.equal(percentOnDrive(999, 1000), 99);
  assert.equal(percentOnDrive(1000, 1000), 100);
  assert.equal(percentOnDrive(0, 0), 100);
  assert.equal(percentOnDrive(1, 3), 33);
});

test('tipo desconhecido conta como áudio', () => {
  assert.equal(categoryOfKind(undefined), 'audio');
  assert.equal(categoryOfKind('video'), 'video');
  assert.equal(categoryOfKind('image'), 'image');
});
