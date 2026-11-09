# Les amis de Pixel

Ton Pixel peut rendre visite au Pixel d'un copain, d'une maison à l'autre, comme le Pixel de poche part dans ton téléphone. Il sort de ton écran avec sa petite valise, arrive sur l'écran de son ami, à côté de lui, et ils jouent ensemble environ 3 minutes : ils se disent bonjour, dansent, se tapent dans les mains, font la course, goûtent, jouent à cache-cache, se racontent une blague, bavardent, font une photo souvenir… et s'endorment côte à côte s'il est tard. Puis il rentre chez toi et te raconte : « J'ai joué avec Bip ! On a dansé, et on a fait la course ! »

Rien ne passe par un serveur à nous, et tu n'as rien à ouvrir sur ta box : les deux Pixels se parlent par un **relais** public (ntfy.sh, ou le tien), et tout ce qui y passe est **chiffré** : le relais ne voit ni les noms, ni les codes, ni ce que font les Pixels. Tant que ton Pixel n'a pas d'ami, il ne contacte même pas le relais.

## Devenir amis

1. Sur le téléphone de ton Pixel, touche **Amis** sous les touches (le panneau **Ses amis**), puis **Créer mon code**. Ton code d'ami s'affiche : **trois mots et un nombre**, par exemple `lapin · soleil · tarte · 4271`, avec un QR code. Tu peux aussi le montrer en grand sur l'écran de Pixel (**Montrer sur l'écran de Pixel**, ou tape `mon code d'ami`).
2. Donne ce code à ton copain : lis-le-lui au téléphone, écris-le-lui, ou montre-lui le QR code (son appareil photo affiche le texte, il peut le copier).
3. Chez lui, sur son Pixel : panneau **Ses amis**, partie **Ajouter un ami**, il tape le code et touche **Ajouter**. Ou il tape la commande `ajoute l'ami lapin soleil tarte 4271`. Les majuscules, les accents, les tirets et les espaces ne comptent pas. Un mot mal tapé ? Le panneau le dit tout de suite, et propose le bon (« lapon » : « Tu voulais dire lapin ? »).
4. En une seconde, les deux Pixels sont amis : sur les deux écrans, Pixel fait la fête (« J'ai un nouvel ami ! Il s'appelle Bip ! ») et la tête de son ami passe le bout du nez dans le coin.

Le code marche **une seule fois**, pendant **24 heures**. Les deux Pixels doivent être allumés. Pour un autre ami, crée un autre code. **Annuler ce code** l'efface.

**Astuce :** donne d'abord un nom à ton Pixel (panneau **Caractère**, ou `appelle-toi Bip`) : c'est ce nom que voient ses amis. Deux amis qui s'appellent pareil deviennent « Pixel » et « Pixel 2 ».

## Les visites

