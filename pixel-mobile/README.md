# Pixel pour Android

L'appli Android de Pixel. **Elle n'a pas besoin du Pi : Pixel vit sur ton téléphone.** Relie-la à ton Pi et tu retrouves en plus les lampes, Claude, Codex, l'agenda et le cast. Elle affiche la page de Pixel en plein écran, avec ses trois modes : **Pixel**, **Clavier** et **Les deux**. C'est un projet Expo (SDK 58) : une vue web (`react-native-webview`), plus quelques fonctions natives.

## Pixel sur ton téléphone, sans Pi

Au premier lancement, Pixel est là tout de suite : pas de QR code, pas de réseau.

- **Ce qui marche :** son visage, ses 52 animations, sa personnalité et toutes ses scènes, ses humeurs, les thèmes, l'horloge, le minuteur, la veille, les réglages et Pixel de poche (tourne le téléphone). La barre de commande aussi : `minuteur 10`, `humeur content`, `fais le poisson`, `aide`…
- **Ce qui a besoin du Pi le dit :** les écrans Lumières, Claude, Codex et Agenda affichent « Relie Pixel à ton Pi pour ça », et leurs touches restent éteintes. Une question pour Claude, `salon 40` ou `codex …` : Pixel répond la même chose. Il n'y a aucune fausse donnée.
- **Système** montre les mesures du téléphone : batterie, réseau, écran, processeur.
- **La météo :** tape `météo Lyon` (ta ville) dans la barre de commande. Pixel demande la météo à Open-Meteo, gratuit et sans compte. La ville est gardée. Sans réseau, il le dit et réessaie tout seul.
- **Ce qui est gardé quand tu fermes l'appli :** le thème, le visage, °C ou °F, l'effet CRT, la luminosité de son visage, une humeur qui dure (endormi…), le minuteur en cours, la ville, et tout ce qu'il retient de lui (son caractère, par exemple).
- **Le thème :** comme sur le Pi, Rétro seulement pour le moment. Une fois l'appli reliée à ton Pi, le Pixel du téléphone a les mêmes thèmes que lui.

## Relier ton Pi

1. Appuie sur le bouton retour du téléphone : le menu de l'appli s'ouvre. Touche **Relier à mon Pixel**.
2. Sur l'écran du Pi, glisse vers la gauche sur le visage de Pixel : il affiche un QR code. Scanne-le. Tu peux aussi taper son adresse, avec le code après `?t=`.

L'adresse et le code d'accès sont gardés dans le stockage sécurisé du téléphone. Ensuite, l'appli montre la page de ton Pi, comme avant.

- **Quand ton Pi ne répond pas** (éteint, loin de la maison, téléphone hors réseau, ou un code refusé), Pixel continue sur ton téléphone, avec un petit bandeau : « Ton Pixel (Pi) ne répond pas : Pixel vit sur ton téléphone ». Jamais d'écran bloqué.
- **L'appli redemande au Pi**, de moins en moins souvent : après 5 s, 10 s, 20 s… puis toutes les 2 minutes. Jamais quand l'appli est en arrière-plan, pour ta batterie.
- **Quand ton Pi répond à nouveau :** si personne n'a touché le Pixel du téléphone depuis une minute et qu'aucun minuteur n'y tourne, l'appli revient au Pi toute seule. Un téléphone posé sur son support retrouve ainsi le vrai Pixel. Sinon, touche **Revenir** sur le bandeau : un câlin, une commande ou un minuteur en cours ne sont jamais coupés.
- **Le même Pixel :** tant que l'appli montre ton Pi, elle garde sa dernière image de lui : son thème, ses thèmes activés, ses réglages et son caractère. Sans le Pi, le Pixel du téléphone les reprend.
- **Pas de synchronisation vers le Pi.** Ce que tu changes sur le Pixel du téléphone reste sur le téléphone : le Pi ne le voit pas. Et si tu retrouves ton Pi entre-temps, c'est lui qui compte : la fois suivante, le Pixel du téléphone reprend ce que ton Pi montrait.

## Le menu de l'appli

Il s'ouvre avec le **bouton retour**, ou en touchant **Pixel sur ce téléphone ⋯** sous l'écran du Pixel du téléphone. Il ne touche pas l'écran de Pixel, donc il ne gêne aucun de ses gestes : toucher, glisser, appui long pour le câliner, caresse.

