package br.com.otherside.notificationcapture

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioAttachmentDiagnosticsTest {
  @Test
  fun `reconhece os rotulos de audio e mensagem de voz`() {
    assertTrue(AudioAttachmentDiagnostics.mentionsAudio("Áudio (0:08)"))
    assertTrue(AudioAttachmentDiagnostics.mentionsAudio("Mensagem de voz"))
    assertTrue(AudioAttachmentDiagnostics.mentionsAudio("Voice message"))
  }

  @Test
  fun `nao marca texto comum como audio`() {
    assertFalse(AudioAttachmentDiagnostics.mentionsAudio("Oi, tudo bem?"))
  }
}
