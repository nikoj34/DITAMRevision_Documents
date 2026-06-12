import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Avatar, EmptyState, Field, Modal } from '../../components/ui';
import type { Project } from '../../lib/types';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/types';

const DEFAULT_PHASES = ['Programme', 'ESQ', 'APS', 'APD', 'PRO', 'DCE'];
const PHASE_TYPE_BY_LABEL: Record<string, string> = {
  Programme: 'PROGRAMME', ESQ: 'ESQ', APS: 'APS', APD: 'APD', PRO: 'PRO', DCE: 'DCE',
};

export default function ProjectsPage() {
  const me = useSession((s) => s.me)!;
  const setMe = useSession((s) => s.setMe);
  const navigate = useNavigate();
  const { items, loading } = useList<Project>('projects', { filter: 'archived = false', sort: '-created' });
  const [creating, setCreating] = useState(false);

  return (
    <div className="main" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="page-head">
        <h2>Mes opérations</h2>
        <div className="spacer" />
        <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={me.display_name} color={ROLE_COLORS[me.role]} size={26} />
          {me.display_name} — {ROLE_LABELS[me.role]}
          <button className="btn-icon" title="Changer de profil" onClick={() => setMe(null)}>
            ⇄
          </button>
        </span>
        <button className="btn" onClick={() => setCreating(true)}>
          + Nouvelle opération
        </button>
      </div>
      {!loading && items.length === 0 && (
        <EmptyState
          icon="🏗️"
          text="Aucune opération pour le moment."
          hint="Créez votre première opération : un projet de construction avec ses phases d’études (Programme, ESQ, APS, APD…)."
        />
      )}
      <div className="card-grid">
        {items.map((p) => (
          <div key={p.id} className="card clickable" onClick={() => navigate(`/projet/${p.id}`)}>
            <h3 style={{ marginBottom: 4 }}>{p.name}</h3>
            {p.code && <div className="small muted">{p.code}</div>}
            {p.client && <div className="small">MOA : {p.client}</div>}
            <div className="small muted">{p.with_moe ? 'Avec maîtrise d’œuvre' : 'Sans MOE (régie, marché global…)'}</div>
          </div>
        ))}
      </div>
      {creating && <ProjectForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/projet/${id}`)} />}
    </div>
  );
}

function ProjectForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [client, setClient] = useState('');
  const [withMoe, setWithMoe] = useState(true);
  const [createPhases, setCreatePhases] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const proj = await pb.collection('projects').create<Project>({
        name: name.trim(),
        code: code.trim(),
        client: client.trim(),
        with_moe: withMoe,
        archived: false,
      });
      if (createPhases) {
        for (let i = 0; i < DEFAULT_PHASES.length; i++) {
          const label = DEFAULT_PHASES[i];
          await pb.collection('phases').create({
            project: proj.id,
            phase_type: PHASE_TYPE_BY_LABEL[label] || 'AUTRE',
            iteration: 1,
            label,
            status: i === 0 ? 'en_cours' : 'a_venir',
            sort_order: i,
          });
        }
      }
      onSaved(proj.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Nouvelle opération" onClose={onClose}>
      {err && <div className="alert error">{err}</div>}
      <Field label="Nom de l’opération" required>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Bâtiment de laboratoires…" />
      </Field>
      <div className="form-row">
        <Field label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="OP-2026-04" />
        </Field>
        <Field label="Maîtrise d’ouvrage">
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="CIRAD" />
        </Field>
      </div>
      <Field label="Type de projet">
        <select value={withMoe ? 'oui' : 'non'} onChange={(e) => setWithMoe(e.target.value === 'oui')}>
          <option value="oui">Avec maîtrise d’œuvre (loi MOP : ESQ, APS, APD…)</option>
          <option value="non">Sans MOE classique (régie, marché global, autre)</option>
        </select>
      </Field>
      <Field label="Phases">
        <select value={createPhases ? 'std' : 'vide'} onChange={(e) => setCreatePhases(e.target.value === 'std')}>
          <option value="std">Créer les phases standard (Programme, ESQ, APS, APD, PRO, DCE)</option>
          <option value="vide">Commencer sans phase (je les créerai moi-même)</option>
        </select>
      </Field>
      <p className="small muted">
        Les phases sont modifiables ensuite : ajoutez APS2, renommez, réordonnez… dans « Paramètres ».
      </p>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !name.trim()}>
          Créer l’opération
        </button>
      </div>
    </Modal>
  );
}
