// Connexion WebSocket au serveur, avec reconnexion automatique.
// Partagée par l'affichage et la manette.

function storageGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function storageSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* navigation privée */ }
}

// La clé (?key=...) est mémorisée pour ne pas avoir à la retaper.
const params = new URLSearchParams(location.search);
if (params.has('key')) storageSet('viewKey', params.get('key'));
const viewKey = params.get('key') ?? storageGet('viewKey') ?? '';

export function connect({ onMessage, onStatus }) {
  let ws = null;
  let retryDelay = 500;

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws${viewKey ? `?key=${encodeURIComponent(viewKey)}` : ''}`);
    ws.onopen = () => {
      retryDelay = 500;
      onStatus({ connected: true, error: null });
    };
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      onMessage(msg);
    };
    ws.onclose = (event) => {
      onStatus({ connected: false, error: event.code === 4001 ? 'Clé invalide : ajoute ?key=... à l’adresse' : null });
      setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 5000);
    };
  };
  open();

  return {
    send(msg) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
  };
}
