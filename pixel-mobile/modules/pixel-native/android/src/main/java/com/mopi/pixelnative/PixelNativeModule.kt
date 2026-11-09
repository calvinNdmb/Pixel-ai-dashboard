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
import java.util.Locale

/** The app's side of the native parts (modules/pixel-native/index.ts): it mirrors Pixel's address for the share screen and
 *  the notification listener, and runs the notification settings (App.tsx's Notifs screen). */
class PixelNativeModule : Module() {
  private val ctx: Context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PixelNative")

    Constant("version") {
      try {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""
      } catch (e: Exception) {
        ""
      }
    }

    AsyncFunction("setPixel") { url: String? ->
      PixelStore.update(ctx) {
        val same = it.url == url                                   // another Pixel: his limit is not known yet
        it.copy(url = url?.trim()?.takeIf { u -> u.isNotEmpty() }, castMaxMb = if (same) it.castMaxMb else 0.0, castOkMb = if (same) it.castOkMb else 0.0)
      }
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
      if (!c.ready) return@AsyncFunction result(false, "Relie d’abord ce téléphone à Pixel : scanne son QR code.")
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
