import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import Layout from '../components/Layout';
import { PropsWithChildren } from 'react';

interface ProtectedRouteProps {
  roles?: string[];
}

export default function ProtectedRoute({ children, roles }: PropsWithChildren<ProtectedRouteProps>) {
  const { user, loading } = useAuth();
  const userRole = localStorage.getItem('rol');

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0 && (!userRole || !roles.includes(userRole))) {
    return <Navigate to="/pedidos" replace />;
  }

  return (
    <Layout>
      {children}
    </Layout>
  );
}
