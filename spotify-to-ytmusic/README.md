# Spotify → YouTube Music

Script qui recopie tes playlists Spotify (et, si tu veux, tes titres likés) dans ton compte YouTube Music.

Pour chaque titre, il cherche sur YouTube Music (titre + artiste + durée), prend la meilleure correspondance, crée la playlist puis génère un **rapport** (`rapport.csv`) des titres trouvés, douteux ou introuvables.

Tu peux le relancer sans risque : il se souvient de ce qui a déjà été fait (`state.json`) et n'ajoute que ce qui manque, sans créer de doublons.

## 1. Installation

Il faut Python 3.10 ou plus récent.

```bash
cd spotify-to-ytmusic
python -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Côté Spotify : deux façons de lire tes playlists

### Option A : l'API Spotify (compte **Premium** requis)

Depuis février 2026, les apps Spotify en « Development Mode » exigent que leur propriétaire ait un abonnement Premium.

1. Va sur <https://developer.spotify.com/dashboard> puis **Create app**.
2. Dans *Redirect URIs*, ajoute exactement : `http://127.0.0.1:8888/callback`
3. Coche **Web API**, enregistre, puis copie le *Client ID* et le *Client secret*.
4. Dans ton terminal :
   ```bash
   export SPOTIPY_CLIENT_ID="ton_client_id"
   export SPOTIPY_CLIENT_SECRET="ton_client_secret"
   ```
   Sous Windows PowerShell : `$env:SPOTIPY_CLIENT_ID="..."`

Au premier lancement, une page Spotify s'ouvre pour autoriser l'accès. Ensuite tout est automatique.

> ⚠️ Avec l'API, Spotify ne donne le contenu **que des playlists que tu as créées ou sur lesquelles tu collabores**. Les playlists que tu suis simplement (celles de Spotify ou d'autres personnes) sont ignorées. Pour celles-là, fais d'abord une copie dans Spotify (« Ajouter à une autre playlist »).

### Option B : l'export de données Spotify (sans Premium, sans API)

1. Sur spotify.com : **Compte → Confidentialité → Télécharger tes données**, coche **Données du compte**.
2. Tu reçois un mail sous quelques jours. Décompresse l'archive (elle contient `Playlist1.json`, `YourLibrary.json`…).
3. Lance le script avec `--source export --export-dir chemin/vers/le/dossier`.

## 3. Côté YouTube Music : connexion

Le script utilise [ytmusicapi](https://ytmusicapi.readthedocs.io), une bibliothèque non officielle. Choisis **une** des deux méthodes.

### Méthode simple : cookies du navigateur (`browser.json`)

```bash
ytmusicapi browser --file browser.json
```

Suis les instructions : ouvre <https://music.youtube.com> connecté à ton compte, ouvre les outils de développement (F12) puis l'onglet *Réseau*, clique sur une requête `browse` et copie ses *en-têtes de requête*. Colle-les dans le terminal.

La session peut expirer au bout de quelques semaines. Dans ce cas, refais cette étape.

### Méthode OAuth (`oauth.json`), plus durable mais plus longue

1. Dans la [Google Cloud Console](https://console.cloud.google.com/), crée un projet, active **YouTube Data API v3** et crée un identifiant OAuth de type **« TV et appareils à entrée limitée »**.
2. Puis :
   ```bash
   export YTM_CLIENT_ID="..."
   export YTM_CLIENT_SECRET="..."
   ytmusicapi oauth --file oauth.json --client-id "$YTM_CLIENT_ID" --client-secret "$YTM_CLIENT_SECRET"
   ```

Le fichier `oauth.json` ou `browser.json` doit être placé dans ce dossier.

## 4. Utilisation

```bash
# Voir ce qui sera transféré
python transfer.py --list --liked

# Essai à blanc : cherche les correspondances, ne crée rien, produit le rapport
python transfer.py --dry-run --liked

# Transfert complet (playlists privées par défaut)
python transfer.py --liked

# Seulement certaines playlists
python transfer.py --only "Chill" --only "Sport"

# Depuis l'export de données au lieu de l'API
python transfer.py --source export --export-dir ~/Téléchargements/my_spotify_data --liked
```

| Option | Rôle |
|---|---|
| `--liked` | inclut les titres likés (dans une playlist « Titres likés (Spotify) ») |
| `--only TEXTE` | ne traite que les playlists dont le nom contient TEXTE (répétable) |
| `--list` | affiche les playlists et quitte |
| `--dry-run` | ne crée rien sur YouTube Music |
| `--privacy` | `PRIVATE` (défaut), `UNLISTED` ou `PUBLIC` |
| `--min-score` | seuil d'acceptation d'un titre, de 0 à 1 (défaut 0.70) |

## 5. Après le transfert

Ouvre `rapport.csv` dans Excel ou LibreOffice (séparateur `;`) :

- **trouvé** : correspondance très probable ;
- **douteux** : ajouté, mais à vérifier (autre version, live, remix…) ;
- **introuvable** : non ajouté. La colonne `lien` montre quand même le meilleur candidat, pour que tu puisses l'ajouter à la main si c'est le bon.

Pour être plus strict, monte `--min-score` (par exemple 0.8). Pour récupérer plus de titres, descends-le (au risque de mauvaises correspondances).

## Confidentialité

Tout tourne sur ton ordinateur. Les jetons (`.spotify_token`, `oauth.json`, `browser.json`) restent dans ce dossier et sont exclus de git : ne les partage jamais.
