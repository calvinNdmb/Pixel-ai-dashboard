# Pixel pour Android

L'appli Android de Pixel (version 1.1). **Elle n'a pas besoin du Pi : Pixel vit sur ton téléphone.** Relie-la à ton Pi et tu retrouves en plus les lampes, Claude, Codex, l'agenda, le cast, et le partage depuis tes autres applis. Elle affiche la page de Pixel en plein écran, avec ses trois modes : **Pixel**, **Clavier** et **Les deux**. En mode Pixel, l'écran du téléphone reste allumé.

C'est un projet Expo (SDK 58) : une vue web (`react-native-webview`), plus quelques fonctions natives, dont un petit module Kotlin à elle (`modules/pixel-native`).

## Nouveau dans la version 1.1

- **Pixel sans Pi.** Au premier lancement, Pixel est là tout de suite, sans QR code ni réseau. Le Pi devient un plus : tu le relies quand tu veux, depuis le menu.
- **Jamais d'écran bloqué.** Si ton Pi ne répond pas, Pixel continue sur le téléphone, avec un petit bandeau, et revient sur ton Pi dès qu'il répond.
- **Partager sur Pixel.** Dans n'importe quelle appli, touche **Partager**, puis **Pixel** : un lien, un texte, une photo, un GIF ou une vidéo s'affiche sur l'écran de ton Pi. Un lien YouTube s'y lance.
- **Les notifications du téléphone** (désactivées au départ). Pixel réagit quand une appli que tu as cochée reçoit une notification : ses scènes de notification se jouent (« Un message ! », « Ça sonne ! »). Sans Pi, rien ne quitte le téléphone.
- **Le Pixel de poche au complet,** sur ton Pi comme sur le téléphone : il sent le téléphone (secoue-le, penche-le, sors-le de ta poche) et sait où en est la batterie.
- **Un seul menu,** avec le bouton retour : relier ton Pi, choisir où vit Pixel, les notifications, quitter.

## Pixel sur ton téléphone, sans Pi

Au premier lancement, Pixel est là tout de suite : pas de QR code, pas de réseau.

- **Ce qui marche :** son visage, ses 52 animations, sa personnalité et toutes ses scènes, ses humeurs, les thèmes, l'horloge, le minuteur, la veille, les réglages et Pixel de poche (tourne le téléphone). La barre de commande aussi : `minuteur 10`, `humeur content`, `fais le poisson`, `aide`…
- **Ce qui a besoin du Pi le dit :** les écrans Lumières, Claude, Codex et Agenda affichent « Relie Pixel à ton Pi pour ça », et leurs touches restent éteintes. Une question pour Claude, `salon 40`, `codex …` ou un partage d'écran : Pixel répond la même chose. Il n'y a aucune fausse donnée.
- **Système** montre les mesures du téléphone : batterie, réseau, écran, processeur. Sa touche **Démarrage** rejoue le démarrage de Pixel, avec les pièces du téléphone.
- **La météo :** tape `météo Lyon` (ta ville) dans la barre de commande. Pixel demande la météo à Open-Meteo, gratuit et sans compte. La ville est gardée. Sans réseau, il le dit et réessaie tout seul.
- **Ce qui est gardé quand tu fermes l'appli :** le thème, le visage, °C ou °F, l'effet CRT, la luminosité de son visage, une humeur qui dure (endormi…), le minuteur en cours, la ville, et tout ce qu'il retient de lui (son caractère, par exemple).
- **Les thèmes :** les six, au choix dans Réglages ou avec `thème néon`. Une fois l'appli reliée à ton Pi, le Pixel du téléphone a les mêmes thèmes que lui : ceux que ton Pi a activés.

## Relier ton Pi

1. Appuie sur le bouton retour du téléphone : le menu de l'appli s'ouvre. Touche **Relier à mon Pixel**.
2. Sur l'écran du Pi, glisse vers la gauche sur le visage de Pixel : il affiche un QR code. Scanne-le. Tu peux aussi taper son adresse, avec le code après `?t=`.

L'adresse et le code d'accès sont gardés dans le stockage sécurisé du téléphone. Ensuite, l'appli montre la page de ton Pi.

