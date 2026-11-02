import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/vt323/latin-400.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBackend } from './backend';
import { App } from './ui/App';

const backend = createBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App backend={backend} />
  </StrictMode>,
);
