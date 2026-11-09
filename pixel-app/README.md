# Pixel : l'appli

L'appli qui tourne sur le Raspberry Pi 4 de Pixel. Elle affiche le visage et les menus sur l'écran de Pixel, et pilote les 15 touches du Stream Deck. La même appli s'ouvre aussi sur ton téléphone ou ton ordinateur, où tu peux taper au clavier. Elle a six thèmes : Rétro, Moderne, Manga, Néon, Croquis et LCD. Le visage de Pixel vient de ton pack de 52 animations ; l'ancien visage vivant reste au choix.

![Les écrans de Pixel](preview.png)

## Ce qu'elle fait

| Écran | Contenu |
| --- | --- |
| **Visage** | Pixel joue les 52 animations de ton pack : il respire, cligne des yeux, regarde autour de lui, change d'humeur, danse ou chante quand tu le demandes. Il s'endort après 10 minutes sans rien. |
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

**Pour le moment, Pixel n'a que le thème Rétro.** Les 5 autres sont toujours là, mais rien ne les propose : ni Réglages, ni le Stream Deck, ni les commandes, ni Claude. Sur Réglages, le Stream Deck montre alors *Effet CRT*, *Visage Pack 52* et *Visage Vivant* à la place des touches de thème. Pixel ne charge que la police du Rétro, ce qui allège aussi son démarrage.

Pour les retrouver, mets dans `config.toml`, partie `[ui]`, puis redémarre Pixel :

```toml
themes = ["retro", "moderne", "manga", "neon", "croquis", "lcd"]
```

Tu peux aussi n'en garder que quelques-uns, par exemple `themes = ["retro", "lcd"]`. Dans Pixel Lab, le bouton **Voir les 6 thèmes** les montre quand même.

| Thème | Style |
| --- | --- |
| **Rétro** | Écran vert de vieux PC, visage en gros pixels, lignes de balayage. Il démarre comme un vieux PC, avec un BIOS. |
| **Moderne** | Fond bleu nuit, grands yeux lumineux et arrondis qui flottent, rebondissent et clignent en douceur. Les messages de Claude sont dans des bulles. |
| **Manga** | Page de manga : grands yeux brillants avec reflets, joues rosées, trame de points. Il a aussi des effets de manga : traits de vitesse quand il est surpris, bulle au nez quand il dort, étoile quand il fait un clin d'œil. |
| **Néon** | Nuit synthwave : grille rose qui défile vers toi, montagnes, coucher de soleil rayé en veille. Le visage est fait de tubes néon qui s'allument en grésillant. |
| **Croquis** | Dessin au crayon sur une page de cahier à lignes. Les traits tremblent un peu, comme un dessin animé fait main. Surligneur jaune et stylo rouge. |
| **LCD** | Écran de console de poche : quatre tons de vert, grille de points, pixels qui font une petite ombre. Pixel y devient une petite créature avec une antenne. |

**Pour changer de thème** (quand il y en a plusieurs) :
- sur l'écran **Réglages**, touche un thème ;
- avec les touches **Thème −** et **Thème +** du Stream Deck, sur Réglages ;
- en tapant `thème néon`, `thème croquis`, `thème suivant`… ;
- en demandant à Claude « mets le thème néon ».

Le choix est gardé au redémarrage. Les touches du Stream Deck et de l'appli sur téléphone changent de couleurs et de police avec le thème.

## Les 52 animations

Le visage de Pixel vient de **ton pack** « Pixel OS — 3 thèmes, 52 animations » (version 2.1) : 34 expressions, activités et états, et 18 animations d'attente. Le pack est copié dans `web/pack52/`. Dans `pixel.js` et `pixel-themes.js`, seuls les noms de deux variables ont changé (`Pixel52` et `Pixel52Themes`), pour ne pas gêner ceux de Pixel OS. `animations.json` garde les 52 animations, sans les liens vers les GIF et les sprites, qui ne sont pas copiés. Les dessins et le moteur des animations sont les tiens.

![Le catalogue de ton pack, en Rétro](web/pack52/Catalogue_Pixel.png)

Pixel les dessine dans ses 6 thèmes :
- **Rétro** reprend les pixels de ton pack, aux couleurs de l'écran vert ;
- **Moderne** et **Manga** reprennent son dessin Moderne et Manga ;
- **Néon** reprend le Moderne, avec un halo de néon ;
- **Croquis** reprend le Manga, au crayon sur la page ;
- **LCD** reprend les pixels en quatre verts, dans la tête de la petite créature.

Le visage tient dans un cadre 16:9 entre le haut de l'écran et la ligne du bas. D'une animation à l'autre, la pose glisse en douceur. En Rétro et en LCD, ce sont les pixels qui se mélangent.

![Douze animations dans les 6 thèmes](preview-pack52.png)

**Quand rien ne se passe**, Pixel enchaîne les 18 animations d'attente, une boucle chacune. Il les tire au sort : les plus discrètes reviennent plus souvent, et jamais deux fois la même de suite. Avant de s'endormir, il pique du nez (Micro-sieste), puis il fait dodo et rêve.

**Chaque humeur a son animation :**

| Humeur | Animation |
| --- | --- |
| Neutre | les animations d'attente |
| Content, Surpris, Amoureux, Réfléchit, Triste, Confus, Fier | les animations du même nom |
| Clin d'œil | Clin d'œil |
| Endormi | Dodo et Rêve |
| Écoute | À l'écoute |
| Fâché | En colère |
| Excité | Émerveillé |
| Malade | À plat |
| Bâille | Bâillement |

**Ce qui se passe autour de lui :**
- une notification fait arriver une enveloppe ;
- Codex au travail : il tape sur son clavier ; réussi : Bravo ! ; en échec : Oups… ;
- Claude réfléchit : Réfléchit ; Claude répond : Bavarde ;
- au réveil et à la fin du démarrage : Réveil.

**Le toucher :** sous ton doigt, le visage s'écrase un peu, puis rebondit. Pour le reste, Pixel a sa personnalité : voir la partie suivante.

**Pour en jouer une :**
- tape `anim danse`, `animation fou rire`, `anim clin d'oeil`… (le nom, avec ou sans accents) ;
- ou simplement `danse`, `chante`, `coucou`, `bisou` ;
- `animations` affiche la liste ;
- sur le Stream Deck, écran Visage : la touche **Anim +** les passe en revue ;
- demande à Claude « fais-moi une petite danse ».

Elle se joue une ou deux fois, puis Pixel revient à son humeur. Ça marche dans les 6 thèmes, quel que soit le visage choisi. Sur l'écran Claude, la petite tête réfléchit, parle et écoute avec les mêmes animations.

**Pour garder l'ancien visage :** dans **Réglages**, touche **Vivant** à côté de « VISAGE ». Tu peux aussi taper `visage vivant`, puis `visage pack` pour revenir au pack. Le choix est gardé au redémarrage.

## Sa personnalité

Pixel réagit à ce que tu lui fais, s'en souvient un moment, et vit sa vie quand personne ne le regarde. Ses expressions viennent de tes 52 animations. Pixel bouge en entier sur l'écran : il nage, part se promener, se cache ou boude dans un coin. Autour de lui : des cœurs, des larmes, des bulles, une mouche… Et il parle dans une bulle. Ça marche dans les 6 thèmes, avec les deux visages. En Rétro et en LCD, tout est dessiné en gros pixels, comme son visage.

![Neuf moments de sa personnalité dans les 6 thèmes](preview-personnalite.png)

**Quand tu le touches**, ça dépend de l'endroit :

| Où | Ce qu'il fait |
| --- | --- |
| un œil | « Aïe, mon œil ! », et une petite larme |
| le haut de la tête | « Bonk ! » : il s'écrase, des étoiles tournent |
| la bouche | il rit : « Ça chatouille ! » |
| un côté | il glisse plus loin : « Hé, pousse pas ! », puis revient |
| à côté de lui | il se penche vers ton doigt : « Y a quoi, là ? » |
| ailleurs sur le visage | au hasard : coucou, youpi, pirouette, timide, bisou, « J'ai une idée… non, rien » |
| deux tapes très vite | une pirouette |

**Quand tu l'embêtes**, il s'énerve petit à petit : d'abord « Hé ho ! », « Pfff… » ; puis il esquive ton doigt (« Raté ! ») ou se met en colère, avec de la vapeur et une veine sur le front. Une dizaine de tapes de suite, et **il boude** : il part dans un coin, de dos, avec un panneau « NE PAS DÉRANGER ». Si tu insistes, il répond sans te regarder (« Pfff. », « Je boude. ») et ça dure plus longtemps. Il pardonne au bout d'une demi-minute, ou avec deux câlins : « Bon… je te pardonne. » Sa colère retombe en une minute environ.

**Les câlins** (caresse le visage d'un côté à l'autre) : des cœurs et un « Ronron… ». Ils le calment quand il est agacé. Beaucoup de câlins de suite, et il s'endort.

