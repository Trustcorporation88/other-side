package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class MessageHistoryMergeTest {
  @Test
  fun `instalacao nova recebe o historico do Drive com as mais novas primeiro`() {
    val incoming = JSONArray()
    incoming.put(message("antiga", 1))
    incoming.put(message("nova", 9))
    incoming.put(message("meio", 4))

    val (outcome, next) = MessageHistoryMerge.restoreInto(JSONArray(), incoming.toString())

    assertEquals(MessageHistoryMerge.RESTORED, outcome)
    assertEquals(listOf("nova", "meio", "antiga"), ids(next))
  }

  @Test
  fun `json formatado do mensagens json tambem restaura`() {
    val raw = """
      [
        {
          "id": "a",
          "conversation": "Família",
          "sender": "Ana",
          "message": "oi",
          "receivedAt": 10,
          "packageName": "com.whatsapp",
          "isDemo": false,
          "audioStatus": "not_applicable"
        }
      ]
    """.trimIndent()

    val (outcome, next) = MessageHistoryMerge.restoreInto(JSONArray(), raw)

    assertEquals(MessageHistoryMerge.RESTORED, outcome)
    assertEquals("a", next.getJSONObject(0).getString("id"))
    assertEquals("Família", next.getJSONObject(0).getString("conversation"))
    assertEquals("oi", next.getJSONObject(0).getString("message"))
    assertEquals(10L, next.getJSONObject(0).getLong("receivedAt"))
  }

  @Test
  fun `mensagens locais mais novas nao saem para caber historico antigo`() {
    val local = JSONArray()
    local.put(message("nova", 100))
    local.put(message("meio", 50))
    val incoming = JSONArray()
    incoming.put(message("antiga", 10))
    incoming.put(message("mais-antiga", 1))

    val merged = MessageHistoryMerge.merge(local, incoming, maxPerAccount = 2)

    assertEquals(listOf("nova", "meio"), ids(merged))
  }

  @Test
  fun `completa com o Drive ate o teto sem perder a mais nova local`() {
    val local = JSONArray()
    local.put(message("nova", 100))
    local.put(message("meio", 50))
    val incoming = JSONArray()
    incoming.put(message("antiga", 10))
    incoming.put(message("mais-antiga", 1))

    val merged = MessageHistoryMerge.merge(local, incoming, maxPerAccount = 3)

    assertEquals(listOf("nova", "meio", "antiga"), ids(merged))
  }

  @Test
  fun `WhatsApp e Business tem tetos separados`() {
    val incoming = JSONArray()
    incoming.put(message("p-new", 30))
    incoming.put(message("b-1", 25, packageName = "com.whatsapp.w4b"))
    incoming.put(message("p-mid", 20))
    incoming.put(message("p-old", 10))

    val merged = MessageHistoryMerge.merge(JSONArray(), incoming, maxPerAccount = 2)

    assertEquals(listOf("p-new", "b-1", "p-mid"), ids(merged))
  }

  @Test
  fun `o teto padrao e 200 por conta`() {
    val incoming = JSONArray()
    for (index in 0 until 205) incoming.put(message("m-$index", index.toLong()))
    val business = message("business", 1_000, packageName = "com.whatsapp.w4b")
    incoming.put(business)

    val merged = MessageHistoryMerge.merge(JSONArray(), incoming)

    assertEquals(201, merged.length())
    assertEquals("business", merged.getJSONObject(0).getString("id"))
    assertEquals("m-204", merged.getJSONObject(1).getString("id"))
    assertEquals("m-5", merged.getJSONObject(200).getString("id"))
  }

  @Test
  fun `o mesmo id fica uma vez e a versao mais nova ganha`() {
    val local = JSONArray().apply { put(message("a", 1, text = "velha")) }
    val incoming = JSONArray().apply { put(message("a", 5, text = "nova")) }

    val merged = MessageHistoryMerge.merge(local, incoming, maxPerAccount = 10)

    assertEquals(1, merged.length())
    assertEquals("nova", merged.getJSONObject(0).getString("message"))
    assertEquals(5L, merged.getJSONObject(0).getLong("receivedAt"))
  }

  @Test
  fun `o mesmo texto fica uma vez e a mais nova ganha`() {
    val local = JSONArray().apply { put(message("local-id", 10, text = "bom dia")) }
    val incoming = JSONArray().apply { put(message("drive-id", 20, text = "Bom  dia")) }

    val merged = MessageHistoryMerge.merge(local, incoming, maxPerAccount = 10)

    assertEquals(listOf("drive-id"), ids(merged))
  }

  @Test
  fun `empate de horario conserva a copia que ja esta no aparelho`() {
    val local = JSONArray().apply { put(message("local-id", 10, text = "oi")) }
    val incoming = JSONArray().apply { put(message("drive-id", 10, text = "oi")) }

    val merged = MessageHistoryMerge.merge(local, incoming, maxPerAccount = 10)

    assertEquals(listOf("local-id"), ids(merged))
  }

  @Test
  fun `arquivo invalido ou incompleto nao mexe no historico local`() {
    val local = JSONArray().apply { put(message("keep", 5)) }

    val broken = listOf("não é json", "", "{\"id\":\"a\"}", "[{\"message\":\"sem id\"}]", "[{\"id\":\"ok\"}, 1]")
    for (raw in broken) {
      val (outcome, next) = MessageHistoryMerge.restoreInto(local, raw)
      assertEquals(raw, MessageHistoryMerge.FAILED, outcome)
      assertSame(local, next)
      assertEquals(listOf("keep"), ids(next))
    }
  }

  @Test
  fun `arquivo vazio nao apaga o que ja esta no aparelho`() {
    val local = JSONArray().apply { put(message("keep", 5)) }

    val (outcome, next) = MessageHistoryMerge.restoreInto(local, "[]")

    assertEquals(MessageHistoryMerge.UNCHANGED, outcome)
    assertSame(local, next)
  }

  @Test
  fun `aviso mais novo do mesmo id nao substitui o texto ja guardado`() {
    val local = JSONArray().apply { put(message("same", 10, text = "texto original")) }
    val incoming = JSONArray().apply {
      put(
        CapturedNotification(
          id = "same",
          conversation = "conversa",
          sender = "pessoa",
          message = "Mensagem apagada",
          receivedAt = 20,
          packageName = "com.whatsapp",
          isDemo = false,
          deleted = true,
          textPreserved = false,
        ).toJson(),
      )
    }

    val merged = MessageHistoryMerge.merge(local, incoming, maxPerAccount = 10)

    assertEquals(1, merged.length())
    assertEquals("texto original", merged.getJSONObject(0).getString("message"))
    assertEquals(true, merged.getJSONObject(0).getBoolean("deleted"))
    assertEquals(true, merged.getJSONObject(0).getBoolean("textPreserved"))
  }

  @Test
  fun `dois avisos de apagada no mesmo chat nao se fundem`() {
    val incoming = JSONArray()
    incoming.put(message("cedo", 10, text = "Mensagem apagada"))
    incoming.put(message("tarde", 11, text = "This message was deleted"))
    incoming.put(message("outro", 12, text = "Mensagem apagada"))

    val merged = MessageHistoryMerge.merge(JSONArray(), incoming, maxPerAccount = 10)

    assertEquals(listOf("outro", "tarde", "cedo"), ids(merged))
  }

  @Test
  fun `repetir o merge nao muda o resultado`() {
    val local = JSONArray().apply { put(message("local", 80)) }
    val incoming = JSONArray()
    incoming.put(message("drive-new", 90))
    incoming.put(message("drive-old", 10))

    val once = MessageHistoryMerge.merge(local, incoming)
    val twice = MessageHistoryMerge.merge(once, incoming)

    assertEquals(once.toString(), twice.toString())
  }

  private fun message(
    id: String,
    receivedAt: Long,
    packageName: String = "com.whatsapp",
    text: String = id,
  ): JSONObject = CapturedNotification(
    id = id,
    conversation = "conversa",
    sender = "pessoa",
    message = text,
    receivedAt = receivedAt,
    packageName = packageName,
    isDemo = false,
  ).toJson()

  private fun ids(array: JSONArray): List<String> = buildList {
    for (index in 0 until array.length()) add(array.getJSONObject(index).getString("id"))
  }
}
