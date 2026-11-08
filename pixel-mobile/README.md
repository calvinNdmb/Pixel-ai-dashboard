# Pixel pour Android

L'appli Android de Pixel. Elle affiche la page de Pixel en plein écran, avec ses trois modes : **Pixel**, **Clavier** et **Les deux**. C'est un projet Expo (SDK 58) : une vue web (`react-native-webview`), plus quelques fonctions natives.

- **Premier lancement :** l'appli scanne le QR code de Pixel. Pour l'afficher, glisse vers la gauche sur son visage. L'adresse et le code d'accès sont gardés dans le stockage sécurisé du téléphone. On peut aussi taper l'adresse à la main.
- **Mode Pixel :** l'écran du téléphone reste allumé. La page signale son mode à l'appli : `window.ReactNativeWebView.postMessage`, dans `web/app.js` de Pixel.
- **Quand Pixel ne répond pas,** ou qu'il refuse le code, l'appli affiche **Réessayer** et **Scanner un autre QR code**.
- **Le bouton retour** revient en arrière dans la page, puis quitte l'appli.

## Installer sur le téléphone

1. Sur le téléphone, ouvre `http://pixel.local:8080/pixel.apk`. Dans Chrome sur Android, le lien **Appli Android** sous le clavier de Pixel y mène aussi.
2. Ouvre le fichier téléchargé et autorise Chrome à installer des applis. Si Play Protect prévient que l'appli est inconnue, choisis **Installer quand même**.
3. Lance **Pixel**, puis touche **Scanner le QR code**.

Pixel sert le fichier `~/.config/pixel/pixel.apk` du Pi.

## Compiler l'APK

Sous Windows, la compilation C++ de React Native dépasse la limite de 260 caractères par chemin, parce que les chemins longs sont désactivés. On compile donc dans Ubuntu (WSL), avec ces deux commandes lancées depuis le dossier `pixel-mobile` :

```bash
wsl -d Ubuntu -- bash scripts/wsl-tools.sh
```

```bash
wsl -d Ubuntu -- bash scripts/build-apk-wsl.sh
```

- `wsl-tools.sh` installe Node 24 et Java 21 dans `~/pixel-tools`, et un dossier SDK Android avec la licence déjà acceptée dans Android Studio. Gradle télécharge le reste du SDK et le NDK.
- `build-apk-wsl.sh` copie le projet dans `~/pixel-mobile`, installe les paquets, génère `android/` (`expo prebuild`), compile, puis dépose `Pixel.apk` ici.

L'APK est signé avec la clé de développement de WSL (`~/.android/debug.keystore`). Compile les mises à jour au même endroit. Sinon, il faut désinstaller l'ancienne appli avant d'installer la nouvelle.

Pour la mettre sur Pixel :

```bash
ssh mopi@pixel.local 'cat > ~/.config/pixel/pixel.apk' < Pixel.apk
```

## Vérifier

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

```bash
npx expo-doctor
```
