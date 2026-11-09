// https://docs.expo.dev/guides/customizing-metro/
// Pixel sans Pi: LocalPixel.tsx requires assets/pixel-local.html, the phone's own Pixel, built from pixel-app/web by
// "npm run bundle:web" (it is not in git). Metro bundles it as an asset (html in assetExts). When it is missing, a page that
// says how to build it stands in, with a warning, so that "npx expo start" still runs; a release bundle stops instead.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const BUNDLE = path.join(__dirname, 'assets', 'pixel-local.html');
config.resolver.assetExts = [...config.resolver.assetExts, 'html'];
let warned = false;
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next = resolve || context.resolveRequest;
  if (/(^|\/)pixel-local\.html$/.test(moduleName) && !fs.existsSync(BUNDLE)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('assets/pixel-local.html is missing: run "npm run bundle:web" in pixel-mobile before building the app.');
    }
    if (!warned) { warned = true; console.warn('\n[Pixel] assets/pixel-local.html is missing: the phone\'s own Pixel shows how to build it. Run "npm run bundle:web".\n'); }
    return next(context, moduleName.replace(/pixel-local\.html$/, 'pixel-local-missing.html'), platform);
  }
  return next(context, moduleName, platform);
};

module.exports = config;
