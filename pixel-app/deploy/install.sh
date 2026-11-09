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
# Facultatif : Pixel dans le bouton Caster de l'appli YouTube (docs/CAST.md, YouTube), seulement si on le demande :
#   PIXEL_YTCAST=1 sh deploy/install.sh     puis  enabled = true  dans [ytcast] de config.toml
if [ "${PIXEL_YTCAST:-0}" = 1 ]; then
  echo "+ YouTube : Node.js et le module sidecar/ytcast"
  command -v node >/dev/null || sudo apt-get install -y nodejs     # Bookworm : Node 18, ça suffit (Node 22 LTS, de NodeSource, est mieux)
  command -v npm >/dev/null || sudo apt-get install -y npm
  node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' || echo "Node.js est trop ancien : il faut la version 18 ou plus."
  (cd sidecar/ytcast && npm ci --omit=dev --no-audit --no-fund) || echo "npm ci a échoué (Internet ?) : relance-le dans sidecar/ytcast."
fi

echo "3/5 Stream Deck et luminosité de l'écran"
sudo cp deploy/70-pixel.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
sudo usermod -aG plugdev "$USER"

echo "4/5 Service au démarrage"
[ -f /etc/pixel.env ] || { echo "ANTHROPIC_API_KEY=" | sudo tee /etc/pixel.env >/dev/null; sudo chmod 600 /etc/pixel.env; }
# Claude through your Claude subscription (CLAUDE_CODE_OAUTH_TOKEN in /etc/pixel.env, made with « claude setup-token »)
if sudo grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.' /etc/pixel.env; then .venv/bin/pip install -q claude-agent-sdk; fi
sed "s#/home/%i/Pixel-ai-dashboard/pixel-app#$APP#g" deploy/pixel@.service | sudo tee /etc/systemd/system/pixel@.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "pixel@$USER"
# the quick menu's "Éteindre" / "Redémarrer": only these two commands, without a password
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff, /usr/bin/systemctl reboot\n' "$USER" > /tmp/pixel-power
sudo visudo -cf /tmp/pixel-power >/dev/null && sudo install -m 440 /tmp/pixel-power /etc/sudoers.d/pixel-power
rm -f /tmp/pixel-power

echo "5/5 Écran en plein écran à l'ouverture de session"
# Entrée XDG autostart, lancée par lxsession-xdg-autostart sous labwc. Elle ne remplace pas
# /etc/xdg/labwc/autostart (barre, bureau, kanshi) comme le ferait ~/.config/labwc/autostart.
mkdir -p "$HOME/.config/autostart"
printf '[Desktop Entry]\nType=Application\nName=Pixel\nExec=%s/deploy/kiosk.sh\nX-GNOME-Autostart-enabled=true\n' "$APP" > "$HOME/.config/autostart/pixel-kiosk.desktop"

echo
echo "C'est installé. Mets ta clé API Anthropic dans /etc/pixel.env (sudo nano /etc/pixel.env),"
echo "puis redémarre : sudo reboot"
