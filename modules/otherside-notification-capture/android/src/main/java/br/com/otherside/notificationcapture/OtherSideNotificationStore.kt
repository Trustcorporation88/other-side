package br.com.otherside.notificationcapture

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

internal data class CapturedNotification(
  val id: String,
  val conversation: String,
  val sender: String,
  val message: String,
  val receivedAt: Long,
  val packageName: String,
  val isDemo: Boolean,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "conversation" to conversation,
    "sender" to sender,
    "message" to message,
    "receivedAt" to receivedAt,
    "packageName" to packageName,
    "isDemo" to isDemo,
  )

  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("conversation", conversation)
    put("sender", sender)
    put("message", message)
    put("receivedAt", receivedAt)
    put("packageName", packageName)
    put("isDemo", isDemo)
  }

  companion object {
    fun fromJson(json: JSONObject): CapturedNotification = CapturedNotification(
      id = json.optString("id"),
      conversation = json.optString("conversation"),
      sender = json.optString("sender"),
      message = json.optString("message"),
      receivedAt = json.optLong("receivedAt"),
      packageName = json.optString("packageName"),
      isDemo = json.optBoolean("isDemo", false),
    )
  }
}

internal object OtherSideNotificationStore {
  private const val PREFS_NAME = "otherside_notification_capture"
  private const val RECORDS_KEY = "records"
  private const val MAX_RECORDS = 200
  private val lock = Any()

  fun save(context: Context, notification: CapturedNotification): Boolean = synchronized(lock) {
    val original = readJson(context)
    val records = deduplicate(original)
    if (records.length() != original.length()) writeJson(context, records)
    for (index in 0 until records.length()) {
      val existing = records.optJSONObject(index) ?: continue
      if (existing.optString("id") == notification.id) return false
    }

    val updated = JSONArray().apply {
      put(notification.toJson())
      for (index in 0 until records.length()) {
        if (length() >= MAX_RECORDS) break
        records.optJSONObject(index)?.let(::put)
      }
    }
    writeJson(context, updated)
    true
  }

  fun getAll(context: Context): List<CapturedNotification> = synchronized(lock) {
    val original = readJson(context)
    val records = deduplicate(original)
    if (records.length() != original.length()) writeJson(context, records)
    buildList {
      for (index in 0 until records.length()) {
        records.optJSONObject(index)?.let { add(CapturedNotification.fromJson(it)) }
      }
    }
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

  /** Remove mensagens repetidas que já ficaram gravadas pela versão anterior. */
  private fun deduplicate(records: JSONArray): JSONArray {
    val seen = HashSet<String>()
    return JSONArray().apply {
      for (index in 0 until records.length()) {
        val record = records.optJSONObject(index) ?: continue
        if (seen.add(fingerprint(record))) put(record)
      }
    }
  }

  private fun fingerprint(record: JSONObject): String = NotificationFingerprint.content(
    packageName = record.optString("packageName"),
    conversation = record.optString("conversation"),
    sender = record.optString("sender"),
    message = record.optString("message"),
  )

  private fun writeJson(context: Context, records: JSONArray) {
    preferences(context).edit().putString(RECORDS_KEY, records.toString()).apply()
  }
}
