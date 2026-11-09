# Caster sur Pixel

Deux parties :

1. **Le mode d'emploi** de ce qui est fait : le panneau **Caster sur Pixel** de l'appli, le partage Android, le Raccourci iPhone, YouTube (avec la télécommande du téléphone, et le bouton Caster de l'appli YouTube).
2. **Les autres façons** d'envoyer l'écran d'un téléphone ou d'un PC sur un Raspberry Pi : AirPlay, Google Cast, DLNA, Miracast, partage d'écran dans le navigateur. Avec, pour chacune, ce qu'elle apporte, ses limites, le travail, et la suite conseillée.

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
| un lien YouTube ou Vimeo | leur lecteur, dans une « télé », Pixel la regarde à côté ; pour YouTube, le téléphone est la télécommande (voir YouTube) | jusqu'au bout |
| un lien vers une page web | une carte : le titre, le site, un QR code pour l'ouvrir sur ton téléphone | 2 minutes |

Ça s'affiche **par-dessus l'écran ouvert**. À la fin, Pixel revient où il était.

- **Pour arrêter :** touche l'écran de Pixel (pour YouTube, la colonne à droite du lecteur), le bouton **Arrêter** du téléphone, ou tape `stop`. Ouvrir un autre écran (une touche du Stream Deck, un glissement) arrête aussi.
- **En thème Rétro :** l'image prend le vert du tube, avec ses lignes et son grain. Le réglage **Couleurs d'origine** la laisse telle quelle. Sans l'effet cathodique (touche *Effet CRT*), les couleurs restent aussi.
- **Un petit Pixel** passe la tête dans le coin. Il est surpris, puis il réagit : amoureux devant une photo, il rit devant un GIF, il lit un texte, il écoute une vidéo. Sur une photo, il se cache après quelques secondes et revient jeter un œil de temps en temps.

### Depuis l'appli (le panneau « Caster sur Pixel »)

Sur ton téléphone ou ton ordinateur, ouvre l'appli de Pixel (le QR code de Réglages). Sous le clavier, ouvre **Caster sur Pixel** :

- **Photo ou vidéo :** choisis dans ta galerie. Le pourcentage de l'envoi s'affiche.
- **Colle un lien :** YouTube, Vimeo, une page, une image. `youtu.be/…` sans `https://` marche aussi.
- **Écris un petit mot :** il s'affiche en gros.
- **Couleurs d'origine :** cochée, l'image garde ses couleurs en Rétro. Si quelque chose est déjà à l'écran, ça change tout de suite.
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
curl -F file=@video.mp4 -F raw=1 "http://pixel.local:8080/api/cast?t=TON_CODE"       # couleurs d'origine
curl -H 'Content-Type: application/json' -d '{"text": "À table !"}' "http://pixel.local:8080/api/cast?t=TON_CODE"
curl -H 'Content-Type: application/json' -d '{"url": "https://youtu.be/aqz-KE-bpKQ"}' "http://pixel.local:8080/api/cast?t=TON_CODE"
```

Tu peux aussi taper dans la barre `C:\PIXEL>` : `caste À table !`, `caste https://youtu.be/…`, puis `stop`.

### YouTube

Deux façons : **un lien** (rien à installer, ça marche toujours) et **le bouton Caster de l'appli YouTube** (facultatif, à activer sur le Pi). Dans les deux cas, la vidéo joue dans le **lecteur de YouTube**, sur l'écran de Pixel, sans effet rétro par-dessus, et ton téléphone devient la télécommande.

#### Avec un lien

- **Envoie le lien** : colle-le dans **Caster sur Pixel**, ou **Partager → Pixel** depuis l'appli YouTube (Android), ou le Raccourci (iPhone), ou tape `caste https://youtu.be/…`. Tous ces liens marchent : `youtube.com/watch?v=…`, `youtu.be/…`, les Shorts, les directs (`/live/…`), `music.youtube.com`, une playlist (`list=…`, ou `youtube.com/playlist?list=…`), et l'endroit où commencer (`t=90`, `t=1m30s`, `start=…`).
- **Sur l'écran de Pixel** : le lecteur de YouTube à gauche. À droite : Pixel qui regarde, le temps (`1:23 / 9:56`), **Pause / Lecture** et **Arrêter**. Toucher le lecteur, c'est toucher YouTube (ses propres boutons).
- **Sur ton téléphone**, dans le panneau **Caster sur Pixel** : la télécommande. Le vrai titre de la vidéo, la barre (glisse-la pour aller ailleurs), **−10 s**, **Pause**, **+10 s**, le **son** de Pixel, **Couper le son**, et **Arrêter**.
- **À la fin** de la vidéo (de la dernière, pour une playlist), Pixel revient là où il était.
- **Si YouTube refuse la vidéo**, Pixel le dit en clair, avec un QR code pour la regarder sur ton téléphone (et le téléphone a un bouton **Ouvrir sur YouTube**). La carte part toute seule après 1 min 30, ou d'une touche.

| Erreur de YouTube | Ce que Pixel dit |
| --- | --- |
| 101, 150 | Son auteur ne permet pas de la regarder ailleurs que sur YouTube. |
| 100 | Cette vidéo n'existe plus, ou elle est privée. |
| 2 | Ce lien YouTube n'est pas valable. |
| 5 | Le lecteur de Pixel n'arrive pas à lire cette vidéo. |
| 152, 153 | YouTube refuse le lecteur de Pixel. Pixel réessaie d'abord tout seul, une fois, avec `youtube.com` au lieu de `youtube-nocookie.com`. |
| (pas de réponse) | YouTube ne répond pas. Pixel est-il connecté à Internet ? |

Comment c'est fait : l'écran de Pixel crée lui-même le cadre du lecteur (l'API IFrame de YouTube, `web/ytplayer.js`), avec `enablejsapi=1`, son adresse d'origine, `referrerpolicy="strict-origin-when-cross-origin"` (sans elle, YouTube répond 153) et `allow="autoplay; fullscreen"`. Le cadre passe au-dessus des lignes de l'écran. Le serveur ne fait que garder les ordres du téléphone, numérotés, et ce que le lecteur lui dit (`pixel/youtube.py`) : il n'ouvre jamais le lien. Le script de YouTube n'est chargé qu'au premier cast YouTube.

#### Depuis le bouton Caster de l'appli YouTube (facultatif)

Pixel peut apparaître dans le bouton **Caster** de l'appli YouTube, comme une télé, et accepter le **code TV**. Un petit programme Node.js s'en occupe (`sidecar/ytcast/`, avec la bibliothèque libre [yt-cast-receiver](https://github.com/patrickkfkan/yt-cast-receiver)). Il ne joue rien lui-même : chaque vidéo va au lecteur de Pixel, le même que pour un lien. Le serveur de Pixel le lance, le relance s'il s'arrête, et l'arrête avec lui. Il est **éteint par défaut**.

**L'activer sur le Pi** (une fois, il faut Internet) :

```sh
cd ~/Pixel-ai-dashboard/pixel-app
PIXEL_YTCAST=1 sh deploy/install.sh      # installe Node.js (celui de Raspberry Pi OS suffit : 18 ou plus) et lance npm ci --omit=dev
nano config.toml                         # dans [ytcast] : enabled = true
sudo systemctl restart "pixel@$USER"
```

Ou à la main : `sudo apt install nodejs npm`, puis `cd sidecar/ytcast && npm ci --omit=dev`. Ensuite, le panneau **Caster sur Pixel** du téléphone dit « Appli YouTube : « Pixel » est dans le bouton Caster ». Les réglages sont dans `[ytcast]` (plus bas).

**Depuis chaque appareil :**

- **Android et iPhone, l'appli YouTube** (même Wi-Fi que Pixel) : ouvre une vidéo, touche l'icône **Caster** en haut, choisis **Pixel**. La vidéo joue sur Pixel. L'appli devient la télécommande : pause, avancer, le son (avec les boutons du téléphone), la vidéo suivante de la liste. Le panneau de l'appli de Pixel marche aussi, en même temps. Pixel dit « YOUTUBE : … EST CONNECTÉ » quand un téléphone se relie.
- **Le code TV**, si Pixel n'apparaît pas dans la liste (un Wi-Fi qui bloque la découverte, un autre réseau) : dans le panneau, **Afficher le code TV sur Pixel** (ou tape `code tv`). Le code s'affiche en grand. Sur le téléphone : l'appli YouTube, ta photo, **Paramètres**, **Regarder sur la télé**, **Saisir le code TV** (les noms des menus changent un peu selon la version de l'appli). Le code change toutes les 5 minutes, et il quitte l'écran dès qu'un téléphone est relié. Ensuite, Pixel reste dans la liste de ce téléphone.
- **Un ordinateur** : dans Chrome ou Edge, le lecteur de youtube.com a aussi un bouton Caster quand Pixel est sur le réseau (pas essayé). Sinon, le lien.
- **iPhone, iPad, Mac : AirPlay.** L'appli YouTube d'iPhone sait aussi envoyer la vidéo par AirPlay, vers UxPlay (voir AirPlay, dans la partie 2). Par là, même les vidéos interdites ailleurs que sur YouTube (101, 150) passent : c'est l'appli YouTube qui les lit.

**À savoir :**

- Les vidéos interdites ailleurs que sur YouTube (101, 150) le restent par le bouton Caster : Pixel affiche la même carte. Pour celles-là : AirPlay (iPhone), ou le mode TV ci-dessous.
- Le bouton Caster de YouTube n'est **pas** Google Cast : l'appli parle à Pixel comme à une télé connectée (DIAL sur le Wi-Fi, puis les serveurs de YouTube). Ces protocoles ne sont pas publiés : une mise à jour de l'appli YouTube peut les casser. Alors, mets à jour `yt-cast-receiver` (sa version dans `sidecar/ytcast/package.json`, puis `npm install`), ou passe par un lien en attendant.
- **Sécurité :** le module ne parle qu'au serveur de Pixel, sur le Pi lui-même (`ws://127.0.0.1:8080/ytcast`), avec son propre code (dans son environnement, et dans `~/.config/pixel/ytcast/token` pour le lancer à la main ; jamais celui du téléphone). Une page web, même sur le Pi, ne peut pas lui parler. Son petit serveur DIAL (port 3000) répond sur le Wi-Fi de la maison : c'est par lui que les téléphones trouvent Pixel. La bibliothèque contacte les serveurs de YouTube (la session, le code TV, la suite de la liste) ; le serveur de Pixel, lui, n'ouvre toujours aucun lien.
- **S'il s'arrête**, le serveur le relance (après 2 s, puis 4 s… jusqu'à 2 min) et le panneau le dit. « Module absent » : lance `npm ci --omit=dev` dans `sidecar/ytcast`. « Node.js introuvable » : installe Node.js. « YouTube ne répond pas » : pas d'Internet. Ses messages sont dans le journal de Pixel (`journalctl -u "pixel@$USER"`, lignes `ytcast:`).
- La bibliothèque utilise `peer-dial`, « libre pour un usage non commercial » : pour Pixel à la maison, c'est bon.

#### En dernier recours : le mode TV de YouTube (non intégré)

Pour une vidéo que rien d'autre ne lit, il reste **YouTube pour les télés** (`https://www.youtube.com/tv`) : la vraie interface télé de YouTube, avec « Associer avec un code TV » dans ses réglages. Pixel ne l'intègre pas (il ne saurait pas ce qui joue), et YouTube peut la fermer aux navigateurs du jour au lendemain. Pour l'essayer à la main sur le Pi :

- YouTube ne l'ouvre qu'à un navigateur qui se dit télé. Il faut un **deuxième Chromium**, avec son propre profil, et une petite extension qui change son nom (le « user agent » d'une télé Tizen) et retire ses « client hints », comme le fait [pi-tv-launcher](https://github.com/Toygarmetu/pi-tv-launcher) (encore valable en octobre 2026, pas essayé sur un Pi) :
  `chromium --user-data-dir="$HOME/.config/pixel/yttv-profile" --kiosk --autoplay-policy=no-user-gesture-required --app=https://www.youtube.com/tv`
  Sur Raspberry Pi OS, l'extension se charge par un fichier `/etc/chromium.d/pixel-yttv` (`[ "$PIXEL_YTTV" = 1 ] && CHROMIUM_FLAGS="$CHROMIUM_FLAGS --load-extension=/opt/pixel/yttv-ext"`), lancé avec `PIXEL_YTTV=1`.
- Plus simple : [VacuumTube](https://github.com/shy1132/VacuumTube) (un paquet `.deb` arm64), puis `vacuumtube --fullscreen`. Il apparaît aussi dans le bouton Caster.
- Sur le téléphone : l'appli YouTube, **Paramètres**, **Regarder sur la télé**, **Saisir le code TV**, avec le code que montre la page télé.
- Pour revenir à Pixel : ferme cette fenêtre (Alt+F4 au clavier, ou `pkill -f yttv-profile`).

#### Pas encore essayé sans Pi ni téléphone

- **Le vrai lecteur YouTube** : les tests le remplacent par un faux (pas d'Internet ici). À vérifier sur le Pi : que YouTube accepte l'origine `http://localhost:8080` de l'écran (pas d'erreur 153). Si l'erreur 153 reste, même après l'essai sur youtube.com : ouvre l'écran par le nom du Pi, avec le code, dans `deploy/kiosk.sh` (`URL="http://pixel.local:8080/?kiosk=1&t=TON_CODE"`).
- **Le bouton Caster depuis un vrai téléphone** : le module a tourné pour de vrai pendant le développement (la session YouTube s'ouvre, YouTube donne un vrai code TV), mais aucun téléphone ne s'y est encore relié. À essayer : la découverte sur le Wi-Fi de la maison (DIAL, multicast) avec l'appli Android et l'appli iPhone, et le code TV.
- **Sur le Pi 4 et le Pi 5** : le lecteur YouTube dans Chromium. Le Pi 5 décode la vidéo avec son processeur : si ça saccade, choisis 720p dans le menu du lecteur. Pendant la vidéo, l'écran autour (le temps, Pixel) ne se redessine que 10 fois par seconde, pour laisser le processeur à la vidéo.
- **Le son** par la sortie du Pi, et les publicités de YouTube (elles passent dans le lecteur, comme sur une télé).

### Les réglages (`config.toml`)

```toml
[cast]
max_mb = 40       # la taille maximale d'un fichier, en Mo
seconds = 120     # combien de temps reste une photo, un GIF, un texte ou un lien (0 : jusqu'à « Arrêter »)
keep = 8          # les derniers fichiers gardés, à réafficher

[ytcast]          # le bouton Caster de l'appli YouTube (voir YouTube, plus haut)
enabled = false   # true pour l'activer (il faut Node.js et npm ci --omit=dev dans sidecar/ytcast)
name = "Pixel"    # son nom dans le menu Caster
port = 3000       # le port DIAL, sur le Wi-Fi de la maison
# node = "/usr/bin/node"   # si Node.js n'est pas dans le PATH
```

### Pour les curieux : l'API

| Route | Ce qu'elle fait |
| --- | --- |
| `POST /api/cast` | un fichier (`multipart/form-data` : `file`, et `raw`, `seconds`, `title`), un formulaire simple ou du JSON (`{"text"}`, `{"url", "title"}`). Répond `{"ok": true, "cast": {...}}` ou `{"ok": false, "error": "..."}` (400, 403, 413, 415). |
| `POST /share` | le partage Android : `title`, `text`, `url`, `media`. Répond 303 vers `/?cast=…`. |
| `GET /cast/NOM` | les fichiers reçus, avec leur vrai type. |
| actions WebSocket | `cast.text`, `cast.link`, `cast.stop`, `cast.again` (`id`), `cast.colors` (`raw`), `cast.end` (envoyée par l'écran de Pixel à la fin d'une vidéo). |
| état | `cast` : `{id, kind (image, gif, video, text, link), src, text, url, title, site, embed, qr, t0, until, raw}`. `cast_recent` : les derniers. |
| actions WebSocket (YouTube) | `yt.play`, `yt.pause`, `yt.toggle`, `yt.seek` (`by` ±, ou `to`), `yt.volume` (`level`, ou `by`), `yt.mute` (`on`), `ytcast.code` (le code TV à l'écran). L'écran de Pixel envoie `yt.report` (ce que fait le lecteur) et `yt.ended`. |
| état (YouTube) | `cast.yt` : `{id, list, start, music}`. `cast.ytp` : `{src (lien, appli), v, n, cmds (les 8 derniers ordres, numérotés), st (état, position, durée, volume, erreur)}`. `ytcast` : `{on, ok, status, code, senders, name}`. Un cast `ytcode` : le code TV. |
| `GET /ytcast` | le WebSocket du module YouTube, seul (`pixel/ytcast.py` décrit ses messages) : le Pi lui-même, sans en-tête `Origin` (aucune page web), avec le code du module dans son premier message. |

### Sécurité

- **Le même code d'accès** que le reste de l'appli : `?t=`, l'en-tête `X-Pixel-Token`, ou le cookie que pose l'appli (`SameSite=Strict` : une page d'un autre site ne l'envoie jamais). Seul le Pi lui-même passe sans code. Et seulement les appareils de la maison, comme avant.
- **Une page d'un autre site affichée sur le Pi** (le lecteur YouTube) n'est pas Pixel : elle n'a pas accès au WebSocket ni au cast sans le code.
- **Les fichiers :** leur type vient de leurs premiers octets, jamais de leur nom. Un fichier qui n'est pas une image ou une vidéo est refusé tout de suite. Ils arrivent sur la carte SD au fil de l'envoi, s'arrêtent à la limite de taille, et prennent un nom tiré au sort dans `~/.config/pixel/cast/`. Seuls les 8 derniers restent.
- **Les liens :** le serveur n'en ouvre **aucun**. Sinon, quiconque peut caster pourrait fouiller le réseau de la maison depuis le Pi. Une image ou une vidéo en lien est chargée par le navigateur de l'écran, comme sur n'importe quelle page. YouTube et Vimeo jouent dans leur propre lecteur. Une autre page n'est jamais ouverte sur le Pi : juste une carte avec un QR code.

### Limites connues

- Un **GIF en lien** vers un site qui l'interdit (CORS) ne montre que sa première image. Un GIF envoyé depuis le téléphone est toujours animé.
- Certaines **vidéos YouTube** refusent d'être lues ailleurs que sur YouTube (erreurs 101 et 150) : Pixel le dit, avec un QR code pour la regarder sur le téléphone.
- Pour une **page web**, Pixel ne montre pas la page elle-même, seulement sa carte.
- **Pas encore essayé sur le vrai Pi :** le dessin d'une vidéo 1080p 60 fois par seconde sur le Pi 4, et le son par la sortie du Pi. Si la vidéo saccade, une vidéo en 720p ira mieux.

---

## 2. Les autres façons de caster sur un Raspberry Pi

Ce qui est fait au-dessus **envoie un fichier ou un lien**. Pour **recopier l'écran** d'un téléphone ou d'un PC en direct, voici les solutions, de la plus utile à la moins utile pour Pixel.

### En résumé

| Solution | Depuis | Recopie d'écran | Fiabilité | Travail | Avis |
| --- | --- | --- | --- | --- | --- |
| **Caster sur Pixel** (fait) | tout téléphone, PC | non : fichiers, liens, textes | bonne | fait | la base |
| **YouTube** : lien et bouton Caster de l'appli (fait) | Android, iPhone, PC | non : la vidéo | bonne (lien), moyenne (bouton) | fait | le bouton Caster est en option |
| **AirPlay avec UxPlay** | iPhone, iPad, Mac | oui, avec le son | bonne | ½ à 1 jour | **la suite, si la maison a des iPhone ou un Mac** |
| **Partage Android dans l'appli pixel-mobile** | Android | non | très bonne | ½ jour | **la suite côté Android** |
| **Partage d'écran WebRTC** | navigateur d'ordinateur | oui (onglet, fenêtre, écran) | bonne | 1 jour | quand Pixel aura une adresse https |
| **DLNA / UPnP** (gmrender-resurrect) | Android (BubbleUPnP), Windows | non : fichiers | moyenne | ½ jour | possible, peu utile |
| **Google Cast** | Android, Chrome | — | impossible | — | non |
| **Miracast** (MiracleCast) | Android, Windows | oui | mauvaise | plusieurs jours | non |

### AirPlay : UxPlay

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
  - le **bouton Caster de l'appli YouTube**, qui n'est pas Google Cast mais DIAL, comme une télé : c'est fait, en option (voir YouTube, plus haut) ;
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

Un bouton **Partager mon écran** dans l'appli, sur un ordinateur. Le navigateur demande quoi partager (`getDisplayMedia` : un onglet, une fenêtre ou tout l'écran). L'image va directement à l'écran de Pixel (WebRTC), qui l'affiche comme un cast vidéo.

- **La mise en relation :** passe par le WebSocket déjà là. Une action `rtc.signal` relaie l'offre, la réponse et les candidats ICE entre l'ordinateur et l'écran du Pi. Sur le Wi-Fi de la maison, pas besoin de serveur STUN.
- **L'écran du Pi :** reçoit le flux dans une `<video>` cachée, dessinée comme une vidéo castée, avec le vert du tube et Pixel dans le coin. Demander une image de 800 × 480 suffit, et le Pi la décode sans peine.
- **La condition :** `getDisplayMedia` ne marche que sur une **adresse sécurisée**. Sur `http://pixel.local:8080`, le bouton ne peut pas marcher. Il faut l'adresse https (Tailscale, voir plus haut) ou le réglage de Chrome sur l'ordinateur.
- **Pour :** rien à installer, marche sur Windows, Mac et Linux, son de l'onglet possible, peu de retard, tout reste dans le code de Pixel.
- **Contre :** ordinateurs seulement (Chrome sur Android et Safari sur iPhone ne savent pas partager l'écran), l'onglet doit rester ouvert, et il faut l'https.
- **Travail :** une journée.

### La suite conseillée

1. **Maintenant :** le cast intégré (fait). Il couvre le plus courant : montrer une photo, une vidéo, un lien ou un mot, depuis n'importe quel téléphone.
2. **Android, sans https :** faire accepter les partages à l'appli `pixel-mobile`. Un « intent filter » pour les images, les vidéos et le texte, par exemple avec `expo-share-intent`. L'appli envoie à `POST /api/cast` avec le code qu'elle garde déjà. Une demi-journée.
3. **iPhone et Mac :** UxPlay, avec l'interrupteur **AirPlay** dans Réglages et le code PIN. C'est la vraie recopie d'écran, pour peu de travail.
4. **Une adresse https** (Tailscale) : elle débloque le menu Partager de l'appli web et le partage d'écran WebRTC depuis un ordinateur.
5. **Plus tard, si besoin :** Pixel comme lecteur DLNA, pour Windows (**Caster sur un appareil**) et BubbleUPnP.
6. **Non :** Google Cast (impossible) et Miracast (pas fiable).
