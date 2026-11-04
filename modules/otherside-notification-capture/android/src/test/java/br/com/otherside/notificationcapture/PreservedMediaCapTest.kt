package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class PreservedMediaCapTest {
  @Test
  fun `fotos e documentos nao empurram os audios para fora`() {
    val records = JSONArray()
    repeat(10) { index -> records.put(item("img-$index", PreservedAudio.KIND_IMAGE)) }
    repeat(10) { index -> records.put(item("doc-$index", PreservedAudio.KIND_DOCUMENT)) }
    repeat(3) { index -> records.put(item("audio-$index", PreservedAudio.KIND_AUDIO)) }

    val result = PreservedMediaCap.cap(
      records,
      mapOf(
        PreservedAudio.KIND_AUDIO to 5,
        PreservedAudio.KIND_IMAGE to 4,
        PreservedAudio.KIND_DOCUMENT to 2,
      ),
    )

    val kept = (0 until result.kept.length()).map { result.kept.getJSONObject(it).getString("id") }
    assertEquals(listOf("audio-0", "audio-1", "audio-2"), kept.filter { it.startsWith("audio") })
    assertEquals(4, kept.count { it.startsWith("img") })
    assertEquals(2, kept.count { it.startsWith("doc") })
    assertEquals(14, result.dropped.size)
  }

  @Test
  fun `o tipo cheio descarta o mais antigo`() {
    val records = JSONArray()
    records.put(item("novo", PreservedAudio.KIND_AUDIO))
    repeat(3) { index -> records.put(item("velho-$index", PreservedAudio.KIND_AUDIO)) }

    val result = PreservedMediaCap.cap(records, mapOf(PreservedAudio.KIND_AUDIO to 3))

    assertEquals("novo", result.kept.getJSONObject(0).getString("id"))
    assertEquals("velho-2", result.dropped.single().getString("id"))
  }

  @Test
  fun `registro antigo sem tipo conta como audio`() {
    val records = JSONArray().put(JSONObject().put("id", "legado"))
    val result = PreservedMediaCap.cap(records, mapOf(PreservedAudio.KIND_AUDIO to 1))
    assertEquals(1, result.kept.length())
  }

  private fun item(id: String, kind: String): JSONObject = JSONObject().apply {
    put("id", id)
    put("kind", kind)
  }
}
