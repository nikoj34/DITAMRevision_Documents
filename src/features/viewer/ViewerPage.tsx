import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Badge, EmptyState, Field, Modal } from '../../components/ui';
import { LegendeStatuts } from '../../components/aides';
import { loadPdf, type PdfDocument } from '../../lib/pdf';
import { createRemark } from '../remarques/remarkApi';
import RemarkDrawer from '../remarques/RemarkDrawer';
import type { AnchorRect, Criticity, Doc, DocVersion, Remark, RemarkType, Tag } from '../../lib/types';
import {
  CRITICITY_LABELS,
  REMARK_STATUS_COLORS,
  REMARK_STATUS_LABELS,
  REMARK_TYPE_LABELS,
  fmtRemarkNum,
} from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

interface PendingAnchor {
  kind: 'epingle_pdf' | 'zone_pdf' | 'reference_texte';
  page: number;
  rect: AnchorRect | null;
  /** Référence pré-remplie (ex. cellule Excel cliquée). */
  textRef?: string;
}

export default function ViewerPage() {
  const { project } = useOutletContext<ProjectContext>();
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const me = useSession((s) => s.me)!;

  const [doc, setDoc] = useState<Doc | null>(null);
  const { items: versions } = useList<DocVersion>(
    'document_versions',
    { filter: `document = "${docId}"`, sort: '-version_num' },
    [docId]
  );
  const [versionId, setVersionId] = useState('');
  const version = versions.find((v) => v.id === versionId) || versions[0];

  const { items: remarks, reload: reloadRemarks } = useList<Remark>(
    'remarks',
    {
      filter: version ? `document_version = "${version.id}"` : '',
      sort: 'number',
      expand: 'author,lot,document_version,document_version.document',
      enabled: !!version,
    },
    [version?.id]
  );
  const { items: allTags } = useList<Tag>(
    'tags',
    { filter: `project = "${project.id}"`, sort: 'label' },
    [project.id]
  );
  const lots = allTags.filter((t) => t.kind === 'lot');
  // Sujets de suivi : thèmes transversaux et locaux/ouvrages — les invariants
  // qui relient les remarques entre phases malgré la reformulation des textes.
  const sujets = allTags.filter((t) => t.kind !== 'lot');

  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [toast, setToast] = useState('');
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [annotating, setAnnotating] = useState(false);
  const [pending, setPending] = useState<PendingAnchor | null>(null);
  const [selected, setSelected] = useState<Remark | null>(null);
  const [pdfError, setPdfError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!docId) return;
    pb.collection('documents')
      .getOne<Doc>(docId)
      .then(setDoc)
      .catch(() => navigate(`/projet/${project.id}/documents`));
  }, [docId, navigate, project.id]);

  const fileUrl = useMemo(
    () => (version?.file ? pb.files.getURL(version, version.file) : ''),
    [version]
  );
  const isExcel = !!version?.file && /\.(xlsx|xls|ods|csv)$/i.test(version.file);

  // Chargement du PDF quand la version change. L'état est réinitialisé dans
  // le même effet (changement de source externe), d'où la désactivation
  // ponctuelle de la règle set-state-in-effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPdf(null);
    setPdfError('');
    setPage(1);
    if (!version || !version.is_pdf || !fileUrl) return;
    let cancelled = false;
    loadPdf(fileUrl)
      .then((p) => {
        if (!cancelled) setPdf(p);
      })
      .catch((e) => {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [version?.id, version?.is_pdf, fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rendu de la page courante
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    pdf.getPage(page).then((p) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      p.render({ canvasContext: ctx, viewport });
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale]);

  function relPos(e: React.MouseEvent): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (!annotating) return;
    dragStart.current = relPos(e);
    setDragRect(null);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!annotating || !dragStart.current) return;
    const cur = relPos(e);
    const s = dragStart.current;
    setDragRect({
      x: Math.min(s.x, cur.x),
      y: Math.min(s.y, cur.y),
      w: Math.abs(cur.x - s.x),
      h: Math.abs(cur.y - s.y),
    });
  }

  function onMouseUp(e: React.MouseEvent) {
    if (!annotating || !dragStart.current) return;
    const cur = relPos(e);
    const s = dragStart.current;
    dragStart.current = null;
    const w = Math.abs(cur.x - s.x);
    const h = Math.abs(cur.y - s.y);
    setDragRect(null);
    if (w < 0.01 && h < 0.01) {
      setPending({ kind: 'epingle_pdf', page, rect: { x: cur.x, y: cur.y, w: 0, h: 0 } });
    } else {
      setPending({ kind: 'zone_pdf', page, rect: { x: Math.min(s.x, cur.x), y: Math.min(s.y, cur.y), w, h } });
    }
    setAnnotating(false);
  }

  const pageRemarks = remarks.filter((r) => r.page === page && r.anchor_rect);

  if (!doc) return <div className="main" />;

  return (
    <div className="main full">
      <div className="viewer-toolbar">
        <button className="btn-icon" onClick={() => navigate(`/projet/${project.id}/documents`)} title="Retour">
          ←
        </button>
        <span className="doc-title">{doc.title}</span>
        {versions.length > 0 && (
          <select value={version?.id || ''} onChange={(e) => setVersionId(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                Indice {v.index_label}
                {v.id === versions[0].id ? ' (courant)' : ''}
              </option>
            ))}
          </select>
        )}
        {version && versions[0] && version.id !== versions[0].id && (
          <Badge color="#c97a06">indice antérieur — lecture seule recommandée</Badge>
        )}
        {pdf && (
          <>
            <span style={{ marginLeft: 10 }}>
              <button className="btn-icon" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                ◀
              </button>
              page {page} / {pdf.numPages}
              <button className="btn-icon" onClick={() => setPage((p) => Math.min(pdf.numPages, p + 1))}>
                ▶
              </button>
            </span>
            <span>
              <button className="btn-icon" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>
                −
              </button>
              {Math.round(scale * 100)}%
              <button className="btn-icon" onClick={() => setScale((s) => Math.min(3, s + 0.2))}>
                +
              </button>
            </span>
          </>
        )}
        <div className="spacer" style={{ flex: 1 }} />
        {fileUrl && (
          <a className="btn secondary small" href={fileUrl} target="_blank" rel="noreferrer">
            ⬇ Télécharger l’original
          </a>
        )}
        {version?.is_pdf ? (
          annotating ? (
            <span className="annotate-hint">👉 Cliquez sur le plan (épingle) ou tracez un rectangle (zone)</span>
          ) : (
            <button className="btn" onClick={() => setAnnotating(true)}>
              + Ajouter une remarque
            </button>
          )
        ) : isExcel ? (
          annotating ? (
            <span className="annotate-hint">👉 Cliquez sur la cellule concernée dans le tableau</span>
          ) : (
            <button className="btn" onClick={() => setAnnotating(true)} disabled={!version}>
              + Ajouter une remarque
            </button>
          )
        ) : (
          <button
            className="btn"
            onClick={() => setPending({ kind: 'reference_texte', page: 0, rect: null })}
            disabled={!version}
          >
            + Ajouter une remarque
          </button>
        )}
      </div>

      <div className="viewer-shell">
        <div className="viewer-canvas-zone">
          {!version && (
            <EmptyState icon="📄" text="Aucun fichier déposé pour ce document." hint="Utilisez « Nouvel indice » depuis la liste des documents." />
          )}
          {version && !version.is_pdf && isExcel && (
            <ExcelViewer
              url={fileUrl}
              annotating={annotating}
              remarks={remarks}
              onPick={(ref) => {
                setPending({ kind: 'reference_texte', page: 0, rect: null, textRef: ref });
                setAnnotating(false);
              }}
            />
          )}
          {version && !version.is_pdf && !isExcel && (
            <EmptyState
              icon="📎"
              text={`Fichier ${version.file?.split('.').pop()?.toUpperCase() || ''} — pas d’affichage intégré.`}
              hint="Téléchargez l’original avec le bouton ci-dessus, puis créez des remarques en citant le chapitre ou l’article concerné (référence textuelle)."
            />
          )}
          {version?.is_pdf && pdfError && <div className="alert error">Impossible d’afficher le PDF : {pdfError}</div>}
          {version?.is_pdf && !pdfError && (
            <div
              ref={wrapRef}
              className="pdf-page-wrap"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            >
              <canvas ref={canvasRef} />
              <div className={`annotation-layer ${annotating ? 'annotating' : ''}`}>
                {pageRemarks.map((r) => {
                  const a = r.anchor_rect!;
                  const color = REMARK_STATUS_COLORS[r.status];
                  const isSel = selected?.id === r.id;
                  return r.anchor_kind === 'zone_pdf' && (a.w > 0 || a.h > 0) ? (
                    <div
                      key={r.id}
                      className={`remark-zone ${isSel ? 'selected' : ''}`}
                      style={{
                        left: `${a.x * 100}%`,
                        top: `${a.y * 100}%`,
                        width: `${a.w * 100}%`,
                        height: `${a.h * 100}%`,
                        ['--pin-color' as string]: color,
                      }}
                      title={`${fmtRemarkNum(r.number)} — ${REMARK_STATUS_LABELS[r.status]}`}
                      onClick={() => setSelected(r)}
                    />
                  ) : (
                    <button
                      key={r.id}
                      className={`remark-pin ${isSel ? 'selected' : ''}`}
                      style={{
                        left: `${a.x * 100}%`,
                        top: `${a.y * 100}%`,
                        ['--pin-color' as string]: color,
                      }}
                      title={`${fmtRemarkNum(r.number)} — ${REMARK_STATUS_LABELS[r.status]}`}
                      onClick={() => setSelected(r)}
                    >
                      {r.number}
                    </button>
                  );
                })}
                {dragRect && (
                  <div
                    className="remark-zone"
                    style={{
                      left: `${dragRect.x * 100}%`,
                      top: `${dragRect.y * 100}%`,
                      width: `${dragRect.w * 100}%`,
                      height: `${dragRect.h * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="viewer-panel">
          <h4 style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            Remarques sur cet indice <span className="muted">({remarks.length})</span> <LegendeStatuts />
          </h4>
          {remarks.length === 0 && (
            <p className="small muted">
              Aucune remarque sur cet indice. Cliquez sur «&nbsp;+ Ajouter une remarque&nbsp;» puis{' '}
              {isExcel ? 'sur la cellule concernée du tableau' : 'sur le plan (épingle) ou tracez un rectangle (zone)'}.
            </p>
          )}
          {remarks.map((r) => (
            <div
              key={r.id}
              className={`remark-card ${selected?.id === r.id ? 'selected' : ''}`}
              style={{ ['--rc-color' as string]: REMARK_STATUS_COLORS[r.status] }}
              onClick={() => {
                if (r.page) setPage(r.page);
                setSelected(r);
              }}
            >
              <div className="rc-head">
                <b>{fmtRemarkNum(r.number)}</b>
                {r.page ? <span>p.{r.page}</span> : null}
                <Badge color={REMARK_STATUS_COLORS[r.status]}>{REMARK_STATUS_LABELS[r.status]}</Badge>
              </div>
              <div className="rc-body">{stripHtml(r.body).slice(0, 160)}</div>
              <div className="rc-head" style={{ marginTop: 4 }}>
                {r.expand?.author?.display_name}
                {r.expand?.lot && <span>· {r.expand.lot.label}</span>}
              </div>
            </div>
          ))}
        </aside>
      </div>

      {pending && version && (
        <NewRemarkModal
          pending={pending}
          lots={lots}
          sujets={sujets}
          onClose={() => setPending(null)}
          onSave={async (data) => {
            const created = await createRemark(
              {
                project: project.id,
                document_version: version.id,
                anchor_kind: pending.kind,
                page: pending.page || undefined,
                anchor_rect: pending.rect,
                ...data,
              },
              me
            );
            setPending(null);
            reloadRemarks();
            setToast(`✓ Remarque ${fmtRemarkNum(created.number)} enregistrée`);
            setTimeout(() => setToast(''), 4000);
          }}
        />
      )}

      {selected && (
        <RemarkDrawer
          remark={remarks.find((r) => r.id === selected.id) || selected}
          onClose={() => setSelected(null)}
          onChanged={reloadRemarks}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/**
 * Visionneuse Excel en lecture seule : le classeur est affiché onglet par
 * onglet ; en mode annotation, un clic sur une cellule pré-remplit la
 * référence normalisée « Onglet!B12 — libellé de la ligne ». Le fichier
 * original n'est jamais modifié.
 */
function ExcelViewer({
  url,
  annotating,
  remarks,
  onPick,
}: {
  url: string;
  annotating: boolean;
  remarks: Remark[];
  onPick: (ref: string) => void;
}) {
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [sheet, setSheet] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (cancelled) return;
        const w = XLSX.read(buf);
        setWb(w);
        setSheet(w.SheetNames[0] || '');
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const grid = useMemo(() => {
    if (!wb || !sheet || !wb.Sheets[sheet]) return null;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: '' }) as unknown[][];
    return aoa.slice(0, 500);
  }, [wb, sheet]);

  const remarkedRefs = useMemo(() => {
    const set = new Set<string>();
    for (const r of remarks) {
      const m = (r.text_ref || '').match(/^(.+!\w+\d+)/);
      if (m) set.add(m[1]);
    }
    return set;
  }, [remarks]);

  if (err) return <div className="alert error">Impossible de lire le classeur : {err}</div>;
  if (!wb || !grid) return <div className="muted" style={{ padding: 30 }}>Chargement du classeur…</div>;

  const colCount = Math.min(30, Math.max(1, ...grid.map((row) => row.length)));

  return (
    <div className="excel-viewer">
      <div className="excel-tabs">
        {wb.SheetNames.map((name) => (
          <button key={name} className={name === sheet ? 'active' : ''} onClick={() => setSheet(name)}>
            {name}
          </button>
        ))}
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          lecture seule — l’original n’est jamais modifié
        </span>
      </div>
      <table className="excel-grid">
        <thead>
          <tr>
            <th></th>
            {Array.from({ length: colCount }, (_, c) => (
              <th key={c}>{XLSX.utils.encode_col(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              <th>{ri + 1}</th>
              {Array.from({ length: colCount }, (_, ci) => {
                const addr = `${sheet}!${XLSX.utils.encode_cell({ r: ri, c: ci })}`;
                const hasRemark = remarkedRefs.has(addr);
                return (
                  <td
                    key={ci}
                    className={`${annotating ? 'annotatable' : ''} ${hasRemark ? 'has-remark' : ''}`}
                    title={hasRemark ? 'Une remarque existe sur cette cellule' : undefined}
                    onClick={() => {
                      if (!annotating) return;
                      const rowLabel = String(
                        row.find((v) => typeof v === 'string' && v.trim()) || ''
                      ).slice(0, 50);
                      onPick(`${addr}${rowLabel ? ` — ${rowLabel}` : ''}`);
                    }}
                  >
                    {String(row[ci] ?? '')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewRemarkModal({
  pending,
  lots,
  sujets,
  onClose,
  onSave,
}: {
  pending: PendingAnchor;
  lots: Tag[];
  sujets: Tag[];
  onClose: () => void;
  onSave: (data: {
    body: string;
    type: RemarkType;
    criticity: Criticity;
    lot?: string;
    text_ref?: string;
    due_date?: string;
    themes?: string[];
  }) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [type, setType] = useState<RemarkType>('observation');
  const [criticity, setCriticity] = useState<Criticity>('normale');
  const [lot, setLot] = useState('');
  const [textRef, setTextRef] = useState(pending.textRef || '');
  const [dueDate, setDueDate] = useState('');
  const [selSujets, setSelSujets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleSujet(id: string) {
    setSelSujets((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));
  }

  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onSave({
        body: body.trim(),
        type,
        criticity,
        lot: lot || undefined,
        text_ref: textRef.trim() || undefined,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        themes: selSujets.length ? selSujets : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={
        pending.kind === 'epingle_pdf'
          ? `Nouvelle remarque — épingle page ${pending.page}`
          : pending.kind === 'zone_pdf'
            ? `Nouvelle remarque — zone page ${pending.page}`
            : 'Nouvelle remarque'
      }
      onClose={onClose}
    >
      <Field label="Votre remarque" required>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} autoFocus placeholder="Décrivez l’observation, la question ou la modification demandée…" />
      </Field>
      <Field label="Référence complémentaire (chapitre, article CCTP, onglet/cellule Excel, local…)">
        <input value={textRef} onChange={(e) => setTextRef(e.target.value)} placeholder="§3.2 Dégagements / Onglet Lot 06, ligne 06.2.4 / Local 2.014" />
      </Field>
      <details className="plus-options">
        <summary>Plus d’options (type, criticité, lot, échéance, sujets)</summary>
        <div className="form-row">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as RemarkType)}>
              {(Object.keys(REMARK_TYPE_LABELS) as RemarkType[]).map((t) => (
                <option key={t} value={t}>
                  {REMARK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Criticité">
            <select value={criticity} onChange={(e) => setCriticity(e.target.value as Criticity)}>
              {(Object.keys(CRITICITY_LABELS) as Criticity[]).map((c) => (
                <option key={c} value={c}>
                  {CRITICITY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Lot / thème">
            <select value={lot} onChange={(e) => setLot(e.target.value)}>
              <option value="">—</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Échéance de réponse">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {sujets.length > 0 && (
          <Field label="Sujets de suivi (local, ouvrage, thème — relie les remarques entre phases)">
            <div className="status-buttons">
              {sujets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`status-pill ${selSujets.includes(s.id) ? 'current' : ''}`}
                  style={{ '--sp-color': s.kind === 'local' ? '#1c4d77' : '#0e7d7d' } as React.CSSProperties}
                  onClick={() => toggleSujet(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
        )}
      </details>
      <p className="small muted">Seul le texte est obligatoire — le reste peut être complété plus tard (par vous ou le secrétaire).</p>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !body.trim()}>
          Créer la remarque
        </button>
      </div>
    </Modal>
  );
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}
