package br.com.otherside.notificationcapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class OtherSideNotificationCaptureService : NotificationListenerService() {
  companion object {
    private const val TAG = "OtherSideCapture"
    private val ALLOWED_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
  }

  override fun onCreate() {
    super.onCreate()
    // O serviço mantém o processo vivo; aproveitamos para observar a pasta de mídia do WhatsApp.
    WhatsAppAudioPreserver.start(applicationContext)
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    WhatsAppAudioPreserver.start(applicationContext)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName !in ALLOWED_PACKAGES) return

    try {
      val extras = sbn.notification?.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
      val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
      val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()
      val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        ?.map { it.toString().trim() }
        ?.filter { it.isNotEmpty() }
        .orEmpty()
      val message = bigText.ifBlank {
        text.ifBlank { lines.joinToString("\n") }
      }

      if (title.isBlank() || message.isBlank() || isSummary(title, message)) return

      val conversationTitle = extras
        .getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)
        ?.toString()
        ?.trim()
        .orEmpty()
      val conversation = conversationTitle.ifBlank { title }
      val id = NotificationFingerprint.create(
        packageName = sbn.packageName,
        notificationKey = sbn.key,
        conversation = conversation,
        sender = title,
        message = message,
      )

      val captured = CapturedNotification(
        id = id,
        conversation = conversation,
        sender = title,
        message = message,
        receivedAt = sbn.postTime,
        packageName = sbn.packageName,
        isDemo = false,
        audioStatus = AudioAttachmentDiagnostics.inspect(this, extras, message),
      )

      if (OtherSideNotificationStore.save(applicationContext, captured)) {
        OtherSideNotificationCaptureModule.getInstance()?.emitNotification(captured)
      }
    } catch (error: Exception) {
      Log.e(TAG, "Não foi possível processar a notificação", error)
    }
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    // A remoção no Android não remove a cópia local preservada pelo OtherSide.
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    OtherSideNotificationCaptureModule.requestRebind(this)
  }

  private fun isSummary(title: String, message: String): Boolean {
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
