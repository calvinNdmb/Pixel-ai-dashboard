# Pixel (édition rétro)

Un petit PC beige des années 90… qui est en réalité un Raspberry Pi 4.

- **Le moniteur cathodique** contient un écran tactile 4,3". Il fait 115 mm de profondeur, avec de grandes grilles perforées comme un vrai tube.
- **Le boîtier de bureau** cache le Pi 4 et le haut-parleur.
- **Le clavier beige** contient le Stream Deck MK.2 : on sort son module de sa coque noire et on le met dans un clavier rétro imprimé. C'est réversible.

Il n'a aucune pièce mobile, et **un seul câble** sort : l'alimentation USB-C du Pi.

![Pixel rétro](preview.png)

L'écran sur l'image est une maquette en style écran vert (un visage en pixels et un terminal avec Hue, Claude, Codex, musique et météo). L'appli reste à écrire.

![Dedans](preview-inside.png)

## Pièces à imprimer

Elles sont toutes dans `stl/`, déjà posées dans le bon sens pour l'impression, **sans supports**. Imprime tout en PLA beige ou ivoire. Le socle du clavier et le pied peuvent être d'un beige un peu plus foncé.

| Fichier | Taille (mm) | Sens d'impression |
| --- | --- | --- |
| `ScreenFitTest.stl` | 113 × 75 × 6 | **À imprimer en premier** (voir plus bas) |
| `PixelMonitorFront.stl` | 128 × 98 × 20 | face avant sur le plateau |
| `PixelMonitorBack.stl` | 118 × 92 × 101 | dos sur le plateau |
| `PixelStand.stl` | Ø 64 × 10 | à l'envers |
| `PixelCase.stl` | 150 × 130 × 58 | à l'envers (dessus sur le plateau) |
| `PixelCaseBottom.stl` | 145 × 125 × 7 | à plat |
| `PixelKeyboardTop.stl` | 136 × 96 × 8 | dessus du clavier, à l'envers. **À imprimer tôt** (voir plus bas) |
| `PixelKeyboardBase.stl` | 136 × 94 × 34 | socle du clavier, à plat |
| `PixelStreamDeckTray.stl` | 136 × 94 × 21 | *option* : plateau pour un Stream Deck resté entier, à la place des deux pièces du clavier |

- **Réglages :** buse 0,4 mm, couches de 0,2 mm, 3 parois, 15 % de remplissage.
- **Taille du plateau :** au moins **180 × 180 mm**.
- **Filament :** environ **380 g** en tout.
- **Détails gravés :** les lecteurs CD et disquette, le bouton, les voyants, les boutons du moniteur, le cadre des touches, les 3 voyants du clavier et les badges « PIXEL » sont gravés. Ils s'impriment sans rien de spécial.
- **Surplombs :** il ne reste que de petits ponts, comme les fentes d'aération et le tunnel du câble.

### D'abord : le cadre de test de l'écran

Les cotes de l'écran (106 × 68 × 14,05 mm) viennent de fiches de revendeurs.
1. Imprime `ScreenFitTest.stl` et pose l'écran dedans. Il doit entrer sans forcer, avec moins d'un demi-millimètre de jeu.
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
| Waveshare **4.3inch DSI LCD** tactile 800×480 (SKU 16239) | 1 | |
| Nappe DSI 15 broches, **200 mm** | 1 | celle livrée avec l'écran est trop courte |
| **Câble USB-C coudé à 90° → USB-A**, environ 30 cm | 1 | pour le Stream Deck : la prise est au dos du module. La tête coudée doit faire 8 mm d'épaisseur maximum |
| Alimentation officielle Raspberry Pi 4, USB-C 5,1 V 3 A | 1 | le seul câble |
| Radiateur passif pour Pi 4 (25 mm de haut maximum) | 1 | |
| Haut-parleur Ø 40 mm, 4 Ω, 3 W, avec un ampli I2S MAX98357A | 1 | sous les fentes du dessus du boîtier |
| Mini micro USB | 1 | |
| Carte microSD (32 Go ou plus) | 1 | |
| Patins caoutchouc Ø 10 mm | 8 | 4 sous le boîtier, 4 sous le clavier |
| Mousse adhésive de 1 mm | 4 petits carrés | derrière l'écran |
| Mousse adhésive de 0,5 mm | une bande de 2,5 mm de large | sur le rebord qui porte le module, pour le serrer |

