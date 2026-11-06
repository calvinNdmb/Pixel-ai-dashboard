# Pixel : l'appli

L'appli qui tourne sur le Raspberry Pi 4 de Pixel. Elle affiche le visage et les menus sur l'écran de Pixel, et pilote les 15 touches du Stream Deck. La même appli s'ouvre aussi sur ton téléphone ou ton ordinateur, où tu peux taper au clavier. Elle a six thèmes : Rétro, Moderne, Manga, Néon, Croquis et LCD.

![Les écrans de Pixel](preview.png)

## Ce qu'elle fait

| Écran | Contenu |
| --- | --- |
| **Visage** | Pixel cligne des yeux, regarde autour de lui, suit ton doigt et change d'humeur. Quand il s'ennuie, il sautille, s'étire et bâille. Il s'endort après 10 minutes sans rien. |
| **Lumières** | Tes pièces Philips Hue : allumer, éteindre, régler la luminosité, lancer une scène. |
| **Claude** | Tu écris, Claude répond à l'écran. Il peut aussi agir : régler les lampes, lancer le minuteur, lire la météo et l'agenda, changer d'écran ou de thème, lancer Codex. |
| **Codex** | Lance une tâche de code et affiche son journal en direct. Une notification apparaît sur les autres écrans quand c'est fini. |
| **Météo** | Météo du jour et des 4 jours suivants (Open-Meteo, gratuit, sans compte). |
| **Minuteur** | Séances de concentration de 25 minutes et pauses café. |
| **Agenda** | Aujourd'hui et demain, depuis Google Agenda (donc aussi l'agenda Samsung relié à ton compte Google), iCloud, Outlook… ou un fichier .ics importé. Plusieurs agendas à la fois. |
| **Système** | Température, processeur, mémoire, Wi-Fi et luminosité de l'écran. |
| **Réglages** | Un QR code pour ouvrir l'appli sur ton téléphone, l'association du pont Hue et l'état de chaque service. |
| **Veille** | Un champ d'étoiles avec Pixel qui dort. Les touches du Stream Deck baissent leur lumière. |

## Les thèmes

| Thème | Style |
| --- | --- |
| **Rétro** | Écran vert de vieux PC, visage en gros pixels, lignes de balayage. Il démarre comme un vieux PC, avec un BIOS. |
| **Moderne** | Fond bleu nuit, grands yeux lumineux et arrondis qui flottent, rebondissent et clignent en douceur. Les messages de Claude sont dans des bulles. |
| **Manga** | Page de manga : grands yeux brillants avec reflets, joues rosées, trame de points. Il a aussi des effets de manga : traits de vitesse quand il est surpris, bulle au nez quand il dort, étoile quand il fait un clin d'œil. |
| **Néon** | Nuit synthwave : grille rose qui défile vers toi, montagnes, coucher de soleil rayé en veille. Le visage est fait de tubes néon qui s'allument en grésillant. |
| **Croquis** | Dessin au crayon sur une page de cahier à lignes. Les traits tremblent un peu, comme un dessin animé fait main. Surligneur jaune et stylo rouge. |
| **LCD** | Écran de console de poche : quatre tons de vert, grille de points, pixels qui font une petite ombre. Pixel y devient une petite créature avec une antenne. |

**Pour changer de thème :**
- sur l'écran **Réglages**, touche un thème ;
- avec les touches **Thème −** et **Thème +** du Stream Deck, sur Réglages ;
- en tapant `thème néon`, `thème croquis`, `thème suivant`… ;
- en demandant à Claude « mets le thème néon ».

Le choix est gardé au redémarrage. Les touches du Stream Deck et de l'appli sur téléphone changent de couleurs et de police avec le thème.

## Les humeurs

Tous les thèmes dessinent les 15 humeurs. Pixel passe de l'une à l'autre en douceur : les yeux et la bouche se transforment (en Rétro et en LCD, les pixels se mélangent).

| Humeur | Quand |
| --- | --- |
| Neutre | Par défaut : il cligne des yeux (parfois deux fois), regarde autour de lui, suit ton doigt. |
| Content | Quand tu le touches, quand Codex réussit. |
| Surpris | Notification, fin du minuteur, réveil en sursaut. |
| Amoureux | Quand tu lui dis merci, ou quand tu le caresses du doigt. |
| Clin d'œil | Après une blague. |
| Endormi | Après un moment sans rien faire. |
| Réfléchit | Pendant que Claude prépare sa réponse. |
| Écoute | Pendant que tu écris à Claude. |
| Triste | Quand quelque chose rate, par exemple Claude injoignable. |
| Fâché | Quand tu le tapotes trop vite. |
| Confus | Quand il n'a pas compris. |
| Excité | Des étoiles plein les yeux : une super nouvelle. |
| Fier | Lunettes de soleil : il a réussi un truc. |
| Malade | Quand le Raspberry Pi chauffe trop (plus de 80 °C). |
| Bâille | Quand il s'ennuie, juste avant de s'endormir. |

