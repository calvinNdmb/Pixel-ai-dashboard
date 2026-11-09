#!/bin/sh
# Opens Pixel's screen in full screen once the server answers.
# Started by the desktop at login (see install.sh: labwc or wayfire autostart).
URL="http://localhost:8080/?kiosk=1"
for i in $(seq 1 60); do
  curl -fsS -o /dev/null "http://localhost:8080/" && break
  sleep 1
done
# After a power cut Chromium thinks it crashed and shows a "restore pages" bubble over Pixel:
# mark the last exit as clean before starting.
PREF="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREF" ] && sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PREF"
BROWSER=$(command -v chromium-browser || command -v chromium)
# A shared screen (WebRTC): Pixel's real address goes to the computer through the Chromium policy install.sh writes
# (pixel-ecran.json, for http://localhost:8080 only), not --disable-features=WebRtcHideLocalIpsWithMdns, which would give
# it to every site this screen shows (and a second --disable-features would silently replace the first).
# --autoplay-policy: Pixel's bleeps (web/son.js), and the videos cast from a phone with their sound, play without a first touch
exec "$BROWSER" --kiosk --password-store=basic --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 --overscroll-history-navigation=0 --app="$URL"
