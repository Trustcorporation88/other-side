package br.com.otherside.notificationcapture

import org.json.JSONArray
import java.util.Locale

internal data class IncomingCapture(
  val notification: CapturedNotification,
  val matchDeletionByTime: Boolean,
)

internal data class IncorporateResult(
  val records: JSONArray,
  val changed: List<CapturedNotification>,
)

/**
 * Acrescenta o que a notificação trouxe. "Mensagem apagada" não substitui texto já guardado:
 * marca a mensagem e deixa o original. Se o WhatsApp nunca enviou o texto, fica só o aviso.
 */
internal object CapturedMessageLog {
  fun incorporate(existing: JSONArray, incoming: List<IncomingCapture>): IncorporateResult {
    val records = ArrayList<CapturedNotification>(existing.length() + incoming.size)
    for (index in 0 until existing.length()) {
      existing.optJSONObject(index)?.let { records.add(CapturedNotification.fromJson(it)) }
    }
    val changed = ArrayList<CapturedNotification>()
    for (item in incoming.sortedBy { it.notification.receivedAt }) {
      apply(records, item, changed)
    }
    val json = JSONArray()
    records.forEach { json.put(it.toJson()) }
    return IncorporateResult(json, changed)
  }

  /** A versão mais nova não pode trocar texto real pelo aviso de apagada. */
  fun preserveStoredMessage(
    preferred: CapturedNotification,
    other: CapturedNotification,
  ): CapturedNotification {
    val keepOther = DeletedMessage.isPlaceholder(preferred.message) &&
      other.message.isNotBlank() &&
      !DeletedMessage.isPlaceholder(other.message)
    val message = if (keepOther) other.message else preferred.message.ifBlank { other.message }
    val sawPlaceholder = DeletedMessage.isPlaceholder(preferred.message) ||
      DeletedMessage.isPlaceholder(other.message)
    return preferred.copy(
      message = message,
      deleted = preferred.deleted || other.deleted || sawPlaceholder,
      textPreserved = !DeletedMessage.isPlaceholder(message),
    )
  }

  private fun apply(
    records: MutableList<CapturedNotification>,
    item: IncomingCapture,
    changed: MutableList<CapturedNotification>,
  ) {
    val incoming = item.notification
    val sameId = records.indexOfFirst { it.id == incoming.id }
    if (sameId >= 0) {
      val updated = preserveStoredMessage(records[sameId], incoming)
      if (updated != records[sameId]) {
        records[sameId] = updated
        changed.add(updated)
      }
      return
    }

    if (item.matchDeletionByTime && DeletedMessage.isPlaceholder(incoming.message)) {
      var matched = false
      for (index in records.indices) {
        val current = records[index]
        if (!sameSlot(current, incoming)) continue
        matched = true
        if (DeletedMessage.isPlaceholder(current.message) || current.deleted) continue
        val updated = current.copy(deleted = true)
        records[index] = updated
        changed.add(updated)
      }
      if (matched) return
      val notice = incoming.copy(deleted = true, textPreserved = false)
      records.add(0, notice)
      changed.add(notice)
      return
    }

    if (item.matchDeletionByTime && !DeletedMessage.isPlaceholder(incoming.message)) {
      val placeholderIndex = records.indexOfFirst {
        sameSlot(it, incoming) && DeletedMessage.isPlaceholder(it.message)
      }
      val hasReal = records.any {
        sameSlot(it, incoming) && !DeletedMessage.isPlaceholder(it.message)
      }
      if (placeholderIndex >= 0 && !hasReal) {
        val upgraded = incoming.copy(deleted = true, textPreserved = true)
        records[placeholderIndex] = upgraded
        changed.add(upgraded)
        return
      }
    }

    val stored = incoming.copy(
      deleted = incoming.deleted || DeletedMessage.isPlaceholder(incoming.message),
      textPreserved = incoming.textPreserved && !DeletedMessage.isPlaceholder(incoming.message),
    )
    records.add(0, stored)
    changed.add(stored)
  }

  private fun sameSlot(current: CapturedNotification, incoming: CapturedNotification): Boolean {
    return current.packageName == incoming.packageName &&
      current.receivedAt == incoming.receivedAt &&
      normalize(current.conversation) == normalize(incoming.conversation) &&
      normalize(current.sender) == normalize(incoming.sender)
  }

  private fun normalize(value: String): String = value
    .replace(Regex("\\s+"), " ")
    .trim()
    .lowercase(Locale.ROOT)
}
