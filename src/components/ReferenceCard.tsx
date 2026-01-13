
import TallaCantidadBadge from './TallaCantidadBadge';
import React from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface TallaDisponible {
  id: string;
  nombre: string;
  cantidad: number;
}

interface ReferenciaAgrupada {
  id_referencia: string;
  nombre_referencia: string;
  imagen_url: string | null;
  tallas_disponibles: Map<string, TallaDisponible>;
}

interface ReferenceCardProps {
  reference: ReferenciaAgrupada;
  isSelected: boolean;
  onClick: () => void;
  isCompleted: boolean;
  referenceColor: string; // Color para el punto
}

const ReferenceCard: React.FC<ReferenceCardProps> = ({ reference, isSelected, onClick, isCompleted, referenceColor }) => {
  const tallasArray = Array.from(reference.tallas_disponibles.values());

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center p-3 rounded-xl border transition-all duration-200 ease-in-out
        focus:outline-none group relative
        ${isSelected
          ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-500 shadow-md'
          : 'bg-gray-100 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600'
        }
        ${isCompleted ? 'bg-green-50 dark:bg-green-900/40 border-green-500 shadow-md' : ''}
      `}
    >
      {/* Punto de color */}
      <div
        className="absolute top-2 right-2 w-3 h-3 rounded-full"
        style={{ backgroundColor: referenceColor }}
        title="Color de la Referencia"
      ></div>

      {/* Columna de la Imagen */}
      <div className="flex-shrink-0 mr-4 relative">
        <img
          src={reference.imagen_url || 'https://placehold.co/400x400/cccccc/666666?text=Sin+Imagen'}
          alt={`Referencia ${reference.nombre_referencia}`}
          className="w-20 h-20 object-cover rounded-lg shadow-sm"
        />
        {isCompleted && (
          <CheckCircleIcon className="absolute -top-2 -right-2 h-6 w-6 text-green-500 bg-white rounded-full shadow-md" />
        )}
      </div>

      {/* Columna de la Información */}
      <div className="flex-1 text-left">
        <h3 className="font-bold text-base text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight">
          {reference.nombre_referencia}
        </h3>

        {/* Chips de Tallas */}
        {tallasArray.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {tallasArray
              .filter(talla => talla.cantidad > 0)
              .map(talla => (
                <TallaCantidadBadge 
                  key={`talla-${talla.id}-${reference.id_referencia}`}
                  talla={talla.nombre}
                  cantidad={talla.cantidad}
                  //className="px-2 py-1 bg-gray-200 dark:bg-red-900/30 text-gray-800 dark:text-gray-300 rounded-full text-xs font-medium"
                />
              ))}
          </div>
        )}
        {isCompleted && tallasArray.every(t => t.cantidad === 0) && (
          <p className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium">Todas las tallas asignadas.</p>
        )}
      </div>
    </button>
  );
};

export default ReferenceCard;
