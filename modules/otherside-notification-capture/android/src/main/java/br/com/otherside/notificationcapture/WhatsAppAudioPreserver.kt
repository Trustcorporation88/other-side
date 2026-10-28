package br.com.otherside.notificationcapture

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Environment
import android.util.Log
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Preserva notas de voz, fotos e documentos do WhatsApp copiando o arquivo para o armazenamento
 * privado do OtherSide assim que ele aparece no disco — antes que o WhatsApp o apague. Nunca envia
 * nada para fora do aparelho: tudo é cópia local.
 *
 * Só funciona no Android 11+ (R) com acesso a todos os arquivos (MANAGE_EXTERNAL_STORAGE),
 * porque a pasta de mídia do WhatsApp vive sob Android/media/com.whatsapp e exige esse acesso
 * para ser lida por outro app.
 */
internal object WhatsAppAudioPreserver {
  private const val TAG = "OtherSideAudio"
  private const val DEST_DIR = "preserved_audio"
  private const val THUMB_DIR = "preserved_thumb"
  private const val THUMB_TARGET_PX = 320

  /** No primeiro start copiamos o que chegou recentemente; o resto é apenas observado ao vivo. */
  private const val INITIAL_SCAN_WINDOW_MS = 14L * 24 * 60 * 60 * 1000

  /** Teto de segurança para a enumeração do backup completo. */
  private const val MAX_LIST = 20000

  private val AUDIO_EXTENSIONS = setOf("opus", "oga", "ogg", "m4a", "aac", "mp3", "amr", "wav")
  private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic")
  // Documentos para o backup completo no Drive (sem vídeo, de propósito).
  private val DOCUMENT_EXTENSIONS = setOf(
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf", "odt", "zip",
  )

  // Documentos também entram no observador ao vivo: se o remetente apagar depois do download,
  // a cópia local já existe para o Drive e a aba Docs.
  private val DOCUMENT_RELATIVE_ROOTS = listOf(
    "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents",
    "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Documents",
    "WhatsApp/Media/WhatsApp Documents",
    "WhatsApp Business/Media/WhatsApp Documents",
  )

  private val CANDIDATE_RELATIVE_ROOTS = listOf(
    "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes",
    "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Audio",
    "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images",
    "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Voice Notes",
    "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Audio",
    "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Images",
    // Caminhos legados (aparelhos atualizados de versões antigas do WhatsApp).
    "WhatsApp/Media/WhatsApp Voice Notes",
    "WhatsApp/Media/WhatsApp Audio",
    "WhatsApp/Media/WhatsApp Images",
    "WhatsApp Business/Media/WhatsApp Voice Notes",
    "WhatsApp Business/Media/WhatsApp Audio",
    "WhatsApp Business/Media/WhatsApp Images",
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
    return (CANDIDATE_RELATIVE_ROOTS + DOCUMENT_RELATIVE_ROOTS)
      .map { File(base, it) }
      .filter { it.isDirectory }
  }

