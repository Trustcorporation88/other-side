package br.com.otherside.notificationcapture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WhatsAppAudioPreserverTest {
  @Test
  fun `reconhece extensoes de audio do whatsapp`() {
    assertTrue(WhatsAppAudioPreserver.isAudio("PTT-20251012-WA0001.opus"))
    assertTrue(WhatsAppAudioPreserver.isAudio("AUD-20251012-WA0002.m4a"))
    assertTrue(WhatsAppAudioPreserver.isAudio("GRAVACAO.OGG"))
  }

  @Test
  fun `ignora arquivos que nao sao audio`() {
    assertFalse(WhatsAppAudioPreserver.isAudio("IMG-20251012-WA0003.jpg"))
    assertFalse(WhatsAppAudioPreserver.isAudio("documento.pdf"))
    assertFalse(WhatsAppAudioPreserver.isAudio("semextensao"))
  }

  @Test
  fun `distingue whatsapp pessoal do business pelo caminho`() {
    assertEquals(
      "com.whatsapp",
      WhatsAppAudioPreserver.packageOf("/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes/202510/A.opus"),
    )
    assertEquals(
      "com.whatsapp.w4b",
      WhatsAppAudioPreserver.packageOf("/storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Voice Notes/202510/A.opus"),
    )
  }

  @Test
  fun `classifica enviados e recebidos pela subpasta`() {
    assertEquals(
      PreservedAudio.ORIGIN_SENT,
      WhatsAppAudioPreserver.originOf("/storage/emulated/0/WhatsApp/Media/WhatsApp Voice Notes/Sent/A.opus"),
    )
    assertEquals(
      PreservedAudio.ORIGIN_RECEIVED,
      WhatsAppAudioPreserver.originOf("/storage/emulated/0/WhatsApp/Media/WhatsApp Voice Notes/202510/A.opus"),
    )
  }
}
