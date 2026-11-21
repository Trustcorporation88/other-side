package br.com.otherside.notificationcapture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationContentTest {
  @Test
  fun `a lista de mensagens vale mais do que a previa ja apagada`() {
    val notices = NotificationContent.parse(
      postTime = 50,
      title = "Ana",
      text = "Mensagem apagada",
      bigText = "Mensagem apagada",
      lines = emptyList(),
      conversationTitle = "Cliente",
      messaging = listOf(
        MessagingLine("Combinado, eu envio.", 1_000, "Ana"),
        MessagingLine("Mensagem apagada", 2_000, "Ana"),
      ),
    )

    assertEquals(listOf("Combinado, eu envio.", "Mensagem apagada"), notices.map { it.message })
    assertEquals(listOf(1_000L, 2_000L), notices.map { it.receivedAt })
    assertTrue(notices.all { it.matchDeletionByTime })
    assertEquals("Cliente", notices[0].conversation)
    assertEquals("Ana", notices[0].sender)
  }

  @Test
  fun `sem lista usa a previa e nao casa o apagado pelo horario da notificacao`() {
    val notices = NotificationContent.parse(
      postTime = 80,
      title = "Ana",
      text = "",
      bigText = "texto da previa",
      lines = emptyList(),
      conversationTitle = "",
      messaging = emptyList(),
    )

    assertEquals(1, notices.size)
    assertEquals("texto da previa", notices[0].message)
    assertEquals(80L, notices[0].receivedAt)
    assertFalse(notices[0].matchDeletionByTime)
    assertTrue(notices[0].singleFallback)
  }

  @Test
  fun `resumo de varias conversas continua de fora`() {
    val notices = NotificationContent.parse(
      postTime = 1,
      title = "WhatsApp",
      text = "2 novas mensagens",
      bigText = "",
      lines = emptyList(),
      conversationTitle = "",
      messaging = emptyList(),
    )

    assertTrue(notices.isEmpty())
  }

  @Test
  fun `o id muda quando o texto vira aviso, o horario da mensagem nao`() {
    val real = ParsedNotice(
      conversation = "Cliente",
      sender = "Ana",
      message = "texto original",
      receivedAt = 2_000,
      matchDeletionByTime = true,
      singleFallback = false,
    )
    val deleted = real.copy(message = "This message was deleted")

    assertNotEquals(
      NotificationContent.idFor("com.whatsapp.w4b", "chave", real),
      NotificationContent.idFor("com.whatsapp.w4b", "chave", deleted),
    )
    assertEquals(real.receivedAt, deleted.receivedAt)
  }
}
