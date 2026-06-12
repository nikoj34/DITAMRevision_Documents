import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useList } from '../../lib/hooks';
import { useSession } from '../../state/session';
import { Avatar } from '../../components/ui';
import type { Phase, Project } from '../../lib/types';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/types';

export interface ProjectContext {
  project: Project;
  phases: Phase[];
}

export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const me = useSession((s) => s.me)!;
  const setMe = useSession((s) => s.setMe);
  const phaseFilter = useSession((s) => s.phaseFilter);
  const setPhaseFilter = useSession((s) => s.setPhaseFilter);
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);

  const { items: phases } = useList<Phase>(
    'phases',
    { filter: `project = "${projectId}"`, sort: 'sort_order' },
    [projectId]
  );

  useEffect(() => {
    if (!projectId) return;
    pb.collection('projects')
      .getOne<Project>(projectId)
      .then(setProject)
      .catch(() => navigate('/'));
  }, [projectId, navigate]);

  // Si le filtre de phase pointe une phase d'un autre projet, on le remet à zéro.
  useEffect(() => {
    if (phaseFilter && phases.length && !phases.some((p) => p.id === phaseFilter)) {
      setPhaseFilter('');
    }
  }, [phaseFilter, phases, setPhaseFilter]);

  if (!project) return null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Revue de documents
          <small>{project.name}</small>
        </div>
        <div className="sidebar-section">Phase</div>
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
          <option value="">Toutes les phases</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.status === 'en_cours' ? ' (en cours)' : p.status === 'close' ? ' (close)' : ''}
            </option>
          ))}
        </select>
        <nav>
          <NavLink to={`/projet/${project.id}`} end>
            📊 Tableau de bord
          </NavLink>
          <NavLink to={`/projet/${project.id}/documents`}>📄 Documents</NavLink>
          <NavLink to={`/projet/${project.id}/remarques`}>💬 Remarques</NavLink>
          <NavLink to={`/projet/${project.id}/decisions`}>⚖️ Décisions</NavLink>
          <NavLink to={`/projet/${project.id}/sujets`}>🧵 Suivi par sujet</NavLink>
          <NavLink to={`/projet/${project.id}/import`}>📥 Import Excel</NavLink>
          <NavLink to={`/projet/${project.id}/parametres`}>⚙️ Paramètres</NavLink>
        </nav>
        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <NavLink to="/" style={{ color: '#c5d6e6' }}>
            ← Toutes les opérations
          </NavLink>
        </div>
        <div className="sidebar-footer">
          <Avatar name={me.display_name} color={ROLE_COLORS[me.role]} size={32} />
          <div className="who">
            <b>{me.display_name}</b>
            <span>{ROLE_LABELS[me.role]}</span>
          </div>
          <button onClick={() => setMe(null)} title="Changer de profil">
            changer
          </button>
        </div>
      </aside>
      <Outlet context={{ project, phases } satisfies ProjectContext} />
    </div>
  );
}
