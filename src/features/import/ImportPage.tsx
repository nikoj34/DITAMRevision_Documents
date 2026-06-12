import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Field } from '../../components/ui';
import {
  IMPORT_TARGETS,
  guessMapping,
  normalizeCriticity,
  normalizeDate,
  normalizeResponseKind,
  normalizeStatus,
  parseRemarkNumber,
  readNewRemarksSheet,
  readSheet,
  type SheetData,
} from '../../lib/excel';
import { nextNumber } from '../../lib/hooks';
import type { Doc, DocVersion, Remark, Stakeholder, Tag } from '../../lib/types';
import { ROLE_LABELS, fmtRemarkNum } from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

interface ImportReport {
  created: number;
  createdNew?: number;
  skipped?: number;
  rejected: { line: number; reason: string }[];
}

type ImportMode = 'nouvelles' | 'reponses';

const RESP_TARGETS: { key: string; label: string }[] = [
  { key: 'numero', label: 'N° de remarque (R-0042) *' },
  { key: 'response', label: 'Réponse (MOE) *' },
  { key: 'response_kind', label: 'Sens de la réponse' },
  { key: 'body', label: 'Observation (pour les lignes nouvelles)' },
  { key: 'text_ref', label: 'Page / repère (pour les lignes nouvelles)' },
];

function guessResponsesMapping(headers: string[]): Record<string, string> {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const find = (...needles: string[]) =>
    headers.find((h) => needles.some((n) => norm(h).includes(n))) || '';
  return {
    numero: find('n°', 'num', 'no '),
    response: headers.find((h) => norm(h) === 'reponse') || find('reponse moe', 'reponse'),
    response_kind: find('sens', 'suite donnee', 'avis'),
    body: find('observation', 'remarque', 'commentaire'),
    text_ref: find('page', 'repere', 'localisation'),
  };
}

