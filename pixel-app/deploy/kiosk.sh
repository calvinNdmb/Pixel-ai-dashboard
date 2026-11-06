#!/bin/sh
# Opens Pixel's screen in full screen once the server answers.
# Started by the desktop at login (see install.sh: labwc or wayfire autostart).
URL="http://localhost:8080/?kiosk=1"
for i in $(seq 1 60); do
  curl -fsS -o /dev/null "http://localhost:8080/" && break
  sleep 1
done
BROWSER=$(command -v chromium-browser || command -v chromium)
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 --overscroll-history-navigation=0 --app="$URL"
