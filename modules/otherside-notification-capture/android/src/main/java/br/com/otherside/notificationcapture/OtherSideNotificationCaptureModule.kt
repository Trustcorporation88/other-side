package br.com.otherside.notificationcapture

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class OtherSideNotificationCaptureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OtherSideNotificationCapture")

    Events("onNotificationCaptured", "onAudioPreserved", "onGalleryChanged")

    OnCreate {
      instance = this@OtherSideNotificationCaptureModule
      appContext.reactContext?.let(WhatsAppAudioPreserver::start)
    }

    OnDestroy {
      GalleryWatch.stop(appContext.reactContext)
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

    Function("isAudioPreservationSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    }

    Function("hasAllFilesAccess") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()
    }

    Function("requestAllFilesAccess") {
      val context = appContext.reactContext ?: return@Function Unit
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val scoped = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
          data = Uri.fromParts("package", context.packageName, null)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
          context.startActivity(scoped)
        } catch (_: Exception) {
          context.startActivity(
            Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
          )
        }
      }
      Unit
    }

    Function("startAudioPreservation") {
      appContext.reactContext?.let(WhatsAppAudioPreserver::start)
      Unit
    }

    Function("getAllWhatsAppMedia") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any>>()
      WhatsAppAudioPreserver.listAllMedia(context)
    }

    Function("hasGalleryAccess") {
      val context = appContext.reactContext ?: return@Function false
      GalleryBackup.hasAccess(context)
    }

    Function("isOnWifi") {
      val context = appContext.reactContext ?: return@Function false
      GalleryBackup.isOnWifi(context)
    }

    Function("isCharging") {
      val context = appContext.reactContext ?: return@Function false
      GalleryBackup.isCharging(context)
    }

    Function("startGalleryWatch") {
      appContext.reactContext?.let(GalleryWatch::start)
      Unit
    }

    Function("stopGalleryWatch") {
      GalleryWatch.stop(appContext.reactContext)
      Unit
    }

    AsyncFunction("requestGalleryAccess") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        *GalleryBackup.permissionNames(),
      )
    }

    AsyncFunction("getGalleryBackupItems") Coroutine { includeWhatsApp: Boolean ->
      val context = appContext.reactContext ?: return@Coroutine emptyList<Map<String, Any>>()
      withContext(Dispatchers.IO) {
        GalleryBackup.list(context, includeWhatsApp)
      }
    }

    Function("getPreservedAudios") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any>>()
      PreservedAudioStore.getAll(context).map { it.toMap() }
    }

    Function("getPreservedAudioUri") { id: String ->
      val context = appContext.reactContext ?: return@Function null
      val audio = PreservedAudioStore.find(context, id) ?: return@Function null
      if (File(audio.localPath).isFile) "file://${audio.localPath}" else null
    }

    Function("deletePreservedAudio") { id: String ->
      val context = appContext.reactContext ?: return@Function Unit
      PreservedAudioStore.find(context, id)?.let { runCatching { File(it.localPath).delete() } }
      PreservedAudioStore.delete(context, id)
      Unit
    }

    Function("clearPreservedAudios") {
      val context = appContext.reactContext ?: return@Function Unit
      PreservedAudioStore.getAll(context).forEach { runCatching { File(it.localPath).delete() } }
      PreservedAudioStore.clear(context)
      Unit
    }
  }

  internal fun emitNotification(notification: CapturedNotification) {
    sendEvent("onNotificationCaptured", notification.toMap())
  }

  internal fun emitAudioPreserved(audio: PreservedAudio) {
    sendEvent("onAudioPreserved", audio.toMap())
  }

  internal fun emitGalleryChanged() {
    sendEvent("onGalleryChanged", mapOf("at" to System.currentTimeMillis()))
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
