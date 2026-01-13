import TallaCantidadBadge from './TallaCantidadBadge';
import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

// Interfaces (copying from NewOrderModal for consistency)
interface Talla { id: string; nombre: string; orden: number; }
interface Cliente { id: string; nombre: string; }
interface Prioridad { id: string; nombre: string; }

interface SelectedReference {
  id_referencia: string;
  nombre: string;
  precio_unitario: number;
  imagen_url?: string;
  quantities: { [tallaId: string]: number };
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedClienteId: string;
  selectedPrioridadId: string;
  selectedReferences: SelectedReference[];
  tallas: Talla[];
  clientes: Cliente[];
  prioridades: Prioridad[];
  totalUnidades: number;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedClienteId,
  selectedPrioridadId,
  selectedReferences,
  tallas,
  clientes,
  prioridades,
  totalUnidades,
}) => {
  if (!isOpen) return null;

  const getClienteName = (id: string) => clientes.find(c => c.id === id)?.nombre || 'Desconocido';
  const getPrioridadName = (id: string) => prioridades.find(p => p.id === id)?.nombre || 'Desconocida';
  const getTallaName = (id: string) => tallas.find(t => t.id === id)?.nombre || 'N/A';

  return (
    <div className="fixed top-0 left-0 w-screen h-screen bg-black bg-opacity-60 flex justify-center items-center z-50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
        <div className="relative p-5 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Confirmar Pedido</h2>
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-grow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Detalles Generales</h3>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700 dark:text-gray-300">
            <div>
              <p><span className="font-medium">Cliente:</span> {getClienteName(selectedClienteId)}</p>
            </div>
            <div>
              <p><span className="font-medium">Prioridad:</span> {getPrioridadName(selectedPrioridadId)}</p>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-t dark:border-gray-700 pt-4 mt-4">Referencias del Pedido</h3>
          {selectedReferences.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No hay referencias seleccionadas.</p>
          ) : (
            <div className="space-y-4">
              {selectedReferences.map(ref => {
                const refTotal = Object.values(ref.quantities).reduce((sum, qty) => sum + qty, 0);
                return (
                  <div key={ref.id_referencia} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-2">
                      {ref.imagen_url && (
                        <img src={ref.imagen_url} alt={ref.nombre} className="w-12 h-12 object-cover rounded-md border dark:border-gray-600" />
                      )}
                      <div>
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200">{ref.nombre}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{refTotal} unidades</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {Object.entries(ref.quantities)
                        .filter(([, qty]) => qty > 0)
                        .map(([tallaId, quantity]) => (
                          <TallaCantidadBadge key={tallaId} talla={getTallaName(tallaId)} cantidad={quantity} />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
          <div className="flex justify-between items-center font-semibold text-base mb-3">
            <div className="text-gray-700 dark:text-gray-200">
              <span>Total Unidades: </span>
              <span className="text-blue-600 dark:text-blue-400">{totalUnidades}</span>
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
              Editar Pedido
            </button>
            <button type="button" onClick={onConfirm} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
              Confirmar Pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;