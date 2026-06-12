import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
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

/** Export simple du registre des décisions (usage interne / annexe CR). */
export function exportDecisions(decisions: Decision[], projectName: string) {
  const rows = decisions.map((d) => ({
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
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 7 }, { wch: 40 }, { wch: 60 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
    { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Registre des décisions');
  XLSX.writeFile(wb, `Decisions_${slug(projectName)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─────────────────────────── Export ───────────────────────────
// Trame du tableau d'observations type des marchés publics français :
// l'export doit être livrable tel quel en annexe d'un compte rendu.

export interface ExportContext {
  projectName: string;
  phases: Phase[];
  /** Réponse MOE = dernière réponse du fil, fournie par l'appelant. */
  lastReplies: Record<string, { body: string; date: string; author: string }>;
}

/** Nom de la feuille déprotégée réservée aux ajouts de la MOE. */
export const NEW_REMARKS_SHEET = 'Nouvelles remarques (MOE)';

const RESPONSE_KIND_LIST = Object.values(RESPONSE_KIND_LABELS).join(',');

/**
 * Export « fiche navette » : la feuille Observations est PROTÉGÉE — le texte
 * des remarques est verrouillé et l'insertion/suppression de lignes bloquée,
 * pour qu'aucune ligne ne puisse être glissée ou reformulée discrètement.
 * Seules les colonnes Réponse / Sens de la réponse sont saisissables.
 * Les ajouts de la MOE passent par la feuille dédiée, déprotégée.
 */
export async function exportRegister(remarks: Remark[], ctx: ExportContext) {
  const phaseById = new Map(ctx.phases.map((p) => [p.id, p]));
  const wb = new ExcelJS.Workbook();

  // ── Feuille 1 : Observations (protégée) ──
  const ws = wb.addWorksheet('Observations');
  const columns: { header: string; width: number; editable?: boolean }[] = [
    { header: 'N°', width: 9 },
    { header: 'Réf. externe', width: 11 },
    { header: 'Phase', width: 10 },
    { header: 'Document', width: 32 },
    { header: 'Indice', width: 7 },
    { header: 'Page / repère', width: 16 },
    { header: 'Lot / thème', width: 16 },
    { header: 'Type', width: 20 },
    { header: 'Criticité', width: 11 },
    { header: 'Émetteur', width: 26 },
    { header: 'Date', width: 11 },
    { header: 'Observation', width: 60 },
    { header: 'Réponse', width: 60, editable: true },
    { header: 'Sens de la réponse', width: 22, editable: true },
    { header: 'Répondant (MOE)', width: 22, editable: true },
    { header: 'Renvoi (plans / pièces)', width: 26, editable: true },
    { header: 'Échéance', width: 11 },
    { header: 'Statut', width: 20 },
  ];
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width }));
  const editableCols = columns
    .map((c, i) => (c.editable ? i + 1 : 0))
    .filter(Boolean);
  const kindCol = columns.findIndex((c) => c.header === 'Sens de la réponse') + 1;

  for (const r of remarks) {
    const dv = r.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
    const doc = dv?.expand?.document;
    const phase = doc ? phaseById.get(doc.phase) : undefined;
    const reply = ctx.lastReplies[r.id];
    ws.addRow([
      fmtRemarkNum(r.number),
      r.external_ref || '',
      phase?.label || '',
      doc ? `${doc.doc_code ? doc.doc_code + ' — ' : ''}${doc.title}` : '',
      dv?.index_label || '',
      [r.page ? `p.${r.page}` : '', r.text_ref].filter(Boolean).join(' / '),
      r.expand?.lot?.label || '',
      r.type ? REMARK_TYPE_LABELS[r.type] : '',
      r.criticity ? CRITICITY_LABELS[r.criticity] : '',
      r.expand?.author ? `${r.expand.author.display_name} (${r.expand.author.organization})` : '',
      fmtDate(r.created),
      stripHtml(r.body),
      reply ? stripHtml(reply.body) : '',
      r.response_kind ? RESPONSE_KIND_LABELS[r.response_kind] : '',
      reply?.author || '',
      '',
      fmtDate(r.due_date),
      REMARK_STATUS_LABELS[r.status],
    ]);
  }

  // Mise en forme : en-tête, retours à la ligne, colonnes saisissables
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEAF5' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (let i = 2; i <= remarks.length + 1; i++) {
    ws.getCell(i, 12).alignment = { wrapText: true, vertical: 'top' };
    for (const col of editableCols) {
      const cell = ws.getCell(i, col);
      cell.protection = { locked: false };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6DC' } };
      cell.alignment = { wrapText: true, vertical: 'top' };
    }
    ws.getCell(i, kindCol).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${RESPONSE_KIND_LIST}"`],
    };
  }
  // Protection : tout est verrouillé sauf les cellules ci-dessus ;
  // insertion et suppression de lignes interdites. Le TRI reste autorisé
  // (demande MOE : dispatcher par lot) — sans risque, le rapprochement à
  // l'import se fait par n° de remarque, pas par position de ligne.
  await ws.protect('CIRAD', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
    sort: true,
    autoFilter: true,
    insertRows: false,
    deleteRows: false,
    insertColumns: false,
    deleteColumns: false,
  });

  // ── Feuille 2 : Nouvelles remarques (déprotégée) ──
  const wsNew = wb.addWorksheet(NEW_REMARKS_SHEET);
  wsNew.columns = [
    { header: 'Réf. MOE', width: 12 },
    { header: 'Document', width: 32 },
    { header: 'Page / repère', width: 18 },
    { header: 'Lot', width: 18 },
    { header: 'Criticité', width: 14 },
    { header: 'Observation', width: 80 },
  ];
  wsNew.getRow(1).font = { bold: true };
  wsNew.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEAF5' } };
  wsNew.insertRow(1, [
    'Ajoutez ici vos remarques nouvelles (une par ligne). Ne modifiez pas la feuille « Observations » en dehors des colonnes jaunes.',
  ]);
  wsNew.getRow(1).font = { italic: true, color: { argb: 'FF6B7681' } };
  for (let i = 3; i <= 202; i++) {
    wsNew.getCell(i, 5).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Bloquante,Importante,Normale,Mineure"'],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Observations_${slug(ctx.projectName)}_${today}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
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

/**
 * Lit la feuille « Nouvelles remarques (MOE) » d'une fiche navette retournée
 * (null si absente). La ligne 1 est une consigne, les en-têtes sont en ligne 2.
 */
export async function readNewRemarksSheet(file: File): Promise<Record<string, unknown>[] | null> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  if (!wb.SheetNames.includes(NEW_REMARKS_SHEET)) return null;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[NEW_REMARKS_SHEET], {
    defval: '',
    range: 1,
  });
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

/** Sens de réponse MOE en texte libre → valeur normalisée (ou ''). */
export function normalizeResponseKind(v: unknown): string {
  const k = String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!k) return '';
  if (k.includes('partiel')) return 'prise_en_compte_partielle';
  if (k.includes('prise en compte') || k.includes('pris en compte') || k === 'ok' || k.includes('accord'))
    return 'prise_en_compte';
  if (k.includes('refus')) return 'refusee';
  if (k.includes('precision')) return 'demande_precision';
  if (k.includes('arbitrage')) return 'necessite_arbitrage';
  if (k.includes('hors mission') || k.includes('avenant')) return 'hors_mission';
  return '';
}

/** Extrait le numéro interne d'une référence type "R-0042" (ou "42"). */
export function parseRemarkNumber(v: unknown): number | null {
  const m = String(v ?? '').match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
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
