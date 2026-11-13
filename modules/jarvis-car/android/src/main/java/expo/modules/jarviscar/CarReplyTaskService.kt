package expo.modules.jarviscar

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the `JarvisCarReply` task registered in index.ts (src/services/carChatService.ts). */
class CarReplyTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val text = intent?.getStringExtra("text") ?: return null
    return HeadlessJsTaskConfig(
      "JarvisCarReply",
      Arguments.createMap().apply { putString("text", text) },
      30000, // ms, covers the 25 s chat timeout
      true,  // also allowed while the app is in the foreground
    )
  }
}
