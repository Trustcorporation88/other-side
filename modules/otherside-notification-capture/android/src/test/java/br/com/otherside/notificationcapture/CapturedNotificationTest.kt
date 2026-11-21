package br.com.otherside.notificationcapture

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.runner.RunWith
import org.junit.Test
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
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

  @Test
  fun `mensagem apagada conserva o texto e a marca`() {
    val original = CapturedNotification(
      id = "id-2",
      conversation = "Cliente",
      sender = "Ana",
      message = "texto original",
      receivedAt = 456L,
      packageName = "com.whatsapp.w4b",
      isDemo = false,
      deleted = true,
      textPreserved = true,
    )

    val restored = CapturedNotification.fromJson(JSONObject(original.toJson().toString()))

    assertEquals(original, restored)
    assertEquals(true, restored.deleted)
    assertEquals(true, restored.textPreserved)
  }
}
