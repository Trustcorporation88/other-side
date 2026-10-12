package br.com.otherside.notificationcapture

import android.content.Context
import android.app.Notification
import android.net.Uri
import android.os.Build
import android.os.Bundle

/** Verifica a permissão no instante da notificação, sem copiar, reproduzir ou enviar o arquivo. */
internal object AudioAttachmentDiagnostics {
  const val NOT_APPLICABLE = "not_applicable"
  const val NOT_PROVIDED = "not_provided"
  const val NOT_ACCESSIBLE = "not_accessible"
  const val ACCESSIBLE = "accessible"

  fun inspect(context: Context, extras: Bundle, notificationText: String): String {
    val attachments = extractAttachments(extras)
    val audioAttachments = attachments.filter { attachment ->
      attachment.mimeType?.startsWith("audio/", ignoreCase = true) == true
    }
    val mentionsAudio = mentionsAudio(notificationText)

    if (audioAttachments.isEmpty() && !mentionsAudio) return NOT_APPLICABLE

    val candidates = if (audioAttachments.isNotEmpty()) {
      audioAttachments
    } else {
      attachments.filter { it.mimeType.isNullOrBlank() }
    }

    if (candidates.isEmpty()) return NOT_PROVIDED
    return if (candidates.any { canOpen(context, it.uri) }) ACCESSIBLE else NOT_ACCESSIBLE
  }

  internal fun mentionsAudio(text: String): Boolean = AUDIO_TERMS.containsMatchIn(text)

  private fun extractAttachments(extras: Bundle): List<Attachment> {
    val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES).orEmpty()
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Notification.MessagingStyle.Message.getMessagesFromBundleArray(messages)
          .mapNotNull { message ->
            val uri = message.dataUri ?: return@mapNotNull null
            Attachment(uri, message.dataMimeType)
          }
      } else {
        messages.mapNotNull { parcelable ->
          val bundle = parcelable as? Bundle ?: return@mapNotNull null
          val uri = bundle.get("dataUri") as? Uri ?: return@mapNotNull null
          Attachment(uri, bundle.getString("dataMimeType"))
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun canOpen(context: Context, uri: Uri): Boolean = try {
    context.contentResolver.openFileDescriptor(uri, "r")?.use { true } ?: false
  } catch (_: Exception) {
    false
  }

  private data class Attachment(val uri: Uri, val mimeType: String?)

  private val AUDIO_TERMS = Regex(
    "(?:áudio|audio|mensagem de voz|nota de voz|voice message|voice note|\uD83C\uDFA4|\uD83C\uDFA7)",
    RegexOption.IGNORE_CASE,
  )
}
