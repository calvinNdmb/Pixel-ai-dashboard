# Archipel MCP

Serveur [MCP](https://modelcontextprotocol.io) qui donne à une IA (Claude Desktop, Claude Code, Cursor, ou tout client MCP) l'accès à un monde Archipel : fiches, relations, carte et terrain, événements datés, chapitres.

Le monde est un fichier JSON au même format que l'export du prototype (`prototype/`, bouton **Exporter le monde**). Au premier lancement, s'il n'existe pas, il est créé avec le monde d'exemple *Les Îles Cendrées*.

## Installation

```bash
cd mcp-server
npm install
npm run build
npm test        # 14 vérifications de bout en bout (stdio + HTTP)
```

## Brancher le serveur à une IA

**Claude Code**

```bash
claude mcp add archipel -e ARCHIPEL_WORLD=/chemin/vers/mon-monde.json -- node /chemin/vers/mcp-server/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "archipel": {
      "command": "node",
      "args": ["/chemin/vers/mcp-server/dist/index.js"],
      "env": { "ARCHIPEL_WORLD": "/chemin/vers/mon-monde.json" }
    }
  }
}
```

**À distance (HTTP)** : `npm run start:http` écoute sur `http://127.0.0.1:8787/mcp`. Pour l'exposer au-delà de la machine, définis `HOST=0.0.0.0` et `ARCHIPEL_TOKEN` (obligatoire dans ce cas) : chaque requête doit alors porter `Authorization: Bearer <jeton>`. Mets-le derrière HTTPS.

| Variable | Rôle | Défaut |
|---|---|---|
| `ARCHIPEL_WORLD` | Fichier JSON du monde | `./world.json` |
| `PORT`, `HOST` | Écoute HTTP | `8787`, `127.0.0.1` |
| `ARCHIPEL_TOKEN` | Jeton exigé en HTTP | aucun |

## Outils

| Outil | Ce qu'il fait |
|---|---|
| `get_world_overview` | Toutes les fiches groupées par type, les chapitres, la période couverte |
| `search_entries` | Recherche tolérante (accents, casse, tirets) |
| `get_entry` | Fiche complète : relations, fiches citées, textes qui la citent, position et terrain |
| `create_entry`, `update_entry`, `delete_entry` | Écrire les fiches (`append_body` ajoute un paragraphe) |
| `set_world_info` | Nom et accroche du monde |
| `add_relation`, `remove_relation` | Relations orientées : « Maître Oren » *mentor de* « Ysolde Varn » |
| `find_mentions` | Le moteur de liens automatiques appliqué à n'importe quel texte |
| `find_link_candidates` | Paires de fiches qui se citent ou se croisent sans relation notée, avec l'extrait qui le prouve |
| `list_map_markers`, `place_on_map` | Repères de la carte (x 0–1000 d'ouest en est, y 0–700 du nord au sud) |
| `describe_location` | Mer ou terre, biome, altitude ou profondeur, repères proches avec distance et direction |
| `add_event` | Événement daté posé sur la carte, participants reliés |
| `get_timeline` | Événements dans l'ordre, avec lieu et personnes impliquées |
| `list_chapters`, `read_chapter`, `write_chapter` | Le manuscrit |

Les fiches peuvent être désignées par leur id ou par leur nom (« Ysolde », « port sel »). Les écritures sont atomiques et passent une par une.

## Exemples de demandes

- « Lis mon monde et propose-moi 5 liens entre personnages, avec la preuve dans le texte. »
- « Ajoute un événement en 314 : une tempête détruit le quai de Port-Sel. Brisa et Oren étaient là. »
- « Où se trouve l'Île Morne, et qu'y a-t-il autour ? »
- « Écris le chapitre IV à partir de la chronologie de l'an 311 à 313. »
