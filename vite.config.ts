import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode demo` produit un unique fichier HTML autonome (simulation
// intégrée au navigateur, aucune dépendance serveur) — pratique pour partager
// un aperçu. Le build normal (`vite build`) est servi par le serveur Node.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  const serverPort = Number(process.env.PORT ?? 7495);
  return {
    root: 'web',
    plugins: [react(), ...(demo ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    define: {
      __DEMO_BUILD__: JSON.stringify(demo),
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        '/api': { target: `http://127.0.0.1:${serverPort}`, changeOrigin: false },
      },
    },
    build: {
      outDir: demo ? '../dist/demo' : '../dist/web',
      emptyOutDir: true,
      assetsInlineLimit: demo ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 2000,
    },
  };
});
