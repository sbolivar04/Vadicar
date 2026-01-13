import React from 'react';

interface RowsPerPageSelectorProps {
  value: number;
  onChange: (value: number) => void;
  options?: number[];
}

const defaultOptions = [5, 10, 15, 20, 40, 50, 100];

const RowsPerPageSelector: React.FC<RowsPerPageSelectorProps> = ({ 
  value, 
  onChange, 
  options = defaultOptions 
}) => {
  return (
    <div className="flex items-center space-x-2 text-sm">
      <span className="text-gray-600 dark:text-gray-400">Filas por página:</span>
      <select 
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-2 py-1 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-150"
      >
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
};

export default RowsPerPageSelector;