**Quand tu reviens** après un moment sans le toucher :
- après 20 minutes : « Ah, te revoilà ! » ;
- après 2 heures : il est triste (« Tu m'as manqué… »), puis il saute de joie ;
- le matin, après la nuit : « Bonjour ! Prêt pour la journée ? » ; le soir : « Bonsoir ! » ;
- réveillé de sa sieste : « Hein ? Je dormais pas ! » ;
- le 24 et le 25 décembre, le premier bonjour de la journée est « Joyeux Noël ! » ; le 1er janvier, « Bonne année 2027 ! ».

Il s'en souvient même si Pixel a redémarré.

**Quand personne ne le regarde**, toutes les 1 à 2 minutes et demie, il fait un des 24 moments de vie, jamais deux fois le même de suite :
- **Le poisson :** il nage en rond en faisant des bulles.
- **La balade :** il sort de l'écran d'un côté et revient de l'autre.
- **Coucou caché :** il se cache en bas, ressort les yeux, puis « Bouh ! ».
- **L'économiseur d'écran :** il rebondit sur les bords comme le vieux logo DVD, jusqu'à toucher le coin : « LE COIN !!! ».
- **La toupie :** il tourne, puis il a la tête qui tourne.
- **La mouche :** il la suit, elle se pose sur sa tête, il éternue.
- **Le hoquet, l'éternuement, il sifflote, la danse en cachette :** si tu le surprends en train de danser, il répond « Euh… t'as rien vu ! ».
- **Toc toc :** il tape à la vitre de l'écran, de l'intérieur.
- **L'ennui, la sieste, le grand étirement, la rêverie, la méditation, la joie, la gym, « Psst ! » :** des petits moments calmes.
- **Selon le moment :** sous la pluie, il a un petit nuage au-dessus de la tête. Au soleil, il bronze. À l'heure des repas, il pense à une pizza. En décembre, il regarde tomber la neige et compte les dodos avant Noël. La nuit, il ne fait que des moments calmes et bâille.

Ils ne passent pas quand quelque chose d'autre a besoin de son visage : une humeur, une animation, Claude, Codex, un bandeau, ou juste avant qu'il s'endorme.

**Autour de lui :**
- quand tu éteins toutes les lumières, il a peur du noir : « Qui a éteint ?! » ;
- quand tu les rallumes : « Ah, la lumière ! » ;
- à chaque heure pile, dans la journée, il fait le coucou de l'heure : « Coucou ! Il est 15 h. » ;
- 10 minutes avant un rendez-vous de ton agenda, une petite horloge sonne à côté de lui : « Hé ! Dans 10 min… Réunion d'équipe ! ». Peu après la fin, il demande : « Ça s'est bien passé ? » ;
- quand le Pi dépasse 70 °C, il a chaud : il transpire, et de l'air chaud monte autour de sa tête. Il le redit toutes les 15 minutes tant que le Pi ne refroidit pas ;
- quand le Wi-Fi tombe : « Hé, le Wi-Fi est parti ! ». Quand il revient : « Ouf, je capte à nouveau ! » ;
- en hiver, il met un bonnet et une écharpe, et du 20 au 26 décembre son bonnet de Père Noël (voir « Son look »).

**Pour en voir un :**
- tape `fais le poisson`, `fais la sieste`, `joue la toupie`, `fais l'économiseur d'écran`… ;
- `scènes` affiche la liste ;
- dans Pixel Lab, le panneau **Personnalité** joue chaque moment, l'embête, lui fait un câlin et simule ton retour après 30 min, 3 h ou une nuit ;
- demande à Claude « fais le poisson ! ».

Chaque écran a son propre Pixel : ton téléphone et l'écran de Pixel réagissent chacun à leur toucher. Une scène demandée par une commande ou par Claude passe sur tous les écrans.

**Sa voix :** sur l'écran du Pi, Pixel fait des bips de petit robot :
- une petite musique par scène (des bulles pour le poisson, Jingle Bells pour la neige, une alarme pour un rendez-vous) ;
- un babillage quand il parle.

Les sons sont fabriqués par la page, sans fichier. Branche un petit haut-parleur sur la prise casque du Pi. Le volume se règle dans le menu rapide (ligne SON). Ton téléphone reste muet.

**Le menu rapide :** sur l'écran du Pi, glisse vers le bas. Il contient :
- le thème (s'il y en a plusieurs), la luminosité et le son ;
- **Téléphone**, qui affiche le QR code en grand pour ouvrir l'appli ;
- **Poisson** ;
- **Redémarrer** et **Éteindre**, qui demandent une deuxième touche pour confirmer.

Glisse vers le haut pour le fermer.

**Installer l'appli sur ton téléphone :** sur l'écran du Pi, glisse vers la gauche sur son visage. Le QR code arrive en grand. Glisse vers la droite pour revenir.

## Les humeurs

Tous les thèmes dessinent les 15 humeurs. Avec le visage du pack, chaque humeur joue son animation (voir plus haut). Avec le visage vivant, montré ici, il passe de l'une à l'autre en douceur : les yeux et la bouche se transforment (en Rétro et en LCD, les pixels se mélangent).

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

![Les 15 humeurs du visage vivant dans les 6 thèmes](preview-themes.png)

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
| `anim danse`, `animation fou rire`, `danse`, `coucou`… | joue une des 52 animations |
| `animations` | affiche la liste des animations |
| `fais le poisson`, `fais la sieste`, `joue la toupie`… | un de ses moments de vie (voir « Sa personnalité ») |
| `scènes` | affiche ses moments de vie |
| `visage vivant`, `visage pack` | change de visage |
| `mets ton chapeau`, `enlève tout`, `yeux de chat`, `joues roses`, `look normal` | change son look (voir « Son look ») |
| `caste À table !`, `caste https://youtu.be/…` | affiche un texte ou un lien sur l'écran (voir « Caster sur Pixel ») |
| `stop`, `stop cast` | arrête ce qui est casté |
| `code tv` | montre le code TV de l'appli YouTube (si le cast YouTube est activé) |
| `aide` | affiche la liste des commandes |
| n'importe quoi d'autre | c'est envoyé à Claude, par exemple « baisse un peu les lumières, je regarde un film » |

## Le Stream Deck

- **Rangées 1 et 2 :** les 10 écrans.
- **Rangée 3 (en couleur) :** des actions qui changent selon l'écran. Par exemple : humeurs, *Anim +* et *Humeur +* sur Visage, scènes sur Lumières, *Pause café* sur Minuteur, *Clavier* sur Claude, *Thème −* et *Thème +* sur Réglages.
- **Dessin des touches :** aux couleurs et avec la police du thème. L'écran ouvert est mis en valeur.

## Sur ton téléphone

1. Sur l'écran de Pixel, glisse vers la gauche sur son visage (ou ouvre **Réglages**), puis scanne le QR code. Il contient le code d'accès.
2. Dans le navigateur, choisis **Ajouter à l'écran d'accueil**. Pixel s'ouvre alors comme une appli.
3. Le bouton **Miroir de Pixel** :
   - allumé, ton téléphone montre et change l'écran de Pixel ;
   - éteint, tu navigues de ton côté sans changer l'écran de Pixel.
4. Sous les touches, **Caractère**, **Nourrir** et **Exos** ouvrent leurs panneaux (voir [Le personnaliser](#le-personnaliser)).

**L'appli Android** (projet Expo [`pixel-mobile`](../pixel-mobile/), version 1.2) est une vraie appli plein écran, avec les modes **Pixel**, **Clavier** et **Les deux**. En mode Pixel, l'écran du téléphone reste allumé.
- Pose l'APK dans le dossier de données de Pixel, sous le nom `~/.config/pixel/pixel.apk`. Dans Chrome sur Android, un lien **Appli Android** apparaît alors sous le clavier.
- Au premier lancement, Pixel vit déjà dans l'appli, sans le Pi (voir « Pixel sans Pi »). Pour la relier au Pi : bouton retour, **Relier à mon Pixel**, puis le QR code de Pixel. Elle s'en souvient. Quand le Pi ne répond pas, Pixel continue sur le téléphone.
- **Partager sur Pixel :** dans n'importe quelle appli, **Partager**, puis **Pixel**, envoie sur son écran un lien (une vidéo YouTube s'y lance), un texte, une photo, un GIF ou une vidéo (40 Mo au plus). Sans Pi relié, la carte de partage dit de le relier.
- **Les notifications du téléphone** (désactivées au départ) : Pixel réagit à celles des applis que tu choisis, et ses scènes de notification se jouent. Il ne reçoit que le nom de l'appli (« 📱 Nouveau message WhatsApp »), le titre seulement si tu le permets (« 📱 WhatsApp : Maman »), jamais le texte. Sans Pi, le Pixel du téléphone y réagit quand l'appli est ouverte, et rien ne quitte le téléphone. Les règles complètes sont dans le [README de l'appli](../pixel-mobile/README.md).
- **Le Pixel de poche** a tous ses sens dans l'appli, même en http, sur la page du Pi comme sur le Pixel du téléphone (voir plus bas).
- **Son caractère, le nourrir, les exos de maths** marchent aussi dans l'appli, avec ou sans Pi : sous les touches, ou dans le menu de l'appli (bouton retour : **Son caractère**, **Le nourrir**, **Exos de maths**).
- **De la 1.1 à la 1.2,** installe la nouvelle par-dessus : rien ne se perd. **De la 1.0,** désinstalle une fois l'ancienne appli : depuis la 1.1, l'appli est signée avec une nouvelle clé. Installe la nouvelle : Pixel y vit déjà. Pour retrouver ton Pi, scanne à nouveau son QR code (bouton retour, **Relier à mon Pixel**).

L'appli marche sur ton Wi-Fi, en IPv4 comme en IPv6 : un téléphone trouve souvent `pixel.local` par son adresse IPv6. Pixel ne répond qu'aux appareils de la maison, même si ta box laisse passer l'IPv6 depuis Internet. Sans le code d'accès, un autre appareil du réseau voit la page mais ne peut rien faire.

![Sur un téléphone](preview-phone.png)

## Pixel de poche

**Tourne ton téléphone en mode paysage** : l'appli devient un deuxième Pixel, comme un petit animal dans ta poche. C'est le même Pixel que sur l'écran du Pi : même thème (Rétro par défaut), mêmes 52 animations, même personnalité et toutes ses scènes. Il reçoit les mêmes nouvelles : notifications, Codex, minuteur, météo, lumières. Remets le téléphone droit et tu retrouves la télécommande. C'est le téléphone lui-même qu'il faut tourner : un écran partagé ou le clavier qui s'ouvre ne le font pas apparaître.

Sur une tablette, ou si la rotation de ton téléphone est bloquée, touche **Pixel de poche** sous l'écran de Pixel. Le bouton **×**, en haut à gauche, ramène la télécommande.

**Comme sur le Pi**, il réagit à ton doigt : les yeux, la tête, la bouche, les côtés. Tapote-le plusieurs fois de suite, il s'énerve. Caresse-le du doigt, ou **appuie longtemps** dessus : c'est un câlin.

**Et en plus, il sent le téléphone :**
- **secoue-le** : il a le tournis (« Je suis pas un cocktail ! ») ;
- **penche-le** : il glisse vers le bas et se penche pour rester droit ; très penché, « Wooo, ça glisse ! » ;
- **sors-le de ta poche**, ou reprends le téléphone posé depuis un moment : « Il faisait tout noir dans ta poche ! » ;
- **la batterie du téléphone** à 15 % puis à 5 % : « Branche-moi ! » ; branché : « Miam, de l'électricité ! » (Android seulement, l'iPhone ne donne pas sa batterie à une page) ;
- **loin de la maison** (le Pi ne répond plus) : il continue de vivre sur le téléphone et dit qu'il ne capte plus la maison ; dès que le Pi répond, il se reconnecte tout seul. Si le téléphone a fermé la page entre-temps, elle ne se rouvre sans le Pi que sur une adresse en https : le téléphone garde alors l'appli et le dernier état de Pixel. En http, il faut la rouvrir à la maison.

**Ses sens demandent une adresse en https.** Un téléphone ne donne ses mouvements (secouer, pencher), sa batterie et « l'écran reste allumé » qu'à une page sûre : en https, ou ouverte sur l'appareil lui-même. Sur l'adresse habituelle de Pixel, en http, le Pixel de poche vit quand même, réagit au doigt et aux câlins, connaît son jumeau et fait le voyage, mais il ne sent pas le téléphone ; il le dit une fois, en bas de l'écran. Dans l'appli Android, l'écran reste allumé même en http : c'est l'appli qui s'en charge. Depuis la version 1.1, l'appli lui prête aussi les sens du téléphone : l'accéléromètre et la batterie. Elle tient l'écran en paysage et cache les barres du téléphone tant qu'il est là. Dans un navigateur, pour tout avoir, ouvre Pixel par une adresse en https dont le téléphone accepte le certificat.

**Les deux Pixels se connaissent.** Caresse celui du téléphone : celui du Pi est jaloux (« Hé ! Tu caresses l'autre ?! »). Touche-le ou secoue-le : celui du Pi s'inquiète pour son jumeau. Quand tu allumes le Pixel de poche, celui du Pi lui fait coucou. Et dans l'autre sens, si on touche ou caresse le Pixel du Pi, celui de ta poche le remarque.

**Le voyage :** le bouton **Viens !**, en haut à droite, fait venir Pixel dans ton téléphone. Sur le Pi, il prend sa valise et sort de l'écran ; sur le téléphone, son jumeau lui laisse la place et il arrive. Il reste une minute, puis rentre à la maison. **Rentre !** le renvoie plus tôt, et toucher l'écran vide du Pi le rappelle aussi.

**Le téléphone :**
- l'écran reste allumé tant que Pixel est réveillé (en https, ou dans l'appli Android). S'il s'endort (10 minutes sans le toucher, comme sur le Pi), le téléphone peut se mettre en veille ;
- sur Android, la première touche le met en plein écran ; avec le bouton **Pixel de poche**, il reste en paysage. Dans l'appli, c'est elle qui s'en charge : même posé à plat, il reste en paysage, et il rend la télécommande quand tu remets le téléphone droit. Un iPhone ne permet ni l'un ni l'autre à une page : tourne-le simplement ;
- sur iPhone, la première touche demande la permission d'utiliser les mouvements (secouer, pencher) ;
- l'image est nette, à la densité de pixels du téléphone ; les côtés prennent le fond du thème ; pas de défilement ni de zoom ;
- il reste muet. Pour essayer ses bips quand même, ouvre l'appli avec `?son=1` au bout de l'adresse.

Dans Pixel Lab, le panneau **Pixel de poche** montre le téléphone en paysage, et ses boutons font comme si on secouait, penchait ou caressait l'un ou l'autre des deux Pixels.

## Caster sur Pixel

Depuis ton téléphone, montre quelque chose sur l'écran de Pixel. Ça s'affiche par-dessus l'écran ouvert, puis Pixel y revient tout seul.

- **Dans l'appli :** ouvre **Caster sur Pixel**, sous le clavier. Choisis une photo, un GIF ou une vidéo, colle un lien (YouTube, Vimeo, une page, une image) ou écris un petit mot.
- **Ce qui s'affiche :** une photo, un GIF ou un texte reste 2 minutes ; une vidéo va jusqu'au bout. Une page devient une carte avec un QR code pour l'ouvrir sur ton téléphone.
- **Pour arrêter :** touche l'écran de Pixel, le bouton **Arrêter**, ou tape `stop`.
- **Les derniers :** ils restent sous le panneau, touche-en un pour l'afficher encore.
- **Dans ses vraies couleurs :** pendant un cast, plus d'effet cathodique (ni vert, ni lignes, ni grain), quel que soit le thème ; il revient à la fin. Un petit Pixel passe la tête dans le coin et réagit.
- **Partager un écran :** celui d'un ordinateur (la page **Partager mon écran**, `pixel.local:8080/ecran`, et le code que Pixel affiche), d'un téléphone Android (ScreenStream), d'un iPhone, d'un iPad ou d'un Mac (AirPlay, avec UxPlay à installer).
- **Depuis une autre appli :** **Partager → Pixel** sur Android, si l'appli est installée depuis une adresse sécurisée. Sur iPhone, avec un Raccourci.
- **YouTube :** la vidéo joue dans le lecteur de YouTube, sans effet rétro dessus. Le téléphone devient sa télécommande : pause, ±10 s, le son, la barre de lecture. Si YouTube refuse la vidéo, Pixel dit pourquoi et montre un QR code. En option, Pixel apparaît dans le **bouton Caster de l'appli YouTube** et accepte le **code TV** (`[ytcast]`, Node.js).

Tout est expliqué dans [docs/CAST.md](docs/CAST.md), avec le partage d'écran depuis chaque appareil et les autres façons de caster sur un Raspberry Pi.

## Pixel sans Pi

**L'appli Android n'a pas besoin du Pi.** Au premier lancement, Pixel vit sur le téléphone : son visage, ses 52 animations, sa personnalité et toutes ses scènes, ses humeurs, son caractère, ses repas, les exos de maths, les thèmes, l'horloge, le minuteur, la veille, les réglages et Pixel de poche. Sans réseau, et sans aucune fausse donnée : les écrans Lumières, Claude, Codex et Agenda disent « Relie Pixel à ton Pi pour ça », Système montre les mesures du téléphone, et la météo est la vraie (tape `météo Lyon`, Pixel la demande à Open-Meteo). Les six thèmes sont à lui, puisqu'aucun Pi ne les choisit. Son thème, ses réglages, son humeur, le minuteur, sa ville, son caractère, son ventre et ses goûts, ses scores d'exos sont gardés quand l'appli se ferme.

**Son caractère, le nourrir et les exos, sans Pi.** Tout marche comme sur le Pi : les panneaux **Caractère**, **Nourrir** et **Exos** sous les touches (ou dans le menu de l'appli), les commandes (`sois grognon`, `mange une pomme`, `exo`, `table de 7`…), l'assiette et le plateau du Pixel de poche quand tu tournes le téléphone. Seul Claude a besoin du Pi. Quand l'appli reste fermée un moment, son ventre compte le temps comme sur le Pi quand il est éteint : rien la nuit, et au pire un petit creux au retour, jamais une faim de loup. Relié à ton Pi, le Pixel du téléphone reprend son caractère, ses goûts, son ventre et tes progrès en exos (scores, trophées, niveaux, réglages). Un exo resté ouvert sur le Pi reste sur le Pi.

Dans l'appli, ce Pixel a les mêmes fonctions natives que la page du Pi : Pixel de poche avec les sens du téléphone, l'écran qui reste allumé, et les notifications du téléphone si tu les actives (elles ne quittent pas le téléphone). Le partage depuis une autre appli, lui, a besoin de l'écran du Pi.

Reliée au Pi, l'appli montre la page du Pi, comme avant. Quand le Pi ne répond pas, Pixel continue sur le téléphone, avec un bandeau, et l'appli redemande au Pi de temps en temps. Quand il répond de nouveau, l'appli revient à sa page, mais jamais au milieu d'un jeu : seulement si personne n'a touché le Pixel du téléphone ni ses panneaux depuis une minute, et sans minuteur ni exo en cours. Le Pixel du téléphone reprend le thème, les réglages, le caractère, le ventre, les goûts et les exos du Pi. Ce que tu changes sur le téléphone sans le Pi reste sur le téléphone : rien ne remonte au Pi. Le guide complet est dans [`pixel-mobile`](../pixel-mobile/README.md).

**Comment c'est fait.** C'est la vraie page du téléphone (`web/index.html`), réunie en un seul fichier hors ligne par `tools/build_app_bundle.py`. Le faux serveur de Pixel Lab (`web/lab/demo-hub.js`, le même état et les mêmes actions que `server.py`) tourne dans la page, et `web/local.js` en fait un vrai Pixel : il retire les données de démo, dit ce qui a besoin du Pi, va chercher la météo et garde son état. `app.js` lui parle comme au Pi, par une prise qui ressemble à son WebSocket. Une action ajoutée à `demo-hub.js` marche donc aussi dans l'appli, et l'état qu'elle ajoute (`S.<clé>`) est gardé, puis repris de l'image du Pi. Une seule règle pour une nouvelle fonction : si son vrai état n'est pas `S.<clé>` mais une variable à elle, que sa fonction `publish()` recopie dans `S`, elle dit comment le reprendre, n'importe où dans `demo-hub.js` :

```js
restorable('nourrir', (v, at) => { /* reprendre ce qui est valable dans v (la forme de S.nourrir) ; at : l'heure de cette copie */ publish(); });
```

Sans cela, ce qui est repris serait écrasé au `publish()` suivant. `at` est l'heure où la copie a été faite (la sauvegarde du téléphone, ou l'image du Pi) : son ventre s'en sert pour compter le temps passé appli fermée, les exos pour savoir ce qui était « aujourd'hui ». Nourrir et les exos ont chacun le leur ; le caractère aussi, pour nettoyer ce qui revient, comme `caractere.json` sur le Pi. Une action qui a besoin du Pi s'ajoute à la liste `PI` de `local.js` (le partage d'écran, AirPlay et YouTube y sont déjà).

```bash
python3 tools/build_app_bundle.py pixel-local.html
```

L'appli le refait elle-même avant chaque APK (`npm run bundle:web`, dans `pixel-mobile`).

<!-- personnaliser -->
## Le personnaliser

Trois façons de faire de Pixel *ton* Pixel, avec ou sans Pi. Sur ton téléphone, sous les touches : **Caractère**, **Nourrir** et **Exos**, côte à côte. Dans l'appli Android, le menu (bouton retour) les ouvre aussi. Sans Pi, ils vivent sur le téléphone (voir « Pixel sans Pi ») ; le Pi relié, le téléphone reprend les siens.

- **Son caractère** : câlin, grognon, farceur, gourmand, petit prof… ou huit curseurs. Tape `sois grognon`, `plus câlin`, `appelle-toi Bip`.
- **Le nourrir** : son ventre se vide dans la journée, donne-lui un des 24 plats. Tape `mange une pomme`, `tu as faim ?`, `à table !`.
- **Les exos de maths** : il te pose des questions, du CP au collège. Tape `exo`, `table de 7`, `défi chrono`, puis ta réponse (`42`).

**Les trois marchent ensemble :**

| Son caractère | Ce que ça change |
| --- | --- |
| Gourmand | Son ventre se vide plus vite, il a encore de la place quand un autre serait plein, il pense plus souvent à manger, et après un bon plat il en redemande (« Encore ! Il en reste ? »). Petit appétit : l'inverse (« Merci, ça me suffit. »). |
| Grognon (70 et plus) | Il refuse ce qu'il n'aime pas (« Non. Pas ça. ») au lieu de le manger en grimaçant. |
| Farceur | Il rote plus souvent après manger. |
| Studieux | Il te propose plus souvent « Une petite question ? » (si tu l'as permis dans **Exos**), et fait plus souvent un feu d'artifice quand tu as juste. |
| Tous | Ses scènes de repas et d'exos suivent son caractère, comme toutes les autres, celles du Pixel de poche aussi. Avec l'**humeur du jour**, son appétit bouge un peu chaque jour, comme le reste. |

À 50 partout, rien ne change : c'est le Pixel de tous les jours.

**Sur l'écran du Pi, une chose à la fois.** Du plus fort au moins fort : le menu rapide (il s'ouvre par-dessus tout, même par-dessus un cast), ce que tu envoies sur son écran (**Caster sur Pixel** : une photo, une vidéo, YouTube, un écran partagé), un exo ouvert, sa question « Une petite question ? », puis l'assiette et le plateau des repas. Ce qui passe derrière attend et revient après : l'assiette se range pendant un exo, il ne réclame pas à manger au milieu d'un exo, et il ne te pose pas de question quand le plateau est ouvert. Pendant un cast, rien de tout ça ne s'affiche ni ne répond au doigt : l'exo ouvert attend dessous, tel quel, et revient quand le cast se termine.

**Les commandes ne se marchent pas dessus.** Un nombre seul (`42`) va à l'exo ouvert ; sans exo, il part à Claude, comme avant. Pendant un exo, `mange une pomme`, `tu as faim ?` ou `sois grognon` marchent toujours. Tape `aide` : la liste donne une commande de chacun.

**Avec Claude :** il connaît son caractère, et il voit son ventre et tes exos du jour quand il lit l'état de Pixel. Il peut changer son caractère, le faire manger et lancer un exo. Si un exo est ouvert, il sait qu'il ne doit pas donner la réponse ; il peut te donner un indice.
<!-- fin de le personnaliser -->

## Son caractère

Tu peux changer le caractère de Pixel : câlin, grognon, farceur, timide… Et ça change vraiment ce qu'il fait.

**Pour le régler**, sur ton téléphone, touche **Caractère** sous les touches. Tu y trouves :
- **15 caractères tout prêts**, chacun avec sa phrase : Pixel (équilibré), Câlin, Grognon, Farceur, Timide, Bavard, Paresseux, Pile électrique, Gourmand, Petit prof, Rêveur, Curieux, Zen, Indépendant, et **Surprise**, tiré au hasard ;
- **les réglages fins** : huit curseurs de 0 à 100. Indépendant ↔ Câlin, Patient ↔ Grognon, Taiseux ↔ Bavard, Sérieux ↔ Farceur, Calme ↔ Énergique, Blasé ↔ Curieux, Petit appétit ↔ Gourmand, Pas scolaire ↔ Studieux. À 50 partout, c'est exactement le Pixel de toujours ;
- **son nom** (Pixel au départ) et **comment il t'appelle** (rien au départ) ;
- **ses habitudes** : l'humeur du jour (ses traits bougent un peu chaque jour), s'il peut bouder, s'il parle (éteint, il ne bavarde plus, mais les rappels d'agenda, les nouvelles et ses réponses s'affichent toujours), et ses heures calmes (de 23 h à 6 h au départ) ;
- **Essayer**, qui lui fait jouer une scène typique de son caractère, et **Réinitialiser** (touche deux fois), qui le remet comme au premier jour.

Le choix est gardé au redémarrage (fichier `caractere.json` dans le dossier de données). Le Pixel du Pi et le Pixel de poche ont le même caractère.

| Trait | Ce qu'il fait |
| --- | --- |
| Grognon | Il s'énerve plus vite quand tu l'embêtes, boude plus souvent et plus longtemps, ronchonne parfois à la première tape et rouspète tout seul. Patient : l'inverse. |
| Câlin | Chaque câlin compte double : il devient vite tout amoureux et te fait de gros câlins. Indépendant : il repousse parfois tes câlins (« Ça va, ça va… »). |
| Bavard | Plus de bulles, et des histoires. Taiseux : il ne dit presque rien. |
| Farceur | Plus de rires, de grimaces et de farces, comme la fausse panne « Pixel.exe ne répond pas ». Sérieux : moins de pitreries. |
| Énergique | Il vit sa vie plus souvent, bouge plus vite et saute partout. Calme : il s'étale et fait la sieste (« Trop la flemme »). |
| Curieux | Il enquête avec sa loupe et répond à tout. Blasé : il laisse passer une bonne partie des nouvelles du monde (notifications, météo, lumières, Codex). Ce que tu fais pour lui (le minuteur, son jumeau, le nourrir, un exercice…) a toujours sa réponse. |
| Gourmand, Studieux | Il rêve de gâteaux ; il fait des calculs au tableau, avec ses lunettes. |

Toutes ses scènes suivent son caractère, celles des autres paquets aussi : il choisit plus souvent celles qui lui ressemblent.

**Quand tu changes son caractère, il le montre** : une couronne pour le grognon (« Pff… c'est qui le chef ? »), une ronde de cœurs pour le câlin, des lunettes et un tableau pour le petit prof, un dé pour Surprise, une étiquette « Je m'appelle Bip » pour son nouveau nom…

**En tapant :** `sois grognon`, `caractère câlin`, `caractère surprise`, `caractère normal`, `plus câlin`, `moins bavard`, `un peu plus farceur`, `appelle-toi Bip`, `appelle-moi Max`, `oublie mon surnom`, `tais-toi`, `tu peux parler`. `caractère` (ou `caractère ?`) affiche la liste. Une phrase qui ne change rien (`tu peux parler` quand il parle déjà) ou qui ressemble à une conversation (`tu t'appelles vraiment Pixel ?`) va à Claude, comme avant.

**Avec Claude :** il connaît son caractère, son nom et ton surnom, et répond avec (grognon veut dire râleur mais gentil). Demande-lui « sois plus câlin » ou « appelle-toi Bip » : il peut le changer lui-même. Avec l'abonnement Claude, un changement de caractère ne coupe pas la conversation : Claude l'apprend au message suivant.

Dans Pixel Lab, le panneau **Caractère** fait la même chose.

## Nourrir Pixel

Pixel a un **ventre**. Il se vide doucement pendant la journée, et tu peux le nourrir : il mange sur son écran, avec ses goûts à lui. C'est un petit animal de compagnie gentil : il ne tombe jamais malade, il ne meurt jamais et il ne te fait pas de reproches. Au pire, il a un petit creux et il te le dit.

**Son ventre :**
- il se vide d'environ 6 % par heure (réglable : lente, normale, rapide), et un peu plus vite si son caractère est gourmand ;
- la nuit (de 23 h à 6 h), son ventre dort aussi ;
- si le Pi a été éteint longtemps, au réveil il a au pire un petit creux, jamais une faim de loup. Pareil si l'horloge du Pi saute en avant au démarrage (il n'a pas de pile pour garder l'heure : il la reprend sur Internet) ;
- plein, il refuse gentiment ; trop rempli, il gonfle : « Je vais éclater ! ».

**Quand il a faim**, il le dit, sans insister :
- son ventre gargouille : « J'ai un petit creux… », et il pense à ce qui lui ferait plaisir ;
- très faim : « J'ai très faim… Tu me donnes un petit quelque chose ? » ;
- vers l'heure des repas (petit-déj, déjeuner, goûter, dîner) : « C'est l'heure du déjeuner ! On mange quoi ? », avec sa fourchette et son couteau.

Jamais plus d'une fois toutes les 20 minutes, jamais la nuit, et jamais quand il fait déjà autre chose. Son vieux « J'ai faim… » de midi laisse la place à ces envies, qui connaissent son ventre.

**Le menu :** 24 plats dessinés en gros pixels, aux couleurs du thème. Fruits (pomme, banane, fraise), légumes (carotte, brocoli), plats (croissant, baguette, pizza, frites, burger, sushi, pâtes, soupe, fromage), sucreries (glace, gâteau, cookie, bonbon), boissons (chocolat chaud, verre de lait), et pour robots : une pile, un octet croustillant, de l'électricité, et un cookie « accepter les cookies ».

**Ses goûts :** il a un plat préféré, cinq plats qu'il aime et trois qu'il n'aime pas. Ils restent les mêmes au redémarrage. Le bouton **Changer ses goûts** en tire d'autres.

**Ce qu'il fait :**

| Tu lui donnes | Il fait |
| --- | --- |
| son plat préféré | il saute de joie et danse : « Mon plat préféré !! » |
| un plat qu'il aime | il mâche, des cœurs plein les yeux : « Trop bon ! » |
| un plat qu'il n'aime pas | une grimace : « Beurk… bon, d'accord. » S'il est très grognon, il refuse : « Non. Pas ça. » |
| un légume | « Fort comme un robot ! », et il montre ses muscles |
| trois sucreries de suite | il file dans tous les sens, puis il s'écroule : « …je suis tout mou. » |
| une pile, de l'électricité, un octet | il se recharge en grésillant, puis « 100 % ! » |
| les cookies | « J'accepte les cookies ! » |
| quand il est plein | « Merci, mais j'ai plus faim ! » |

Le plat arrive par la droite, il ouvre la bouche, croque en trois bouchées et fait des miettes. Parfois il rote (plus souvent s'il est farceur) : « Burp ! …pardon. »

**Pour le nourrir :**
- **sur l'écran du Pi :** touche la petite assiette sur le bord droit, en bas (juste au-dessus de la ligne d'infos), ou glisse vers le haut depuis le bas de l'écran. Un plateau monte avec les 24 plats : touche-en un. Pour le ranger : glisse vers le bas, touche au-dessus, ou touche **Fermer**. Il se range tout seul après 20 secondes. L'assiette est en dehors de son visage et de la ligne d'infos : le toucher, les caresses et l'appui long marchent comme avant, et un long titre d'agenda reste lisible en entier. Un point clignote sur l'assiette quand il a faim ;
- **sur ton téléphone :** touche **Nourrir**, sous les touches (à côté d'**Agendas**). Le panneau s'ouvre sous l'écran de Pixel : tu le vois manger ce que tu lui donnes. Il montre son ventre, le menu, ses goûts, ses derniers repas et les réglages. Touche l'écran de Pixel ou **×** pour le fermer ;
- **dans ta poche :** le Pixel de poche a la même assiette ;
- **au clavier :** `mange une pomme`, `donne-lui une pizza`, `bois un verre de lait`, `à table !` ou `nourris Pixel` (il choisit lui-même), `tu as faim ?` (il écoute son ventre et te répond). Ces phrases-là seulement : le reste part toujours à Claude ;
- **avec Claude :** « Pixel, tu veux une glace ? ».

Un repas toutes les 6 secondes au plus : le temps de mâcher.

**Au doigt, sur l'écran du Pi :** les glissés marchent maintenant au doigt, et plus seulement à la souris. Avant, le navigateur du Pi gardait le geste pour lui : glisser vers le bas pour le menu rapide ne marchait pas toujours. Le plateau de Pixel en a besoin (glisser vers le haut), et le menu rapide en profite.

**Les réglages** (sur le téléphone, dans le panneau) : **Repas activés** active ou coupe tout. Coupé, son ventre ne bouge plus, il ne réclame rien (même pas à midi) et ne mange pas. **Vitesse** : lente, normale ou rapide.

Dans Pixel Lab, le panneau **Nourrir** donne chaque plat, joue chaque réaction, règle son ventre (repu, ça va, petit creux, très faim) et ouvre le plateau du Pi.

**Ses fichiers :** `pixel/nourrir.py` (son ventre, ses goûts, ses repas, gardés dans `nourrir.json` ; un fichier abîmé ou modifié à la main ne bloque jamais le démarrage), `web/scenes/nourrir.js` (le menu, ses dessins et ses scènes), `web/nourrir.js` et `web/nourrir.css` (le plateau du Pi et le panneau du téléphone), `web/lab/nourrir-lab.js` (le panneau de Pixel Lab).

**Vérifié** (`test_nourrir.py`, `test_nourrir.js`) : son ventre se vide le jour seulement (plus vite s'il est gourmand, un caractère absent compte comme aujourd'hui), pas pendant la nuit, et peu pendant que le serveur est arrêté ou quand l'horloge saute (au pire un petit creux) ; une horloge qui recule ne bloque pas ses repas ; un `nourrir.json` plein de valeurs farfelues (une heure d'avant l'an 2000, un ventre infini, des listes à la place des plats…) ne l'empêche ni de démarrer ni de manger ; un repas toutes les 6 s au plus ; chaque réaction (préféré, aime, beurk, refus si grognon, plein, éclate, trois sucreries, légume, robot, le rot plus fréquent s'il est farceur) ; ses goûts gardés au redémarrage et retirés au sort ; les commandes sans prendre les mots des autres commandes ni de Claude ; l'outil de Claude. Dans Chromium : sur l'écran du Pi, l'assiette hors du visage et de la ligne d'infos (même avec un long titre d'agenda), le plateau au toucher et au glissé, le repas joué et le plat dessiné dans les 6 thèmes, le visage qui répond toujours aux tapes, à l'appui long et au menu rapide ; le panneau du téléphone (Pixel visible au-dessus pendant qu'il mange, cibles de 44 px au moins, pas de défilement de côté, aucun mot coupé n'importe où dans les 6 thèmes) ; le Pixel de poche ; dans Pixel Lab, chaque scène dans chaque thème, et les envies de manger : une seule toutes les 20 minutes, jamais la nuit, ni quand c'est coupé (même pas le vieux « J'ai faim… » de midi), ni par-dessus une autre scène.

Pour relancer ses tests :

```
python3 tests/test_nourrir.py        # son propre serveur de démo sur le port 8174 (NOURRIR_PY_PORT=… pour un autre)
node tests/test_nourrir.js           # port 8175 ; il faut Playwright ; --shots DOSSIER pour les captures
```

<!-- exos de maths -->
## Les exos de maths

Pixel te pose de petits exercices, du CP au collège : additions, soustractions, tables de multiplication, divisions, compléments à 10 ou à 100, doubles et moitiés, calcul mental avec les priorités, comparaisons, suites logiques (2, 4, 6, ?), petits problèmes (« Pixel a 12 piles, il en mange 5… »), heures et durées, fractions, pourcentages, carrés, et des énigmes.

**Pour en lancer un :**
- tape `exo`, `exo de maths`, `un calcul`, `calcul mental`, `table de 7` (ou `révisons la table de 7`), `défi chrono`, `série de 5`, `10 questions`, `une énigme`, `exo de fractions`, `exo difficile` ; les mêmes mots marchent sans Pi et dans Pixel Lab ;
- sur ton téléphone, touche **Exos** sous les touches : un exo, une série, le défi chrono, une énigme, une table ou un type d'exo ;
- demande à Claude « pose-moi une question de maths » ;
- si tu le lui permets (réglage **Il te propose des questions**, éteint au départ), Pixel te propose de temps en temps, dans la journée : « Une petite question ? ». Touche **Oui !**.

**L'exo s'affiche sur l'écran du Pi**, à la place de son grand visage : la question en gros, 4 grandes réponses, et Pixel en petit à côté, qui écoute, réfléchit avec toi et réagit. Ça marche dans les 6 thèmes.

**Pour répondre :**
- touche une des 4 réponses, sur le Pi ou dans l'appli. Un double appui ne compte qu'une fois : il ne te fait jamais perdre ton deuxième essai ;
- sur ton téléphone, le pavé de chiffres, puis **OK** (avec une touche **−** quand une réponse est négative) ;
- tape le nombre dans la barre de commande : `42`, `réponse 42`, ou `4 025` avec une espace. Seulement quand un exo est ouvert : sinon, un nombre part à Claude, comme avant. Pendant la correction, un nombre tapé reste pour l'exo : Pixel te dit d'attendre la question suivante ;
- avec un clavier branché sur le Pi : les chiffres, puis Entrée ; pour une énigme, les touches 1 à 4 ; Échap range l'exo ;
- touche Pixel : il te donne un indice.

**Encore ?** Pendant un exo, ou juste après, `encore` ou `une autre` en lance un autre. Plus tard, ou après **Fini**, ces mots repartent à Claude, comme avant.

**Une erreur ?** Pixel t'encourage, te donne un indice et un deuxième essai. Deuxième erreur : il montre la bonne réponse et comment la trouver (« 7 × 8 = 56 : 7 × 4 = 28, et 28 × 2 = 56 »). Il ne se moque jamais. Si tu réfléchis longtemps, il te demande gentiment si tu veux un indice.

**Les modes :** un exo seul ; une série de 5, avec un bilan ; une table, ses 10 multiplications dans le désordre ; le défi chrono, le plus de bonnes réponses en 60 secondes, sans deuxième essai.

**Il s'adapte :** trois bonnes réponses de suite, du premier coup, font monter le niveau de ce type d'exo ; une erreur le fait baisser. Niveau 1 : CP, CE1 ; niveau 5 : collège. Dans le panneau **Exos**, partie **Réglages** : le niveau de départ, le niveau fixe (« S'adapte tout seul » sur Non), les types des exos au hasard, l'objectif du jour (5 exos au départ) et ses propositions.

**Ses récompenses :** il réagit à chaque réponse ; une étoile par exo fait aujourd'hui ; l'objectif du jour atteint, il danse avec une coupe (la correction reste alors un peu plus longtemps, pour qu'il fasse la fête jusqu'au bout) ; des trophées (premier exo, 5, 10 ou 20 d'affilée, 100 exos, 10 en une minute…). Tape `mes scores` pour un résumé. Tout est gardé sur le Pi, dans `~/.config/pixel/exos.json`.

**Son caractère :** plus Pixel est studieux (si son caractère est réglé), plus il propose de questions et plus il fait la fête quand tu as juste.

**Avec Nourrir :** si Pixel a aussi son assiette (**Nourrir**), elle se range pendant un exo, pour ne pas cacher les réponses.

Dans Pixel Lab, le panneau **Exos de maths** lance chaque mode et chaque type, répond juste ou faux à ta place, et lui fait proposer une question.
<!-- fin des exos de maths -->

<!-- son look -->
## Son look

Tu peux changer la forme de ses yeux, leur couleur, ses joues, et ce qu'il porte. Il garde son look partout : sur l'écran du Pi, sur ton téléphone, dans le Pixel de poche et sans Pi.

**Pour le changer**, sur ton téléphone, touche **Son look** sous les touches (après **Exos**). Dans l'appli Android, le menu l'ouvre aussi. En haut, Pixel en direct, dans le thème du moment. Une touche suffit : il met son nouveau look et se regarde dans un petit miroir (« Ça me va ? »).
- **Yeux :** ronds (comme avant), carrés, en amande, étoiles, cœurs, yeux de chat (la pupille fendue), lunettes rondes.
- **Couleurs :** neuf couleurs pour ses yeux et pour ses joues (bleu, turquoise, vert, jaune, orange, rouge, rose, violet, marron), celle du thème, et l'arc-en-ciel pour ses yeux (il bouge doucement).
- **Accessoires**, un par place. Sur la tête : chapeau haut-de-forme, casquette, couronne, antennes, bonnet, chapeau de fête, chapeau de sorcière, citrouille, bonnet de Père Noël, bonnet de nuit. Sur les yeux : lunettes de soleil. Sur le visage : moustache. Au cou : nœud papillon, écharpe, pyjama. Sur les oreilles : casque audio. **Rien** vide une place. Et des tenues toutes prêtes : pour l'hiver, pour l'été, Halloween, Noël, la fête, très chic, le roi, musique, pour dormir.
- **Saisons :** les tenues de saison et le pyjama la nuit (voir plus bas).
- **Remettre comme avant** annule le dernier changement (huit fois de suite au plus). **Look de tous les jours** (touche deux fois) le remet comme au premier jour.

**Dans chaque thème, à sa façon :** des pixels qui brillent en Rétro, des points d'écran de console en LCD, des tubes de lumière en Néon, des crayons de couleur en Croquis, l'encre du Manga, des formes douces en Moderne. Avec le visage du pack comme avec le visage vivant. Il cligne des yeux, regarde partout et joue toutes ses humeurs ; ses yeux d'humeur passent avant (les cœurs quand il est amoureux, les étoiles quand il est excité, les lunettes noires quand il est fier). Ce qu'il porte bouge avec lui, et ne cache jamais ses yeux, sa bouche ni la ligne d'infos.

**Les couleurs en Rétro et en LCD :** Rétro devient un écran à phosphore de couleur, tes couleurs brillent comme sur un vieil écran. LCD devient une console de poche en couleur, aux couleurs un peu plus sombres. Le réglage **Écran tout vert** (en Rétro et en LCD seulement) garde les verts de l'écran : ses couleurs et ses habits deviennent des verts plus ou moins clairs.

**Les tenues de saison** viennent toutes seules (réglage **Tenues de saison**, allumé au départ) :
- en hiver (de décembre à février) : un bonnet et une écharpe ;
- en juillet et en août, ou un jour de grand soleil à 25 °C ou plus : des lunettes de soleil, de 9 h à 20 h ;
- pour Halloween (du 24 au 31 octobre) : un chapeau de sorcière ou une citrouille, un jour sur deux ;
- pour Noël (du 20 au 26 décembre) : le bonnet de Père Noël, et aussi pendant ses scènes de neige ;
- le Nouvel An (31 décembre et 1er janvier), son anniversaire et le jour de votre rencontre (quand Pixel les connaît) : un chapeau de fête.

Quand une tenue arrive, il la montre : la neige pour le bonnet, des chauves-souris à Halloween, des confettis pour la fête, le soleil pour les lunettes.

**Ce que tu choisis passe avant.** La saison habille seulement les places vides : s'il porte son chapeau haut-de-forme, il le garde à Noël, avec l'écharpe de l'hiver. Si tu lui enlèves son bonnet d'hiver (`enlève ton bonnet`), il reste sans bonnet jusqu'au lendemain. Pas de lunettes de soleil par-dessus ses lunettes.

**La nuit** (réglage **Pyjama la nuit**, allumé au départ) : quand il dort, il met son bonnet de nuit et son pyjama (« C'est l'heure du pyjama ! »), et les enlève le matin (« Debout ! »). Ses lunettes de soleil et son casque restent sur la table de nuit, sa moustache reste. Il dort quand Pixel connaît ses habitudes de sommeil et qu'elles le disent ; sinon, pendant ses heures calmes (son caractère : de 23 h à 6 h au départ). Un chapeau mis la nuit attend le matin : « Je le mettrai demain ! ».

**En tapant :** `mets ton chapeau`, `enlève ton chapeau`, `enlève tout`, `yeux de chat`, `yeux en cœur`, `yeux bleus`, `joues roses`, `arc-en-ciel`, `mets tes lunettes`, `look normal`, `remets comme avant`, `habille-toi pour l'hiver` (ou pour l'été, Halloween, Noël, la fête, dormir). `look ?` dit comment il est. Une phrase qui ne change rien (`mets ton chapeau` quand il l'a déjà) ou une autre phrase (`j'aime ton chapeau`) part à Claude, comme avant. Ces mots marchent aussi sans Pi et dans Pixel Lab.

**Avec Claude :** il sait comment il est quand il lit l'état de Pixel, et il peut changer son look : « mets ta couronne », « fais-toi des yeux de chat verts ».

**Partout pareil :** le Pi garde son look au redémarrage (fichier `look.json` dans le dossier de données ; un fichier abîmé redonne le look de tous les jours). L'écran du Pi, ton téléphone, le Pixel de poche et son jumeau portent le même. Sans Pi, le téléphone garde le sien, en partant de celui du Pi ; relié au Pi, il reprend celui du Pi. Pour les autres pages : `window.PixelLook.get()` (son look et ce qu'il porte), `with(look, fn)` (dessiner avec un autre look) et `clean(look)`.

**Rapide :** sans look, son dessin coûte exactement pareil qu'avant. Ce qu'il porte est dessiné une fois par thème et par taille, puis recopié. Avec une tenue complète (yeux de chat arc-en-ciel, joues roses, chapeau, nœud, casque, moustache), une image coûte de 0,05 à 1,4 ms de plus sur un ordinateur, selon le thème. Pas encore mesuré sur le vrai Pi 4.

Dans Pixel Lab, le panneau **Son look** fait la même chose ; il fait aussi semblant d'être un autre jour (Halloween, Noël, le Nouvel An, l'hiver, l'été, son anniversaire) ou la nuit, et passe en revue tous les yeux et tous les accessoires.

**Ses fichiers :** `pixel/look.py` (les règles, les actions, les commandes, l'outil de Claude, `look.json`), `web/look.js` et `web/look.css` (les mêmes règles, le dessin dans les 6 thèmes, le panneau du téléphone), `web/scenes/look.js` (ses réactions), `web/lab/look-lab.js` (le panneau de Pixel Lab). Le pack de 52 animations a deux petits crochets (`pack52/pixel52.js`, `pack52/pixel52-themes.js`) : sans look, ils ne font rien.

Pour relancer ses tests :

```
python3 tests/test_look.py        # son serveur de démo sur le port 8406 (LOOK_PY_PORT=… pour un autre)
node tests/test_look.js           # port 8405 (LOOK_PORT=… pour un autre) ; il faut Playwright ; --shots DOSSIER pour les captures
```
<!-- fin de son look -->

<!-- souvenirs -->
## Ses souvenirs, l'album et le carnet d'humeur

Pixel se souvient de toi. Il retient ton anniversaire et le jour de votre rencontre, garde tes records, prend des photos de ses meilleurs moments et, si tu veux, te demande chaque jour comment tu vas.

**Sur ton téléphone**, sous les touches : **Souvenirs** et **Album** ouvrent le même panneau, avec trois onglets. Dans l'appli Android, le menu (bouton retour) les ouvre aussi.

| Onglet | Ce qu'il y a |
| --- | --- |
| **Souvenirs** | ton anniversaire (le jour et le mois, jamais l'année), le jour de votre rencontre (le premier démarrage de Pixel, que tu peux changer), tes records, et vos souvenirs du plus récent au plus ancien : tu peux en ajouter un, l'épingler 📌 pour qu'il reste toujours, ou l'effacer. |
| **Carnet** | « Comment tu vas aujourd'hui ? » avec 5 têtes (Super, Bien, Bof, Triste, En colère) et, si tu veux, pourquoi (école, copains, famille, fatigue, sport, jeux, dehors, animaux) ; ta semaine et ton mois, une couleur par humeur ; ses réglages. |
| **Album** | **Prends une photo !**, toutes ses photos, chacune en grand (touche-la), ★ pour tes préférées, **Enregistrer** et **Supprimer**. |

**Ton anniversaire :** dis-le dans le panneau, ou tape `mon anniversaire c'est le 12 mars` (`je suis né le 1er mai`, `je suis née le 29 février`… marchent aussi). S'il ne le connaît pas, Pixel te le demande une fois, gentiment, quand tu es là : « C'est quand ton anniversaire ? ». Touche **Je te dis !**, puis le mois et le jour, ou **Plus tard** : il ne redemande jamais. Le jour venu, quand tu es devant lui, il fait la fête : un gâteau avec ses bougies, des confettis, des fanions et « Joyeux anniversaire, Léa ! » (avec le surnom que tu as choisi dans **Caractère**), puis il prend une photo de la fête. Né un 29 février ? Les autres années, c'est le 28 février. **Refaire la fête**, dans le panneau, la rejoue.

**Le jour de votre rencontre :** chaque mois, ce jour-là, « Ça fait 3 mois qu'on se connaît ! » (le 31 janvier devient le 28 février, puis le 31 mars). Chaque année, une vraie fête. Et à 100, 200, 300, 500 ou 1000 jours ensemble, il le remarque.

**Ses souvenirs :** ta meilleure série aux exos, ton record au défi chrono, tes trophées, son tout premier repas avec toi, la première visite d'un ami deviennent des souvenirs (et un nouveau record a sa photo). De temps en temps, quand tu es là, il en parle : « Tu te souviens de ta série de 12 bonnes réponses ? », « Plus que 5 dodos avant ton anniversaire ! ». Jamais plus d'une fois toutes les 2 heures, 3 fois par jour au plus, et jamais la nuit. Tape `tu te souviens ?` pour qu'il en raconte un. Il garde 200 souvenirs : les plus anciens s'en vont, jamais ceux que tu épingles.

**L'album :** tape `prends une photo` (ou touche **Prends une photo !**, ou demande-le à Claude) : il prend la pose (« Cheese ! »), flash, « Clic ! ». Il prend aussi des photos tout seul pour ses grands moments : ta fête d'anniversaire, un record, un trophée (et ceux des autres fonctions : une visite, un nouveau look…). Tape `montre l'album` : ses photos défilent sur son écran, comme des photos polaroïd, et l'album s'ouvre sur le téléphone où tu l'as tapé. 60 photos au plus : les plus anciennes s'en vont, jamais tes préférées (★, 30 au plus).
- seul l'écran du Pi prend les photos : une copie de son écran, en 800 × 480, de moins de 120 Ko ;
- jamais pendant un cast (rien de ce que tu envoies sur son écran n'est copié), seulement sur son visage, sans la ligne d'infos ni les bandeaux (ni ton agenda ni tes notifications sur les photos) ;
- elles restent sur le Pi, dans `~/.config/pixel/album/`, et ne s'ouvrent qu'avec le code d'accès, comme le reste.

**Le carnet d'humeur :** une fois par jour, à partir de 17 h (réglable, de 7 h à 20 h 30), dès le lendemain de votre rencontre, quand tu es devant lui, il te demande « Comment tu vas aujourd'hui ? », avec 5 grosses têtes sur son écran et dans le panneau. Il réagit avec gentillesse : il saute de joie pour une super journée ; pour une journée triste, il te fait un câlin (« Oh… je suis là. ») ; en colère, il respire avec toi. Jamais de leçon. Le lendemain, il y repense : « Hier, tu étais triste… Ça va mieux ? ». Tu peux aussi taper `je suis content`, `je suis contente`, `je suis triste`, `je suis fatigué`, `je suis en colère`… Il ne demande jamais la nuit (ni après 21 h, ni dans ses heures calmes, ni quand il dort) ; **Plus tard** ou pas de réponse : il redemande une seule fois, une heure après au moins.
- **Ton carnet est privé.** Il reste sur Pixel, dans `~/.config/pixel/humeur.json` (sans Pi, sur ton téléphone) ; le téléphone relié au Pi ne le garde pas. Claude ne le voit jamais, sauf si tu allumes **Claude peut savoir comment je vais** (éteint au départ). **Effacer le carnet** efface tout.

**Sur l'écran du Pi, une chose à la fois :** le menu rapide, puis ce que tu castes (rien de tout ça ne s'affiche ni ne répond par-dessus, et pas de photo), un exo ouvert et sa question « Une petite question ? », puis l'album qui défile, la date d'anniversaire à choisir, sa question « Comment tu vas ? », et enfin l'assiette des repas, qui se range. Il ne propose pas d'exo pendant qu'il te pose sa question, et ne fait pas la fête par-dessus un exo.

**Son caractère** (celui du jour, avec l'humeur du jour) s'y voit aussi : bavard, il parle plus souvent de vos souvenirs (taiseux, moins) ; câlin, il fait un énorme câlin les jours tristes (indépendant : « Je suis là, si tu as besoin. ») ; farceur, il fait une grimace pour la photo (sérieux : il se tient bien droit) ; énergique, il saute plus haut à ta fête ; grognon, il demande « Bon… et toi, ça va aujourd'hui ? ». À 50 partout, rien ne change.

**Avec Claude :** quand il lit l'état de Pixel, il connaît ton anniversaire, le jour de votre rencontre et tes records (ton humeur, seulement si tu le permets). Il peut retenir ton anniversaire, prendre une photo, et noter ton humeur si tu le lui dis et que tu l'as permis.

**Les autres fonctions** ajoutent leurs moments : `souvenirs.ajoute {type, texte, t}` (un souvenir, vérifié et limité) et, sur l'écran du Pi, `PixelAlbum.snap('ami')` (une photo). Elles lisent `souvenirs.fete` (`'anniversaire'`, `'rencontre'` ou rien) pour fêter avec lui.

**Sans Pi**, tout marche aussi sur le téléphone : ses souvenirs, le carnet, et l'album, gardé sur le téléphone (24 photos plus petites, en 640 × 384). Dans Pixel Lab, le panneau **Souvenirs** fait la fête, prend des photos (gardées dans la page), pose sa question et rejoue chaque réaction.

**Ses fichiers :** `pixel/souvenirs.py` (ses souvenirs et le carnet, gardés dans `souvenirs.json` et `humeur.json` ; un fichier abîmé ne bloque jamais le démarrage), `pixel/album.py` (les photos, `POST /api/album` et `GET /album/…`), `web/scenes/souvenirs.js` (ses scènes), `web/souvenirs.js` et `web/souvenirs.css` (son écran, le panneau du téléphone, les mêmes règles pour Pixel Lab et sans Pi), `web/album.js` (la prise des photos), `web/lab/souvenirs-lab.js` (le panneau de Pixel Lab).
<!-- fin des souvenirs -->

<!-- amis de Pixel -->
## Les amis de Pixel

Ton Pixel peut **rendre visite au Pixel d'un copain**, d'une maison à l'autre, comme le Pixel de poche part dans ton téléphone. Il sort de ton écran avec sa valise, arrive sur l'écran de son ami, à côté de lui, et ils jouent environ 3 minutes : bonjour, danse, « tape là », course, goûter, cache-cache, blague, bavardage, photo souvenir, et dodo côte à côte s'il est tard. Puis il rentre et te raconte : « J'ai joué avec Bip ! On a dansé, et on a fait la course ! » Le mode d'emploi complet, pour les parents aussi : [`docs/AMIS.md`](docs/AMIS.md).

**Devenir amis :** sur ton téléphone, **Amis** sous les touches ouvre **Ses amis**. **Créer mon code** donne un code d'ami : trois mots et un nombre (`lapin · soleil · tarte · 4271`), avec un QR code, valable 24 h et une seule fois. Ton copain le tape sur son Pixel (**Ajouter un ami**, ou `ajoute l'ami lapin soleil tarte 4271`) : les deux Pixels font la fête, ils sont amis. Un mot mal tapé est signalé tout de suite, avec le bon mot.

**Ensuite :** **Va le voir** (ou `va voir Bip`), **Coucou** (`dis coucou à Bip`), un des 12 **autocollants** (`envoie un cœur à Bip`), **Retirer** (les deux Pixels oublient l'amitié). Pendant qu'il est parti, ton écran montre une petite maison « Chez Bip », le temps qu'il reste et **Rappelle-le**. S'il ne trouve personne, il revient et dit pourquoi (« Bip n'a pas répondu… il doit dormir »). Tape `mes amis` pour la liste, `mon code d'ami` pour l'afficher en grand sur l'écran de Pixel. Claude peut lister ses amis, l'envoyer en visite et faire coucou (outil `pixel_friends`), jamais ajouter un ami ni écrire.

**Chez toi :** un ami entre, ton Pixel se pousse à gauche, ils jouent, chacun son nom dessous, le visiteur avec son propre look dans les couleurs de ton thème. Touche-le : il rigole. Personne ne vient pendant la nuit (ses heures calmes), pendant un cast ou un exo. Sur l'écran du Pi, une chose à la fois : ce que tu castes, le menu rapide et un exo ouvert passent devant une visite, qui attend dessous ; l'assiette et les questions de maths attendent la fin de la visite.

**Les parents :** **Accepter les visites**, **Me demander avant** (« Bip veut venir jouer ! » : **Non merci** / **Oui !** sur l'écran ou le téléphone) et l'interrupteur **Amis**, qui coupe tout. Verrou sur le Pi : `enabled = false` dans `[amis]` de `config.toml`. Le journal garde les 30 dernières choses. Seuls les Pixels qui ont échangé un code se joignent ; aucun texte libre, aucune photo, aucune position, aucun prénom ne passe entre deux maisons : seulement le nom des Pixels, des coucous, 12 autocollants et les visites. 20 amis au plus, et tout est limité (coucous, messages par jour, une visite à la fois).

**Sans serveur à nous, sans rien ouvrir sur ta box :** les Pixels se parlent par un relais compatible ntfy (ntfy.sh au départ, ou le tien : `relay = "…"` dans `[amis]`). Tant que ton Pixel n'a pas d'ami, il ne le contacte même pas. Tout ce qui y passe est chiffré de bout en bout (AES-GCM ; clés tirées d'un échange X25519 et du code, étiré par scrypt puis HKDF ; le code ne voyage jamais) et signé ; un message modifié, rejoué, trop vieux ou pas pour lui est jeté. Il faut le paquet Python `cryptography` (installé par `deploy/install.sh`). Gardé sur le Pi dans `~/.config/pixel/amis.json` (lisible par toi seul : il contient les clés).

**Sans Pi**, l'appli Android n'a pas encore d'amis (ils vivent sur le Pi). **Dans Pixel Lab**, le panneau **Les amis** a un ami de démo, **Bip**, joué par la page : fais-le venir, envoie Pixel chez lui, joue chaque scène à deux.

**Vérifié** (`test_amis.py`, `test_amis.js`, avec un faux relais, jamais ntfy.sh) : les codes (40 bits, tapés n'importe comment, une faute signalée), la boîte chiffrée (un bit changé, un autre sujet, une autre clé : refusé), aucune connexion sans ami, deux serveurs qui deviennent amis sans qu'un seul mot passe en clair dans le relais, un code utilisé une fois, les messages rejoués (même après un redémarrage), trop vieux, du futur, renvoyés à leur auteur ou pour un autre : refusés ; les limites (un flot de messages jeté avant d'être lu, les coucous, le compte du jour) ; les visites dans les deux sens, leur programme et les souvenirs ; les refus (il dort : `habitudes` ou ses heures calmes, cast, exo, visites fermées) ; « Me demander avant » (oui, non, pas de réponse) ; « Rappelle-le » ; partir en même temps ; un relais qui coupe, ne répond plus ou refuse ; le Pi d'un ami éteint ; retirer un ami (les deux oublient) ; l'interrupteur des parents ; `amis.json` (0600, cassé : mis de côté) ; les commandes et l'outil de Claude. Dans Chromium, deux serveurs de démo : devenir amis depuis les deux téléphones (390 × 844), la visite sur l'écran de l'hôte (800 × 480) dans plusieurs thèmes, un cast et un exo par-dessus, la maison « Chez Bip » et le retour qui raconte, « Me demander avant » et « Rappelle-le » au doigt, l'ami de démo de Pixel Lab.

```
python3 tests/test_amis.py           # le faux relais sur le port 8460 (AMIS_PY_PORT=… pour un autre)
node tests/test_amis.js              # faux relais 8461, serveurs 8462 et 8463 (AMIS_RELAY_PORT, AMIS_A_PORT, AMIS_B_PORT) ; --shots DOSSIER
```
<!-- fin des amis de Pixel -->

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

## Tester les animations : Pixel Lab

Le labo d'essai : chaque thème, chaque humeur, les 10 écrans et tous les événements (notification, Claude, Codex, minuteur, veille, démarrage…), avec ralenti, pause et un test du vrai écran 7 pouces (couleurs, bords, toucher, images par seconde). Il est dessiné par le vrai code de Pixel, avec de fausses données. Ses panneaux **Personnalité**, **Caractère**, **Nourrir** et **Exos de maths** se suivent : tout ce qui fait son caractère au même endroit.

- **Sur ton ordinateur :** lance le mode démo ci-dessus, puis ouvre <http://localhost:8080/lab>.
- **Sur le Pi, en plein écran :** `chromium-browser --kiosk "http://localhost:8080/lab?kiosk=1"`. Appuie 1 seconde sur l'écran pour ouvrir le menu.

Tout est expliqué dans [web/lab/README.md](web/lab/README.md).

## Économie d'images

Pixel ne redessine son écran 60 fois par seconde que quand ça bouge vite : quand tu le touches (et 2,5 secondes après), quand l'écran ou le thème change, pendant un bandeau et pendant les animations rapides. Le reste du temps :

| Quoi | Images par seconde |
| --- | --- |
| Visage en Moderne, Manga, Néon, Croquis : animations d'attente | 30 |
| Visage en Rétro et LCD (ton pack y est dessiné à 20 images par seconde) | 24 |
| Météo, Claude au repos, Codex au travail, minuteur lancé | 20 à 30 |
| Veille | 15 |
| Écrans immobiles : Agenda, Réglages, Système, Lumières… (20 en Néon et Moderne, dont le décor bouge) | 10 |

Une nouvelle info du serveur s'affiche tout de suite. Mesuré dans Chromium, sur un PC : le processeur utilisé pour l'affichage baisse de 40 à 70 % selon l'écran. Sur le Pi, il chauffe moins et laisse plus de place à Claude et Codex.

Pour tout repasser à 60 images par seconde, ajoute `&fps=full` à l'adresse de l'écran (`http://localhost:8080/?kiosk=1&fps=full` dans `deploy/kiosk.sh`). Dans Pixel Lab, c'est le bouton **Économie d'images**.

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

   **Ou ton abonnement Claude** (Pro ou Max), sans clé API :
   1. Sur n'importe quel ordinateur où Claude Code est installé (sur le Pi : `curl -fsSL https://claude.ai/install.sh | bash`), lance `claude setup-token`. Connecte-toi dans le navigateur. Il affiche un jeton valable un an.
   2. Écris-le dans `/etc/pixel.env` sur une ligne `CLAUDE_CODE_OAUTH_TOKEN=...`, sans espace : un jeton affiché sur plusieurs lignes se copie parfois avec des espaces.
   3. Relance `sh deploy/install.sh`. Le script ajoute le SDK Claude Agent, environ 400 Mo.

   Pixel prend l'abonnement quand il trouve ce jeton et pas de clé API. Pour choisir toi-même, mets `backend = "abonnement"` ou `backend = "api"` dans `[claude]` de `config.toml`.

   Avec l'abonnement, ses réponses comptent dans les mêmes limites que claude.ai et Claude Code. Pixel bâille quand le quota est épuisé et te dit à quelle heure il revient. Garde son code d'accès pour toi : si quelqu'un d'autre lui parle, c'est ton abonnement qui répond.
2. **Tes réglages :** ouvre `config.toml` pour indiquer ta ville et le dossier de projet de Codex. Tes agendas s'ajoutent depuis ton téléphone (voir « Tes agendas »).
3. **Codex :** installe-le (`npm i -g @openai/codex`), puis connecte-toi une fois (`codex login`). Ou mets `OPENAI_API_KEY=...` dans `/etc/pixel.env`. La commande lancée se règle dans `[codex] command` de `config.toml`. Tu peux y mettre Claude Code à la place.
4. **Hue :** sur Pixel, ouvre **Réglages**, touche **Associer Hue**, puis appuie sur le bouton du pont dans les 30 secondes.
5. Redémarre : `sudo reboot`.

## Coût

L'appli est gratuite. Les réponses de Claude sont facturées à l'usage sur ton compte API Anthropic. Le modèle est Claude Opus 5.5 avec un effort bas (`effort = "low"`), pour des réponses rapides et courtes. Si Claude refuse une demande pour raison de sécurité, l'API réessaie toute seule avec un autre modèle.

Avec ton abonnement Claude, rien n'est facturé en plus : les réponses comptent dans ton quota. Le modèle est alors Claude Sonnet 5.5 (`abonnement_model`), plus léger qu'Opus, pour que ton quota dure plus longtemps. Pixel envoie sa consigne courte et ses propres outils seulement, soit environ 400 jetons par message.

## Vérifications faites

Testé sur ordinateur, avec les tests du dossier `tests/` :
- **Commandes et accès** (`test_pixel.py`) : lampes, scènes, minuteur, écrans, Claude et Codex en démo, refus d'un appareil sans code d'accès. Chaque thème : choix dans Réglages, touches *Thème −* et *Thème +*, commande `thème …`, choix gardé après un redémarrage (avec les 6 thèmes activés). Sans réglage `themes` : Rétro seul, les autres refusés avec un message, pas de touches de thème, pas d'outil de thème pour Claude. Chaque humeur avec `humeur …`.
- **Données réelles** (`test_real.py`) : la vraie météo d'Open-Meteo, un agenda iCal avec un événement sur la journée et un événement répété, et les 15 touches du Stream Deck dessinées dans chaque thème.
- **Agendas** (`test_agenda.py`) : un agenda Google (heure de Paris, événement répété, vacances sur plusieurs jours, soirée après minuit, événement annulé), un fichier Samsung .vcs importé puis réimporté, un rendez-vous présent dans deux agendas affiché une seule fois, les erreurs (404, page web, pas d'internet), le fichier privé, et l'adresse secrète qui n'arrive jamais sur les écrans.
- **Pixel Lab** : 140 vérifications dans Chromium, sur ordinateur, téléphone et en plein écran 800 × 480.
- **Les amis de Pixel** (`test_amis.py`, `test_amis.js`, un faux relais ntfy, jamais ntfy.sh) : le détail est à la fin de « Les amis de Pixel ».
- **Caster** (`test_cast.py`, `test_cast.js`) :
  - les photos, GIF et vidéos sont reconnus à leurs premiers octets, jamais à leur nom : PNG, JPEG, GIF, WebP, MP4 (et le .mov de l'iPhone), WebM. Le HTML déguisé en .png, le HEIC, le Matroska et un fichier vide sont refusés.
  - la limite de taille marche, même sans taille annoncée ; rien n'est gardé d'un envoi refusé ; un nom avec `../` donne un nom au hasard dans `cast/`. Seuls les 3 derniers fichiers restent.
  - les liens sont classés par leur adresse seule : le serveur n'en ouvre aucun. YouTube et Vimeo, les images, les vidéos et les pages (carte avec un QR code) sont reconnus.
  - la fin toute seule, l'arrêt, « encore », les couleurs, la fin d'une vidéo, un écran qui s'ouvre, les commandes `caste` et `stop`, et le partage Android (`/share`, puis retour à l'appli).
  - l'accès : un appareil sans code est refusé, et une page d'un autre site affichée sur le Pi aussi (un lecteur vidéo, un cadre « sandbox » qui arrive avec `Origin: null`, un autre nom qui mène au Pi) ; avec le code (`?t=`, en-tête, cookie), c'est bon.
  - chaque sorte de cast se dessine dans les 6 thèmes, avec les deux visages, sous le menu. La vidéo tourne à 60 images par seconde, avec le son sur Pixel seulement. L'écran d'avant revient à la fin.
- **YouTube** (`test_youtube.py`, `test_youtube.js`, `test_youtube_e2e.js`, `test_youtube_lab.js`) : les liens (42 cas, les mêmes pour le serveur et l'écran), la télécommande du téléphone, la fin, les erreurs (150, 153, pas d'Internet), le module de l'appli YouTube remplacé par un faux (lancé, relancé après un plantage, arrêté avec le serveur, refusé sans son code ou depuis une page), et tout cela dans Chromium avec un faux lecteur YouTube, sans Internet.
- **Partage d'écran** (`test_ecran.py`, `test_ecran.js`, `test_ecran_web.js`, `test_airplay.py`) :
  - pendant un cast, dans les 6 thèmes : pas de couche cathodique, pas de lignes, pas de teinte, l'image sur du noir ; tout revient à la fin. Dans Chromium, les couleurs d'une mire partagée arrivent telles quelles sur l'écran de Pixel ;
  - le code à usage unique (6 chiffres, 5 essais, espacés), rien n'est relayé sans lui ; trop de codes faux bloquent cet appareil seulement, jamais le code de l'appli ; seul l'écran de Pixel reçoit ; une page d'un autre site ne peut pas se connecter, ni un cadre « sandbox », ni un autre nom qui mène à Pixel (dans Chromium aussi) ; quelques connexions sans code par appareil, vite fermées, et l'écran de Pixel passe toujours ; l'offre, la réponse et les candidats ICE sont relayés sans rien d'autre ;
  - un vrai partage WebRTC entre deux pages, puis chaque façon de l'arrêter (l'ordinateur, le téléphone, l'écran de Pixel, un autre écran, un autre cast, la page fermée) ; le lanceur téléchargé, ouvert depuis le disque ; ScreenStream (un faux flux MJPEG) chargé par l'écran de Pixel, jamais par le serveur ;
  - UxPlay : ses lignes (le code, la connexion, la recopie, une vidéo YouTube, la fin), et un faux uxplay lancé (avec `-nofreeze`), relancé après un plantage ou un iPhone perdu, renvoyé quand on arrête sur Pixel.
- **Claude** (`test_claude_loop.py`) : la boucle a tourné face à un faux serveur d'API. Claude règle le salon, change de thème et d'humeur, et un thème inconnu est refusé.
- **Claude avec l'abonnement** (`test_abonnement.py`) : face à un faux SDK Claude Agent. Le test vérifie :
  - le choix entre clé API et abonnement, et le démarrage seulement au premier message ;
  - la consigne de Pixel, aucun outil de Claude Code, les outils de Pixel autorisés (une entrée fausse est refusée) ;
  - la réponse affichée une seule fois, la conversation gardée puis effacée ;
  - l'alerte de quota, le quota épuisé (« je reviens demain à 9 h 00 », sans redemander à Claude), le jeton refusé, et Claude Code qui s'arrête.

  Sur le vrai Pi, avec un vrai abonnement, le premier message a pris 8,5 s : démarrage du SDK, puis l'outil `play_scene` pour faire le poisson. Les messages suivants prennent environ 3 s. Claude Code occupe environ 200 Mo de mémoire.
- **Visage vivant** (`test_life.js`) : clignements, regards, bâillements, étirements, réactions au toucher, et chaque thème dessine chaque humeur et chaque passage d'une humeur à l'autre sans erreur.
- **Animations** (`test_pack.js`) : chaque thème dessine les 52 animations à plusieurs moments, avec les deux visages et les passages de l'une à l'autre. Les humeurs, l'attente tirée au sort, le toucher et les événements jouent les bonnes animations. `test_pixel.py` vérifie aussi `anim.play`, les commandes `anim …`, la touche *Anim +* et le choix du visage après un redémarrage.
- **Personnalité** (`test_persona.js`) : les 63 scènes se dessinent dans les 6 thèmes avec les deux visages, et Pixel finit chaque scène à sa place. Le test vérifie aussi :
  - le rappel 10 min avant un rendez-vous (une seule fois) et la question après ; le Pi trop chaud (pas en boucle) ; le Wi-Fi perdu puis retrouvé ;
  - la neige seulement en décembre, « Plus que 17 dodos avant Noël ! », le bonnet dans chaque thème, « Joyeux Noël » une fois par jour, « Bonne année » ;
  - sa voix (`son.js`, avec un faux WebAudio) : une musique pour chaque sorte de scène, un babillage quand il parle, rien à 0 % ni sur un téléphone ;
  - les endroits du visage, et la colère qui monte, la bouderie, le pardon, les câlins ;
  - les retours (20 min, 2 h, le matin, le soir, la sieste) ;
  - les moments de vie : jamais quand le visage est occupé, jamais deux fois de suite, la pluie seulement quand il pleut, le calme la nuit ;
  - les lumières, une scène demandée par le serveur, et les 60 images par seconde quand il bouge.

  `test_pixel.py` vérifie `scene.play`, les commandes `fais …` et `scènes`, et l'outil de Claude.
- **Pixel de poche** (`test_poche.js`, dans Chromium) : en paysage, sur un Pixel 7 et un iPhone 14 simulés, il s'affiche en plein écran, net et sans erreur dans les 6 thèmes ; l'écran reste allumé ; une tape le fait réagir, un appui long le câline ; secoué, penché, sa batterie, le Pi arrêté puis relancé (et la page rechargée sans le Pi), la sortie de la poche ; en portrait, la télécommande revient ; ni un écran partagé, ni le clavier, ni un aller-retour rapide ne le font apparaître. L'iPhone est imité dans Chromium (pas de plein écran, la permission des mouvements seulement sur une touche, ses axes à l'envers, `window.orientation`). Une adresse en http sans aucune imitation : il vit sans les sens du téléphone et le dit ; dans l'appli Android, il lui demande de garder l'écran allumé. L'appli 1.1, imitée : elle apprend quand il est là (`{poche: true}`, puis `false`), et ses sens à elle le font tourner, pencher, réclamer le chargeur. À côté, l'écran du Pi : le Pixel jaloux, le jumeau qui remarque, le voyage aller et retour. Et le cadre de Pixel Lab. `test_poche.py` vérifie les actions `poche.touch` et `poche.voyage` du serveur.
- **Notifications du téléphone** (`test_telephone.py`) : `POST /api/notif`, ce que l'appli Android envoie. Le Pi lui-même passe sans code, mais pas une page d'un autre site sur son écran. Un autre appareil passe avec le code d'accès, en en-tête `X-Pixel-Token` ou en `?t=`. Le test vérifie aussi :
  - les refus : pas du JSON, illisible, sans nom d'appli, trop long ;
  - les noms et les titres coupés proprement ;
  - les limites, par appli et par minute ;
  - le bandeau (« 📱 WhatsApp : Maman », « 📱 Nouveau message WhatsApp ») qui fait jouer ses scènes de notification ;
  - `telephone.last` dans l'état partagé, sans jamais le titre.
- **Pixel sans Pi** (`test_local.js`, dans Chromium) : le fichier hors ligne de l'appli, ouvert en `file://` sans aucun accès au réseau, sur un téléphone en portrait puis en paysage. Aucune erreur, aucune requête, aucun WebSocket. Il vit et réagit au doigt ; aucune fausse donnée ; les écrans du Pi le disent et leurs touches restent éteintes, les commandes aussi ; Système montre le téléphone, et son Démarrage les pièces du téléphone ; les six thèmes ; le minuteur sonne. Après un rechargement, les réglages, l'humeur et le minuteur sont toujours là, et l'état d'une nouvelle fonction aussi, même gardé dans une variable à elle. Dans l'appli (simulée) : les messages vers l'appli, son état rendu par l'appli, l'image du Pi, la plus récente qui gagne, même quand elle arrive après la météo. La météo, avec et sans réseau, une faute de frappe, une ville tapée pendant que la météo d'une autre arrive. Une notification du téléphone passée par l'appli : le même bandeau que sur le Pi, et il réagit. Son caractère, ses repas et ses exos : repris de l'image du Pi (sa forme à lui), utilisés, gardés après un redémarrage ; son ventre après deux jours appli fermée (au pire un petit creux) ; le message `{panels}` et les panneaux ouverts depuis le menu de l'appli, même en mode Pixel ; le bouton retour qui ferme d'abord le panneau du dessus (`{sheet}`) ; un panneau touché ou un exo ouvert qui retiennent l'appli sur le téléphone ; une image du Pi pas plus récente que la copie du téléphone qui ne défait rien de ce qu'il a vécu ; rien du Pi à lui seul (`telephone`) gardé sur le téléphone. Le Pixel de poche, sans bouton de voyage, avec les sens de l'appli (secoué, il a le tournis), son assiette et son plateau.
- **Caractère** (`test_caractere.py`, `test_caractere.js`) : les 15 caractères, les valeurs bornées et nettoyées (même 1e400 ou Infinity), le fichier gardé (même abîmé : le serveur démarre toujours), les commandes (et les phrases qui partent toujours à Claude, comme « parle-moi » ou « tu t'appelles vraiment Pixel »), l'outil et la consigne de Claude, la conversation gardée avec l'abonnement, les mêmes règles dans Pixel Lab, des noms de scènes qui ne prennent pas ceux des autres paquets. À 50 partout, exactement les mêmes scènes et les mêmes phrases, pour le même tirage au sort, que sans caractère dans l'état du serveur et que sans `caractere.js` du tout (et qu'avant la fonction, git 36422fd, la branche principale juste avant son arrivée : comparaison notée, qui compte avec `CARACTERE_STRICT=1`). Sur des centaines d'essais : un Pixel grognon s'énerve et boude plus (et plus longtemps), un câlin devient plus vite amoureux, un indépendant repousse les câlins, un bavard parle plus et un taiseux bien moins, un énergique vit plus souvent et plus vite, un blasé laisse passer des notifications ; mais quel que soit son caractère, ce que tu fais pour lui a toujours sa réponse, et « Il parle » éteint garde les rappels. Aussi : les heures calmes, son nom et ton surnom dans ses phrases (le même nom sur le Pi et sur les écrans, accents et signes des voyelles gardés), sa réaction à chaque changement, le panneau du téléphone (qui s'efface devant le Pixel de poche), l'écran du Pi et le panneau de Pixel Lab.
- **Exos de maths** (`test_exos.py`, `test_exos.js`) : chaque type d'exo à chaque niveau (9 000 exercices) a sa bonne réponse parmi 4 choix différents, vérifiée en refaisant le calcul ; les erreurs classiques sont dans les choix ; la même graine donne le même exo. Le jeu, sur une fausse horloge : l'indice et le deuxième essai, la correction, une série, une table, le défi chrono, les niveaux qui montent, descendent ou restent fixes, l'objectif du jour, les trophées, l'exo oublié qui se range, le fichier `exos.json`. La réponse n'arrive jamais aux écrans avant que tu aies répondu. Un double appui, un écran en retard ou la même erreur deux fois ne coûtent jamais le deuxième essai ni ne répondent à la question suivante ; sa fête n'est pas coupée ; un `exos.json` abîmé ou d'une drôle de forme n'empêche pas Pixel de démarrer, et un réglage hors limites (1e999) n'y efface ni les scores ni les trophées ; une horloge qui recule ne fige ni le défi chrono ni la correction ; une réponse, une seule bannière (l'objectif et les trophées ensemble) ; chaque correction explique. Les commandes (un nombre seul ne va à l'exo que s'il y en a un d'ouvert, et jamais à Claude pendant la correction ; `4 025` ; `encore` et `une autre` seulement pendant ou juste après un exo) et l'outil de Claude. Dans Chromium : l'écran du Pi dans les 6 thèmes (un double appui sur une réponse fausse, puis la bonne, et ses réactions), chaque réponse touchée jusqu'à son bord droit, le clavier, l'indice en touchant Pixel, son petit rappel, une série rapide où chaque réponse a sa scène, le bilan d'une série, les images par seconde, aucun moment de vie pendant un exo, sa proposition et le bouton **Oui !** ; le panneau du téléphone (réponses, double appui, pavé et sa touche **−**, le chrono arrêté quand le panneau se ferme, réglages, scores) et la barre de commande ; dans Pixel Lab, les mêmes règles.
- **Les trois ensemble** (`test_perso.py`, `test_perso.js`) : les commandes de chacun vont au bon endroit (un nombre seul à l'exo ouvert seulement, les repas et le caractère pendant un exo), les trois outils de Claude côte à côte, sa consigne avec son caractère, l'état de Pixel avec son ventre et les exos du jour, jamais la réponse d'un exo ouvert ; gourmand, grognon et farceur (et l'humeur du jour) changent son ventre et ses repas, studieux ses questions et sa fête ; à 50, chaque scène des trois et du Pixel de poche pèse comme avant. Dans Chromium : sur l'écran du Pi, qui passe devant qui (le menu rapide, même par-dessus un vrai cast, le cast, un exo, sa question, le plateau ; sous un cast, l'exo attend, ni le doigt ni le clavier n'y répondent, il revient tel quel, et « Tu réfléchis ? » ne compte pas le temps passé dessous), un changement de caractère pendant un exo, en Rétro, LCD et Néon ; le Pixel de poche ; les trois boutons du téléphone et leurs panneaux ; dans Pixel Lab, les trois panneaux et les mêmes commandes que le serveur (une même liste de phrases d'exos, passée au serveur et à Pixel Lab, donne partout la même chose).
- **Son look** (`test_look.py`, `test_look.js`) : le catalogue, les valeurs nettoyées (une liste à la place d'un mot, un accessoire à la mauvaise place), chaque changement et ce qu'il montre, les saisons avec une fausse horloge (Halloween, Noël, le Nouvel An, l'hiver, l'été, un jour de grand soleil, son anniversaire), ce que tu choisis qui passe avant, la nuit (ses habitudes de sommeil simulées, ou ses heures calmes), `look.json` (même abîmé, ou une bombe JSON : le serveur démarre), « Remettre comme avant », 64 phrases tapées (et celles qui partent à Claude), l'outil de Claude, les mêmes règles dans `web/look.js`, cas par cas. Dans Chromium : chaque forme d'yeux et chaque accessoire dans les 6 thèmes, avec les deux visages, dessinés, qui suivent son visage (déplacé, qui saute, qui bouge dans le pack), jamais sur ses yeux ni sur la ligne d'infos ; les couleurs (phosphore en Rétro, console en LCD, tout vert, l'arc-en-ciel qui bouge) ; les saisons par date et le pyjama ; le panneau du téléphone à 390 × 844 (pas de défilement de côté, cibles de 56 px, l'écran du Pi qui change tout de suite), le menu de l'appli et son bouton retour, le Pixel de poche, Pixel Lab (les mêmes commandes que le Pi, pas à pas) et Pixel sans Pi.
- **Souvenirs, album et carnet** (`test_souvenirs.py`, `test_souvenirs.js`) : sur une horloge fixe, l'anniversaire (un 29 février, les années bissextiles ou pas), le prochain par-dessus le passage à la nouvelle année, les mois et les années de votre rencontre (un 31 janvier, un 29 février, de décembre à janvier), 100 jours ; les fichiers gardés au redémarrage, abîmés ou modifiés à la main (le serveur démarre toujours), le jour de votre rencontre lu sur le plus vieux fichier ; 200 souvenirs au plus (les épinglés restent) ; `souvenirs.ajoute` vérifié et limité ; ses records lus chez les exos et les repas ; quand il peut demander comment tu vas (son heure, jamais la nuit, ses heures calmes, quand il dort, deux fois par jour au plus), privé par défaut (ni la consigne, ni l'état, ni l'outil de Claude) ; les commandes et l'outil de Claude ; l'album : les octets vérifiés (JPEG, WebP fixe ; PNG, animation, image géante, faux type refusés), les limites de taille et de nombre (les ★ restent), l'accès (le code, ou la page de Pixel elle-même ; un autre appareil sans code, une page d'un autre site, un cadre « sandbox », un proxy : refusés), aucun chemin hors de l'album, un `album.json` abîmé reconstruit. Dans Chromium, avec l'écran du Pi et un téléphone : sa question quand tu es là, sur les deux, la réponse et son câlin ; la fête et sa photo (800 × 480, WebP, sans ligne d'infos ni bandeau) ; la photo prise sur le Pi qui arrive sur le téléphone, ★, la vue en grand, Enregistrer, Supprimer ; pas de photo pendant un cast ; le diaporama ; le panneau dans les 6 thèmes ; les mêmes commandes et les mêmes dates au serveur et dans Pixel Lab ; sans Pi, l'album sur le téléphone (IndexedDB), jamais dans l'état copié.
- **Affichage** (`shots.js`) : les 10 écrans, le démarrage, les 15 humeurs et douze animations s'affichent sans erreur dans les 6 thèmes, sur l'écran 800 × 480. Chaque thème tourne à 60 images par seconde dans Chromium sur ordinateur, même avec le processeur ralenti 4 fois, avec le visage du pack comme avec le visage vivant.

Pour les relancer :

```bash
python3 tests/test_pixel.py          # lance son propre serveur de démo sur le port 8102
python3 tests/test_real.py
python3 tests/test_claude_loop.py
python3 tests/test_abonnement.py
python3 tests/test_agenda.py         # ses agendas de test sur le port 8111 (AGENDA_PORT=… pour un autre)
node tests/test_life.js
node tests/test_pack.js
node tests/test_persona.js
python3 tests/test_poche.py          # son serveur de démo sur le port 8144 (POCHE_PY_PORT=… pour un autre)
node tests/test_poche.js             # il faut Playwright ; port 8143 (POCHE_PORT=…) ; --shots DOSSIER pour les captures
python3 tests/test_cast.py           # son propre serveur de démo sur le port 8104 (CAST_PY_PORT=… pour un autre)
node tests/test_cast.js
python3 tests/test_youtube.py        # ses serveurs de démo sur les ports 8164 et 8165 (YOUTUBE_PY_PORT, YOUTUBE_PY_PORT_OFF), avec un faux module YouTube
node tests/test_youtube.js
node tests/test_youtube_e2e.js       # Playwright : un serveur de démo sur le port 8166 (YOUTUBE_E2E_PORT), un faux lecteur YouTube
node tests/test_youtube_lab.js       # Playwright : Pixel Lab sur le port 8163 (YOUTUBE_LAB_PORT)
python3 tests/test_ecran.py          # son propre serveur de démo sur le port 8152 (et https sur 8158) ; ECRAN_PY_PORT, ECRAN_HTTPS_PORT, ECRAN_TRAP_PORT
node tests/test_ecran.js
node tests/test_ecran_web.js         # Playwright : son serveur sur le port 8153, un faux ScreenStream sur 8154 ; ECRAN_WEB_PORT, ECRAN_MJPEG_PORT, ECRAN_EVIL_PORT
python3 tests/test_airplay.py
python3 tests/test_telephone.py      # un serveur de démo sur le port 8146 (TELEPHONE_PORT)
node tests/test_local.js             # Pixel sans Pi ; il faut Playwright ; --shots DOSSIER pour les captures
python3 tests/test_caractere.py      # son propre serveur de démo sur le port 8163 (CARACTERE_PY_PORT pour un autre)
node tests/test_caractere.js         # il faut Playwright ; port 8164 (CARACTERE_PORT) ; --shots DOSSIER pour les captures
python3 tests/test_nourrir.py        # son propre serveur de démo sur le port 8174 (NOURRIR_PY_PORT=… pour un autre)
node tests/test_nourrir.js           # port 8175 (NOURRIR_PORT=… pour un autre) ; --shots DOSSIER pour les captures
python3 tests/test_exos.py           # son serveur de démo sur le port 8181 (EXOS_PY_PORT=… pour un autre)
node tests/test_exos.js              # port 8185 (EXOS_PORT=… pour un autre) ; --shots DOSSIER pour les captures
python3 tests/test_perso.py          # les trois ensemble, sans serveur
node tests/test_perso.js             # les trois ensemble : port 8192 (PERSO_PORT=… pour un autre) ; --shots DOSSIER pour les captures
python3 tests/test_look.py           # son look : son serveur de démo sur le port 8406 (LOOK_PY_PORT=… pour un autre)
node tests/test_look.js              # son look : port 8405 (LOOK_PORT=… pour un autre) ; --shots DOSSIER pour les captures
python3 tests/test_souvenirs.py      # souvenirs, album, carnet : son serveur de démo sur le port 8442 (SOUVENIRS_PY_PORT=… pour un autre)
node tests/test_souvenirs.js         # port 8443 (SOUVENIRS_PORT=… pour un autre) ; --shots DOSSIER pour les captures
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
| `pixel/` | un module par service : `hue`, `claude` (et `abonnement` : Claude par ton abonnement), `codex`, `weather`, `agenda`, `system`, `timer`, `deck` ; plus `cast` (caster sur l'écran), `youtube` et `ytcast` (YouTube, et le bouton Caster de l'appli YouTube), `ecran` (le partage d'écran : WebRTC, ScreenStream), `airplay` (UxPlay), `poche` (le Pixel de poche), `telephone` (les notifications du téléphone, par l'appli Android), `commands` (commandes tapées), `keys` (touches), `state` (état partagé), `anims` (les 52 animations) et `scenes` (ses moments de personnalité) |
| `web/` | l'interface : `themes.js` fait vivre le visage et dessine les 6 styles (fonds, visages, icônes, démarrage), `persona.js` sa personnalité (réactions, souvenirs, moments de vie), `son.js` sa voix (bips fabriqués par la page), `screens.js` les écrans, `app.js` la connexion, les touches et le clavier, `ecran.js` l'écran partagé, `poche.js` le Pixel de poche (le téléphone en paysage, ses scènes dans `scenes/poche.js`), `local.js` Pixel sans Pi (l'appli Android sans le Pi) |
| `pixel/caractere.py`, `web/caractere.js` | son caractère : les caractères tout prêts, les traits, son nom et ton surnom ; le panneau **Caractère** du téléphone (`caractere.css`) ; ses réactions dans `scenes/caractere.js` |
| `pixel/nourrir.py`, `web/nourrir.js` | le nourrir : son ventre, ses goûts, ses repas ; l'assiette et le plateau du Pi, le panneau **Nourrir** du téléphone (`nourrir.css`) ; le menu, ses dessins et ses scènes dans `scenes/nourrir.js` |
| `pixel/exos.py`, `web/exos.js` | les exos de maths : le générateur, le jeu et ses scores ; l'écran du Pi et le panneau **Exos** du téléphone (`exos.css`) ; ses réactions dans `scenes/exos.js` |
| `pixel/look.py`, `web/look.js` | son look : ses yeux, ses couleurs, ses accessoires, les tenues de saison et le pyjama ; le dessin dans les 6 thèmes et le panneau **Son look** du téléphone (`look.css`) ; ses réactions dans `scenes/look.js` |
| `pixel/souvenirs.py`, `pixel/album.py`, `web/souvenirs.js`, `web/album.js` | ses souvenirs, le carnet d'humeur et l'album photo : le serveur, son écran, le panneau **Souvenirs** du téléphone (`souvenirs.css`) ; ses scènes dans `scenes/souvenirs.js` |
| `pixel/amis.py`, `pixel/relais.py`, `web/amis.js` | les amis de Pixel : les codes d'ami, les amitiés et les visites ; le relais ntfy et la boîte chiffrée ; l'ami en visite sur l'écran du Pi et le panneau **Ses amis** du téléphone (`amis.css`) ; les scènes à deux, les autocollants dans `scenes/amis.js` ; le labo dans `lab/amis-lab.js` |
| `web/reglages.html` | la page **Agendas** du téléphone |
| `web/ecran.html`, `web/ecran.js` | le partage d'écran : la page **Partager mon écran** de l'ordinateur, et ce que reçoit l'écran de Pixel |
| `web/lab/` | Pixel Lab, le labo d'essai des thèmes et des animations |
| `web/pack52/` | ton pack de 52 animations : le moteur (`pixel52.js`), le dessin Moderne et Manga (`pixel52-themes.js`), la liste (`animations.json`) et le catalogue |
| `sidecar/ytcast/` | facultatif : le petit programme Node qui met Pixel dans le bouton Caster de l'appli YouTube |
| `docs/CAST.md` | caster sur Pixel : le mode d'emploi, le partage d'écran depuis chaque appareil, et les autres façons de caster sur un Raspberry Pi |
| `docs/AMIS.md` | les amis de Pixel : devenir amis, les visites, les réglages des parents, ce qui protège les enfants, ton propre relais, et comment c'est fait |
| `tests/` | les tests et les captures d'écran |
| `tools/` | `build_lab_artifact.py` fait du labo une seule page HTML, `build_app_bundle.py` fait de la page du téléphone le Pixel hors ligne de l'appli Android |
| `deploy/` | installation sur le Pi : script, service systemd, ouverture en plein écran, règles d'accès |
| `config.example.toml` | les réglages à copier en `config.toml` |

Les polices VT323, Fredoka, Bangers, Comic Neue, Audiowide, Chakra Petch, Patrick Hand, Caveat et Pixelify Sans sont sous licence SIL Open Font License (fichiers `web/*-OFL.txt`).
