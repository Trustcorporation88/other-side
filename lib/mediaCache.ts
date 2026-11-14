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

export type DriveFailure = 'not_uploaded' | 'drive_auth' | 'offline' | 'drive_error';

/** Motivo legível de um download que falhou, pela mensagem de erro do Android. */
export function classifyDownloadError(error: unknown): { reason: DriveFailure; detail: string } {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const http = message.match(/HTTP\s*(\d{3})|status:?\s*(\d{3})/i);
  if (http) {
    const code = http[1] ?? http[2];
    if (code === '401' || code === '403') return { reason: 'drive_auth', detail: `HTTP ${code}` };
    return { reason: 'drive_error', detail: `HTTP ${code}` };
  }
  if (/resolve host|timeout|timed out|failed to connect|unreachable|network|connection|socket|offline/i.test(message)) {
    return { reason: 'offline', detail: '' };
  }
  return { reason: 'drive_error', detail: message.slice(0, 80) };
}
