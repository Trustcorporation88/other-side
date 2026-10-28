import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chooseFullestFolder,
  duplicateMonthFolderLosers,
  findExistingUpload,
  findMessagesFile,
  indexByNameAndSize,
  ledgerKey,
  messagesNeedUpdate,
  shouldMoveIntoMonthFolder,
  type RemoteFile,
} from '../lib/uploadIdentity.ts';

function file(partial: Partial<RemoteFile> & Pick<RemoteFile, 'id' | 'name'>): RemoteFile {
  return {
    appId: undefined,
    parents: [],
    isFolder: false,
    size: null,
    md5: null,
    createdTime: null,
    ...partial,
  };
}

test('a chave de envio ignora a data de modificação', () => {
  assert.equal(ledgerKey('AUD-20261014-WA0007.opus', 398298), 'ns:AUD-20261014-WA0007.opus:398298');
  assert.equal(
    ledgerKey('AUD-20261014-WA0007.opus', 398298),
    ledgerKey('AUD-20261014-WA0007.opus', 398298),
  );
});

test('o mesmo nome e tamanho já no Drive não é um arquivo novo', () => {
  const files = [
    file({
      id: 'first',
      name: 'AUD-20261014-WA0007.opus',
      size: 398298,
      parents: ['month-2026-10'],
      appId: 'hash-mtime-a',
    }),
    file({
      id: 'second',
      name: 'AUD-20261014-WA0007.opus',
      size: 398298,
      parents: ['month-2026-10'],
      appId: 'hash-mtime-b',
    }),
  ];
  const found = findExistingUpload(indexByNameAndSize(files), 'AUD-20261014-WA0007.opus', 398298, 'month-2026-10');
  assert.equal(found?.id, 'first');
});

test('tamanho diferente não é a mesma cópia', () => {
  const files = [file({ id: 'partial', name: 'AUD-20261014-WA0007.opus', size: 100, parents: ['month'] })];
  const found = findExistingUpload(indexByNameAndSize(files), 'AUD-20261014-WA0007.opus', 398298, 'month');
  assert.equal(found, null);
});

test('prefere o arquivo que já está na pasta de destino', () => {
  const files = [
    file({ id: 'root-copy', name: 'IMG.jpg', size: 20, parents: ['root'] }),
    file({ id: 'fotos-copy', name: 'IMG.jpg', size: 20, parents: ['fotos'] }),
  ];
  const found = findExistingUpload(indexByNameAndSize(files), 'IMG.jpg', 20, 'fotos');
  assert.equal(found?.id, 'fotos-copy');
});

test('escolhe a pasta do mês que já tem arquivos', () => {
  const chosen = chooseFullestFolder(
    [
      { id: 'empty-newer', createdTime: '2026-10-15T00:00:00.000Z' },
      { id: 'full-older', createdTime: '2026-10-01T00:00:00.000Z' },
    ],
    new Map([
      ['empty-newer', 0],
      ['full-older', 12],
    ]),
  );
  assert.equal(chosen?.id, 'full-older');
});

test('empate de pastas fica na mais antiga', () => {
  const chosen = chooseFullestFolder(
    [
      { id: 'b', createdTime: '2026-10-02T00:00:00.000Z' },
      { id: 'a', createdTime: '2026-10-01T00:00:00.000Z' },
    ],
    new Map(),
  );
  assert.equal(chosen?.id, 'a');
});

test('não move arquivo que já está no mês nem o que está em Fotos', () => {
  const months = new Set(['month-2026-10', 'month-dup']);
  const fotos = new Set(['fotos']);
  assert.equal(
    shouldMoveIntoMonthFolder({ isFolder: false, parents: ['root'] }, 'root', months, fotos),
    true,
  );
  assert.equal(
    shouldMoveIntoMonthFolder({ isFolder: false, parents: ['month-dup'] }, 'root', months, fotos),
    false,
  );
  assert.equal(
    shouldMoveIntoMonthFolder({ isFolder: false, parents: ['fotos'] }, 'root', months, fotos),
    false,
  );
  assert.equal(
    shouldMoveIntoMonthFolder({ isFolder: false, parents: [] }, 'root', months, fotos),
    false,
  );
});

test('mensagens.json igual não precisa ser regravado', () => {
  assert.equal(messagesNeedUpdate({ size: 10, md5: 'abc' }, { size: 10, md5: 'ABC' }), false);
  assert.equal(messagesNeedUpdate({ size: 10, md5: 'abc' }, { size: 11, md5: 'zzz' }), true);
  assert.equal(messagesNeedUpdate({ size: 10, md5: null }, { size: 10, md5: null }), false);
  assert.equal(messagesNeedUpdate({ size: 10, md5: null }, null), true);
});

test('pastas de mês repetidas: a mais vazia perde para a mais cheia', () => {
  const files = [
    file({ id: 'frozen', name: '2026-10', isFolder: true, parents: ['whatsapp'], createdTime: '2026-10-20T00:00:00.000Z' }),
    file({ id: 'live', name: '2026-10', isFolder: true, parents: ['whatsapp'], createdTime: '2026-10-13T00:00:00.000Z' }),
    file({ id: 'other', name: '2026-09', isFolder: true, parents: ['whatsapp'] }),
  ];
  const losers = duplicateMonthFolderLosers(files, 'whatsapp', { '2026-10': 'live', '2026-09': 'other' });
  assert.equal(losers.get('frozen'), 'live');
  assert.equal(losers.has('live'), false);
  assert.equal(losers.has('other'), false);
});

test('mensagens.json fica no arquivo já registrado', () => {
  const files = [
    file({ id: 'old', name: 'mensagens.json', size: 10, parents: ['root'], createdTime: '2026-02-01T00:00:00.000Z' }),
    file({ id: 'new', name: 'mensagens.json', size: 12, parents: ['root'], createdTime: '2026-10-15T00:00:00.000Z' }),
  ];
  assert.equal(findMessagesFile(files, 'root', 'new')?.id, 'new');
  assert.equal(findMessagesFile(files, 'root')?.id, 'old');
});
