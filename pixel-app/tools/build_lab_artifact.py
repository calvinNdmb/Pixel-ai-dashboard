#!/usr/bin/env python3
"""Build Pixel Lab (web/lab/) as ONE self-contained HTML file, to publish as a claude.ai Artifact.

    python3 tools/build_lab_artifact.py OUT.html

The file holds the page content only: the host wraps it in <!doctype>, <html>, <head> and <body>.
Everything is inlined (the lab's CSS and markup, the user's animation pack, themes.js, screens.js, the fake server,
the lab scripts),
in the order of the <script> tags of web/lab/index.html, so new scripts are picked up on their own.
The only external resource is the Google Fonts stylesheet for the fonts listed in web/fonts.json.
Nothing is fetched at run time: the font list is passed to the page in window.PIXEL_LAB_BUILD.
"""
import json
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
LAB = WEB / "lab"
START, END = "<!-- LAB:BODY START -->", "<!-- LAB:BODY END -->"


def script(path):
    js = path.read_text(encoding="utf-8")
    low = js.lower()
    if "<!--" in js or "<script" in low:
        sys.exit(f"{path}: contains '<!--' or '<script', which would break an inline <script>")
    return re.sub(r"</(script)", r"<\\/\1", js, flags=re.I)     # "</script" would end the inline script


def build():
    page = (LAB / "index.html").read_text(encoding="utf-8")
    if START not in page or END not in page:
        sys.exit(f"web/lab/index.html: markers {START} and {END} not found")
    body = page.split(START, 1)[1].split(END, 1)[0].strip()
    body = body.replace('href="?kiosk=1"', 'href="#kiosk"')        # query strings don't reach an artifact, the hash does
    sources = re.findall(r'<script\s+src="([^"]+)"\s*>\s*</script>', page.split(END, 1)[1])
    if not sources:
        sys.exit("web/lab/index.html: no <script src> after the body markers")
    for need in ("../pack52/pixel52.js", "../pack52/pixel52-themes.js"):     # the 52 animations must travel with the lab
        if need not in sources:
            sys.exit(f"web/lab/index.html: {need} is not loaded: the artifact would have no animation pack")

    fonts = json.loads((WEB / "fonts.json").read_text(encoding="utf-8"))
    families = "&".join("family=" + f["google"] for f in fonts if f.get("google"))
    css = (LAB / "lab.css").read_text(encoding="utf-8")
    if "@import" in css or re.search(r"url\((?!data:)", css):
        sys.exit("web/lab/lab.css: external url() or @import, the artifact would not load it")
    config = {"artifact": True, "fonts": [{k: f[k] for k in ("family", "google") if k in f} for f in fonts]}

    out = [
        "<title>Pixel Lab</title>",
        '<meta name="claude:viewport-fit-sides" content="cover">',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{families}&display=swap">',
        "<style>", css.strip(), "</style>",
        body,
        "<script>window.PIXEL_LAB_BUILD = " + json.dumps(config, ensure_ascii=False) + ";</script>",
    ]
    for src in sources:
        path = (LAB / src).resolve()
        if WEB not in path.parents:
            sys.exit(f"{src}: outside pixel-app/web")
        out += [f"<script>/* {path.relative_to(WEB)} */", script(path).strip(), "</script>"]
    return "\n".join(out) + "\n", sources, families


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 tools/build_lab_artifact.py OUT.html")
    html, sources, families = build()
    dest = Path(sys.argv[1])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")
    print(f"{dest}: {len(html.encode()) // 1024} Ko, scripts : {', '.join(sources)}")
    print(f"polices Google : {families.replace('family=', '').replace('&', ', ')}")


if __name__ == "__main__":
    main()