- **Va le voir :** dans **Ses amis**, le bouton **Va le voir** à côté de ton ami. Ou tape `va voir Bip`. Ou demande à Claude « va voir Bip ».
- Ton Pixel quitte ton écran avec sa valise. À la place, une petite maison : « Chez Bip », le temps qu'il reste, et le bouton **Rappelle-le** (touche-le pour le faire rentrer tout de suite ; tape aussi `reviens`).
- Chez Bip, il entre par la droite, Bip se pousse un peu à gauche, et ils jouent. Leurs noms sont écrits sous eux. Ton Pixel garde son propre look (s'il en a un), dans les couleurs du thème de Bip.
- À la fin, il rentre et raconte ce qu'ils ont fait. La visite va dans le journal de **Ses amis**, et dans son album s'il en a un.
- **Bip ne répond pas ?** Au bout de 25 secondes, ton Pixel revient : « Bip n'a pas répondu… il doit dormir. » Son Pixel est peut-être éteint.
- **Bip ne peut pas ?** Ton Pixel revient et te dit pourquoi : il dort (la nuit, pendant ses heures calmes), il est occupé (quelque chose est casté sur son écran), il fait des maths (un exo est ouvert), il a déjà de la visite, il est lui-même parti en visite, ou il ne reçoit pas de visite en ce moment. Si vous partez chacun chez l'autre en même temps : « On s'est croisés ! »

**Quand un ami vient chez toi**, tu n'as rien à faire : il entre, ils jouent, il repart. Touche-le : il rigole. **Raccompagner** (dans **Ses amis**) le fait repartir plus tôt.

**Sur l'écran du Pi, une chose à la fois :** ce que tu castes, le menu rapide et un exo ouvert passent devant la visite. Elle attend dessous, son temps continue, et revient après. Pendant une visite, l'assiette des repas se range et Pixel ne te propose pas de question de maths.

## Coucous et autocollants

- **Coucou** fait coucou à ton ami : sur son écran, ta tête passe dans le coin et le salue. Tape aussi `dis coucou à Bip`.
- **Autocollant** : un des 12 dessins (un cœur, une étoile, un soleil, un arc-en-ciel, un pouce levé, un fou rire, une fleur, un gâteau, une fusée, un cadeau, une note de musique, un bisou). Tape aussi `envoie un cœur à Bip`.
- Il n'y a **pas de texte libre** entre deux maisons : seulement ces coucous, ces autocollants et les visites.
- Si son Pixel dort, le coucou attend dans son journal.

## Réglages et parents

Dans **Ses amis**, partie **Réglages** :
- **Accepter les visites** (allumé au départ) : éteint, les amis ne peuvent plus venir.
- **Me demander avant** (éteint au départ) : quand un ami frappe, Pixel affiche « Bip veut venir jouer ! » avec **Non merci** et **Oui !**, sur son écran et dans le panneau. Sans réponse en 45 secondes, c'est non.
- **Amis** : l'interrupteur des parents. Éteint, plus rien ne sort ni n'arrive : pas de visite, pas de coucou, plus de connexion au relais.
- Pour verrouiller pour de bon, sur le Pi : `enabled = false` dans la partie `[amis]` de `config.toml` (le bouton du téléphone ne le rallume pas).

**Retirer un ami :** **Retirer** (touche deux fois). Les deux Pixels oublient l'amitié et sa clé. Si son Pixel est éteint plus de 12 heures, il ne l'apprendra pas tout seul : retire-le aussi de son côté.

**Le journal** (« Ce qui s'est passé ») garde les 30 dernières choses : nouveaux amis, visites dans les deux sens et ce qu'ils ont fait, refus, coucous, autocollants.

**Au plus 20 amis.**

## Ce qui protège les enfants

- Seuls les Pixels qui ont échangé un code peuvent joindre le tien. Le code marche une fois, 24 heures, et ne voyage jamais (ni dans le relais, ni ailleurs).
- Aucun texte libre, aucune photo, aucune position, aucun prénom ne passe d'une maison à l'autre. Un ami connaît seulement : le nom de ton Pixel (des lettres, 16 au plus), son caractère, son thème, son look, et un numéro au hasard.
- Tout ce qui passe par le relais est chiffré et signé : un message modifié, rejoué, trop vieux ou pas pour toi est jeté.
- Tout est limité : 20 amis, un coucou toutes les 20 secondes par ami, un autocollant toutes les 8 secondes, 150 messages par jour, une visite à la fois, 30 messages par minute reçus d'un même ami (le reste est jeté sans être lu).
- L'interrupteur **Amis** et le verrou de `config.toml`, le journal pour voir ce qui s'est passé, **Me demander avant** pour décider de chaque visite.

## Sans Pi, et dans Pixel Lab

**Pixel sans Pi** (l'appli Android sans le Pi) n'a pas encore d'amis : ses amis et leurs clés vivent sur le Pi. Les commandes des amis disent « Relie Pixel à ton Pi pour ça ».

**Pixel Lab** a un ami de démo, **Bip**, joué par un faux relais dans la page (rien ne sort de la page) : dans le panneau **Les amis**, **Il vient te voir** fait venir Bip (avec les mêmes scènes que sur le Pi), **Va voir Bip** envoie Pixel chez lui, **Il fait coucou**, ses autocollants, **Il dort**, **Il ne répond pas**, et chaque scène à deux, toute seule. Les visites y durent 30 secondes (**Visites courtes**). **Un copain tape mon code** te fait un nouvel ami de démo. Tu peux aussi taper n'importe quel code bien formé dans **Ajouter un ami**.

## Ton propre relais

Le relais par défaut est [ntfy.sh](https://ntfy.sh), un service public et gratuit (il garde les messages 12 heures, puis les efface). Tu peux en installer un à toi (ntfy est un logiciel libre : `docker run -p 80:80 binwiederhier/ntfy serve`, ou sur un petit serveur), puis, dans `config.toml` :

```toml
[amis]
relay = "https://ntfy.mamaison.fr"
# token = "tk_..."          # si ton relais demande un jeton d'accès
```

Les deux Pixels amis doivent utiliser le même relais. Rien d'autre n'est demandé au relais que de transmettre des messages qu'il ne peut pas lire.

---

## Comment c'est fait (pour les curieux et les développeurs)

**Fichiers.** `pixel/relais.py` : le client ntfy et la boîte chiffrée ; `pixel/amis.py` : les codes, les amitiés, les visites, les commandes, l'outil de Claude, `amis.json` ; `web/amis.js` : l'écran du Pi et le panneau du téléphone ; `web/scenes/amis.js` : les scènes (la part de l'hôte, `S(...)`, et celle du visiteur, `PixelAmisDuo`), les autocollants et les accessoires (`PixelAmisArt`), les mots de ce qu'ils ont fait ; `web/lab/amis-lab.js` : le miroir du labo et son ami de démo ; `tests/test_amis.py`, `tests/test_amis.js`, `tests/fake_ntfy.py`.

**Le relais (ntfy).** Publier : `POST {relais}/{sujet}` (le corps est le message, du texte ; en-tête `X-Firebase: no`). S'abonner : `GET {relais}/{s1},{s2},…/json?since={heure unix}`, une ligne JSON par message (`open`, puis les messages gardés depuis `since`, puis chaque nouveau, et un `keepalive` toutes les 45 s). Pixel garde **un seul flux** pour tous ses sujets, ouvert seulement quand il y en a un (un ami, un code, un code tapé). Coupé, il se reconnecte avec une attente qui double (1 s à 5 min, avec un peu de hasard), et reprend avec `since=` (l'heure de son dernier message, gardée dans `amis.json`) : une coupure ne fait rien perdre de ce que le relais garde. 120 s sans rien : la liaison est morte, il se reconnecte. Un refus du relais (429) est dit, jamais réessayé en boucle.

**La boîte.** Chaque message est du JSON chiffré en AES-256-GCM (nonce de 96 bits au hasard), avec le sujet comme donnée associée (copié sur un autre sujet, il ne s'ouvre plus) : `PXA1.` + base64url(nonce ‖ chiffré ‖ étiquette), 3 600 caractères au plus (2 400 octets de JSON). Paquet Python `cryptography` (dans `requirements.txt`, vérifié par `deploy/install.sh`).

**Le code d'ami.** Trois mots d'une liste de 512 (dans `web/amis.js` : des mots simples, sans deux qui se prononcent pareil) et un nombre de 1000 à 9999 : 512³ × 9000 ≈ 1,2 × 10¹² codes, **40,1 bits**. Le code est étiré par scrypt (n = 2¹⁵, r = 8, p = 1 : 32 Mo et environ une demi-seconde sur un Pi 4, à l'abri du serveur), puis HKDF-SHA256 en donne le **sujet de rendez-vous** et sa **clé**. Le code ne voyage jamais. Quelqu'un qui copierait tout le trafic du relais devrait essayer 10¹² codes à une demi-seconde chacun.

**Devenir amis.** Celui qui tape le code (B) publie sur le sujet de rendez-vous, scellé avec sa clé : `bonjour` {sa clé publique X25519 éphémère, sa carte d'identité}. Le propriétaire du code (A), qui écoute ce sujet tant que le code vit, répond `bienvenue` {sa clé publique éphémère, sa carte}, et efface le code (une seule fois). Chacun calcule le secret X25519 et en tire la **clé de l'amitié** : HKDF(secret, sel = le code étiré, info = « pxa1 ami » + SHA-256(clé de B | clé de A | sujet)). Elle dépend donc du code (seul qui le connaissait pouvait participer) et de l'échange (deviner le code plus tard n'ouvre rien : confidentialité persistante). B dit enfin `merci` sur le canal de l'amitié (deux fois, à 15 s d'écart) : A sait alors que B a la même clé, et les deux écrans montrent le nouvel ami. Un `bonjour` de plus de 2 minutes est ignoré (son auteur a abandonné) ; sans réponse en 90 s, B le dit ; A plein (20 amis) répond `complet`.

**La carte d'identité** (tout ce qu'un ami sait de l'autre, prête pour un futur village) : `{v: 1, id: 16 chiffres hexadécimaux au hasard, nom: le nom de son Pixel (pixel/caractere.py, nettoyé, 16 caractères au plus), caractere: son caractère tout prêt ou « perso », theme: son thème, look: son look (le « look » de l'état, un objet opaque : 1 Ko au plus, 4 niveaux, des clés simples, des textes de 64 caractères au plus)}`. Elle est renvoyée à ses amis quand elle change (au plus tous les quarts d'heure).

**Le canal d'une amitié.** De la clé de l'amitié, HKDF tire deux sujets (un par sens : « boite » + l'id du destinataire) et deux clés (« id de l'expéditeur > id du destinataire ») : un message renvoyé à son auteur, ou copié vers un autre ami, ne s'ouvre pas. Chaque message porte `{v, k (son type), de, a, t (heure en ms), id (16 hex au hasard)}` et il est refusé si : il ne s'ouvre pas, il n'est pas pour moi ou pas de cet ami, il vient du futur (plus de 10 min), il est trop vieux (une demande de visite : 90 s ; une réponse : 3 min ; la fin d'une visite : 20 min ; le reste : 24 h), ou son `id` a déjà été vu (les id des dernières 24 h sont gardés dans `amis.json`, donc même après un redémarrage).

**Les types de messages :** `merci`, `carte` {carte}, `au-revoir` (on oublie l'amitié), `coucou`, `sticker` {s : un des 12}, `visite-demande` {vid}, `visite-attente` {vid} (l'hôte demande à sa famille), `visite-ok` {vid, dur}, `visite-non` {vid, pourquoi : dort, occupe, exo, absent, visite, ferme, non, pas-repondu, croise}, `visite-fin` {vid, fait : ce qu'ils ont fait (des scènes de la liste), par : fin, hote, rappel}. Aucun champ de texte libre.

**Une visite.** L'hôte vérifie qu'il peut (`habitudes.dort` s'il existe, sinon les heures calmes de son caractère ; pas de cast, pas d'exo ouvert, pas déjà en visite, visites acceptées), puis fixe le **programme** (`programme()` : il arrive, des activités au hasard tant qu'elles tiennent, la photo souvenir, la sieste côte à côte s'il est tard (après 20 h), au revoir ; environ 3 minutes, `visite_secondes` dans `config.toml`), que tous ses écrans jouent scène par scène à l'heure du serveur. À la fin, il envoie `visite-fin` avec ce qu'ils ont fait ; le visiteur rentre et le raconte. Le visiteur rentre de lui-même 30 s après la fin prévue si l'hôte s'est tu, et au bout de 25 s sans réponse à sa demande.

**L'état « amis »** (ce que voient les écrans) : `{dispo, pourquoi, on, visites, demander, relais, lien (off, connexion, ok, coupe), max, moi (ma carte), code: {code, mots, nombre, expire, qr} | null, montre, ajout: {etat, pourquoi, nom, t} | null, amis: [{id, nom, caractere, theme, look, depuis, vu, visite, n, coucou}], arrivent, visite: {vid, sens (sortie | accueil), ami, nom, etat (demande, attente, chez, question), t0, jusqua, fin, programme, look, seed, par} | null, evs: [les dernières nouvelles], journal: [30]}`. Jamais les clés.

**Les actions :** `amis.code`, `amis.code_annule`, `amis.montre {on}`, `amis.ajoute {code}`, `amis.ajout_ok`, `amis.visite {ami}`, `amis.rappel`, `amis.raccompagne`, `amis.reponse {vid, oui}`, `amis.coucou {ami}`, `amis.sticker {ami, s}`, `amis.retire {ami}`, `amis.reglages {on, visites, demander}`. **Commandes :** `va voir Bip`, `dis coucou à Bip`, `envoie un cœur à Bip`, `mes amis`, `mon code d'ami`, `ajoute l'ami …`, `reviens` (seulement quand il est parti) ; un nom qui n'est pas celui d'un ami part à Claude, comme avant. **Claude :** l'outil `pixel_friends` {action : liste, visite ou coucou ; ami : son nom} ; il ne peut ni ajouter ni retirer d'ami, ni écrire.

**`amis.json`** (dans le dossier de données, lisible par son seul propriétaire : il garde les clés) : mon id, les réglages, les amis (carte, clé, dates, nombre de visites), le code en cours, le journal, les id déjà vus, `since`, le compte du jour. Un fichier illisible est mis de côté (`amis.json.illisible`) et Pixel repart sans ami.

**Le futur village.** Les cartes d'identité (id, nom, caractère, thème, look), la liste des amis et leurs dates sont faites pour être réutilisées par un village où les Pixels cohabitent : il suffira d'un nouveau type de message, sans rien changer aux amitiés.

**Ce qui n'est vérifié qu'avec un vrai second Pi :** le vrai ntfy.sh (son `since`, ses limites, ses keepalives), le délai réel d'une maison à l'autre, scrypt sur un Pi 4, et une visite sur le vrai écran de 7 pouces. Les tests utilisent un faux relais (`tests/fake_ntfy.py`), jamais ntfy.sh.

```
python3 tests/test_amis.py      # le faux relais sur le port 8460 (AMIS_PY_PORT=… pour un autre)
node tests/test_amis.js         # le faux relais 8461, deux serveurs de démo 8462 et 8463 (AMIS_RELAY_PORT, AMIS_A_PORT, AMIS_B_PORT) ; --shots DOSSIER
```
