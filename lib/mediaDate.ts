/**
 * Data no nome do WhatsApp (IMG-20250915-WA0012.jpg, AUD-20261014-WA0007.opus).
 * Só aceita 20xx com mês/dia válidos. Números soltos (NF 72000315.pdf) não viram pasta.
 */
const WHATSAPP_DATE = /(?:^|[-_])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[-_.]|$)/;

export function dateFromName(fileName: string): Date | null {
  const match = fileName.match(WHATSAPP_DATE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Mês no fuso do aparelho. A foto das 22h no Brasil não pode cair no mês seguinte. */
export function monthKeyLocal(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
