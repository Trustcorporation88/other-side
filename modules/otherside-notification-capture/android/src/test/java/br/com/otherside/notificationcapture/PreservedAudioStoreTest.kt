package br.com.otherside.notificationcapture

import org.junit.Assert.assertEquals
import org.junit.Test

class PreservedAudioStoreTest {
  @Test
  fun `chave atual fica igual`() {
    assertEquals("/sdcard/a.opus|1234", PreservedAudioStore.fileKeyOf("/sdcard/a.opus|1234"))
  }

  @Test
  fun `chave antiga perde a data de modificacao`() {
    assertEquals(
      "/sdcard/a.opus|1234",
      PreservedAudioStore.fileKeyOf("/sdcard/a.opus|1234|1730000000000"),
    )
  }

  @Test
  fun `caminho com barra vertical nao e cortado`() {
    assertEquals("/sdcard/a|b.opus|1234", PreservedAudioStore.fileKeyOf("/sdcard/a|b.opus|1234"))
  }
}
