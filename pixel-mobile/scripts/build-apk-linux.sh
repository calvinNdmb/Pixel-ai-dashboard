#!/bin/bash
# Builds the Pixel Android app (pixel-mobile) on Linux and signs it with Pixel's release key.
# From the pixel-mobile folder:  bash scripts/build-apk-linux.sh
# Needs Java 17+, Node and an Android SDK whose licences are accepted (Gradle fetches missing SDK parts itself).
# Settings, all optional:
#   ANDROID_HOME         the Android SDK (default: ~/android-sdk)
#   BUILD                build folder, outside the repo (default: ~/pixel-mobile-build); wiped on each run
#   OUT                  where Pixel.apk lands (default: this pixel-mobile folder)
#   PIXEL_KEYSTORE       release keystore; unset: the public debug key, like the WSL builds
#   PIXEL_KEYSTORE_PASS  its password; PIXEL_KEY_ALIAS its key (default: pixel); PIXEL_KEY_PASS if not the store's
# A key file of PIXEL_*=... lines:  set -a; . keystore.txt; set +a; bash scripts/build-apk-linux.sh
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)        # the pixel-mobile folder this script sits in
TOP=$(git -C "$SRC" rev-parse --show-toplevel 2>/dev/null || echo "$SRC")
BUILD=$(realpath -m "${BUILD:-$HOME/pixel-mobile-build}")
OUT=$(realpath -m "${OUT:-$SRC}")
export ANDROID_HOME=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}
die() { echo "Erreur : $*" >&2; exit 1; }
step() { echo; echo "### $*"; T0=$SECONDS; }
took() { echo "    ($((SECONDS - T0)) s)"; }
[ -f "$SRC/app.json" ] && [ -f "$SRC/package-lock.json" ] || die "ce script doit rester dans pixel-mobile/scripts ($SRC n'est pas le projet)."

