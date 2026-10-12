package br.com.otherside.notificationcapture

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

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
) {
  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "fileName" to fileName,
    "localPath" to localPath,
    "uri" to "file://$localPath",
    "sizeBytes" to sizeBytes,
    "sourcePackage" to sourcePackage,
    "origin" to origin,
    "originalModifiedAt" to originalModifiedAt,
    "preservedAt" to preservedAt,
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
  }

  companion object {
    const val ORIGIN_RECEIVED = "received"
    const val ORIGIN_SENT = "sent"
    const val ORIGIN_UNKNOWN = "unknown"

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
    )
  }
}

/** Índice local dos áudios já copiados. O arquivo de áudio fica no armazenamento privado do app. */
internal object PreservedAudioStore {
  private const val PREFS_NAME = "otherside_preserved_audio"
  private const val RECORDS_KEY = "records"
  private const val MAX_RECORDS = 500
  private val lock = Any()

  fun has(context: Context, sourceKey: String): Boolean = synchronized(lock) {
    val records = readJson(context)
    for (index in 0 until records.length()) {
      if (records.optJSONObject(index)?.optString("sourceKey") == sourceKey) return true
    }
    false
  }

  fun save(context: Context, audio: PreservedAudio): Boolean = synchronized(lock) {
    val records = readJson(context)
    for (index in 0 until records.length()) {
      if (records.optJSONObject(index)?.optString("sourceKey") == audio.sourceKey) return false
    }
    val updated = JSONArray().apply {
      put(audio.toJson())
      for (index in 0 until records.length()) {
        if (length() >= MAX_RECORDS) break
        records.optJSONObject(index)?.let(::put)
      }
    }
    writeJson(context, updated)
    true
  }

  fun getAll(context: Context): List<PreservedAudio> = synchronized(lock) {
    val records = readJson(context)
    buildList {
      for (index in 0 until records.length()) {
        records.optJSONObject(index)?.let { add(PreservedAudio.fromJson(it)) }
      }
    }
  }

  fun find(context: Context, id: String): PreservedAudio? = synchronized(lock) {
    val records = readJson(context)
    for (index in 0 until records.length()) {
      val record = records.optJSONObject(index) ?: continue
      if (record.optString("id") == id) return PreservedAudio.fromJson(record)
    }
    null
  }

  fun delete(context: Context, id: String) = synchronized(lock) {
    val records = readJson(context)
    val updated = JSONArray()
    for (index in 0 until records.length()) {
      val record = records.optJSONObject(index) ?: continue
      if (record.optString("id") != id) updated.put(record)
    }
    writeJson(context, updated)
  }

  fun clear(context: Context) = synchronized(lock) {
    writeJson(context, JSONArray())
  }

  private fun preferences(context: Context): SharedPreferences = context.getSharedPreferences(
    PREFS_NAME,
    Context.MODE_PRIVATE,
  )

  private fun readJson(context: Context): JSONArray {
    val raw = preferences(context).getString(RECORDS_KEY, "[]") ?: "[]"
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun writeJson(context: Context, records: JSONArray) {
    preferences(context).edit().putString(RECORDS_KEY, records.toString()).apply()
  }
}
