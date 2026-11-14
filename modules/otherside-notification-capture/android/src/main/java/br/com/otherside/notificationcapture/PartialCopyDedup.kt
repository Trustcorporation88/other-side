package br.com.otherside.notificationcapture

import org.json.JSONArray
import org.json.JSONObject

/**
 * Uma cópia feita enquanto o WhatsApp ainda gravava o arquivo fica menor que o original e
 * entra no índice com outra chave (caminho|tamanho). Quando o download termina, a cópia
 * inteira entra ao lado. A cortada mostra a miniatura, mas a foto não abre.
 * Para cada arquivo de origem fica só a cópia maior.
 */
internal object PartialCopyDedup {
  class Result(val kept: JSONArray, val dropped: List<JSONObject>)

  fun dedupe(records: JSONArray): Result {
    val best = HashMap<String, JSONObject>()
    for (index in 0 until records.length()) {
      val record = records.optJSONObject(index) ?: continue
      val path = sourcePathOf(record.optString("sourceKey")) ?: continue
      val current = best[path]
      if (current == null || record.optLong("sizeBytes") > current.optLong("sizeBytes")) {
        best[path] = record
      }
    }

    val kept = JSONArray()
    val dropped = ArrayList<JSONObject>()
    for (index in 0 until records.length()) {
      val record = records.optJSONObject(index) ?: continue
      val path = sourcePathOf(record.optString("sourceKey"))
      if (path == null || best[path] === record) kept.put(record) else dropped.add(record)
    }
    return Result(kept, dropped)
  }

  /** Caminho do arquivo original no WhatsApp, sem o tamanho (e a data das chaves antigas). */
  fun sourcePathOf(sourceKey: String): String? {
    val fileKey = PreservedAudioStore.fileKeyOf(sourceKey)
    val separator = fileKey.lastIndexOf('|')
    if (separator <= 0) return null
    if (!fileKey.substring(separator + 1).all(Char::isDigit)) return null
    return fileKey.substring(0, separator)
  }
}
