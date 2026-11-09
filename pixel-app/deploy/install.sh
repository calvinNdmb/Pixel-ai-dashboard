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
.venv/bin/pip install -r requirements.txt || {
  # « set -e » : sans ce repli, un « cryptography » qui ne s'installe pas arrêterait toute l'installation
  echo "   (une dépendance ne s'installe pas : nouvel essai sans « cryptography », les amis de Pixel resteront éteints)"
  grep -v '^cryptography' requirements.txt > .venv/requirements-sans-amis.txt
  .venv/bin/pip install -r .venv/requirements-sans-amis.txt
}
# Les amis de Pixel (docs/AMIS.md) : tout ce qui passe par Internet est chiffré avec « cryptography » (requirements.txt).
# Vérifié ici, et une roue toute faite sinon ; sans lui, les amis restent éteints et tout le reste marche.
.venv/bin/python -c 'from cryptography.hazmat.primitives.ciphers.aead import AESGCM' 2>/dev/null \
  || .venv/bin/pip install --prefer-binary 'cryptography>=41' \
  || echo "   (cryptography ne s'installe pas : les amis de Pixel resteront éteints, le reste marche)"
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

echo "Et le partage d'écran (docs/CAST.md)"
# Une adresse https pour « Partager mon écran », que https_port = 8443 dans config.toml ouvre : un certificat fait ici,
# pour le nom du Pi, localhost et son adresse. Jamais remplacé s'il existe déjà.
TLS="$HOME/.config/pixel/tls"
if command -v openssl >/dev/null && [ ! -f "$TLS/pixel.crt" ]; then
  H="$(hostname).local"; IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  mkdir -p "$TLS"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes -keyout "$TLS/pixel.key" -out "$TLS/pixel.crt" -subj "/CN=$H" \
    -addext "subjectAltName=DNS:$H,DNS:localhost${IP:+,IP:$IP},IP:127.0.0.1" -addext "extendedKeyUsage=serverAuth" \
    -addext "basicConstraints=critical,CA:FALSE" 2>/dev/null && chmod 600 "$TLS/pixel.key" || echo "   (pas de certificat : l'adresse https restera fermée)"
fi
# L'écran de Pixel donne sa vraie adresse à l'ordinateur qui partage son écran (WebRTC), pour la seule page de Pixel :
# la connexion ne dépend plus du mDNS du réseau. Les autres sites ouverts sur le Pi n'y ont pas droit.
sudo install -d /etc/chromium/policies/managed
printf '{"WebRtcLocalIpsAllowedUrls": ["http://localhost:8080"]}\n' | sudo tee /etc/chromium/policies/managed/pixel-ecran.json >/dev/null
# AirPlay (iPhone, iPad, Mac), seulement si on le demande : PIXEL_AIRPLAY=1 sh deploy/install.sh
# UxPlay 1.73.7 compilé ici (le paquet de Bookworm, 1.62, est trop ancien pour -pin, -hls et les correctifs Wayland), sans X11.
if [ "${PIXEL_AIRPLAY:-0}" = 1 ]; then
  echo "   AirPlay : UxPlay, compilé sur le Pi (quelques minutes)"
  if sudo apt-get install -y cmake build-essential pkg-config git libssl-dev libplist-dev libavahi-compat-libdnssd-dev \
       libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
       gstreamer1.0-plugins-bad gstreamer1.0-libav gstreamer1.0-gl gstreamer1.0-tools \
     && rm -rf /tmp/uxplay && git clone --depth 1 --branch v1.73.7 https://github.com/FDH2/UxPlay /tmp/uxplay \
     && cmake -S /tmp/uxplay -B /tmp/uxplay/build -DNO_X11_DEPS=ON \
     && make -C /tmp/uxplay/build -j4 && sudo make -C /tmp/uxplay/build install; then
    echo "   UxPlay est installé : mets enabled = true sous [airplay] dans config.toml, puis sudo systemctl restart pixel@$USER"
  else
    echo "   AirPlay : l'installation d'UxPlay a échoué (le reste de Pixel est installé)"
  fi
fi

echo
echo "C'est installé. Mets ta clé API Anthropic dans /etc/pixel.env (sudo nano /etc/pixel.env),"
echo "puis redémarre : sudo reboot"
