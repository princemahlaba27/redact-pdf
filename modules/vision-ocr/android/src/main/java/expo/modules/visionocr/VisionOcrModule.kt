package expo.modules.visionocr

import android.graphics.BitmapFactory
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.net.URL

/**
 * Android text recognition stub.
 * Returns an empty list unless ML Kit is added later — keeps the JS pipeline
 * compiling and fail-closed (no invented boxes) on Android builds.
 * iOS uses Apple Vision for production OCR.
 */
class VisionOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VisionOcr")

    Function("isAvailable") {
      false
    }

    AsyncFunction("recognizeText") { uriString: String ->
      // Fail closed: no mock boxes. Wire ML Kit here for Android OCR.
      emptyList<Map<String, Any>>()
    }
  }
}
