#!/bin/sh
# Installs Pixel on Raspberry Pi OS (Bookworm or later, with the desktop).
# Run from the pixel-app folder:  sh deploy/install.sh
set -e
cd "$(dirname "$0")/.."
APP=$(pwd)

echo "1/5 Paquets système"
sudo apt-get update
sudo apt-get install -y python3-venv libhidapi-libusb0 curl
command -v chromium-browser >/dev/null || command -v chromium >/dev/null || sudo apt-get install -y chromium-browser

echo "2/5 Environnement Python"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
[ -f config.toml ] || cp config.example.toml config.toml

echo "3/5 Stream Deck et luminosité de l'écran"
sudo cp deploy/70-pixel.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
sudo usermod -aG plugdev "$USER"

echo "4/5 Service au démarrage"
[ -f /etc/pixel.env ] || { echo "ANTHROPIC_API_KEY=" | sudo tee /etc/pixel.env >/dev/null; sudo chmod 600 /etc/pixel.env; }
sed "s#/home/%i/Pixel-ai-dashboard/pixel-app#$APP#g" deploy/pixel@.service | sudo tee /etc/systemd/system/pixel@.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "pixel@$USER"

echo "5/5 Écran en plein écran à l'ouverture de session"
if [ -d "$HOME/.config/labwc" ] || command -v labwc >/dev/null; then
  mkdir -p "$HOME/.config/labwc"
  grep -q kiosk.sh "$HOME/.config/labwc/autostart" 2>/dev/null || echo "$APP/deploy/kiosk.sh &" >> "$HOME/.config/labwc/autostart"
else
  grep -q kiosk.sh "$HOME/.config/wayfire.ini" 2>/dev/null || printf '\n[autostart]\npixel = %s/deploy/kiosk.sh\n' "$APP" >> "$HOME/.config/wayfire.ini"
fi

echo
echo "C'est installé. Mets ta clé API Anthropic dans /etc/pixel.env (sudo nano /etc/pixel.env),"
echo "puis redémarre : sudo reboot"
