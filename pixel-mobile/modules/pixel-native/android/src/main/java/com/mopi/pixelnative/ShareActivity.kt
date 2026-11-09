package com.mopi.pixelnative

import android.app.Activity
import android.content.ContentResolver
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InterruptedIOException
import java.net.HttpURLConnection
import java.util.Locale
import kotlin.math.roundToInt

/** "Partager > Pixel" from any app: a link (a YouTube video plays on Pixel's screen), a text, a photo, a GIF or a video
 *  goes to Pixel's POST /api/cast (pixel-app/pixel/cast.py), with the address and code the app keeps (PixelStore). The
 *  file is streamed from the sharing app, with the read permission it granted. A small card over that app says how it
 *  went, then goes away: the user is back where he was. Of several photos, the first one goes. The sharing app's provider
 *  is only asked on a worker thread (Drive or Photos may download the file first), and only a content:// address of
 *  another app is read: never a file:// one nor this app's own files, which hold Pixel's access code. */
class ShareActivity : Activity() {
  private sealed class What {
    class Text(val text: String, val title: String) : What()
    class File(val uri: Uri, val mime: String, val name: String, val size: Long, val title: String, val count: Int) : What()
  }

  private class Btn(val label: String, val primary: Boolean = false, val act: () -> Unit)

  private val main = Handler(Looper.getMainLooper())
  private lateinit var card: LinearLayout
  private lateinit var face: TextView
  private lateinit var status: TextView
  private lateinit var detail: TextView
  private lateinit var bar: ProgressBar
  private lateinit var row: LinearLayout
  /** a file of the sharing app that cannot be read (no permission, gone), or an address Pixel never reads */
  private class Unreadable(cause: Throwable?) : Exception(cause)

  private var share: What? = null
  private var unreadable = false
  private var busy = false
  private var body = -1L                                    // the bytes of the file actually sent (a photo may be made smaller)
  @Volatile private var gone = false
  @Volatile private var conn: HttpURLConnection? = null

  override fun onCreate(saved: Bundle?) {
    super.onCreate(saved)
    behindBars()                                                                     // the scrim under the system bars too
    setContentView(ui())
    if (!PixelStore.get(this).ready) return start(false)                           // nothing to read before he is set up
    busy = true
    show("…", "Envoi sur Pixel…", runCatching { guess(intent) }.getOrNull(), Btn("Annuler") { finish() })
    bar.isIndeterminate = true
    bar.visibility = View.VISIBLE
    val i = intent
    Thread {                                                                         // the provider may be slow: never on the UI thread
      var bad = false
      val w = try {
        what(i)
      } catch (e: Exception) {
        bad = e is Unreadable || e is SecurityException || e is FileNotFoundException
        null
      }
      main.post { if (!gone) { share = w; unreadable = bad; start(false) } }
    }.start()
  }

  override fun onDestroy() {
    gone = true
    main.removeCallbacksAndMessages(null)
    conn?.let { c -> Thread { runCatching { c.disconnect() } }.start() }   // stops an upload under way
    super.onDestroy()
  }

  override fun onConfigurationChanged(c: Configuration) {
    super.onConfigurationChanged(c)
    place()
  }

  // ---- what was shared ----

  private fun what(i: Intent): What? {
    val title = (i.getStringExtra(Intent.EXTRA_SUBJECT) ?: i.getStringExtra(Intent.EXTRA_TITLE)).orEmpty().trim().take(200)
    val type = i.type.orEmpty().lowercase(Locale.ROOT)
    val many = if (i.action == Intent.ACTION_SEND_MULTIPLE) streams(i) else emptyList()
    val given = (if (i.action == Intent.ACTION_SEND_MULTIPLE) many.firstOrNull() else stream(i))
      ?: i.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
    val uri = given?.takeIf { readable(it) }
    val text = i.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    if (uri != null && !type.startsWith("text/")) return file(uri, type, title, maxOf(1, many.size))
    if (text.isNotEmpty()) return What.Text(text, title)
    if (given != null && uri == null) throw Unreadable(null)
    if (uri != null) {                                                    // a text file: its first lines
      val t = contentResolver.openInputStream(uri)?.use { s ->
        val buf = ByteArray(8192)
        var n = 0
        while (n < buf.size) { val k = s.read(buf, n, buf.size - n); if (k < 0) break; n += k }
        String(buf, 0, n, Charsets.UTF_8)
      }?.trim().orEmpty()
      if (t.isNotEmpty()) return What.Text(t, title)
    }
    return null
  }