export default function ImportPage() {
  const { project } = useOutletContext<ProjectContext>();
  const me = useSession((s) => s.me)!;

  const [mode, setMode] = useState<ImportMode>('nouvelles');
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [targetVersion, setTargetVersion] = useState('');
  const [respondent, setRespondent] = useState('');
  const [createNewRows, setCreateNewRows] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const { items: docs } = useList<Doc>('documents', { sort: 'title' }, [project.id]);
  const { items: versions } = useList<DocVersion>('document_versions', { sort: '-version_num' }, [project.id]);
  const { items: people } = useList<Stakeholder>('stakeholders', { sort: 'display_name' });

  const projectDocs = docs.filter((d) => !d.archived);
  const versionOptions = projectDocs.flatMap((d) =>
    versions
      .filter((v) => v.document === d.id)
      .map((v) => ({ id: v.id, label: `${d.title} — indice ${v.index_label}` }))
  );

  async function onFile(f: File | null) {
    setReport(null);
    if (!f) return;
    setFile(f);
    setFileName(f.name);
    const data = await readSheet(f);
    setSheet(data);
    setMapping(mode === 'reponses' ? guessResponsesMapping(data.headers) : guessMapping(data.headers));
  }

  // Aller-retour « fiche navette » : la MOE (sans accès à l'application)
  // remplit les colonnes Réponse / Sens de la réponse dans l'export Excel,
  // et peut AJOUTER des lignes (nouvelles remarques de sa part).
  // Rapprochement par N° de remarque. IMPORTANT : cet import ne clôt jamais
  // rien — une réponse passe la remarque en « répondue », la vérification
  // de la correction (sur le nouvel indice) et la clôture restent côté
  // relecteurs. Les lignes nouvelles deviennent des remarques « à traiter ».
  async function runResponsesImport() {
    if (!sheet) return;
    setBusy(true);
    const rejected: { line: number; reason: string }[] = [];
    let updated = 0;
    let createdNew = 0;
    let skipped = 0;
    const author = respondent || me.id;
    const all = await pb.collection('remarks').getFullList<Remark>({ filter: `project = "${project.id}"` });
    const byNumber = new Map(all.map((r) => [r.number, r]));

    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const get = (key: string) => (mapping[key] ? String(row[mapping[key]] ?? '').trim() : '');
      const rawNum = get('numero') || get('external_ref');
      const num = parseRemarkNumber(rawNum);
      const remark = num !== null ? byNumber.get(num) : undefined;
      const response = get('response');
      const body = get('body');

      try {
        if (remark) {
          if (!response) {
            skipped++;
            continue;
          }
          await pb.collection('remark_replies').create({
            remark: remark.id,
            author,
            kind: 'reponse',
            body: `${response}\n\n(réponse MOE importée du fichier « ${fileName} »)`,
          });
          const patch: Record<string, unknown> = {};
          const kind = normalizeResponseKind(get('response_kind'));
          if (kind) patch.response_kind = kind;
          // « Répondue » seulement — jamais « traitée » : la clôture reste
          // une décision humaine des relecteurs, après vérification.
          if (remark.status === 'a_traiter' || remark.status === 'en_cours') patch.status = 'repondue';
          if (Object.keys(patch).length) await pb.collection('remarks').update(remark.id, patch);
          updated++;
        } else if (createNewRows && body) {
          // Ligne ajoutée par la MOE : nouvelle remarque à son nom.
          const number = await nextNumber('remarks', project.id);
          await pb.collection('remarks').create({
            project: project.id,
            number,
            external_ref: rawNum,
            anchor_kind: 'reference_texte',
            text_ref: get('text_ref'),
            body,
            type: 'observation',
            criticity: 'normale',
            status: 'a_traiter',
            author,
          });
          createdNew++;
        } else if (!response && !body) {
          skipped++;
        } else {
          rejected.push({
            line: i + 2,
            reason:
              num === null
                ? 'N° de remarque illisible et pas de texte d’observation pour créer la ligne'
                : `Remarque ${fmtRemarkNum(num)} introuvable dans ce projet`,
          });
        }
      } catch (e) {
        rejected.push({ line: i + 2, reason: e instanceof Error ? e.message : String(e) });
      }
    }

    // Feuille dédiée « Nouvelles remarques (MOE) » de la fiche navette
    // protégée : chaque ligne devient une remarque au nom de l'intervenant.
    if (createNewRows && file) {
      try {
        const extra = await readNewRemarksSheet(file);
        for (const row of extra || []) {
          const body = String(row['Observation'] ?? '').trim();
          if (!body) continue;
          const number = await nextNumber('remarks', project.id);
          const docInfo = String(row['Document'] ?? '').trim();
          const pageRef = String(row['Page / repère'] ?? '').trim();
          await pb.collection('remarks').create({
            project: project.id,
            number,
            external_ref: String(row['Réf. MOE'] ?? '').trim(),
            anchor_kind: 'reference_texte',
            text_ref: [docInfo, pageRef].filter(Boolean).join(' / '),
            body,
            type: 'observation',
            criticity: 'normale',
            status: 'a_traiter',
            author,
          });
          createdNew++;
        }
      } catch (e) {
        rejected.push({ line: 0, reason: `Feuille « Nouvelles remarques » : ${e instanceof Error ? e.message : e}` });
      }
    }

    setReport({ created: updated, createdNew, skipped, rejected });
    setBusy(false);
  }

  async function runImport() {
    if (!sheet) return;
    setBusy(true);
    const rejected: { line: number; reason: string }[] = [];
    let created = 0;

    // Caches intervenants / lots pour ne pas requêter à chaque ligne
    const stakeholders = await pb.collection('stakeholders').getFullList<Stakeholder>();
    const tags = await pb.collection('tags').getFullList<Tag>({ filter: `project = "${project.id}"` });
    const findOrCreatePerson = async (name: string): Promise<string> => {
      const n = name.trim();
      if (!n) return me.id;
      const found = stakeholders.find((s) => s.display_name.toLowerCase() === n.toLowerCase());
      if (found) return found.id;
      const createdRec = await pb
        .collection('stakeholders')
        .create<Stakeholder>({ display_name: n, role: 'AUTRE', active: true, organization: '' });
      stakeholders.push(createdRec);
      return createdRec.id;
    };
    const findOrCreateLot = async (label: string): Promise<string> => {
      const l = label.trim();
      if (!l) return '';
      const found = tags.find((t) => t.label.toLowerCase() === l.toLowerCase());
      if (found) return found.id;
      const createdRec = await pb.collection('tags').create<Tag>({ project: project.id, label: l, kind: 'lot' });
      tags.push(createdRec);
      return createdRec.id;
    };

    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const get = (key: string) => (mapping[key] ? String(row[mapping[key]] ?? '').trim() : '');
      const body = get('body');
      if (!body) {
        rejected.push({ line: i + 2, reason: 'Observation vide (colonne non renseignée)' });
        continue;
      }
      try {
        const number = await nextNumber('remarks', project.id);
        const authorId = await findOrCreatePerson(get('author_name'));
        const lotId = await findOrCreateLot(get('lot_label'));
        const remark = await pb.collection('remarks').create({
          project: project.id,
          number,
          external_ref: get('external_ref'),
          document_version: targetVersion || null,
          anchor_kind: 'reference_texte',
          text_ref: get('text_ref'),
          body,
          type: 'observation',
          criticity: normalizeCriticity(get('criticity')),
          lot: lotId || null,
          status: normalizeStatus(get('status')),
          author: authorId,
          due_date: normalizeDate(row[mapping['due_date']]) || null,
        });
        const response = get('response');
        if (response) {
          await pb.collection('remark_replies').create({
            remark: remark.id,
            author: me.id,
            kind: 'reponse',
            body: `${response}\n\n(réponse reprise de l’import « ${fileName} »)`,
          });
        }
        created++;
      } catch (e) {
        rejected.push({ line: i + 2, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    setReport({ created, rejected });
    setBusy(false);
  }

  return (
    <div className="main" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h2>Import Excel</h2>
      </div>
      <p className="muted">
        Deux usages : <b>reprendre un tableau d’observations existant</b> (projet en cours), ou <b>intégrer les
        réponses de la MOE</b> qui travaille dans Excel sans accès à l’application (aller-retour « fiche navette » :
        exportez le registre, la MOE remplit les colonnes Réponse / Sens de la réponse, ré-importez ici).
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <Field label="Type d’import">
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ImportMode);
              setReport(null);
              if (sheet) {
                setMapping(
                  e.target.value === 'reponses' ? guessResponsesMapping(sheet.headers) : guessMapping(sheet.headers)
                );
              }
            }}
          >
            <option value="nouvelles">Nouvelles remarques (reprise d’un tableau existant)</option>
            <option value="reponses">Réponses de la MOE (aller-retour fiche navette)</option>
          </select>
        </Field>
        <Field label="Fichier Excel (.xlsx, .xls)">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </Field>
        {sheet && (
          <p className="small muted">
            {fileName} — {sheet.rows.length} ligne(s) détectée(s), colonnes : {sheet.headers.join(', ')}
          </p>
        )}
      </div>

      {sheet && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)' }}>
              Correspondance des colonnes
            </h3>
            <p className="small muted">
              L’assistant a deviné les correspondances probables — vérifiez et corrigez si besoin. Seule
              l’« Observation » est obligatoire.
            </p>
            {(mode === 'reponses' ? RESP_TARGETS : IMPORT_TARGETS).map((t) => (
              <div key={t.key} className="form-row" style={{ alignItems: 'center', marginBottom: 6 }}>
                <span className="small" style={{ width: 240 }}>
                  {t.label}
                </span>
                <select
                  value={mapping[t.key] || ''}
                  onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value })}
                >
                  <option value="">— ignorer —</option>
                  {sheet.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {mode === 'nouvelles' ? (
              <Field label="Rattacher les remarques à un document (optionnel)">
                <select value={targetVersion} onChange={(e) => setTargetVersion(e.target.value)}>
                  <option value="">— aucun document (remarques générales du projet) —</option>
                  {versionOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Réponses enregistrées au nom de (l’intervenant MOE)">
                  <select value={respondent} onChange={(e) => setRespondent(e.target.value)}>
                    <option value="">{me.display_name} (moi — saisie pour le compte de la MOE)</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} — {ROLE_LABELS[p.role] || p.role}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={createNewRows}
                    onChange={(e) => setCreateNewRows(e.target.checked)}
                  />
                  Créer les lignes ajoutées par la MOE (sans n° connu) comme nouvelles remarques « à traiter »
                </label>
                <div className="alert info" style={{ marginTop: 10 }}>
                  ℹ️ Cet import ne clôt <b>jamais</b> de remarque : une réponse passe la remarque en
                  « répondue », pas en « traitée ». La vérification de la correction (sur le nouvel indice du
                  document) et la clôture restent à la main des relecteurs CIRAD — répondre n’est pas corriger.
                </div>
              </>
            )}
            <div className="form-actions">
              <button
                className="btn"
                onClick={mode === 'reponses' ? runResponsesImport : runImport}
                disabled={busy || (mode === 'reponses' ? !mapping['numero'] || !mapping['response'] : !mapping['body'])}
              >
                {busy
                  ? 'Import en cours…'
                  : mode === 'reponses'
                    ? `Intégrer les réponses (${sheet.rows.length} ligne(s))`
                    : `Importer ${sheet.rows.length} ligne(s)`}
              </button>
            </div>
          </div>

          {report && (
            <div className={`alert ${report.rejected.length ? 'warn' : 'info'}`}>
              ✅ {report.created} {mode === 'reponses' ? 'réponse(s) intégrée(s) au fil des remarques' : 'remarque(s) créée(s)'}.
              {report.createdNew ? ` ➕ ${report.createdNew} nouvelle(s) remarque(s) créée(s) à partir des lignes ajoutées par la MOE.` : ''}
              {report.skipped ? ` ${report.skipped} ligne(s) sans réponse ignorée(s).` : ''}
              {mode === 'reponses' && (
                <>
                  {' '}
                  <b>Aucune remarque n’a été close</b> : les remarques répondues sont à vérifier puis à clore (ou
                  contester) par leurs émetteurs.
                </>
              )}
              {report.rejected.length > 0 && (
                <>
                  <br />⚠ {report.rejected.length} ligne(s) rejetée(s) :
                  <ul>
                    {report.rejected.slice(0, 20).map((r, i) => (
                      <li key={i}>
                        Ligne {r.line} : {r.reason}
                      </li>
                    ))}
                  </ul>
                  Corrigez ces lignes dans votre fichier puis ré-importez-les seules.
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
