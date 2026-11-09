#!/bin/bash
# Builds the Pixel Android app (pixel-mobile) in WSL, where paths have no 260-character limit.
# From Windows, in the pixel-mobile folder:  wsl -d Ubuntu -- bash scripts/build-apk-wsl.sh
set -e
SRC=$(cd "$(dirname "$0")/.." && pwd)        # the pixel-mobile folder this script sits in
. ~/pixel-tools/env.sh
echo "### Pixel sans Pi"; (cd "$SRC" && npm run bundle:web)   # assets/pixel-local.html: the phone's own Pixel, from ../pixel-app/web
mkdir -p ~/pixel-mobile
tar -C "$SRC" --exclude=./.git --exclude=./node_modules --exclude=./android --exclude='./build*.log' --exclude=./Pixel.apk -cf - . | tar xf - -C ~/pixel-mobile
cd ~/pixel-mobile
echo "### npm ci"; npm ci --no-audit --no-fund
echo "### prebuild"; npx expo prebuild --platform android --clean --no-install
echo "### gradle"; cd android && ./gradlew assembleRelease --console=plain
cp app/build/outputs/apk/release/app-release.apk "$SRC/Pixel.apk" && echo "APK : $SRC/Pixel.apk"
