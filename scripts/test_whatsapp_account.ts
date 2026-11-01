import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeWhatsAppPackage,
  presentWhatsAppAccounts,
  whatsappAccountLabel,
  WHATSAPP_BUSINESS_PACKAGE,
  WHATSAPP_PACKAGE,
} from '../lib/whatsappAccount.ts';

test('pacote vazio ou pessoal vira WhatsApp', () => {
  assert.equal(normalizeWhatsAppPackage(undefined), WHATSAPP_PACKAGE);
  assert.equal(normalizeWhatsAppPackage(''), WHATSAPP_PACKAGE);
  assert.equal(normalizeWhatsAppPackage('com.whatsapp'), WHATSAPP_PACKAGE);
  assert.equal(whatsappAccountLabel('com.whatsapp'), 'WhatsApp');
});

test('WhatsApp Business fica separado', () => {
  assert.equal(normalizeWhatsAppPackage(WHATSAPP_BUSINESS_PACKAGE), WHATSAPP_BUSINESS_PACKAGE);
  assert.equal(whatsappAccountLabel(WHATSAPP_BUSINESS_PACKAGE), 'WhatsApp Business');
});

test('lista só as contas que realmente têm mensagem', () => {
  assert.deepEqual(presentWhatsAppAccounts(['com.whatsapp', '', 'com.whatsapp']), [WHATSAPP_PACKAGE]);
  assert.deepEqual(presentWhatsAppAccounts(['com.whatsapp.w4b', 'com.whatsapp']), [
    WHATSAPP_PACKAGE,
    WHATSAPP_BUSINESS_PACKAGE,
  ]);
});
