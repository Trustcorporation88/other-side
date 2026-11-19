import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isCompleteDownload,
  messageRestoreAction,
  remoteHistoryIncorporated,
} from '../lib/uploadIdentity.ts';

test('sem mensagens.json no Drive o aparelho pode enviar o histórico local', () => {
  assert.equal(messageRestoreAction(null, { size: 20, md5: 'abc' }), 'absent');
  assert.equal(remoteHistoryIncorporated('absent', 'failed'), true);
});

test('arquivo igual ao snapshot local não é baixado de novo', () => {
  const remote = { size: 40, md5: 'abc' };
  assert.equal(messageRestoreAction(remote, { size: 40, md5: 'ABC' }), 'current');
  assert.equal(messageRestoreAction(remote, { size: 40, md5: null }), 'current');
  assert.equal(remoteHistoryIncorporated('current', 'failed'), true);
});

test('instalação nova ou arquivo diferente baixa o mensagens.json', () => {
  const remote = { size: 40, md5: 'abc' };
  assert.equal(messageRestoreAction(remote, null), 'download');
  assert.equal(messageRestoreAction(remote, { size: 12, md5: 'zzz' }), 'download');
  assert.equal(messageRestoreAction({ size: 10, md5: null }, { size: 12, md5: null }), 'download');
});

test('download incompleto não conta como o arquivo do Drive', () => {
  assert.equal(isCompleteDownload(10, 12), false);
  assert.equal(isCompleteDownload(12, 12), true);
  assert.equal(isCompleteDownload(0, 0), true);
  assert.equal(isCompleteDownload(4, null), true);
  assert.equal(isCompleteDownload(Number.NaN, 4), false);
});

test('falha ao baixar não regrava o mensagens.json', () => {
  assert.equal(remoteHistoryIncorporated('download', 'failed'), false);
});

test('download que entrou no histórico libera a atualização do arquivo', () => {
  assert.equal(remoteHistoryIncorporated('download', 'restored'), true);
  assert.equal(remoteHistoryIncorporated('download', 'unchanged'), true);
});

test('APK sem a função nativa não trava o envio antigo', () => {
  assert.equal(remoteHistoryIncorporated('download', 'unsupported'), true);
});
