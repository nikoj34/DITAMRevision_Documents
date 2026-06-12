import { useMemo } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Badge } from '../../components/ui';
import type { Decision, Doc, DocVersion, Remark, RemarkStatus, Tag } from '../../lib/types';
import {
  OPEN_STATUSES,
  REMARK_STATUS_COLORS,
  REMARK_STATUS_LABELS,
  fmtDate,
  fmtDecisionNum,
  fmtRemarkNum,
  isOverdue,
} from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

export default function DashboardPage() {
  const { project, phases } = useOutletContext<ProjectContext>();
  const phaseFilter = useSession((s) => s.phaseFilter);
  const navigate = useNavigate();

  const { items: remarks } = useList<Remark>(
    'remarks',
    {
      filter: `project = "${project.id}"`,
      expand: 'author,lot,document_version,document_version.document',
    },
    [project.id]
  );
  const { items: decisions } = useList<Decision>('decisions', { filter: `project = "${project.id}"` }, [project.id]);
  const { items: lots } = useList<Tag>('tags', { filter: `project = "${project.id}" && kind = "lot"` }, [project.id]);

  const scoped = useMemo(() => {
    if (!phaseFilter) return remarks;
    return remarks.filter((r) => {
      const dv = r.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
      return dv?.expand?.document?.phase === phaseFilter;
    });
  }, [remarks, phaseFilter]);

  const open = scoped.filter((r) => (OPEN_STATUSES as string[]).includes(r.status));
  const blocking = open.filter((r) => r.criticity === 'bloquante');
  const overdue = scoped.filter(isOverdue);
  const toArbitrate = decisions.filter((d) => d.status === 'a_arbitrer');
  const toRecheck = scoped.filter((r) => r.status === 'a_reverifier');

  const currentPhase = phases.find((p) => p.status === 'en_cours');
  // Décisions actées sans vérification enregistrée sur la phase en cours :
  // c'est la check-list anti-oubli inter-phases.
  const unverified = useMemo(() => {
    if (!currentPhase) return [];
    return decisions.filter(
      (d) =>
        d.status === 'actee' &&
        d.source_phase !== currentPhase.id &&
        !(d.verifications || []).some((v) => v.phase === currentPhase.id)
    );
  }, [decisions, currentPhase]);

  const byLot = useMemo(() => {
    const m = new Map<string, Record<RemarkStatus, number>>();
    const lotLabel = new Map(lots.map((l) => [l.id, l.label]));
    for (const r of scoped) {
      const key = r.lot ? lotLabel.get(r.lot) || 'Autre' : 'Sans lot';
      const rec = m.get(key) || ({} as Record<RemarkStatus, number>);
      rec[r.status] = (rec[r.status] || 0) + 1;
      m.set(key, rec);
    }
    return [...m.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));
  }, [scoped, lots]);

  return (
    <div className="main">
      <div className="page-head">
        <h2>Tableau de bord</h2>
        <span className="muted small">
          {phaseFilter ? phases.find((p) => p.id === phaseFilter)?.label : 'toutes phases'}
        </span>
      </div>

      <div className="kpi-row">
        <Kpi label="Remarques ouvertes" value={open.length} color="#c97a06" />
        <Kpi label="Bloquantes non levées" value={blocking.length} color="#c0392b" />
        <Kpi label="Échéances dépassées" value={overdue.length} color="#b3473e" />
        <Kpi label="À revérifier (nouvel indice)" value={toRecheck.length} color="#8a5fc0" />
        <Kpi label="Décisions à arbitrer" value={toArbitrate.length} color="#d97706" />
      </div>

      {blocking.length > 0 && (
        <div className="alert warn">
          ⚠️ <b>{blocking.length} remarque(s) bloquante(s)</b> encore ouvertes — une validation de phase avec des
          bloquantes non levées doit être un choix assumé, pas un oubli.{' '}
          <Link to={`/projet/${project.id}/remarques`}>Voir le registre</Link>
        </div>
      )}
      {currentPhase && unverified.length > 0 && (
        <div className="alert warn">
          🧭 <b>{unverified.length} décision(s) actée(s)</b> des phases précédentes n’ont pas encore été vérifiées sur
          la phase en cours ({currentPhase.label}) : {unverified.slice(0, 5).map((d) => fmtDecisionNum(d.number)).join(', ')}
          {unverified.length > 5 ? '…' : ''} <Link to={`/projet/${project.id}/decisions`}>Ouvrir le registre des décisions</Link>
        </div>
      )}

      <div className="dash-cols">
        <div className="card">
          <h3 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)' }}>
            Remarques par lot et statut
          </h3>
          {byLot.length === 0 && <p className="muted small">Aucune remarque pour l’instant.</p>}
          {byLot.map(([label, counts]) => {
            const total = sum(counts);
            return (
              <div key={label} className="bar-row">
                <span className="bar-label" title={label}>
                  {label} <span className="muted">({total})</span>
                </span>
                <div className="bar-track">
                  {(Object.keys(REMARK_STATUS_LABELS) as RemarkStatus[]).map((s) =>
                    counts[s] ? (
                      <div
                        key={s}
                        className="bar-seg"
                        style={{ width: `${(counts[s] / total) * 100}%`, background: REMARK_STATUS_COLORS[s] }}
                        title={`${REMARK_STATUS_LABELS[s]} : ${counts[s]}`}
                      />
                    ) : null
                  )}
                </div>
              </div>
            );
          })}
          <div className="small muted" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {(Object.keys(REMARK_STATUS_LABELS) as RemarkStatus[]).map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: REMARK_STATUS_COLORS[s], borderRadius: 2, display: 'inline-block' }} />
                {REMARK_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)' }}>
            En retard d’échéance
          </h3>
          {overdue.length === 0 && <p className="muted small">Rien en retard. 👍</p>}
          {overdue.slice(0, 12).map((r) => (
            <div
              key={r.id}
              className="remark-card"
              style={{ ['--rc-color' as string]: '#b3473e' }}
              onClick={() => navigate(`/projet/${project.id}/remarques`)}
            >
              <div className="rc-head">
                <b>{fmtRemarkNum(r.number)}</b>
                <span>échéance {fmtDate(r.due_date)}</span>
                <Badge color={REMARK_STATUS_COLORS[r.status]}>{REMARK_STATUS_LABELS[r.status]}</Badge>
              </div>
              <div className="rc-body small">{strip(r.body).slice(0, 90)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="kpi" style={{ ['--kpi-color' as string]: color }}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function sum(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

function strip(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}
