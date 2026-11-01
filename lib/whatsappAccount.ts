export const WHATSAPP_PACKAGE = 'com.whatsapp';
export const WHATSAPP_BUSINESS_PACKAGE = 'com.whatsapp.w4b';

export type WhatsAppAccountId = typeof WHATSAPP_PACKAGE | typeof WHATSAPP_BUSINESS_PACKAGE;

/** Pacote desconhecido ou vazio conta como WhatsApp pessoal (registros antigos). */
export function normalizeWhatsAppPackage(packageName?: string | null): WhatsAppAccountId {
  return packageName === WHATSAPP_BUSINESS_PACKAGE ? WHATSAPP_BUSINESS_PACKAGE : WHATSAPP_PACKAGE;
}

export function whatsappAccountLabel(packageName?: string | null): string {
  return normalizeWhatsAppPackage(packageName) === WHATSAPP_BUSINESS_PACKAGE
    ? 'WhatsApp Business'
    : 'WhatsApp';
}

export function presentWhatsAppAccounts(packageNames: readonly (string | null | undefined)[]): WhatsAppAccountId[] {
  const seen = new Set<WhatsAppAccountId>();
  for (const name of packageNames) {
    seen.add(normalizeWhatsAppPackage(name));
  }
  const order: WhatsAppAccountId[] = [WHATSAPP_PACKAGE, WHATSAPP_BUSINESS_PACKAGE];
  return order.filter((id): id is WhatsAppAccountId => seen.has(id));
}
