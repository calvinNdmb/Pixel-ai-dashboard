# Prompts pour générer des pistes de style

Ce fichier contient des prompts prêts à coller dans une IA de génération d'images
(Midjourney, GPT Image / DALL·E, Imagen, Flux, Stable Diffusion…) pour explorer
des directions artistiques pour le QG.

Les prompts sont **en anglais** : la plupart des générateurs y répondent mieux.
Chaque piste est précédée d'une explication en français de l'intention.

## Conseils pour de bons résultats en pixel art

- Gardez les mots-clés techniques : `pixel art`, `16-bit`, `crisp hard pixel edges`,
  `no anti-aliasing`, `limited palette`, `16x16 tile grid`.
- Format : `16:10` (le QG fait 32×20 tuiles). Midjourney : ajoutez `--ar 16:10 --style raw`.
- Les générateurs produisent souvent du « faux » pixel art (pixels de tailles
  différentes, flou). Pour l'utiliser vraiment, réduisez l'image à la taille native
  (ex. 512×320) en **plus proche voisin**, puis nettoyez à la main (Aseprite, Pixelorama, Libresprite).
- Stable Diffusion / Flux : un LoRA « pixel art » aide beaucoup. Prompt négatif conseillé :

```text
blurry, anti-aliasing, soft gradients, 3d render, photorealistic, painterly, mixed pixel sizes,
text, watermark, logo, jpeg artifacts, extra limbs, deformed hands, cluttered, low contrast
```

---

## 1. « Le QG cosy » — la direction actuelle

Un bureau chaleureux vu de dessus (vue 3/4), parquet, plantes, petits personnages
chibi. Le Chef porte une toque blanche (jeu de mots « chef »). Chaque pièce
correspond à une action des agents : bibliothèque = lecture du code, salle serveurs
= commandes, coin Web = recherches, salon/arcade = pause.

```text
Top-down 3/4 view pixel art of a cozy indie-game office headquarters, 16-bit style, 16x16 tile grid,
warm wooden floor, a manager's office with purple carpet and a big wooden desk where a tiny chibi chef
wearing a white chef's toque and red neckerchief sits, a library room with tall colorful bookshelves,
a dark server room with blinking green LED racks, an open space with rows of desks and glowing monitors,
a corner with a big globe and a radar console, a meeting room, a lounge with a blue couch, coffee machine
and bean bags, an arcade corner with two arcade cabinets and a foosball table, a cat sleeping in a basket,
about ten tiny chibi characters working, speech bubbles with small icons above their heads,
limited 32-color palette, plum-colored outlines, crisp hard pixel edges, no anti-aliasing,
charming and readable, game screenshot --ar 16:10
```

## 2. « La guilde d'aventuriers » — fantasy

Le QG devient une guilde médiévale. Le Chef est le maître de guilde, les agents
sont des aventuriers. Tableau des quêtes = planning, grimoires = lecture,
forge/alchimie = commandes, boule de cristal / observatoire = web, taverne = pause.

```text
Top-down 3/4 pixel art of a fantasy adventurers' guild hall, 16-bit JRPG style, 16x16 tiles,
stone floor and wooden beams, a guild master in a purple robe at a large desk, a quest board covered
with parchment notes, a library of glowing spellbooks and scrolls, an alchemy lab with bubbling
potions and a small forge, an observatory corner with a crystal ball and a brass telescope,
a cozy tavern area with a fireplace, barrels and a sleeping dog, tiny chibi adventurers (knight, mage,
rogue, bard) walking between rooms with small icon speech bubbles, warm candlelight,
limited palette, crisp pixel edges, no anti-aliasing --ar 16:10
```

## 3. « La station spatiale » — science-fiction douce

Le Chef est le capitaine sur la passerelle, l'équipe circule entre les modules.
Cœur du réacteur = commandes, antenne de communication = web, archives = lecture,
jardin hydroponique = pause.

```text
Top-down pixel art cross-section of a cozy space station, 16-bit sci-fi style, 16x16 tile grid,
a command bridge with a captain chair and a large starfield window, crew quarters, a data archive room
with glowing holographic shelves, a reactor core room with pulsing cyan energy and pipes,
a communications array with a satellite dish and radar screens, a hydroponic garden lounge with plants
and a vending machine, small chibi astronauts in colorful jumpsuits working at consoles,
speech bubbles with tiny icons, deep navy and teal palette with warm orange accents,
crisp hard pixel edges, no anti-aliasing --ar 16:10
```

## 4. « Néo-Tokyo, 2 h du matin » — cyberpunk néon

Ambiance nocturne : pluie derrière les vitres, enseignes néon, écrans
cathodiques. Les agents sont des hackers en sweat à capuche ; le Chef a des
lunettes de réalité augmentée.

