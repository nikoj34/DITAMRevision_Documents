import { create } from 'zustand';
import type { Stakeholder } from '../lib/types';

// Profil courant : persisté en localStorage (pas d'authentification —
// l'application fonctionne en confiance sur un intranet, chaque action
// est signée par le profil choisi).

const PROFILE_KEY = 'revue-docs:profil';

interface SessionState {
  me: Stakeholder | null;
  phaseFilter: string; // '' = toutes les phases du projet courant
  setMe: (s: Stakeholder | null) => void;
  setPhaseFilter: (id: string) => void;
}

function loadProfile(): Stakeholder | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Stakeholder) : null;
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>((set) => ({
  me: loadProfile(),
  phaseFilter: '',
  setMe: (s) => {
    if (s) localStorage.setItem(PROFILE_KEY, JSON.stringify(s));
    else localStorage.removeItem(PROFILE_KEY);
    set({ me: s });
  },
  setPhaseFilter: (id) => set({ phaseFilter: id }),
}));
