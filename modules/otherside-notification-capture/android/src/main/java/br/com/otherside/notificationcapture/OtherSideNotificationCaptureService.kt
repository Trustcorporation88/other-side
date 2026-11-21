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
    capture(sbn)
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    // Apagar no WhatsApp atualiza ou tira a notificação. A cópia local não sai;
    // se este aviso ainda trouxer o texto, ele fica. "Mensagem apagada" não o substitui.
    capture(sbn)
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    OtherSideNotificationCaptureModule.requestRebind(this)
  }

  private fun capture(sbn: StatusBarNotification) {
    if (sbn.packageName !in ALLOWED_PACKAGES) return

    try {
      val extras = sbn.notification?.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
      val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
      val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
      val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        ?.map { it.toString() }
        .orEmpty()
      val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString().orEmpty()
      val notices = NotificationContent.parse(
        postTime = sbn.postTime,
        title = title,
        text = text,
        bigText = bigText,
        lines = lines,
        conversationTitle = conversationTitle,
        messaging = NotificationContent.messagingLines(extras),
      )
      if (notices.isEmpty()) return

      val incoming = notices.map { notice ->
        IncomingCapture(
          notification = CapturedNotification(
            id = NotificationContent.idFor(sbn.packageName, sbn.key, notice),
            conversation = notice.conversation,
            sender = notice.sender,
            message = notice.message,
            receivedAt = notice.receivedAt,
            packageName = sbn.packageName,
            isDemo = false,
            audioStatus = if (notice.singleFallback || AudioAttachmentDiagnostics.mentionsAudio(notice.message)) {
              AudioAttachmentDiagnostics.inspect(this, extras, notice.message)
            } else {
              AudioAttachmentDiagnostics.NOT_APPLICABLE
            },
          ),
          matchDeletionByTime = notice.matchDeletionByTime,
        )
      }
      val saved = OtherSideNotificationStore.saveIncoming(applicationContext, incoming)
      val module = OtherSideNotificationCaptureModule.getInstance() ?: return
      saved.forEach(module::emitNotification)
    } catch (error: Exception) {
      Log.e(TAG, "Não foi possível processar a notificação", error)
    }
  }
}
