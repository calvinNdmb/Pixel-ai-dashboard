package com.mopi.pixelnative

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File

/** What the native parts need while the app is closed (the share screen, the notification listener): Pixel's address and
 *  access code, mirrored from the app's secure store (App.tsx), and the notification settings. A private file in
 *  no_backup/: only this app reads it, and it never goes into a backup. */
object PixelStore {
  data class Config(
    val url: String? = null,                    // what Pixel's QR code holds: http://pixel.local:8080/?t=<code>
    val notifOn: Boolean = false,               // off by default
    val notifTitle: Boolean = false,            // the title (often the sender) too: off by default
    val apps: Map<String, String> = emptyMap(), // the apps picked: package -> label
    val castMaxMb: Double = 0.0,                // the biggest file Pixel takes, once it said so (0: not known)
    val castOkMb: Double = 0.0,                 // the biggest file he took while castMaxMb was not known
  ) {
    private val uri: Uri? get() = url?.let { runCatching { Uri.parse(it) }.getOrNull() }
    val base: String?
      get() = uri?.takeIf { (it.scheme == "http" || it.scheme == "https") && !it.encodedAuthority.isNullOrEmpty() }
        ?.let { "${it.scheme}://${it.encodedAuthority}" }
    val token: String? get() = uri?.let { runCatching { it.getQueryParameter("t") }.getOrNull() }?.takeIf { it.isNotEmpty() }
    val ready: Boolean get() = base != null && token != null
  }

  private var cache: Config? = null

  private fun file(ctx: Context) = File(ctx.noBackupFilesDir, "pixel.json")

  @Synchronized
  fun get(ctx: Context): Config {
    cache?.let { return it }
    val c = try {
      read(JSONObject(file(ctx).readText()))
    } catch (e: Exception) {
      Config()
    }
    cache = c
    return c
  }

  @Synchronized
  fun update(ctx: Context, change: (Config) -> Config): Config {
    val c = change(get(ctx))
    val f = file(ctx)
    val tmp = File(f.parentFile, f.name + ".tmp")
    tmp.writeText(write(c).toString())
    if (!tmp.renameTo(f)) {
      f.writeText(write(c).toString())
      tmp.delete()
    }
    cache = c
    return c
  }

  private fun read(j: JSONObject): Config {
    val apps = j.optJSONObject("apps")
    return Config(
      url = j.optString("url").takeIf { it.isNotEmpty() },
      notifOn = j.optBoolean("notifOn", false),
      notifTitle = j.optBoolean("notifTitle", false),
      apps = apps?.keys()?.asSequence()?.associateWith { apps.optString(it) } ?: emptyMap(),
      castMaxMb = j.optDouble("castMaxMb", 0.0).takeIf { !it.isNaN() } ?: 0.0,
      castOkMb = j.optDouble("castOkMb", 0.0).takeIf { !it.isNaN() } ?: 0.0,
    )
  }

  private fun write(c: Config) = JSONObject().apply {
    c.url?.let { put("url", it) }
    put("notifOn", c.notifOn)
    put("notifTitle", c.notifTitle)
    put("apps", JSONObject(c.apps))
    put("castMaxMb", c.castMaxMb)
    put("castOkMb", c.castOkMb)
  }
}
