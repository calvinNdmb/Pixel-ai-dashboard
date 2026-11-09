# Outils

## build_lab_artifact.py

Fait de Pixel Lab (`web/lab/`) une seule page HTML, à publier comme Artifact sur claude.ai.

```
cd pixel-app
python3 tools/build_lab_artifact.py pixel-lab.html
```

Tout est dans le fichier : le style, la page, `themes.js`, `screens.js` et les scripts du labo. Seules les polices viennent de Google Fonts, d'après `web/fonts.json`. Dans cette version, la capture d'écran s'affiche en image : appuie longuement dessus (ou clic droit) pour l'enregistrer. Le mode plein écran s'ouvre avec `#kiosk` à la fin de l'adresse.

## build_app_bundle.py

Fait de la page du téléphone (`web/index.html`) le Pixel hors ligne de l'appli Android : **Pixel sans Pi**.

```
cd pixel-app
python3 tools/build_app_bundle.py pixel-local.html
```

L'appli le lance elle-même avant chaque compilation (`npm run bundle:web` dans `pixel-mobile`, qui écrit `pixel-mobile/assets/pixel-local.html`). Tout est dans le fichier : le style, les polices (en base64), la page et ses scripts, dans l'ordre de `web/index.html`, plus le serveur de Pixel Lab (`web/lab/demo-hub.js`) et `web/local.js` juste avant `app.js`. Rien n'est chargé au lancement : le script s'arrête si la page voulait charger quelque chose.
