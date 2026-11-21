package br.com.otherside.notificationcapture

import android.app.Notification
import android.os.Bundle
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NotificationMessagingLinesTest {
  @Test
  fun `le o texto, o horario e o remetente de cada mensagem`() {
    val first = Bundle().apply {
      putCharSequence("text", "Combinado, eu envio.")
      putLong("time", 1_000L)
      putCharSequence("sender", "Ana")
    }
    val deleted = Bundle().apply {
      putCharSequence("text", "Mensagem apagada")
      putLong("time", 2_000L)
      putCharSequence("sender", "Ana")
    }
    val extras = Bundle().apply {
      putCharSequence(Notification.EXTRA_TITLE, "Ana")
      putCharSequence(Notification.EXTRA_TEXT, "Mensagem apagada")
      putParcelableArray(Notification.EXTRA_MESSAGES, arrayOf<android.os.Parcelable>(first, deleted))
    }

    val lines = NotificationContent.messagingLines(extras)

    assertEquals(2, lines.size)
    assertEquals("Combinado, eu envio.", lines[0].text)
    assertEquals(1_000L, lines[0].time)
    assertEquals("Ana", lines[0].sender)
    assertEquals("Mensagem apagada", lines[1].text)
    assertEquals(2_000L, lines[1].time)
  }
}
