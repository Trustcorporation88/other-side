package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CapturedMessageLogTest {
  @Test
  fun `mensagem apagada nao substitui o texto ja guardado`() {
    val stored = CapturedMessageLog.incorporate(JSONArray(), listOf(notice("preco", "O valor combinado fica 150.", 1_000)))
    val next = CapturedMessageLog.incorporate(
      stored.records,
      listOf(notice("aviso", "Mensagem apagada", 1_000)),
    )

    assertEquals(1, next.records.length())
    val row = next.records.getJSONObject(0)
    assertEquals("O valor combinado fica 150.", row.getString("message"))
    assertTrue(row.getBoolean("deleted"))
    assertTrue(row.getBoolean("textPreserved"))
    assertEquals("preco", row.getString("id"))
  }

  @Test
  fun `this message was deleted tambem nao substitui o texto`() {
    val stored = CapturedMessageLog.incorporate(JSONArray(), listOf(notice("id", "texto original", 5_000)))
    val next = CapturedMessageLog.incorporate(
      stored.records,
      listOf(notice("aviso", "This message was deleted", 5_000)),
    )

    assertEquals("texto original", next.records.getJSONObject(0).getString("message"))
    assertTrue(next.records.getJSONObject(0).getBoolean("deleted"))
  }

  @Test
  fun `voce apagou esta mensagem marca sem trocar o texto`() {
    val stored = CapturedMessageLog.incorporate(JSONArray(), listOf(notice("id", "texto original", 5_000)))
    val next = CapturedMessageLog.incorporate(
      stored.records,
      listOf(notice("aviso", "Você apagou esta mensagem", 5_000)),
    )

    assertEquals("texto original", next.records.getJSONObject(0).getString("message"))
    assertTrue(next.records.getJSONObject(0).getBoolean("deleted"))
  }

  @Test
  fun `a mensagem ao lado no mesmo chat nao e marcada`() {
    val stored = CapturedMessageLog.incorporate(
      JSONArray(),
      listOf(
        notice("vizinha", "Combinado, eu envio.", 1_000),
        notice("some", "Detalhe que saiu.", 2_000),
        notice("outra", "Mando sem a caixa.", 3_000),
      ),
    )
    val next = CapturedMessageLog.incorporate(
      stored.records,
      listOf(
        notice("a1", "Mensagem apagada", 2_000),
        notice("a2", "This message was deleted", 3_000),
      ),
    )

    assertEquals(3, next.records.length())
    val neighbor = row(next.records, "vizinha")
    assertEquals("Combinado, eu envio.", neighbor.getString("message"))
    assertFalse(neighbor.getBoolean("deleted"))
    val first = row(next.records, "some")
    assertEquals("Detalhe que saiu.", first.getString("message"))
    assertTrue(first.getBoolean("deleted"))
    val second = row(next.records, "outra")
    assertEquals("Mando sem a caixa.", second.getString("message"))
    assertTrue(second.getBoolean("deleted"))
  }

  @Test
  fun `sem texto original ficam so os avisos que o WhatsApp entregou`() {
    val next = CapturedMessageLog.incorporate(
      JSONArray(),
      listOf(
        notice("a", "Mensagem apagada", 1_000),
        notice("b", "Mensagem apagada", 2_000),
        notice("c", "This message was deleted", 3_000),
      ),
    )

    assertEquals(3, next.records.length())
    assertEquals(
      listOf("This message was deleted", "Mensagem apagada", "Mensagem apagada"),
      messages(next.records),
    )
    for (index in 0 until next.records.length()) {
      val row = next.records.getJSONObject(index)
      assertTrue(row.getBoolean("deleted"))
      assertFalse(row.getBoolean("textPreserved"))
    }
  }

  @Test
  fun `repetir o aviso nao duplica nem apaga o texto`() {
    val stored = CapturedMessageLog.incorporate(JSONArray(), listOf(notice("id", "texto original", 1_000)))
    val once = CapturedMessageLog.incorporate(stored.records, listOf(notice("aviso", "Mensagem apagada", 1_000)))
    val twice = CapturedMessageLog.incorporate(once.records, listOf(notice("aviso", "Mensagem apagada", 1_000)))

    assertEquals(once.records.toString(), twice.records.toString())
    assertEquals("texto original", twice.records.getJSONObject(0).getString("message"))
    assertTrue(twice.changed.isEmpty())
  }

  @Test
  fun `previa unica de apagada nao mexe no que ja estava guardado`() {
    val stored = CapturedMessageLog.incorporate(
      JSONArray(),
      listOf(notice("id", "texto original", 4_000, matchDeletionByTime = false)),
    )
    val next = CapturedMessageLog.incorporate(
      stored.records,
      listOf(notice("aviso", "Mensagem apagada", 9_000, matchDeletionByTime = false)),
    )

    assertEquals("texto original", row(next.records, "id").getString("message"))
    assertFalse(row(next.records, "id").getBoolean("deleted"))
    assertEquals("Mensagem apagada", row(next.records, "aviso").getString("message"))
    assertFalse(row(next.records, "aviso").getBoolean("textPreserved"))
  }

  @Test
  fun `frase comum que cita o aviso entra como texto normal`() {
    val next = CapturedMessageLog.incorporate(
      JSONArray(),
      listOf(notice("id", "Ele falou em mensagem apagada ontem", 1_000)),
    )

    val row = next.records.getJSONObject(0)
    assertEquals("Ele falou em mensagem apagada ontem", row.getString("message"))
    assertFalse(row.getBoolean("deleted"))
    assertTrue(row.getBoolean("textPreserved"))
  }

  @Test
  fun `se o texto chegar depois do aviso, o aviso nao fica no lugar`() {
    val stored = CapturedMessageLog.incorporate(JSONArray(), listOf(notice("aviso", "Mensagem apagada", 1_000)))
    val next = CapturedMessageLog.incorporate(
      stored.records,
      listOf(notice("real", "texto original", 1_000)),
    )

    assertEquals(1, next.records.length())
    assertEquals("texto original", next.records.getJSONObject(0).getString("message"))
    assertTrue(next.records.getJSONObject(0).getBoolean("deleted"))
    assertTrue(next.records.getJSONObject(0).getBoolean("textPreserved"))
  }

  private fun notice(
    id: String,
    text: String,
    time: Long,
    matchDeletionByTime: Boolean = true,
  ): IncomingCapture = IncomingCapture(
    notification = CapturedNotification(
      id = id,
      conversation = "Cliente",
      sender = "Ana",
      message = text,
      receivedAt = time,
      packageName = "com.whatsapp.w4b",
      isDemo = false,
    ),
    matchDeletionByTime = matchDeletionByTime,
  )

  private fun row(array: JSONArray, id: String): JSONObject {
    for (index in 0 until array.length()) {
      val item = array.getJSONObject(index)
      if (item.getString("id") == id) return item
    }
    throw AssertionError("não achei $id")
  }

  private fun messages(array: JSONArray): List<String> = buildList {
    for (index in 0 until array.length()) add(array.getJSONObject(index).getString("message"))
  }
}
