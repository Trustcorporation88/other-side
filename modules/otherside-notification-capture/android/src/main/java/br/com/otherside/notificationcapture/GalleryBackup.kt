package br.com.otherside.notificationcapture

import android.Manifest
import android.content.Context
import android.database.Cursor
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import android.content.ContentUris
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.database.ContentObserver
import java.security.MessageDigest
import java.util.Locale

/** Classifica pastas da galeria sem depender de aparelho, para o teste unitário. */
internal object GalleryPaths {
  fun isCamera(relativePath: String?, absolutePath: String? = null): Boolean {
    if (isCameraRelative(relativePath)) return true
    val absolute = normalize(absolutePath ?: "")
    return absolute.contains("/dcim/camera/")
  }

  fun isWhatsAppGallery(relativePath: String?, absolutePath: String? = null): Boolean {
    return isWhatsAppPath(relativePath) || isWhatsAppPath(absolutePath)
  }

  private fun isCameraRelative(relativePath: String?): Boolean {
    val path = normalize(relativePath ?: "").trim('/')
    return path == "dcim/camera" || path.startsWith("dcim/camera/")
  }

  private fun isWhatsAppPath(raw: String?): Boolean {
    val path = normalize(raw ?: "")
    if (path.isEmpty()) return false
    return path.contains("pictures/whatsapp images") ||
      path.contains("pictures/whatsapp/") ||
      path.contains("/pictures/whatsapp") ||
      path.endsWith("pictures/whatsapp") ||
      path.contains("dcim/whatsapp") ||
      path.contains("whatsapp/media/whatsapp images") ||
      path.contains("whatsapp/media/whatsapp video") ||
      path.contains("whatsapp business/media/whatsapp images") ||
      path.contains("whatsapp business/media/whatsapp video") ||
      path.contains("android/media/com.whatsapp/") ||
      path.contains("android/media/com.whatsapp.w4b/")
  }

  private fun normalize(path: String): String =
    path.replace('\\', '/').trim().lowercase(Locale.ROOT)
}

internal object GalleryBackup {
  private const val MAX_LIST = 100_000

  fun hasAccess(context: Context): Boolean = canReadImages(context) || canReadVideos(context)

  fun canReadImages(context: Context): Boolean = when {
    Build.VERSION.SDK_INT >= 34 ->
      granted(context, Manifest.permission.READ_MEDIA_IMAGES) ||
        granted(context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
    Build.VERSION.SDK_INT >= 33 -> granted(context, Manifest.permission.READ_MEDIA_IMAGES)
    else -> legacyRead(context)
  }

  fun canReadVideos(context: Context): Boolean = when {
    Build.VERSION.SDK_INT >= 34 ->
      granted(context, Manifest.permission.READ_MEDIA_VIDEO) ||
        granted(context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
    Build.VERSION.SDK_INT >= 33 -> granted(context, Manifest.permission.READ_MEDIA_VIDEO)
    else -> legacyRead(context)
  }

  fun permissionNames(): Array<String> = when {
    Build.VERSION.SDK_INT >= 33 -> arrayOf(
      Manifest.permission.READ_MEDIA_IMAGES,
      Manifest.permission.READ_MEDIA_VIDEO,
    )
    else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
  }

  fun isOnWifi(context: Context): Boolean {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
    val network = manager.activeNetwork ?: return false
    val caps = manager.getNetworkCapabilities(network) ?: return false
    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
    if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
      caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    ) {
      return true
    }
    return caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
      caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
  }

  fun isCharging(context: Context): Boolean {
    val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      ?: return false
    val status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    return status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
  }

  fun list(context: Context, includeWhatsApp: Boolean): List<Map<String, Any>> {
    if (!hasAccess(context)) return emptyList()
    val out = ArrayList<Map<String, Any>>()
    val seen = HashSet<String>()
    if (canReadImages(context)) {
      query(context, imageCollection(), includeWhatsApp, out, seen)
    }
    if (canReadVideos(context) && out.size < MAX_LIST) {
      query(context, videoCollection(), includeWhatsApp, out, seen)
    }
    return out
  }

  private fun query(
    context: Context,
    collection: Uri,
    includeWhatsApp: Boolean,
    out: MutableList<Map<String, Any>>,
    seen: MutableSet<String>,
  ) {
    val projection = mutableListOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.DATE_MODIFIED,
      MediaStore.MediaColumns.DATE_ADDED,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      projection.add(MediaStore.MediaColumns.RELATIVE_PATH)
      projection.add(MediaStore.MediaColumns.DATE_TAKEN)
    } else {
      projection.add(MediaStore.MediaColumns.DATA)
    }

    val selection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      "${MediaStore.MediaColumns.IS_PENDING} = 0"
    } else {
      null
    }

    val columns = projection.toTypedArray()
    val cursor = runCatching {
      context.contentResolver.query(collection, columns, selection, null, null)
    }.getOrNull() ?: runCatching {
      context.contentResolver.query(collection, columns, null, null, null)
    }.getOrNull() ?: return

