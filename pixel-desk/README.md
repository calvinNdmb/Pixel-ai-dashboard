# Pixel

Compagnon de bureau : un écran tactile 4,3" en guise de visage, un Stream Deck MK.2 incliné à l'avant et un Raspberry Pi 4 caché dans le socle. Il n'a aucune pièce mobile, et **un seul câble** sort : l'alimentation USB-C du Pi.

![Pixel](preview.png)

L'écran sur l'image est une maquette : un visage animé, et un tableau de bord avec les lumières Hue, Claude, Codex et la musique. L'appli reste à écrire.

![Dedans](preview-inside.png)

## Pièces à imprimer

Elles sont toutes dans `stl/`, déjà posées dans le bon sens pour l'impression, **sans supports**.

| Fichier | Taille (mm) | Couleur proposée | Sens d'impression |
| --- | --- | --- | --- |
| `ScreenFitTest.stl` | 113 × 75 × 6 | n'importe laquelle | **À imprimer en premier** (voir plus bas) |
| `PixelBase.stl` | 148 × 170 × 60 | vert sauge | debout, fond sur le plateau |
| `PixelLid.stl` | 135 × 73 × 11 | vert sauge | à l'envers (dessus sur le plateau) |
| `PixelNeck.stl` | 52 × 28 × 30 | rose | debout, collerette en bas |
| `PixelHeadFront.stl` | 124 × 86 × 17 | crème | face avant sur le plateau |
| `PixelHeadBack.stl` | 120 × 82 × 18 | crème | dos sur le plateau |
| `PixelEarLeft.stl`, `PixelEarRight.stl` | 28 × 27 × 4 | crème | à plat |
| `PixelEarInner.stl` (×2) | 15 × 12 × 0,8 | rose | à plat |

- PLA ou PETG, buse 0,4 mm, couches de 0,2 mm, 3 parois, 15 % de remplissage.
- Il faut un plateau d'au moins **180 × 180 mm**. Compte environ **250 g** de filament en tout.
- Les seules surfaces en surplomb sont de petits ponts (fentes d'aération, prise USB-C, logements des oreilles et des patins) et des marches de 0,75 mm.

### D'abord : le cadre de test de l'écran

Les cotes de l'écran (106 × 68 × 14,05 mm) viennent de fiches revendeurs. Imprime `ScreenFitTest.stl` et pose l'écran dedans : il doit entrer sans forcer, avec moins d'un demi-millimètre de jeu. S'il ne va pas, mesure l'écran, corrige `SCR_W`, `SCR_H` et `SCR_T` en haut de `generate.py`, puis relance le script.

## Matériel

| Pièce | Qté | Note |
| --- | --- | --- |
| Raspberry Pi 4 (4 Go ou plus) | 1 | tu l'as. 4 Go minimum pour faire tourner Claude Code dessus |
| Stream Deck MK.2 | 1 | tu l'as. Retire son pied et garde son câble USB-C → USB-A |
| Waveshare **4.3inch DSI LCD** tactile 800×480 (SKU 16239) | 1 | |
| Nappe DSI 15 broches, **200 mm** | 1 | celle livrée avec l'écran est trop courte |
| Alimentation officielle Raspberry Pi 4, USB-C 5,1 V 3 A | 1 | le seul câble |
| Radiateur passif pour Pi 4 (25 mm de haut maximum) | 1 | |
| Haut-parleur Ø 40 mm, 4 Ω, 3 W | 1 | sous la grille en cœur |
| Ampli I2S MAX98357A | 1 | branché sur le GPIO du Pi |
| Mini micro USB | 1 | |
| Carte microSD (32 Go ou plus) | 1 | |
| Patins caoutchouc Ø 10 mm | 4 | |
| Mousse adhésive de 1 mm | 4 petits carrés | derrière l'écran |

### Vis (M2,5, vissées directement dans le plastique)

| Vis | Qté | Usage |
| --- | --- | --- |
| M2,5 × 6 | 4 | le Pi sur ses entretoises |
| M2,5 × 8 | 4 | le couvercle sur le socle |
| M2,5 × 10 | 2 | le cou sur le couvercle |
| M2,5 × 20 | 2 | la tête : par l'arrière, à travers le cou, jusque dans l'avant |

## Montage

1. **Le Pi :** visse-le sur ses entretoises, la prise USB-C contre le trou à l'arrière du socle. Branche l'ampli et le haut-parleur, le micro USB, et la nappe DSI (côté Pi).
2. **Le couvercle :** passe la nappe dans la fente du couvercle, pose le haut-parleur dans son anneau sous la grille, puis visse le couvercle (4 × M2,5 × 8).
3. **Le cou :** enfile-le sur la nappe et visse sa collerette sur le couvercle (2 × M2,5 × 10).
4. **La tête :** colle les inserts roses dans les oreilles, puis emboîte les oreilles dans les fentes du haut de l'avant de la tête. Pose l'écran dans l'avant (verre contre la fenêtre), avec 4 carrés de mousse au dos. Branche la nappe sur l'écran.
5. **Fermer la tête :** pose l'avant sur le cou. Accroche l'arrière par ses deux languettes du haut, puis rabats-le vers le bas. Visse par l'arrière les 2 × M2,5 × 20 : elles traversent le cou et verrouillent la tête.
6. **Le Stream Deck :** branche son câble sur un port USB du Pi, puis pose-le sur les nervures de la fente, avec le bord du bas contre la lèvre avant.

## Vérifications faites sur ordinateur

- **Collisions :** aucune entre les pièces, ni avec le Stream Deck, l'écran, le Pi 4 (prises USB branchées comprises) et le haut-parleur.
- **Les vis de la tête** traversent bien l'arrière, la paroi du cou, puis environ 7 mm de l'avant.
- **Le visage reste visible** au-dessus du Stream Deck : le bas de la tête est à 82 mm de haut, le haut du Stream Deck à 78 mm.
- Rien n'a encore été imprimé.

## À savoir

- **L'alimentation de l'écran :** si ton modèle demande un 5 V séparé en plus de la nappe, fais monter 2 fils depuis le GPIO du Pi par le cou.
- **La stabilité :** tapoter l'écran ne pose aucun problème. Un appui fort vers l'arrière peut le faire basculer, d'après une estimation des poids. Dans ce cas, colle 100 à 200 g de lest (rondelles ou pièces) au fond du socle, sous le Stream Deck.
- **La chaleur :** le Pi respire par les fentes du fond et des côtés, et par la grille en cœur.

## Modifier

Toutes les cotes sont en haut de `generate.py`. Relance ensuite :

```bash
pip install trimesh manifold3d shapely mapbox_earcut numpy scipy
python generate.py
```