```text
Top-down 3/4 pixel art of a small hacker collective office at night in a neon cyberpunk city,
16-bit style, rain on large windows, pink and cyan neon signs, rows of glowing CRT monitors with
scrolling green code, a server closet with blinking lights and tangled cables, a ramen counter lounge,
an arcade machine, a lead hacker with AR glasses at a central desk, tiny chibi characters in hoodies,
holographic speech bubbles with icons, dark purple and black palette with neon highlights,
crisp hard pixel edges, no anti-aliasing, moody but readable --ar 16:10
```

## 5. « Le village » — carte extérieure façon jeu de ferme

Au lieu d'un bâtiment, un petit village : chaque activité est une maison
(bibliothèque, atelier, tour radio, café). Les agents se baladent sur les chemins,
le Chef vit dans la mairie. Idéal si l'équipe grandit beaucoup.

```text
Top-down pixel art of a tiny cozy village map, 16-bit farming-sim style, 16x16 tiles, grass,
dirt paths, a small river with a wooden bridge, a town hall where the village chief lives, a stone library,
a blacksmith workshop with smoke, a radio tower on a hill, a cafe with a terrace and parasols,
a notice board in the main square, tiny chibi villagers walking between houses with icon speech bubbles,
flowers and fences, soft spring palette, crisp hard pixel edges, no anti-aliasing --ar 16:10
```

## 6. Variante isométrique — le diorama

Le même bureau, mais en isométrique 2:1 : plus de profondeur, effet « maquette ».

```text
Isometric pixel art diorama of a cozy startup office floor, 2:1 isometric pixel lines, 16-bit style,
cut-away walls, wooden floor, desks with glowing monitors, a library corner, a small server room
with blinking lights, a lounge with a couch and a coffee machine, tiny chibi workers,
a manager wearing a white chef's toque, floating speech bubbles with icons, clean limited palette,
crisp pixel edges, no anti-aliasing, floating on a plain dark background --ar 4:3
```

---

## Les personnages

Planche de sprites pour garder des agents cohérents (4 directions, marche,
assis au clavier, main levée, célébration) :

```text
Pixel art character sprite sheet, chibi office workers, each sprite 16x24 pixels, front, back, left
and right views, 3-frame walking cycle per direction, sitting and typing from behind, raising a hand,
cheering with both arms up, drinking coffee, sleeping; six variations with different hair styles
(short, long, curly, bun, cap) and shirt colors; plus one manager wearing a tall white chef's toque
and a red neckerchief; dark plum outlines, limited palette, transparent background, grid layout,
crisp hard pixel edges, no anti-aliasing
```

Le Chef, en portrait (pour un avatar ou un logo) :

```text
Pixel art portrait of a friendly chibi chef character, white puffy chef's toque, red neckerchief,
confident smile, holding a clipboard, 32x32 pixels upscaled, 16-bit style, plum outline,
transparent background, crisp pixel edges, no anti-aliasing
```

Le chat du QG :

```text
Pixel art sprite sheet of a small orange office cat, 16x16 pixels, walking left and right
(4 frames), sitting, sleeping curled in a wicker basket, stretching, tiny heart effect,
transparent background, crisp hard pixel edges, no anti-aliasing
```

## L'interface autour du monde

Pour imaginer les panneaux (discussion avec le Chef, fiches des agents,
demandes d'autorisation) dans le même esprit :

```text
Pixel art game UI kit, 16-bit JRPG menu style, dark indigo dialog boxes with notched pixel corners
and gold borders, chat window with message bubbles, a "report" card with a green success tag,
an agent status card with a small character portrait, a warning card with Allow / Deny buttons,
tabs, toggle buttons, small 10x10 icons (chef hat, scroll, bell, play, pause, stop, trash),
pixel font labels, clean layout on a plain background, crisp pixel edges, no anti-aliasing
```

```text
Dashboard screen mockup in pixel art style: on the left a top-down cozy pixel office with tiny
characters working, on the right a vertical panel with a chat between the user and a "chef" agent,
status chips, a permission request card with Allow and Deny buttons, a live activity log at the bottom,
dark plum and gold color scheme, 16-bit pixel fonts, crisp edges --ar 16:10
```

---

### Et ensuite ?

Le décor et les personnages actuels sont dessinés en code (`web/src/game/`), ce
qui permet de les faire évoluer sans aucun fichier image. Si une piste vous plaît,
deux options :

1. **S'en inspirer** : ajuster la palette (`palette.ts`), le mobilier (`props.ts`)
   ou la disposition (`map.ts`).
2. **Utiliser de vraies planches** : une fois les images nettoyées en vrais pixels,
   on peut ajouter un chargeur de tileset/sprites qui remplace les dessins en code.
