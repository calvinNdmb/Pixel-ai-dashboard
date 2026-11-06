# Pixel (édition rétro)

Un petit PC beige des années 90… qui est en réalité un Raspberry Pi 4.

- **Le moniteur cathodique** contient un écran tactile **7"** (Freenove, 800 × 480). Il fait 142 mm de profondeur, avec de grandes grilles perforées comme un vrai tube.
- **Le boîtier de bureau** cache le Pi 4 et le haut-parleur. Sa façade a de **vrais boutons et de vrais voyants** : un bouton d'allumage lumineux, un bouton « Turbo », un voyant vert, un voyant orange et un voyant de notification multicolore.
- **Le clavier beige** contient le Stream Deck MK.2 : on sort son module de sa coque noire et on le met dans un clavier rétro imprimé. C'est réversible. Ses **3 petits voyants** sont de vraies lumières.

Il n'a aucune pièce mobile, et **un seul câble** sort : l'alimentation USB-C du Pi.

![Pixel rétro](preview.png)

L'écran affiche l'appli Pixel, avec ses trois thèmes (Rétro, Moderne, Manga) et ses menus pour Hue, Claude, Codex, la météo, l'agenda et le minuteur. Elle est dans [`pixel-app/`](../pixel-app/).

![Dedans](preview-inside.png)

## Pièces à imprimer

Elles sont toutes dans `stl/`, déjà posées dans le bon sens pour l'impression, **sans supports**. Imprime tout en PLA beige ou ivoire, sauf la petite barre des voyants du clavier. Le socle du clavier et le pied peuvent être d'un beige un peu plus foncé.

| Fichier | Taille (mm) | Sens d'impression |
| --- | --- | --- |
| `ScreenFitTest.stl` | 173 × 109 × 6 | **À imprimer en premier** (voir plus bas) |
| `PixelMonitorFront.stl` | 190 × 135 × 22 | face avant sur le plateau |
| `PixelMonitorBack.stl` | 180 × 128 × 126 | dos sur le plateau |
| `PixelStand.stl` | Ø 72 × 10 | à l'envers |
| `PixelCase.stl` | 200 × 160 × 64 | à l'envers (dessus sur le plateau) |
| `PixelCaseBottom.stl` | 195 × 155 × 7 | à plat |
| `PixelKeyboardTop.stl` | 136 × 96 × 8 | dessus du clavier, à l'envers. **À imprimer tôt** (voir plus bas) |
| `PixelKeyboardLeds.stl` | 22 × 5 × 2 | barre des 3 voyants du clavier, en **PLA translucide** (voir plus bas) |
| `PixelKeyboardBase.stl` | 136 × 94 × 34 | socle du clavier, à plat |
| `PixelStreamDeckTray.stl` | 136 × 94 × 21 | *option* : plateau pour un Stream Deck resté entier, à la place des deux pièces du clavier |

- **Imprimante :** tout tient sur une Bambu Lab P2S (plateau de 256 × 256 mm). La plus haute pièce est l'arrière du moniteur : 126 mm.
- **Réglages :** buse 0,4 mm, couches de 0,2 mm, 3 parois, 15 % de remplissage.
- **Filament :** environ **600 g** de beige (estimation), et quelques grammes de PLA translucide.
- **La barre des voyants du clavier :** `PixelKeyboardLeds.stl` est placée exactement là où elle va dans `PixelKeyboardTop.stl`.
  - **Avec l'AMS :** dans Bambu Studio, ouvre les deux fichiers ensemble et accepte « un seul objet avec plusieurs pièces ». Donne le PLA translucide à la barre. Elle s'imprime dans les fenêtres du dessus.
  - **Sans AMS :** imprime-la seule en translucide, couchée sur sa partie plate, puis glisse-la par en dessous dans les fenêtres.
- **Détails gravés :** les lecteurs CD et disquette, les boutons du moniteur, le cadre des touches et les badges « PIXEL » sont gravés. Le bouton d'allumage, le Turbo et les voyants, eux, sont de vrais trous pour les vraies pièces.
- **Surplombs :** il ne reste que de petits ponts, comme les fentes d'aération et les tunnels de câbles. Les trous de la façade ont une petite pointe vers le bas : à l'impression, à l'envers, elle évite les supports. La collerette de chaque bouton la cache.

### D'abord : le cadre de test de l'écran

