import React, { useState, useEffect, useRef } from 'react';
import Portal from './Portal';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import FilterDropdown from './FilterDropdown';

// --- Interfaces ---
interface GenericItem { id: string; nombre: string; }

interface AsignarReceptorModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  tallerId: string;
  onConfirm: (trabajadorId: string, orderId: string, tallerId: string) => void;
}

const AsignarReceptorModal: React.FC<AsignarReceptorModalProps> = ({ isOpen, onClose, orderId, tallerId, onConfirm }) => {
  const [trabajadores, setTrabajadores] = useState<GenericItem[]>([]);
  const [selectedTrabajadorId, setSelectedTrabajadorId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedTrabajadorId('');
      setError(null);
      const fetchTrabajadores = async () => {
        setLoading(true);
        try {
          const { data, error: fetchError } = await supabase
            .from('trabajadores')
            .select('id, nombre_trabajador, cargos!id_cargo(nombre)')
            .eq('esta_activo', true)
            .in('cargos.nombre', ['Recepción', 'Revisión']);

          if (fetchError) throw fetchError;

          // Filtro estricto: Solo Recepción y Revisión
          const filtered = (data || []).filter(t => {
            const cargo = (t as any).cargos?.nombre;
            return cargo === 'Recepción' || cargo === 'Revisión';
          });

          // Ordenar alfabéticamente y formatear nombre
          const sorted = filtered
            .map(t => {
              const cargo = (t as any).cargos?.nombre || 'Sin Cargo';
              return {
                id: t.id,
                nombre: `${t.nombre_trabajador} - ${cargo}`
              };
            })
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

          setTrabajadores(sorted);
        } catch (err: unknown) {
          setError(`No se pudieron cargar los trabajadores: ${(err instanceof Error) ? err.message : 'Unknown error'}`);
        } finally {
          setLoading(false);
        }
      };
      fetchTrabajadores();
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!selectedTrabajadorId) {
      setError('Debes seleccionar un trabajador.');
      return;
    }
    onConfirm(selectedTrabajadorId, orderId, tallerId);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 backdrop-blur-sm p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all duration-300 animate-fade-in-scale"
        >
          <div className="relative p-5 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asignar Receptor</h2>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trabajador que recibe <span className="text-red-500">*</span></label>
              {loading ? (
                <p className="dark:text-white">Cargando...</p>
              ) : (
                <FilterDropdown
                  placeholder="-- Seleccionar Trabajador --"
                  options={trabajadores as any}
                  selectedValue={selectedTrabajadorId}
                  onSelect={setSelectedTrabajadorId}
                  valueKey="id" // Añadido para asegurar que el valor seleccionado sea el ID
                />
              )}
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          </div>

          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cancelar</button>
            <button type="button" onClick={handleConfirm} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">
              Confirmar Asignación
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default AsignarReceptorModal;
