import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="data-state">Loading application...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="data-state data-state-error">
        Access denied. You do not have permission to view this page.
      </div>
    );
  }

  return <Outlet />;
}