- **Quand ton Pi ne répond pas** (éteint, loin de la maison, téléphone hors réseau, une page d'erreur à son adresse, ou un code refusé), Pixel continue sur ton téléphone, avec un petit bandeau : « Ton Pixel (Pi) ne répond pas : Pixel vit sur ton téléphone ». Jamais d'écran bloqué. Le bandeau se ferme avec ×, et reste fermé.
- **L'appli redemande au Pi**, de moins en moins souvent : après 5 s, 10 s, 20 s… puis toutes les 2 minutes. Jamais quand l'appli est en arrière-plan, pour ta batterie. Elle vérifie que c'est bien Pixel qui répond, et pas un autre appareil à la même adresse.
- **Quand ton Pi répond à nouveau :** si personne n'a touché le Pixel du téléphone depuis une minute (ni secoué, ni penché en Pixel de poche), qu'aucun minuteur n'y tourne et que le menu est fermé, l'appli revient au Pi toute seule. Un téléphone posé sur son support retrouve ainsi le vrai Pixel. Sinon, touche **Revenir** sur le bandeau : un câlin, une partie de Pixel de poche, une commande ou un minuteur en cours ne sont jamais coupés. Pour rester sur le Pixel du téléphone, choisis **Rester sur ce téléphone** dans le menu.
- **Le même Pixel :** tant que l'appli montre ton Pi, elle garde sa dernière image de lui : son thème, ses thèmes activés, ses réglages, sa ville et ce qu'il retient de lui (son caractère, par exemple). Sans le Pi, le Pixel du téléphone les reprend. Elle ne garde rien d'autre : ni ton code d'accès, ni ton agenda, ni tes lampes.
- **Pas de synchronisation vers le Pi.** Ce que tu changes sur le Pixel du téléphone reste sur le téléphone : le Pi ne le voit pas. Et si tu retrouves ton Pi entre-temps, c'est lui qui compte : la fois suivante, le Pixel du téléphone reprend ce que ton Pi montrait.

## Le menu de l'appli

Il s'ouvre avec le **bouton retour** (dans la page du Pi, le bouton retour revient d'abord en arrière dans la page), ou en touchant **Pixel sur ce téléphone ⋯** sous l'écran du Pixel du téléphone. Il ne touche pas l'écran de Pixel, donc il ne gêne aucun de ses gestes : toucher, glisser, appui long pour le câliner, caresse.

