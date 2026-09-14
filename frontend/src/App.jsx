import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import CaseDetailsPage from './pages/CaseDetailsPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import RoleSelectionPage from './pages/RoleSelectionPage';
import SignupPage from './pages/SignupPage';
import PatientDashboard from './pages/PatientDashboard';
import CasesPage from './pages/CasesPage';
import EmergenciesPage from './pages/EmergenciesPage';
import ReferralsPage from './pages/ReferralsPage';
import PatientsPage from './pages/PatientsPage';
import HealthCentersPage from './pages/HealthCentersPage';
import HealthCenterProfilePage from './pages/HealthCenterProfilePage';
import PatientProfile from './pages/PatientProfile';
import PatientCasesPage from './pages/PatientCasesPage';
import PatientReferralsPage from './pages/PatientReferralsPage';
import PatientFeaturePage from './pages/PatientFeaturePage';
import PatientCaseRegistrationPage from './pages/PatientCaseRegistrationPage';
import PatientCaseDetailsPage from './pages/PatientCaseDetailsPage';
import RegisterPatientPage from './pages/RegisterPatientPage';
import DocumentsPage from './pages/DocumentsPage';
import WorkerProfilePage from './pages/WorkerProfilePage';
import PatientDetailsPage from './pages/PatientDetailsPage';
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
        <Route path="/" element={<LandingPage />} />
        <Route path="/role-selection" element={<RoleSelectionPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        
        {/* Public Health Centre Profile and Directory inside AppLayout for proper UI */}
        <Route element={<AppLayout />}>
          <Route path="/health-centres" element={<HealthCentersPage />} />
          <Route path="/health-centres/:id" element={<HealthCenterProfilePage />} />
        </Route>
        
        {/* Protected Routes for Health Workers */}
        <Route element={<ProtectedRoute allowedRoles={['HEALTH_WORKER']} />}>
          <Route element={<AppLayout />}>
            <Route path="/worker" element={<HomePage />} />
            <Route path="/worker/case-details/:kind/:caseId" element={<CaseDetailsPage />} />
            <Route path="/worker/cases" element={<CasesPage />} />
            <Route path="/worker/cases/:caseId" element={<CaseDetailsPage />} />
            <Route path="/worker/emergencies" element={<EmergenciesPage />} />
            <Route path="/worker/emergencies/:caseId" element={<CaseDetailsPage />} />
            <Route path="/worker/referrals" element={<ReferralsPage />} />
            <Route path="/worker/referrals/:id" element={<CaseDetailsPage />} />
            <Route path="/worker/patients" element={<PatientsPage />} />
            <Route path="/worker/patients/register" element={<RegisterPatientPage />} />
            <Route path="/worker/patients/:id" element={<PatientDetailsPage />} />
            <Route path="/worker/documents" element={<DocumentsPage />} />
            <Route path="/worker/health-centres" element={<HealthCentersPage />} />
            <Route path="/worker/profile" element={<WorkerProfilePage />} />
            {/* Catch-all for worker routes missing */}
            <Route path="/worker/*" element={<Navigate to="/worker" replace />} />
          </Route>
        </Route>

        {/* Protected Routes for Patients */}
        <Route element={<ProtectedRoute allowedRoles={['PATIENT']} />}>
          <Route element={<AppLayout />}>
            <Route path="/patient" element={<PatientDashboard />} />
            <Route path="/patient/profile" element={<PatientProfile />} />
            <Route path="/patient/case/register" element={<PatientCaseRegistrationPage />} />
            <Route path="/patient/register-complaint" element={<PatientCaseRegistrationPage />} />
            <Route path="/patient/cases" element={<PatientCasesPage />} />
            <Route path="/patient/cases/:caseId" element={<PatientCaseDetailsPage />} />
            <Route path="/patient/referrals" element={<PatientReferralsPage />} />
            <Route path="/patient/medical-records" element={<PatientFeaturePage title="Medical Records" />} />
            <Route path="/patient/prescriptions" element={<PatientFeaturePage title="Prescriptions" />} />
            <Route path="/patient/lab-reports" element={<PatientFeaturePage title="Lab Reports" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AuthProvider>
  );
}
