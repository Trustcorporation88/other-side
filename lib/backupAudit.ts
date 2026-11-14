export type AuditCategory = 'audio' | 'image' | 'document' | 'video' | 'gallery';

export type AuditEntry = {
  category: AuditCategory;
  monthKey: string;
  onDrive: boolean;
};

export type MonthGap = { monthKey: string; missing: number };

export type CategoryAudit = {
  category: AuditCategory;
  total: number;
  onDrive: number;
  missing: number;
  /** Meses com arquivo faltando, do mais antigo para o mais novo. */
  gaps: MonthGap[];
};

export const AUDIT_ORDER: readonly AuditCategory[] = ['audio', 'image', 'document', 'video', 'gallery'];

export const AUDIT_LABEL: Record<AuditCategory, string> = {
  audio: 'Áudios do WhatsApp',
  image: 'Fotos do WhatsApp',
  document: 'Documentos do WhatsApp',
  video: 'Vídeos do WhatsApp',
  gallery: 'Galeria (câmera)',
};

export function categoryOfKind(kind: string | undefined): AuditCategory {
  if (kind === 'image' || kind === 'document' || kind === 'video') return kind;
  return 'audio';
}

export function summarizeAudit(entries: readonly AuditEntry[]): CategoryAudit[] {
  const byCategory = new Map<AuditCategory, { total: number; onDrive: number; gaps: Map<string, number> }>();
  for (const entry of entries) {
    const bucket = byCategory.get(entry.category) ?? { total: 0, onDrive: 0, gaps: new Map() };
    bucket.total += 1;
    if (entry.onDrive) bucket.onDrive += 1;
    else bucket.gaps.set(entry.monthKey, (bucket.gaps.get(entry.monthKey) ?? 0) + 1);
    byCategory.set(entry.category, bucket);
  }
  return AUDIT_ORDER.filter((category) => byCategory.has(category)).map((category) => {
    const bucket = byCategory.get(category)!;
    return {
      category,
      total: bucket.total,
      onDrive: bucket.onDrive,
      missing: bucket.total - bucket.onDrive,
      gaps: [...bucket.gaps.entries()]
        .map(([monthKey, missing]) => ({ monthKey, missing }))
        .sort((left, right) => (left.monthKey < right.monthKey ? -1 : left.monthKey > right.monthKey ? 1 : 0)),
    };
  });
}

/** 100% só quando não falta nenhum arquivo: arredondar 99,6% para cima esconderia a falta. */
export function percentOnDrive(onDrive: number, total: number): number {
  if (total <= 0) return 100;
  if (onDrive >= total) return 100;
  return Math.min(99, Math.floor((onDrive / total) * 100));
}
