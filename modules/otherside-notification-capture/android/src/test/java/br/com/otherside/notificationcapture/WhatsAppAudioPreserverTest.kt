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

  @Test
  fun `reconhece imagens e classifica o tipo da midia`() {
    assertTrue(WhatsAppAudioPreserver.isImage("IMG-20251012-WA0003.jpg"))
    assertTrue(WhatsAppAudioPreserver.isImage("FOTO.PNG"))
    assertTrue(WhatsAppAudioPreserver.isImage("sticker.webp"))
    assertFalse(WhatsAppAudioPreserver.isImage("PTT-20251012-WA0001.opus"))

    assertTrue(WhatsAppAudioPreserver.isMedia("IMG-20251012-WA0003.jpg"))
    assertTrue(WhatsAppAudioPreserver.isMedia("PTT-20251012-WA0001.opus"))
    assertTrue(WhatsAppAudioPreserver.isMedia("documento.pdf"))
    assertFalse(WhatsAppAudioPreserver.isMedia("VID-20251012-WA0005.mp4"))

    assertEquals(PreservedAudio.KIND_IMAGE, WhatsAppAudioPreserver.kindOf("IMG-20251012-WA0003.jpg"))
    assertEquals(PreservedAudio.KIND_AUDIO, WhatsAppAudioPreserver.kindOf("PTT-20251012-WA0001.opus"))
  }

  @Test
  fun `reconhece documentos no observador e no backup`() {
    assertTrue(WhatsAppAudioPreserver.isDocument("DOC-20251012-WA0004.pdf"))
    assertTrue(WhatsAppAudioPreserver.isDocument("planilha.XLSX"))
    assertFalse(WhatsAppAudioPreserver.isDocument("IMG-20251012-WA0003.jpg"))

    assertTrue(WhatsAppAudioPreserver.isMedia("DOC-20251012-WA0004.pdf"))
    assertTrue(WhatsAppAudioPreserver.isAnyMedia("DOC-20251012-WA0004.pdf"))
    assertTrue(WhatsAppAudioPreserver.isAnyMedia("PTT-20251012-WA0001.opus"))

    // Vídeo fica de fora de propósito.
    assertFalse(WhatsAppAudioPreserver.isAnyMedia("VID-20251012-WA0005.mp4"))

    assertEquals(PreservedAudio.KIND_DOCUMENT, WhatsAppAudioPreserver.kindOf("DOC-20251012-WA0004.pdf"))
  }

  @Test
  fun `a mesma nota de voz continua a mesma se so a data de modificacao mudar`() {
    val path = "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes/202610/AUD-20261014-WA0007.opus"
    val legacy = "$path|398298|1728000000000"
    assertTrue(WhatsAppAudioPreserver.sameSourceFile(legacy, path, 398298))
    assertTrue(WhatsAppAudioPreserver.sameSourceFile("$path|398298", path, 398298))
    assertFalse(WhatsAppAudioPreserver.sameSourceFile(legacy, path, 10))
    assertFalse(WhatsAppAudioPreserver.sameSourceFile(legacy, "$path.outro", 398298))
  }
}
