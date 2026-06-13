import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Badge, EmptyState } from '../../components/ui';
import { LegendeStatuts, PhaseBanner } from '../../components/aides';
import { exportRegister } from '../../lib/excel';
import RemarkDrawer from './RemarkDrawer';
import type { Criticity, Doc, DocVersion, Remark, RemarkReply, RemarkStatus, Stakeholder, Tag } from '../../lib/types';
import {
  CRITICITY_COLORS,
  CRITICITY_LABELS,
  REMARK_STATUS_COLORS,
  REMARK_STATUS_LABELS,
  fmtDate,
  fmtRemarkNum,
  isOverdue,
  plainText,
} from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

export default function RemarksPage() {
  const { project, phases } = useOutletContext<ProjectContext>();
  const phaseFilter = useSession((s) => s.phaseFilter);
  const me = useSession((s) => s.me)!;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // « ?auteur=moi » : raccourci de l'Accueil vers ses propres remarques.
  const mineOnly = searchParams.get('auteur') === 'moi';

  const { items: remarks, reload } = useList<Remark>(
    'remarks',
    {
      filter: `project = "${project.id}"`,
      sort: '-number',
      expand: 'author,assigned_to,lot,document_version,document_version.document',
    },
    [project.id]
  );
  const { items: lots } = useList<Tag>('tags', { filter: `project = "${project.id}" && kind = "lot"`, sort: 'label' }, [
    project.id,
  ]);
  const { items: people } = useList<Stakeholder>('stakeholders', { sort: 'display_name' });

  const [status, setStatus] = useState('');
  const [crit, setCrit] = useState('');
  const [lot, setLot] = useState('');
  const [author, setAuthor] = useState(mineOnly ? me.id : '');
  const [search, setSearch] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [selected, setSelected] = useState<Remark | null>(null);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = search
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return remarks.filter((r) => {
      const dv = r.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
      const docPhase = dv?.expand?.document?.phase || '';
      if (phaseFilter && docPhase !== phaseFilter) return false;
      if (status && r.status !== status) return false;
      if (crit && r.criticity !== crit) return false;
      if (lot && r.lot !== lot) return false;
      if (author && r.author !== author) return false;
      if (onlyOverdue && !isOverdue(r)) return false;
      if (q) {
        const hay = `${plainText(r.body)} ${r.text_ref} ${r.external_ref} ${fmtRemarkNum(r.number)} ${
          dv?.expand?.document?.title || ''
        } ${r.expand?.author?.display_name || ''}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [remarks, phaseFilter, status, crit, lot, author, search, onlyOverdue]);

  async function doExport() {
    setExporting(true);
    try {
      // Dernière réponse de chaque fil pour la colonne « Réponse » de l'export.
      const replies = await pb.collection('remark_replies').getFullList<RemarkReply>({
        filter: `kind = "reponse"`,
        sort: 'created',
        expand: 'author',
      });
      const lastReplies: Record<string, { body: string; date: string; author: string }> = {};
      for (const rep of replies) {
        lastReplies[rep.remark] = {
          body: rep.body,
          date: fmtDate(rep.created),
          author: rep.expand?.author?.display_name || '',
        };
      }
      await exportRegister(filtered, { projectName: project.name, phases, lastReplies });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="main">
      <div className="page-head">
        <h2>Remarques</h2>
        <LegendeStatuts />
        <span className="muted small">
          {filtered.length} / {remarks.length}
        </span>
        <div className="view-toggle">
          <button className="active">Liste</button>
          <button onClick={() => navigate(`/projet/${project.id}/sujets`)}>Par sujet</button>
        </div>
        <div className="spacer" />
        <button className="btn secondary" onClick={() => navigate(`/projet/${project.id}/import`)}>
          📥 Importer (Excel / retour navette)
        </button>
        <button className="btn secondary" onClick={doExport} disabled={exporting} title="Fiche navette protégée à transmettre à la MOE">
          ⬇ Exporter la fiche navette (vue filtrée)
        </button>
      </div>

      <PhaseBanner phases={phases} />

      <div className="filters">
        <button
          className={`status-pill ${author === me.id ? 'current' : ''}`}
          style={{ '--sp-color': '#1c4d77' } as React.CSSProperties}
          onClick={() => setAuthor(author === me.id ? '' : me.id)}
        >
          Mes remarques
        </button>
        <input
          type="search"
          placeholder="🔍 Rechercher dans les remarques…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {(Object.keys(REMARK_STATUS_LABELS) as RemarkStatus[]).map((s) => (
            <option key={s} value={s}>
              {REMARK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={crit} onChange={(e) => setCrit(e.target.value)}>
          <option value="">Toutes criticités</option>
          {(Object.keys(CRITICITY_LABELS) as Criticity[]).map((c) => (
            <option key={c} value={c}>
              {CRITICITY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={lot} onChange={(e) => setLot(e.target.value)}>
          <option value="">Tous lots</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <select value={author} onChange={(e) => setAuthor(e.target.value)}>
          <option value="">Tous émetteurs</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          En retard
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="💬" text="Aucune remarque ne correspond aux filtres." hint="Les remarques se créent depuis la visionneuse d’un document, ou par import Excel." />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>N°</th>
              <th>Observation</th>
              <th>Document</th>
              <th>Localisation</th>
              <th>Lot</th>
              <th>Émetteur</th>
              <th>Criticité</th>
              <th>Échéance</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const dv = r.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
              const docRec = dv?.expand?.document;
              return (
                <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                  <td>
                    <b>{fmtRemarkNum(r.number)}</b>
                    {r.external_ref && <div className="small muted">{r.external_ref}</div>}
                  </td>
                  <td style={{ maxWidth: 380 }}>{plainText(r.body).slice(0, 140)}</td>
                  <td>
                    {docRec ? (
                      <a
                        href={`/projet/${project.id}/documents/${docRec.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/projet/${project.id}/documents/${docRec.id}`);
                        }}
                      >
                        {docRec.title}
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {dv && <span className="small muted"> ind. {dv.index_label}</span>}
                  </td>
                  <td className="small">{[r.page ? `p.${r.page}` : '', r.text_ref].filter(Boolean).join(' / ')}</td>
                  <td className="small">{r.expand?.lot?.label || ''}</td>
                  <td className="small">{r.expand?.author?.display_name || ''}</td>
                  <td>
                    {r.criticity && (
                      <Badge color={CRITICITY_COLORS[r.criticity]}>{CRITICITY_LABELS[r.criticity]}</Badge>
                    )}
                  </td>
                  <td className="small" style={isOverdue(r) ? { color: '#c0392b', fontWeight: 600 } : undefined}>
                    {fmtDate(r.due_date)}
                  </td>
                  <td>
                    <Badge color={REMARK_STATUS_COLORS[r.status]}>{REMARK_STATUS_LABELS[r.status]}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selected && (
        <RemarkDrawer
          remark={remarks.find((r) => r.id === selected.id) || selected}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

