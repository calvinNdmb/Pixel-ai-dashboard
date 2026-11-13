# Archipel

Atelier de worldbuilding pour écrivains et maîtres de jeu : fiches reliées automatiquement, toile des relations, carte peinte avec relief 3D, événements datés, manuscrit, et une IA qui propose des liens et des illustrations.

| Dossier | Contenu |
|---|---|
| `app/` | Archipel 2, « la carte d'abord » : le monde en 3D plein écran, le pinceau ville (rues et maisons se posent seules), rivières, routes, ponts, monuments, champs, et des habitants qui marchent dans les rues et peuvent recevoir un nom, un métier et une maison. Rendu « maquette » détaillé : voir plus bas. |
| `prototype/` | Premier prototype web (HTML/JS, Three.js), gardé pour référence. Publié comme artifact Claude ; s'ouvre aussi dans un navigateur via un petit serveur statique. |
| `mcp-server/` | Serveur MCP : rend tout le monde lisible et modifiable par une IA. Voir [mcp-server/README.md](mcp-server/README.md). |

Le prototype et le serveur MCP partagent le même format de monde (JSON, version 2) : on exporte depuis le prototype, une IA travaille via le MCP, on réimporte.

## Le rendu d'Archipel 2

Tout est dessiné dans le navigateur, sans image ni modèle téléchargé : les textures sont peintes sur des canvas au démarrage, les modèles sont construits en code et dessinés par lots (`InstancedMesh`).

| Fichier | Rôle |
|---|---|
| `app/look.js` | L'habit commun : rendu (sRGB, tone mapping), soleil bas et chaud, ciel, brume, matériaux à teinte masquée. |
| `app/scene.js` | Relief lissé et sol texturé par biome, mer, rivières, revêtements posés sur le relief, caméra, gestes, étiquettes. Assemble les kits. |
| `app/town.js` | Le plan d'une ville à partir de la zone peinte : rues en anneaux et rayons, rangées de maisons, place, parc, mobilier, jardins. |
| `app/kit-buildings.js` | Maisons de ville (façades, fenêtres, volets, toits d'ardoise ou de tuile, cheminées) et monuments (phare, église, halle, moulin, tour, statue). |
| `app/kit-street.js` | Pavés et dalles, mobilier (réverbères, bancs, étals…), fontaine, kiosque, quai, bateaux, pont, et les habitants animés. |
| `app/kit-nature.js` | Arbres, buissons, roseaux, rochers, cultures en rangs, herbes et fleurs. |
| `app/dev/` | Bancs d'essai : `node app/dev/shoot.js app/dev/buildings.html sortie.png 1200 800 "view=street"` rend un kit seul, avec la lumière de l'application. |
