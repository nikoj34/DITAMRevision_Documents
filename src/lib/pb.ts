import PocketBase from 'pocketbase';

// URL du serveur PocketBase : configurable via .env (VITE_PB_URL),
// sinon même origine que l'application (cas du déploiement derrière
// un reverse-proxy sur le serveur CIRAD), sinon localhost en dev.
const PB_URL =
  import.meta.env.VITE_PB_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin);

export const pb = new PocketBase(PB_URL);

// Pas d'auto-annulation : plusieurs vues chargent les mêmes collections.
pb.autoCancellation(false);
