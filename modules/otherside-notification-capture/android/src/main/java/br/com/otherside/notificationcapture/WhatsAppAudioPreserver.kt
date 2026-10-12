package br.com.otherside.notificationcapture

import android.content.Context
import android.os.Build
import android.os.Environment
import android.util.Log
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Preserva as notas de voz e áudios do WhatsApp copiando o arquivo para o armazenamento privado
 * do OtherSide assim que ele aparece no disco — antes que o WhatsApp o apague. Nunca envia nada
 * para fora do aparelho: tudo é cópia local.
 *
 * Só funciona no Android 11+ (R) com acesso a todos os arquivos (MANAGE_EXTERNAL_STORAGE),
 * porque a pasta de mídia do WhatsApp vive sob Android/media/com.whatsapp e exige esse acesso
 * para ser lida por outro app.
 */
internal object WhatsAppAudioPreserver {
  private const val TAG = "OtherSideAudio"
  private const val DEST_DIR = "preserved_audio"

  /** No primeiro start copiamos o que chegou recentemente; o resto é apenas observado ao vivo. */
  private const val INITIAL_SCAN_WINDOW_MS = 14L * 24 * 60 * 60 * 1000

  private val AUDIO_EXTENSIONS = setOf("opus", "oga", "ogg", "m4a", "aac", "mp3", "amr", "wav")

  private val CANDIDATE_RELATIVE_ROOTS = listOf(
    "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes",
    "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Audio",
    "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Voice Notes",
    "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Audio",
    // Caminhos legados (aparelhos atualizados de versões antigas do WhatsApp).
    "WhatsApp/Media/WhatsApp Voice Notes",
    "WhatsApp/Media/WhatsApp Audio",
    "WhatsApp Business/Media/WhatsApp Voice Notes",
    "WhatsApp Business/Media/WhatsApp Audio",
  )

  private val lock = Any()
  private val worker = Executors.newSingleThreadExecutor()
  private val observers = mutableListOf<RecursiveFileObserver>()

  /** Android 11+ com acesso a todos os arquivos concedido. */
  fun isSupported(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()

  fun start(context: Context) {
    val appContext = context.applicationContext
    val roots: List<File>
    synchronized(lock) {
      if (!isSupported()) return
      roots = existingRoots()
      if (roots.isEmpty()) return
      // Observadores ao vivo: criados uma única vez.
      if (observers.isEmpty()) {
        roots.forEach { root ->
          RecursiveFileObserver(root) { file -> submit(appContext, file) }
            .also { it.start() }
            .let(observers::add)
        }
      }
    }
    // Varredura de recuperação a cada chamada (inclui o retorno do app ao primeiro plano),
    // pois o inotify do Android 11+ pode perder eventos em alguns aparelhos.
    worker.execute { scanExisting(appContext, roots) }
  }

  fun stop() = synchronized(lock) {
    observers.forEach { it.stop() }
    observers.clear()
  }

  private fun existingRoots(): List<File> {
    @Suppress("DEPRECATION")
    val base = Environment.getExternalStorageDirectory() ?: return emptyList()
    return CANDIDATE_RELATIVE_ROOTS
      .map { File(base, it) }
      .filter { it.isDirectory }
  }

  /** Copia o que já está no disco dentro da janela recente, para não perder áudios acabados de chegar. */
  private fun scanExisting(context: Context, roots: List<File>) {
    val cutoff = System.currentTimeMillis() - INITIAL_SCAN_WINDOW_MS
    roots.forEach { root ->
      runCatching {
        root.walkTopDown()
          .filter { it.isFile && isAudio(it.name) && it.lastModified() >= cutoff }
          .sortedByDescending { it.lastModified() }
          .forEach { preserve(context, it) }
      }
    }
  }

  private fun submit(context: Context, file: File) {
    worker.execute { preserve(context, file) }
  }

  private fun preserve(context: Context, file: File) {
    try {
      if (!isAudio(file.name) || !file.isFile || file.length() == 0L) return
      val sourceKey = sourceKey(file)
      if (PreservedAudioStore.has(context, sourceKey)) return

      val destDir = File(context.filesDir, DEST_DIR).apply { mkdirs() }
      val id = hash(sourceKey)
      val extension = file.extension.lowercase(Locale.ROOT)
      val dest = File(destDir, if (extension.isEmpty()) id else "$id.$extension")
      file.inputStream().use { input -> dest.outputStream().use(input::copyTo) }

      val audio = PreservedAudio(
        id = id,
        sourceKey = sourceKey,
        fileName = file.name,
        localPath = dest.absolutePath,
        sizeBytes = dest.length(),
        sourcePackage = packageOf(file.absolutePath),
        origin = originOf(file.absolutePath),
        originalModifiedAt = file.lastModified(),
        preservedAt = System.currentTimeMillis(),
      )
      if (PreservedAudioStore.save(context, audio)) {
        OtherSideNotificationCaptureModule.getInstance()?.emitAudioPreserved(audio)
      }
    } catch (error: Exception) {
      Log.e(TAG, "Não foi possível preservar o áudio", error)
    }
  }

  internal fun isAudio(name: String): Boolean =
    name.substringAfterLast('.', "").lowercase(Locale.ROOT) in AUDIO_EXTENSIONS

  internal fun packageOf(path: String): String = when {
    path.contains("com.whatsapp.w4b") -> "com.whatsapp.w4b"
    else -> "com.whatsapp"
  }

  internal fun originOf(path: String): String {
    // Caminhos do Android usam sempre '/'; normalizamos para o teste rodar também no host.
    val lower = path.replace('\\', '/').lowercase(Locale.ROOT)
    return if (lower.contains("/sent/")) PreservedAudio.ORIGIN_SENT else PreservedAudio.ORIGIN_RECEIVED
  }

  private fun sourceKey(file: File): String =
    "${file.absolutePath}|${file.length()}|${file.lastModified()}"

  private fun hash(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { byte -> "%02x".format(Locale.ROOT, byte) }
  }
}
