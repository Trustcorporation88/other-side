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

  /**
   * Mesma mensagem do MessagingStyle, com o horário dela.
   * O texto entra na identidade para não juntar duas mensagens diferentes no mesmo milissegundo.
   */
  fun messageIdentity(
    packageName: String,
    conversation: String,
    sender: String,
    receivedAt: Long,
    message: String,
  ): String = hash(
    listOf(packageName, conversation, sender, receivedAt.toString(), message)
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

  /**
   * "Mensagem apagada" repetida não é a mesma cópia: cada horário é outro aviso.
   * Texto real igual continua a contar como duplicata, como antes.
   */
  fun dedupKey(
    packageName: String,
    conversation: String,
    sender: String,
    message: String,
    receivedAt: Long,
  ): String {
    val base = content(packageName, conversation, sender, message)
    if (!DeletedMessage.isPlaceholder(message)) return base
    return "$base\u0000$receivedAt"
  }

  private fun normalize(value: String): String = value
    .replace(Regex("\\s+"), " ")
    .trim()
    .lowercase(Locale.ROOT)

  private fun hash(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { byte -> "%02x".format(Locale.ROOT, byte) }
  }
}