  private fun file(uri: Uri, type: String, title: String, count: Int): What.File? {
    val mime = (contentResolver.getType(uri) ?: type).lowercase(Locale.ROOT)
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) return null
    var name = ""
    var size = -1L
    try {
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val s = c.getColumnIndex(OpenableColumns.SIZE)
          if (n >= 0 && !c.isNull(n)) name = c.getString(n)
          if (s >= 0 && !c.isNull(s)) size = c.getLong(s)
        }
      }
    } catch (e: Exception) { /* some apps give no details: the name and the size stay unknown */ }
    if (size <= 0) size = try {
      contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
    } catch (e: Exception) {
      -1L
    }
    if (name.isBlank()) name = uri.lastPathSegment?.substringAfterLast('/') ?: "partage"
    return What.File(uri, mime, name, size, title, count)
  }

  /** Only another app's content:// address. A file:// one, or one of this app's providers, would be opened with Pixel's
   *  own rights: another app could have it send Pixel's private files (his access code) to his screen. */
  private fun readable(u: Uri): Boolean {
    if (!ContentResolver.SCHEME_CONTENT.equals(u.scheme, ignoreCase = true)) return false
    val auth = u.authority?.substringAfterLast('@')?.takeIf { it.isNotEmpty() } ?: return false   // "0@authority": a user's provider
    return auth !in mine && runCatching { provider(auth) }.getOrNull() != packageName
  }

  private val mine: Set<String> by lazy {                                          // this app's own providers (its libraries' too)
    runCatching {
      val info = if (Build.VERSION.SDK_INT >= 33) {
        packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PROVIDERS.toLong()))
      } else {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(packageName, PackageManager.GET_PROVIDERS)
      }
      info.providers.orEmpty().flatMap { it.authority.orEmpty().split(';') }.filter { it.isNotEmpty() }.toSet()
    }.getOrDefault(emptySet())
  }

  @Suppress("DEPRECATION")
  private fun provider(auth: String): String? =
    if (Build.VERSION.SDK_INT >= 33) packageManager.resolveContentProvider(auth, PackageManager.ComponentInfoFlags.of(0))?.packageName
    else packageManager.resolveContentProvider(auth, 0)?.packageName

  /** what the card says while the share is worked out, from the intent alone (no provider call) */
  private fun guess(i: Intent): String {
    val type = i.type.orEmpty().lowercase(Locale.ROOT)
    val text = i.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    return when {
      type == "image/gif" -> "GIF"
      type.startsWith("video/") -> "Vidéo"
      type.startsWith("image/") -> "Photo"
      text.isNotEmpty() -> describe(What.Text(text, ""))
      else -> ""
    }
  }

  @Suppress("DEPRECATION")
  private fun stream(i: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 34) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri

  @Suppress("DEPRECATION")
  private fun streams(i: Intent): List<Uri> =
    (if (Build.VERSION.SDK_INT >= 34) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM))
      .orEmpty().filterNotNull()

  private fun describe(w: What): String = when (w) {
    is What.Text -> {
      val url = Regex("https?://[^\\s<>\"']+").find(w.text)?.value
      val host = url?.let { Uri.parse(it).host?.lowercase(Locale.ROOT)?.removePrefix("www.")?.removePrefix("m.") }
      when {
        host == null -> "Texte : « " + w.text.replace(Regex("\\s+"), " ").let { if (it.length > 40) it.take(39) + "…" else it } + " »"
        host == "youtu.be" || host.endsWith("youtube.com") -> "Vidéo YouTube"
        else -> "Lien : $host"
      }
    }
    is What.File -> {
      val kind = when {
        w.mime == "image/gif" -> "GIF"
        w.mime.startsWith("video/") -> "Vidéo"
        else -> "Photo"
      }
      kind + (if (w.size > 0) " · " + size(w.size) else "") + (if (w.count > 1) " (la première des ${w.count})" else "")
    }
  }

  // ---- sending ----

  private fun start(anyway: Boolean) {
    val cfg = PixelStore.get(this)
    val w = share
    busy = false                                                                     // send() says otherwise
    bar.visibility = View.GONE
    when {
      !cfg.ready -> show(                                                            // no Pi: Pixel lives in the app, with no screen to show it on
        ":|", "Relie Pixel à ton Pi pour afficher ça sur son écran.",
        "Sans Pi, Pixel vit dans l’appli de ton téléphone. Relie-le une fois à ton Pi (son QR code), et ce que tu partages s’affiche sur l’écran du Pi.",
        Btn("Fermer") { finish() }, Btn("Relier à mon Pixel", true) { openApp(link = true) },
      )
      w == null && unreadable -> show(":(", "Impossible de lire ce fichier.", "L’appli qui le partage ne le laisse pas lire.", Btn("Fermer") { finish() })
      w == null -> show(":(", "Pixel ne sait pas afficher ça.", "Partage une photo, une vidéo, un GIF, un lien ou un texte.", Btn("Fermer") { finish() })
      w is What.File && !anyway && !shrinks(w) && w.size > limit(cfg) * MB -> tooBig(cfg, w.size, true)   // before sending it for nothing
      else -> send(cfg, w)
    }
  }

  private fun send(cfg: PixelStore.Config, w: What) {
    busy = true
    show("…", "Envoi sur Pixel…", describe(w), Btn("Annuler") { finish() })
    bar.isIndeterminate = !(w is What.File && w.size > 0)
    bar.progress = 0
    bar.visibility = View.VISIBLE
    Thread {
      val r = try {
        Result.success(if (w is What.File) upload(cfg, w) else text(cfg, w as What.Text))
      } catch (e: Throwable) {
        Result.failure(e)
      }
      main.post { if (!gone) done(cfg, w, r) }
    }.start()
  }

  private fun text(cfg: PixelStore.Config, w: What.Text): PixelHttp.Answer {
    val j = JSONObject().put("text", w.text.take(4000))
    if (w.title.isNotEmpty()) j.put("title", w.title)
    return PixelHttp.postJson(cfg, "/api/cast", j, 15_000)
  }

  private fun upload(cfg: PixelStore.Config, w: What.File): PixelHttp.Answer {
    val small = shrink(w)
    val size = small?.size?.toLong() ?: w.size
    body = size
    val mime = if (small != null) "image/jpeg" else w.mime
    val boundary = "PixelPartage" + System.nanoTime()
    val name = (if (small != null) w.name.substringBeforeLast('.') + ".jpg" else w.name).replace(Regex("[\"\\\\\\r\\n]"), "_").take(120)
    val head = buildString {
      if (w.title.isNotEmpty()) append("--$boundary\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n${w.title}\r\n")
      append("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$name\"\r\nContent-Type: $mime\r\n\r\n")
    }.toByteArray(Charsets.UTF_8)
    val tail = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)
    val length = if (size > 0) head.size + size + tail.size else -1L
    val input = small?.let { ByteArrayInputStream(it) } ?: contentResolver.openInputStream(w.uri) ?: throw FileNotFoundException(w.uri.toString())
    return input.use { inp ->
      PixelHttp.post(cfg, "/api/cast", "multipart/form-data; boundary=$boundary", length, 60_000, { conn = it }) { out ->
        out.write(head)
        val buf = ByteArray(64 * 1024)
        var sent = 0L
        var shown = -1
        while (true) {
          val n = try {
            inp.read(buf)
          } catch (e: IOException) {
            throw Unreadable(e)                                                    // the sharing app, not Pixel
          }
          if (n < 0) break
          if (gone) throw InterruptedIOException("cancelled")
          out.write(buf, 0, n)
          sent += n
          val pct = if (size > 0) (sent * 100 / size).toInt().coerceIn(0, 100) else -1
          if (pct != shown) {
            shown = pct
            main.post { if (!gone && busy && pct >= 0) { bar.progress = pct; status.text = "Envoi sur Pixel… $pct %" } }
          }
        }
        out.write(tail)
      }
    }
  }

  /** A photo Pixel cannot read (HEIC, AVIF...) or a big one: a JPEG of MAX_SIDE px at most (his screen is 800 x 480), the
   *  phone's EXIF rotation applied. GIF, WebP (maybe animated) and PNG go as they are. null: send the original. */
  private fun shrinks(w: What.File) =
    Build.VERSION.SDK_INT >= 28 && w.mime.startsWith("image/") && w.mime !in AS_IS && !(w.mime in JPEG && w.size in 1..BIG_PHOTO)

  private fun shrink(w: What.File): ByteArray? {
    if (!shrinks(w)) return null
    return try {
      val bmp = ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, w.uri)) { d, info, _ ->
        d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        val k = maxOf(info.size.width, info.size.height).toFloat() / MAX_SIDE
        if (k > 1f) d.setTargetSize(maxOf(1, (info.size.width / k).roundToInt()), maxOf(1, (info.size.height / k).roundToInt()))
      }
      val out = ByteArrayOutputStream()
      bmp.compress(Bitmap.CompressFormat.JPEG, 88, out)
      bmp.recycle()
      out.toByteArray().takeIf { it.isNotEmpty() }
    } catch (e: Exception) {
      null
    } catch (e: OutOfMemoryError) {
      null
    }
  }

  private fun done(cfg: PixelStore.Config, w: What, r: Result<PixelHttp.Answer>) {
    busy = false
    conn = null
    bar.visibility = View.GONE
    val close = Btn("Fermer") { finish() }
    val retry = Btn("Réessayer", true) { start(true) }
    val a = r.getOrNull()
    val e = r.exceptionOrNull()
    val over = w is What.File && body > limit(cfg) * MB                     // more than he takes, as far as the app knows
    when {
      a != null && a.ok -> {
        if (over) PixelStore.update(this) { it.copy(castMaxMb = 0.0, castOkMb = maxOf(it.castOkMb, body / MB)) }   // his limit went up
        val title = a.json?.optJSONObject("cast")?.optString("title")?.takeIf { it.isNotBlank() }
        show(":)", "Envoyé sur Pixel ✓", title ?: describe(w))
        main.postDelayed({ if (!isFinishing) finish() }, 1300)
      }
      a != null && a.status == 413 -> {
        val mb = a.error?.let { Regex("(\\d+(?:[.,]\\d+)?)\\s*Mo").find(it) }?.groupValues?.get(1)?.replace(',', '.')?.toDoubleOrNull()
        if (mb != null) PixelStore.update(this) { it.copy(castMaxMb = mb) }
        show(":(", a.error ?: "Fichier trop gros pour Pixel.", HINT_BIG, close)
      }
      a != null && a.status == 404 -> show(":(", "Ce Pixel ne sait pas encore recevoir de partage.", "Mets Pixel à jour sur le Pi, puis réessaie.", close)
      a != null && a.status == 403 -> show(":(", a.error ?: "Pixel refuse ce téléphone.", "Ouvre l’appli Pixel : elle te dira quoi faire.", close, Btn("Ouvrir l’appli", true) { openApp() })
      a != null -> show(":(", a.error ?: "Pixel n’a pas pu l’afficher (erreur ${a.status}).", null, *(if (a.status >= 500 || a.status == 429) arrayOf(close, retry) else arrayOf(close)))
      e is Unreadable || e is SecurityException || e is FileNotFoundException ->
        show(":(", "Impossible de lire ce fichier.", "L’appli qui le partage ne le laisse pas lire.", close)
      e is PixelHttp.NoAnswer -> show(":(", "Pixel ne répond pas", NO_ANSWER_HINT, close, retry)
      e is PixelHttp.Cut && over -> tooBig(cfg, body, false)                      // he refused it and hung up before the end
      e is PixelHttp.Cut && w is What.File ->
        show(":(", "L’envoi a été coupé.", "Le Wi-Fi a peut-être décroché, ou ce fichier est trop gros pour Pixel.", close, retry)
      e is IOException -> show(":(", "Pixel ne répond pas", NO_ANSWER_HINT, close, retry)
      else -> show(":(", "Ça n’a pas marché.", e?.message, close)
    }
  }

  /** Pixel's limit in Mo: the one he gave, else his default, or the biggest file he already took */
  private fun limit(cfg: PixelStore.Config) = if (cfg.castMaxMb > 0) cfg.castMaxMb else maxOf(DEFAULT_MB, cfg.castOkMb)

  /** before: not sent yet (his limit may have gone up: « Envoyer quand même »); else he hung up on it */
  private fun tooBig(cfg: PixelStore.Config, bytes: Long, before: Boolean) {
    val close = Btn("Fermer") { finish() }
    val again = if (before) Btn("Envoyer quand même") { start(true) } else Btn("Réessayer") { start(true) }
    if (cfg.castMaxMb > 0) {
      show(":(", "Fichier trop gros : Pixel prend ${mb(cfg.castMaxMb)} Mo au plus.", HINT_BIG, *(if (before) arrayOf(close, again) else arrayOf(close)))
    } else {
      val known = if (cfg.castOkMb > DEFAULT_MB) "Le plus gros qu’il a pris faisait ${mb(cfg.castOkMb)} Mo. " else "D’habitude, il prend ${mb(DEFAULT_MB)} Mo au plus. "
      show(":(", "Ce fichier fait ${size(bytes)} : sans doute trop pour Pixel.", known + HINT_BIG, close, again)
    }
  }

  private fun mb(v: Double) = if (v % 1.0 == 0.0) v.toLong().toString() else String.format(Locale.FRANCE, "%.1f", v)

  /** link: straight on its "Relier à mon Pixel" screen (App.tsx reads LINK_URL with React Native's Linking; the intent
   *  names the app's own activity, so no other app is asked and no URL scheme is declared). It carries the time: Android
   *  hands the activity its first intent again when it recreates it from Recents, and App.tsx takes each link once */
  private fun openApp(link: Boolean = false) {
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      val i = if (link) Intent(Intent.ACTION_VIEW, Uri.parse("$LINK_URL?at=${System.currentTimeMillis()}")).setComponent(launch.component) else launch
      startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    finish()
  }

  // ---- the card ----

  private fun ui(): View {
    val root = FrameLayout(this).apply {
      setBackgroundColor(SCRIM)
      setOnClickListener { if (!busy) finish() }                                 // a touch beside the card closes it
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply { setColor(DESK); cornerRadius = dp(24f); setStroke(dpi(1), EDGE) }
      setPadding(dpi(20), dpi(18), dpi(20), dpi(18))
      isClickable = true
      elevation = dp(10f)
    }
    face = TextView(this).apply { textSize = 30f; typeface = Typeface.MONOSPACE; setTextColor(GREEN); minWidth = dpi(64); importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
    val brand = TextView(this).apply { text = "PIXEL"; textSize = 12f; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); letterSpacing = 0.3f; setTextColor(INK) }
    status = TextView(this).apply { textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setTextColor(PLASTIC); accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
    detail = TextView(this).apply { textSize = 14f; setTextColor(SOFT); setLineSpacing(0f, 1.15f) }
    val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; addView(brand); addView(status); addView(detail) }
    val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; addView(face); addView(texts, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)) }
    bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
      max = 100
      progressTintList = ColorStateList.valueOf(GREEN)
      indeterminateTintList = ColorStateList.valueOf(GREEN)
      progressBackgroundTintList = ColorStateList.valueOf(EDGE)
      visibility = View.GONE
    }
    row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
    card.addView(top)
    card.addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dpi(12) })
    card.addView(row, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dpi(16) })
    root.addView(card, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
    root.setOnApplyWindowInsetsListener { _, insets ->
      bars = if (Build.VERSION.SDK_INT >= 30) {
        insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()).let { intArrayOf(it.left, it.right, it.bottom) }
      } else {
        legacyBars(insets)
      }
      place()
      insets
    }
    return root
  }

  @Suppress("DEPRECATION")
  private fun behindBars() {
    when {
      Build.VERSION.SDK_INT >= 35 -> Unit                                         // edge to edge already (target SDK 35 and up)
      Build.VERSION.SDK_INT >= 30 -> window.setDecorFitsSystemWindows(false)
      else -> window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
    }
  }

  @Suppress("DEPRECATION")
  private fun legacyBars(i: WindowInsets) = intArrayOf(i.systemWindowInsetLeft, i.systemWindowInsetRight, i.systemWindowInsetBottom)

  private var bars = intArrayOf(0, 0, 0)                 // the system bars' left, right and bottom insets

  /** the card at the bottom, clear of the system bars, 520 dp wide at most (a tablet, a phone sideways) */
  private fun place() {
    val lp = card.layoutParams as? FrameLayout.LayoutParams ?: return
    val side = maxOf(0, (resources.displayMetrics.widthPixels - bars[0] - bars[1] - dpi(520)) / 2) + dpi(12)
    lp.setMargins(side + bars[0], 0, side + bars[1], dpi(12) + bars[2])
    card.layoutParams = lp
  }

  private fun show(f: String, s: String, d: String?, vararg buttons: Btn) {
    face.text = f
    status.text = s
    detail.text = d.orEmpty()
    detail.visibility = if (d.isNullOrEmpty()) View.GONE else View.VISIBLE
    row.removeAllViews()
    buttons.forEachIndexed { i, b -> row.addView(button(b), LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { if (i > 0) marginStart = dpi(10) }) }
    row.visibility = if (buttons.isEmpty()) View.GONE else View.VISIBLE
  }

  private fun button(b: Btn) = Button(this).apply {
    text = b.label
    isAllCaps = false
    textSize = 15f
    typeface = Typeface.DEFAULT_BOLD
    stateListAnimator = null
    minWidth = 0
    minimumWidth = 0
    minHeight = dpi(44)
    minimumHeight = dpi(44)
    setPadding(dpi(18), 0, dpi(18), 0)
    setTextColor(if (b.primary) DESK else PLASTIC)
    val shape = GradientDrawable().apply {
      cornerRadius = dp(999f)
      if (b.primary) setColor(PLASTIC) else { setColor(Color.TRANSPARENT); setStroke(dpi(1), INK) }
    }
    background = RippleDrawable(ColorStateList.valueOf(if (b.primary) 0x33141713 else 0x33D9D2BD), shape, null)
    setOnClickListener { b.act() }
  }

  private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)
  private fun dpi(v: Int) = dp(v.toFloat()).toInt()

  private fun size(b: Long): String =
    if (b < MB) "${maxOf(1, b / 1024)} ko" else String.format(Locale.FRANCE, "%.1f Mo", b / MB)

  companion object {
    private const val MB = 1024.0 * 1024.0
    private const val DEFAULT_MB = 40.0                    // Pixel's limit unless his [cast] max_mb says otherwise
    private const val MAX_SIDE = 1920
    private const val BIG_PHOTO = 4L * 1024 * 1024         // a JPEG over 4 MB is made smaller first
    private val AS_IS = setOf("image/gif", "image/webp", "image/png")
    private val JPEG = setOf("image/jpeg", "image/jpg", "image/pjpeg")
    private const val HINT_BIG = "Envoie une vidéo plus courte, ou plutôt son lien (YouTube…)."
    private val NO_ANSWER_HINT = PixelHttp.NO_ANSWER.substringAfter(". ")
    const val LINK_URL = "pixel://relier"                  // App.tsx: the same string, then ?at=<ms>
    // the app's colours (App.tsx)
    private const val DESK = 0xFF141713.toInt()
    private const val PLASTIC = 0xFFD9D2BD.toInt()
    private const val INK = 0xFF7C745C.toInt()
    private const val SOFT = 0xFFA79F86.toInt()
    private const val GREEN = 0xFF46FF82.toInt()
    private const val EDGE = 0xFF34372E.toInt()
    private const val SCRIM = 0x8C000000.toInt()
  }
}
