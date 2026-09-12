import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import CaseDetailsPage from './pages/CaseDetailsPage';
import HomePage from './pages/HomePage';

function PlaceholderPage({ title }) {
  return (
    <section className="placeholder-page" aria-labelledby="placeholder-title">
      <p className="eyebrow">Coming next</p>
      <h1 id="placeholder-title">{title}</h1>
      <p className="intro">This route is reserved for the next connected workflow.</p>
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="case-details/:kind/:caseId" element={<CaseDetailsPage />} />
        <Route path="emergency-alerts" element={<PlaceholderPage title="Emergency alerts" />} />
        <Route path="cases" element={<PlaceholderPage title="Cases" />} />
        <Route path="health-centres" element={<PlaceholderPage title="Health centres" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