**Le toucher :** sous ton doigt, le visage s'écrase un peu, puis rebondit quand tu le lâches. Ses yeux suivent ton doigt. Tapote-le cinq fois de suite : il se fâche. Caresse-le d'un côté à l'autre : il tombe amoureux.

Tape `humeur triste`, `humeur fier`… pour en voir une. Sur le Stream Deck, la touche **Humeur +** de l'écran Visage les passe toutes en revue.

![Les 15 humeurs dans les 6 thèmes](preview-themes.png)

![Les écrans dans les 6 thèmes](preview-themes-screens.png)

## Taper au clavier

Il y a trois façons d'écrire :

- **Sur ton ordinateur :** ouvre l'appli et tape directement, ça écrit dans la barre `C:\PIXEL>`. Les flèches ← et → changent d'écran.
- **Sur ton téléphone :** touche la barre `C:\PIXEL>`, le clavier du téléphone s'ouvre.
- **Sur Pixel lui-même :** touche la barre, ou la touche **Clavier** du Stream Deck. Un clavier AZERTY s'affiche sur l'écran tactile. Un clavier Bluetooth marche aussi : le Pi 4 a le Bluetooth, donc il n'ajoute pas de câble.

Ce que tu tapes est d'abord lu comme une commande. Si ce n'en est pas une, ça part à Claude.

| Tu tapes | Ça fait |
| --- | --- |
| `salon 40` | met le salon à 40 % |
| `allume bureau`, `éteins cuisine`, `chambre off` | allume ou éteint une pièce |
| `éteins tout`, `allume tout` | toutes les pièces |
| `scène film` | lance une scène Hue |
| `minuteur 10`, `pause` | lance un minuteur de 10 minutes, le met en pause |
| `codex corrige le test qui échoue` | lance une tâche Codex |
| `météo`, `agenda`, `système`… | ouvre cet écran |
| `humeur content`, `humeur triste`, `humeur fâché`… | change l'humeur du visage |
| `thème néon`, `thème croquis`, `thème lcd`, `thème rétro`… | change le style de l'écran |
| `thème suivant`, `thème précédent` | passe au thème d'après, ou d'avant |
| `aide` | affiche la liste des commandes |
| n'importe quoi d'autre | c'est envoyé à Claude, par exemple « baisse un peu les lumières, je regarde un film » |

## Le Stream Deck

- **Rangées 1 et 2 :** les 10 écrans.
- **Rangée 3 (en couleur) :** des actions qui changent selon l'écran. Par exemple : humeurs et *Humeur +* sur Visage, scènes sur Lumières, *Pause café* sur Minuteur, *Clavier* sur Claude, *Thème −* et *Thème +* sur Réglages.
- **Dessin des touches :** aux couleurs et avec la police du thème. L'écran ouvert est mis en valeur.

## Sur ton téléphone

1. Sur Pixel, ouvre **Réglages** et scanne le QR code. Il contient le code d'accès.
2. Dans le navigateur, choisis **Ajouter à l'écran d'accueil**. Pixel s'ouvre alors comme une appli.
3. Le bouton **Miroir de Pixel** :
   - allumé, ton téléphone montre et change l'écran de Pixel ;
   - éteint, tu navigues de ton côté sans changer l'écran de Pixel.

L'appli marche sur ton Wi-Fi. Sans le code d'accès, un autre appareil du réseau voit la page mais ne peut rien faire.

![Sur un téléphone](preview-phone.png)

## Tes agendas (Google et Samsung)

Sur ton téléphone, dans l'appli, touche **Agendas** (sous le clavier). La page te guide.

- **Google Agenda :** colle l'« adresse secrète au format iCal » de ton agenda. Tu la trouves sur un ordinateur, dans les paramètres de Google Agenda, rubrique « Intégrer l'agenda ». Les changements arrivent sur Pixel toutes les 10 minutes, ou tout de suite avec « Actualiser ».
- **Agenda Samsung :** il affiche aussi les agendas de ton compte Google. Crée tes rendez-vous dans un agenda Google (pas « Samsung » ni « Téléphone ») : ils arrivent sur Pixel tout seuls.
- **Rendez-vous seulement dans l'agenda Samsung :** si l'appli te propose de les partager ou de les exporter en fichier .ics (ou .vcs), importe ce fichier sur la même page. C'est une copie : réimporte-le pour le mettre à jour.
- **Autres agendas :** toute adresse .ics ou webcal:// marche aussi (iCloud, Outlook, Proton…).

Les adresses restent sur le Pi (fichier privé), et les écrans n'affichent que le nom de chaque agenda.

## Essayer sur ton ordinateur (mode démo)

Lampes, météo, agenda, Claude et Codex sont alors faux, mais tout s'affiche et réagit :

```bash
cd pixel-app
pip install -r requirements.txt
python server.py --demo
```

