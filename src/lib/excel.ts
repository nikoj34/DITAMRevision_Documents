import * as XLSX from 'xlsx';
import type { Decision, Doc, DocVersion, Phase, Remark } from './types';
import {
  CRITICITY_LABELS,
  DECISION_STATUS_LABELS,
  REMARK_STATUS_LABELS,
  REMARK_TYPE_LABELS,
  RESPONSE_KIND_LABELS,
  fmtDate,
  fmtDecisionNum,
  fmtRemarkNum,
} from './types';

// ─────────────────────────── Export ───────────────────────────
// Trame du tableau d'observations type des marchés publics français :
// l'export doit être livrable tel quel en annexe d'un compte rendu.

export interface ExportContext {
  projectName: string;
  phases: Phase[];
  /** Réponse MOE = dernière réponse du fil, fournie par l'appelant. */
  lastReplies: Record<string, { body: string; date: string; author: string }>;
}

export function exportRegister(remarks: Remark[], decisions: Decision[], ctx: ExportContext) {
  const phaseById = new Map(ctx.phases.map((p) => [p.id, p]));

  const obsRows = remarks.map((r) => {
    const dv = r.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
    const doc = dv?.expand?.document;
    const phase = doc ? phaseById.get(doc.phase) : undefined;
    const reply = ctx.lastReplies[r.id];
    return {
      'N°': fmtRemarkNum(r.number),
      'Réf. externe': r.external_ref || '',
      'Phase': phase?.label || '',
      'Document': doc ? `${doc.doc_code ? doc.doc_code + ' — ' : ''}${doc.title}` : '',
      'Indice': dv?.index_label || '',
      'Page / repère': [r.page ? `p.${r.page}` : '', r.text_ref].filter(Boolean).join(' / '),
      'Lot / thème': r.expand?.lot?.label || '',
      'Type': r.type ? REMARK_TYPE_LABELS[r.type] : '',
      'Criticité': r.criticity ? CRITICITY_LABELS[r.criticity] : '',
      'Émetteur': r.expand?.author
        ? `${r.expand.author.display_name} (${r.expand.author.organization})`
        : '',
      'Date': fmtDate(r.created),
      'Observation': stripHtml(r.body),
      'Réponse': reply ? stripHtml(reply.body) : '',
      'Date réponse': reply?.date || '',
      'Sens de la réponse': r.response_kind ? RESPONSE_KIND_LABELS[r.response_kind] : '',
      'Assignée à': r.expand?.assigned_to?.display_name || '',
      'Échéance': fmtDate(r.due_date),
      'Statut': REMARK_STATUS_LABELS[r.status],
      'Date de clôture': fmtDate(r.closed_at),
    };
  });

  const decRows = decisions.map((d) => ({
    'N°': fmtDecisionNum(d.number),
    'Intitulé': d.title,
    'Détail': stripHtml(d.body),
    'Statut': DECISION_STATUS_LABELS[d.status],
    'Phase d’origine': d.expand?.source_phase?.label || '',
    'Décideur': d.expand?.decided_by?.display_name || '',
    'Date décision': fmtDate(d.decided_at),
    'Référence CR / arbitrage': d.meeting_ref || '',
    'Impact coût (€)': d.cost_impact || '',
    'Impact surface (m²)': d.surface_impact || '',
    'Remarques liées': (d.expand?.source_remarks || []).map((r) => fmtRemarkNum(r.number)).join(', '),
    'Vérifications par phase': (d.verifications || [])
      .map((v) => `${v.phase_label}: ${v.result}${v.note ? ` (${v.note})` : ''}`)
      .join(' ; '),
  }));

  const wb = XLSX.utils.book_new();
  const wsObs = XLSX.utils.json_to_sheet(obsRows);
  wsObs['!cols'] = [
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 32 }, { wch: 7 }, { wch: 16 },
    { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 26 }, { wch: 10 }, { wch: 60 },
    { wch: 60 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsObs, 'Observations');
  const wsDec = XLSX.utils.json_to_sheet(decRows);
  wsDec['!cols'] = [
    { wch: 7 }, { wch: 40 }, { wch: 60 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
    { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDec, 'Registre des décisions');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Observations_${slug(ctx.projectName)}_${today}.xlsx`);
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─────────────────────────── Import ───────────────────────────

export interface SheetData {
  sheetNames: string[];
  headers: string[];
  rows: Record<string, unknown>[];
}

export async function readSheet(file: File, sheetName?: string): Promise<SheetData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const headers = rows.length
    ? Object.keys(rows[0])
    : (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] as string[] | undefined) || [];
  return { sheetNames: wb.SheetNames, headers, rows };
}

/** Champs cibles proposés dans l'assistant de correspondance des colonnes. */
export const IMPORT_TARGETS: { key: string; label: string }[] = [
  { key: 'external_ref', label: 'N° d’origine (réf. externe)' },
  { key: 'body', label: 'Observation (texte) *' },
  { key: 'text_ref', label: 'Page / repère / localisation' },
  { key: 'lot_label', label: 'Lot / thème' },
  { key: 'author_name', label: 'Émetteur' },
  { key: 'criticity', label: 'Criticité' },
  { key: 'type', label: 'Type / nature' },
  { key: 'status', label: 'Statut' },
  { key: 'due_date', label: 'Échéance' },
  { key: 'response', label: 'Réponse (MOE)' },
];

/** Devine la colonne source la plus probable pour chaque champ cible. */
export function guessMapping(headers: string[]): Record<string, string> {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const find = (...needles: string[]) =>
    headers.find((h) => needles.some((n) => norm(h).includes(n))) || '';
  return {
    external_ref: find('n°', 'num', 'no ', 'ref'),
    body: find('observation', 'remarque', 'commentaire', 'libelle'),
    text_ref: find('page', 'repere', 'localisation', 'chapitre'),
    lot_label: find('lot', 'theme', 'discipline'),
    author_name: find('emetteur', 'auteur', 'origine'),
    criticity: find('critic', 'gravite', 'priorite'),
    type: find('type', 'nature'),
    status: find('statut', 'etat', 'suite'),
    due_date: find('echeance', 'delai', 'date limite'),
    response: find('reponse'),
  };
}

const CRIT_MAP: Record<string, string> = {
  bloquant: 'bloquante', bloquante: 'bloquante', '1': 'bloquante', critique: 'bloquante',
  majeur: 'importante', majeure: 'importante', important: 'importante', importante: 'importante', '2': 'importante',
  normal: 'normale', normale: 'normale', moyen: 'normale', moyenne: 'normale', '3': 'normale',
  mineur: 'mineure', mineure: 'mineure', info: 'mineure', information: 'mineure', '4': 'mineure',
};

const STATUS_MAP: Record<string, string> = {
  ouvert: 'a_traiter', ouverte: 'a_traiter', 'a traiter': 'a_traiter', 'en attente': 'a_traiter', emise: 'a_traiter',
  'en cours': 'en_cours',
  repondu: 'repondue', repondue: 'repondue', 'reponse moe': 'repondue',
  'a verifier': 'a_reverifier', 'a reverifier': 'a_reverifier',
  levee: 'traitee', soldee: 'traitee', solde: 'traitee', close: 'traitee', cloturee: 'traitee', traitee: 'traitee', traite: 'traitee',
  'sans objet': 'sans_objet', abandonnee: 'sans_objet', abandonne: 'sans_objet', 'sans suite': 'sans_objet',
  reportee: 'reportee', reporte: 'reportee',
};

export function normalizeCriticity(v: unknown): string {
  const k = String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return CRIT_MAP[k] || 'normale';
}

export function normalizeStatus(v: unknown): string {
  const k = String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return STATUS_MAP[k] || 'a_traiter';
}

export function normalizeDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = new Date(Number(year), Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
