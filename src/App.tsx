import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PedidosPage from "./pages/PedidosPage";
import TalleresPage from "./pages/TalleresPage";
import CatalogoPage from "./pages/CatalogoPage";
import AdministracionPage from "./pages/AdministracionPage";

function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Redirect root to /pedidos as a safe default for all roles */}
        <Route path="/" element={<Navigate to="/pedidos" replace />} />

        {/* Rutas Protegidas por Rol */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={['Desarrollador', 'Administrador']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pedidos"
          element={
            <ProtectedRoute>
              <PedidosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/talleres"
          element={
            <ProtectedRoute roles={['Desarrollador', 'Administrador']}>
              <TalleresPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogo"
          element={
            <ProtectedRoute roles={['Desarrollador', 'Administrador']}>
              <CatalogoPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administracion"
          element={
            <ProtectedRoute roles={['Desarrollador', 'Administrador']}>
              <AdministracionPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback for any other route */}
        <Route path="*" element={<Navigate to="/pedidos" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;