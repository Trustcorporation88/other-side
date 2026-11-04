package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject

/**
 * Teto do índice local por tipo. Um teto único somado fazia as fotos e documentos do dia
 * empurrarem os áudios para fora da lista em poucos dias.
 */
internal object PreservedMediaCap {
  val DEFAULT_LIMITS: Map<String, Int> = mapOf(
    PreservedAudio.KIND_AUDIO to 3000,
    PreservedAudio.KIND_IMAGE to 2000,
    PreservedAudio.KIND_DOCUMENT to 500,
  )
  private const val OTHER_LIMIT = 200

  class Result(val kept: JSONArray, val dropped: List<JSONObject>)

  fun cap(records: JSONArray, limits: Map<String, Int> = DEFAULT_LIMITS): Result {
    val counts = HashMap<String, Int>()
    val kept = JSONArray()
    val dropped = ArrayList<JSONObject>()
    for (index in 0 until records.length()) {
      val record = records.optJSONObject(index) ?: continue
      val kind = record.optString("kind", PreservedAudio.KIND_AUDIO)
      val used = counts[kind] ?: 0
      if (used >= (limits[kind] ?: OTHER_LIMIT)) {
        dropped.add(record)
        continue
      }
      counts[kind] = used + 1
      kept.put(record)
    }
    return Result(kept, dropped)
  }
}
