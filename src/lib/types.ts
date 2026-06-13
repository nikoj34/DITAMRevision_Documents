// Types des collections PocketBase et référentiels métier (libellés, couleurs).

export interface BaseRecord {
  id: string;
  created: string;
  updated?: string;
}

export interface Project extends BaseRecord {
  name: string;
  code: string;
  description: string;
  client: string;
  with_moe: boolean;
  archived: boolean;
}

export type PhaseType =
  | 'PROGRAMME' | 'ESQ' | 'APS' | 'APD' | 'PRO' | 'DCE' | 'ACT' | 'EXE' | 'AOR' | 'AUTRE';

export interface Phase extends BaseRecord {
  project: string;
  phase_type: PhaseType;
  iteration: number;
  label: string;
  status: 'a_venir' | 'en_cours' | 'close';
  start_date: string;
  end_date: string;
  sort_order: number;
}

export type Role =
  | 'MOA' | 'AMO_PROGRAMMISTE' | 'ARCHITECTE_MOE' | 'BET' | 'ECONOMISTE'
  | 'CONTROLEUR_TECHNIQUE' | 'EXPLOITANT' | 'SECRETAIRE' | 'AUTRE';

export interface Stakeholder extends BaseRecord {
  display_name: string;
  organization: string;
  role: Role;
  specialty: string;
  email: string;
  active: boolean;
}

export interface Tag extends BaseRecord {
  project: string;
  label: string;
  kind: 'lot' | 'theme' | 'local';
}

export type DocCategory =
  | 'plan' | 'notice' | 'cctp' | 'dpgf' | 'estimation' | 'planning' | 'programme' | 'cr' | 'autre';

export interface Doc extends BaseRecord {
  phase: string;
  title: string;
  doc_code: string;
  category: DocCategory;
  lot: string;
  archived: boolean;
  expand?: { phase?: Phase; lot?: Tag };
}

export interface DocVersion extends BaseRecord {
  document: string;
  index_label: string;
  version_num: number;
  file: string;
  is_pdf: boolean;
  uploaded_by: string;
  issue_date: string;
  comment: string;
  expand?: { document?: Doc; uploaded_by?: Stakeholder };
}

export type RemarkStatus =
  | 'a_traiter' | 'en_cours' | 'repondue' | 'a_reverifier' | 'traitee' | 'sans_objet' | 'reportee';

export type RemarkType =
  | 'observation' | 'demande_modification' | 'question' | 'reserve' | 'ecart_programme' | 'suggestion';

export type Criticity = 'bloquante' | 'importante' | 'normale' | 'mineure';

export type ResponseKind =
  | 'prise_en_compte' | 'prise_en_compte_partielle' | 'refusee'
  | 'demande_precision' | 'necessite_arbitrage' | 'hors_mission';

export type AnchorKind = 'epingle_pdf' | 'zone_pdf' | 'reference_texte' | 'document_entier';

export interface AnchorRect {
  x: number; // coordonnées normalisées 0–1 par rapport à la page
  y: number;
  w: number;
  h: number;
}

export interface Remark extends BaseRecord {
  project: string;
  number: number;
  external_ref: string;
  document_version: string;
  anchor_kind: AnchorKind;
  page: number;
  anchor_rect: AnchorRect | null;
  text_ref: string;
  body: string;
  type: RemarkType;
  criticity: Criticity;
  lot: string;
  themes: string[];
  status: RemarkStatus;
  response_kind: ResponseKind | '';
  author: string;
  assigned_to: string;
  due_date: string;
  closed_at: string;
  closed_by: string;
  carried_from: string;
  requirements: string[];
  expand?: {
    author?: Stakeholder;
    assigned_to?: Stakeholder;
    lot?: Tag;
    themes?: Tag[];
    document_version?: DocVersion & { expand?: { document?: Doc } };
    carried_from?: Remark;
  };
}

export interface RemarkReply extends BaseRecord {
  remark: string;
  author: string;
  body: string;
  kind: 'reponse' | 'commentaire' | 'changement_statut';
  new_status: string;
  expand?: { author?: Stakeholder };
}

export type DecisionStatus = 'a_arbitrer' | 'actee' | 'modifiee' | 'reportee' | 'abandonnee';

export interface DecisionVerification {
  phase: string;
  phase_label: string;
  result: 'conforme' | 'non_conforme' | 'non_verifiable';
  by: string;
  by_name: string;
  date: string;
  note: string;
}

export interface DecisionHistoryEntry {
  date: string;
  old_status: string;
  new_status: string;
  by_name: string;
  note: string;
}

