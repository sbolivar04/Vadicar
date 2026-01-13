import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { User } from '@supabase/supabase-js';

interface UserInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  userColor: { bg: string; text: string; };
}

const UserInfoModal: React.FC<UserInfoModalProps> = ({ isOpen, onClose, user, userColor }) => {
  if (!isOpen || !user) return null;

  const getInitials = (name: string) => {
    if (!name) return '';
    return name.charAt(0).toUpperCase();
  };

  const metadata = user.user_metadata;

  // Maneja el clic en el overlay para cerrar el modal
  const handleOverlayClick = () => {
    onClose();
  };

  // Evita que el clic en el contenido del modal lo cierre
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 transition-opacity duration-300"
    >
      <div
        onClick={handleContentClick}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale"
      >
        <div className="relative p-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="h-6 w-6" />
          </button>

          <div className="flex flex-col items-center">
            <div className={`w-24 h-24 rounded-full ${userColor.bg} ${userColor.text} flex items-center justify-center text-4xl font-bold mb-4`}>
              {metadata.avatar_url ? (
                <img src={metadata.avatar_url} alt="Avatar" className="w-full h-full rounded-full" />
              ) : (
                getInitials(metadata.nombre_trabajador)
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{metadata.nombre_trabajador}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{metadata.rol}</p>
          </div>

          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Correo Electrónico</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100 text-right">{user.email}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

// Añadimos una pequeña animación en CSS para que el modal aparezca suavemente
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
@keyframes fadeInScale {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.animate-fade-in-scale {
  animation: fadeInScale 0.2s ease-out forwards;
}
`;
document.head.appendChild(styleSheet);

export default UserInfoModal;