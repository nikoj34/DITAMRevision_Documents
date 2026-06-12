import { pb } from '../../lib/pb';
import { nextNumber } from '../../lib/hooks';
import type { Remark, RemarkStatus, Stakeholder } from '../../lib/types';
import { OPEN_STATUSES, REMARK_STATUS_LABELS } from '../../lib/types';

export interface NewRemarkInput {
  project: string;
  document_version?: string;
  anchor_kind?: string;
  page?: number;
  anchor_rect?: { x: number; y: number; w: number; h: number } | null;
  text_ref?: string;
  body: string;
  type?: string;
  criticity?: string;
  lot?: string;
  themes?: string[];
  due_date?: string;
  assigned_to?: string;
  external_ref?: string;
  status?: RemarkStatus;
  carried_from?: string;
}

export async function createRemark(input: NewRemarkInput, author: Stakeholder): Promise<Remark> {
  const number = await nextNumber('remarks', input.project);
  return pb.collection('remarks').create<Remark>({
    status: 'a_traiter',
    type: 'observation',
    criticity: 'normale',
    anchor_kind: 'document_entier',
    ...input,
    number,
    author: author.id,
  });
}

/** Change le statut d'une remarque et trace le changement dans le fil. */
export async function changeRemarkStatus(
  remark: Remark,
  newStatus: RemarkStatus,
  me: Stakeholder,
  note?: string
): Promise<void> {
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'traitee' || newStatus === 'sans_objet') {
    patch.closed_at = new Date().toISOString();
    patch.closed_by = me.id;
  }
  await pb.collection('remarks').update(remark.id, patch);
  await pb.collection('remark_replies').create({
    remark: remark.id,
    author: me.id,
    kind: 'changement_statut',
    new_status: newStatus,
    body: note || `Statut changé en « ${REMARK_STATUS_LABELS[newStatus]} »`,
  });
}

/**
 * Report inter-versions : copie sur la nouvelle version toutes les remarques
 * encore vivantes de l'ancienne, en statut « à revérifier ». Les originales
 * restent figées sur leur indice (chaîne carried_from). Jamais de clôture
 * automatique.
 */
export async function carryOverRemarks(
  oldVersionId: string,
  newVersionId: string,
  me: Stakeholder
): Promise<number> {
  const open = await pb.collection('remarks').getFullList<Remark>({
    filter: `document_version = "${oldVersionId}" && (${OPEN_STATUSES.map((s) => `status = "${s}"`).join(' || ')})`,
  });
  for (const r of open) {
    const number = await nextNumber('remarks', r.project);
    const copy = await pb.collection('remarks').create<Remark>({
      project: r.project,
      number,
      external_ref: r.external_ref,
      document_version: newVersionId,
      anchor_kind: r.anchor_kind,
      page: r.page,
      anchor_rect: r.anchor_rect,
      text_ref: r.text_ref,
      body: r.body,
      type: r.type,
      criticity: r.criticity,
      lot: r.lot,
      themes: r.themes,
      status: 'a_reverifier',
      response_kind: r.response_kind,
      author: r.author,
      assigned_to: r.assigned_to,
      due_date: r.due_date,
      carried_from: r.id,
    });
    await pb.collection('remark_replies').create({
      remark: copy.id,
      author: me.id,
      kind: 'changement_statut',
      new_status: 'a_reverifier',
      body: 'Remarque reportée automatiquement depuis l’indice précédent — à revérifier sur le nouveau document.',
    });
  }
  return open.length;
}
