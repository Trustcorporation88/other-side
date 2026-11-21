package br.com.otherside.notificationcapture

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeletedMessageTest {
  @Test
  fun `reconhece os avisos do WhatsApp em portugues e ingles`() {
    assertTrue(DeletedMessage.isPlaceholder("Mensagem apagada"))
    assertTrue(DeletedMessage.isPlaceholder("  Mensagem   apagada. "))
    assertTrue(DeletedMessage.isPlaceholder("Esta mensagem foi apagada"))
    assertTrue(DeletedMessage.isPlaceholder("Você apagou esta mensagem"))
    assertTrue(DeletedMessage.isPlaceholder("Esta mensagem foi eliminada"))
    assertTrue(DeletedMessage.isPlaceholder("Eliminou esta mensagem"))
    assertTrue(DeletedMessage.isPlaceholder("This message was deleted"))
    assertTrue(DeletedMessage.isPlaceholder("You deleted this message"))
    assertTrue(DeletedMessage.isPlaceholder("🚫 Mensagem apagada"))
    assertTrue(DeletedMessage.isPlaceholder("Ana: Mensagem apagada"))
  }

  @Test
  fun `uma frase que so menciona o aviso nao e mensagem apagada`() {
    assertFalse(DeletedMessage.isPlaceholder("Ele falou em mensagem apagada ontem"))
    assertFalse(DeletedMessage.isPlaceholder("This message was deleted from the draft, ignore"))
    assertFalse(DeletedMessage.isPlaceholder("texto original\nMensagem apagada"))
    assertFalse(DeletedMessage.isPlaceholder(""))
  }
}
