import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import UserMenu from './UserMenu';

const getHeaderContent = (pathname: string) => {
  switch (pathname) {
    case '/dashboard':
      return {
        title: 'Dashboard Operativo - Confección',
        subtitle: 'Seguimiento en tiempo real de pedidos y productividad',
      };
    case '/pedidos':
      return {
        title: 'Gestión de Pedidos',
        subtitle: 'Administra, filtra y visualiza todos los pedidos',
      };
    case '/administracion':
      return {
        title: 'Administración',
        subtitle: 'Gestiona el personal, accesos y talleres del sistema.',
      };
    case '/talleres':
      return {
        title: 'Gestión de Talleres',
        subtitle: 'Administra la información y estado de los talleres',
      };
    case '/catalogo':
      return {
        title: 'Administración de Catálogo',
        subtitle: 'Gestiona, organiza y consulta todas tus referencias de manera rápida y segura.',
      };
    default:
      return {
        title: 'Sistema de Gestión',
        subtitle: 'Confecciones y Producción',
      };
  }
};


const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const location = useLocation();
  const { title, subtitle } = getHeaderContent(location.pathname);


  const toggleSidebar = () => {
    setIsSidebarExpanded(!isSidebarExpanded);
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar isExpanded={isSidebarExpanded} toggleExpand={toggleSidebar} />
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden p-1">
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 shadow-md overflow-hidden">
          <header className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{title}</h1>
              <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
            <UserMenu />
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;