import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface SearchableOption {
  id: string;
  nombre: string;
  [key: string]: string | number;
}

interface SearchableDropdownProps {
  placeholder: string;
  options: SearchableOption[];
  selectedValue?: string | null; // <-- Añadido
  onSelect: (value: string) => void;
  className?: string;
  onOpen?: () => void;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  placeholder,
  options,
  selectedValue, // <-- Añadido
  onSelect,
  className = '',
  onOpen,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parentRef = React.useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(option =>
    option.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredOptions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: React.useCallback(() => 36, []),
    overscan: 5,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
    setSearchTerm('');
  };

  // Lógica para mostrar el valor seleccionado
  const selectedOption = options.find(option => option.id === selectedValue);
  const displayValue = selectedOption ? selectedOption.nombre : placeholder;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div
        onClick={() => {
          if (!isOpen && onOpen) {
            onOpen();
          }
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer"
      >
        <span className={`truncate ${selectedOption ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
          {displayValue}
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg animate-fade-in-fast">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div ref={parentRef} className="max-h-60 overflow-y-auto">
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const option = filteredOptions[virtualRow.index];
                return (
                  <div
                    key={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(option.id)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {option.nombre}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;


