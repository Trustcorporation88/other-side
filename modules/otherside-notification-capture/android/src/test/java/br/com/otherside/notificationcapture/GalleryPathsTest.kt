package br.com.otherside.notificationcapture

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GalleryPathsTest {
  @Test
  fun `a camera fica em DCIM Camera`() {
    assertTrue(GalleryPaths.isCamera("DCIM/Camera/", null))
    assertTrue(GalleryPaths.isCamera("DCIM/Camera", "/storage/emulated/0/DCIM/Camera/IMG_20261014_120000.jpg"))
    assertTrue(GalleryPaths.isCamera(null, "/storage/emulated/0/DCIM/Camera/IMG_20261014_120000.jpg"))
    assertFalse(GalleryPaths.isCamera("DCIM/Screenshots/", null))
    assertFalse(GalleryPaths.isCamera("DCIM/CameraRoll/", null))
    assertFalse(GalleryPaths.isCamera("Pictures/WhatsApp Images/", null))
  }

  @Test
  fun `imagens do WhatsApp sao opcionais e nao incluem a camera`() {
    assertTrue(GalleryPaths.isWhatsAppGallery("Pictures/WhatsApp Images/", null))
    assertTrue(GalleryPaths.isWhatsAppGallery("Pictures/WhatsApp/", null))
    assertTrue(
      GalleryPaths.isWhatsAppGallery(
        "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/",
        null,
      ),
    )
    assertTrue(
      GalleryPaths.isWhatsAppGallery(
        "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Video/",
        null,
      ),
    )
    assertTrue(
      GalleryPaths.isWhatsAppGallery(
        null,
        "/storage/emulated/0/WhatsApp/Media/WhatsApp Images/IMG-20261014-WA0001.jpg",
      ),
    )
    assertFalse(GalleryPaths.isWhatsAppGallery("DCIM/Camera/", null))
    assertFalse(GalleryPaths.isWhatsAppGallery("Download/", null))
    assertFalse(GalleryPaths.isWhatsAppGallery("Pictures/Instagram/", null))
  }
}