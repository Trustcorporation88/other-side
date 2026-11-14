package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PartialCopyDedupTest {
  private val photo = "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/IMG-20261114-WA0071.jpg"

  @Test
  fun `copia cortada sai e fica a copia inteira`() {
    val records = JSONArray()
      .put(item("inteira", "$photo|250000", 250000))
      .put(item("cortada", "$photo|65536", 65536))
      .put(item("outra", "/x/IMG-20261114-WA0072.jpg|9000", 9000))

    val result = PartialCopyDedup.dedupe(records)

    val kept = (0 until result.kept.length()).map { result.kept.getJSONObject(it).getString("id") }
    assertEquals(listOf("inteira", "outra"), kept)
    assertEquals(listOf("cortada"), result.dropped.map { it.getString("id") })
  }

  @Test
  fun `chave antiga com data conta como o mesmo arquivo`() {
    val records = JSONArray()
      .put(item("antiga-cortada", "$photo|1000|1731600000000", 1000))
      .put(item("nova", "$photo|5000", 5000))

    val result = PartialCopyDedup.dedupe(records)

    assertEquals(1, result.kept.length())
    assertEquals("nova", result.kept.getJSONObject(0).getString("id"))
  }

  @Test
  fun `le o caminho de origem da chave`() {
    assertEquals(photo, PartialCopyDedup.sourcePathOf("$photo|250000"))
    assertEquals(photo, PartialCopyDedup.sourcePathOf("$photo|250000|1731600000000"))
    assertNull(PartialCopyDedup.sourcePathOf(""))
  }

  private fun item(id: String, sourceKey: String, size: Long) = JSONObject()
    .put("id", id)
    .put("sourceKey", sourceKey)
    .put("sizeBytes", size)
    .put("kind", PreservedAudio.KIND_IMAGE)
}
