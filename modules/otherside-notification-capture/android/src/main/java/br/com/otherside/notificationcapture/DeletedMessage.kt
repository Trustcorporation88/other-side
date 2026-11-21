package br.com.otherside.notificationcapture

import java.util.Locale

/**
 * Texto que o WhatsApp coloca no lugar da mensagem quando ela é apagada para todos.
 * Só vale a frase inteira (ou "Nome: frase"), nunca um trecho dentro de outra mensagem.
 */
internal object DeletedMessage {
  private val PLACEHOLDERS = setOf(
    "mensagem apagada",
    "esta mensagem foi apagada",
    "você apagou esta mensagem",
    "voce apagou esta mensagem",
    "esta mensagem foi eliminada",
    "eliminou esta mensagem",
    "eliminaste esta mensagem",
    "você eliminou esta mensagem",
    "voce eliminou esta mensagem",
    "this message was deleted",
    "you deleted this message",
  )

  fun isPlaceholder(text: String): Boolean {
    val lines = text.split('\n').map(::normalizeLine).filter { it.isNotEmpty() }
    if (lines.isEmpty()) return false
    return lines.all(::isPlaceholderLine)
  }

  private fun isPlaceholderLine(normalized: String): Boolean {
    if (normalized in PLACEHOLDERS) return true
    val colon = normalized.indexOf(':')
    if (colon <= 0) return false
    val prefix = normalized.substring(0, colon).trim()
    val suffix = normalized.substring(colon + 1).trim()
    if (suffix !in PLACEHOLDERS || !looksLikeSender(prefix)) return false
    return true
  }

  /** "SISi: Mensagem apagada" no estilo caixa de entrada. Uma frase com dois-pontos não entra. */
  private fun looksLikeSender(prefix: String): Boolean {
    if (prefix.isEmpty() || prefix.length > 48 || prefix.contains('.')) return false
    val words = prefix.split(' ').filter { it.isNotEmpty() }
    return words.size in 1..4
  }

  private fun normalizeLine(value: String): String {
    val cleaned = value
      .replace("\u200B", "")
      .replace("\u200E", "")
      .replace("\u200F", "")
      .replace("\uFEFF", "")
      .replace(Regex("\\s+"), " ")
      .trim()
      .lowercase(Locale.ROOT)
      .trimEnd('.', '…', '!')
    return cleaned.replace(Regex("^[^\\p{L}\\p{N}]+"), "").trim()
  }
}
