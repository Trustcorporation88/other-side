package br.com.otherside.notificationcapture

import android.os.Build
import android.os.FileObserver
import java.io.File

/**
 * Observa uma árvore de diretórios inteira. O FileObserver nativo enxerga apenas um nível,
 * então cada subpasta ganha o seu próprio observador e novas subpastas passam a ser observadas
 * assim que o WhatsApp as cria (as notas de voz ficam em subpastas por mês, ex.: 202510/).
 */
internal class RecursiveFileObserver(
  private val root: File,
  private val onFileReady: (File) -> Unit,
) {
  private val observers = mutableMapOf<String, FileObserver>()
  private val lock = Any()

  fun start() = synchronized(lock) {
    if (observers.isNotEmpty()) return
    watchTree(root, reportExisting = false)
  }

  fun stop() = synchronized(lock) {
    observers.values.forEach { it.stopWatching() }
    observers.clear()
  }

  private fun watchTree(dir: File, reportExisting: Boolean) {
    if (!dir.isDirectory) return
    watchDir(dir)
    dir.listFiles()?.forEach { child ->
      when {
        child.isDirectory -> watchTree(child, reportExisting)
        reportExisting && child.isFile -> onFileReady(child)
      }
    }
  }

  private fun watchDir(dir: File) {
    val path = dir.absolutePath
    if (observers.containsKey(path)) return
    val observer = createObserver(dir)
    observers[path] = observer
    observer.startWatching()
  }

  private fun createObserver(dir: File): FileObserver =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      object : FileObserver(dir, MASK) {
        override fun onEvent(event: Int, path: String?) = handle(dir, event, path)
      }
    } else {
      @Suppress("DEPRECATION")
      object : FileObserver(dir.absolutePath, MASK) {
        override fun onEvent(event: Int, path: String?) = handle(dir, event, path)
      }
    }

  private fun handle(dir: File, event: Int, path: String?) {
    val name = path ?: return
    val target = File(dir, name)
    val type = event and FileObserver.ALL_EVENTS

    // Uma subpasta nova precisa ser observada; arquivos já movidos para dentro são reportados.
    if (type and (FileObserver.CREATE or FileObserver.MOVED_TO) != 0 && target.isDirectory) {
      synchronized(lock) { watchTree(target, reportExisting = true) }
      return
    }

    // CLOSE_WRITE = download concluído; MOVED_TO = arquivo movido já pronto para dentro da pasta.
    if (type and (FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) != 0 && target.isFile) {
      onFileReady(target)
    }
  }

  private companion object {
    const val MASK = FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO or FileObserver.CREATE
  }
}
