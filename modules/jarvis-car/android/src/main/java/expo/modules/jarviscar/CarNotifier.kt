package expo.modules.jarviscar

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat

/**
 * Posts the Jarvis conversation as a MessagingStyle notification. Android Auto
 * shows it, reads it aloud, and offers Reply (voice dictation) and Mark as read.
 * Both semantic actions are required for the car to treat it as a conversation.
 */
object CarNotifier {
  const val CHANNEL_ID = "jarvis_car"
  const val NOTIFICATION_ID = 4001
  const val KEY_REPLY = "reply"
  private const val MAX_HISTORY = 6

  private data class Line(val text: String, val time: Long, val fromUser: Boolean)

  // In memory only: after a process restart the conversation simply starts afresh.
  private val history = ArrayDeque<Line>()

  fun post(context: Context, text: String, fromUser: Boolean) {
    if (text.isBlank()) return
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) return

    synchronized(history) {
      history.addLast(Line(text, System.currentTimeMillis(), fromUser))
      while (history.size > MAX_HISTORY) history.removeFirst()
    }
    ensureChannel(context)

    val jarvis = Person.Builder().setName("Jarvis").setKey("jarvis").setBot(true).build()
    val me = Person.Builder().setName("You").setKey("me").build()
    val style = NotificationCompat.MessagingStyle(me)
    synchronized(history) {
      history.forEach { style.addMessage(it.text, it.time, if (it.fromUser) me else jarvis) }
    }

    val reply = NotificationCompat.Action.Builder(
      context.applicationInfo.icon,
      "Reply",
      PendingIntent.getBroadcast(
        context, 0,
        Intent(context, ReplyReceiver::class.java).setPackage(context.packageName),
        // RemoteInput fills the reply into the intent, so it must be mutable.
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
      ),
    )
      .addRemoteInput(RemoteInput.Builder(KEY_REPLY).setLabel("Reply").build())
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(false)
      .build()

    val markRead = NotificationCompat.Action.Builder(
      context.applicationInfo.icon,
      "Mark as read",
      PendingIntent.getBroadcast(
        context, 1,
        Intent(context, MarkReadReceiver::class.java).setPackage(context.packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      ),
    )
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
      .setShowsUserInterface(false)
      .build()

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setStyle(style)
      .addAction(reply)
      .addAction(markRead)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setOnlyAlertOnce(fromUser)
      .setAutoCancel(false)
      .build()

    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // Permission revoked between the check and the post; nothing to show.
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Jarvis in the car", NotificationManager.IMPORTANCE_HIGH),
      )
    }
  }
}