# checks first, so a bad setting fails now rather than after ten minutes of compiling
command -v java >/dev/null || die "Java 17 ou plus est nécessaire."
JV=$(java -XshowSettings:properties -version 2>&1 | awk -F'= ' '/java.specification.version/ {print $2}')
[ "${JV%%.*}" -ge 17 ] 2>/dev/null || die "Java 17 ou plus est nécessaire (trouvé : ${JV:-aucun})."
command -v npx >/dev/null || die "Node.js (npm, npx) est nécessaire."
BT=$(ls -d "$ANDROID_HOME"/build-tools/*/ 2>/dev/null | sort -V | tail -1 || true); BT=${BT%/}
[ -n "$BT" ] && [ -x "$BT/apksigner" ] || die "SDK Android introuvable dans $ANDROID_HOME. Donne son chemin avec ANDROID_HOME=..., ou installe-le : cmdline-tools, puis android sdk install platform-tools platforms/android-37.0 build-tools/37.0.0 ndk/27.1.12297006 cmake/3.22.1"
[ -d "$ANDROID_HOME/licenses" ] || echo "Attention : aucune licence du SDK acceptée dans $ANDROID_HOME/licenses, Gradle ne pourra rien télécharger." >&2
case "$BUILD/" in "$TOP"/*) die "le dossier de compilation $BUILD est dans le dépôt : choisis-en un autre avec BUILD=...";; esac
case "$TOP/" in "$BUILD"/*) die "le dossier de compilation $BUILD contient le dépôt : choisis-en un autre avec BUILD=...";; esac
if [ -d "$BUILD" ] && [ -n "$(ls -A "$BUILD")" ] && [ ! -e "$BUILD/.pixel-build" ]; then
  die "$BUILD n'est pas vide et ce n'est pas un dossier de compilation de Pixel : choisis-en un autre avec BUILD=..."
fi
if [ -n "${PIXEL_KEYSTORE:-}" ]; then
  [ -f "$PIXEL_KEYSTORE" ] || die "la clé $PIXEL_KEYSTORE est introuvable."
  [ -n "${PIXEL_KEYSTORE_PASS:-}" ] || die "PIXEL_KEYSTORE_PASS (le mot de passe de la clé) n'est pas défini."
  PASS=$PIXEL_KEYSTORE_PASS KEY_PASS=${PIXEL_KEY_PASS:-$PIXEL_KEYSTORE_PASS}
  export -n PIXEL_KEYSTORE_PASS PIXEL_KEY_PASS             # the passwords reach keytool and apksigner only, never npm or Gradle
  KS=$(realpath "$PIXEL_KEYSTORE") ALIAS=${PIXEL_KEY_ALIAS:-pixel}
  SIGN_PASS=$PASS keytool -list -keystore "$KS" -storepass:env SIGN_PASS -alias "$ALIAS" >/dev/null 2>&1 \
    || die "impossible d'ouvrir la clé « $ALIAS » de $KS : vérifie PIXEL_KEYSTORE_PASS et PIXEL_KEY_ALIAS."
  echo "Clé de signature : $KS (« $ALIAS »)"
else
  KS= ALIAS=androiddebugkey PASS=android KEY_PASS=android  # the React Native template's public key
  WARN="Attention : PIXEL_KEYSTORE n'est pas défini. L'APK est signé avec la clé de développement publique (debug.keystore), comme les compilations WSL. Il ne pourra pas remplacer une appli signée avec la clé de Pixel."
  echo "$WARN" >&2
fi

step "Copie du projet dans $BUILD"
mkdir -p "$BUILD"
find "$BUILD" -mindepth 1 -maxdepth 1 ! -name .pixel-build -exec rm -rf {} +
touch "$BUILD/.pixel-build"
tar -C "$SRC" --exclude=./.git --exclude=./node_modules --exclude=./android --exclude=./ios --exclude=./.expo \
  --exclude='./build*.log' --exclude=./Pixel.apk -cf - . | tar xf - -C "$BUILD"
cd "$BUILD"; took

step "npm ci"
npm ci --no-audit --no-fund; took

step "expo prebuild (android/)"
CI=1 npx expo prebuild --platform android --clean --no-install; took

step "gradle assembleRelease (arm64-v8a)"
cd "$BUILD/android"
for try in 1 2 3; do                                         # a failed download (Maven's 429, a timeout) is worth another go
  ./gradlew assembleRelease --console=plain --no-daemon -PreactNativeArchitectures=arm64-v8a 2>&1 | tee "$BUILD/gradle.log" && break
  grep -q -E 'Could not (GET|HEAD|resolve|download)|status code (429|50[0-9])|[Tt]imed out|Connection reset' "$BUILD/gradle.log" \
    && [ "$try" -lt 3 ] || die "Gradle a échoué (journal : $BUILD/gradle.log)."
  echo "Un téléchargement a échoué : nouvel essai dans $((try * 30)) s."; sleep $((try * 30))
done; took
APK=$BUILD/android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || die "Gradle n'a pas produit $APK."
[ -n "$KS" ] || KS=$BUILD/android/app/debug.keystore

step "Signature ($(basename "$BT") : zipalign, apksigner)"
"$BT/zipalign" -f -P 16 4 "$APK" "$BUILD/aligned.apk"     # 16 KB pages for the .so files, then sign: Gradle's debug signature is replaced
SIGN_PASS=$PASS SIGN_KEY_PASS=$KEY_PASS "$BT/apksigner" sign --ks "$KS" --ks-key-alias "$ALIAS" \
  --ks-pass env:SIGN_PASS --key-pass env:SIGN_KEY_PASS --v4-signing-enabled false --out "$BUILD/Pixel.apk" "$BUILD/aligned.apk"
rm -f "$BUILD/aligned.apk"; took

step "Vérification"
"$BT/zipalign" -c -P 16 4 "$BUILD/Pixel.apk" || die "l'APK n'est pas aligné."
"$BT/apksigner" verify --verbose --print-certs "$BUILD/Pixel.apk" | grep -v -E '^WARNING: .*(META-INF|not protected)'
"$BT/aapt2" dump badging "$BUILD/Pixel.apk" | grep -E "^(package|minSdkVersion|targetSdkVersion|native-code)"

mkdir -p "$OUT"
cp "$BUILD/Pixel.apk" "$OUT/Pixel.apk.tmp" && mv "$OUT/Pixel.apk.tmp" "$OUT/Pixel.apk"
echo; echo "APK : $OUT/Pixel.apk ($(du -h "$OUT/Pixel.apk" | cut -f1), en $SECONDS s)"
[ -z "${WARN:-}" ] || echo "$WARN" >&2
