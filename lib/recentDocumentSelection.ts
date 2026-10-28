export const RECENT_DOCUMENT_LIMIT = 10;

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'rtf',
  'odt',
  'zip',
]);

export type DocumentCandidate = {
  key: string;
  fileName: string;
  sizeBytes: number;
  /** Quando o documento existiu por último: data do arquivo, ou a data em que subiu ao Drive. */
  moment: number;
  sourceUri?: string;
  driveId?: string;
};

export function isDocumentName(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return DOCUMENT_EXTENSIONS.has(ext);
}

export function documentKey(fileName: string, sizeBytes: number): string {
  return `${fileName}|${sizeBytes}`;
}

/** Data YYYYMMDD no nome do WhatsApp, em milissegundos UTC. 0 se não houver. */
export function dateFromDocumentName(fileName: string): number {
  const match = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return 0;
  return Date.UTC(year, month - 1, day);
}

function mergeCandidate(current: DocumentCandidate, next: DocumentCandidate): DocumentCandidate {
  const sourceUri = next.sourceUri ?? current.sourceUri;
  const driveId = next.driveId ?? current.driveId;
  // A cópia ainda no celular manda na ordem. Sem ela, fica o evento mais recente (em geral o envio ao Drive).
  const moment = next.sourceUri
    ? next.moment
    : current.sourceUri
      ? current.moment
      : Math.max(current.moment, next.moment);
  return { ...current, sourceUri, driveId, moment };
}

/** Os documentos mais recentes, sem repetir o mesmo nome e tamanho. */
export function pickRecentDocuments(
  candidates: readonly DocumentCandidate[],
  limit = RECENT_DOCUMENT_LIMIT,
): DocumentCandidate[] {
  const byKey = new Map<string, DocumentCandidate>();
  for (const candidate of candidates) {
    if (!isDocumentName(candidate.fileName) || candidate.sizeBytes <= 0) continue;
    const current = byKey.get(candidate.key);
    byKey.set(candidate.key, current ? mergeCandidate(current, candidate) : candidate);
  }
  return [...byKey.values()]
    .sort((left, right) => right.moment - left.moment || left.fileName.localeCompare(right.fileName))
    .slice(0, limit);
}
