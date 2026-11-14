/**
 * Regras do cache de mídia baixada do Drive, sem dependências do Expo (testadas no Node).
 */

/**
 * Cópia no cache só vale se estiver inteira. Um download interrompido deixava um arquivo
 * cortado com o nome final, e a foto aparecia em branco para sempre.
 */
export function isCompleteCopy(actualSize: number | null | undefined, expectedSize: number): boolean {
  if (actualSize == null || actualSize <= 0) return false;
  // Menor que o original é download cortado; maior não acontece com cópia cortada.
  if (expectedSize > 0 && actualSize < expectedSize) return false;
  return true;
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Um só download por arquivo. Dois toques seguidos na mesma foto começavam dois downloads no
 * mesmo destino, e o segundo devolvia o arquivo ainda pela metade.
 */
export function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const task = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, task);
  return task;
}
