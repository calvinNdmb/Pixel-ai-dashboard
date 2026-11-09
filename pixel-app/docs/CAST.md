# Caster sur Pixel

Trois parties :

1. **Le mode d'emploi** de ce qui est fait : le panneau **Caster sur Pixel** de l'appli, le partage Android, le Raccourci iPhone.
2. **Partager un écran** : l'écran d'un ordinateur, d'un téléphone Android, d'un iPhone, d'un iPad ou d'un Mac, en direct sur Pixel.
3. **Les autres façons** d'envoyer l'écran d'un téléphone ou d'un PC sur un Raspberry Pi : AirPlay, Google Cast, DLNA, Miracast, partage d'écran dans le navigateur. Avec, pour chacune, ce qu'elle apporte, ses limites, le travail, et la suite conseillée.

---

## 1. Mode d'emploi

### Ce qui s'affiche

| Tu envoies | Sur l'écran de Pixel | Combien de temps |
| --- | --- | --- |
| une photo (JPEG, PNG, WebP) | en grand, sans la déformer | 2 minutes (réglable) |
| un GIF (ou un WebP animé) | en grand, animé | 2 minutes |
| une vidéo (MP4, MOV de l'iPhone, WebM) | en grand, avec le son | jusqu'au bout |
| un texte (280 caractères au plus) | en gros, dans la police du thème | 2 minutes |
| un lien vers une image ou une vidéo | comme un fichier envoyé | idem |
| un lien YouTube ou Vimeo | leur lecteur, dans une « télé », Pixel la regarde à côté | jusqu'au bout |
| un lien vers une page web | une carte : le titre, le site, un QR code pour l'ouvrir sur ton téléphone | 2 minutes |
| un écran partagé (ordinateur, Android, iPhone) | en direct, en entier (voir « Partager un écran ») | jusqu'à **Arrêter** |

Ça s'affiche **par-dessus l'écran ouvert**. À la fin, Pixel revient où il était.

- **Pour arrêter :** touche l'écran de Pixel (pour YouTube, la colonne à droite du lecteur), le bouton **Arrêter** du téléphone, ou tape `stop`. Ouvrir un autre écran (une touche du Stream Deck, un glissement) arrête aussi.
- **Dans ses vraies couleurs :** pendant un cast, plus d'effet cathodique, quel que soit le thème : ni vert, ni lignes, ni grain, ni bande qui défile, ni reflet. L'image est nette, en entier sur du noir. L'effet revient tel quel à la fin.
- **Un petit Pixel** passe la tête dans le coin. Il est surpris, puis il réagit : amoureux devant une photo, il rit devant un GIF, il lit un texte, il écoute une vidéo. Sur une photo, il se cache après quelques secondes et revient jeter un œil de temps en temps.

### Depuis l'appli (le panneau « Caster sur Pixel »)

Sur ton téléphone ou ton ordinateur, ouvre l'appli de Pixel (le QR code de Réglages). Sous le clavier, ouvre **Caster sur Pixel** :

- **Photo ou vidéo :** choisis dans ta galerie. Le pourcentage de l'envoi s'affiche.
- **Colle un lien :** YouTube, Vimeo, une page, une image. `youtu.be/…` sans `https://` marche aussi.
- **Écris un petit mot :** il s'affiche en gros.
- **Durée :** 2 min par défaut, ou 30 s, 10 min, ou jusqu'à **Arrêter**.
- **Les derniers :** les 8 derniers envois. Touche-en un pour l'afficher encore.

Ça marche sur le Wi-Fi de la maison, avec le même code d'accès que le reste de l'appli. Sur l'iPhone, Safari transforme les photos HEIC en JPEG tout seul.

### Depuis une autre appli, sur Android : « Partager → Pixel »

L'appli de Pixel se déclare comme cible de partage (`share_target` dans `web/manifest.webmanifest`). Dans la galerie, YouTube ou Chrome, **Partager → Pixel** envoie la photo, la vidéo ou le lien. L'appli s'ouvre et dit « C'est sur l'écran de Pixel ! ».

**À savoir :** Android ne met Pixel dans le menu Partager que si l'appli est **installée** comme une vraie appli web. Chrome ne l'installe ainsi que depuis une **adresse sécurisée (https)**. Avec l'adresse habituelle `http://pixel.local:8080`, « Ajouter à l'écran d'accueil » crée un simple raccourci : Pixel n'apparaît pas dans le menu Partager. Le panneau de l'appli, lui, marche partout.

Pour avoir le menu Partager, il faut une de ces trois choses :

- **Une adresse https vers Pixel.** Le plus simple : [Tailscale](https://tailscale.com) sur le Pi et le téléphone (HTTPS activé dans sa console), puis `tailscale serve --bg 8080` sur le Pi. Ça donne une adresse `https://pixel.<ton-réseau>.ts.net` avec un vrai certificat. Ouvre l'appli par cette adresse avec ton code (`/?t=…`), puis **Installer l'application**. Attention : par `tailscale serve`, les requêtes arrivent du Pi lui-même. Garde ton réseau Tailscale pour tes propres appareils.
- **Un réglage de Chrome sur le téléphone**, pour les essais : `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, ajoute `http://pixel.local:8080`. Chrome traite alors l'adresse comme sécurisée. L'installation comme vraie appli n'est pas garantie.
- **L'appli Android de Pixel** (`pixel-mobile`), le jour où elle accepte les partages : voir « La suite » plus bas. C'est le plus fiable.

Comment ça marche : Android envoie le partage en `POST /share`. Le *service worker* de l'appli (`web/sw.js`) le reçoit, y ajoute le code d'accès, et le passe au serveur. Le serveur l'affiche, puis renvoie l'appli sur `/?cast=ok` (ou la raison de l'échec : `format`, `trop-gros`, `vide`, `lien`, `acces`).

### Sur iPhone et iPad : un Raccourci

iOS n'a pas de cible de partage pour les applis web. Un **Raccourci** fait la même chose : il envoie ce que tu partages à Pixel.

D'abord, il te faut **le code d'accès**. C'est la fin de l'adresse du QR code de Réglages, après `?t=`. Sur le Pi, il est aussi dans `~/.config/pixel/token`.

**Raccourci 1, « Photo sur Pixel »**

1. Ouvre **Raccourcis**, touche **+**.
2. Touche **ⓘ** (en bas), active **Afficher dans la feuille de partage**. Dans **Types**, garde **Images**.
3. Ajoute l'action **Convertir l'image** : en **JPEG**. Les photos de l'iPhone sont en HEIC, que Pixel refuse.
4. Ajoute l'action **Obtenir le contenu de l'URL** :
   - URL : `http://pixel.local:8080/api/cast?t=TON_CODE`
   - Méthode : **POST**
   - Corps de la requête : **Formulaire**. Ajoute un champ **Fichier**, nommé `file`, avec la valeur **Image convertie**.
5. Nomme-le « Photo sur Pixel ».

**Raccourci 2, « Vidéo sur Pixel »** : duplique le premier. Dans **Types**, garde **Médias**, enlève **Convertir l'image**, et mets **Entrée du raccourci** dans le champ `file`.

**Raccourci 3, « Lien sur Pixel » (liens et textes)** : pareil, avec les types **URL** et **Texte**, sans conversion. Dans **Obtenir le contenu de l'URL**, mets un champ **Texte** nommé `text`, avec la valeur **Entrée du raccourci**. Pixel trouve le lien tout seul s'il y en a un dans le texte.

Ensuite, dans Photos, Safari ou YouTube : **Partager**, puis le raccourci.

- La première fois, iOS demande l'accès au **réseau local** : autorise-le.
- Si `pixel.local` ne répond pas, mets l'adresse IP du Pi (elle est dans Réglages, sur l'écran de Pixel).
- **Les vidéos de l'iPhone :** elles sont souvent en HEVC, que le navigateur du Pi ne sait pas toujours lire. Pixel dit alors « Pixel n'arrive pas à lire cette vidéo ». Dans **Réglages > Appareil photo > Formats**, **Le plus compatible** filme en H.264.

### Depuis un ordinateur : curl

```bash
curl -F file=@photo.jpg "http://pixel.local:8080/api/cast?t=TON_CODE"
curl -F file=@video.mp4 "http://pixel.local:8080/api/cast?t=TON_CODE"
curl -H 'Content-Type: application/json' -d '{"text": "À table !"}' "http://pixel.local:8080/api/cast?t=TON_CODE"
curl -H 'Content-Type: application/json' -d '{"url": "https://youtu.be/aqz-KE-bpKQ"}' "http://pixel.local:8080/api/cast?t=TON_CODE"
```

Tu peux aussi taper dans la barre `C:\PIXEL>` : `caste À table !`, `caste https://youtu.be/…`, puis `stop`.

### Les réglages (`config.toml`)

```toml
[cast]
max_mb = 40       # la taille maximale d'un fichier, en Mo
seconds = 120     # combien de temps reste une photo, un GIF, un texte ou un lien (0 : jusqu'à « Arrêter »)
keep = 8          # les derniers fichiers gardés, à réafficher
```

### Pour les curieux : l'API

| Route | Ce qu'elle fait |
| --- | --- |
| `POST /api/cast` | un fichier (`multipart/form-data` : `file`, et `raw`, `seconds`, `title`), un formulaire simple ou du JSON (`{"text"}`, `{"url", "title"}`). Répond `{"ok": true, "cast": {...}}` ou `{"ok": false, "error": "..."}` (400, 403, 413, 415). |
| `POST /share` | le partage Android : `title`, `text`, `url`, `media`. Répond 303 vers `/?cast=…`. |
| `GET /cast/NOM` | les fichiers reçus, avec leur vrai type. |
| actions WebSocket | `cast.text`, `cast.link`, `cast.stop`, `cast.again` (`id`), `cast.colors` (`raw` : sans effet, l'image garde toujours ses couleurs), `cast.end` (envoyée par l'écran de Pixel à la fin d'une vidéo). |
| état | `cast` : `{id, kind (image, gif, video, text, link, screen), src, text, url, title, site, embed, qr, t0, until, raw}`. `cast_recent` : les derniers. |

### Sécurité

- **Le même code d'accès** que le reste de l'appli : `?t=`, l'en-tête `X-Pixel-Token`, ou le cookie que pose l'appli (`SameSite=Strict` : une page d'un autre site ne l'envoie jamais). Seul le Pi lui-même passe sans code. Et seulement les appareils de la maison, comme avant.
- **Une page d'un autre site affichée sur le Pi** (le lecteur YouTube) n'est pas Pixel : elle n'a pas accès au WebSocket ni au cast sans le code.
- **Les fichiers :** leur type vient de leurs premiers octets, jamais de leur nom. Un fichier qui n'est pas une image ou une vidéo est refusé tout de suite. Ils arrivent sur la carte SD au fil de l'envoi, s'arrêtent à la limite de taille, et prennent un nom tiré au sort dans `~/.config/pixel/cast/`. Seuls les 8 derniers restent.
- **Les liens :** le serveur n'en ouvre **aucun**. Sinon, quiconque peut caster pourrait fouiller le réseau de la maison depuis le Pi. Une image ou une vidéo en lien est chargée par le navigateur de l'écran, comme sur n'importe quelle page. YouTube et Vimeo jouent dans leur propre lecteur. Une autre page n'est jamais ouverte sur le Pi : juste une carte avec un QR code.

### Limites connues

- Un **GIF en lien** vers un site qui l'interdit (CORS) ne montre que sa première image. Un GIF envoyé depuis le téléphone est toujours animé.
- Certaines **vidéos YouTube** refusent d'être lues ailleurs que sur YouTube (« Vidéo non disponible »).
- Pour une **page web**, Pixel ne montre pas la page elle-même, seulement sa carte.
- **Pas encore essayé sur le vrai Pi :** le dessin d'une vidéo 1080p 60 fois par seconde sur le Pi 4, et le son par la sortie du Pi. Si la vidéo saccade, une vidéo en 720p ira mieux.

## 2. Partager un écran

Pixel montre **en direct** l'écran d'un ordinateur, d'un téléphone ou d'une tablette. Ça s'affiche comme un cast : par-dessus l'écran ouvert, **dans ses vraies couleurs** (pas d'effet cathodique), en entier sur du noir. À la fin, Pixel revient où il était.

| Depuis | Comment | Ce qu'il faut |
| --- | --- | --- |
| un ordinateur (Windows, Mac, Linux, Chromebook) | la page **Partager mon écran** de Pixel, dans Chrome, Edge ou Firefox | rien à installer ; une adresse sécurisée (le lanceur, plus bas) |
| un téléphone Android | l'appli **ScreenStream**, en mode Local | ScreenStream (F-Droid ou Play Store) |
| un iPhone, un iPad, un Mac | **Recopie de l'écran** (AirPlay) | UxPlay sur le Pi, installé une fois |
| un iPhone ou un iPad sous iOS 27 | la page Partager mon écran, dans Safari | l'adresse https de Pixel |

### Depuis un ordinateur

1. Sur l'ordinateur, ouvre **`http://pixel.local:8080/ecran`**. (Ou l'adresse IP du Pi, avec `/ecran` au bout. L'appli du téléphone l'affiche dans **Caster sur Pixel → Partager un écran**.)
2. Pixel affiche un **code à 6 chiffres**. Tape-le dans la page, puis **Valider**. Le bouton **Afficher un code** de l'appli du téléphone en affiche un aussi, sur Pixel et sur le téléphone.
3. Touche **Partager mon écran**. Le navigateur demande quoi partager : un onglet, une fenêtre ou tout l'écran. L'image arrive sur Pixel en une ou deux secondes.
   - **Fluide** pour une vidéo ou un jeu, **Net** pour du texte ou des diapos.
   - **Avec le son** : Chrome et Edge partagent le son d'un onglet, et celui de tout l'écran sous Windows. Il sort par le Pi.
4. **Pour arrêter :** **Arrêter le partage** dans la page (ou la barre du navigateur), **Arrêter** dans l'appli du téléphone, ou touche l'écran de Pixel. Ouvrir un autre écran ou caster autre chose arrête aussi.

Tant que la page reste ouverte, elle reste reconnue : pour partager une autre fenêtre, retouche **Partager mon écran**, sans code. Une page rechargée redemande un code. Si l'ordinateur a déjà ouvert l'appli de Pixel avec le QR code, il a le code d'accès : la page s'en sert, pas de code à taper.

#### L'adresse sécurisée

Les navigateurs ne partagent l'écran que depuis une adresse **sécurisée** : en https, ou un fichier ouvert depuis le disque. Or Pixel répond en `http://`. Sur `http://pixel.local:8080/ecran`, la page le voit et propose trois façons, de la plus simple à la plus technique :

1. **Le lanceur (conseillé).** Le bouton **Télécharger le lanceur** donne un fichier `Pixel-ecran.html`. Ouvre-le d'un double-clic : il s'ouvre dans le navigateur, depuis le disque, et ça suffit pour partager l'écran. Il trouve Pixel par son nom, sinon par son adresse IP. Garde-le, sur le bureau par exemple : il resservira. Il ne contient aucun code secret. Si Chrome demande s'il faut garder le fichier, choisis **Conserver**.
2. **L'adresse https de Pixel.** `install.sh` a fait un certificat dans `~/.config/pixel/tls/`. Pour l'ouvrir, ajoute `https_port = 8443` sous `[ecran]` dans `config.toml`, puis `sudo systemctl restart pixel@$USER`. Ouvre `https://pixel.local:8443/ecran`. Le navigateur prévient que « la connexion n'est pas privée » : c'est normal, le certificat est fait par Pixel. **Paramètres avancés → Continuer vers pixel.local**. Chrome le redemande une fois par semaine. C'est aussi l'adresse pour Safari sous iOS 27.
3. **Le réglage de Chrome ou d'Edge**, en dernier recours. Ouvre `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (Edge : `edge://flags/#unsafely-treat-insecure-origin-as-secure`). Colle les adresses de Pixel que la page affiche (`http://pixel.local:8080,http://192.168.1.42:8080`), choisis **Enabled**, puis **Relaunch**. Si l'adresse IP du Pi change, il faut la remettre.

#### Si l'image n'arrive pas

- L'ordinateur et Pixel doivent être sur **le même réseau** : pas un Wi-Fi invité, pas d'« isolation des clients » sur la box, pas de VPN.
- Sous Windows, le réseau doit être en profil **Privé**. Le profil Public bloque les connexions directes.
- `install.sh` règle le Chromium du Pi pour qu'il donne sa vraie adresse, à la seule page de Pixel (`/etc/chromium/policies/managed/pixel-ecran.json`). La connexion ne dépend alors plus du mDNS du réseau. Si Pixel était installé avant, relance `sh deploy/install.sh` une fois.
- L'image est limitée à 1280 × 720, 30 images par seconde, 4 Mb/s. C'est assez pour l'écran de 800 × 480, et le Pi 4 décode le H.264 avec sa puce.

### Depuis un téléphone Android : ScreenStream

Chrome sur Android ne sait pas partager l'écran. L'appli libre **ScreenStream** le fait, et Pixel affiche ce qu'elle diffuse.

1. Installe **ScreenStream** (F-Droid ou Play Store). Choisis le mode **Local (MJPEG)**. Dans ses réglages, laisse le **code PIN** désactivé.
2. Touche **Démarrer**, et accepte qu'elle enregistre l'écran.
3. Dans l'appli de Pixel, sur ce même téléphone : **Caster sur Pixel → Afficher l'écran du téléphone**. Pixel trouve l'adresse du téléphone tout seul.
   - Si ScreenStream utilise un autre port que 8080, change **Port**.
   - Si Pixel ne trouve pas le téléphone (par exemple s'il le voit par une adresse IPv6), tape dans **Adresse** celle que ScreenStream affiche (`192.168.1.23:8080`).
4. **Pour arrêter :** **Arrêter** dans l'appli, ou touche l'écran de Pixel. Arrête aussi ScreenStream sur le téléphone.

C'est l'écran de Pixel qui charge l'image (`http://<le téléphone>:8080/stream.mjpeg`). Le serveur de Pixel ne s'y connecte jamais. Pas de son, et un peu de retard : c'est une suite d'images JPEG.

### Depuis un iPhone, un iPad ou un Mac : AirPlay

[UxPlay](https://github.com/FDH2/UxPlay) fait du Pi un récepteur AirPlay. Pixel le lance et le surveille. Quand un iPhone se connecte, Pixel passe en mode cast, et il revient quand l'iPhone s'en va.

**Une fois, sur le Pi :**

1. Dans le dossier `pixel-app`, installe UxPlay : `PIXEL_AIRPLAY=1 sh deploy/install.sh`. Ça compile UxPlay 1.73.7, en quelques minutes. La version des paquets de Bookworm (1.62) est trop ancienne.
2. Dans `config.toml` :
   ```toml
   [airplay]
   enabled = true
   name = "Pixel"      # son nom dans la liste
   pin = true          # le code à 4 chiffres que Pixel affiche
   ```
3. `sudo systemctl restart pixel@$USER`.

**Ensuite, sur l'iPhone ou l'iPad :** **Centre de contrôle → Recopie de l'écran → Pixel**. Pixel affiche un code à 4 chiffres : tape-le sur l'iPhone. L'écran de l'iPhone remplit celui de Pixel, avec le son. Sur un Mac : **Centre de contrôle → Recopie de l'écran**. Dans l'appli YouTube de l'iPhone, le bouton AirPlay envoie aussi la vidéo à Pixel.

**Pour arrêter :** **Arrêter la recopie** sur l'iPhone, ou **Arrêter** dans l'appli de Pixel : Pixel relance UxPlay, ce qui renvoie l'iPhone. La fenêtre d'UxPlay couvre l'écran tactile : toucher Pixel ne l'arrête pas.

**Bon à savoir :**

- Pas de service à créer : Pixel lance UxPlay lui-même. Il attend que le bureau (Wayland) soit là, le relance s'il plante, et l'arrête avec lui. L'appli du téléphone dit où il en est : **prêt**, **connecté**, **pas installé**…
- Ses options : `-n Pixel -nh -fs -vs waylandsink -s 1280x720@60 -fps 30 -p -reset 5 -nohold -srgb no -pin -hls`. Sur un Pi 4, `args = ["-bt709"]` si les couleurs sont fausses, `["-avdec"]` si la vidéo bloque.
- Ses ports : TCP 7000, 7001, 7100 et UDP 6000, 6001, 7011. Pi OS n'a pas de pare-feu par défaut. L'iPhone trouve Pixel par Bonjour (`avahi-daemon`, déjà sur Pi OS) : sur un Wi-Fi invité, il ne le voit pas.
- Les vidéos protégées (Netflix, Apple TV+…) restent noires.
- Un service systemd à toi plutôt que Pixel ? Laisse `enabled = false` et crée un service **utilisateur** (`~/.config/systemd/user/pixel-uxplay.service`, avec `Environment=WAYLAND_DISPLAY=wayland-0` et la ligne `ExecStart` de UxPlay, puis `systemctl --user enable --now pixel-uxplay`). Mais alors Pixel ne sait pas quand un iPhone se connecte, et ne passe pas en mode cast.

### Depuis un iPhone ou un iPad sous iOS 27 : Safari

Safari sait partager l'écran depuis iOS 27, mais seulement sur une adresse https. Une fois l'adresse https de Pixel ouverte (voir plus haut), ouvre l'appli de Pixel par `https://pixel.local:8443/?t=TON_CODE`. Le bouton **Caster sur Pixel → Partager l'écran de cet appareil** apparaît. On ne sait pas encore si Safari capture tout l'iPhone ou seulement Safari, ni s'il continue quand on change d'appli : AirPlay reste le plus sûr.

### Les réglages (`config.toml`)

```toml
[ecran]
# https_port = 8443       # l'adresse https, avec le certificat que fait install.sh (~/.config/pixel/tls/)

[airplay]
enabled = false           # true une fois UxPlay installé
name = "Pixel"
pin = true
# args = ["-bt709"]
```

### Pour les curieux : comment ça marche

- **WebRTC :** la page de l'ordinateur capture l'écran (`getDisplayMedia`) et l'envoie directement à l'écran de Pixel : Chromium, sur `http://localhost`, qui est une adresse sécurisée. Le serveur ne voit pas l'image. Il relaie seulement la mise en relation sur `/ecran/ws` : l'offre, la réponse, les candidats ICE. Pas de serveur STUN : sur le Wi-Fi de la maison, ce n'est pas utile. H.264 d'abord (le Pi 4 le décode avec sa puce, le Pi 5 avec le processeur), 1280 × 720 et 30 images par seconde au plus. L'écran de Pixel dessine la vidéo 60 fois par seconde.
- **Routes :** `GET /ecran` (la page), `GET /ecran/lanceur.html` (le lanceur à télécharger), `GET /ecran/ws` (la mise en relation), `POST /ecran/telephone` (`{port, address}` : ScreenStream).
- **Messages de `/ecran/ws` :** l'ordinateur envoie `pair` (un code sur Pixel), `hello` (`code` ou `t`, et `name`), `start`, `offer`, `ice`, `stop`. L'écran de Pixel envoie `kiosk` (`session`), `answer`, `ice`, `live`, `fail`. Le serveur répond `code`, `code-off`, `ok`, `bad`, `ready`, `offer`, `answer`, `ice`, `live`, `stopped` (`why`, `msg`) et `error`.
- **Actions WebSocket :** `ecran.code` (un code, depuis l'appli), `ecran.fail` (l'écran de Pixel n'y arrive pas), `airplay.stop`. `cast.stop` arrête tout.
- **État :** `cast` : `{kind: "screen", via: "webrtc" | "mjpeg" | "airplay", phase: "code" | "paired" | "connecting" | "live" | "pin", title, note, code, session, src}`. `airplay` : `{on, status, client, name, error}`. `settings.ecran` : les adresses de la page.
- **Les fichiers :** `pixel/ecran.py` (le code, la mise en relation, ScreenStream, l'https), `pixel/airplay.py` (UxPlay), `web/ecran.html` (la page de l'ordinateur, sans rien à charger), `web/ecran.js` (ce que reçoit l'écran de Pixel, et le panneau du téléphone).

### Sécurité

- **Le code à usage unique :** 6 chiffres, sur l'écran de Pixel (et dans l'appli du téléphone, qui a déjà le code d'accès), valables 3 minutes. 5 essais, puis il faut en demander un autre. Un nouveau code au plus toutes les 5 secondes, et plus aucun après 30 codes faux dans l'heure. Il faut donc **voir l'écran de Pixel** pour y partager le sien. Sans ce code, ou le code d'accès de l'appli, le serveur ne relaie rien. Et une page sans le code d'accès ne peut faire afficher un code que si rien n'est casté, ni dans les 30 secondes après qu'on l'a fermé sur Pixel : quelqu'un du Wi-Fi ne peut pas prendre l'écran de Pixel.
- **Seul l'écran de Pixel reçoit l'image :** le rôle de récepteur n'est accepté que du Pi lui-même, depuis la page de Pixel.
- **Une page d'un autre site** ne peut même pas se connecter à `/ecran/ws`, ni faire afficher un code. Seuls les pages de Pixel, le lanceur ouvert depuis le disque et les programmes sont acceptés.
- **Le lanceur** ne contient aucun secret : seulement les adresses de Pixel.
- **ScreenStream :** l'adresse du téléphone doit être une adresse IP de la maison : pas un nom, pas le Pi lui-même, pas Internet. C'est l'écran de Pixel qui charge le flux, jamais le serveur.
- **AirPlay :** avec `pin = true`, l'iPhone doit taper le code affiché par Pixel. Sans lui, n'importe quel appareil du Wi-Fi pourrait s'afficher.
- **La vraie adresse du Pi** n'est donnée qu'à la page de Pixel (`http://localhost:8080`), pas aux autres sites que l'écran peut montrer (le lecteur YouTube).

### Pas encore essayé sur le vrai Pi

Tout a été testé sur un ordinateur : `test_ecran.py` (le serveur), `test_ecran.js` (l'écran de Pixel), `test_ecran_web.js` (deux pages Chromium, une fausse mire, un faux ScreenStream), `test_airplay.py` (un faux UxPlay). Reste à essayer sur le Pi :

- **WebRTC :** le décodage sur le Pi 4 (avec sa puce ? `chrome://webrtc-internals`, `decoderImplementation`) et le processeur du Pi 5 en 720p ; le vrai retard ; le lanceur ouvert sous Windows 11, avec Chrome et Edge (l'avertissement de téléchargement, `pixel.local` sous Windows) ; Firefox et Safari ; la règle `pixel-ecran.json` avec le Chromium de Pi OS.
- **AirPlay :** UxPlay 1.73.7 compilé sur Bookworm ; sa fenêtre plein écran **au-dessus** de Chromium sous labwc (si elle reste derrière, une règle de fenêtre de labwc peut la mettre devant) ; le nom du socket Wayland (`wayland-0`) ; les lignes qu'écrit UxPlay avec un vrai iPhone (celles des tests viennent de son code source) ; `-hls` avec l'appli YouTube.
- **ScreenStream :** le nombre d'images par seconde sur le Wi-Fi de la maison ; un téléphone vu en IPv6.
- **iOS 27 :** Safari et `getDisplayMedia`.

---

## 3. Les autres façons de caster sur un Raspberry Pi

Voici toutes les solutions regardées pour envoyer un fichier ou **recopier l'écran** d'un téléphone ou d'un PC sur un Raspberry Pi, de la plus utile à la moins utile pour Pixel. Le partage d'écran (plus haut) en reprend trois : WebRTC, AirPlay et ScreenStream.

### En résumé

| Solution | Depuis | Recopie d'écran | Fiabilité | Travail | Avis |
| --- | --- | --- | --- | --- | --- |
| **Caster sur Pixel** (fait) | tout téléphone, PC | non : fichiers, liens, textes | bonne | fait | la base |
| **AirPlay avec UxPlay** | iPhone, iPad, Mac | oui, avec le son | bonne | fait (UxPlay à installer) | **fait** : voir « Partager un écran » |
| **Partage Android dans l'appli pixel-mobile** | Android | non | très bonne | ½ jour | **la suite côté Android** |
| **Partage d'écran WebRTC** | navigateur d'ordinateur | oui (onglet, fenêtre, écran) | bonne | fait | **fait**, avec le lanceur (pas besoin d'https) |
| **ScreenStream** (MJPEG) | Android | oui, sans le son | bonne | fait | **fait** |
| **DLNA / UPnP** (gmrender-resurrect) | Android (BubbleUPnP), Windows | non : fichiers | moyenne | ½ jour | possible, peu utile |
| **Google Cast** | Android, Chrome | — | impossible | — | non |
| **Miracast** (MiracleCast) | Android, Windows | oui | mauvaise | plusieurs jours | non |

### AirPlay : UxPlay

**Fait** : voir « Partager un écran » plus haut. Ce qui a changé par rapport à cette note : UxPlay est compilé (le paquet de Bookworm, 1.62, est trop ancien), Pixel le lance et lit ses lignes lui-même plutôt qu'un service systemd, avec `-srgb no` pour labwc. La note d'origine :

[UxPlay](https://github.com/FDH2/UxPlay) est un récepteur AirPlay libre : la **Recopie de l'écran** d'un iPhone, d'un iPad ou d'un Mac, avec le son. Les versions récentes lisent aussi les vidéos YouTube envoyées par AirPlay (option `-hls`).

- **Installation :** il est dans les paquets de Debian, donc de Raspberry Pi OS Bookworm : `sudo apt install uxplay`. La version des paquets peut être en retard sur celle de GitHub (les options `-pin` et `-hls` sont récentes). Il annonce Pixel sur le réseau par Bonjour (`avahi-daemon`, déjà là sur Pi OS).
- **Pi 4 et Pi 5 :** le Pi 4 décode le H.264 de l'iPhone avec sa puce vidéo (option `-v4l2` selon la version). Le Pi 5 n'a plus de décodeur H.264 : il le fait avec le processeur, qui suffit en 720p. Pour l'écran de 800 × 480, demander une petite image (`-s 800x480`) allège tout.
- **Par-dessus le kiosque :** UxPlay ouvre sa propre fenêtre vidéo (GStreamer). Avec `-fs`, elle passe en plein écran au-dessus de Chromium. Quand l'iPhone arrête la recopie, la fenêtre se ferme et Pixel réapparaît.
- **Un service systemd :** UxPlay doit tourner dans la session graphique (labwc). Un service **utilisateur** convient, par exemple `~/.config/systemd/user/uxplay.service` :

  ```ini
  [Unit]
  Description=Pixel : récepteur AirPlay
  After=graphical-session.target

  [Service]
  ExecStart=/usr/bin/uxplay -n Pixel -nh -s 800x480 -fs -pin
  Restart=on-failure

  [Install]
  WantedBy=graphical-session.target
  ```

  `-n Pixel -nh` : il s'appelle « Pixel » dans la liste AirPlay. `-pin` : l'iPhone doit taper un code à 4 chiffres affiché à l'écran. Sans lui, n'importe quel appareil du Wi-Fi peut s'afficher sur Pixel.
- **Le lancer et l'arrêter depuis Pixel :** un interrupteur **AirPlay** dans Réglages (une action `airplay.set`). Le serveur de Pixel lance `systemctl --user start uxplay` ou `stop`. Comme il tourne en service système, il lui faut `XDG_RUNTIME_DIR=/run/user/<uid>` pour parler au systemd de la session. Le serveur peut aussi lire ce qu'écrit UxPlay (un client qui se connecte, qui s'en va) pour l'état : Pixel fait une tête surprise, le Stream Deck montre « AirPlay ».
- **Pour :** natif sur iPhone, iPad et Mac, rien à installer sur eux, recopie de n'importe quelle appli, son, peu de retard.
- **Contre :** Apple seulement. Les vidéos protégées (Netflix, Disney+) restent noires. Un iPhone tenu droit fait une petite bande au milieu d'un écran large. Le Pi chauffe pendant la recopie.
- **Travail :** une demi-journée pour le service et l'interrupteur, une journée avec l'état et les réactions de Pixel.

### Google Cast (Chromecast) : pas possible

- **Pourquoi :** les téléphones et Chrome vérifient que le récepteur est un appareil **certifié par Google**. Chaque Chromecast ou Google TV a un certificat signé par Google, et l'envoyeur le contrôle à la connexion. Un Raspberry Pi n'en a pas, et Google ne le donne qu'aux fabricants partenaires. Les récepteurs libres qui contournent cette vérification sont fragiles et pas permis.
- **Ce qui reste :**
  - un vrai Chromecast ou Google TV sur un autre écran (pas sur Pixel) ;
  - **Partager → Pixel** pour les liens YouTube : Pixel les joue déjà, dans le lecteur YouTube ;
  - le partage d'écran WebRTC depuis Chrome sur un ordinateur (plus bas) ;
  - AirPlay pour les appareils Apple.

### DLNA / UPnP : gmrender-resurrect

[gmrender-resurrect](https://github.com/hzeller/gmrender-resurrect) (paquet `gmediarender`) fait du Pi un **lecteur DLNA** (« UPnP MediaRenderer »). Une appli envoie l'adresse d'une photo, d'une vidéo ou d'une musique, et le Pi la lit avec GStreamer.

- **Depuis :** BubbleUPnP ou Hi-Fi Cast sur Android. Sur Windows, **Caster sur un appareil** dans l'Explorateur. VLC sert surtout de **serveur** de médias, pas de télécommande.
- **Par-dessus le kiosque :** comme UxPlay, sa propre fenêtre vidéo. Un service utilisateur `gmediarender -f Pixel`, un interrupteur dans Réglages.
- **Mieux, pour Pixel :** que le serveur de Pixel soit lui-même un lecteur DLNA. Il s'annonce sur le réseau (SSDP), reçoit l'adresse du fichier (SOAP, `SetAVTransportURI`), et l'affiche avec le cast déjà fait : la photo en vert dans le tube, Pixel qui regarde. Le serveur n'ouvre toujours rien : c'est l'écran qui charge l'adresse donnée par le téléphone. Un à deux jours de travail.
- **Pour :** standard ouvert, marche avec Android et Windows sans rien installer sur le Pi (version intégrée).
- **Contre :** pas de recopie d'écran. YouTube et Netflix ne parlent plus DLNA. Les applis sont austères, et chaque appli envoie un peu différemment.
- **Travail :** une demi-journée avec gmediarender, un à deux jours intégré à Pixel.

### Miracast : MiracleCast, à éviter

[MiracleCast](https://github.com/albfan/miraclecast) reçoit Miracast, la recopie d'écran par Wi-Fi Direct (Samsung « Smart View », Windows **Projeter**, Win + K).

- **Pourquoi l'éviter :**
  - il prend la puce Wi-Fi en mode Wi-Fi Direct, ce qui se bat avec NetworkManager et peut couper le Wi-Fi de Pixel ;
  - la puce Broadcom du Pi gère mal ce mode ;
  - les téléphones Google n'ont plus Miracast depuis Android 6 ;
  - MiracleCast n'est presque plus suivi.
- **Windows** sait aussi faire « Miracast sur le réseau » (MS-MICE), sans Wi-Fi Direct, mais il n'existe pas de récepteur libre solide pour Linux.
- **Travail :** plusieurs jours, sans garantie que ça marche chaque fois.

### Partage d'écran dans le navigateur (WebRTC)

**Fait** : voir « Partager un écran » plus haut, avec un code à usage unique et un lanceur à télécharger pour l'adresse sécurisée (ou l'https de Pixel, ou le réglage de Chrome). Et pas de vert du tube : l'image garde ses couleurs. La note d'origine :

Un bouton **Partager mon écran** dans l'appli, sur un ordinateur. Le navigateur demande quoi partager (`getDisplayMedia` : un onglet, une fenêtre ou tout l'écran). L'image va directement à l'écran de Pixel (WebRTC), qui l'affiche comme un cast vidéo.

- **La mise en relation :** passe par le WebSocket déjà là. Une action `rtc.signal` relaie l'offre, la réponse et les candidats ICE entre l'ordinateur et l'écran du Pi. Sur le Wi-Fi de la maison, pas besoin de serveur STUN.
- **L'écran du Pi :** reçoit le flux dans une `<video>` cachée, dessinée comme une vidéo castée, avec le vert du tube et Pixel dans le coin. Demander une image de 800 × 480 suffit, et le Pi la décode sans peine.
- **La condition :** `getDisplayMedia` ne marche que sur une **adresse sécurisée**. Sur `http://pixel.local:8080`, le bouton ne peut pas marcher. Il faut l'adresse https (Tailscale, voir plus haut) ou le réglage de Chrome sur l'ordinateur.
- **Pour :** rien à installer, marche sur Windows, Mac et Linux, son de l'onglet possible, peu de retard, tout reste dans le code de Pixel.
- **Contre :** ordinateurs seulement (Chrome sur Android et Safari sur iPhone ne savent pas partager l'écran), l'onglet doit rester ouvert, et il faut l'https.
- **Travail :** une journée.

### La suite conseillée

1. **Maintenant :** le cast intégré (fait). Il couvre le plus courant : montrer une photo, une vidéo, un lien ou un mot, depuis n'importe quel téléphone. Et le partage d'écran (fait) : un ordinateur, Android (ScreenStream), un iPhone ou un Mac (AirPlay).
2. **Android, sans https :** faire accepter les partages à l'appli `pixel-mobile`. Un « intent filter » pour les images, les vidéos et le texte, par exemple avec `expo-share-intent`. L'appli envoie à `POST /api/cast` avec le code qu'elle garde déjà. Une demi-journée.
3. **iPhone et Mac :** UxPlay (fait). Ensuite, peut-être : un interrupteur **AirPlay** dans Réglages, plutôt que `config.toml`.
4. **Une adresse https** (Tailscale, ou celle de Pixel : `https_port`) : elle débloque le menu Partager de l'appli web. Le partage d'écran d'un ordinateur s'en passe (le lanceur).
5. **Android, mieux que ScreenStream :** le partage d'écran natif dans l'appli `pixel-mobile` (react-native-webrtc, MediaProjection), vers le même écran de Pixel que les ordinateurs, avec le son.
6. **Plus tard, si besoin :** Pixel comme lecteur DLNA, pour Windows (**Caster sur un appareil**) et BubbleUPnP.
7. **Non :** Google Cast (impossible) et Miracast (pas fiable).
