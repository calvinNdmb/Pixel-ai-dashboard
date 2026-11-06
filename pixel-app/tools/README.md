# Outils

## build_lab_artifact.py

Fait de Pixel Lab (`web/lab/`) une seule page HTML, à publier comme Artifact sur claude.ai.

```
cd pixel-app
python3 tools/build_lab_artifact.py pixel-lab.html
```

Tout est dans le fichier : le style, la page, `themes.js`, `screens.js` et les scripts du labo. Seules les polices viennent de Google Fonts, d'après `web/fonts.json`. Dans cette version, la capture d'écran s'affiche en image : appuie longuement dessus (ou clic droit) pour l'enregistrer. Le mode plein écran s'ouvre avec `#kiosk` à la fin de l'adresse.
