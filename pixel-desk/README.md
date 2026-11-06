# Pixel (édition rétro)

Un petit PC beige des années 90… qui est en réalité un Raspberry Pi 4.

- **Le moniteur cathodique** contient un écran tactile 4,3". Il fait 115 mm de profondeur, avec de grandes grilles perforées comme un vrai tube.
- **Le boîtier de bureau** cache le Pi 4 et le haut-parleur.
- **Le « clavier »** est le Stream Deck MK.2, posé devant sur un plateau.

Il n'a aucune pièce mobile, et **un seul câble** sort : l'alimentation USB-C du Pi.

![Pixel rétro](preview.png)

L'écran sur l'image est une maquette en style écran vert (un visage en pixels et un terminal avec Hue, Claude, Codex, musique et météo). L'appli reste à écrire.

![Dedans](preview-inside.png)

## Pièces à imprimer

Elles sont toutes dans `stl/`, déjà posées dans le bon sens pour l'impression, **sans supports**. Imprime tout en PLA beige ou ivoire. Le plateau et le pied peuvent être d'un beige un peu plus foncé.

| Fichier | Taille (mm) | Sens d'impression |
| --- | --- | --- |
| `ScreenFitTest.stl` | 113 × 75 × 6 | **À imprimer en premier** (voir plus bas) |
| `PixelMonitorFront.stl` | 128 × 98 × 20 | face avant sur le plateau |
| `PixelMonitorBack.stl` | 118 × 92 × 101 | dos sur le plateau |
| `PixelStand.stl` | Ø 64 × 10 | à l'envers |
| `PixelCase.stl` | 150 × 130 × 58 | à l'envers (dessus sur le plateau) |
| `PixelCaseBottom.stl` | 145 × 125 × 7 | à plat |
| `PixelKeyboardTray.stl` | 136 × 94 × 20 | à plat |

- **Réglages :** buse 0,4 mm, couches de 0,2 mm, 3 parois, 15 % de remplissage.
- **Taille du plateau :** au moins **180 × 180 mm**.
- **Filament :** environ **350 g** en tout.
- **Détails gravés :** les lecteurs CD et disquette, le bouton, les voyants, les boutons du moniteur et le badge « PIXEL » sont gravés. Ils s'impriment sans rien de spécial.
- **Surplombs :** il ne reste que de petits ponts, comme les fentes d'aération et le tunnel du câble.

### D'abord : le cadre de test de l'écran

Les cotes de l'écran (106 × 68 × 14,05 mm) viennent de fiches de revendeurs.
1. Imprime `ScreenFitTest.stl` et pose l'écran dedans. Il doit entrer sans forcer, avec moins d'un demi-millimètre de jeu.
2. S'il ne va pas, mesure ton écran et corrige `SCR_W`, `SCR_H` et `SCR_T` en haut de `generate.py`.
3. Relance le script.

## Matériel

| Pièce | Qté | Note |
| --- | --- | --- |
| Raspberry Pi 4 (4 Go ou plus) | 1 | tu l'as |
| Stream Deck MK.2 | 1 | tu l'as. Retire son pied |
| Waveshare **4.3inch DSI LCD** tactile 800×480 (SKU 16239) | 1 | |
| Nappe DSI 15 broches, **200 mm** | 1 | celle livrée avec l'écran est trop courte |
| **Câble USB-C coudé à 90° → USB-A**, environ 30 cm | 1 | pour le Stream Deck : sa prise est au dos et le Stream Deck est presque à plat |
| Alimentation officielle Raspberry Pi 4, USB-C 5,1 V 3 A | 1 | le seul câble |
| Radiateur passif pour Pi 4 (25 mm de haut maximum) | 1 | |
| Haut-parleur Ø 40 mm, 4 Ω, 3 W, avec un ampli I2S MAX98357A | 1 | sous les fentes du dessus du boîtier |
| Mini micro USB | 1 | |
| Carte microSD (32 Go ou plus) | 1 | |
| Patins caoutchouc Ø 10 mm | 8 | 4 sous le boîtier, 4 sous le plateau |
| Mousse adhésive de 1 mm | 4 petits carrés | derrière l'écran |

### Vis (M2,5, vissées directement dans le plastique)

| Vis | Qté | Usage |
| --- | --- | --- |
| M2,5 × 6 | 4 | le Pi sur le fond du boîtier |
| M2,5 × 8 | 4 | le fond sur le boîtier |
| M2,5 × 8 | 4 | le pied sur le boîtier (vissées depuis l'intérieur) |
| M2,5 × 10 | 4 | le moniteur sur le pied (vissées depuis l'intérieur du pied) |
| M2,5 × 12 | 2 | le plateau du Stream Deck contre le boîtier (vissées depuis l'intérieur) |

## Montage

1. **Le moniteur :** pose l'écran dans l'avant du moniteur, verre contre la fenêtre, avec 4 carrés de mousse au dos. Branche la nappe DSI. Accroche l'arrière par ses deux languettes du haut, puis rabats-le vers le bas.
2. **Le pied :** passe la nappe dans le trou du pied. Visse le pied sous le moniteur avec 4 × M2,5 × 10, depuis l'intérieur du pied. Ces vis serrent aussi l'avant et l'arrière du moniteur ensemble.
3. **Sur le boîtier :** passe la nappe dans le trou du dessus du boîtier. Visse le pied avec 4 × M2,5 × 8, depuis l'intérieur du boîtier.
4. **Dans le boîtier :** colle le haut-parleur dans son anneau sous les fentes. Visse le Pi sur le fond (4 × M2,5 × 6), prise USB-C vers l'arrière. Branche la nappe, l'ampli, le micro (sur le port USB du fond) et le câble du Stream Deck (sur le port USB de devant).
5. **Le plateau :** fais passer le câble du Stream Deck par le tunnel du plateau, puis par le trou du bas de la façade du boîtier. Visse le plateau contre le boîtier avec 2 × M2,5 × 12, depuis l'intérieur.
6. **Fermer :** visse le fond (4 × M2,5 × 8), branche le câble coudé sur le Stream Deck et pose-le dans son plateau.

## Vérifications faites sur ordinateur

- **Collisions :** aucune entre les pièces, ni avec le Stream Deck et sa prise coudée, l'écran, le Pi 4 (prises USB comprises) et le haut-parleur.
- **Visibilité :** la façade du boîtier (lecteurs, bouton, voyants) reste au-dessus du Stream Deck.
- **Stabilité :** le plateau plein à l'avant sert de lest. D'après une estimation des poids, il faut pousser d'environ 4 N vers l'arrière, en haut de l'écran, pour faire basculer l'ensemble. Un toucher normal est bien en dessous.
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
