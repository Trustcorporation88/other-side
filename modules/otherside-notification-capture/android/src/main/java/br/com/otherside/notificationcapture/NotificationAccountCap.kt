package br.com.otherside.notificationcapture

import org.json.JSONArray

/** Teto do histórico local: 200 mensagens preservadas por conta (WhatsApp e Business). */
internal object NotificationAccountCap {
  const val MAX_PER_ACCOUNT = 200

  fun accountOf(packageName: String): String =
    if (packageName == "com.whatsapp.w4b") "com.whatsapp.w4b" else "com.whatsapp"

  fun cap(records: JSONArray, maxPerAccount: Int = MAX_PER_ACCOUNT): JSONArray {
    val counts = HashMap<String, Int>()
    return JSONArray().apply {
      for (index in 0 until records.length()) {
        val record = records.optJSONObject(index) ?: continue
        val account = accountOf(record.optString("packageName"))
        val used = counts[account] ?: 0
        if (used >= maxPerAccount) continue
        counts[account] = used + 1
        put(record)
      }
    }
  }
}
