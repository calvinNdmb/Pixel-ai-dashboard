package com.mopi.pixelnative

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.Locale

/** The app's side of the native parts (modules/pixel-native/index.ts): it mirrors Pixel's address for the share screen and
 *  the notification listener, and runs the notification settings (src/Notifs.tsx). With no Pi linked, it hands the
 *  listener's notifications to the app (onNotif) while the app listens, for the phone's own Pixel. */
class PixelNativeModule : Module() {
  private val ctx: Context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  @Volatile private var heard = false                      // the app listens to onNotif (the phone's Pixel is shown)

  override fun definition() = ModuleDefinition {
    Name("PixelNative")

    Events("onNotif")
    OnCreate { live = WeakReference(this@PixelNativeModule) }
    OnDestroy { if (live?.get() === this@PixelNativeModule) live = null }
    OnStartObserving("onNotif") { heard = true }
    OnStopObserving("onNotif") { heard = false }

    Constant("version") {
      try {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""
      } catch (e: Exception) {
        ""
      }
    }

    AsyncFunction("setPixel") { url: String? ->
      val u = url?.trim()?.takeIf { it.isNotEmpty() }
      val before = PixelStore.get(ctx)
      val now = PixelStore.update(ctx) {
        val same = it.url == u                                     // another Pixel: his limit is not known yet
        // a Pi linked where there was none: notifications switched on for the phone's Pixel alone never start going
        // out to him by themselves; sending them to the Pi is a choice of its own
        it.copy(url = u, castMaxMb = if (same) it.castMaxMb else 0.0, castOkMb = if (same) it.castOkMb else 0.0,
          notifOn = it.notifOn && !(it.url == null && u != null))
      }
      if (before.notifOn && !now.notifOn) NotificationRelay.follow(ctx, false)
      Unit
    }

    AsyncFunction("getNotif") {
      val c = PixelStore.get(ctx)
      mapOf(
        "on" to c.notifOn,
        "title" to c.notifTitle,
        "apps" to c.apps.map { (pkg, label) -> mapOf("pkg" to pkg, "label" to label) },
        "access" to NotificationRelay.allowed(ctx),
      )
    }

    AsyncFunction("setNotifOn") { on: Boolean ->
      PixelStore.update(ctx) { it.copy(notifOn = on) }
      NotificationRelay.follow(ctx, on)                              // off: Android stops feeding the listener too
      Unit
    }

    AsyncFunction("setNotifTitle") { on: Boolean ->
      PixelStore.update(ctx) { it.copy(notifTitle = on) }
      Unit
    }

    AsyncFunction("setNotifApps") { apps: Map<String, String> ->
      PixelStore.update(ctx) { it.copy(apps = apps.filterKeys { k -> k.isNotBlank() && k != ctx.packageName }) }
      Unit
    }

    Function("notifAccess") {
      NotificationRelay.allowed(ctx)
    }

    AsyncFunction("openNotifAccess") {
      val cn = NotificationRelay.component(ctx).flattenToString()
      val detail = if (Build.VERSION.SDK_INT >= 30) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, cn)
      } else {
        null
      }
      open(detail) || open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openAppInfo") {
      open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", ctx.packageName, null)))
    }.runOnQueue(Queues.MAIN)

    // the phone's apps, as its launcher shows them (the <queries> of app.plugin.js make them visible)
    AsyncFunction("listApps") {
      val pm = ctx.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val found = if (Build.VERSION.SDK_INT >= 33) {
        pm.queryIntentActivities(launcher, PackageManager.ResolveInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.queryIntentActivities(launcher, 0)
      }
      found.map { it.activityInfo.packageName to it.activityInfo.applicationInfo.loadLabel(pm).toString() }
        .filter { it.first != ctx.packageName }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase(Locale.FRENCH) }
        .map { (pkg, label) -> mapOf("pkg" to pkg, "label" to label) }
    }

    // « Envoyer une notification de test »: the listener's own way to Pixel, with the settings as they are
    AsyncFunction("sendTest") {
      val c = PixelStore.get(ctx)
      if (!c.ready) return@AsyncFunction result(false, "Relie d’abord Pixel à ton Pi : bouton retour, puis « Relier à mon Pixel ».")
      val body = JSONObject().put("app", "Pixel pour Android")
      if (c.notifTitle) body.put("title", "Notification de test")
      try {
        val a = PixelHttp.postJson(c, "/api/notif", body)
        when {
          a.ok -> result(true, "Envoyée ✓ Regarde Pixel : il réagit.")
          a.status == 404 -> result(false, "Ce Pixel ne connaît pas encore les notifications du téléphone : mets-le à jour sur le Pi.")
          else -> result(false, a.error ?: "Pixel a refusé (erreur ${a.status}).")
        }
      } catch (e: PixelHttp.NoAnswer) {
        result(false, PixelHttp.NO_ANSWER)
      } catch (e: Exception) {
        result(false, PixelHttp.NO_ANSWER)
      }
    }
  }

  private fun result(ok: Boolean, message: String) = mapOf("ok" to ok, "message" to message)

  companion object {
    @Volatile private var live: WeakReference<PixelNativeModule>? = null

    /** Does the app listen to onNotif right now (it is open, on the phone's own Pixel)? */
    fun listening(): Boolean = live?.get()?.heard == true

    /** No Pi linked: a notification for the phone's own Pixel, to the app only, never kept. false: nobody listens. */
    fun toApp(n: Map<String, Any?>): Boolean {
      val m = live?.get()?.takeIf { it.heard } ?: return false
      return runCatching { m.sendEvent("onNotif", n) }.isSuccess
    }
  }

  private fun open(i: Intent?): Boolean {
    if (i == null) return false
    val from = appContext.currentActivity
    return try {
      if (from != null) from.startActivity(i) else ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (e: ActivityNotFoundException) {
      false
    } catch (e: SecurityException) {
      false
    }
  }
}
