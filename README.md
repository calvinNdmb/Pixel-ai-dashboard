# Pixel AI Dashboard: Pixel Voice

Des personnages en pixel art qui s'animent **en direct** quand les gens parlent dans un salon vocal Discord : bouche qui bouge, rebond, halo vert, ondes sonores.

Et on peut **interagir** : taper quelqu'un, lui mettre un coup de marteau, lui lancer une tomate, faire un câlin, danser, sauter, faire coucou ou afficher une réaction emoji. Ça se fait depuis une manette web (téléphone ou PC, avec raccourcis clavier) ou avec des commandes Discord (`/taper @quelqu'un`).

L'affichage est une simple page web. On peut donc l'ouvrir **sur n'importe quel écran ou appareil** : un deuxième écran, une tablette, un téléphone, une TV, un autre PC, ou OBS.

```
Discord (salon vocal)          Manettes (téléphones, PC)        /taper @Bobby dans Discord
   │  qui parle                     │  « je tape Bobby »               │
   ▼                                ▼                                  ▼
Bot Discord + serveur web (ce projet, tourne sur ton PC, un Raspberry Pi ou un serveur)
   │  WebSocket, temps réel
   ▼
Autant d'écrans que tu veux : http://<ip-du-pc>:3000
```

## 1. Installation

Il faut [Node.js](https://nodejs.org) 22 ou plus.

```bash
npm install
```

### Tester tout de suite, sans Discord

```bash
npm run demo
```

Ce mode simule un salon avec 4 personnes qui parlent et s'embêtent de temps en temps. Le terminal affiche les adresses à ouvrir :

```
Affichage disponible sur :
  ce PC           → http://localhost:3000/
  autre appareil  → http://192.168.1.42:3000/
Manette (taper, danser, réactions...) :
                    http://localhost:3000/manette
                    http://192.168.1.42:3000/manette
```

Ouvre la deuxième adresse sur ton téléphone ou ta tablette, connecté au même Wi-Fi : tu dois voir les personnages bouger en même temps que sur le PC. Ouvre aussi la manette, choisis un perso et appuie sur **T** : il va taper sa cible.

`npm run demo -- --calme` lance la démo sans actions automatiques, pour tester la manette tranquillement.

## 2. Créer le bot Discord (une seule fois)

1. Va sur <https://discord.com/developers/applications>, puis **New Application**.
2. Onglet **Bot** : clique sur **Reset Token** et copie le token. Il ne faut le donner à personne.
3. Onglet **OAuth2**, puis copie l'**Application ID** (Client ID). Ouvre ensuite cette adresse en remplaçant `TON_CLIENT_ID` :
   ```
   https://discord.com/oauth2/authorize?client_id=TON_CLIENT_ID&scope=bot+applications.commands&permissions=1049600
   ```
   Elle invite le bot sur ton serveur avec les permissions « Voir les salons » et « Se connecter », ainsi que les commandes slash (`/taper`...).
4. Dans Discord, active **Paramètres → Avancés → Mode développeur**. Fais ensuite un clic droit sur ton pseudo, puis **Copier l'identifiant de l'utilisateur**.

## 3. Configuration

```bash
cp .env.example .env
```

Remplis `.env` :

| Variable | Rôle |
|---|---|
| `DISCORD_TOKEN` | Le token du bot |
| `FOLLOW_USER_ID` | **Recommandé.** Ton ID : le bot te suit. Quand tu rejoins un salon vocal, il le rejoint aussi, et il part quand tu pars. |
| `GUILD_ID` + `VOICE_CHANNEL_ID` | À la place de `FOLLOW_USER_ID` : le bot reste toujours dans ce salon. |
| `PORT` | Port de l'affichage (3000 par défaut) |
| `VIEW_KEY` | Optionnel : un mot de passe pour l'affichage (voir plus bas) |

Puis :

```bash
npm start
```

Le bot apparaît dans le salon vocal, en muet. Il n'enregistre rien et ne décode pas l'audio : il regarde seulement **qui** envoie du son, et à quel moment.

## 4. Afficher sur un autre écran ou un autre appareil

### Sur le même réseau (Wi-Fi ou câble)
- Ouvre `http://<ip-du-pc>:3000` sur l'appareil. L'adresse est affichée au démarrage.
- **Windows** : au premier lancement, autorise Node.js dans la fenêtre du pare-feu (« réseaux privés »).
- **Touche l'écran** (ou clique) pour passer en plein écran.
- **Tablette ou téléphone** : utilise « Ajouter à l'écran d'accueil ». La page s'ouvre alors en plein écran, comme une appli. Pense aussi à désactiver la mise en veille de l'écran.
- **TV** : ouvre l'adresse dans le navigateur de la TV, ou caste l'onglet Chrome.
- **Deuxième écran du PC** : ouvre une fenêtre de navigateur, glisse-la sur l'autre écran, puis passe en plein écran (F11).

Tous les écrans sont synchronisés. Si l'un perd la connexion (veille, Wi-Fi), il se reconnecte tout seul.

