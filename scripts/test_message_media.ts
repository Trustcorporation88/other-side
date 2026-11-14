import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  documentNameFromMessage,
  linkMessagesToMedia,
  mediaKindOfMessage,
  mergeLinks,
  senderLabel,
  type LinkMedia,
  type LinkMessage,
} from '../lib/messageMedia.ts';

const BASE = new Date(2026, 10, 14, 10, 0, 0).getTime();
const MIN = 60 * 1000;

function message(id: string, text: string, minutes: number, extra: Partial<LinkMessage> = {}): LinkMessage {
  return {
    id,
    conversation: extra.conversation ?? 'Ana',
    sender: extra.sender ?? 'Ana',
    message: text,
    receivedAt: BASE + minutes * MIN,
    packageName: extra.packageName ?? 'com.whatsapp',
  };
}

function media(id: string, fileName: string, kind: string, minutes: number, extra: Partial<LinkMedia> = {}): LinkMedia {
  return {
    id,
    fileName,
    kind,
    moment: BASE + minutes * MIN,
    sizeBytes: extra.sizeBytes ?? 1000,
    sourcePackage: extra.sourcePackage ?? 'com.whatsapp',
    origin: extra.origin ?? 'received',
  };
}

test('reconhece foto, áudio e documento pelo texto do aviso', () => {
  assert.equal(mediaKindOfMessage('📷 Foto'), 'image');
  assert.equal(mediaKindOfMessage('📷 olha isso'), 'image');
  assert.equal(mediaKindOfMessage('🎤 Mensagem de voz (0:12)'), 'audio');
  assert.equal(mediaKindOfMessage('🎵 Áudio'), 'audio');
  assert.equal(mediaKindOfMessage('Mensagem de voz (1:05)'), 'audio');
  assert.equal(mediaKindOfMessage('📄 Contrato.pdf'), 'document');
  assert.equal(mediaKindOfMessage('Bia: 📷 Foto'), 'image');
  assert.equal(mediaKindOfMessage('bom dia, manda a foto'), null);
  assert.equal(mediaKindOfMessage('📷 Visualização única'), null);
});

test('lê o nome do documento no aviso', () => {
  assert.equal(documentNameFromMessage('📄 Contrato Final.pdf'), 'Contrato Final.pdf');
  assert.equal(documentNameFromMessage('📄 Relatório.pdf (3 páginas)'), 'Relatório.pdf');
  assert.equal(documentNameFromMessage('📄 Documento'), null);
});

test('liga cada mensagem ao arquivo mais próximo do mesmo tipo', () => {
  const links = linkMessagesToMedia(
    [message('m-foto', '📷 Foto', 0), message('m-audio', '🎤 Mensagem de voz (0:10)', 1, { sender: 'Caio', conversation: 'Caio' })],
    [
      media('img', 'IMG-20261114-WA0001.jpg', 'image', 0.2),
      media('aud', 'PTT-20261114-WA0002.opus', 'audio', 1.1),
      media('img-velha', 'IMG-20261114-WA0000.jpg', 'image', -40),
    ],
  );
  assert.equal(links.mediaByMessage.get('m-foto'), 'img');
  assert.equal(links.mediaByMessage.get('m-audio'), 'aud');
  assert.equal(links.senderByMedia.get('aud')?.sender, 'Caio');
  assert.equal(links.senderByMedia.has('img-velha'), false);
});

test('fotos seguidas de pessoas diferentes ficam na ordem de chegada', () => {
  const links = linkMessagesToMedia(
    [
      message('ana', '📷 Foto', 0, { sender: 'Ana', conversation: 'Ana' }),
      message('bia', '📷 Foto', 1, { sender: 'Bia', conversation: 'Bia' }),
    ],
    [media('primeira', 'IMG-20261114-WA0010.jpg', 'image', 0.9), media('segunda', 'IMG-20261114-WA0011.jpg', 'image', 1.2)],
  );
  assert.equal(links.mediaByMessage.get('ana'), 'primeira');
  assert.equal(links.mediaByMessage.get('bia'), 'segunda');
});

test('não liga arquivo de outra conta, enviado ou fora da janela', () => {
  const links = linkMessagesToMedia(
    [message('m', '📷 Foto', 0)],
    [
      media('business', 'IMG-20261114-WA0001.jpg', 'image', 0.1, { sourcePackage: 'com.whatsapp.w4b' }),
      media('enviada', 'IMG-20261114-WA0002.jpg', 'image', 0.1, { origin: 'sent' }),
      media('tarde', 'IMG-20261114-WA0003.jpg', 'image', 45),
      media('outro-dia', 'IMG-20261110-WA0004.jpg', 'image', 0.2),
    ],
  );
  assert.equal(links.mediaByMessage.has('m'), false);
});

test('documento liga pelo nome mesmo baixado horas depois', () => {
  const links = linkMessagesToMedia(
    [message('doc', '📄 Contrato.pdf', 0), message('outro', '📄 Boleto.pdf', 0.5)],
    [
      media('boleto', 'Boleto.pdf', 'document', 1),
      media('contrato', 'Contrato(1).pdf', 'document', 180),
    ],
  );
  assert.equal(links.mediaByMessage.get('doc'), 'contrato');
  assert.equal(links.mediaByMessage.get('outro'), 'boleto');
});

test('fotos repetidas do mesmo contato herdam o remetente da mensagem', () => {
  const links = linkMessagesToMedia(
    [message('ana', '📷 Foto', 0)],
    [
      media('f1', 'IMG-20261114-WA0001.jpg', 'image', 0.1),
      media('f2', 'IMG-20261114-WA0002.jpg', 'image', 0.3),
      media('longe', 'IMG-20261114-WA0003.jpg', 'image', 20),
    ],
  );
  assert.equal(links.mediaByMessage.get('ana'), 'f1');
  assert.equal(links.senderByMedia.get('f2')?.sender, 'Ana');
  assert.equal(links.senderByMedia.get('f2')?.exact, false);
  assert.equal(links.senderByMedia.has('longe'), false);
});

test('ligação guardada sobrevive à saída da mensagem e da mídia do aparelho', () => {
  const first = mergeLinks(
    [message('m', '🎤 Mensagem de voz (0:03)', 0, { sender: 'Rui', conversation: 'Obra' })],
    [media('a', 'PTT-20261114-WA0001.opus', 'audio', 0.1)],
    { mediaByMessage: {}, media: {} },
  );
  assert.equal(first.stored.mediaByMessage.m, 'a');

  const later = mergeLinks([], [], first.stored);
  assert.equal(later.mediaByMessage.get('m'), 'a');
  assert.equal(later.senderByMedia.get('a')?.sender, 'Rui');
  assert.equal(later.mediaById.get('a')?.fileName, 'PTT-20261114-WA0001.opus');
});

test('rótulo do remetente inclui o grupo só quando difere', () => {
  assert.equal(senderLabel({ sender: 'Ana', conversation: 'Ana' }), 'Ana');
  assert.equal(senderLabel({ sender: 'Ana', conversation: 'Família' }), 'Ana · Família');
});
