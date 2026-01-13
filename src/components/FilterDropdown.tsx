import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';

export interface GenericFilterItem {
  id: string;
  nombre: string;
  [key: string]: string | number; // Allow other properties
}

interface FilterDropdownProps {
  placeholder: string;
  options: GenericFilterItem[];
  selectedValue: string;
  onSelect: (value: string) => void;
  label?: string;
  valueKey?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
  className?: string; // Allow custom classes
  enableSearch?: boolean;
  hasError?: boolean;
  onEdit?: (item: GenericFilterItem) => void;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  placeholder,
  options,
  selectedValue,
  onSelect,
  label,
  valueKey = 'nombre',
  showAllOption = false,
  allOptionLabel = 'Todos',
  className = '',
  hasError = false,
  enableSearch = false,
  onEdit,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) setSearchTerm('');
  }, [isOpen]);

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
  };

  const selectedOption = options.find(o => o[valueKey] === selectedValue);
  const selectedLabel = selectedOption ? selectedOption.nombre : placeholder;

  const filteredOptions = options.filter(option =>
    option.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.id === 'nuevo' // Always show the 'add new' option if present
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 transition-colors duration-150 ${hasError
          ? 'border-red-500 focus:ring-red-500'
          : (className || 'border-gray-300 dark:border-gray-600 focus:ring-blue-500')
          }`}
      >
        <span className="truncate">
          {label && <span className="text-gray-500 dark:text-gray-400">{label}: </span>}
          <span className={`font-medium ${selectedOption ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
            {selectedLabel}
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden animate-fade-in-fast flex flex-col max-h-60">

          {enableSearch && (
            <div className="p-2 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                placeholder="Buscar..."
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <ul className="overflow-y-auto flex-1">
            {showAllOption && (
              <li>
                <button type="button" onClick={() => handleSelect('todas')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold">
                  {allOptionLabel}
                </button>
              </li>
            )}
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => {
                const esNuevo = option.id === 'nuevo';
                return (
                  <li key={option.id} className={esNuevo ? 'border-t border-gray-100 dark:border-gray-700 mt-1' : ''}>
                    <div className="flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700">
                      <button
                        type="button"
                        onClick={() => handleSelect(String(option[valueKey]))}
                        className={`flex-grow text-left px-4 py-1.5 text-sm transition-colors
                          ${esNuevo
                            ? 'text-blue-600 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20'
                            : 'text-gray-700 dark:text-gray-300'
                          }`}
                      >
                        {option.nombre}
                      </button>

                      {!esNuevo && onEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(option);
                            // setIsOpen(false); // Optional: close dropdown on edit click? Maybe better to keep open or handle in parent
                          }}
                          className="p-1.5 mr-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="Editar nombre"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="px-4 py-3 text-sm text-gray-400 text-center italic">
                No se encontraron resultados
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FilterDropdown;
