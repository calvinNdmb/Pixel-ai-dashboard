package com.mopi.pixelnative

import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.Executors

/** The phone's notifications, for Pixel's notification scenes (pixel-app/pixel/telephone.py, POST /api/notif). Android runs
 *  this listener once the user allows it (Paramètres > Notifications > Accès aux notifications), whether the app is open
 *  or not. Privacy first: nothing leaves the phone unless the user switched it on in the app and picked the app; Pixel
 *  gets the app's name, the title only if the user allowed it, never the text. Never the ongoing ones (music, navigation,
 *  downloads), the foreground services, the group summaries, the silent ones, the ones Do Not Disturb hides, nor an
 *  update of a notification already sent. Not too often: one per app every APP_GAP_MS, PER_MIN in all. Switched off in
 *  the app, the listener asks Android to unbind it (it then gets nothing, and the process may end) until switched on.
 *  No Pi linked: the same rules, but nothing leaves the phone. Only while the app is open on the phone's own Pixel does
 *  the listener hand the notification to it (PixelNativeModule.toApp); otherwise it is dropped. */
class NotificationRelay : NotificationListenerService() {
  private class Seen(val whenMs: Long, val title: Int, val at: Long)

  private val seen = LinkedHashMap<String, Seen>()     // notification key -> its last post
  private val lastByApp = HashMap<String, Long>()
  private val sent = ArrayDeque<Long>()

  override fun onListenerConnected() {
    super.onListenerConnected()
    live = WeakReference(this)
    if (!PixelStore.get(this).notifOn) unbind()                                    // allowed by Android, but off in the app
  }

  override fun onListenerDisconnected() {
    if (live?.get() === this) live = null
    super.onListenerDisconnected()
  }

  private fun unbind() {
    runCatching { requestUnbind() }.onFailure { Log.i(TAG, "Could not unbind: $it") }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification, rankingMap: RankingMap?) {
    val cfg = PixelStore.get(this)
    if (!cfg.notifOn) return
    val toPi = cfg.ready                                                           // else no Pi linked: the open app, or nobody
    if (!toPi && (cfg.url != null || !PixelNativeModule.listening())) return
    val pkg = sbn.packageName ?: return
    if (pkg == packageName || pkg !in cfg.apps) return
    val n = sbn.notification ?: return
    if (sbn.isOngoing || !sbn.isClearable) return
    if (n.flags and (Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_GROUP_SUMMARY) != 0) return
    if (n.category?.let { it in SKIP } == true) return
    if (rankingMap != null) {
      val r = Ranking()
      if (rankingMap.getRanking(sbn.key, r) && (r.importance < NotificationManager.IMPORTANCE_DEFAULT || !r.matchesInterruptionFilter())) return
    }
    val extras = n.extras
    val title = (extras?.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE) ?: extras?.getCharSequence(Notification.EXTRA_TITLE))
      ?.toString()?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
    val now = SystemClock.elapsedRealtime()
    synchronized(this) {
      val before = seen.remove(sbn.key)
      seen[sbn.key] = Seen(n.`when`, title.hashCode(), now)
      while (seen.size > 300) seen.remove(seen.keys.first())
      if (before != null) {
        if (n.flags and Notification.FLAG_ONLY_ALERT_ONCE != 0) return             // an update that does not ring
        if (before.whenMs == n.`when` && before.title == title.hashCode()) return  // the same one, posted again
        if (now - before.at < 2000) return                                         // a burst of updates
      }
      if (now - (lastByApp[pkg] ?: -APP_GAP_MS) < APP_GAP_MS) return
      while (sent.isNotEmpty() && now - sent.first() > 60_000) sent.removeFirst()
      if (sent.size >= PER_MIN) return
      lastByApp[pkg] = now
      sent.addLast(now)
    }
    val label = (cfg.apps[pkg]?.takeIf { it.isNotBlank() } ?: appLabel(this, pkg)).take(40)
    val shown = if (cfg.notifTitle && title.isNotEmpty()) title.take(60) else null
    if (!toPi) {
      PixelNativeModule.toApp(listOfNotNull("app" to label, shown?.let { "title" to it }, n.category?.let { "category" to it }).toMap())
      return
    }
    val body = JSONObject().put("app", label)
    shown?.let { body.put("title", it) }
    n.category?.let { body.put("category", it) }
    send.execute {
      try {
        val a = PixelHttp.postJson(cfg, "/api/notif", body)
        if (!a.ok) Log.i(TAG, "Pixel refused a notification: ${a.status} ${a.error}")
      } catch (e: Exception) {
        Log.i(TAG, "Pixel did not get a notification: $e")
      }
    }
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification, rankingMap: RankingMap?) {
    synchronized(this) { seen.remove(sbn.key) }                                    // posted again later: news again
  }

  companion object {
    private const val TAG = "PixelNotif"
    private const val APP_GAP_MS = 20_000L
    private const val PER_MIN = 8
    private val SKIP = setOf(
      Notification.CATEGORY_TRANSPORT, Notification.CATEGORY_PROGRESS, Notification.CATEGORY_SERVICE,
      Notification.CATEGORY_SYSTEM, Notification.CATEGORY_STATUS, "navigation", "location_sharing", "stopwatch", "workout",
    )
    private val send = Executors.newSingleThreadExecutor()
    @Volatile private var live: WeakReference<NotificationRelay>? = null      // the listener Android has bound, if any

    fun component(ctx: Context) = ComponentName(ctx, NotificationRelay::class.java)

    /** The app's switch: off, the bound listener lets go; on, Android binds it again (only if the user allowed it). */
    fun follow(ctx: Context, on: Boolean) {
      if (!on) live?.get()?.unbind()
      else runCatching { NotificationListenerService.requestRebind(component(ctx)) }.onFailure { Log.i(TAG, "Could not rebind: $it") }
    }

    /** Has the user allowed Pixel to read the notifications (the system's "Accès aux notifications")? */
    fun allowed(ctx: Context): Boolean {
      val cn = component(ctx)
      if (Build.VERSION.SDK_INT >= 27) {
        return ctx.getSystemService(NotificationManager::class.java)?.isNotificationListenerAccessGranted(cn) == true
      }
      val on = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: return false
      return on.split(':').any { ComponentName.unflattenFromString(it) == cn }
    }

    fun appLabel(ctx: Context, pkg: String): String = try {
      val pm = ctx.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
      pkg
    }
  }
}
