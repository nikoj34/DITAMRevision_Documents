import { useMemo } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Badge } from '../../components/ui';
import type { Decision, Doc, DocVersion, Remark } from '../../lib/types';
import {
  OPEN_STATUSES,
  REMARK_STATUS_COLORS,
  REMARK_STATUS_LABELS,
  fmtDate,
  fmtRemarkNum,
  isOverdue,
  plainText,
} from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

const PILOT_ROLES = ['MOA', 'AMO_PROGRAMMISTE', 'SECRETAIRE'];

/**
 * Accueil orienté tâches : répond à « qu'est-ce qu'on attend de moi ? »
 * plutôt qu'à « où sont les données ? » — c'est la page d'arrivée de tous
 * les profils, y compris le relecteur qui ne vient que deux fois par an.
 */
export default function HomePage() {
  const { project, phases } = useOutletContext<ProjectContext>();
  const me = useSession((s) => s.me)!;
  const navigate = useNavigate();

  const currentPhase = phases.find((p) => p.status === 'en_cours');

  const { items: docs } = useList<Doc>(
    'documents',
    {
      filter: currentPhase ? `phase = "${currentPhase.id}" && archived = false` : 'archived = false',
      sort: '-created',
      enabled: !!currentPhase || phases.length === 0,
    },
    [currentPhase?.id]
  );
  const { items: versions } = useList<DocVersion>('document_versions', {}, [project.id]);
  const { items: remarks } = useList<Remark>(
    'remarks',
    { filter: `project = "${project.id}"`, sort: '-created' },
    [project.id]
  );
  const { items: decisions } = useList<Decision>('decisions', { filter: `project = "${project.id}"` }, [
    project.id,
  ]);

  const latestVersionByDoc = useMemo(() => {
    const m = new Map<string, DocVersion>();
    for (const v of versions) {
      const cur = m.get(v.document);
      if (!cur || v.version_num > cur.version_num) m.set(v.document, v);
    }
    return m;
  }, [versions]);

  const mine = remarks.filter((r) => r.author === me.id);
  const mineOpen = mine.filter((r) => (OPEN_STATUSES as string[]).includes(r.status));
  const mineAnswered = mine.filter((r) => r.status === 'repondue');
  const mineToRecheck = mine.filter((r) => r.status === 'a_reverifier');

  const isPilot = PILOT_ROLES.includes(me.role);
  const blocking = remarks.filter(
    (r) => r.criticity === 'bloquante' && (OPEN_STATUSES as string[]).includes(r.status)
  );
  const overdue = remarks.filter(isOverdue);
  const toArbitrate = decisions.filter((d) => d.status === 'a_arbitrer');

  const firstName = me.display_name.split(/\s+/)[0];

  return (
    <div className="main" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <h2>Bonjour {firstName}</h2>
        <span className="muted small">
          {project.name}
          {currentPhase ? ` — phase en cours : ${currentPhase.label}` : ''}
        </span>
      </div>

      {isPilot && (blocking.length > 0 || overdue.length > 0 || toArbitrate.length > 0) && (
        <div className="alert warn">
          ⚠️ Pilotage :{' '}
          {blocking.length > 0 && (
            <>
              <b>{blocking.length} bloquante(s)</b> ouverte(s) ·{' '}
            </>
          )}
          {overdue.length > 0 && (
            <>
              <b>{overdue.length} échéance(s)</b> dépassée(s) ·{' '}
            </>
          )}
          {toArbitrate.length > 0 && (
            <>
              <b>{toArbitrate.length} décision(s)</b> à arbitrer ·{' '}
            </>
          )}
          <Link to={`/projet/${project.id}/tableau-de-bord`}>Voir le tableau de bord</Link>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>
          📄 À relire {currentPhase ? `— ${currentPhase.label}` : ''} ({docs.length})
        </h3>
        {docs.length === 0 ? (
          <p className="muted small">
            Aucun document dans la phase en cours pour le moment. Vous serez sollicité quand le dossier sera déposé.
          </p>
        ) : (
          <table className="data">
            <tbody>
              {docs.slice(0, 8).map((d) => {
                const v = latestVersionByDoc.get(d.id);
                const open = remarks.filter(
                  (r) => v && r.document_version === v.id && (OPEN_STATUSES as string[]).includes(r.status)
                ).length;
                return (
                  <tr key={d.id} className="clickable" onClick={() => navigate(`/projet/${project.id}/documents/${d.id}`)}>
                    <td>
                      <b>{d.title}</b>
                      {v && <span className="small muted"> — indice {v.index_label}</span>}
                    </td>
                    <td className="small muted">{v ? `déposé le ${fmtDate(v.created)}` : 'aucun fichier'}</td>
                    <td>{open > 0 ? <Badge color="#c97a06">{open} remarque(s) ouverte(s)</Badge> : null}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="btn small secondary">Ouvrir →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {docs.length > 8 && (
          <p className="small">
            <Link to={`/projet/${project.id}/documents`}>Voir les {docs.length} documents…</Link>
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>💬 Vos remarques ({mine.length})</h3>
        {mine.length === 0 ? (
          <p className="muted small">
            Vous n’avez pas encore déposé de remarque. Ouvrez un document ci-dessus, puis cliquez sur «&nbsp;+ Ajouter
            une remarque&nbsp;» et épinglez-la sur le plan.
          </p>
        ) : (
          <>
            <p className="small">
              <Badge color={REMARK_STATUS_COLORS.a_traiter}>{mineOpen.length} en cours de traitement</Badge>{' '}
              {mineAnswered.length > 0 && (
                <Badge color={REMARK_STATUS_COLORS.repondue}>{mineAnswered.length} réponse(s) reçue(s) — à lire</Badge>
              )}{' '}
              {mineToRecheck.length > 0 && (
                <Badge color={REMARK_STATUS_COLORS.a_reverifier}>
                  {mineToRecheck.length} à revérifier sur le nouvel indice
                </Badge>
              )}
            </p>
            {[...mineAnswered, ...mineToRecheck].slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="remark-card"
                style={{ ['--rc-color' as string]: REMARK_STATUS_COLORS[r.status] }}
                onClick={() => navigate(`/projet/${project.id}/remarques?auteur=moi`)}
              >
                <div className="rc-head">
                  <b>{fmtRemarkNum(r.number)}</b>
                  <Badge color={REMARK_STATUS_COLORS[r.status]}>{REMARK_STATUS_LABELS[r.status]}</Badge>
                </div>
                <div className="rc-body small">{plainText(r.body).slice(0, 110)}</div>
              </div>
            ))}
            <p className="small">
              <Link to={`/projet/${project.id}/remarques?auteur=moi`}>Voir toutes mes remarques →</Link>
            </p>
          </>
        )}
      </div>

      <div className="alert info">
        ℹ️ <b>Comment ça marche, en 4 étapes :</b> 1. Ouvrez un document ci-dessus — 2. Cliquez sur «&nbsp;+ Ajouter
        une remarque&nbsp;» puis sur le plan (ou tracez un rectangle) — 3. Écrivez votre remarque (seul le texte est
        obligatoire) — 4. Suivez la réponse depuis cette page. Les documents originaux ne sont jamais modifiés, et
        seule la personne qui a émis une remarque peut la clore.
      </div>
    </div>
  );
}

