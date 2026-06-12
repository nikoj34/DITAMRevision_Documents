import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { Badge, Field, Modal } from '../../components/ui';
import type { Phase, PhaseType, Tag } from '../../lib/types';
import { PHASE_TYPES, PHASE_TYPE_LABELS } from '../../lib/types';
import type { ProjectContext } from '../layout/ProjectLayout';

const PHASE_STATUS_LABELS = { a_venir: 'À venir', en_cours: 'En cours', close: 'Close' } as const;

export default function ParamsPage() {
  const { project, phases } = useOutletContext<ProjectContext>();
  const [addingPhase, setAddingPhase] = useState(false);
  const { items: tags, reload: reloadTags } = useList<Tag>(
    'tags',
    { filter: `project = "${project.id}"`, sort: 'label' },
    [project.id]
  );
  const [newLot, setNewLot] = useState('');
  const [newTheme, setNewTheme] = useState('');

  async function setPhaseStatus(p: Phase, status: Phase['status']) {
    await pb.collection('phases').update(p.id, { status });
  }

  async function addTag(kind: 'lot' | 'theme', label: string) {
    if (!label.trim()) return;
    await pb.collection('tags').create({ project: project.id, label: label.trim(), kind });
    reloadTags();
  }

  return (
    <div className="main" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h2>Paramètres de l’opération</h2>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Phases</h3>
          <div className="spacer" />
          <button className="btn small" onClick={() => setAddingPhase(true)}>
            + Ajouter une phase (APS2, jalon libre…)
          </button>
        </div>
        <p className="small muted">
          Une nouvelle version d’une phase (ex. APS2) est une phase à part entière : les documents et remarques y
          restent rattachés, et le registre des décisions est transverse.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Type</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {phases.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.label}</b>
                </td>
                <td className="small">{PHASE_TYPE_LABELS[p.phase_type] || p.phase_type}</td>
                <td>
                  <Badge color={p.status === 'en_cours' ? '#2f8a4c' : p.status === 'close' ? '#6b7681' : '#2e7cb5'}>
                    {PHASE_STATUS_LABELS[p.status] || p.status}
                  </Badge>
                </td>
                <td>
                  <select value={p.status} onChange={(e) => setPhaseStatus(p, e.target.value as Phase['status'])}>
                    {(Object.keys(PHASE_STATUS_LABELS) as Phase['status'][]).map((s) => (
                      <option key={s} value={s}>
                        {PHASE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Lots / disciplines</h3>
        <p className="small muted">Servent à classer remarques et documents (Lot 08 – CVC, Structure, Électricité…).</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {tags
            .filter((t) => t.kind === 'lot')
            .map((t) => (
              <Badge key={t.id} color="#1c4d77">
                {t.label}
              </Badge>
            ))}
        </div>
        <div className="form-row">
          <input value={newLot} onChange={(e) => setNewLot(e.target.value)} placeholder="Lot 08 – CVC" />
          <button
            className="btn small"
            onClick={() => {
              addTag('lot', newLot);
              setNewLot('');
            }}
          >
            Ajouter
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Thèmes transversaux</h3>
        <p className="small muted">Accessibilité, surfaces, sûreté, exploitation-maintenance, conformité programme…</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {tags
            .filter((t) => t.kind === 'theme')
            .map((t) => (
              <Badge key={t.id} color="#0e7d7d">
                {t.label}
              </Badge>
            ))}
        </div>
        <div className="form-row">
          <input value={newTheme} onChange={(e) => setNewTheme(e.target.value)} placeholder="Accessibilité" />
          <button
            className="btn small"
            onClick={() => {
              addTag('theme', newTheme);
              setNewTheme('');
            }}
          >
            Ajouter
          </button>
        </div>
      </div>

      {addingPhase && (
        <PhaseForm
          projectId={project.id}
          phases={phases}
          onClose={() => setAddingPhase(false)}
          onSaved={() => setAddingPhase(false)}
        />
      )}
    </div>
  );
}

function PhaseForm({
  projectId,
  phases,
  onClose,
  onSaved,
}: {
  projectId: string;
  phases: Phase[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<PhaseType>('APS');
  const [label, setLabel] = useState('');
  const [afterId, setAfterId] = useState(phases[phases.length - 1]?.id || '');
  const [busy, setBusy] = useState(false);

  const sameType = phases.filter((p) => p.phase_type === type);
  const suggestedIteration = sameType.length + 1;
  const suggestedLabel =
    sameType.length > 0 ? `${type}${suggestedIteration}` : PHASE_TYPE_LABELS[type].match(/\(([^)]+)\)/)?.[1] || type;

  async function save() {
    setBusy(true);
    try {
      const after = phases.find((p) => p.id === afterId);
      const afterOrder = after ? after.sort_order : phases.length - 1;
      // Décale les phases suivantes pour insérer la nouvelle au bon endroit.
      for (const p of phases.filter((p) => p.sort_order > afterOrder)) {
        await pb.collection('phases').update(p.id, { sort_order: p.sort_order + 1 });
      }
      await pb.collection('phases').create({
        project: projectId,
        phase_type: type,
        iteration: suggestedIteration,
        label: label.trim() || suggestedLabel,
        status: 'a_venir',
        sort_order: afterOrder + 1,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Ajouter une phase" onClose={onClose}>
      <div className="form-row">
        <Field label="Type de phase">
          <select value={type} onChange={(e) => setType(e.target.value as PhaseType)}>
            {PHASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {PHASE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Libellé">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={suggestedLabel} />
        </Field>
      </div>
      {sameType.length > 0 && (
        <p className="small muted">
          Il existe déjà {sameType.length} phase(s) de type {type} ({sameType.map((p) => p.label).join(', ')}) — cette
          nouvelle itération sera « {label.trim() || suggestedLabel} ».
        </p>
      )}
      <Field label="Insérer après">
        <select value={afterId} onChange={(e) => setAfterId(e.target.value)}>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          Ajouter
        </button>
      </div>
    </Modal>
  );
}
