package br.com.otherside.notificationcapture

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

internal data class PreservedAudio(
  val id: String,
  val sourceKey: String,
  val fileName: String,
  val localPath: String,
  val sizeBytes: Long,
  val sourcePackage: String,
  val origin: String,
  val originalModifiedAt: Long,
  val preservedAt: Long,
  val kind: String = KIND_AUDIO,
  val thumbPath: String = "",
) {
  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "fileName" to fileName,
    "localPath" to localPath,
    "uri" to "file://$localPath",
    "thumbUri" to if (thumbPath.isNotEmpty()) "file://$thumbPath" else "",
    "sizeBytes" to sizeBytes,
    "sourcePackage" to sourcePackage,
    "origin" to origin,
    "originalModifiedAt" to originalModifiedAt,
    "preservedAt" to preservedAt,
    "kind" to kind,
  )

  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("sourceKey", sourceKey)
    put("fileName", fileName)
    put("localPath", localPath)
    put("sizeBytes", sizeBytes)
    put("sourcePackage", sourcePackage)
    put("origin", origin)
    put("originalModifiedAt", originalModifiedAt)
    put("preservedAt", preservedAt)
    put("kind", kind)
    put("thumbPath", thumbPath)
  }

  companion object {
    const val ORIGIN_RECEIVED = "received"
    const val ORIGIN_SENT = "sent"
    const val ORIGIN_UNKNOWN = "unknown"
    const val KIND_AUDIO = "audio"
    const val KIND_IMAGE = "image"
    const val KIND_DOCUMENT = "document"
    const val KIND_VIDEO = "video"

    fun fromJson(json: JSONObject): PreservedAudio = PreservedAudio(
      id = json.optString("id"),
      sourceKey = json.optString("sourceKey"),
      fileName = json.optString("fileName"),
      localPath = json.optString("localPath"),
      sizeBytes = json.optLong("sizeBytes"),
      sourcePackage = json.optString("sourcePackage"),
      origin = json.optString("origin", ORIGIN_UNKNOWN),
      originalModifiedAt = json.optLong("originalModifiedAt"),
      preservedAt = json.optLong("preservedAt"),
      kind = json.optString("kind", KIND_AUDIO),
      thumbPath = json.optString("thumbPath", ""),
    )
  }
}

/**
 * Índice local da mídia já copiada. O arquivo fica no armazenamento privado do app.
 * O índice é lido uma vez e mantido em memória: reler e regravar o JSON inteiro a cada
 * arquivo da varredura travava o app.
 */
internal object PreservedAudioStore {
  private const val PREFS_NAME = "otherside_preserved_audio"
  private const val RECORDS_KEY = "records"
  private val lock = Any()

  private var records: JSONArray? = null
  private val fileKeys = HashSet<String>()
  private val sourceKeys = HashSet<String>()

  /** Mesmo arquivo de origem, mesmo que a chave antiga ainda traga a data de modificação. */
  fun hasSameFile(context: Context, path: String, size: Long): Boolean = synchronized(lock) {
    loaded(context)
    path.isNotEmpty() && size > 0L && fileKeys.contains("$path|$size")
  }

  fun save(context: Context, audio: PreservedAudio): Boolean =
    saveAll(context, listOf(audio)).isNotEmpty()

  /** Grava um lote de uma vez e devolve só os itens que entraram no índice. */
  fun saveAll(context: Context, items: List<PreservedAudio>): List<PreservedAudio> = synchronized(lock) {
    val current = loaded(context)
    val fresh = items.filter { !sourceKeys.contains(it.sourceKey) }.distinctBy { it.sourceKey }
    if (fresh.isEmpty()) return emptyList()

    val all = ArrayList<JSONObject>(current.length() + fresh.size)
    fresh.forEach { all.add(it.toJson()) }
    for (index in 0 until current.length()) current.optJSONObject(index)?.let(all::add)
    all.sortByDescending(::momentOf)

    val capped = PreservedMediaCap.cap(JSONArray(all))
    store(context, capped.kept)
    capped.dropped.forEach(::deleteFiles)

    val keptIds = HashSet<String>()
    for (index in 0 until capped.kept.length()) {
      capped.kept.optJSONObject(index)?.optString("id")?.let(keptIds::add)
    }
    fresh.filter { keptIds.contains(it.id) }
  }

  fun getAll(context: Context): List<PreservedAudio> = synchronized(lock) {
    val current = loaded(context)
    buildList {
      for (index in 0 until current.length()) {
        current.optJSONObject(index)?.let { add(PreservedAudio.fromJson(it)) }
      }
    }
  }

  fun find(context: Context, id: String): PreservedAudio? = synchronized(lock) {
    val current = loaded(context)
    for (index in 0 until current.length()) {
      val record = current.optJSONObject(index) ?: continue
      if (record.optString("id") == id) return PreservedAudio.fromJson(record)
    }
    null
  }

  fun delete(context: Context, id: String) = synchronized(lock) {
    val current = loaded(context)
    val updated = JSONArray()
    for (index in 0 until current.length()) {
      val record = current.optJSONObject(index) ?: continue
      if (record.optString("id") != id) updated.put(record)
    }
    store(context, updated)
  }

  fun clear(context: Context) = synchronized(lock) {
    store(context, JSONArray())
  }

  /** Chave sem a data de modificação que as versões antigas gravavam no fim. */
  internal fun fileKeyOf(sourceKey: String): String {
    val parts = sourceKey.split('|')
    if (parts.size < 3) return sourceKey
    return if (parts.last().all(Char::isDigit) && parts[parts.size - 2].all(Char::isDigit)) {
      parts.dropLast(1).joinToString("|")
    } else {
      sourceKey
    }
  }

  private fun momentOf(record: JSONObject): Long =
    record.optLong("originalModifiedAt").takeIf { it > 0L } ?: record.optLong("preservedAt")

  private fun deleteFiles(record: JSONObject) {
    listOf(record.optString("localPath"), record.optString("thumbPath"))
      .filter { it.isNotEmpty() }
      .forEach { path -> runCatching { File(path).delete() } }
  }

  private fun loaded(context: Context): JSONArray {
    records?.let { return it }
    val raw = preferences(context).getString(RECORDS_KEY, "[]") ?: "[]"
    val parsed = try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
    remember(parsed)
    return parsed
  }

  private fun store(context: Context, updated: JSONArray) {
    remember(updated)
    preferences(context).edit().putString(RECORDS_KEY, updated.toString()).commit()
  }

  private fun remember(updated: JSONArray) {
    records = updated
    fileKeys.clear()
    sourceKeys.clear()
    for (index in 0 until updated.length()) {
      val key = updated.optJSONObject(index)?.optString("sourceKey").orEmpty()
      if (key.isEmpty()) continue
      sourceKeys.add(key)
      fileKeys.add(fileKeyOf(key))
    }
  }

  private fun preferences(context: Context): SharedPreferences = context.getSharedPreferences(
    PREFS_NAME,
    Context.MODE_PRIVATE,
  )
}