- **Mon Pixel (Pi)** : revenir à la page de ton Pi (tout de suite, même s'il ne répondait plus).
- **Pixel sur ce téléphone** : le Pixel du téléphone, même quand ton Pi est là. Ce choix est gardé.
- **Rester sur ce téléphone** (quand ton Pi ne répond pas) : le même choix. L'appli ne revient plus toute seule au Pi.
- **Relier à mon Pixel** (pas encore de Pi) ou **Scanner un autre QR code** (un autre Pi, ou un nouveau code d'accès).
- **Notifications du téléphone** : leurs réglages (voir plus bas).
- **Oublier mon Pixel** : l'appli oublie ton Pi (touche deux fois). Le Pixel du téléphone garde ce qu'il a.
- **Quitter l'appli.**

Bouton retour une deuxième fois, menu ouvert : l'appli se ferme.

## Pixel de poche

Tiens le téléphone à l'horizontale, sur la page de ton Pi comme sur le Pixel du téléphone. L'appli passe en paysage et en plein écran (sans les barres du téléphone), garde l'écran allumé tant qu'il est réveillé, et prête à Pixel l'accéléromètre et la batterie, même sur l'adresse en http de ton Pi : secoue-le, penche-le, sors-le de ta poche, branche le chargeur. Remets le téléphone droit : la télécommande revient, avec ses barres. Couché à plat, il reste en paysage.

## Partager sur Pixel

- **Ce qui part :** un lien (YouTube et Vimeo se lancent sur Pixel ; une autre page devient une carte avec son QR code), un texte, une photo, un GIF ou une vidéo. Si tu partages plusieurs photos, seule la première part.
- **Il faut ton Pi :** c'est son écran qui affiche ce que tu partages. Sans Pi relié, la carte le dit (« Relie Pixel à ton Pi pour afficher ça sur son écran ») et son bouton **Relier à mon Pixel** ouvre l'appli sur le QR code.
- **Les vidéos :** 40 Mo au plus, sauf si le réglage `max_mb` de la section `[cast]` de Pixel dit autre chose. Au-delà, la carte le dit avant d'envoyer quoi que ce soit : envoie plutôt le lien de la vidéo, ou une vidéo plus courte. Si tu as monté la limite de Pixel, touche **Envoyer quand même** : l'appli retient ce qu'il a pris, et la limite qu'il annonce quand il refuse un fichier.
- **Si ton Pi ne répond pas,** la carte le dit et propose **Réessayer**. S'il refuse, la carte affiche sa réponse.
- Le fichier est lu directement dans l'appli qui le partage, puis envoyé à Pixel au fur et à mesure. L'appli n'en garde aucune copie.
- L'appli ne lit que ce qu'une autre appli lui confie (une adresse `content://`) : jamais un chemin de fichier (`file://`), ni ses propres fichiers, où est gardé ton code d'accès.
- Une photo que Pixel ne sait pas lire (HEIC, AVIF…), ou une photo JPEG de plus de 4 Mo, part en JPEG de 1920 pixels au plus : l'écran de Pixel fait 800 × 480. Les GIF, WebP et PNG partent tels quels.
- Il faut un Pi qui sait recevoir des partages (`POST /api/cast`, le « cast » de Pixel OS). Sinon, la carte dit de le mettre à jour.

## Les notifications : ce que Pixel reçoit

Dans le menu de l'appli, ouvre **Notifications du téléphone**.

- **Rien ne se passe tant que tu ne l'as pas activé.** Android demande aussi ton accord une fois (**Accès aux notifications**) : le bouton **Autoriser dans les réglages** y mène.
- **Avec ton Pi relié,** elles partent vers lui, même quand l'appli est fermée, et ses scènes de notification se jouent sur son écran.
- **Sans Pi, rien ne quitte le téléphone.** Le Pixel du téléphone réagit seulement quand l'appli est ouverte et devant toi. Quand tu relies ensuite ton Pi, ce réglage se désactive : les envoyer à ton Pi est un choix à part, que tu fais en le réactivant.
- **Désactivé, c'est vraiment éteint.** L'appli demande alors à Android de ne plus du tout lui donner les notifications, même si l'accès reste autorisé, jusqu'à ce que tu réactives.
- **Seulement les applis que tu coches** dans la liste.
- **Par défaut, juste le nom de l'appli.** Pixel affiche « 📱 Nouveau message WhatsApp ».
- **Le titre, si tu le veux.** C'est souvent l'expéditeur : avec **Envoyer aussi le titre** (sans Pi : **Montrer aussi le titre**), Pixel affiche « 📱 WhatsApp : Maman ».
- **Jamais le texte du message.**
- **Jamais certaines notifications :**
  - les silencieuses ;
  - les permanentes (musique, GPS, téléchargements, services) ;
  - les résumés de groupe ;
  - celles que **Ne pas déranger** cache ;
  - les mises à jour d'une notification déjà envoyée.
- **Pas trop souvent.** Le téléphone en passe au plus une par appli toutes les 20 secondes, et 8 par minute en tout. Ton Pi en accepte 12 par minute.
- **Quand l'appli est fermée :** c'est Android qui fait tourner l'écouteur de notifications. Sur certains téléphones (Xiaomi, Huawei, ou en économie d'énergie), autorise l'appli à tourner en arrière-plan.
- **Le bouton Envoyer une notification de test** montre sur ton Pi une notification de « Pixel pour Android », réglée comme les vraies. Sans Pi, **Essayer sur Pixel** ferme les réglages et la montre au Pixel du téléphone.
- **« Paramètre restreint » :** Android 13 et plus le dit pour une appli installée hors du Play Store. Ouvre **Infos de l'appli** (le bouton est dans l'écran des notifications), touche le menu **⋮** en haut à droite, puis **Autoriser les paramètres restreints**, et réessaie.

Le partage et les notifications marchent appli fermée. L'appli recopie donc l'adresse de ton Pi et ton code d'accès dans un fichier privé, que seule elle peut lire et qui n'est jamais sauvegardé (`no_backup`). Côté Pi, c'est `pixel/telephone.py` (`POST /api/notif`) : il n'accepte que les appareils de la maison avec le code d'accès, comme la page.

## Installer sur le téléphone

1. Sur le téléphone, ouvre `http://pixel.local:8080/pixel.apk`. Dans Chrome sur Android, le lien **Appli Android** sous le clavier de Pixel y mène aussi.
2. Ouvre le fichier téléchargé et autorise Chrome à installer des applis. Si Play Protect prévient que l'appli est inconnue, choisis **Installer quand même**.
3. Lance **Pixel** : il est déjà là. Pour le relier à ton Pi, voir plus haut.

Ton Pi sert le fichier `~/.config/pixel/pixel.apk`.

## Installer la mise à jour 1.1

Cet APK est signé avec une nouvelle clé. Android refuse donc de l'installer par-dessus l'ancienne appli : il dit « Application non installée », ou parle d'un conflit.

1. **Une seule fois :** désinstalle l'ancienne appli Pixel (appui long sur son icône, puis **Désinstaller**).
2. Installe le nouvel APK, comme plus haut.
3. Lance Pixel : il vit déjà sur ton téléphone. Pour retrouver ton Pi, ouvre le menu (bouton retour), **Relier à mon Pixel**, et **scanne à nouveau son QR code** : la désinstallation a effacé l'adresse et le code.

