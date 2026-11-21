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

  @Test
  fun `avisos de mensagem apagada em horarios diferentes nao sao a mesma copia`() {
    val first = NotificationFingerprint.dedupKey(
      "com.whatsapp.w4b",
      "Cliente",
      "Ana",
      "Mensagem apagada",
      1_000,
    )
    val later = NotificationFingerprint.dedupKey(
      "com.whatsapp.w4b",
      "Cliente",
      "Ana",
      "Mensagem apagada",
      2_000,
    )
    val replay = NotificationFingerprint.dedupKey(
      "com.whatsapp.w4b",
      "Cliente",
      "Ana",
      "  Mensagem   apagada ",
      1_000,
    )

    assertNotEquals(first, later)
    assertEquals(first, replay)
  }

  @Test
  fun `texto real igual continua a ser tratado como copia mesmo com horario diferente`() {
    val morning = NotificationFingerprint.dedupKey("com.whatsapp", "Cliente", "Ana", "bom dia", 1)
    val later = NotificationFingerprint.dedupKey("com.whatsapp", "Cliente", "Ana", "Bom  dia", 99)

    assertEquals(morning, later)
  }
}
