package br.com.otherside.notificationcapture

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OtherSideNotificationCaptureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OtherSideNotificationCapture")

    Events("onNotificationCaptured")

    OnCreate {
      instance = this@OtherSideNotificationCaptureModule
    }

    OnDestroy {
      if (instance === this@OtherSideNotificationCaptureModule) instance = null
    }

    Function("isListenerEnabled") {
      appContext.reactContext?.let(::isListenerEnabled) ?: false
    }

    Function("openNotificationSettings") {
      val context = appContext.reactContext ?: return@Function Unit
      context.startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        },
      )
      Unit
    }

    Function("getCapturedNotifications") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any>>()
      OtherSideNotificationStore.getAll(context).map { it.toMap() }
    }

    Function("deleteCapturedNotification") { id: String ->
      appContext.reactContext?.let { OtherSideNotificationStore.delete(it, id) }
      Unit
    }

    Function("clearCapturedNotifications") {
      appContext.reactContext?.let(OtherSideNotificationStore::clear)
      Unit
    }
  }

  internal fun emitNotification(notification: CapturedNotification) {
    sendEvent("onNotificationCaptured", notification.toMap())
  }

  companion object {
    @Volatile
    private var instance: OtherSideNotificationCaptureModule? = null

    fun getInstance(): OtherSideNotificationCaptureModule? = instance

    fun requestRebind(context: Context) {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
        requestRebindStatic(context)
      }
    }

    private fun requestRebindStatic(context: Context) {
      NotificationListenerServiceBridge.requestRebind(
        context,
        OtherSideNotificationCaptureService::class.java,
      )
    }
  }

  private fun isListenerEnabled(context: Context): Boolean {
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      "enabled_notification_listeners",
    ) ?: return false
    return enabled.split(":").any { component ->
      component.startsWith("${context.packageName}/")
    }
  }
}

private object NotificationListenerServiceBridge {
  fun requestRebind(context: Context, serviceClass: Class<*>) {
    android.service.notification.NotificationListenerService.requestRebind(
      ComponentName(context, serviceClass),
    )
  }
}
