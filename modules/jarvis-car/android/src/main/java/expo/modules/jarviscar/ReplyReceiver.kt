package expo.modules.jarviscar

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import com.facebook.react.HeadlessJsTaskService

/** Receives the dictated reply from Android Auto and hands it to the JS task. */
class ReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val text = RemoteInput.getResultsFromIntent(intent)
      ?.getCharSequence(CarNotifier.KEY_REPLY)?.toString()?.trim()
    if (text.isNullOrEmpty()) return

    // Echo the user's line so the car clears its "sending" state straight away.
    CarNotifier.post(context, text, fromUser = true)
    try {
      context.startService(Intent(context, CarReplyTaskService::class.java).putExtra("text", text))
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (_: IllegalStateException) {
      // Background service start refused; the user hears no answer, so say so.
      CarNotifier.post(context, "Open Jarvis on your phone and try again.", fromUser = false)
    }
  }
}
