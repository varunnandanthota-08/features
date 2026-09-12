import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import CaseDetailsPage from './pages/CaseDetailsPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './components/AuthContext';

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
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* Protected Routes for Health Workers */}
        <Route element={<ProtectedRoute allowedRoles={['HEALTH_WORKER']} />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="case-details/:kind/:caseId" element={<CaseDetailsPage />} />
            <Route path="emergency-alerts" element={<PlaceholderPage title="Emergency alerts" />} />
            <Route path="cases" element={<PlaceholderPage title="Cases" />} />
            <Route path="health-centres" element={<PlaceholderPage title="Health centres" />} />
          </Route>
        </Route>

        {/* Protected Routes for Patients */}
        <Route element={<ProtectedRoute allowedRoles={['PATIENT']} />}>
          <Route element={<AppLayout />}>
            <Route path="patient-portal" element={<PlaceholderPage title="Patient Portal" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AuthProvider>
  );
}