Les cotes de l'écran Freenove 7" (165 × 101 × 10 mm) viennent de deux boîtiers publiés pour cet écran, dont j'ai mesuré les fichiers 3D. La fenêtre fait 160 × 94 mm : elle montre toute l'image, même si l'image est décalée de 3 mm sur la vitre (c'est le cas sur cet écran).
1. Imprime `ScreenFitTest.stl` et pose l'écran dedans. Il doit entrer sans forcer, avec moins d'un millimètre de jeu.
2. S'il ne va pas, mesure ton écran et corrige `SCR_W`, `SCR_H` et `SCR_T` en haut de `generate.py`.
3. Relance le script.

### Tôt : le dessus du clavier

Les cotes du module du Stream Deck viennent du plan publié par le projet [Stream Deck Module](https://github.com/stagehacks/Stream-Deck-Module) : 107 × 70 × 9 mm, touches espacées de 19,26 mm, découpes de 17 mm.
1. Imprime `PixelKeyboardTop.stl` (environ 25 g) et pose-le sur le module.
2. Les 15 touches doivent passer sans frotter et dépasser d'environ 1 mm.

## Matériel

| Pièce | Qté | Note |
| --- | --- | --- |
| Raspberry Pi 4 (4 Go ou plus) | 1 | tu l'as |
| Stream Deck MK.2 | 1 | tu l'as. On en sort le module ; garde la coque et la face avant d'origine |
| Écran tactile **Freenove 7" IPS** 800 × 480, DSI (FNK0078H) | 1 | la version TN marche aussi, mais elle pâlit quand on la regarde de côté |
| Nappe DSI 15 broches, pas de 1 mm, **300 mm** | 1 | celle livrée est trop courte. Prends le même type de contacts que la nappe livrée : regarde de quel côté ils sont à chaque bout |
| 2 fils femelle-femelle de 30 cm | 2 | le 5 V et la masse de l'écran, qui montent par le pied |
| **Câble USB-C coudé à 90° → USB-A**, environ 30 cm | 1 | pour le Stream Deck : la prise est au dos du module. La tête coudée doit faire 8 mm d'épaisseur maximum |
| Alimentation officielle Raspberry Pi 4, USB-C 5,1 V 3 A | 1 | le seul câble |
| Radiateur passif pour Pi 4 (25 mm de haut maximum) | 1 | |
| Haut-parleur Ø 40 mm, 4 Ω, 3 W, avec un ampli I2S MAX98357A | 1 | sous les fentes, à l'arrière gauche du dessus |
| Mini micro USB | 1 | |
| Carte microSD (32 Go ou plus) | 1 | |
| [Bouton poussoir métal **16 mm**, momentané, anneau LED](https://www.amazon.fr/s?k=bouton+poussoir+16mm+momentan%C3%A9+anneau+LED+5V) | 1 | bouton d'allumage. **Momentané** (pas « à verrouillage »), LED en **5 V ou 3-6 V** (pas 12 V). Vert pour le look rétro |
| [Bouton poussoir métal **12 mm**, momentané](https://www.amazon.fr/s?k=bouton+poussoir+12mm+momentan%C3%A9+m%C3%A9tal) | 1 | le bouton « Turbo » |
| [LED 3 mm précâblées 5 V](https://www.amazon.fr/s?k=LED+3mm+pr%C3%A9c%C3%A2bl%C3%A9es+5V), 1 verte et 1 orange | 2 | voyants « marche » et « activité » |
| [Supports chromés pour LED 3 mm](https://www.amazon.fr/s?k=support+LED+3mm+chrome) | 2 | trou de 5 mm dans la façade |
| [LED RVB **adressable** ronde 5 mm](https://www.amazon.fr/s?k=LED+adressable+5mm+PL9823) (PL9823 ou WS2812 « F5 ») | 1 | voyant de notification. **4 pattes**, 5 V |
| [Support chromé pour LED 5 mm](https://www.amazon.fr/s?k=support+LED+5mm+chrome) | 1 | trou de 8 mm dans la façade |
| [Ruban LED **WS2812B, 144 LED/m**, 5 V](https://www.amazon.fr/s?k=ruban+WS2812B+144+LED+5V) | 3 LED | les 3 voyants du clavier : coupe un morceau de 3 LED. 144 LED/m est important, c'est l'écart entre les fenêtres |
| [Fils Dupont femelle-femelle](https://www.amazon.fr/s?k=c%C3%A2bles+dupont+femelle+femelle) | 1 lot | pour brancher tout ça sur le Pi sans souder |
| Résistance de 330 Ω | 1 | conseillée sur le fil de données des LED RVB |
| Patins caoutchouc Ø 10 mm | 8 | 4 sous le boîtier, 4 sous le clavier |
| Mousse adhésive de 1 mm | 4 petits carrés | au bout des 4 tiges qui tiennent l'écran |
| Mousse adhésive de 0,5 mm | une bande de 2,5 mm de large | sur le rebord qui porte le module, pour le serrer |

Les liens sont des recherches Amazon.fr. Vérifie sur la fiche ce qui est écrit en gras, et garde les mêmes diamètres : la façade est percée pour eux.

### Vis (M2,5, vissées directement dans le plastique)

| Vis | Qté | Usage |
| --- | --- | --- |
| M2,5 × 6 | 4 | le Pi sur le fond du boîtier |
| M2,5 × 8 | 4 | le fond sur le boîtier |
| M2,5 × 8 | 4 | le pied sur le boîtier (vissées depuis l'intérieur) |
| M2,5 × 10 | 4 | le moniteur sur le pied (vissées depuis l'intérieur du pied) |
| M2,5 × 10 | 4 | le dessus du clavier sur son socle (vissées par en dessous, au fond des puits) |
| M2,5 × 12 | 2 | le clavier contre le boîtier (vissées depuis l'intérieur) |

## Branchements sur le Pi

Les numéros sont ceux des broches du connecteur GPIO (1 à 40). Chaque fil a sa broche de masse, il y en a juste assez.

| Pièce | Fil | Broche |
| --- | --- | --- |
| Écran | 5 V / masse (en plus de la nappe, branchée sur la prise DISPLAY) | 2 / 6 |
| Ampli MAX98357A | Vin / masse / BCLK / LRC / DIN | 4 / 14 / 12 / 35 / 40 |
| Bouton d'allumage | contact / masse | 5 (GPIO 3) / 9 |
| Anneau du bouton | + / − | 11 (GPIO 17) / 20 |
| Bouton Turbo | contact / masse | 13 (GPIO 27) / 25 |
| Voyant vert « marche » | + / − | 15 (GPIO 22) / 30 |
| Voyant orange « activité » | + / − | 16 (GPIO 23) / 34 |
| LED RVB de la façade, puis les 3 du clavier (en chaîne) | données (avec la 330 Ω) / 5 V / masse | 19 (GPIO 10) / 4, partagée avec l'ampli / 39 |

**Chaîne des LED RVB :** la sortie de la LED de la façade va à l'entrée du morceau de ruban du clavier. Les 3 fils (5 V, masse, données) passent dans le tunnel du câble du Stream Deck.

À ajouter dans `/boot/firmware/config.txt` :

```
dtoverlay=gpio-shutdown,gpio_pin=3   # le bouton éteint Pixel ; un 2e appui le rallume
gpio=22=op,dh                        # le voyant vert s'allume dès le démarrage
dtparam=spi=on                       # les LED RVB
dtoverlay=max98357a                  # l'ampli du haut-parleur
```

Le bouton et le voyant vert marchent avec ces seules lignes. L'appli Pixel ne commande pas encore les autres voyants, l'anneau ni le Turbo : c'est la prochaine étape.

## Montage

1. **Le moniteur :**
   1. Colle un carré de mousse au bout de chacune des 4 tiges de l'arrière du moniteur.
   2. Pose l'écran dans l'avant, la vitre contre la fenêtre.
   3. Branche la nappe DSI et les 2 fils 5 V et masse. Fais-les descendre jusqu'au trou du fond, au-dessus du pied.
   4. Accroche l'arrière par ses deux languettes du haut, puis rabats-le vers le bas.
2. **Le pied :** passe la nappe et les 2 fils dans le trou du pied. Visse le pied sous le moniteur avec 4 × M2,5 × 10, depuis l'intérieur du pied. Ces vis tiennent aussi l'arrière du moniteur.
3. **Sur le boîtier :** passe la nappe et les fils dans le trou du dessus du boîtier. Visse le pied avec 4 × M2,5 × 8, depuis l'intérieur du boîtier.
4. **La façade :** visse le bouton d'allumage, le Turbo et les supports de LED dans leurs trous, avec leurs écrous, par l'intérieur. Clipse les LED dans leurs supports.
5. **Dans le boîtier :**
   1. Colle le haut-parleur dans son anneau, sous les fentes.
   2. Visse le Pi sur le fond (4 × M2,5 × 6), prise USB-C vers l'arrière.
   3. Branche la nappe et tous les fils sur le GPIO (tableau ci-dessus), puis le micro (sur le port USB du fond).
6. **Sortir le module du Stream Deck :** débranche-le. Soulève un coin de sa face avant jusqu'au clic, puis l'autre coin (c'est la méthode d'Elgato pour changer la face). Retire la face, retourne la coque : le module tombe tout seul. Range la coque et la face d'origine, pour pouvoir le remonter.
7. **Le clavier :**
   1. Colle le morceau de ruban de 3 LED dans le creux sous les fenêtres, LED vers le haut, l'entrée des données côté gauche. Passe ses 3 fils dans le petit tunnel qui descend sous le module.
   2. Branche le câble coudé sur la prise au dos du module et fais-le passer par le tunnel du socle, avec les 3 fils des LED.
   3. Colle la bande de mousse sur le rebord, puis pose le module, touches vers le haut et prise vers l'arrière gauche.
   4. Si la barre translucide est imprimée à part, glisse-la par en dessous dans les fenêtres du dessus. Pose le dessus et visse-le par en dessous (4 × M2,5 × 10).
8. **Contre le boîtier :** fais passer le câble du Stream Deck et les 3 fils par le trou en bas à gauche de la façade. Branche le câble sur le port USB de devant du Pi, et les 3 fils à la sortie de la LED RVB de la façade. Visse le clavier contre le boîtier avec 2 × M2,5 × 12, depuis l'intérieur.
9. **Fermer :** visse le fond du boîtier (4 × M2,5 × 8).

*Option sans ouvrir le Stream Deck :* imprime `PixelStreamDeckTray.stl` à la place des deux pièces du clavier. Pose le Stream Deck entier dedans, sans son pied, et branche-le avec le même câble coudé. Les voyants du clavier ne sont alors pas utilisés.

## Vérifications faites sur ordinateur

- **Collisions :** aucune entre les pièces. Aucune non plus avec les éléments réels :
  - le module du Stream Deck, ses 15 touches, sa prise USB-C et la prise coudée ;
  - l'écran 7", le Pi 4 (prises USB comprises) et le haut-parleur ;
  - le bouton d'allumage, le Turbo, les 3 supports de LED, le morceau de ruban LED et la barre translucide.
- **L'écran :** les 4 tiges arrivent à 1 mm de son dos, l'épaisseur de la mousse.
- **Les vis du clavier** mordent environ 6 mm dans le dessus.
- **Visibilité :** les boutons et les voyants de la façade sont au-dessus du clavier (à partir de 43 mm de haut, le clavier monte à 39 mm).
- **Stabilité :** le moniteur reste au-dessus du boîtier. D'après une estimation des poids, il faut pousser d'environ 5 N vers l'arrière, en haut de l'écran, pour faire basculer l'ensemble. Un toucher normal est bien en dessous.
- Rien n'a encore été imprimé.

## À savoir

- **Le dos de l'écran :** Freenove ne publie pas de plan. À la réception, regarde :
  - où est la prise de la nappe ;
  - où prendre le 5 V et la masse : l'écran les prend normalement par de petites broches à ressort qui touchent le GPIO quand le Pi est vissé derrière lui.

  Si une des 4 tiges tombe sur un composant, déplace-la (`POST_X`, `POST_DZ` dans `generate.py`).
- **Éteint, mais pas tout à fait :** après un appui sur le bouton, le Pi 4 s'arrête proprement mais reste sous tension, prêt à redémarrer au prochain appui. Pour l'éteindre complètement, débranche-le.
- **Le courant :** l'alimentation de 3 A suffit pour le Pi, l'écran, le Stream Deck et les LED, tant que les LED RVB restent à luminosité modérée.
- **La chaleur :** le Pi respire par le fond, les côtés, le « ventilateur » perforé à l'arrière et les fentes du dessus.

## Modifier

Toutes les cotes sont en haut de `generate.py` (écran, boîtier, emplacement des boutons et des voyants…). Relance ensuite :

```bash
pip install trimesh manifold3d shapely mapbox_earcut numpy scipy matplotlib
python generate.py
```