  /** Copia o que já está no disco dentro da janela recente, para não perder mídia acabada de chegar. */
  private fun scanExisting(context: Context, roots: List<File>) {
    val cutoff = System.currentTimeMillis() - INITIAL_SCAN_WINDOW_MS
    roots.forEach { root ->
      runCatching {
        root.walkTopDown()
          .filter { it.isFile && isMedia(it.name) && it.lastModified() >= cutoff }
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
      if (!isMedia(file.name) || !file.isFile || file.length() == 0L) return
      if (PreservedAudioStore.hasSameFile(context, file.absolutePath, file.length())) return
      val sourceKey = sourceKey(file)

      val destDir = File(context.filesDir, DEST_DIR).apply { mkdirs() }
      val id = hash(sourceKey)
      val extension = file.extension.lowercase(Locale.ROOT)
      val dest = File(destDir, if (extension.isEmpty()) id else "$id.$extension")
      file.inputStream().use { input -> dest.outputStream().use(input::copyTo) }

      val kind = kindOf(file.name)
      // Miniatura só para imagens: mantém a galeria leve e sobrevive ao apagar o arquivo cheio.
      val thumbPath = if (kind == PreservedAudio.KIND_IMAGE) writeThumbnail(context, dest, id).orEmpty() else ""

      val media = PreservedAudio(
        id = id,
        sourceKey = sourceKey,
        fileName = file.name,
        localPath = dest.absolutePath,
        sizeBytes = dest.length(),
        sourcePackage = packageOf(file.absolutePath),
        origin = originOf(file.absolutePath),
        originalModifiedAt = file.lastModified(),
        preservedAt = System.currentTimeMillis(),
        kind = kind,
        thumbPath = thumbPath,
      )
      if (PreservedAudioStore.save(context, media)) {
        OtherSideNotificationCaptureModule.getInstance()?.emitAudioPreserved(media)
      }
    } catch (error: Exception) {
      Log.e(TAG, "Não foi possível preservar a mídia", error)
    }
  }

  internal fun isAudio(name: String): Boolean =
    name.substringAfterLast('.', "").lowercase(Locale.ROOT) in AUDIO_EXTENSIONS

  internal fun isImage(name: String): Boolean =
    name.substringAfterLast('.', "").lowercase(Locale.ROOT) in IMAGE_EXTENSIONS

  internal fun isDocument(name: String): Boolean =
    name.substringAfterLast('.', "").lowercase(Locale.ROOT) in DOCUMENT_EXTENSIONS

  /** Observador ao vivo: áudio, imagem e documento (copiados localmente para recuperar apagados). */
  internal fun isMedia(name: String): Boolean = isAudio(name) || isImage(name) || isDocument(name)

  /** Backup completo no Drive: a mesma mídia do observador (sem vídeo). */
  internal fun isAnyMedia(name: String): Boolean = isMedia(name)

  internal fun kindOf(name: String): String = when {
    isImage(name) -> PreservedAudio.KIND_IMAGE
    isDocument(name) -> PreservedAudio.KIND_DOCUMENT
    else -> PreservedAudio.KIND_AUDIO
  }

  internal fun packageOf(path: String): String = when {
    path.contains("com.whatsapp.w4b") -> "com.whatsapp.w4b"
    else -> "com.whatsapp"
  }

  internal fun originOf(path: String): String {
    // Caminhos do Android usam sempre '/'; normalizamos para o teste rodar também no host.
    val lower = path.replace('\\', '/').lowercase(Locale.ROOT)
    return if (lower.contains("/sent/")) PreservedAudio.ORIGIN_SENT else PreservedAudio.ORIGIN_RECEIVED
  }

  /** Gera uma miniatura JPEG pequena de uma imagem já copiada. Devolve o caminho ou null. */
  private fun writeThumbnail(context: Context, imageFile: File, id: String): String? {
    return try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(imageFile.absolutePath, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

      var sample = 1
      while (bounds.outWidth / (sample * 2) >= THUMB_TARGET_PX &&
        bounds.outHeight / (sample * 2) >= THUMB_TARGET_PX
      ) {
        sample *= 2
      }

      val options = BitmapFactory.Options().apply { inSampleSize = sample }
      val bitmap = BitmapFactory.decodeFile(imageFile.absolutePath, options) ?: return null
      val thumbDir = File(context.filesDir, THUMB_DIR).apply { mkdirs() }
      val thumbFile = File(thumbDir, "$id.jpg")
      thumbFile.outputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out) }
      bitmap.recycle()
      thumbFile.absolutePath
    } catch (_: Exception) {
      null
    }
  }

  /**
   * Enumera TODA a mídia (áudio, imagem, documento; sem vídeo) presente no disco — SEM copiar.
   * Base do backup completo no Drive: os arquivos são enviados direto da pasta do WhatsApp.
   */
  fun listAllMedia(context: Context): List<Map<String, Any>> {
    if (!isSupported()) return emptyList()
    @Suppress("DEPRECATION")
    val base = Environment.getExternalStorageDirectory() ?: return emptyList()
    val roots = (CANDIDATE_RELATIVE_ROOTS + DOCUMENT_RELATIVE_ROOTS)
      .map { File(base, it) }
      .filter { it.isDirectory }

    val candidates = ArrayList<File>()
    for (root in roots) {
      runCatching {
        root.walkTopDown()
          .filter { it.isFile && it.length() > 0L && isAnyMedia(it.name) }
          .forEach(candidates::add)
      }
    }
    // Mais recentes primeiro: o teto não pode esconder o áudio de hoje atrás de 20 mil arquivos velhos.
    candidates.sortByDescending { it.lastModified() }

    val out = ArrayList<Map<String, Any>>()
    val seen = HashSet<String>()
    for (file in candidates) {
      if (out.size >= MAX_LIST) break
      val id = hash(sourceKey(file))
      if (!seen.add(id)) continue
      out.add(
        mapOf(
          "id" to id,
          "uri" to "file://${file.absolutePath}",
          "fileName" to file.name,
          "kind" to kindOf(file.name),
          "originalModifiedAt" to file.lastModified(),
          "sizeBytes" to file.length(),
        ),
      )
    }
    return out
  }

  /**
   * Identidade estável: caminho + tamanho. A data de modificação fica de fora porque o
   * WhatsApp regrava o mesmo arquivo (o lastModified muda e o tamanho não) e isso fazia
   * o backup enviar a mesma nota de voz várias vezes. Chaves antigas, com o horário no
   * final, ainda contam como o mesmo arquivo.
   */
  private fun sourceKey(file: File): String = "${file.absolutePath}|${file.length()}"

  internal fun sameSourceFile(storedKey: String, path: String, size: Long): Boolean {
    if (path.isEmpty() || size <= 0L || storedKey.isEmpty()) return false
    if (storedKey == "$path|$size") return true
    return storedKey.startsWith("$path|$size|")
  }

  private fun hash(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { byte -> "%02x".format(Locale.ROOT, byte) }
  }
}
