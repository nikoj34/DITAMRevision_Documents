import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { nextNumber, useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Badge, Drawer, EmptyState, Field, Modal } from '../../components/ui';
import { exportDecisions } from '../../lib/excel';
import type { Decision, DecisionStatus, DecisionVerification, Phase, Tag } from '../../lib/types';
import {
  DECISION_STATUS_COLORS,
  DECISION_STATUS_LABELS,
  fmtDate,
  fmtDecisionNum,
  fmtRemarkNum,
} from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

const VERIF_LABELS: Record<DecisionVerification['result'], string> = {
  conforme: '✅ Conforme',
  non_conforme: '❌ Non conforme',
  non_verifiable: '⏳ Non vérifiable à ce stade',
};

export default function DecisionsPage() {
  const { project, phases } = useOutletContext<ProjectContext>();
  const me = useSession((s) => s.me)!;
  const { items: decisions, reload } = useList<Decision>(
    'decisions',
    {
      filter: `project = "${project.id}"`,
      sort: '-number',
      expand: 'source_phase,decided_by,source_remarks',
    },
    [project.id]
  );

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Decision | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return decisions.filter((d) => {
      if (status && d.status !== status) return false;
      if (q && !`${d.title} ${d.body} ${fmtDecisionNum(d.number)} ${d.meeting_ref}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [decisions, status, search]);

  return (
    <div className="main">
      <div className="page-head">
        <h2>Registre des décisions</h2>
        <span className="muted small">mémoire de l’opération, toutes phases confondues</span>
        <div className="spacer" />
        <button className="btn secondary" onClick={() => exportDecisions(filtered, project.name)} disabled={!filtered.length}>
          ⬇ Exporter Excel
        </button>
        <button className="btn" onClick={() => setCreating(true)}>
          + Nouvelle décision
        </button>
      </div>

      <div className="filters">
        <input type="search" placeholder="🔍 Rechercher une décision…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {(Object.keys(DECISION_STATUS_LABELS) as DecisionStatus[]).map((s) => (
            <option key={s} value={s}>
              {DECISION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="⚖️"
          text="Aucune décision au registre."
          hint="Créez une décision ici, ou transformez une remarque en décision depuis sa fiche. Le registre garde la mémoire de ce qui a été acté, abandonné, reporté ou modifié, phase après phase."
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>N°</th>
              <th>Intitulé</th>
              <th>Statut</th>
              <th>Phase d’origine</th>
              <th>Décidé par</th>
              <th>Date</th>
              <th>Réf. CR</th>
              <th>Vérifications</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="clickable" onClick={() => setSelected(d)}>
                <td>
                  <b>{fmtDecisionNum(d.number)}</b>
                </td>
                <td style={{ maxWidth: 420 }}>{d.title}</td>
                <td>
                  <Badge color={DECISION_STATUS_COLORS[d.status]}>{DECISION_STATUS_LABELS[d.status]}</Badge>
                </td>
                <td className="small">{d.expand?.source_phase?.label || ''}</td>
                <td className="small">{d.expand?.decided_by?.display_name || ''}</td>
                <td className="small">{fmtDate(d.decided_at)}</td>
                <td className="small">{d.meeting_ref}</td>
                <td className="small">
                  {(d.verifications || []).map((v, i) => (
                    <span key={i} title={`${v.phase_label} : ${VERIF_LABELS[v.result]}`}>
                      {v.result === 'conforme' ? '✅' : v.result === 'non_conforme' ? '❌' : '⏳'}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <DecisionForm
          projectId={project.id}
          phases={phases}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {selected && (
        <DecisionDrawer
          decision={decisions.find((d) => d.id === selected.id) || selected}
          phases={phases}
          meName={me.display_name}
          meId={me.id}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function DecisionForm({
  projectId,
  phases,
  onClose,
  onSaved,
}: {
  projectId: string;
  phases: Phase[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useSession((s) => s.me)!;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<DecisionStatus>('a_arbitrer');
  const [phase, setPhase] = useState(phases.find((p) => p.status === 'en_cours')?.id || phases[0]?.id || '');
  const [meetingRef, setMeetingRef] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const number = await nextNumber('decisions', projectId);
      await pb.collection('decisions').create({
        project: projectId,
        number,
        title: title.trim(),
        body: body.trim(),
        status,
        source_phase: phase || null,
        decided_by: status !== 'a_arbitrer' ? me.id : null,
        decided_at: status !== 'a_arbitrer' ? new Date().toISOString() : null,
        meeting_ref: meetingRef.trim(),
        history: [
          {
            date: new Date().toISOString(),
            old_status: '',
            new_status: status,
            by_name: me.display_name,
            note: 'Création de la décision',
          },
        ],
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nouvelle décision" onClose={onClose}>
      <Field label="Intitulé (formulation courte et vérifiable)" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder="Ex. : Suppression de la 2e cage d’escalier aile B ; évacuation par l’escalier 1 élargi à 1,40 m"
        />
      </Field>
      <Field label="Détail / contexte">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="form-row">
        <Field label="Statut">
          <select value={status} onChange={(e) => setStatus(e.target.value as DecisionStatus)}>
            {(Object.keys(DECISION_STATUS_LABELS) as DecisionStatus[]).map((s) => (
              <option key={s} value={s}>
                {DECISION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phase d’origine">
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Référence (CR de réunion, courrier, COPIL…)">
        <input value={meetingRef} onChange={(e) => setMeetingRef(e.target.value)} placeholder="CR réunion MOE n°12 du 03/06/2026" />
      </Field>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !title.trim()}>
          Enregistrer au registre
        </button>
      </div>
    </Modal>
  );
}

function DecisionDrawer({
  decision,
  phases,
  meName,
  meId,
  onClose,
  onChanged,
}: {
  decision: Decision;
  phases: Phase[];
  meName: string;
  meId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [verifPhase, setVerifPhase] = useState(phases.find((p) => p.status === 'en_cours')?.id || '');
  const [verifNote, setVerifNote] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const { items: sujets } = useList<Tag>(
    'tags',
    { filter: `project = "${decision.project}" && kind != "lot"`, sort: 'label' },
    [decision.project]
  );

  async function toggleSujet(id: string) {
    const cur = decision.themes || [];
    const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
    await pb.collection('decisions').update(decision.id, { themes: next });
    onChanged();
  }

  async function setStatus(s: DecisionStatus) {
    if (s === decision.status) return;
    setBusy(true);
    try {
      const history = [
        ...(decision.history || []),
        {
          date: new Date().toISOString(),
          old_status: decision.status,
          new_status: s,
          by_name: meName,
          note: statusNote.trim(),
        },
      ];
      const patch: Record<string, unknown> = { status: s, history };
      if (s !== 'a_arbitrer' && !decision.decided_at) {
        patch.decided_at = new Date().toISOString();
        patch.decided_by = meId;
      }
      await pb.collection('decisions').update(decision.id, patch);
      setStatusNote('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function addVerification(result: DecisionVerification['result']) {
    const phase = phases.find((p) => p.id === verifPhase);
    if (!phase) return;
    setBusy(true);
    try {
      const verifications = [
        ...(decision.verifications || []),
        {
          phase: phase.id,
          phase_label: phase.label,
          result,
          by: meId,
          by_name: meName,
          date: new Date().toISOString(),
          note: verifNote.trim(),
          remark: '',
        },
      ];
      await pb.collection('decisions').update(decision.id, { verifications });
      setVerifNote('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={
        <span>
          {fmtDecisionNum(decision.number)}{' '}
          <Badge color={DECISION_STATUS_COLORS[decision.status]}>{DECISION_STATUS_LABELS[decision.status]}</Badge>
        </span>
      }
      onClose={onClose}
    >
      <h4>{decision.title}</h4>
      {decision.body && <p style={{ whiteSpace: 'pre-wrap' }}>{stripHtml(decision.body)}</p>}
      <dl className="meta-grid">
        <dt>Phase d’origine</dt>
        <dd>{decision.expand?.source_phase?.label || '—'}</dd>
        <dt>Décidé par</dt>
        <dd>
          {decision.expand?.decided_by?.display_name || '—'}
          {decision.decided_at ? ` le ${fmtDate(decision.decided_at)}` : ''}
        </dd>
        {decision.meeting_ref && (
          <>
            <dt>Référence</dt>
            <dd>{decision.meeting_ref}</dd>
          </>
        )}
        {(decision.expand?.source_remarks?.length || 0) > 0 && (
          <>
            <dt>Remarques liées</dt>
            <dd>{decision.expand!.source_remarks!.map((r) => fmtRemarkNum(r.number)).join(', ')}</dd>
          </>
        )}
      </dl>

      {sujets.length > 0 && (
        <>
          <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)' }}>
            Sujets de suivi
          </h4>
          <div className="status-buttons">
            {sujets.map((s) => (
              <button
                key={s.id}
                className={`status-pill ${(decision.themes || []).includes(s.id) ? 'current' : ''}`}
                style={{ '--sp-color': s.kind === 'local' ? '#1c4d77' : '#0e7d7d' } as React.CSSProperties}
                onClick={() => toggleSujet(s.id)}
                disabled={busy}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)' }}>
        Changer le statut
      </h4>
      <div className="status-buttons">
        {(Object.keys(DECISION_STATUS_LABELS) as DecisionStatus[]).map((s) => (
          <button
            key={s}
            className={`status-pill ${s === decision.status ? 'current' : ''}`}
            style={{ '--sp-color': DECISION_STATUS_COLORS[s] } as React.CSSProperties}
            onClick={() => setStatus(s)}
            disabled={busy}
          >
            {DECISION_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <Field label="Note de changement de statut (motif, référence d’arbitrage)">
        <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Saisir la note avant de cliquer sur le nouveau statut" />
      </Field>

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)', marginTop: 16 }}>
        Vérification par phase
      </h4>
      <p className="small muted">
        À chaque nouvelle phase, vérifiez que la décision est bien reprise dans les nouveaux documents — même
        reformulée. C’est la chaîne de preuve de l’opération.
      </p>
      {(decision.verifications || []).map((v, i) => (
        <div key={i} className="thread-bubble status-change" style={{ marginBottom: 6 }}>
          <b>{v.phase_label}</b> — {VERIF_LABELS[v.result]} <span className="muted">par {v.by_name} le {fmtDate(v.date)}</span>
          {v.note && <div className="small">{v.note}</div>}
        </div>
      ))}
      <div className="form-row">
        <Field label="Phase vérifiée">
          <select value={verifPhase} onChange={(e) => setVerifPhase(e.target.value)}>
            <option value="">—</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preuve / note (document, page…)">
          <input value={verifNote} onChange={(e) => setVerifNote(e.target.value)} placeholder="Plan A-201 ind. C, p. 4" />
        </Field>
      </div>
      <div className="status-buttons">
        <button className="btn small" onClick={() => addVerification('conforme')} disabled={busy || !verifPhase}>
          ✅ Conforme
        </button>
        <button className="btn small danger" onClick={() => addVerification('non_conforme')} disabled={busy || !verifPhase}>
          ❌ Non conforme
        </button>
        <button className="btn small secondary" onClick={() => addVerification('non_verifiable')} disabled={busy || !verifPhase}>
          ⏳ Non vérifiable
        </button>
      </div>

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)', marginTop: 16 }}>
        Historique
      </h4>
      <div className="thread">
        {(decision.history || []).map((h, i) => (
          <div key={i} className="thread-bubble status-change">
            <div className="tb-meta">
              {h.by_name} · {fmtDate(h.date)}
            </div>
            {h.old_status ? `${DECISION_STATUS_LABELS[h.old_status as DecisionStatus] || h.old_status} → ` : ''}
            {DECISION_STATUS_LABELS[h.new_status as DecisionStatus] || h.new_status}
            {h.note && <div className="small">{h.note}</div>}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}
