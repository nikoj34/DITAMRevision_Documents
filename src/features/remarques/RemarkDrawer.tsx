import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Avatar, Badge, Drawer, Field } from '../../components/ui';
import { changeRemarkStatus } from './remarkApi';
import { nextNumber } from '../../lib/hooks';
import type { Doc, DocVersion, Remark, RemarkReply, RemarkStatus, ResponseKind, Tag } from '../../lib/types';
import {
  CRITICITY_COLORS,
  CRITICITY_LABELS,
  REMARK_STATUS_COLORS,
  REMARK_STATUS_LABELS,
  REMARK_TYPE_LABELS,
  RESPONSE_KIND_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  fmtDate,
  fmtRemarkNum,
  isOverdue,
} from '../../lib/types';

const STATUS_FLOW: RemarkStatus[] = [
  'a_traiter',
  'en_cours',
  'repondue',
  'a_reverifier',
  'traitee',
  'sans_objet',
  'reportee',
];

export default function RemarkDrawer({
  remark,
  onClose,
  onChanged,
}: {
  remark: Remark;
  onClose: () => void;
  onChanged: () => void;
}) {
  const me = useSession((s) => s.me)!;
  const { items: replies, reload: reloadReplies } = useList<RemarkReply>(
    'remark_replies',
    { filter: `remark = "${remark.id}"`, sort: 'created', expand: 'author' },
    [remark.id]
  );
  const { items: sujets } = useList<Tag>(
    'tags',
    { filter: `project = "${remark.project}" && kind != "lot"`, sort: 'label' },
    [remark.project]
  );
  const [replyText, setReplyText] = useState('');
  const [replyKind, setReplyKind] = useState<ResponseKind | ''>('');
  const [busy, setBusy] = useState(false);
  const [decisionDone, setDecisionDone] = useState(false);

  const dv = remark.expand?.document_version as (DocVersion & { expand?: { document?: Doc } }) | undefined;
  const doc = dv?.expand?.document;
  const author = remark.expand?.author;
  const canClose = me.id === remark.author || ['MOA', 'AMO_PROGRAMMISTE', 'SECRETAIRE'].includes(me.role);

  async function sendReply() {
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      await pb.collection('remark_replies').create({
        remark: remark.id,
        author: me.id,
        kind: 'reponse',
        body: replyText.trim(),
      });
      const patch: Record<string, unknown> = {};
      if (replyKind) patch.response_kind = replyKind;
      // Une réponse fait passer une remarque « à traiter / en cours » à « répondue ».
      if (remark.status === 'a_traiter' || remark.status === 'en_cours') patch.status = 'repondue';
      if (Object.keys(patch).length) await pb.collection('remarks').update(remark.id, patch);
      setReplyText('');
      setReplyKind('');
      reloadReplies();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: RemarkStatus) {
    if (s === remark.status) return;
    if ((s === 'traitee' || s === 'sans_objet') && !canClose) {
      alert('Seul l’émetteur de la remarque (ou la MOA / le secrétaire) peut la clore — c’est la règle actée en atelier.');
      return;
    }
    setBusy(true);
    try {
      await changeRemarkStatus(remark, s, me);
      reloadReplies();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleSujet(id: string) {
    const cur = remark.themes || [];
    const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
    await pb.collection('remarks').update(remark.id, { themes: next });
    onChanged();
  }

  async function toDecision() {
    setBusy(true);
    try {
      const number = await nextNumber('decisions', remark.project);
      const title = stripHtml(remark.body).slice(0, 120);
      await pb.collection('decisions').create({
        project: remark.project,
        number,
        title,
        body: remark.body,
        status: 'a_arbitrer',
        source_phase: doc?.phase || null,
        source_remarks: [remark.id],
        history: [
          {
            date: new Date().toISOString(),
            old_status: '',
            new_status: 'a_arbitrer',
            by_name: me.display_name,
            note: `Créée depuis la remarque ${fmtRemarkNum(remark.number)}`,
          },
        ],
      });
      setDecisionDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={
        <span>
          {fmtRemarkNum(remark.number)}{' '}
          <Badge color={REMARK_STATUS_COLORS[remark.status]}>{REMARK_STATUS_LABELS[remark.status]}</Badge>
        </span>
      }
      onClose={onClose}
    >
      <dl className="meta-grid">
        {doc && (
          <>
            <dt>Document</dt>
            <dd>
              {doc.title} — indice {dv?.index_label}
            </dd>
          </>
        )}
        {(remark.page || remark.text_ref) && (
          <>
            <dt>Localisation</dt>
            <dd>{[remark.page ? `page ${remark.page}` : '', remark.text_ref].filter(Boolean).join(' — ')}</dd>
          </>
        )}
        <dt>Type</dt>
        <dd>{remark.type ? REMARK_TYPE_LABELS[remark.type] : '—'}</dd>
        <dt>Criticité</dt>
        <dd>
          {remark.criticity && (
            <Badge color={CRITICITY_COLORS[remark.criticity]}>{CRITICITY_LABELS[remark.criticity]}</Badge>
          )}
        </dd>
        {remark.expand?.lot && (
          <>
            <dt>Lot / thème</dt>
            <dd>{remark.expand.lot.label}</dd>
          </>
        )}
        <dt>Émetteur</dt>
        <dd>
          {author ? `${author.display_name} (${author.organization || ROLE_LABELS[author.role]})` : '—'} le{' '}
          {fmtDate(remark.created)}
        </dd>
        {remark.due_date && (
          <>
            <dt>Échéance</dt>
            <dd style={isOverdue(remark) ? { color: '#c0392b', fontWeight: 600 } : undefined}>
              {fmtDate(remark.due_date)} {isOverdue(remark) && '(dépassée)'}
            </dd>
          </>
        )}
        {remark.external_ref && (
          <>
            <dt>Réf. d’origine</dt>
            <dd>{remark.external_ref}</dd>
          </>
        )}
        {remark.response_kind && (
          <>
            <dt>Sens de la réponse</dt>
            <dd>{RESPONSE_KIND_LABELS[remark.response_kind]}</dd>
          </>
        )}
        {remark.carried_from && (
          <>
            <dt>Origine</dt>
            <dd className="muted">Reportée depuis un indice précédent</dd>
          </>
        )}
      </dl>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="rc-body" style={{ whiteSpace: 'pre-wrap' }}>
          {stripHtml(remark.body)}
        </div>
      </div>

      {sujets.length > 0 && (
        <>
          <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)' }}>
            Sujets de suivi
          </h4>
          <p className="small muted">
            Reliez la remarque à un local, un ouvrage ou un thème : le « Suivi par sujet » regroupe tout l’historique
            entre phases, même quand les documents sont reformulés.
          </p>
          <div className="status-buttons">
            {sujets.map((s) => (
              <button
                key={s.id}
                className={`status-pill ${(remark.themes || []).includes(s.id) ? 'current' : ''}`}
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

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)' }}>
        Changer le statut
      </h4>
      <div className="status-buttons">
        {STATUS_FLOW.map((s) => (
          <button
            key={s}
            className={`status-pill ${s === remark.status ? 'current' : ''}`}
            style={{ '--sp-color': REMARK_STATUS_COLORS[s] } as React.CSSProperties}
            onClick={() => setStatus(s)}
            disabled={busy}
          >
            {REMARK_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <p className="small muted">
        La clôture (« traitée » / « sans objet ») est réservée à l’émetteur, à la MOA et au secrétaire. Chaque
        changement est tracé dans le fil ci-dessous.
      </p>

      {decisionDone ? (
        <div className="alert info">Décision créée au registre — retrouvez-la dans l’onglet « Décisions ».</div>
      ) : (
        <button className="btn secondary small" onClick={toDecision} disabled={busy}>
          ⚖️ Transformer en décision (registre inter-phases)
        </button>
      )}

      <h4 className="small" style={{ textTransform: 'uppercase', color: 'var(--gris-500)', marginTop: 18 }}>
        Fil de discussion
      </h4>
      <div className="thread">
        {replies.map((rep) => {
          const a = rep.expand?.author;
          const isStatus = rep.kind === 'changement_statut';
          return (
            <div key={rep.id} className="thread-item">
              {a && <Avatar name={a.display_name} color={ROLE_COLORS[a.role] || '#3e4750'} size={26} />}
              <div className={`thread-bubble ${isStatus ? 'status-change' : ''}`}>
                <div className="tb-meta">
                  {a ? `${a.display_name} — ${ROLE_LABELS[a.role]}` : '?'} · {fmtDate(rep.created)}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{stripHtml(rep.body)}</div>
              </div>
            </div>
          );
        })}
        {replies.length === 0 && <p className="small muted">Aucune réponse pour l’instant.</p>}
      </div>

      <Field label="Répondre (sans modifier le document original)">
        <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Votre réponse, proposition ou justification…" />
      </Field>
      <div className="form-row">
        <Field label="Sens de la réponse (optionnel)">
          <select value={replyKind} onChange={(e) => setReplyKind(e.target.value as ResponseKind | '')}>
            <option value="">—</option>
            {(Object.keys(RESPONSE_KIND_LABELS) as ResponseKind[]).map((k) => (
              <option key={k} value={k}>
                {RESPONSE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions" style={{ alignItems: 'flex-end', display: 'flex' }}>
          <button className="btn" onClick={sendReply} disabled={busy || !replyText.trim()}>
            Envoyer
          </button>
        </div>
      </div>
    </Drawer>
  );
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}
