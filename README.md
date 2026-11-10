# Pixel-ai-dashboard

**Pixel**, un compagnon de bureau avec un écran tactile, un Stream Deck MK.2 et un Raspberry Pi 4 : lumières Hue, discussions avec Claude ou Codex, visage animé (52 animations, 6 thèmes).

| Dossier | Contenu |
| --- | --- |
| [`pixel-desk/`](pixel-desk/) | **Le robot actuel**, style vieux PC beige : pièces à imprimer, liste du matériel, montage |
| [`pixel-app/`](pixel-app/) | **L'appli** sur le Raspberry Pi : écran, Stream Deck, Hue, Claude, Codex, météo, agenda. S'ouvre aussi sur téléphone et PC |
| [`pixel-mobile/`](pixel-mobile/) | **L'appli Android** (version 1.2) : la page de Pixel en plein écran, avec les modes Pixel, Clavier et Les deux. Elle n'a pas besoin du Pi : sans lui, Pixel vit sur le téléphone (Expo, compilée sous Linux ou dans WSL) |
| [`cute-kit/`](cute-kit/) | Oreilles, joues et antenne à coller (première version, pour Tiny Engineer) |
| [`stream-deck-dock/`](stream-deck-dock/) | Ancienne station pour poser le robot Tiny Engineer au-dessus d'un Stream Deck |
| [`touch-head/`](touch-head/) | Ancienne tête 2" tactile pour Tiny Engineer (CERN-OHL-S-2.0) |

## Le personnaliser : son caractère, le nourrir, des exos de maths

Pixel devient *ton* Pixel. Sur ton téléphone, sous les touches : **Caractère**, **Nourrir** et **Exos**.

- **Son caractère** : 15 caractères tout prêts (câlin, grognon, farceur, petit prof…) ou huit curseurs, son nom et le tien, ses heures calmes. Ça change vraiment ce qu'il fait. Tape `sois grognon`, `appelle-toi Bip`.
- **Le nourrir** : son ventre se vide doucement dans la journée, jamais la nuit. Donne-lui un des 24 plats dessinés en gros pixels : il a ses goûts. Tape `mange une pomme`, `tu as faim ?`. Sur l'écran du Pi, l'assiette en bas à droite ouvre son plateau.
- **Les exos de maths** : 15 sortes d'exercices, du CP au collège, en série, en table ou en défi chrono, avec des étoiles et des trophées. Tape `exo`, `table de 7`, puis ta réponse.
- **Les quiz sur mesure** : avec une clé API, Pixel écrit un quiz sur ce que tu veux. Tape `quiz sur les volcans`. On répond sur l'écran ou avec les touches du Stream Deck, et un budget du mois plafonne la dépense.

**Avec le Pi**, tout est gardé sur lui et s'affiche sur son écran ; un cast (photo, vidéo, écran partagé) passe devant, et l'exo ouvert revient après. **Sans Pi**, l'appli Android a les trois sur le téléphone, gardés quand elle se ferme ; son menu les ouvre aussi. Reliée à ton Pi, elle reprend son caractère, son ventre et tes progrès. Le détail est dans [`pixel-app`](pixel-app/README.md#le-personnaliser) et [`pixel-mobile`](pixel-mobile/README.md).