export interface Decision extends BaseRecord {
  project: string;
  number: number;
  title: string;
  body: string;
  status: DecisionStatus;
  source_phase: string;
  source_remarks: string[];
  replaced_by: string;
  decided_by: string;
  decided_at: string;
  meeting_ref: string;
  themes: string[];
  cost_impact: number;
  surface_impact: number;
  verifications: DecisionVerification[] | null;
  history: DecisionHistoryEntry[] | null;
  expand?: { source_phase?: Phase; decided_by?: Stakeholder; source_remarks?: Remark[]; themes?: Tag[] };
}

// ───────────────────────── Référentiels d'affichage ─────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  MOA: 'Maîtrise d’ouvrage',
  AMO_PROGRAMMISTE: 'AMO / Programmiste',
  ARCHITECTE_MOE: 'Architecte (MOE)',
  BET: 'Bureau d’études (BET)',
  ECONOMISTE: 'Économiste',
  CONTROLEUR_TECHNIQUE: 'Contrôleur technique',
  EXPLOITANT: 'Utilisateur / Exploitant',
  SECRETAIRE: 'Secrétaire de séance',
  AUTRE: 'Autre',
};

export const ROLE_COLORS: Record<Role, string> = {
  MOA: '#1c4d77',
  AMO_PROGRAMMISTE: '#0e7d7d',
  ARCHITECTE_MOE: '#d97706',
  BET: '#8e5bd0',
  ECONOMISTE: '#b3473e',
  CONTROLEUR_TECHNIQUE: '#c0392b',
  EXPLOITANT: '#2f8a4c',
  SECRETAIRE: '#6b7681',
  AUTRE: '#3e4750',
};

export const PHASE_TYPES: PhaseType[] = [
  'PROGRAMME', 'ESQ', 'APS', 'APD', 'PRO', 'DCE', 'ACT', 'EXE', 'AOR', 'AUTRE',
];

export const PHASE_TYPE_LABELS: Record<PhaseType, string> = {
  PROGRAMME: 'Programme',
  ESQ: 'Esquisse (ESQ)',
  APS: 'Avant-projet sommaire (APS)',
  APD: 'Avant-projet définitif (APD)',
  PRO: 'Projet (PRO)',
  DCE: 'Dossier de consultation (DCE)',
  ACT: 'Assistance contrats (ACT)',
  EXE: 'Études d’exécution (EXE)',
  AOR: 'Réception (AOR)',
  AUTRE: 'Autre jalon',
};

export const REMARK_STATUS_LABELS: Record<RemarkStatus, string> = {
  a_traiter: 'À traiter',
  en_cours: 'En cours',
  repondue: 'Répondue',
  a_reverifier: 'À revérifier',
  traitee: 'Traitée / close',
  sans_objet: 'Sans objet / abandonnée',
  reportee: 'Reportée phase suivante',
};

export const REMARK_STATUS_COLORS: Record<RemarkStatus, string> = {
  a_traiter: '#c97a06',
  en_cours: '#d97706',
  repondue: '#2e7cb5',
  a_reverifier: '#8a5fc0',
  traitee: '#2f8a4c',
  sans_objet: '#6b7681',
  reportee: '#b3473e',
};

export const REMARK_TYPE_LABELS: Record<RemarkType, string> = {
  observation: 'Observation',
  demande_modification: 'Demande de modification',
  question: 'Question',
  reserve: 'Réserve',
  ecart_programme: 'Écart au programme',
  suggestion: 'Suggestion',
};

export const CRITICITY_LABELS: Record<Criticity, string> = {
  bloquante: 'Bloquante',
  importante: 'Importante',
  normale: 'Normale',
  mineure: 'Mineure',
};

export const CRITICITY_COLORS: Record<Criticity, string> = {
  bloquante: '#c0392b',
  importante: '#d97706',
  normale: '#2e7cb5',
  mineure: '#6b7681',
};

export const RESPONSE_KIND_LABELS: Record<ResponseKind, string> = {
  prise_en_compte: 'Prise en compte',
  prise_en_compte_partielle: 'Prise en compte partielle',
  refusee: 'Refusée (justifiée)',
  demande_precision: 'Demande de précision',
  necessite_arbitrage: 'Nécessite arbitrage',
  hors_mission: 'Hors mission',
};

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  a_arbitrer: 'À arbitrer',
  actee: 'Actée',
  modifiee: 'Modifiée',
  reportee: 'Reportée',
  abandonnee: 'Abandonnée',
};

export const DECISION_STATUS_COLORS: Record<DecisionStatus, string> = {
  a_arbitrer: '#c97a06',
  actee: '#2f8a4c',
  modifiee: '#2e7cb5',
  reportee: '#8a5fc0',
  abandonnee: '#6b7681',
};

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  plan: 'Plan',
  notice: 'Notice',
  cctp: 'CCTP',
  dpgf: 'DPGF',
  estimation: 'Estimation',
  planning: 'Planning',
  programme: 'Programme',
  cr: 'Compte rendu',
  autre: 'Autre',
};

