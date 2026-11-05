import { resolve } from 'node:path';
import { WorldStore } from './world.js';

/** Fichier du monde : ARCHIPEL_WORLD, sinon ./world.json dans le dossier courant (créé à partir du monde d'exemple). */
export function storeFromEnv() {
  return new WorldStore(resolve(process.env.ARCHIPEL_WORLD || 'world.json'));
}
