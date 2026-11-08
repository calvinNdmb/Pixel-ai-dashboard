#!/bin/bash
# Build tools for the Pixel Android app, in the user's home only (nothing system-wide): Node, Java 21, an Android SDK folder.
set -e
T=$HOME/pixel-tools; mkdir -p "$T"; cd "$T"
if [ ! -x node/bin/node ]; then curl -fsSL https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-x64.tar.xz | tar xJ && mv node-v24.14.0-linux-x64 node; fi
if [ ! -x jdk/bin/java ]; then curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" | tar xz && mv jdk-21* jdk; fi
LIC=$(ls -d /mnt/c/Users/*/AppData/Local/Android/Sdk/licenses 2>/dev/null | head -1)   # licences already accepted in Android Studio, on Windows
[ -n "$LIC" ] || { echo "Accepte d'abord les licences du SDK dans Android Studio (Windows)." >&2; exit 1; }
mkdir -p android-sdk/licenses && cp "$LIC"/* android-sdk/licenses/
cat > env.sh <<ENV
export JAVA_HOME=$T/jdk ANDROID_HOME=$T/android-sdk
export PATH=$T/node/bin:$T/jdk/bin:/usr/local/bin:/usr/bin:/bin
ENV
. ./env.sh
echo "node $(node -v) | $(java -version 2>&1 | head -1) | licences: $(ls android-sdk/licenses | tr '\n' ' ')"
