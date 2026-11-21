package br.com.otherside.notificationcapture

import android.app.Notification
import android.app.Person
import android.os.Build
import android.os.Bundle

internal data class MessagingLine(
  val text: String,
  val time: Long,
  val sender: String,
)

internal data class ParsedNotice(
  val conversation: String,
  val sender: String,
  val message: String,
  val receivedAt: Long,
  /** Horário da própria mensagem (MessagingStyle). Dá para reconhecer o mesmo item depois de apagado. */
  val matchDeletionByTime: Boolean,
  /** Prévia única, quando o WhatsApp não mandou a lista de mensagens. */
  val singleFallback: Boolean,
)

/**
 * Separa cada mensagem da notificação. A prévia (EXTRA_TEXT / EXTRA_BIG_TEXT) fica só
 * como reserva: no WhatsApp ela passa a "Mensagem apagada" e esconderia o resto da lista.
 */
internal object NotificationContent {
  fun parse(
    postTime: Long,
    title: String,
    text: String,
    bigText: String,
    lines: List<String>,
    conversationTitle: String,
    messaging: List<MessagingLine>,
  ): List<ParsedNotice> {
    val trimmedTitle = title.trim()
    val conversation = conversationTitle.trim().ifBlank { trimmedTitle }
    val fromMessaging = messaging.mapNotNull { line ->
      val body = line.text.trim()
      if (body.isEmpty() || conversation.isBlank()) return@mapNotNull null
      val sender = line.sender.trim().ifBlank { trimmedTitle }.ifBlank { conversation }
      if (sender.isBlank()) return@mapNotNull null
      val timed = line.time > 0L
      ParsedNotice(
        conversation = conversation,
        sender = sender,
        message = body,
        receivedAt = if (timed) line.time else postTime,
        matchDeletionByTime = timed,
        singleFallback = false,
      )
    }
    if (fromMessaging.isNotEmpty()) return fromMessaging

    val message = bigText.trim().ifBlank {
      text.trim().ifBlank {
        lines.map { it.trim() }.filter { it.isNotEmpty() }.joinToString("\n")
      }
    }
    if (trimmedTitle.isBlank() || message.isBlank() || isSummary(trimmedTitle, message)) return emptyList()
    return listOf(
      ParsedNotice(
        conversation = conversation.ifBlank { trimmedTitle },
        sender = trimmedTitle,
        message = message,
        receivedAt = postTime,
        matchDeletionByTime = false,
        singleFallback = true,
      ),
    )
  }

  fun idFor(packageName: String, notificationKey: String, notice: ParsedNotice): String {
    return if (notice.matchDeletionByTime) {
      NotificationFingerprint.messageIdentity(
        packageName = packageName,
        conversation = notice.conversation,
        sender = notice.sender,
        receivedAt = notice.receivedAt,
        message = notice.message,
      )
    } else {
      NotificationFingerprint.create(
        packageName = packageName,
        notificationKey = notificationKey,
        conversation = notice.conversation,
        sender = notice.sender,
        message = notice.message,
      )
    }
  }

  fun messagingLines(extras: Bundle): List<MessagingLine> {
    val parcels = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return emptyList()
    return parcels.mapNotNull { parcel ->
      val bundle = parcel as? Bundle ?: return@mapNotNull null
      lineFromBundle(bundle)
    }
  }

  internal fun lineFromBundle(bundle: Bundle): MessagingLine? {
    val text = bundle.getCharSequence("text")?.toString()?.trim().orEmpty()
    if (text.isEmpty()) return null
    val time = if (bundle.containsKey("time")) bundle.getLong("time") else 0L
    val sender = bundle.getCharSequence("sender")?.toString()?.trim().orEmpty().ifBlank {
      personName(bundle)
    }
    return MessagingLine(text = text, time = time, sender = sender)
  }

  private fun personName(bundle: Bundle): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return ""
    return try {
      @Suppress("DEPRECATION")
      val person = bundle.getParcelable("sender_person") as? Person
      person?.name?.toString()?.trim().orEmpty()
    } catch (_: RuntimeException) {
      ""
    }
  }

  internal fun isSummary(title: String, message: String): Boolean {
    val content = "$title $message".lowercase()
    val summaryMarkers = listOf(
      "new message",
      "new messages",
      "messages from",
      "checking for new messages",
      "nova mensagem",
      "novas mensagens",
      "mensagens de",
    )
    return summaryMarkers.any(content::contains)
  }
}
