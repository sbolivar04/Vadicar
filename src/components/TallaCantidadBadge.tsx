import React from 'react';

interface TallaCantidadBadgeProps {
  talla: string;
  cantidad: number;
  devueltas?: number;
  className?: string;
}

const TallaCantidadBadge: React.FC<TallaCantidadBadgeProps> = ({ talla, cantidad, devueltas = 0, className }) => {
  // Clases originales para mantener la estética que te gusta
  const defaultClasses = "px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium";

  return (
    <span className={className || defaultClasses}>
      {talla}: {cantidad}
      {devueltas > 0 && (
        <span className="ml-1 text-[10px] font-bold text-red-600 dark:text-red-400">
          (+{devueltas} dev.)
        </span>
      )}
    </span>
  );
};

export default TallaCantidadBadge;
