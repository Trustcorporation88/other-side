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
  val audioStatus: String = AudioAttachmentDiagnostics.NOT_APPLICABLE,
  val deleted: Boolean = false,
  /** Falso quando o único texto que o WhatsApp entregou foi o aviso de mensagem apagada. */
  val textPreserved: Boolean = true,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "conversation" to conversation,
    "sender" to sender,
    "message" to message,
    "receivedAt" to receivedAt,
    "packageName" to packageName,
    "isDemo" to isDemo,
    "audioStatus" to audioStatus,
    "deleted" to deleted,
    "textPreserved" to textPreserved,
  )

  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("conversation", conversation)
    put("sender", sender)
    put("message", message)
    put("receivedAt", receivedAt)
    put("packageName", packageName)
    put("isDemo", isDemo)
    put("audioStatus", audioStatus)
    put("deleted", deleted)
    put("textPreserved", textPreserved)
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
      audioStatus = json.optString("audioStatus", AudioAttachmentDiagnostics.NOT_APPLICABLE),
      deleted = json.optBoolean("deleted", false),
      textPreserved = if (json.has("textPreserved")) {
        json.optBoolean("textPreserved", true)
      } else {
        !DeletedMessage.isPlaceholder(json.optString("message"))
      },
    )
  }
}

internal object OtherSideNotificationStore {
  private const val PREFS_NAME = "otherside_notification_capture"
  private const val RECORDS_KEY = "records"
  private val lock = Any()

  fun save(context: Context, notification: CapturedNotification): Boolean =
    saveIncoming(context, listOf(IncomingCapture(notification, matchDeletionByTime = false))).isNotEmpty()

  /** Guarda várias mensagens da mesma notificação. Devolve só o que mudou. */
  fun saveIncoming(context: Context, incoming: List<IncomingCapture>): List<CapturedNotification> = synchronized(lock) {
    if (incoming.isEmpty()) return emptyList()
    val original = readJson(context)
    val incorporated = CapturedMessageLog.incorporate(deduplicate(original), incoming)
    val next = NotificationAccountCap.cap(deduplicate(incorporated.records))
    if (next.toString() != original.toString()) writeJson(context, next)
    val keptIds = HashSet<String>()
    for (index in 0 until next.length()) {
      next.optJSONObject(index)?.optString("id")?.takeIf { it.isNotEmpty() }?.let(keptIds::add)
    }
    incorporated.changed.filter { it.id in keptIds }
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

  /**
   * Incorpora o mensagens.json do Drive. JSON inválido não grava nada.
   * Devolve "restored", "unchanged" ou "failed".
   */
  fun restore(context: Context, raw: String): String = synchronized(lock) {
    val current = readJson(context)
    val (outcome, next) = MessageHistoryMerge.restoreInto(current, raw)
    if (outcome == MessageHistoryMerge.RESTORED) writeJson(context, next)
    outcome
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

  private fun fingerprint(record: JSONObject): String = NotificationFingerprint.dedupKey(
    packageName = record.optString("packageName"),
    conversation = record.optString("conversation"),
    sender = record.optString("sender"),
    message = record.optString("message"),
    receivedAt = record.optLong("receivedAt"),
  )

  private fun writeJson(context: Context, records: JSONArray) {
    preferences(context).edit().putString(RECORDS_KEY, records.toString()).apply()
  }
}