### Depuis l'extérieur (un appareil qui n'est pas chez toi)
Choisis une de ces options :
- **[Tailscale](https://tailscale.com)** (le plus simple et privé) : installe-le sur le PC et sur l'appareil, puis ouvre `http://<nom-tailscale-du-pc>:3000`.
- **Tunnel Cloudflare** : `cloudflared tunnel --url http://localhost:3000` donne une adresse publique en `https://`.
- **Héberger le projet** sur un Raspberry Pi ou un petit serveur (VPS) allumé en permanence.

Dès que l'affichage est accessible depuis Internet, **définis `VIEW_KEY`** dans `.env` et ouvre `https://.../?key=ta-cle`. La clé est ensuite mémorisée par l'appareil.

## 5. Interactions : taper, bonk, tomate...

| Action | Effet | Touche | Commande Discord |
|---|---|---|---|
| ✋ Taper | Ton perso fonce sur la cible et lui met une claque : « PAF! », yeux en croix, trace rouge sur la joue | `T` | `/taper cible:@quelqu'un` |
| 🔨 Bonk | Coup de marteau sur la tête : la tête s'enfonce, étoiles qui tournent | `B` | `/bonk cible:@…` |
| 🍅 Tomate | Lancer de tomate en cloche, la cible reste tachée quelques secondes | `L` | `/tomate cible:@…` |
| 🤗 Câlin | Les deux persos se serrent, avec des cœurs | `C` | `/calin cible:@…` |
| 💃 Danse | Ton perso danse avec des notes de musique | `D` | `/danse` |
| 🦘 Saut | Ton perso saute | `Espace` | `/saut` |
| 👋 Coucou | Il fait coucou avec une bulle « Coucou! » | `S` | `/coucou` |
| 😂❤️😮😡👍💀 | Bulle emoji au-dessus de ton perso | `R` `A` `O` `G` `P` `M` | `/emote` |

### Avec la manette (`/manette`)
- Ouvre `http://<ip-du-pc>:3000/manette` sur ton téléphone ou dans une fenêtre de ton PC.
- La première fois, choisis **qui tu es**. C'est mémorisé.
- Choisis ta **cible** en touchant son perso, ou avec les touches `1` à `9` ou `←` `→`, puis appuie sur une action.
- Astuce : envoie à chaque ami un lien perso `http://…/manette?me=SON_ID_DISCORD`, il n'aura rien à choisir.

Les raccourcis clavier ne marchent que quand la fenêtre de la manette est active : un navigateur ne peut pas capter les touches pendant que tu es dans un jeu. Pour ça, une manette sur téléphone posé à côté du clavier est l'idéal.

### Avec les commandes Discord
Elles marchent pour tous ceux qui sont dans le salon vocal du bot, même à distance, sans rien ouvrir. On les tape dans n'importe quel salon texte du serveur, par exemple le chat du salon vocal. La réponse du bot n'est visible que par la personne qui a tapé la commande, pour ne pas spammer le salon.

## 6. Options d'affichage (dans l'adresse)

| Option | Effet |
|---|---|
| `?bg=transparent` | Fond transparent, pour OBS (source « Navigateur ») |
| `?bg=%23000000` | Couleur de fond (`%23` = `#`) |
| `?names=0` | Masque les pseudos |
| `?silent=dim` | Estompe ceux qui ne parlent pas |
| `?silent=hide` | N'affiche que ceux qui parlent |
| `?only=ID1,ID2` | N'affiche que certaines personnes |
| `?key=...` | Clé, si `VIEW_KEY` est défini |

Les options se combinent, par exemple `http://192.168.1.42:3000/?bg=transparent&silent=dim`.

## 7. Personnaliser les personnages

Chaque personne reçoit automatiquement un personnage unique, toujours le même, calculé à partir de son ID Discord. Pour le modifier, édite `config/characters.json`. **Les écrans se mettent à jour tout seuls, sans redémarrage.**

```json
{
  "123456789012345678": {
    "name": "Calvin",
    "hairStyle": "spiky",
    "hair": "#e8c26a",
    "skin": "#f5d0b5",
    "shirt": "#4f8be0",
    "eyes": "#2a4a8a",
    "accessory": "glasses"
  }
}
```

- `hairStyle` : `short`, `spiky`, `long`, `cap`, `buns`, `mohawk` ou `bald`
- `accessory` : `glasses` ou `null`

### Utiliser tes propres sprites
Mets tes images dans `public/sprites/` (du PNG pixel art de préférence), puis :

```json
{
  "123456789012345678": {
    "sprite": {
      "idle": "sprites/calvin-idle.png",
      "talk": ["sprites/calvin-talk1.png", "sprites/calvin-talk2.png"]
    }
  }
}
```

`idle` est l'image au repos. Les images de `talk` défilent pendant que la personne parle. Les interactions marchent aussi avec des sprites (déplacements, marteau, bulles), mais sans les poses des bras ni les expressions du visage.

## Structure

```
src/index.js            point d'entrée (bot ou démo)
src/discord.js          bot : rejoint le vocal, détecte qui parle, commandes slash
src/server.js           serveur web + WebSocket, valide les actions, diffuse vers tous les écrans
src/demo.js             salon simulé pour tester
public/index.html       la page d'affichage (app.js)
public/manette.html     la manette (manette.js)
public/actions.js       liste des interactions (touches, commandes...)
public/character.js     dessin des persos et de leurs poses
public/effects.js       animations des interactions (déplacements, particules, bulles)
config/characters.json  apparence des personnages
```

## Limites
- Le bot doit pouvoir rejoindre le salon. Ça ne marche donc que sur un serveur où tu peux l'inviter, pas dans les appels privés ni les groupes.
- La manette n'a pas de mot de passe par personne : n'importe qui ayant l'adresse peut choisir n'importe quel perso. Entre amis ça va ; si l'adresse est publique, mets une `VIEW_KEY`.
- L'animation suit le **fait de parler**, pas les syllabes exactes. La bouche s'ouvre et se ferme de façon naturelle tant que la personne parle.
