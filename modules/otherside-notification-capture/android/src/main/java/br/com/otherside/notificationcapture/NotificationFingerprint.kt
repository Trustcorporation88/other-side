package br.com.otherside.notificationcapture

import java.security.MessageDigest
import java.util.Locale

/** Identidade estável da mesma notificação, sem depender do horário de reentrega. */
internal object NotificationFingerprint {
  fun create(
    packageName: String,
    notificationKey: String,
    conversation: String,
    sender: String,
    message: String,
  ): String = hash(
    listOf(packageName, notificationKey, conversation, sender, message)
      .joinToString("\u0000") { normalize(it) },
  )

  /** Assinatura de conteúdo usada apenas para limpar cópias idênticas já existentes. */
  fun content(
    packageName: String,
    conversation: String,
    sender: String,
    message: String,
  ): String = hash(
    listOf(packageName, conversation, sender, message)
      .joinToString("\u0000") { normalize(it) },
  )

  private fun normalize(value: String): String = value
    .replace(Regex("\\s+"), " ")
    .trim()
    .lowercase(Locale.ROOT)

  private fun hash(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { byte -> "%02x".format(Locale.ROOT, byte) }
  }
}
