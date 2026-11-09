package com.mopi.pixelnative

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Plain http to Pixel on the home network (cleartext is allowed for it), with the access code in X-Pixel-Token, as the
 *  server's /api/cast and /api/notif want it. They answer JSON: {"ok": true, ...} or {"ok": false, "error": "..."}. */
object PixelHttp {
  const val NO_ANSWER = "Pixel ne répond pas. Vérifie qu'il est allumé et que ton téléphone est sur le même Wi-Fi."

  class Answer(val status: Int, val json: JSONObject?, private val text: String) {
    val ok get() = status in 200..299 && json?.optBoolean("ok", true) != false
    /** the server's own words (in French), or its short text answer (home_only's 403), or null */
    val error: String?
      get() = json?.optString("error")?.takeIf { it.isNotBlank() }
        ?: text.trim().takeIf { status >= 400 && it.isNotEmpty() && it.length < 300 && !it.startsWith("<") }
  }

  /** The request could not reach Pixel, or he did not answer (not a refusal: that is an Answer) */
  class NoAnswer(cause: Throwable) : IOException(cause)

  /** Pixel took the request, then the connection broke while it was being sent: the Wi-Fi went, or he refused a body
   *  too big and hung up before reading it all (aiohttp answers 413 at once, then drops the rest) */
  class Cut(cause: Throwable) : IOException(cause)

  /** POST base+path; length -1: chunked. conn: the connection, as soon as it exists (to cancel it from another thread).
   *  Throws NoAnswer when Pixel is out of reach, Cut when the body could not all be sent, and whatever else [write]
   *  throws. */
  fun post(
    cfg: PixelStore.Config, path: String, contentType: String, length: Long, readTimeoutMs: Int,
    conn: (HttpURLConnection) -> Unit = {}, write: (OutputStream) -> Unit,
  ): Answer {
    val base = cfg.base ?: throw IllegalStateException("not set up")
    val c = try {
      URL(base + path).openConnection() as HttpURLConnection
    } catch (e: IOException) {
      throw NoAnswer(e)
    }
    conn(c)
    try {
      c.requestMethod = "POST"
      c.doOutput = true
      c.useCaches = false
      c.instanceFollowRedirects = false
      c.connectTimeout = 6000
      c.readTimeout = readTimeoutMs
      c.setRequestProperty("Content-Type", contentType)
      c.setRequestProperty("Accept", "application/json")
      cfg.token?.let { c.setRequestProperty("X-Pixel-Token", it) }
      if (length >= 0) c.setFixedLengthStreamingMode(length) else c.setChunkedStreamingMode(64 * 1024)
      try {
        c.connect()
      } catch (e: IOException) {
        throw NoAnswer(e)
      }
      try {
        c.outputStream.use(write)
      } catch (e: IOException) {
        throw Cut(e)
      }
      val status = try {
        c.responseCode
      } catch (e: IOException) {
        throw NoAnswer(e)
      }
      val body = (if (status >= 400) c.errorStream else c.inputStream)?.use { read(it, 16 * 1024) } ?: ""
      return Answer(status, runCatching { JSONObject(body) }.getOrNull(), body)
    } finally {
      c.disconnect()
    }
  }

  fun postJson(cfg: PixelStore.Config, path: String, json: JSONObject, readTimeoutMs: Int = 8000): Answer {
    val bytes = json.toString().toByteArray(Charsets.UTF_8)
    return post(cfg, path, "application/json", bytes.size.toLong(), readTimeoutMs) { it.write(bytes) }
  }

  private fun read(s: InputStream, max: Int): String {
    val out = ByteArrayOutputStream()
    val buf = ByteArray(4096)
    while (out.size() < max) {
      val n = s.read(buf)
      if (n < 0) break
      out.write(buf, 0, n)
    }
    return out.toString("UTF-8")
  }
}
