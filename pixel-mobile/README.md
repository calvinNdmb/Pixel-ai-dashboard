# Pixel pour Android

L'appli Android de Pixel (version 1.1). Elle affiche la page de Pixel en plein écran, avec ses trois modes : **Pixel**, **Clavier** et **Les deux**. C'est un projet Expo (SDK 58) : une vue web (`react-native-webview`), plus quelques fonctions natives, dont un petit module Kotlin à elle (`modules/pixel-native`).

- **Premier lancement :** l'appli scanne le QR code de Pixel. Pour l'afficher, glisse vers la gauche sur son visage. L'adresse et le code d'accès sont gardés dans le stockage sécurisé du téléphone. On peut aussi taper l'adresse à la main.
- **Mode Pixel :** l'écran du téléphone reste allumé. La page signale son mode à l'appli : `window.ReactNativeWebView.postMessage`, dans `web/app.js` de Pixel.
- **Quand Pixel ne répond pas,** ou qu'il refuse le code, l'appli affiche **Réessayer** et **Scanner un autre QR code**.
- **Le bouton retour** revient en arrière dans la page. Sur la page d'accueil de Pixel, il ouvre le menu de l'appli ; une fois de plus, il quitte l'appli.

## Nouveau dans la version 1.1

- **Partager sur Pixel.** Dans n'importe quelle appli, touche **Partager**, puis **Pixel** : un lien, un texte, une photo, un GIF ou une vidéo s'affiche sur l'écran de Pixel. Un lien YouTube s'y lance. Une petite carte dit « Envoyé sur Pixel ✓ », ou ce qui ne va pas, puis disparaît : tu restes dans ton appli.
- **Les notifications du téléphone** (désactivées au départ). Pixel réagit quand une appli que tu as cochée reçoit une notification : ses scènes de notification se jouent (« Un message ! », « Ça sonne ! »). Ce qu'il reçoit, et ce qu'il ne reçoit jamais : voir plus bas.
- **Le Pixel de poche au complet.** Dans l'appli, il sent enfin le téléphone, même sur l'adresse en http de Pixel : secoue-le, penche-le, sors-le de ta poche, et il sait où en est la batterie. L'appli tient l'écran en paysage et cache les barres du téléphone. Remets le téléphone droit : la télécommande revient, avec ses barres.
- **Le menu de l'appli** (le bouton retour, sur la page d'accueil de Pixel) : **Notifications du téléphone**, **Scanner un autre QR code**, **Quitter l'appli**.

## Partager sur Pixel

- **Ce qui part :** un lien (YouTube et Vimeo se lancent sur Pixel ; une autre page devient une carte avec son QR code), un texte, une photo, un GIF ou une vidéo. Si tu partages plusieurs photos, seule la première part.
- **Les vidéos :** 40 Mo au plus, sauf si le réglage `max_mb` de la section `[cast]` de Pixel dit autre chose. Au-delà, la carte le dit avant d'envoyer quoi que ce soit : envoie plutôt le lien de la vidéo, ou une vidéo plus courte. Si tu as monté la limite de Pixel, touche **Envoyer quand même** : l'appli retient ce qu'il a pris, et la limite qu'il annonce quand il refuse un fichier.
- **Si l'appli n'est pas encore reliée à Pixel,** la carte le dit et propose **Scanner le QR code**.
- **Si Pixel ne répond pas,** la carte le dit et propose **Réessayer**. Si Pixel refuse, la carte affiche sa réponse.
- Le fichier est lu directement dans l'appli qui le partage, puis envoyé à Pixel au fur et à mesure. L'appli n'en garde aucune copie.
- L'appli ne lit que ce qu'une autre appli lui confie (une adresse `content://`) : jamais un chemin de fichier (`file://`), ni ses propres fichiers, où est gardé ton code d'accès.
- Une photo que Pixel ne sait pas lire (HEIC, AVIF…), ou une photo JPEG de plus de 4 Mo, part en JPEG de 1920 pixels au plus : l'écran de Pixel fait 800 × 480. Les GIF, WebP et PNG partent tels quels.
- Il faut un Pixel qui sait recevoir des partages (`POST /api/cast`, le « cast » de Pixel OS). Sinon, la carte dit de mettre Pixel à jour.

## Les notifications : ce que Pixel reçoit

Dans le menu de l'appli, ouvre **Notifications du téléphone**.

- **Rien ne part tant que tu ne l'as pas activé.** Android demande aussi ton accord une fois (**Accès aux notifications**) : le bouton **Autoriser dans les réglages** y mène.
- **Désactivé, c'est vraiment éteint.** L'appli demande alors à Android de ne plus du tout lui donner les notifications, même si l'accès reste autorisé, jusqu'à ce que tu réactives.
- **Seulement les applis que tu coches** dans la liste.
- **Par défaut, juste le nom de l'appli.** Pixel affiche « 📱 Nouveau message WhatsApp ».
- **Le titre, si tu le veux.** C'est souvent l'expéditeur : avec **Envoyer aussi le titre**, Pixel affiche « 📱 WhatsApp : Maman ».
- **Jamais le texte du message.**
- **Jamais certaines notifications :**
  - les silencieuses ;
  - les permanentes (musique, GPS, téléchargements, services) ;
  - les résumés de groupe ;
  - celles que **Ne pas déranger** cache ;
  - les mises à jour d'une notification déjà envoyée.
