import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useList } from '../../lib/hooks';
import { Badge, EmptyState } from '../../components/ui';
import RemarkDrawer from '../remarques/RemarkDrawer';
import type { Decision, Doc, DocVersion, Remark, Tag } from '../../lib/types';
import {
  DECISION_STATUS_COLORS,
  DECISION_STATUS_LABELS,
  REMARK_STATUS_COLORS,
  REMARK_STATUS_LABELS,
  fmtDate,
  fmtDecisionNum,
  fmtRemarkNum,
} from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

/**
 * Suivi par sujet : l'historique complet d'un local, d'un ouvrage ou d'un
 * thème à travers toutes les phases. Les documents sont reformulés et
 * réordonnés d'une phase à l'autre — le sujet, lui, est invariant : c'est
 * lui qui relie « petite description en ESQ » et « notice détaillée en APS ».
 */
export default function SubjectsPage() {
  const { project, phases } = useOutletContext<ProjectContext>();

  const { items: sujets } = useList<Tag>(
    'tags',
    { filter: `project = "${project.id}" && kind != "lot"`, sort: 'label' },
    [project.id]
  );
  const { items: remarks, reload } = useList<Remark>(
    'remarks',
    {
      filter: `project = "${project.id}"`,
      sort: 'created',
      expand: 'author,lot,document_version,document_version.document',
    },
    [project.id]
  );
  const { items: decisions } = useList<Decision>(
    'decisions',
    { filter: `project = "${project.id}"`, sort: 'created', expand: 'source_phase,decided_by' },
    [project.id]
  );

  const [selectedSujet, setSelectedSujet] = useState('');
  const [openRemark, setOpenRemark] = useState<Remark | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of remarks) for (const t of r.themes || []) m.set(t, (m.get(t) || 0) + 1);
    for (const d of decisions) for (const t of d.themes || []) m.set(t, (m.get(t) || 0) + 1);
    return m;
  }, [remarks, decisions]);

  const sujet = sujets.find((s) => s.id === selectedSujet);

  // Regroupement par phase, dans l'ordre de l'opération
  const timeline = useMemo(() => {
    if (!sujet) return [];
    const remarksOf = remarks.filter((r) => (r.themes || []).includes(sujet.id));
    const decisionsOf = decisions.filter((d) => (d.themes || []).includes(sujet.id));
    const phaseOf = (r: Remark): string => {
      const dv = r.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
      return dv?.expand?.document?.phase || '';
    };
    const groups = phases.map((p) => ({
      phase: p,
      remarks: remarksOf.filter((r) => phaseOf(r) === p.id),
      decisions: decisionsOf.filter((d) => d.source_phase === p.id),
    }));
    const orphan = {
      phase: null,
      remarks: remarksOf.filter((r) => !phases.some((p) => phaseOf(r) === p.id)),
      decisions: decisionsOf.filter((d) => !phases.some((p) => d.source_phase === p.id)),
    };
    return [...groups, orphan].filter((g) => g.remarks.length || g.decisions.length);
  }, [sujet, remarks, decisions, phases]);

  return (
    <div className="main">
      <div className="page-head">
        <h2>Suivi par sujet</h2>
        <span className="muted small">l’histoire d’un local, d’un ouvrage ou d’un thème à travers les phases</span>
      </div>
      <p className="small muted" style={{ maxWidth: 760 }}>
        D’une phase à l’autre, les documents changent d’ordre, de termes et de niveau de détail. Le sujet, lui, ne
        change pas : étiquetez les remarques et décisions (« Hall d’entrée », « Local 2.014 », « Escalier aile B »…)
        et retrouvez ici toute leur histoire, de l’esquisse au DCE. Les sujets se créent dans « Paramètres ».
      </p>

      {sujets.length === 0 ? (
        <EmptyState
          icon="🧵"
          text="Aucun sujet de suivi défini."
          hint="Créez vos sujets (locaux, ouvrages, thèmes) dans Paramètres, puis étiquetez les remarques depuis leur fiche."
        />
      ) : (
        <>
          <div className="filters">
            {sujets.map((s) => (
              <button
                key={s.id}
                className={`status-pill ${selectedSujet === s.id ? 'current' : ''}`}
                style={{ '--sp-color': s.kind === 'local' ? '#1c4d77' : '#0e7d7d' } as React.CSSProperties}
                onClick={() => setSelectedSujet(s.id === selectedSujet ? '' : s.id)}
              >
                {s.label} <span className="muted">({counts.get(s.id) || 0})</span>
              </button>
            ))}
          </div>

          {!sujet && <EmptyState icon="👆" text="Choisissez un sujet pour afficher son histoire." />}
          {sujet && timeline.length === 0 && (
            <EmptyState
              icon="🧵"
              text={`Rien n’est encore rattaché à « ${sujet.label} ».`}
              hint="Ouvrez une remarque ou une décision et cliquez sur ce sujet dans sa fiche."
            />
          )}

          {sujet &&
            timeline.map((g, i) => (
              <div key={g.phase?.id || `orphan-${i}`} className="card" style={{ marginBottom: 14 }}>
                <h3 style={{ marginBottom: 10 }}>
                  {g.phase ? g.phase.label : 'Hors phase / général'}
                  {g.phase?.status === 'en_cours' && (
                    <span className="small" style={{ color: 'var(--statut-close)' }}>
                      {' '}
                      (en cours)
                    </span>
                  )}
                </h3>
                {g.decisions.map((d) => (
                  <div key={d.id} className="thread-bubble status-change" style={{ marginBottom: 8 }}>
                    <div className="tb-meta">
                      ⚖️ Décision {fmtDecisionNum(d.number)} ·{' '}
                      {d.expand?.decided_by?.display_name || 'à arbitrer'} · {fmtDate(d.decided_at || d.created)}{' '}
                      <Badge color={DECISION_STATUS_COLORS[d.status]}>{DECISION_STATUS_LABELS[d.status]}</Badge>
                    </div>
                    <b>{d.title}</b>
                    {d.meeting_ref && <div className="small muted">{d.meeting_ref}</div>}
                  </div>
                ))}
                {g.remarks.map((r) => {
                  const dv = r.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
                  return (
                    <div
                      key={r.id}
                      className="remark-card"
                      style={{ ['--rc-color' as string]: REMARK_STATUS_COLORS[r.status] }}
                      onClick={() => setOpenRemark(r)}
                    >
                      <div className="rc-head">
                        <b>{fmtRemarkNum(r.number)}</b>
                        {dv?.expand?.document && (
                          <span>
                            {dv.expand.document.title} ind. {dv.index_label}
                          </span>
                        )}
                        <span>{fmtDate(r.created)}</span>
                        <Badge color={REMARK_STATUS_COLORS[r.status]}>{REMARK_STATUS_LABELS[r.status]}</Badge>
                      </div>
                      <div className="rc-body">{stripHtml(r.body).slice(0, 220)}</div>
                      <div className="rc-head" style={{ marginTop: 4 }}>
                        {r.expand?.author?.display_name}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </>
      )}

      {openRemark && (
        <RemarkDrawer
          remark={remarks.find((r) => r.id === openRemark.id) || openRemark}
          onClose={() => setOpenRemark(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}
