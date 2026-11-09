#!/usr/bin/env python3
"""Build Pixel's phone page (web/index.html) as ONE self-contained offline HTML file: Pixel sans Pi, for the Android app.

    python3 tools/build_app_bundle.py OUT.html

pixel-mobile runs it ("npm run bundle:web", into pixel-mobile/assets/pixel-local.html) and shows the file when no Pi is
linked, or when the Pi does not answer. The page is the real one, in local mode: window.PIXEL_LOCAL is set, and Pixel Lab's
in-page stand-in for the server (web/lab/demo-hub.js) and web/local.js are loaded just before app.js, so that app.js talks
to them instead of the Pi.
Everything is inlined: the styles, the fonts (base64 @font-face, from the TTF files in web/), the page's markup and every
script of web/index.html, in the order of its <script> tags, so new scripts come along by themselves. Nothing is fetched at
run time (no Google Fonts, no manifest, no icon): the build stops if a style or the page would load anything.
"""
import base64
import json
import re
import subprocess
import sys
import time
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
LOCAL = ["lab/demo-hub.js", "local.js"]          # the in-page hub, just before app.js


def script(path):
    js = path.read_text(encoding="utf-8")
    low = js.lower()
    if "<!--" in js or "<script" in low:
        sys.exit(f"{path}: contains '<!--' or '<script', which would break an inline <script>")
    return re.sub(r"</(script)", r"<\\/\1", js, flags=re.I)     # "</script" would end the inline script


def served(href):
    """The file of web/ behind an address of the page (the server serves web/ under /app/)."""
    if not href.startswith("app/"):
        sys.exit(f"web/index.html: {href} is not under app/, the bundle cannot inline it")
    path = (WEB / href[4:]).resolve()
    if WEB not in path.parents or not path.is_file():
        sys.exit(f"web/index.html: {href} is not a file of pixel-app/web")
    return path


def font_uri(name):
    path = (WEB / name).resolve()
    if WEB not in path.parents or not path.is_file():
        sys.exit(f"font {name}: not a file of pixel-app/web")
    kind = {".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}.get(path.suffix.lower())
    if not kind:
        sys.exit(f"font {name}: unknown font type")
    return f"data:{kind};base64," + base64.b64encode(path.read_bytes()).decode()


def style(path):
    css = path.read_text(encoding="utf-8")
    css = re.sub(r"url\(\s*[\"']?([\w.-]+\.(?:ttf|otf|woff2?))[\"']?\s*\)", lambda m: f'url("{font_uri(m.group(1))}")', css)
    if "@import" in css or re.search(r"url\((?!\"?data:)", css):
        sys.exit(f"{path}: external url() or @import, the page would fetch it")
    return css


def version():
    try:
        return subprocess.run(["git", "-C", str(WEB), "describe", "--always", "--dirty"], capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def build():
    page = (WEB / "index.html").read_text(encoding="utf-8")
    head, rest = page.split("<body>", 1)
    body, tail = rest.split("<script", 1)
    tail = "<script" + tail
    sources = re.findall(r'<script\s+src="([^"]+)"\s*>\s*</script>', tail)
    if not sources or sources[-1] != "app/app.js":
        sys.exit("web/index.html: its scripts must end with app/app.js")
    if re.sub(r'<script\s+src="[^"]+"\s*>\s*</script>|</body>|</html>|\s', "", tail):
        sys.exit("web/index.html: something other than <script src> after the page's markup")
    if re.search(r"<script|<link|<img|<iframe|<video|<audio|<source|\bsrc=|url\(", body, re.I):
        sys.exit("web/index.html: the markup loads something (a script, an image, a style…): not in an offline page")
    for need in ("app/pack52/pixel52.js", "app/screens.js", "app/poche.js"):
        if need not in sources:
            sys.exit(f"web/index.html: {need} is not loaded")

    styles = re.findall(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>', head)
    if not styles:
        sys.exit("web/index.html: no stylesheet")
    css = "\n".join(style(served(h)).strip() for h in styles)
    fonts = json.loads((WEB / "fonts.json").read_text(encoding="utf-8"))
    missing = [f["family"] for f in fonts if f'font-family:"{f["family"]}"' not in css.replace(": ", ":")]
    if missing:
        sys.exit(f"no @font-face for {', '.join(missing)} (fonts.json): its theme would fall back to another font")
    metas = re.findall(r'<meta\s+(?:charset|name="(?:viewport|theme-color)")[^>]*>', head)
    title = re.search(r"<title>.*?</title>", head, re.S)

    config = {"v": 1, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "version": version()}
    order = sources[:-1] + LOCAL + sources[-1:]
    out = ["<!doctype html>", '<html lang="fr">', "<head>", *metas, title.group(0) if title else "<title>Pixel</title>",
           "<style>", css, "</style>", "</head>", "<body>", body.strip(),
           "<script>window.PIXEL_LOCAL = " + json.dumps(config, ensure_ascii=False) + ";</script>"]
    for src in order:
        path = served(src) if src.startswith("app/") else (WEB / src).resolve()
        if WEB not in path.parents or not path.is_file():
            sys.exit(f"{src}: not a file of pixel-app/web")
        out += [f"<script>/* {path.relative_to(WEB)} */", script(path).strip(), "</script>"]
    out += ["</body>", "</html>"]
    return "\n".join(out) + "\n", order


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 tools/build_app_bundle.py OUT.html")
    html, order = build()
    dest = Path(sys.argv[1])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")
    print(f"{dest}: {len(html.encode()) // 1024} Ko, Pixel sans Pi, scripts : {', '.join(order)}")


if __name__ == "__main__":
    main()
