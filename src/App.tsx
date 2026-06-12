import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './state/session';
import ProfileScreen from './features/profil/ProfileScreen';
import ProjectsPage from './features/projets/ProjectsPage';
import ProjectLayout from './features/layout/ProjectLayout';
import DashboardPage from './features/dashboard/DashboardPage';
import DocumentsPage from './features/documents/DocumentsPage';
import ViewerPage from './features/viewer/ViewerPage';
import RemarksPage from './features/remarques/RemarksPage';
import DecisionsPage from './features/decisions/DecisionsPage';
import SubjectsPage from './features/sujets/SubjectsPage';
import RequirementsPage from './features/exigences/RequirementsPage';
import ImportPage from './features/import/ImportPage';
import ParamsPage from './features/params/ParamsPage';

export default function App() {
  const me = useSession((s) => s.me);

  if (!me) return <ProfileScreen />;

  return (
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/projet/:projectId" element={<ProjectLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/:docId" element={<ViewerPage />} />
        <Route path="remarques" element={<RemarksPage />} />
        <Route path="decisions" element={<DecisionsPage />} />
        <Route path="sujets" element={<SubjectsPage />} />
        <Route path="exigences" element={<RequirementsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="parametres" element={<ParamsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
