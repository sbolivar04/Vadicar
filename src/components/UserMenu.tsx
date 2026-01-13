import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronDownIcon,
  SunIcon,
  MoonIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../context/ThemeContext";
import GenericConfirmModal from './GenericConfirmModal';
import UserInfoModal from './UserInfoModal';

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  const menuRef = useRef<HTMLDivElement>(null);

  const [userColor, setUserColor] = useState({ bg: 'bg-gray-200', text: 'text-gray-800' });

  useEffect(() => {
    const storedColor = localStorage.getItem('userColor');
    if (storedColor) {
      setUserColor(JSON.parse(storedColor));
    } else {
      const colors = [
        { bg: 'bg-red-200', text: 'text-red-800' },
        { bg: 'bg-green-200', text: 'text-green-800' },
        { bg: 'bg-blue-200', text: 'text-blue-800' },
        { bg: 'bg-yellow-200', text: 'text-yellow-800' },
        { bg: 'bg-purple-200', text: 'text-purple-800' },
        { bg: 'bg-pink-200', text: 'text-pink-800' },
        { bg: 'bg-indigo-200', text: 'text-indigo-800' },
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      localStorage.setItem('userColor', JSON.stringify(randomColor));
      setUserColor(randomColor);
    }
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogoutClick = () => {
    setIsOpen(false);
    setIsLogoutModalOpen(true);
  };
  
  const handleProfileClick = () => {
    setIsOpen(false);
    setProfileModalOpen(true);
  };

  const handleConfirmLogout = () => {
    localStorage.removeItem('userColor');
    logout();
    setIsLogoutModalOpen(false);
  };

  const getUserDisplayName = () => {
    if (user && user.user_metadata.nombre_trabajador) {
      const parts = user.user_metadata.nombre_trabajador.split(" ");
      if (parts.length >= 2) {
        return `${parts[0]} ${parts[1]}`;
      }
      return user.user_metadata.nombre_trabajador;
    }
    return "Usuario";
  };

  const getUserInitials = () => {
    if (user && user.user_metadata.nombre_trabajador) {
      const parts = user.user_metadata.nombre_trabajador.split(" ");
      if (parts.length >= 1) {
        return `${parts[0][0]}`.toUpperCase();
      }
      return user.user_metadata.nombre_trabajador[0].toUpperCase();
    }
    return "U";
  };

  const getUserRole = () => {
    if (user && user.user_metadata.rol) {
      return user.user_metadata.rol;
    }
    return "Rol no definido";
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={toggleMenu}
          className="flex items-center space-x-3 text-gray-800 dark:text-white focus:outline-none hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-md"
        >
          <div className={`flex items-center justify-center h-10 w-10 rounded-full ${userColor.bg} ${userColor.text} font-bold`}>
            {getUserInitials()}
          </div>
          <div className="text-left">
            <div className="font-bold text-sm text-gray-900 dark:text-white">{getUserDisplayName()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{getUserRole()}</div>
          </div>
          <ChevronDownIcon className="h-5 w-5 text-gray-500" />
        </button>

        {isOpen && (
          <div ref={menuRef} className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700">
            <button
              onClick={handleProfileClick}
              className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center">
                <UserCircleIcon className="h-5 w-5 mr-2" />
                Ver perfil
              </div>
            </button>
            <button
              onClick={toggleTheme}
              className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center">
                {isDarkMode ? (
                  <SunIcon className="h-5 w-5 mr-2" />
                ) : (
                  <MoonIcon className="h-5 w-5 mr-2" />
                )}
                Cambiar a {isDarkMode ? "claro" : "oscuro"}
              </div>
            </button>
            <button
              onClick={handleLogoutClick}
              className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center">
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                Cerrar sesión
              </div>
            </button>
          </div>
        )}
      </div>

      <GenericConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Confirmar Cierre de Sesión"
        message="¿Estás seguro de que deseas cerrar sesión?"
      />
      
      <UserInfoModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setProfileModalOpen(false)} 
        user={user} 
        userColor={userColor}
      />
    </>
  );
};

export default UserMenu;