Ouvre ensuite <http://localhost:8080> pour la version téléphone, ou <http://localhost:8080/?kiosk=1> pour l'écran de Pixel.

## Installer sur le Raspberry Pi

Il faut Raspberry Pi OS avec le bureau (Bookworm ou plus récent), et ce dépôt copié dans ton dossier personnel.

```bash
cd ~/Pixel-ai-dashboard/pixel-app
sh deploy/install.sh
```

Le script fait 5 choses :
1. Il installe les paquets nécessaires.
2. Il crée un environnement Python.
3. Il autorise l'accès au Stream Deck et à la luminosité de l'écran.
4. Il lance le serveur au démarrage.
5. Il ouvre l'écran de Pixel en plein écran à l'ouverture de session.

**Ensuite :**

1. **La clé Claude :** crée une clé sur la console Anthropic, puis écris-la dans `/etc/pixel.env` :
   ```bash
   sudo nano /etc/pixel.env       # ANTHROPIC_API_KEY=sk-ant-...
   ```
   Sans clé, Claude reste en mode démo.
2. **Tes réglages :** ouvre `config.toml` pour indiquer ta ville et le dossier de projet de Codex. Tes agendas s'ajoutent depuis ton téléphone (voir « Tes agendas »).
3. **Codex :** installe-le (`npm i -g @openai/codex`), puis connecte-toi une fois (`codex login`). Ou mets `OPENAI_API_KEY=...` dans `/etc/pixel.env`. La commande lancée se règle dans `[codex] command` de `config.toml`. Tu peux y mettre Claude Code à la place.
4. **Hue :** sur Pixel, ouvre **Réglages**, touche **Associer Hue**, puis appuie sur le bouton du pont dans les 30 secondes.
5. Redémarre : `sudo reboot`.

## Coût

L'appli est gratuite. Les réponses de Claude sont facturées à l'usage sur ton compte API Anthropic. Le modèle est Claude Opus 5.5 avec un effort bas (`effort = "low"`), pour des réponses rapides et courtes. Si Claude refuse une demande pour raison de sécurité, l'API réessaie toute seule avec un autre modèle.

## Vérifications faites

Testé sur ordinateur, avec les tests du dossier `tests/` :
- **Commandes et accès** (`test_pixel.py`) : lampes, scènes, minuteur, écrans, Claude et Codex en démo, refus d'un appareil sans code d'accès. Chaque thème : choix dans Réglages, touches *Thème −* et *Thème +*, commande `thème …`, choix gardé après un redémarrage. Chaque humeur avec `humeur …`.
- **Données réelles** (`test_real.py`) : la vraie météo d'Open-Meteo, un agenda iCal avec un événement sur la journée et un événement répété, et les 15 touches du Stream Deck dessinées dans chaque thème.
- **Claude** (`test_claude_loop.py`) : la boucle a tourné face à un faux serveur d'API. Claude règle le salon, change de thème et d'humeur, et un thème inconnu est refusé.
- **Visage** (`test_life.js`) : clignements, regards, bâillements, étirements, réactions au toucher, et chaque thème dessine chaque humeur et chaque passage d'une humeur à l'autre sans erreur.
- **Affichage** (`shots.js`) : les 10 écrans, le démarrage et les 15 humeurs s'affichent sans erreur dans les 6 thèmes, sur l'écran 800 × 480. Chaque thème tourne à 60 images par seconde dans Chromium sur ordinateur, même avec le processeur ralenti 4 fois.

Pour les relancer :

```bash
python3 tests/test_pixel.py          # lance son propre serveur de démo sur le port 8102
python3 tests/test_real.py
python3 tests/test_claude_loop.py
node tests/test_life.js
```

`node tests/shots.js 8102 shots` prend les captures (il faut un serveur de démo sur ce port et Playwright), puis `python3 tests/sheets.py shots .` refait les images de ce guide.

Pas encore testé avec le vrai matériel :
- le Raspberry Pi ;
- le pont Hue ;
- le Stream Deck ;
- une vraie clé Claude ;
- Codex.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `server.py` | le serveur : page web, WebSocket, tâches de fond |
| `pixel/` | un module par service : `hue`, `claude`, `codex`, `weather`, `agenda`, `system`, `timer`, `deck` ; plus `commands` (commandes tapées), `keys` (touches) et `state` (état partagé) |
| `web/` | l'interface : `themes.js` fait vivre le visage et dessine les 6 styles (fonds, visages, icônes, démarrage), `screens.js` les écrans, `app.js` la connexion, les touches et le clavier |
| `tests/` | les tests et les captures d'écran |
| `deploy/` | installation sur le Pi : script, service systemd, ouverture en plein écran, règles d'accès |
| `config.example.toml` | les réglages à copier en `config.toml` |

Les polices VT323, Fredoka, Bangers, Comic Neue, Audiowide, Chakra Petch, Patrick Hand, Caveat et Pixelify Sans sont sous licence SIL Open Font License (fichiers `web/*-OFL.txt`).
