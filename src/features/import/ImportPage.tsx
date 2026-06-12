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
  normalizeStatus,
  readSheet,
  type SheetData,
} from '../../lib/excel';
import { nextNumber } from '../../lib/hooks';
import type { Doc, DocVersion, Stakeholder, Tag } from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

interface ImportReport {
  created: number;
  rejected: { line: number; reason: string }[];
}

export default function ImportPage() {
  const { project } = useOutletContext<ProjectContext>();
  const me = useSession((s) => s.me)!;

  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [targetVersion, setTargetVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const { items: docs } = useList<Doc>('documents', { sort: 'title' }, [project.id]);
  const { items: versions } = useList<DocVersion>('document_versions', { sort: '-version_num' }, [project.id]);

  const projectDocs = docs.filter((d) => !d.archived);
  const versionOptions = projectDocs.flatMap((d) =>
    versions
      .filter((v) => v.document === d.id)
      .map((v) => ({ id: v.id, label: `${d.title} — indice ${v.index_label}` }))
  );

  async function onFile(f: File | null) {
    setReport(null);
    if (!f) return;
    setFileName(f.name);
    const data = await readSheet(f);
    setSheet(data);
    setMapping(guessMapping(data.headers));
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
        <h2>Import d’un tableau d’observations Excel</h2>
      </div>
      <p className="muted">
        Pour reprendre les projets en cours : importez votre tableau existant. L’import est tolérant — ligne à ligne,
        avec rapport détaillé. Les numéros d’origine sont conservés en « réf. externe », la numérotation interne
        n’écrase jamais l’historique des comptes rendus signés.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
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
            {IMPORT_TARGETS.map((t) => (
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
            <div className="form-actions">
              <button className="btn" onClick={runImport} disabled={busy || !mapping['body']}>
                {busy ? 'Import en cours…' : `Importer ${sheet.rows.length} ligne(s)`}
              </button>
            </div>
          </div>

          {report && (
            <div className={`alert ${report.rejected.length ? 'warn' : 'info'}`}>
              ✅ {report.created} remarque(s) créée(s).
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