export function fmtRemarkNum(n: number): string {
  return `R-${String(n).padStart(4, '0')}`;
}

export function fmtDecisionNum(n: number): string {
  return `D-${String(n).padStart(3, '0')}`;
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR');
}

export function isOverdue(r: Remark): boolean {
  return (
    !!r.due_date &&
    !['traitee', 'sans_objet', 'reportee'].includes(r.status) &&
    new Date(r.due_date).getTime() < Date.now()
  );
}

/** Statuts considérés comme "vivants" (à reporter sur un nouvel indice). */
export const OPEN_STATUSES: RemarkStatus[] = ['a_traiter', 'en_cours', 'repondue', 'a_reverifier'];

// ───────────────────── Exigences du programme ─────────────────────

export type RequirementStatus = 'active' | 'amendee' | 'abandonnee';

export type RequirementVerifResult = 'conforme' | 'non_conforme' | 'ecart_accepte' | 'non_verifiable';

export interface RequirementVerification {
  phase: string;
  phase_label: string;
  result: RequirementVerifResult;
  by: string;
  by_name: string;
  date: string;
  note: string;
}

/** Origine d'une exigence : texte libre, avec suggestions courantes. */
export const ORIGIN_SUGGESTIONS: string[] = [
  'Programme',
  'DSST — Santé & sécurité au travail',
  'Équipe de recherche',
  'Utilisateurs',
  'Réglementation',
  'Sûreté',
  'Environnement',
  'Exploitation-maintenance',
  'Informatique / réseaux',
];

const ORIGIN_COLOR_MAP: [RegExp, string][] = [
  [/programme/i, '#1c4d77'],
  [/dsst|sant[ée]|s[ée]curit[ée] au travail/i, '#c0392b'],
  [/recherche/i, '#b3621b'],
  [/utilisateur/i, '#2f8a4c'],
  [/r[ée]glement/i, '#8a5fc0'],
  [/s[ûu]ret[ée]/i, '#3e4750'],
  [/environnement/i, '#2f8a4c'],
  [/exploitation|maintenance/i, '#0e7d7d'],
  [/informatique|r[ée]seau/i, '#23618f'],
];

export function originColor(origin: string): string {
  for (const [re, color] of ORIGIN_COLOR_MAP) if (re.test(origin)) return color;
  return '#6b7681';
}

export interface Requirement extends BaseRecord {
  project: string;
  code: string;
  label: string;
  description: string;
  target_value: string;
  origin: string;
  source_ref: string;
  themes: string[];
  status: RequirementStatus;
  status_note: string;
  verifications: RequirementVerification[] | null;
  expand?: { themes?: Tag[] };
}

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  active: 'Active',
  amendee: 'Amendée',
  abandonnee: 'Abandonnée',
};

export const REQUIREMENT_STATUS_COLORS: Record<RequirementStatus, string> = {
  active: '#2f8a4c',
  amendee: '#2e7cb5',
  abandonnee: '#6b7681',
};

export const REQ_VERIF_LABELS: Record<RequirementVerifResult, string> = {
  conforme: 'Conforme',
  non_conforme: 'Non conforme',
  ecart_accepte: 'Écart accepté',
  non_verifiable: 'Non vérifiable à ce stade',
};

export const REQ_VERIF_COLORS: Record<RequirementVerifResult, string> = {
  conforme: '#2f8a4c',
  non_conforme: '#c0392b',
  ecart_accepte: '#d97706',
  non_verifiable: '#8a5fc0',
};

export const REQ_VERIF_ICONS: Record<RequirementVerifResult, string> = {
  conforme: '✅',
  non_conforme: '❌',
  ecart_accepte: '⚖️',
  non_verifiable: '⏳',
};

/**
 * Convertit un contenu (texte ou HTML résiduel) en texte brut SANS exécuter
 * de code : DOMParser ne déclenche ni script ni chargement de ressource sur
 * un document détaché (contrairement à innerHTML). Les contenus de remarques
 * sont déjà du texte saisi en <textarea>, ceci est une protection en
 * profondeur — le rendu se fait ensuite via React qui échappe le texte.
 */
export function plainText(s: string | null | undefined): string {
  const raw = s ?? '';
  if (!raw.includes('<') && !raw.includes('&')) return raw.trim();
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    return (doc.body.textContent || '').trim();
  } catch {
    return raw.replace(/<[^>]*>/g, '').trim();
  }
}
