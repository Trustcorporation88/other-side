package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationAccountCapTest {
  @Test
  fun `pacote vazio conta como WhatsApp pessoal`() {
    assertEquals("com.whatsapp", NotificationAccountCap.accountOf(""))
    assertEquals("com.whatsapp", NotificationAccountCap.accountOf("com.whatsapp"))
    assertEquals("com.whatsapp.w4b", NotificationAccountCap.accountOf("com.whatsapp.w4b"))
  }

  @Test
  fun `mantem 200 de cada conta e descarta a mais antiga da conta cheia`() {
    val records = JSONArray()
    records.put(item("new-personal", "com.whatsapp"))
    repeat(200) { index -> records.put(item("old-personal-$index", "com.whatsapp")) }
    repeat(3) { index -> records.put(item("business-$index", "com.whatsapp.w4b")) }

    val capped = NotificationAccountCap.cap(records, maxPerAccount = 200)

    assertEquals(203, capped.length())
    assertEquals("new-personal", capped.getJSONObject(0).getString("id"))
    assertEquals("old-personal-198", capped.getJSONObject(199).getString("id"))
    assertEquals("business-0", capped.getJSONObject(200).getString("id"))
    assertEquals("business-2", capped.getJSONObject(202).getString("id"))
  }

  private fun item(id: String, packageName: String): JSONObject = JSONObject().apply {
    put("id", id)
    put("packageName", packageName)
  }
}
