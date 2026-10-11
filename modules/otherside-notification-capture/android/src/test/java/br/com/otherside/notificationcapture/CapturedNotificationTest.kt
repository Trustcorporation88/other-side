package br.com.otherside.notificationcapture

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class CapturedNotificationTest {
  @Test
  fun `serializa e recupera registro preservado`() {
    val original = CapturedNotification(
      id = "id-1",
      conversation = "Conversa",
      sender = "Pessoa",
      message = "Mensagem preservada",
      receivedAt = 123L,
      packageName = "com.whatsapp",
      isDemo = false,
    )

    val restored = CapturedNotification.fromJson(JSONObject(original.toJson().toString()))

    assertEquals(original, restored)
  }
}
