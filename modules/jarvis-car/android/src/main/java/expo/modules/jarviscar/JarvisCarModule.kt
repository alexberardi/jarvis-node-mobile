package expo.modules.jarviscar

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class JarvisCarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JarvisCar")

    AsyncFunction("postReply") { text: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      CarNotifier.post(context, text, fromUser = false)
    }
  }
}
