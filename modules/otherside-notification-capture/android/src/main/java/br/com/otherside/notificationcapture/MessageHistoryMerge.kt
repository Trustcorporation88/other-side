package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject

/**
 * Junta o histórico local com o mensagens.json do Drive.
 * Fica a versão mais nova de cada mensagem e, por conta, só as
 * [NotificationAccountCap.MAX_PER_ACCOUNT] mais recentes.
 * Não apaga o que já está no aparelho só porque o arquivo é mais antigo.
 */
internal object MessageHistoryMerge {
  const val RESTORED = "restored"
  const val UNCHANGED = "unchanged"
  const val FAILED = "failed"

  fun restoreInto(current: JSONArray, raw: String): Pair<String, JSONArray> {
    val incoming = parseSnapshot(raw) ?: return FAILED to current
    val merged = merge(current, incoming)
    if (merged.toString() == current.toString()) return UNCHANGED to current
    return RESTORED to merged
  }

  fun parseSnapshot(raw: String): JSONArray? {
    val trimmed = raw.trim().removePrefix("\uFEFF")
    if (trimmed.isEmpty()) return null
    return try {
      val parsed = JSONArray(trimmed)
      val normalized = JSONArray()
      for (index in 0 until parsed.length()) {
        val record = parsed.optJSONObject(index) ?: return null
        if (record.optString("id").isBlank()) return null
        normalized.put(CapturedNotification.fromJson(record).toJson())
      }
      normalized
    } catch (_: Exception) {
      null
    }
  }

  fun merge(
    local: JSONArray,
    incoming: JSONArray,
    maxPerAccount: Int = NotificationAccountCap.MAX_PER_ACCOUNT,
  ): JSONArray {
    data class Row(val record: JSONObject, val fromLocal: Boolean)

    val rows = ArrayList<Row>(local.length() + incoming.length())
    fun collect(array: JSONArray, fromLocal: Boolean) {
      for (index in 0 until array.length()) {
        val record = array.optJSONObject(index) ?: continue
        val normalized = CapturedNotification.fromJson(record).toJson()
        if (normalized.optString("id").isBlank()) continue
        rows.add(Row(normalized, fromLocal))
      }
    }
    collect(local, true)
    collect(incoming, false)

    rows.sortWith(
      compareByDescending<Row> { it.record.optLong("receivedAt") }
        .thenByDescending { if (it.fromLocal) 1 else 0 },
    )

    val seenIds = HashSet<String>()
    val seenContent = HashSet<String>()
    val ordered = JSONArray()
    for (row in rows) {
      val record = row.record
      val id = record.optString("id")
      if (!seenIds.add(id)) continue
      val content = NotificationFingerprint.content(
        packageName = record.optString("packageName"),
        conversation = record.optString("conversation"),
        sender = record.optString("sender"),
        message = record.optString("message"),
      )
      if (!seenContent.add(content)) continue
      ordered.put(record)
    }
    return NotificationAccountCap.cap(ordered, maxPerAccount)
  }
}
