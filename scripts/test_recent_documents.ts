import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  documentKey,
  isDocumentName,
  pickRecentDocuments,
  type DocumentCandidate,
} from '../lib/recentDocumentSelection.ts';

function doc(partial: Partial<DocumentCandidate> & Pick<DocumentCandidate, 'fileName' | 'sizeBytes' | 'moment'>): DocumentCandidate {
  return {
    key: documentKey(partial.fileName, partial.sizeBytes),
    ...partial,
  };
}

test('pdf e planilha contam como documento; foto e áudio não', () => {
  assert.equal(isDocumentName('DOC-20261014-WA0004.pdf'), true);
  assert.equal(isDocumentName('planilha.XLSX'), true);
  assert.equal(isDocumentName('IMG-20261014-WA0001.jpg'), false);
  assert.equal(isDocumentName('AUD-20261014-WA0007.opus'), false);
  assert.equal(isDocumentName('mensagens.json'), false);
});

test('fica com os 10 documentos mais recentes', () => {
  const candidates = Array.from({ length: 12 }, (_, index) =>
    doc({
      fileName: `DOC-202610${String(index + 1).padStart(2, '0')}-WA0001.pdf`,
      sizeBytes: 1000 + index,
      moment: index + 1,
    }),
  );
  const picked = pickRecentDocuments(candidates);
  assert.equal(picked.length, 10);
  assert.equal(picked[0]?.moment, 12);
  assert.equal(picked[9]?.moment, 3);
  assert.equal(picked.some((item) => item.moment === 1), false);
});

test('junta a cópia local com o arquivo que já está no Drive', () => {
  const picked = pickRecentDocuments([
    doc({
      fileName: 'Contrato.pdf',
      sizeBytes: 50,
      moment: 10,
      sourceUri: 'file:///whatsapp/Contrato.pdf',
    }),
    doc({
      fileName: 'Contrato.pdf',
      sizeBytes: 50,
      moment: 99,
      driveId: 'drive-1',
    }),
  ]);
  assert.equal(picked.length, 1);
  assert.equal(picked[0]?.sourceUri, 'file:///whatsapp/Contrato.pdf');
  assert.equal(picked[0]?.driveId, 'drive-1');
  assert.equal(picked[0]?.moment, 10);
});

test('documento só no Drive entra na lista', () => {
  const picked = pickRecentDocuments([
    doc({ fileName: 'IMG-20261014-WA0001.jpg', sizeBytes: 20, moment: 100 }),
    doc({ fileName: 'Nota.pdf', sizeBytes: 20, moment: 50, driveId: 'abc' }),
  ]);
  assert.deepEqual(
    picked.map((item) => item.fileName),
    ['Nota.pdf'],
  );
});
