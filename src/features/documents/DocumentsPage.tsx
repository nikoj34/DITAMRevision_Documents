import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Badge, EmptyState, Field, Modal } from '../../components/ui';
import { PhaseBanner } from '../../components/aides';
import { carryOverRemarks } from '../remarques/remarkApi';
import type { Doc, DocCategory, DocVersion, Phase, Remark, Tag } from '../../lib/types';
import { DOC_CATEGORY_LABELS, OPEN_STATUSES, fmtDate } from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

export default function DocumentsPage() {
  const { project, phases } = useOutletContext<ProjectContext>();
  const me = useSession((s) => s.me)!;
  const phaseFilter = useSession((s) => s.phaseFilter);
  const navigate = useNavigate();

  const phaseIds = phases.map((p) => p.id);
  const docFilter = phaseFilter
    ? `phase = "${phaseFilter}" && archived = false`
    : phaseIds.length
      ? `(${phaseIds.map((id) => `phase = "${id}"`).join(' || ')}) && archived = false`
      : 'archived = false';

  const { items: docs, reload } = useList<Doc>('documents', { filter: docFilter, sort: 'title' }, [
    project.id,
    phaseFilter,
    phaseIds.join(','),
  ]);
  const { items: versions } = useList<DocVersion>('document_versions', {}, [project.id]);
  const { items: remarks } = useList<Remark>('remarks', { filter: `project = "${project.id}"` }, [project.id]);
  const { items: lots } = useList<Tag>('tags', { filter: `project = "${project.id}" && kind = "lot"`, sort: 'label' }, [
    project.id,
  ]);

  const [adding, setAdding] = useState(false);
  const [versionFor, setVersionFor] = useState<Doc | null>(null);

  const versionsByDoc = useMemo(() => {
    const m = new Map<string, DocVersion[]>();
    for (const v of versions) {
      const arr = m.get(v.document) || [];
      arr.push(v);
      m.set(v.document, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.version_num - a.version_num);
    return m;
  }, [versions]);

  const openCountByVersion = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of remarks) {
      if (r.document_version && (OPEN_STATUSES as string[]).includes(r.status)) {
        m.set(r.document_version, (m.get(r.document_version) || 0) + 1);
      }
    }
    return m;
  }, [remarks]);

  const phaseById = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases]);
  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);

  return (
    <div className="main">
      <div className="page-head">
        <h2>Documents</h2>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>
          + Déposer un document
        </button>
      </div>
      <PhaseBanner phases={phases} />
      {docs.length === 0 ? (
        <EmptyState
          icon="📄"
          text="Aucun document dans cette phase."
          hint="Déposez les pièces du dossier (plans, notices, CCTP, estimations…). Chaque document garde l’historique de ses indices A, B, C…"
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Document</th>
              <th>Phase</th>
              <th>Catégorie</th>
              <th>Lot</th>
              <th>Indice courant</th>
              <th>Remarques ouvertes</th>
              <th>Dépôt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const vs = versionsByDoc.get(d.id) || [];
              const current = vs[0];
              const openCount = current ? openCountByVersion.get(current.id) || 0 : 0;
              return (
                <tr key={d.id} className="clickable" onClick={() => navigate(`/projet/${project.id}/documents/${d.id}`)}>
                  <td>
                    <b>{d.title}</b>
                    {d.doc_code && <div className="small muted">{d.doc_code}</div>}
                  </td>
                  <td>{phaseById.get(d.phase)?.label || ''}</td>
                  <td>{d.category ? DOC_CATEGORY_LABELS[d.category] : ''}</td>
                  <td>{d.lot ? lotById.get(d.lot)?.label || '' : ''}</td>
                  <td>
                    {current ? (
                      <Badge color="#1c4d77">Indice {current.index_label}</Badge>
                    ) : (
                      <span className="muted small">aucun fichier</span>
                    )}
                    {vs.length > 1 && <span className="small muted"> ({vs.length} versions)</span>}
                  </td>
                  <td>{openCount > 0 ? <Badge color="#c97a06">{openCount}</Badge> : <span className="muted">—</span>}</td>
                  <td className="small muted">{current ? fmtDate(current.created) : ''}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn small secondary" onClick={() => setVersionFor(d)}>
                      + Nouvel indice
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {adding && (
        <DocumentForm
          phases={phases}
          lots={lots}
          defaultPhase={phaseFilter || phases.find((p) => p.status === 'en_cours')?.id || phases[0]?.id || ''}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {versionFor && (
        <VersionForm
          doc={versionFor}
          existing={versionsByDoc.get(versionFor.id) || []}
          onClose={() => setVersionFor(null)}
          onSaved={() => setVersionFor(null)}
          meId={me.id}
        />
      )}
    </div>
  );
}

function nextIndexLabel(existing: DocVersion[]): string {
  if (!existing.length) return 'A';
  const last = existing[0].index_label.toUpperCase();
  if (/^[A-Y]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  return String(existing.length + 1);
}

function DocumentForm({
  phases,
  lots,
  defaultPhase,
  onClose,
  onSaved,
}: {
  phases: Phase[];
  lots: Tag[];
  defaultPhase: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useSession((s) => s.me)!;
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState(defaultPhase);
  const [category, setCategory] = useState<DocCategory>('plan');
  const [lot, setLot] = useState('');
  const [indexLabel, setIndexLabel] = useState('A');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!title.trim() || !phase) return;
    setBusy(true);
    try {
      const doc = await pb.collection('documents').create<Doc>({
        phase,
        title: title.trim(),
        doc_code: code.trim(),
        category,
        lot: lot || null,
        archived: false,
      });
      if (file) {
        const fd = new FormData();
        fd.set('document', doc.id);
        fd.set('index_label', indexLabel.trim() || 'A');
        fd.set('version_num', '1');
        fd.set('file', file);
        fd.set('is_pdf', String(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')));
        fd.set('uploaded_by', me.id);
        fd.set('issue_date', new Date().toISOString());
        await pb.collection('document_versions').create(fd);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Déposer un document" onClose={onClose}>
      {err && <div className="alert error">{err}</div>}
      <Field label="Titre du document" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Plan RDC, Notice CVC, CCTP lot 08…" />
      </Field>
      <div className="form-row">
        <Field label="Code / référence">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="APS-ARC-PLN-102" />
        </Field>
        <Field label="Indice initial">
          <input value={indexLabel} onChange={(e) => setIndexLabel(e.target.value)} placeholder="A" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Phase" required>
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Catégorie">
          <select value={category} onChange={(e) => setCategory(e.target.value as DocCategory)}>
            {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map((c) => (
              <option key={c} value={c}>
                {DOC_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lot">
          <select value={lot} onChange={(e) => setLot(e.target.value)}>
            <option value="">—</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Fichier (PDF affiché dans l’app ; Word/Excel stockés et téléchargeables)">
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !title.trim()}>
          Déposer
        </button>
      </div>
    </Modal>
  );
}

function VersionForm({
  doc,
  existing,
  meId,
  onClose,
  onSaved,
}: {
  doc: Doc;
  existing: DocVersion[];
  meId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useSession((s) => s.me)!;
  const [indexLabel, setIndexLabel] = useState(nextIndexLabel(existing));
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [carry, setCarry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<number | null>(null);
  void meId;

  const previous = existing[0];

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('document', doc.id);
      fd.set('index_label', indexLabel.trim() || nextIndexLabel(existing));
      fd.set('version_num', String((previous?.version_num || 0) + 1));
      fd.set('file', file);
      fd.set('is_pdf', String(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')));
      fd.set('uploaded_by', me.id);
      fd.set('issue_date', new Date().toISOString());
      fd.set('comment', comment.trim());
      const created = await pb.collection('document_versions').create<DocVersion>(fd);
      let carried = 0;
      if (carry && previous) {
        carried = await carryOverRemarks(previous.id, created.id, me);
      }
      setDone(carried);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <Modal title={`Indice ${indexLabel} déposé`} onClose={onSaved}>
        <div className="alert info">
          Le nouvel indice est en ligne.{' '}
          {done > 0
            ? `${done} remarque(s) non soldée(s) ont été reportées sur ce nouvel indice avec le statut « à revérifier ». Personne ne clôt automatiquement : chaque remarque devra être vérifiée puis close par son émetteur.`
            : 'Aucune remarque ouverte à reporter.'}
        </div>
        <div className="form-actions">
          <button className="btn" onClick={onSaved}>
            Fermer
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Nouvel indice — ${doc.title}`} onClose={onClose}>
      {err && <div className="alert error">{err}</div>}
      {previous && (
        <p className="small muted">
          Indice actuel : <b>{previous.index_label}</b> (déposé le {fmtDate(previous.created)})
        </p>
      )}
      <div className="form-row">
        <Field label="Nouvel indice" required>
          <input value={indexLabel} onChange={(e) => setIndexLabel(e.target.value)} />
        </Field>
        <Field label="Motif de l’indice">
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Prise en compte des observations APS…" />
        </Field>
      </div>
      <Field label="Fichier" required>
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      <Field label="Report des remarques">
        <select value={carry ? 'oui' : 'non'} onChange={(e) => setCarry(e.target.value === 'oui')}>
          <option value="oui">Reporter les remarques non soldées (statut « à revérifier »)</option>
          <option value="non">Ne rien reporter</option>
        </select>
      </Field>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !file}>
          Déposer l’indice
        </button>
      </div>
    </Modal>
  );
}
