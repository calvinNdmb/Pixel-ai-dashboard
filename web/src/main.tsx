import './styles.css';
import './village.css';
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
