import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Badge, Drawer, EmptyState, Field, Modal } from '../../components/ui';
import { readSheet, type SheetData } from '../../lib/excel';
import RemarkDrawer from '../remarques/RemarkDrawer';
import type {
  Remark,
  Requirement,
  RequirementOrigin,
  RequirementStatus,
  RequirementVerifResult,
  Tag,
} from '../../lib/types';
import {
  REMARK_STATUS_COLORS,
  REMARK_STATUS_LABELS,
  REQUIREMENT_ORIGIN_COLORS,
  REQUIREMENT_ORIGIN_LABELS,
  REQUIREMENT_STATUS_COLORS,
  REQUIREMENT_STATUS_LABELS,
  REQ_VERIF_COLORS,
  REQ_VERIF_ICONS,
  REQ_VERIF_LABELS,
  fmtDate,
  fmtRemarkNum,
} from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

/**
 * Référentiel d'exigences du programme : surfaces, débits, charges,
 * équipements… Chaque exigence est vérifiée phase après phase sur les
 * rendus successifs ; les remarques peuvent y être rattachées. Une exigence
 * n'est jamais « terminée » : elle est « vérifiée jusqu'à la phase X ».
 */
export default function RequirementsPage() {
  const { project, phases } = useOutletContext<ProjectContext>();
  const me = useSession((s) => s.me)!;

  const { items: requirements, reload } = useList<Requirement>(
    'requirements',
    { filter: `project = "${project.id}"`, sort: 'code,label', expand: 'themes' },
    [project.id]
  );
  const { items: remarks, reload: reloadRemarks } = useList<Remark>(
    'remarks',
    {
      filter: `project = "${project.id}"`,
      sort: '-number',
      expand: 'author,lot,document_version,document_version.document',
    },
    [project.id]
  );

  const currentPhase = phases.find((p) => p.status === 'en_cours');
  const [verifPhaseId, setVerifPhaseId] = useState(currentPhase?.id || phases[0]?.id || '');
  const verifPhase = phases.find((p) => p.id === verifPhaseId);

  const [search, setSearch] = useState('');
  const [verifFilter, setVerifFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openRemark, setOpenRemark] = useState<Remark | null>(null);

  const verifOf = (r: Requirement) => (r.verifications || []).filter((v) => v.phase === verifPhaseId).pop();

  const filtered = useMemo(() => {
    const q = search
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return requirements.filter((r) => {
      const v = verifOf(r);
      if (originFilter && r.origin !== originFilter) return false;
      if (verifFilter === 'a_verifier' && (v || r.status !== 'active')) return false;
      if (verifFilter && verifFilter !== 'a_verifier' && v?.result !== verifFilter) return false;
      if (q) {
        const hay = `${r.code} ${r.label} ${r.description} ${r.target_value} ${r.source_ref} ${(
          r.expand?.themes || []
        )
          .map((t) => t.label)
          .join(' ')}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements, search, verifFilter, originFilter, verifPhaseId]);

  // Taux de conformité de la phase sélectionnée (exigences actives)
  const stats = useMemo(() => {
    const active = requirements.filter((r) => r.status === 'active');
    const counts = { conforme: 0, non_conforme: 0, ecart_accepte: 0, non_verifiable: 0, a_verifier: 0 };
    for (const r of active) {
      const v = verifOf(r);
      if (!v) counts.a_verifier++;
      else counts[v.result]++;
    }
    const verified = counts.conforme + counts.non_conforme + counts.ecart_accepte;
    const rate = verified ? Math.round((counts.conforme / verified) * 100) : null;
    return { total: active.length, ...counts, rate };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements, verifPhaseId]);

  function exportExcel() {
    const rows = requirements.map((r) => {
      const row: Record<string, unknown> = {
        'Code': r.code,
        'Exigence': r.label,
        'Description': r.description,
        'Valeur cible': r.target_value,
        'Origine': r.origin ? REQUIREMENT_ORIGIN_LABELS[r.origin] || r.origin : '',
        'Source': r.source_ref,
        'Sujets': (r.expand?.themes || []).map((t) => t.label).join(', '),
        'Statut': REQUIREMENT_STATUS_LABELS[r.status] || r.status,
        'Remarques liées': remarks
          .filter((m) => (m.requirements || []).includes(r.id))
          .map((m) => fmtRemarkNum(m.number))
          .join(', '),
      };
      for (const p of phases) {
        const v = (r.verifications || []).filter((x) => x.phase === p.id).pop();
        row[`Vérif. ${p.label}`] = v ? `${REQ_VERIF_LABELS[v.result]}${v.note ? ` — ${v.note}` : ''}` : '';
      }
      return row;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Exigences');
    XLSX.writeFile(wb, `Exigences_${project.code || project.name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="main">
      <div className="page-head">
        <h2>Référentiel d’exigences</h2>
        <span className="muted small">programme, DSST, réglementation…</span>
        <span className="muted small">{requirements.length} exigence(s)</span>
        <div className="spacer" />
        <button className="btn secondary" onClick={exportExcel} disabled={!requirements.length}>
          ⬇ Exporter Excel
        </button>
        <button className="btn secondary" onClick={() => setImporting(true)}>
          📥 Importer le programme (Excel)
        </button>
        <button className="btn" onClick={() => setCreating(true)}>
          + Nouvelle exigence
        </button>
      </div>

      <div className="kpi-row">
        <div className="kpi" style={{ ['--kpi-color' as string]: '#1c4d77' }}>
          <div className="kpi-value">{stats.rate !== null ? `${stats.rate} %` : '—'}</div>
          <div className="kpi-label">Taux de conformité — {verifPhase?.label || ''}</div>
        </div>
        <div className="kpi" style={{ ['--kpi-color' as string]: REQ_VERIF_COLORS.non_conforme }}>
          <div className="kpi-value">{stats.non_conforme}</div>
          <div className="kpi-label">Non conformes</div>
        </div>
        <div className="kpi" style={{ ['--kpi-color' as string]: REQ_VERIF_COLORS.ecart_accepte }}>
          <div className="kpi-value">{stats.ecart_accepte}</div>
          <div className="kpi-label">Écarts acceptés</div>
        </div>
        <div className="kpi" style={{ ['--kpi-color' as string]: '#8a5fc0' }}>
          <div className="kpi-value">{stats.a_verifier}</div>
          <div className="kpi-label">Restant à vérifier sur la phase</div>
        </div>
      </div>

      <div className="filters">
        <input
          type="search"
          placeholder="🔍 Rechercher (code, libellé, valeur, fiche espace…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={verifPhaseId} onChange={(e) => setVerifPhaseId(e.target.value)}>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              Vérification : {p.label}
            </option>
          ))}
        </select>
        <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)}>
          <option value="">Toutes origines</option>
          {(Object.keys(REQUIREMENT_ORIGIN_LABELS) as RequirementOrigin[]).map((o) => (
            <option key={o} value={o}>
              {REQUIREMENT_ORIGIN_LABELS[o]}
            </option>
          ))}
        </select>
        <select value={verifFilter} onChange={(e) => setVerifFilter(e.target.value)}>
          <option value="">Toutes</option>
          <option value="a_verifier">À vérifier sur cette phase</option>
          {(Object.keys(REQ_VERIF_LABELS) as RequirementVerifResult[]).map((k) => (
            <option key={k} value={k}>
              {REQ_VERIF_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="📐"
          text="Aucune exigence ne correspond."
          hint="Importez votre programme (Excel) ou créez les exigences clés : surfaces, débits, charges, équipements… Elles seront vérifiées phase après phase."
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Exigence</th>
              <th>Origine</th>
              <th>Valeur cible</th>
              <th>Sujets</th>
              <th>Statut</th>
              <th>Vérif. {verifPhase?.label}</th>
              <th>Remarques</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const v = verifOf(r);
              const linked = remarks.filter((m) => (m.requirements || []).includes(r.id));
              return (
                <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                  <td>
                    <b>{r.code || '—'}</b>
                  </td>
                  <td style={{ maxWidth: 360 }}>
                    {r.label}
                    {r.source_ref && <div className="small muted">{r.source_ref}</div>}
                  </td>
                  <td>
                    {r.origin && (
                      <Badge color={REQUIREMENT_ORIGIN_COLORS[r.origin] || '#6b7681'}>
                        {r.origin === 'DSST' ? 'DSST' : REQUIREMENT_ORIGIN_LABELS[r.origin] || r.origin}
                      </Badge>
                    )}
                  </td>
                  <td>{r.target_value}</td>
                  <td className="small">{(r.expand?.themes || []).map((t) => t.label).join(', ')}</td>
                  <td>
                    <Badge color={REQUIREMENT_STATUS_COLORS[r.status] || '#6b7681'}>
                      {REQUIREMENT_STATUS_LABELS[r.status] || r.status}
                    </Badge>
                  </td>
                  <td>
                    {v ? (
                      <Badge color={REQ_VERIF_COLORS[v.result]}>
                        {REQ_VERIF_ICONS[v.result]} {REQ_VERIF_LABELS[v.result]}
                      </Badge>
                    ) : r.status === 'active' ? (
                      <span className="muted small">à vérifier</span>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <td className="small">{linked.length ? linked.map((m) => fmtRemarkNum(m.number)).join(', ') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {creating && (
        <RequirementForm
          projectId={project.id}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {importing && (
        <ImportRequirementsModal
          projectId={project.id}
          onClose={() => setImporting(false)}
          onDone={() => reload()}
        />
      )}
      {selected && (
        <RequirementDrawer
          requirement={requirements.find((r) => r.id === selected.id) || selected}
          linkedRemarks={remarks.filter((m) => (m.requirements || []).includes(selected.id))}
          phases={phases}
          defaultPhaseId={verifPhaseId}
          meId={me.id}
          meName={me.display_name}
          onClose={() => setSelected(null)}
          onChanged={reload}
          onOpenRemark={setOpenRemark}
        />
      )}
      {openRemark && (
        <RemarkDrawer
          remark={remarks.find((r) => r.id === openRemark.id) || openRemark}
          onClose={() => setOpenRemark(null)}
          onChanged={reloadRemarks}
        />
      )}
    </div>
  );
}

function RequirementForm({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [origin, setOrigin] = useState<RequirementOrigin>('PROGRAMME');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await pb.collection('requirements').create({
        project: projectId,
        code: code.trim(),
        label: label.trim(),
        description: description.trim(),
        target_value: target.trim(),
        origin,
        source_ref: source.trim(),
        status: 'active',
        verifications: [],
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nouvelle exigence du programme" onClose={onClose}>
      <div className="form-row">
        <Field label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EXG-2.014-03" />
        </Field>
        <Field label="Valeur cible">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="18 m² / 15 Pa / 500 kg/m²" />
        </Field>
      </div>
      <Field label="Exigence (formulation vérifiable)" required>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          placeholder="Le laboratoire L2 dispose d’un sas avec lave-mains à commande non manuelle"
        />
      </Field>
      <Field label="Description / précisions">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="form-row">
        <Field label="Origine de l’exigence">
          <select value={origin} onChange={(e) => setOrigin(e.target.value as RequirementOrigin)}>
            {(Object.keys(REQUIREMENT_ORIGIN_LABELS) as RequirementOrigin[]).map((o) => (
              <option key={o} value={o}>
                {REQUIREMENT_ORIGIN_LABELS[o]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source (chapitre, fiche espace, note DSST)">
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="PTD §4.2 / Note DSST du 03/05" />
        </Field>
      </div>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !label.trim()}>
          Ajouter au référentiel
        </button>
      </div>
    </Modal>
  );
}

function ImportRequirementsModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultOrigin, setDefaultOrigin] = useState<RequirementOrigin>('PROGRAMME');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ created: number; rejected: { line: number; reason: string }[] } | null>(null);

  const targets = [
    { key: 'code', label: 'Code exigence' },
    { key: 'label', label: 'Exigence (libellé) *' },
    { key: 'description', label: 'Description' },
    { key: 'target_value', label: 'Valeur cible' },
    { key: 'source_ref', label: 'Source (chapitre / fiche espace)' },
  ];

  async function onFile(f: File | null) {
    if (!f) return;
    const data = await readSheet(f);
    setSheet(data);
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const find = (...needles: string[]) =>
      data.headers.find((h) => needles.some((n) => norm(h).includes(n))) || '';
    setMapping({
      code: find('code', 'n°', 'num', 'ref'),
      label: find('exigence', 'libelle', 'intitule', 'designation'),
      description: find('description', 'detail', 'commentaire'),
      target_value: find('valeur', 'cible', 'surface', 'quantite'),
      source_ref: find('source', 'fiche', 'chapitre', 'local'),
    });
  }

  async function run() {
    if (!sheet) return;
    setBusy(true);
    const rejected: { line: number; reason: string }[] = [];
    let created = 0;
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const get = (key: string) => (mapping[key] ? String(row[mapping[key]] ?? '').trim() : '');
      const label = get('label');
      if (!label) {
        rejected.push({ line: i + 2, reason: 'Libellé d’exigence vide' });
        continue;
      }
      try {
        await pb.collection('requirements').create({
          project: projectId,
          code: get('code'),
          label,
          description: get('description'),
          target_value: get('target_value'),
          origin: defaultOrigin,
          source_ref: get('source_ref'),
          status: 'active',
          verifications: [],
        });
        created++;
      } catch (e) {
        rejected.push({ line: i + 2, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    setReport({ created, rejected });
    setBusy(false);
    onDone();
  }

  return (
    <Modal title="Importer le programme (Excel)" onClose={onClose} wide>
      <p className="small muted">
        Une ligne = une exigence. L’assistant devine les colonnes, corrigez si besoin. Vous pourrez ensuite rattacher
        des sujets et vérifier chaque exigence phase après phase.
      </p>
      <Field label="Fichier Excel">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0] || null)} />
      </Field>
      {sheet && (
        <>
          <p className="small muted">{sheet.rows.length} ligne(s), colonnes : {sheet.headers.join(', ')}</p>
          {targets.map((t) => (
            <div key={t.key} className="form-row" style={{ alignItems: 'center', marginBottom: 6 }}>
              <span className="small" style={{ width: 220 }}>
                {t.label}
              </span>
              <select value={mapping[t.key] || ''} onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value })}>
                <option value="">— ignorer —</option>
                {sheet.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Field label="Origine appliquée à toutes les lignes importées">
            <select value={defaultOrigin} onChange={(e) => setDefaultOrigin(e.target.value as RequirementOrigin)}>
              {(Object.keys(REQUIREMENT_ORIGIN_LABELS) as RequirementOrigin[]).map((o) => (
                <option key={o} value={o}>
                  {REQUIREMENT_ORIGIN_LABELS[o]}
                </option>
              ))}
            </select>
          </Field>
          <p className="small muted">
            Importez le programme et la note DSST séparément (un fichier par origine), pour que chaque exigence soit
            correctement attribuée.
          </p>
          <div className="form-actions">
            <button className="btn" onClick={run} disabled={busy || !mapping['label']}>
              {busy ? 'Import en cours…' : `Importer ${sheet.rows.length} exigence(s)`}
            </button>
          </div>
        </>
      )}
      {report && (
        <div className={`alert ${report.rejected.length ? 'warn' : 'info'}`}>
          ✅ {report.created} exigence(s) créée(s).
          {report.rejected.length > 0 && (
            <ul>
              {report.rejected.slice(0, 15).map((r, i) => (
                <li key={i}>
                  Ligne {r.line} : {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function RequirementDrawer({
  requirement,
  linkedRemarks,
  phases,
  defaultPhaseId,
  meId,
  meName,
  onClose,
  onChanged,
  onOpenRemark,
}: {
  requirement: Requirement;
  linkedRemarks: Remark[];
  phases: ProjectContext['phases'];
  defaultPhaseId: string;
  meId: string;
  meName: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenRemark: (r: Remark) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [verifPhase, setVerifPhase] = useState(defaultPhaseId);
  const [verifNote, setVerifNote] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const { items: sujets } = useList<Tag>(
    'tags',
    { filter: `project = "${requirement.project}" && kind != "lot"`, sort: 'label' },
    [requirement.project]
  );

  async function addVerification(result: RequirementVerifResult) {
    const phase = phases.find((p) => p.id === verifPhase);
    if (!phase) return;
    setBusy(true);
    try {
      const verifications = [
        ...(requirement.verifications || []),
        {
          phase: phase.id,
          phase_label: phase.label,
          result,
          by: meId,
          by_name: meName,
          date: new Date().toISOString(),
          note: verifNote.trim(),
        },
      ];
      await pb.collection('requirements').update(requirement.id, { verifications });
      setVerifNote('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: RequirementStatus) {
    if (s === requirement.status) return;
    setBusy(true);
    try {
      await pb.collection('requirements').update(requirement.id, {
        status: s,
        status_note: statusNote.trim() || requirement.status_note,
      });
      setStatusNote('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleSujet(id: string) {
    const cur = requirement.themes || [];
    const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
    await pb.collection('requirements').update(requirement.id, { themes: next });
    onChanged();
  }

  return (
    <Drawer
      title={
        <span>
          {requirement.code || 'Exigence'}{' '}
          <Badge color={REQUIREMENT_STATUS_COLORS[requirement.status] || '#6b7681'}>
            {REQUIREMENT_STATUS_LABELS[requirement.status] || requirement.status}
          </Badge>
        </span>
      }
      onClose={onClose}
    >
      <h4>{requirement.label}</h4>
      {requirement.description && <p style={{ whiteSpace: 'pre-wrap' }}>{requirement.description}</p>}
      <dl className="meta-grid">
        {requirement.target_value && (
          <>
            <dt>Valeur cible</dt>
            <dd>
              <b>{requirement.target_value}</b>
            </dd>
          </>
        )}
        {requirement.origin && (
          <>
            <dt>Origine</dt>
            <dd>
              <Badge color={REQUIREMENT_ORIGIN_COLORS[requirement.origin] || '#6b7681'}>
                {REQUIREMENT_ORIGIN_LABELS[requirement.origin] || requirement.origin}
              </Badge>
            </dd>
          </>
        )}
        {requirement.source_ref && (
          <>
            <dt>Source</dt>
            <dd>{requirement.source_ref}</dd>
          </>
        )}
        {requirement.status_note && (
          <>
            <dt>Note de statut</dt>
            <dd>{requirement.status_note}</dd>
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
                className={`status-pill ${(requirement.themes || []).includes(s.id) ? 'current' : ''}`}
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

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)', marginTop: 14 }}>
        Vérification par phase
      </h4>
      <p className="small muted">
        À chaque rendu, pointez l’exigence sur les nouveaux documents — peu importe la reformulation, c’est le fait
        qui est vérifié. Un point conforme en APS qui régresse en APD doit être marqué « non conforme ».
      </p>
      {(requirement.verifications || []).map((v, i) => (
        <div key={i} className="thread-bubble status-change" style={{ marginBottom: 6 }}>
          <b>{v.phase_label}</b> — {REQ_VERIF_ICONS[v.result]} {REQ_VERIF_LABELS[v.result]}{' '}
          <span className="muted">par {v.by_name} le {fmtDate(v.date)}</span>
          {v.note && <div className="small">{v.note}</div>}
        </div>
      ))}
      <div className="form-row">
        <Field label="Phase vérifiée">
          <select value={verifPhase} onChange={(e) => setVerifPhase(e.target.value)}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preuve / note (document, page, écart constaté)">
          <input value={verifNote} onChange={(e) => setVerifNote(e.target.value)} placeholder="Plan A-201 ind. C : 17,2 m² au lieu de 18" />
        </Field>
      </div>
      <div className="status-buttons">
        <button className="btn small" onClick={() => addVerification('conforme')} disabled={busy || !verifPhase}>
          ✅ Conforme
        </button>
        <button className="btn small danger" onClick={() => addVerification('non_conforme')} disabled={busy || !verifPhase}>
          ❌ Non conforme
        </button>
        <button className="btn small secondary" onClick={() => addVerification('ecart_accepte')} disabled={busy || !verifPhase}>
          ⚖️ Écart accepté
        </button>
        <button className="btn small secondary" onClick={() => addVerification('non_verifiable')} disabled={busy || !verifPhase}>
          ⏳ Non vérifiable
        </button>
      </div>

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)', marginTop: 14 }}>
        Statut de l’exigence
      </h4>
      <div className="status-buttons">
        {(Object.keys(REQUIREMENT_STATUS_LABELS) as RequirementStatus[]).map((s) => (
          <button
            key={s}
            className={`status-pill ${s === requirement.status ? 'current' : ''}`}
            style={{ '--sp-color': REQUIREMENT_STATUS_COLORS[s] } as React.CSSProperties}
            onClick={() => setStatus(s)}
            disabled={busy}
          >
            {REQUIREMENT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <Field label="Note (motif d’amendement / abandon, réf. d’arbitrage)">
        <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Saisir la note avant de cliquer sur le statut" />
      </Field>

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)', marginTop: 14 }}>
        Remarques liées ({linkedRemarks.length})
      </h4>
      {linkedRemarks.length === 0 && (
        <p className="small muted">Aucune — rattachez une remarque à cette exigence depuis la fiche de la remarque.</p>
      )}
      {linkedRemarks.map((r) => (
        <div
          key={r.id}
          className="remark-card"
          style={{ ['--rc-color' as string]: REMARK_STATUS_COLORS[r.status] }}
          onClick={() => onOpenRemark(r)}
        >
          <div className="rc-head">
            <b>{fmtRemarkNum(r.number)}</b>
            <Badge color={REMARK_STATUS_COLORS[r.status]}>{REMARK_STATUS_LABELS[r.status]}</Badge>
          </div>
          <div className="rc-body small">{stripHtml(r.body).slice(0, 120)}</div>
        </div>
      ))}
    </Drawer>
  );
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}
