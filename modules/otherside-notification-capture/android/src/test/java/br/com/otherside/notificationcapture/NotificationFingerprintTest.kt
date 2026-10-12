package br.com.otherside.notificationcapture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationFingerprintTest {
  @Test
  fun `mesma chave de notificacao e mesmo conteudo produzem o mesmo id`() {
    val firstDelivery = NotificationFingerprint.create(
      packageName = "com.whatsapp",
      notificationKey = "0|com.whatsapp|42|conversation-A",
      conversation = "Conversa",
      sender = "Ana",
      message = "Oi, tudo bem?",
    )
    val redelivery = NotificationFingerprint.create(
      packageName = "com.whatsapp",
      notificationKey = "0|com.whatsapp|42|conversation-A",
      conversation = "Conversa",
      sender = "Ana",
      message = " Oi,\n tudo bem? ",
    )

    assertEquals(firstDelivery, redelivery)
  }

  @Test
  fun `notificacoes diferentes continuam sendo registros independentes`() {
    val original = NotificationFingerprint.create("com.whatsapp", "notification-1", "Conversa", "Ana", "ok")
    val otherNotification = NotificationFingerprint.create("com.whatsapp", "notification-2", "Conversa", "Ana", "ok")
    val newMessage = NotificationFingerprint.create("com.whatsapp", "notification-1", "Conversa", "Ana", "tudo bem")

    assertNotEquals(original, otherNotification)
    assertNotEquals(original, newMessage)
  }

  @Test
  fun `conteudo identico normalizado e igual para limpar duplicatas antigas`() {
    val firstCopy = NotificationFingerprint.content("com.whatsapp", "Grupo", "Ana", "Foto enviada")
    val repeatedCopy = NotificationFingerprint.content("com.whatsapp", " Grupo ", "ANA", "Foto  enviada\n")

    assertEquals(firstCopy, repeatedCopy)
    assertTrue(firstCopy.matches(Regex("[0-9a-f]{64}")))
  }
}