Les mises à jour suivantes s'installent par-dessus, sans rien perdre, si elles sont compilées avec la même clé.

## Compiler l'APK

Le Pixel du téléphone est la vraie page de Pixel (`pixel-app/web`), réunie en un seul fichier hors ligne : `assets/pixel-local.html`. Il n'est pas dans git : on le fabrique avec Python 3, depuis le dossier `pixel-mobile`. Les deux scripts de compilation le refont avant chaque APK, pour qu'il ait toujours la page du dépôt :

```bash
npm run bundle:web
```

### Sous Linux

Depuis le dossier `pixel-mobile` :

```bash
bash scripts/build-apk-linux.sh
```

Il faut Java 17 ou plus, Node, Python 3 et un SDK Android dont les licences sont acceptées. Le SDK est dans `~/android-sdk`, ou ailleurs avec `ANDROID_HOME=...`. Le script fabrique `assets/pixel-local.html`, copie le projet dans `~/pixel-mobile-build`, installe les paquets, génère `android/` (`expo prebuild`), compile, signe, puis dépose `Pixel.apk` ici.

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
- `build-apk-wsl.sh` fabrique `assets/pixel-local.html`, copie le projet dans `~/pixel-mobile`, installe les paquets, génère `android/` (`expo prebuild`), compile, puis dépose `Pixel.apk` ici.

L'APK de WSL est signé avec la clé de développement de WSL (`~/.android/debug.keystore`).

### Le mettre sur ton Pi

```bash
ssh mopi@pixel.local 'cat > ~/.config/pixel/pixel.apk' < Pixel.apk
```

**En développement** (`npx expo start`), si tu n'as pas encore lancé `npm run bundle:web`, l'appli démarre quand même : le Pixel du téléphone affiche comment le fabriquer, et Metro le rappelle. Une compilation de l'APK, elle, s'arrête avec ce message, pour ne jamais livrer une appli sans Pixel. Si l'appli installée n'arrive pas à sortir la page de l'APK (un téléphone plein, par exemple), elle le dit, avec **Réessayer** et le menu.

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

Côté Pixel (dossier `pixel-app`) : `node tests/test_local.js` pour le Pixel du téléphone (ses notifications et ses sens de Pixel de poche compris), `node tests/test_poche.js` pour le Pixel de poche dans l'appli, `python3 tests/test_telephone.py` pour les notifications reçues par le Pi.

## Pour les curieux

| Fichier | Rôle |
| --- | --- |
| `App.tsx` | L'écran de départ : le Pixel du téléphone, ou la page du Pi. Le QR code, la page du Pi, le menu et les notifications par-dessus. |
| `src/LocalPixel.tsx` | Le Pixel du téléphone : la page hors ligne, son état rendu avant qu'elle démarre. |
| `src/Linked.tsx` | Pi relié : sa page, le Pixel du téléphone quand il ne répond pas, le bandeau, les nouvelles tentatives. |
| `src/PixelMenu.tsx` | Le menu de l'appli. |
| `src/Notifs.tsx` | L'écran des notifications du téléphone. |
| `src/webBridge.ts` | Ce que les deux vues web partagent : leurs réglages, les messages de la page, les fonctions natives branchées. |
| `src/plugs.ts` | Les fonctions natives des deux pages : l'écran allumé, Pixel de poche, les notifications pour le Pixel du téléphone, l'image du Pi. |
| `src/poche.ts` | Pixel de poche : l'écran en paysage, l'accéléromètre et la batterie pour la page, le plein écran. |
| `src/back.ts` | Le bouton retour : ce qui est au-dessus le prend. |
| `src/localStore.ts` | Ce que l'appli garde pour le Pixel du téléphone. |
| `src/theme.ts` | Les couleurs de Pixel. |
| `modules/pixel-native/` | Le module Kotlin : l'écran de partage (`ShareActivity`), l'écouteur de notifications (`NotificationRelay`), leurs réglages ; `app.plugin.js` les déclare dans le manifeste Android. |
| `metro.config.js` | Le fichier `.html` comme ressource ; la page d'attente quand il manque. |
| `scripts/` | Les compilations de l'APK (Linux, WSL). |