    cursor.use {
      val idCol = it.getColumnIndex(MediaStore.MediaColumns._ID)
      val nameCol = it.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
      val sizeCol = it.getColumnIndex(MediaStore.MediaColumns.SIZE)
      val mimeCol = it.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE)
      val modifiedCol = it.getColumnIndex(MediaStore.MediaColumns.DATE_MODIFIED)
      val addedCol = it.getColumnIndex(MediaStore.MediaColumns.DATE_ADDED)
      val relativeCol = it.getColumnIndex(MediaStore.MediaColumns.RELATIVE_PATH)
      val takenCol = it.getColumnIndex(MediaStore.MediaColumns.DATE_TAKEN)
      val dataCol = it.getColumnIndex(MediaStore.MediaColumns.DATA)
      if (idCol < 0 || nameCol < 0) return

      while (it.moveToNext()) {
        if (out.size >= MAX_LIST) return
        readRow(
          it, collection, includeWhatsApp, out, seen,
          idCol, nameCol, sizeCol, mimeCol, modifiedCol, addedCol, relativeCol, takenCol, dataCol,
        )
      }
    }
  }

  private fun readRow(
    cursor: Cursor,
    collection: Uri,
    includeWhatsApp: Boolean,
    out: MutableList<Map<String, Any>>,
    seen: MutableSet<String>,
    idCol: Int,
    nameCol: Int,
    sizeCol: Int,
    mimeCol: Int,
    modifiedCol: Int,
    addedCol: Int,
    relativeCol: Int,
    takenCol: Int,
    dataCol: Int,
  ) {
    val name = cursor.getString(nameCol)?.trim().orEmpty()
    val size = if (sizeCol >= 0) cursor.getLong(sizeCol) else 0L
    if (name.isEmpty() || size <= 0L) return

    val relative = if (relativeCol >= 0) cursor.getString(relativeCol).orEmpty() else ""
    val absolute = if (dataCol >= 0) cursor.getString(dataCol).orEmpty() else ""
    val camera = GalleryPaths.isCamera(relative, absolute)
    val whatsapp = includeWhatsApp && GalleryPaths.isWhatsAppGallery(relative, absolute)
    if (!camera && !whatsapp) return

    val dedupe = "${relative.lowercase(Locale.ROOT)}|$name|$size"
    if (!seen.add(dedupe)) return

    val taken = when {
      takenCol >= 0 && cursor.getLong(takenCol) > 0L -> cursor.getLong(takenCol)
      modifiedCol >= 0 && cursor.getLong(modifiedCol) > 0L -> cursor.getLong(modifiedCol) * 1000L
      addedCol >= 0 && cursor.getLong(addedCol) > 0L -> cursor.getLong(addedCol) * 1000L
      else -> System.currentTimeMillis()
    }
    val mediaId = cursor.getLong(idCol)
    val mime = if (mimeCol >= 0) cursor.getString(mimeCol).orEmpty() else ""
    out.add(
      mapOf(
        "id" to stableId(relative, name, size),
        "uri" to ContentUris.withAppendedId(collection, mediaId).toString(),
        "fileName" to name,
        "mimeType" to mime,
        "sizeBytes" to size,
        "takenAt" to taken,
        "relativePath" to relative,
        "source" to if (camera) "camera" else "whatsapp",
      ),
    )
  }

  private fun imageCollection(): Uri =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }

  private fun videoCollection(): Uri =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    }

  private fun granted(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun legacyRead(context: Context): Boolean {
    if (granted(context, Manifest.permission.READ_EXTERNAL_STORAGE)) return true
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()
  }

  private fun stableId(relative: String, name: String, size: Long): String {
    val digest = MessageDigest.getInstance("SHA-256")
      .digest("gallery|$relative|$name|$size".toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { byte -> "%02x".format(Locale.ROOT, byte) }
  }
}

/** Avisa o JavaScript quando a galeria muda, com uma pausa para não disparar a cada miniatura. */
internal object GalleryWatch {
  private const val DEBOUNCE_MS = 8_000L
  private val handler = Handler(Looper.getMainLooper())
  private var observer: ContentObserver? = null
  private var pending: Runnable? = null

  fun start(context: Context) {
    if (observer != null) return
    val appContext = context.applicationContext
    val created = object : ContentObserver(handler) {
      override fun onChange(selfChange: Boolean) {
        schedule()
      }

      override fun onChange(selfChange: Boolean, uri: Uri?) {
        schedule()
      }
    }
    observer = created
    appContext.contentResolver.registerContentObserver(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      true,
      created,
    )
    appContext.contentResolver.registerContentObserver(
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
      true,
      created,
    )
  }

  fun stop(context: Context?) {
    val current = observer ?: return
    pending?.let(handler::removeCallbacks)
    pending = null
    observer = null
    runCatching { context?.applicationContext?.contentResolver?.unregisterContentObserver(current) }
  }

  private fun schedule() {
    pending?.let(handler::removeCallbacks)
    val task = Runnable {
      pending = null
      OtherSideNotificationCaptureModule.getInstance()?.emitGalleryChanged()
    }
    pending = task
    handler.postDelayed(task, DEBOUNCE_MS)
  }
}
