# Pixel : l'appli

L'appli qui tourne sur le Raspberry Pi 4 de Pixel. Elle affiche le visage et les menus sur l'écran de Pixel, et pilote les 15 touches du Stream Deck. La même appli s'ouvre aussi sur ton téléphone ou ton ordinateur, où tu peux taper au clavier. Elle a trois thèmes : Rétro, Moderne et Manga.

![Les écrans de Pixel](preview.png)

## Ce qu'elle fait

| Écran | Contenu |
| --- | --- |
| **Visage** | Pixel cligne des yeux, regarde autour de lui, suit ton doigt et change d'humeur. Il s'endort après 10 minutes sans rien. |
| **Lumières** | Tes pièces Philips Hue : allumer, éteindre, régler la luminosité, lancer une scène. |
| **Claude** | Tu écris, Claude répond à l'écran. Il peut aussi agir : régler les lampes, lancer le minuteur, lire la météo et l'agenda, changer d'écran ou de thème, lancer Codex. |
| **Codex** | Lance une tâche de code et affiche son journal en direct. Une notification apparaît sur les autres écrans quand c'est fini. |
| **Météo** | Météo du jour et des 4 jours suivants (Open-Meteo, gratuit, sans compte). |
| **Minuteur** | Séances de concentration de 25 minutes et pauses café. |
| **Agenda** | Aujourd'hui et demain, depuis l'adresse iCal de ton agenda (Google, iCloud, Outlook…). |
| **Système** | Température, processeur, mémoire, Wi-Fi et luminosité de l'écran. |
| **Réglages** | Un QR code pour ouvrir l'appli sur ton téléphone, l'association du pont Hue et l'état de chaque service. |
| **Veille** | Un champ d'étoiles avec Pixel qui dort. Les touches du Stream Deck baissent leur lumière. |

## Les thèmes

| Thème | Style |
| --- | --- |
| **Rétro** | Écran vert de vieux PC, visage en gros pixels, lignes de balayage. |
| **Moderne** | Fond bleu nuit, grands yeux lumineux et arrondis qui flottent, rebondissent et clignent en douceur. Les messages de Claude sont dans des bulles. |
| **Manga** | Page de manga : grands yeux brillants avec reflets, joues rosées, trame de points. Il a aussi des effets de manga : traits de vitesse quand il est surpris, bulle au nez quand il dort, étoile quand il fait un clin d'œil. |

**Pour changer de thème :**
- sur l'écran **Réglages** ;
- avec les touches de la rangée du bas du Stream Deck sur Réglages ;
- en tapant `thème manga` ;
- en demandant à Claude « mets le thème moderne ».

Le choix est gardé au redémarrage. Les touches du Stream Deck et de l'appli sur téléphone changent de couleurs avec le thème.

![Les 8 humeurs dans les 3 thèmes](preview-themes.png)

![Les écrans dans les 3 thèmes](preview-themes-screens.png)

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
| `humeur content` | change l'humeur du visage |
| `thème manga`, `thème moderne`, `thème rétro` | change le style de l'écran |
| `aide` | affiche la liste des commandes |
| n'importe quoi d'autre | c'est envoyé à Claude, par exemple « baisse un peu les lumières, je regarde un film » |

## Le Stream Deck

- **Rangées 1 et 2 :** les 10 écrans.
- **Rangée 3 (en orange) :** des actions qui changent selon l'écran. Par exemple : humeurs sur Visage, scènes sur Lumières, *Pause café* sur Minuteur, *Clavier* sur Claude.
- **Dessin des touches :** en vert et noir, comme l'écran. L'écran ouvert est affiché en négatif.

## Sur ton téléphone

1. Sur Pixel, ouvre **Réglages** et scanne le QR code. Il contient le code d'accès.
2. Dans le navigateur, choisis **Ajouter à l'écran d'accueil**. Pixel s'ouvre alors comme une appli.
3. Le bouton **Miroir de Pixel** :
   - allumé, ton téléphone montre et change l'écran de Pixel ;
   - éteint, tu navigues de ton côté sans changer l'écran de Pixel.

L'appli marche sur ton Wi-Fi. Sans le code d'accès, un autre appareil du réseau voit la page mais ne peut rien faire.

![Sur un téléphone](preview-phone.png)

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
2. **Tes réglages :** ouvre `config.toml` pour indiquer ta ville, l'adresse iCal de ton agenda et le dossier de projet de Codex.
3. **Codex :** installe-le (`npm i -g @openai/codex`), puis connecte-toi une fois (`codex login`). Ou mets `OPENAI_API_KEY=...` dans `/etc/pixel.env`. La commande lancée se règle dans `[codex] command` de `config.toml`. Tu peux y mettre Claude Code à la place.
4. **Hue :** sur Pixel, ouvre **Réglages**, touche **Associer Hue**, puis appuie sur le bouton du pont dans les 30 secondes.
5. Redémarre : `sudo reboot`.

## Coût

L'appli est gratuite. Les réponses de Claude sont facturées à l'usage sur ton compte API Anthropic. Le modèle est Claude Opus 5.5 avec un effort bas (`effort = "low"`), pour des réponses rapides et courtes. Si Claude refuse une demande pour raison de sécurité, l'API réessaie toute seule avec un autre modèle.

## Vérifications faites

Testé sur ordinateur :
- **Commandes et accès :** les 25 tests passent (lampes, scènes, minuteur, écrans, humeurs, thèmes, Claude en démo, Codex en démo, refus d'un appareil sans code d'accès).
- **Données réelles :** la vraie météo d'Open-Meteo, et un agenda iCal avec un événement sur la journée et un événement répété.
- **Claude :** la boucle a tourné face à un faux serveur d'API. Claude demande à régler le salon, la lampe change, puis la réponse s'affiche.
- **Stream Deck :** le dessin des 15 touches a été testé avec un Stream Deck simulé.
- **Affichage :** les 10 écrans et les 8 humeurs s'affichent sans erreur dans les 3 thèmes, sur l'écran 800 × 480 et sur un téléphone.

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
| `web/` | l'interface : `themes.js` dessine les 3 styles (fonds, visages, icônes), `screens.js` les écrans, `app.js` la connexion, les touches et le clavier |
| `deploy/` | installation sur le Pi : script, service systemd, ouverture en plein écran, règles d'accès |
| `config.example.toml` | les réglages à copier en `config.toml` |

Les polices VT323, Fredoka, Bangers et Comic Neue sont sous licence SIL Open Font License (fichiers `web/*-OFL.txt`).
