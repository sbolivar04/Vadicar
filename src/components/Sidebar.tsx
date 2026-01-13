import { NavLink, useLocation } from "react-router-dom";
import {
  ClipboardDocumentListIcon,
  ChartBarIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  BookOpenIcon,
  Cog6ToothIcon
} from "@heroicons/react/24/outline";
import React, { useState, useEffect } from "react";

interface SidebarProps {
  isExpanded: boolean;
  toggleExpand: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isExpanded, toggleExpand }) => {
  const [pageTitle, setPageTitle] = useState('');
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = 'Dashboard'; // Título por defecto
    if (path.includes('/dashboard')) {
      title = 'Dashboard';
    } else if (path.includes('/pedidos')) {
      title = 'Pedidos';
    } else if (path.includes('/talleres')) {
      title = 'Talleres';
    } else if (path.includes('/catalogo')) {
      title = 'Catálogo';
    } else if (path.includes('/administracion')) {
      title = 'Administración';
    }
    setPageTitle(title);
  }, [location.pathname]);

  return (
    <aside
      className={`bg-gray-800 text-white flex flex-col rounded-lg my-1 transition-all duration-300 ${isExpanded ? "w-[210px]" : "w-20"
        }`}
    >
      <div className="px-3 py-4 text-xl font-bold border-b border-gray-700 flex items-center justify-between overflow-hidden">
        {isExpanded && <span className="truncate pr-2" title={pageTitle}>{pageTitle}</span>}
        <button onClick={toggleExpand} className="p-1 rounded-full hover:bg-gray-700">
          {isExpanded ? (
            <ChevronDoubleLeftIcon className="h-6 w-6" />
          ) : (
            <ChevronDoubleRightIcon className="h-6 w-6" />
          )}
        </button>
      </div>
      <nav className="flex-grow p-4">
        <ul>
          <li className="mb-2">
            <NavLink
              to="/pedidos"
              className={({ isActive }) =>
                `flex items-center p-2 rounded-md ${isActive ? "bg-gray-700" : "hover:bg-gray-700"
                }`
              }
            >
              <ClipboardDocumentListIcon className="h-6 w-6" />
              {isExpanded && <span className="ml-3">Pedidos</span>}
            </NavLink>
          </li>
          {['Desarrollador', 'Administrador'].includes(localStorage.getItem('rol') || '') && (
            <>
              <li className="mb-2">
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `flex items-center p-2 rounded-md ${isActive ? "bg-gray-700" : "hover:bg-gray-700"
                    }`
                  }
                >
                  <ChartBarIcon className="h-6 w-6" />
                  {isExpanded && <span className="ml-3">Dashboard</span>}
                </NavLink>
              </li>

              <li className="mb-2">
                <NavLink
                  to="/catalogo"
                  className={({ isActive }) =>
                    `flex items-center p-2 rounded-md ${isActive ? "bg-gray-700" : "hover:bg-gray-700"
                    }`
                  }
                >
                  <BookOpenIcon className="h-6 w-6" />
                  {isExpanded && <span className="ml-3">Catálogo</span>}
                </NavLink>
              </li>

              <li className="mb-2">
                <NavLink
                  to="/administracion"
                  className={({ isActive }) =>
                    `flex items-center p-2 rounded-md ${isActive ? "bg-gray-700" : "hover:bg-gray-700"
                    }`
                  }
                >
                  <Cog6ToothIcon className="h-6 w-6" />
                  {isExpanded && <span className="ml-3">Administración</span>}
                </NavLink>
              </li>
            </>
          )}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;