- **Mon Pixel (Pi)** : revenir à la page de ton Pi (tout de suite, même s'il ne répondait plus).
- **Pixel sur ce téléphone** : le Pixel du téléphone, même quand ton Pi est là. Ce choix est gardé.
- **Relier à mon Pixel** : scanner le QR code de ton Pi, ou taper son adresse.
- **Oublier mon Pixel** : l'appli oublie ton Pi (touche deux fois). Le Pixel du téléphone garde ce qu'il a.

Bouton retour une deuxième fois, menu ouvert : l'appli se ferme. Dans la page du Pi, le bouton retour revient d'abord en arrière dans la page.

## Installer sur le téléphone

1. Sur le téléphone, ouvre `http://pixel.local:8080/pixel.apk`. Dans Chrome sur Android, le lien **Appli Android** sous le clavier de Pixel y mène aussi.
2. Ouvre le fichier téléchargé et autorise Chrome à installer des applis. Si Play Protect prévient que l'appli est inconnue, choisis **Installer quand même**.
3. Lance **Pixel** : il est déjà là. Pour le relier à ton Pi, voir plus haut.

Pixel sert le fichier `~/.config/pixel/pixel.apk` du Pi.

## Compiler l'APK

Le Pixel du téléphone est la vraie page de Pixel (`pixel-app/web`), réunie en un seul fichier hors ligne : `assets/pixel-local.html`. Il n'est pas dans git : on le fabrique avant chaque compilation, avec Python 3, depuis le dossier `pixel-mobile` :

```bash
npm run bundle:web
```

C'est la seule étape à ajouter à un script de compilation, avant `expo prebuild` et Gradle. Le script Windows (WSL) la fait déjà.

Sous Windows, la compilation C++ de React Native dépasse la limite de 260 caractères par chemin, parce que les chemins longs sont désactivés. On compile donc dans Ubuntu (WSL), avec ces deux commandes lancées depuis le dossier `pixel-mobile` :

```bash
wsl -d Ubuntu -- bash scripts/wsl-tools.sh
```

```bash
wsl -d Ubuntu -- bash scripts/build-apk-wsl.sh
```

- `wsl-tools.sh` installe Node 24 et Java 21 dans `~/pixel-tools`, et un dossier SDK Android avec la licence déjà acceptée dans Android Studio. Gradle télécharge le reste du SDK et le NDK.
- `build-apk-wsl.sh` fabrique `assets/pixel-local.html`, copie le projet dans `~/pixel-mobile`, installe les paquets, génère `android/` (`expo prebuild`), compile, puis dépose `Pixel.apk` ici.

L'APK est signé avec la clé de développement de WSL (`~/.android/debug.keystore`). Compile les mises à jour au même endroit. Sinon, il faut désinstaller l'ancienne appli avant d'installer la nouvelle.

Pour la mettre sur Pixel :

```bash
ssh mopi@pixel.local 'cat > ~/.config/pixel/pixel.apk' < Pixel.apk
```

**En développement** (`npx expo start`), si tu n'as pas encore lancé `npm run bundle:web`, l'appli démarre quand même : le Pixel du téléphone affiche comment le fabriquer, et Metro le rappelle. Une compilation de l'APK, elle, s'arrête avec ce message, pour ne jamais livrer une appli sans Pixel.

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

Le Pixel du téléphone lui-même est vérifié dans `pixel-app` : `node tests/test_local.js`.

## Pour les curieux

| Fichier | Rôle |
| --- | --- |
| `App.tsx` | L'écran de départ : le Pixel du téléphone, ou la page du Pi. Le QR code, la page du Pi. |
| `LocalPixel.tsx` | Le Pixel du téléphone : la page hors ligne, son état rendu avant qu'elle démarre. |
| `Linked.tsx` | Pi relié : sa page, le Pixel du téléphone quand il ne répond pas, le bandeau, les nouvelles tentatives, l'image du Pi. |
| `PixelMenu.tsx` | Le menu de l'appli. |
| `localStore.ts` | Ce que l'appli garde pour le Pixel du téléphone. |
| `webBridge.ts` | Ce que les deux vues web partagent, dont les fonctions natives. |
| `metro.config.js` | Le fichier `.html` comme ressource ; la page d'attente quand il manque. |

**Comment la page est chargée.** `expo-asset` copie `pixel-local.html` de l'APK vers le cache de l'appli, et la vue web l'ouvre là, comme une page `file://` (`allowFileAccess`). Le guide de `react-native-webview` charge les pages locales d'Android en `file://` (`file:///android_asset/…`). Mais mettre un fichier dans `android/` demande une configuration native, alors que `android/` est regénéré à chaque `expo prebuild`. `expo-asset` fait la même chose depuis les ressources de Metro, sans rien de natif. L'autre voie, `source={{ html, baseUrl }}`, ferait passer 2,4 Mo de texte par React Native à chaque affichage. Le `localStorage` d'une page `file://` est gardé par la vue web dans les données de l'appli. Toutes les pages `file://` ont la même origine : une nouvelle version du fichier, dans un autre nom du cache, garde donc le même `localStorage`.

**Comment son état est gardé.** La page envoie son état à l'appli (`{local_save: …}`, par `window.ReactNativeWebView.postMessage`). L'appli l'écrit dans un fichier JSON du dossier documents (`expo-file-system`, `Paths.document` : « à l'abri d'une suppression par le système », dit sa doc). Ce n'est pas `SecureStore` : il chiffre de petites valeurs, et certaines versions d'iOS refusaient celles de plus de 2048 octets. Les tailles sont vérifiées : 256 Ko pour son état, 512 Ko pour l'image du Pi. Au démarrage suivant, l'appli rend l'état à la page avant ses scripts (`injectedJavaScriptBeforeContentLoaded`, dans `window.PIXEL_LOCAL_STATE`), avec l'image du Pi. La doc de `react-native-webview` prévient que sous Android ce n'est « pas fiable à 100 % » : l'appli le redonne donc une fois la page chargée. `pixel-app/web/local.js` garde le plus récent de ce qu'il a : le `localStorage`, la copie de l'appli, l'image du Pi.

**Les fonctions natives** (garder l'écran allumé en mode Pixel, et bientôt partager vers Pixel, les notifications du téléphone, les capteurs de Pixel de poche, le verrouillage de l'orientation) se branchent une seule fois dans `webBridge.ts` (`PLUGS`). Chacune reçoit les messages de la page affichée et peut lui envoyer du JavaScript, que ce soit la page du Pi ou le Pixel du téléphone. L'image du Pi (`Linked.tsx`) en est un exemple.
