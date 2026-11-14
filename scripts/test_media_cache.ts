import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCompleteCopy, singleFlight } from '../lib/mediaCache.ts';

test('download cortado no cache não conta como foto pronta', () => {
  assert.equal(isCompleteCopy(0, 2_000_000), false);
  assert.equal(isCompleteCopy(null, 2_000_000), false);
  assert.equal(isCompleteCopy(512_000, 2_000_000), false);
  assert.equal(isCompleteCopy(2_000_000, 2_000_000), true);
});

test('tamanho desconhecido aceita qualquer cópia não vazia', () => {
  assert.equal(isCompleteCopy(10, 0), true);
  assert.equal(isCompleteCopy(0, 0), false);
});

test('dois toques na mesma foto fazem um só download', async () => {
  let downloads = 0;
  let finish: (value: string) => void = () => undefined;
  const run = () => {
    downloads += 1;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  };
  const first = singleFlight('media:a', run);
  const second = singleFlight('media:a', run);
  finish('file:///cache/a.jpg');
  assert.equal(await first, 'file:///cache/a.jpg');
  assert.equal(await second, 'file:///cache/a.jpg');
  assert.equal(downloads, 1);

  const again = singleFlight('media:a', async () => {
    downloads += 1;
    return 'file:///cache/a.jpg';
  });
  assert.equal(await again, 'file:///cache/a.jpg');
  assert.equal(downloads, 2);
});