### Vis (M2,5, vissées directement dans le plastique)

| Vis | Qté | Usage |
| --- | --- | --- |
| M2,5 × 6 | 4 | le Pi sur le fond du boîtier |
| M2,5 × 8 | 4 | le fond sur le boîtier |
| M2,5 × 8 | 4 | le pied sur le boîtier (vissées depuis l'intérieur) |
| M2,5 × 10 | 4 | le moniteur sur le pied (vissées depuis l'intérieur du pied) |
| M2,5 × 10 | 4 | le dessus du clavier sur son socle (vissées par en dessous, au fond des puits) |
| M2,5 × 12 | 2 | le clavier contre le boîtier (vissées depuis l'intérieur) |

## Montage

1. **Le moniteur :** pose l'écran dans l'avant du moniteur, verre contre la fenêtre, avec 4 carrés de mousse au dos. Branche la nappe DSI. Accroche l'arrière par ses deux languettes du haut, puis rabats-le vers le bas.
2. **Le pied :** passe la nappe dans le trou du pied. Visse le pied sous le moniteur avec 4 × M2,5 × 10, depuis l'intérieur du pied. Ces vis serrent aussi l'avant et l'arrière du moniteur ensemble.
3. **Sur le boîtier :** passe la nappe dans le trou du dessus du boîtier. Visse le pied avec 4 × M2,5 × 8, depuis l'intérieur du boîtier.
4. **Dans le boîtier :** colle le haut-parleur dans son anneau sous les fentes. Visse le Pi sur le fond (4 × M2,5 × 6), prise USB-C vers l'arrière. Branche la nappe, l'ampli, le micro (sur le port USB du fond) et le câble du Stream Deck (sur le port USB de devant).
5. **Sortir le module du Stream Deck :** débranche-le. Soulève un coin de sa face avant jusqu'au clic, puis l'autre coin (c'est la méthode d'Elgato pour changer la face). Retire la face, retourne la coque : le module tombe tout seul. Range la coque et la face d'origine, pour pouvoir le remonter.
6. **Le clavier :**
   1. Branche le câble coudé sur la prise au dos du module et fais-le passer par le tunnel du socle.
   2. Colle la bande de mousse sur le rebord, puis pose le module, touches vers le haut et prise vers l'arrière gauche.
   3. Pose le dessus et visse-le par en dessous (4 × M2,5 × 10).
7. **Contre le boîtier :** fais passer le câble par le trou en bas à gauche de la façade du boîtier. Visse le clavier contre le boîtier avec 2 × M2,5 × 12, depuis l'intérieur.
8. **Fermer :** visse le fond du boîtier (4 × M2,5 × 8).

*Option sans ouvrir le Stream Deck :* imprime `PixelStreamDeckTray.stl` à la place des deux pièces du clavier. Pose le Stream Deck entier dedans, sans son pied, et branche-le avec le même câble coudé.

## Vérifications faites sur ordinateur

- **Collisions :** aucune entre les pièces. Aucune non plus avec les éléments réels :
  - le module du Stream Deck, ses 15 touches, sa prise USB-C et la prise coudée ;
  - le Stream Deck entier, pour l'option ;
  - l'écran, le Pi 4 (prises USB comprises) et le haut-parleur.
- **Les vis du clavier** mordent environ 6 mm dans le dessus.
- **Visibilité :** la façade du boîtier (lecteurs, bouton, voyants) reste au-dessus du clavier.
- **Stabilité :** le clavier plein à l'avant sert de lest. D'après une estimation des poids, il faut pousser d'environ 4 N vers l'arrière, en haut de l'écran, pour faire basculer l'ensemble. Un toucher normal est bien en dessous.
- Rien n'a encore été imprimé.

## À savoir

- **L'alimentation de l'écran :** si ton modèle demande un 5 V séparé en plus de la nappe, fais monter 2 fils depuis le GPIO du Pi par le pied.
- **La chaleur :** le Pi respire par le fond, les côtés, le « ventilateur » perforé à l'arrière et les fentes du dessus.

## Modifier

Toutes les cotes sont en haut de `generate.py`. Relance ensuite :

```bash
pip install trimesh manifold3d shapely mapbox_earcut numpy scipy matplotlib
python generate.py
```
