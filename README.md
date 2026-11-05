# Archipel

Atelier de worldbuilding pour écrivains et maîtres de jeu : fiches reliées automatiquement, toile des relations, carte peinte avec relief 3D, événements datés, manuscrit, et une IA qui propose des liens et des illustrations.

| Dossier | Contenu |
|---|---|
| `prototype/` | Prototype web (HTML/JS, Three.js). Publié comme artifact Claude ; s'ouvre aussi dans un navigateur via un petit serveur statique. |
| `mcp-server/` | Serveur MCP : rend tout le monde lisible et modifiable par une IA. Voir [mcp-server/README.md](mcp-server/README.md). |

Le prototype et le serveur MCP partagent le même format de monde (JSON, version 2) : on exporte depuis le prototype, une IA travaille via le MCP, on réimporte.