- **Pas trop souvent.** Le téléphone envoie au plus une notification par appli toutes les 20 secondes, et 8 par minute en tout. Pixel en accepte 12 par minute.
- **Même quand l'appli est fermée :** c'est Android qui fait tourner l'écouteur de notifications. Sur certains téléphones (Xiaomi, Huawei, ou en économie d'énergie), autorise l'appli à tourner en arrière-plan.
- **Le bouton Envoyer une notification de test** montre sur Pixel une notification de « Pixel pour Android », réglée comme les vraies.
- **« Paramètre restreint » :** Android 13 et plus le dit pour une appli installée hors du Play Store. Ouvre **Infos de l'appli** (le bouton est dans l'écran des notifications), touche le menu **⋮** en haut à droite, puis **Autoriser les paramètres restreints**, et réessaie.

Les fonctions natives (le partage, les notifications) marchent appli fermée. L'appli recopie donc l'adresse de Pixel et ton code d'accès dans un fichier privé, que seule elle peut lire et qui n'est jamais sauvegardé (`no_backup`). Côté Pixel, c'est `pixel/telephone.py` (`POST /api/notif`) : il n'accepte que les appareils de la maison avec le code d'accès, comme la page.

## Installer sur le téléphone

1. Sur le téléphone, ouvre `http://pixel.local:8080/pixel.apk`. Dans Chrome sur Android, le lien **Appli Android** sous le clavier de Pixel y mène aussi.
2. Ouvre le fichier téléchargé et autorise Chrome à installer des applis. Si Play Protect prévient que l'appli est inconnue, choisis **Installer quand même**.
3. Lance **Pixel**, puis touche **Scanner le QR code**.

Pixel sert le fichier `~/.config/pixel/pixel.apk` du Pi.

## Installer la mise à jour 1.1

Cet APK est signé avec une nouvelle clé. Android refuse donc de l'installer par-dessus l'ancienne appli : il dit « Application non installée », ou parle d'un conflit.

1. **Une seule fois :** désinstalle l'ancienne appli Pixel (appui long sur son icône, puis **Désinstaller**).
2. Installe le nouvel APK, comme plus haut.
3. Lance Pixel et **scanne à nouveau le QR code** : la désinstallation a effacé l'adresse et le code.

Les mises à jour suivantes s'installent par-dessus, sans rien perdre, si elles sont compilées avec la même clé.

## Compiler l'APK

### Sous Linux

Depuis le dossier `pixel-mobile` :

```bash
bash scripts/build-apk-linux.sh
```

Il faut Java 17 ou plus, Node et un SDK Android dont les licences sont acceptées. Le SDK est dans `~/android-sdk`, ou ailleurs avec `ANDROID_HOME=...`. Le script copie le projet dans `~/pixel-mobile-build`, installe les paquets, génère `android/` (`expo prebuild`), compile, signe, puis dépose `Pixel.apk` ici.

**La clé de signature.** Pour que les mises à jour s'installent par-dessus, signe toujours avec la même clé. Donne-la au script :

```bash
PIXEL_KEYSTORE=~/cles/pixel.jks PIXEL_KEYSTORE_PASS='…' bash scripts/build-apk-linux.sh
```

- `PIXEL_KEY_ALIAS` donne le nom de la clé dans le fichier (par défaut `pixel`).
- Sans `PIXEL_KEYSTORE`, l'APK est signé avec la clé de développement publique.
- Garde le fichier de clé et son mot de passe hors du dépôt, et fais-en une copie : sans eux, la mise à jour suivante demande de désinstaller l'appli.

### Sous Windows

La compilation C++ de React Native dépasse la limite de 260 caractères par chemin, parce que les chemins longs sont désactivés. On compile donc dans Ubuntu (WSL), avec ces deux commandes lancées depuis le dossier `pixel-mobile` :

```bash
wsl -d Ubuntu -- bash scripts/wsl-tools.sh
```

```bash
wsl -d Ubuntu -- bash scripts/build-apk-wsl.sh
```

- `wsl-tools.sh` installe Node 24 et Java 21 dans `~/pixel-tools`, et un dossier SDK Android avec la licence déjà acceptée dans Android Studio. Gradle télécharge le reste du SDK et le NDK.
- `build-apk-wsl.sh` copie le projet dans `~/pixel-mobile`, installe les paquets, génère `android/` (`expo prebuild`), compile, puis dépose `Pixel.apk` ici.

L'APK de WSL est signé avec la clé de développement de WSL (`~/.android/debug.keystore`).

### Le mettre sur Pixel

```bash
ssh mopi@pixel.local 'cat > ~/.config/pixel/pixel.apk' < Pixel.apk
```

## Le code

| Fichier | Rôle |
| --- | --- |
| `App.tsx` | l'appli : le QR code, la page de Pixel, le menu |
| `src/poche.ts` | le Pixel de poche : l'écran en paysage, l'accéléromètre et la batterie pour la page |
| `src/Notifs.tsx` | l'écran des notifications du téléphone |
| `modules/pixel-native/` | le module Kotlin : l'écran de partage (`ShareActivity`), l'écouteur de notifications (`NotificationRelay`), leurs réglages ; `app.plugin.js` les déclare dans le manifeste Android |

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

Côté Pixel : `python3 tests/test_telephone.py` pour les notifications, `node tests/test_poche.js` pour le Pixel de poche dans l'appli (dossier `pixel-app`).