**Les fonctions natives se branchent une seule fois** (`src/plugs.ts`), et marchent sur les deux pages : la page de ton Pi et le Pixel du téléphone. Chacune reçoit les messages de la page affichée (`window.ReactNativeWebView.postMessage`), peut lancer un script avant les siens, ou lui en envoyer un, et sait quand la page se charge, est prête ou s'en va. Ainsi, Pixel de poche (`{poche: true}` de `web/poche.js`), l'écran allumé (`{mode: 'pixel'}`) et l'image du Pi n'ont rien à savoir de la page qui les demande. Les notifications du téléphone, sans Pi : l'écouteur natif les passe à l'appli (`onNotif`) seulement si elle les écoute, et l'appli les donne à la page (`PixelLocal.notif`, dans `pixel-app/web/local.js`), qui les affiche comme ton Pi.

**Comment la page est chargée.** `expo-asset` copie `pixel-local.html` de l'APK vers le cache de l'appli, et la vue web l'ouvre là, comme une page `file://` (`allowFileAccess`). Le guide de `react-native-webview` charge les pages locales d'Android en `file://` (`file:///android_asset/…`). Mais mettre un fichier dans `android/` demande une configuration native, alors que `android/` est regénéré à chaque `expo prebuild`. `expo-asset` fait la même chose depuis les ressources de Metro, sans rien de natif. L'autre voie, `source={{ html, baseUrl }}`, ferait passer 2,6 Mo de texte par React Native à chaque affichage. Le `localStorage` d'une page `file://` est gardé par la vue web dans les données de l'appli. Toutes les pages `file://` ont la même origine : une nouvelle version du fichier, dans un autre nom du cache, garde donc le même `localStorage`.

**Comment son état est gardé.** La page envoie son état à l'appli (`{local_save: …}`). L'appli l'écrit dans un fichier JSON du dossier documents (`expo-file-system`, `Paths.document` : « à l'abri d'une suppression par le système », dit sa doc). Ce n'est pas `SecureStore` : il chiffre de petites valeurs, et certaines versions d'iOS refusaient celles de plus de 2048 octets. Les tailles sont vérifiées : 256 Ko pour son état, 512 Ko pour l'image du Pi. De l'image du Pi, l'appli ne garde que ce que le Pixel du téléphone reprend (son apparence, deux réglages, la ville, l'état de ses fonctions) : pas l'adresse avec le code d'accès, ni le QR code, l'agenda ou les pièces. Au démarrage suivant, l'appli rend l'état à la page avant ses scripts (`injectedJavaScriptBeforeContentLoaded`, dans `window.PIXEL_LOCAL_STATE`), avec l'image du Pi. La doc de `react-native-webview` prévient que sous Android ce n'est « pas fiable à 100 % » : l'appli le redonne donc une fois la page chargée. `pixel-app/web/local.js` garde le plus récent de ce qu'il a : le `localStorage`, la copie de l'appli, l'image du Pi. « Récent » veut dire ce que tu as fait en dernier sur le téléphone, ou l'heure de l'image du Pi : la météo du jour ou le minuteur qui sonne ne rendent pas le téléphone plus récent que le Pi.

**Seulement la page attendue.** L'appli n'écoute que les messages de la page qu'elle a ouverte : la même adresse que ton Pi (ou le fichier du Pixel du téléphone). Si un lien mène la vue web ailleurs, cette page ne peut ni se faire passer pour Pixel, ni écrire l'image du Pi.

**La carte de partage, sans Pi.** Son bouton **Relier à mon Pixel** ouvre l'appli par son propre écran (une intention adressée à l'appli elle-même, `pixel://relier`, lue par `Linking` de React Native) : aucune autre appli n'est sollicitée, et l'appli ne déclare aucun schéma d'adresse. L'intention porte son heure (`?at=…`) et l'appli ne la suit qu'une fois : quand Android recrée l'appli depuis les applis récentes, il lui redonne sa première intention, et l'écran du QR code ne revient donc pas à chaque démarrage.

**Le bouton retour.** Une seule règle pour toute l'appli (`src/back.ts`) : c'est ce qui est au-dessus qui le prend, l'écran du QR code, puis les notifications, puis le menu, puis la page. React Native, lui, donne le bouton au dernier arrivé : sans cette règle, une page qui change sous le menu (le Pi qui ne répond plus, ou qui revient) lui volerait le bouton.

**Les fonctions natives et le chargement.** Sous Android, `react-native-webview` 14.0.1 signale le début d'un chargement (`onLoadStart`) à chaque changement de l'historique, même dans la même page : `history.replaceState` (la page du Pi retire `?t=` de son adresse) aussi, et parfois après ses premiers messages. Les fonctions natives ne repartent donc de zéro que pour un nouveau document, ou une nouvelle vue web.
