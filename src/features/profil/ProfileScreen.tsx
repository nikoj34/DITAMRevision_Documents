import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Avatar, Field, Modal } from '../../components/ui';
import type { Role, Stakeholder } from '../../lib/types';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/types';

export default function ProfileScreen() {
  const setMe = useSession((s) => s.setMe);
  const { items, error, reload } = useList<Stakeholder>('stakeholders', {
    filter: 'active = true',
    sort: 'display_name',
  });
  const [adding, setAdding] = useState(false);

  return (
    <div className="profile-screen">
      <h1>Revue de documents d’études</h1>
      <p className="subtitle">Suivi des remarques et décisions, de l’esquisse à la réception. Qui êtes-vous ?</p>
      {error && (
        <div className="alert error">
          Impossible de joindre le serveur ({error}). Vérifiez que PocketBase est démarré.
        </div>
      )}
      <div className="profile-cards">
        {items.map((s) => (
          <button key={s.id} className="profile-card" onClick={() => setMe(s)}>
            <Avatar name={s.display_name} color={ROLE_COLORS[s.role] || '#3e4750'} size={44} />
            <b>{s.display_name}</b>
            <small>
              {s.organization}
              <br />
              {ROLE_LABELS[s.role] || s.role}
              {s.specialty ? ` — ${s.specialty}` : ''}
            </small>
          </button>
        ))}
      </div>
      <button className="profile-add" onClick={() => setAdding(true)}>
        + Ajouter un intervenant
      </button>
      {adding && (
        <StakeholderForm
          onClose={() => setAdding(false)}
          onSaved={(s) => {
            setAdding(false);
            reload();
            setMe(s);
          }}
        />
      )}
    </div>
  );
}

export function StakeholderForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (s: Stakeholder) => void;
}) {
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [role, setRole] = useState<Role>('MOA');
  const [specialty, setSpecialty] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const rec = await pb.collection('stakeholders').create<Stakeholder>({
        display_name: name.trim(),
        organization: org.trim(),
        role,
        specialty: specialty.trim(),
        email: email.trim(),
        active: true,
      });
      onSaved(rec);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nouvel intervenant" onClose={onClose}>
      {err && <div className="alert error">{err}</div>}
      <Field label="Nom et prénom" required>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Organisme">
          <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="CIRAD, Agence X, BET Y…" />
        </Field>
        <Field label="Rôle">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Spécialité">
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Fluides, structure…" />
        </Field>
        <Field label="Courriel (pour les exports)">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </Field>
      </div>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !name.trim()}>
          Créer mon profil
        </button>
      </div>
    </Modal>
  );
}
