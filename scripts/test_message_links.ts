import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitMessageLinks, type MessageSegment } from '../lib/messageLinks.ts';

function links(text: string) {
  return splitMessageLinks(text)
    .filter((segment): segment is Extract<MessageSegment, { type: 'link' }> => segment.type === 'link')
    .map(({ text, href, kind }) => ({ text, href, kind }));
}

function hrefs(text: string) {
  return links(text).map((link) => link.href);
}

test('plain text stays a single text segment', () => {
  assert.deepEqual(splitMessageLinks('Bom dia, tudo bem?'), [{ type: 'text', text: 'Bom dia, tudo bem?' }]);
  assert.deepEqual(splitMessageLinks(''), []);
});

test('segments rebuild the original message exactly', () => {
  const message = 'Veja https://youtu.be/abc?t=10, e www.google.com. Ou mande para ana@gmail.com!';
  const rebuilt = splitMessageLinks(message).map((segment) => segment.text).join('');
  assert.equal(rebuilt, message);
});

test('http and https URLs keep their scheme', () => {
  assert.deepEqual(links('Olha isso https://www.youtube.com/watch?v=dQw4w9WgXcQ'), [
    { text: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'url' },
  ]);
  assert.deepEqual(hrefs('HTTP://Example.com/a'), ['HTTP://Example.com/a']);
  assert.deepEqual(hrefs('https://chat.whatsapp.com/AbC123'), ['https://chat.whatsapp.com/AbC123']);
});

test('www and bare domains get https://', () => {
  assert.deepEqual(hrefs('acesse www.gov.br/receita'), ['https://www.gov.br/receita']);
  assert.deepEqual(hrefs('wa.me/5511912345678'), ['https://wa.me/5511912345678']);
  assert.deepEqual(hrefs('youtu.be/xyz e bit.ly/abc'), ['https://youtu.be/xyz', 'https://bit.ly/abc']);
  assert.deepEqual(hrefs('loja.com.br'), ['https://loja.com.br']);
  assert.deepEqual(hrefs('instagram.com/perfil?igsh=1'), ['https://instagram.com/perfil?igsh=1']);
});

test('trailing punctuation and unbalanced brackets are not part of the link', () => {
  assert.deepEqual(hrefs('Veja https://site.com/a.'), ['https://site.com/a']);
  assert.deepEqual(hrefs('(veja https://site.com/a)'), ['https://site.com/a']);
  assert.deepEqual(hrefs('link: www.site.com/x?y=1!'), ['https://www.site.com/x?y=1']);
  assert.deepEqual(hrefs('https://pt.wikipedia.org/wiki/Brasil_(desambiguação)'), [
    'https://pt.wikipedia.org/wiki/Brasil_(desambiguação)',
  ]);
  assert.deepEqual(hrefs('"https://site.com"'), ['https://site.com']);
});

test('file names, numbers and glued words are not links', () => {
  assert.deepEqual(links('📄 relatorio_final.pdf'), []);
  assert.deepEqual(links('foto.jpg'), []);
  assert.deepEqual(links('Custa R$ 10.50 ou 1.000,00'), []);
  assert.deepEqual(links('fim.de semana'), []);
  assert.deepEqual(links('versão 1.2.3'), []);
  assert.deepEqual(links('https://'), []);
  assert.deepEqual(links('http://semponto'), []);
});

test('emails become mailto links and are not split into a domain link', () => {
  assert.deepEqual(links('Escreva para contato.loja+1@empresa.com.br'), [
    { text: 'contato.loja+1@empresa.com.br', href: 'mailto:contato.loja+1@empresa.com.br', kind: 'email' },
  ]);
  assert.deepEqual(hrefs('@empresa.com'), []);
});

test('international phone numbers become tel links', () => {
  assert.deepEqual(links('Liga +55 11 91234-5678 amanhã'), [
    { text: '+55 11 91234-5678', href: 'tel:+5511912345678', kind: 'phone' },
  ]);
  assert.deepEqual(hrefs('+1 (415) 555-0100'), ['tel:+14155550100']);
  assert.deepEqual(links('+5 pontos'), []);
  assert.deepEqual(links('2+2=4'), []);
});

test('a domain inside a longer word is not linked', () => {
  assert.deepEqual(links('arquivo_site.com'), []);
  assert.deepEqual(links('xhttps://site.com'), []);
});

test('multiple links keep the text between them', () => {
  assert.deepEqual(splitMessageLinks('a https://x.com b www.y.org c'), [
    { type: 'text', text: 'a ' },
    { type: 'link', text: 'https://x.com', href: 'https://x.com', kind: 'url' },
    { type: 'text', text: ' b ' },
    { type: 'link', text: 'www.y.org', href: 'https://www.y.org', kind: 'url' },
    { type: 'text', text: ' c' },
  ]);
});
