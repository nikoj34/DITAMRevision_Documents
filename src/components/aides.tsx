import { useState } from 'react';
import { useSession } from '../state/session';
import type { Phase, RemarkStatus } from '../lib/types';
import { REMARK_STATUS_COLORS, REMARK_STATUS_LABELS } from '../lib/types';

/**
 * Bandeau non-ignorable affiché quand un filtre de phase est actif :
 * sans lui, l'utilisateur occasionnel croit que « ses remarques ont
 * disparu » (piège identifié à la revue UX).
 */
export function PhaseBanner({ phases }: { phases: Phase[] }) {
  const phaseFilter = useSession((s) => s.phaseFilter);
  const setPhaseFilter = useSession((s) => s.setPhaseFilter);
  if (!phaseFilter) return null;
  const phase = phases.find((p) => p.id === phaseFilter);
  if (!phase) return null;
  return (
    <div className="phase-banner">
      🔎 Affichage filtré sur la phase <b>{phase.label}</b> — certains éléments sont masqués.{' '}
      <button onClick={() => setPhaseFilter('')}>Tout afficher</button>
    </div>
  );
}

const STATUS_HELP: Record<RemarkStatus, string> = {
  a_traiter: 'remarque émise, personne n’a encore répondu',
  en_cours: 'quelqu’un travaille dessus',
  repondue: 'une réponse a été apportée — à lire et vérifier par l’émetteur',
  a_reverifier: 'un nouvel indice du document est arrivé : vérifier que la correction y figure',
  traitee: 'vérifiée et close par son émetteur (ou la MOA)',
  sans_objet: 'abandonnée ou devenue sans objet (motif dans le fil)',
  reportee: 'sera traitée à la phase suivante (décision tracée)',
};

/** Petit « ? » qui ouvre la légende des statuts — réutilisé partout. */
export function LegendeStatuts() {
  const [open, setOpen] = useState(false);
  return (
    <span className="legende-wrap">
      <button className="legende-btn" onClick={() => setOpen((o) => !o)} title="Que signifient les statuts ?">
        ?
      </button>
      {open && (
        <div className="legende-pop" onMouseLeave={() => setOpen(false)}>
          <b>Les statuts d’une remarque</b>
          {(Object.keys(STATUS_HELP) as RemarkStatus[]).map((s) => (
            <div key={s} className="legende-row">
              <span className="legende-dot" style={{ background: REMARK_STATUS_COLORS[s] }} />
              <span>
                <b>{REMARK_STATUS_LABELS[s]}</b> — {STATUS_HELP[s]}
              </span>
            </div>
          ))}
          <p className="small muted" style={{ marginBottom: 0 }}>
            Seul l’émetteur (ou la MOA / le secrétaire) peut clore une remarque.
          </p>
        </div>
      )}
    </span>
  );
}
