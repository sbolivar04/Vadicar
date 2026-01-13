import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Portal from './Portal';

// --- Interfaces ---
interface WorkOrder {
  id: string;
  cantidad_asignada: number;
  id_referencia: { id: string; nombre: string; imagen_url: string; }; // Corregido: Objeto, no array
  id_talla: { id: string; nombre: string; }; // Corregido: Objeto, no array
  estado?: string; // Opcional, si lo necesitas en el modal
}

interface RecepcionState {
  completa: boolean;
  cantidadRecibida: number | string;
}

interface RecepcionTallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrders: WorkOrder[];
  onRecepcionComplete: () => void;
  // Necesitamos el ID del pedido para pasarlo a la función RPC
  pedidoId: string | null;
  // El trabajador que está logueado o que fue asignado a la recepción
  trabajadorId: string | null;
}

const RecepcionTallerModal: React.FC<RecepcionTallerModalProps> = ({ isOpen, onClose, workOrders, onRecepcionComplete, pedidoId, trabajadorId }) => {
  const [recepciones, setRecepciones] = useState<Record<string, RecepcionState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initialState: Record<string, RecepcionState> = {};
      workOrders.forEach(wo => {
        initialState[wo.id] = {
          completa: true,
          cantidadRecibida: wo.cantidad_asignada,
        };
      });
      setRecepciones(initialState);
      setError(null);
    }
  }, [isOpen, workOrders]);

  const handleEstadoChange = (woId: string, esCompleta: boolean) => {
    const wo = workOrders.find(w => w.id === woId);
    if (!wo) return;
    setRecepciones(prev => ({
      ...prev,
      [woId]: { ...prev[woId], completa: esCompleta, cantidadRecibida: esCompleta ? wo.cantidad_asignada : '' },
    }));
  };

  const handleCantidadChange = (woId: string, cantidad: string) => {
    const wo = workOrders.find(w => w.id === woId);
    if (!wo) return;
    const valorNumerico = parseInt(cantidad, 10);
    if (cantidad === '' || (!isNaN(valorNumerico) && valorNumerico >= 0 && valorNumerico <= wo.cantidad_asignada)) {
      setRecepciones(prev => ({ ...prev, [woId]: { ...prev[woId], cantidadRecibida: cantidad } }));
    }
  };

  const handleSubmit = async () => {
    if (!pedidoId || !trabajadorId) {
      setError("No se ha podido identificar el pedido o el trabajador. Por favor, recargue la página.");
      return;
    }

    // Validar que todas las cantidades 'No completas' tengan un número válido
    const esValido = Object.entries(recepciones).every(([, recepcion]) => {
      if (!recepcion.completa) {
        const cantidad = Number(recepcion.cantidadRecibida);
        return !isNaN(cantidad) && cantidad >= 0;
      }
      return true;
    });

    if (!esValido) {
      setError("Por favor, rellene todas las cantidades para las recepciones marcadas como 'No'.");
      return;
    }

    setIsLoading(true);
    setError(null);

    // Preparar el payload para la función RPC
    const recepcionesPayload = Object.entries(recepciones).map(([woId, recepcion]) => ({
      id_orden_trabajo: woId,
      completa: recepcion.completa,
      cantidadRecibida: Number(recepcion.cantidadRecibida),
    }));

    try {
      const { error: rpcError } = await supabase.rpc('procesar_recepcion_taller', {
        p_id_pedido: pedidoId,
        p_id_usuario_receptor: trabajadorId, // Vuelve al nombre de parámetro original
        p_recepciones: recepcionesPayload,
      });

      if (rpcError) {
        console.error('Error from RPC:', rpcError); // Debugging line
        throw rpcError;
      }

      onRecepcionComplete();
      onClose();
    } catch (err: unknown) {
      console.error('Caught error object:', err); // Debugging line
      setError(`Error al procesar la recepción: ${(err instanceof Error) ? err.message : 'Error desconocido'}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex justify-center items-start pt-10 pb-10 overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Recepción de Mercancía de Taller</h2>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
            {workOrders.map(wo => {
              const recepcion = recepciones[wo.id];
              if (!recepcion) return null;

              return (
                <div key={wo.id} className="p-4 border rounded-md dark:border-gray-600 space-y-4">
                  <div className="flex items-start gap-4">
                    {/* Imagen de la Referencia */}
                    <div className="flex-shrink-0">
                      <img
                        src={wo.id_referencia?.imagen_url || 'https://placehold.co/400x400/cccccc/666666?text=Sin+Imagen'}
                        alt={wo.id_referencia?.nombre}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
                      />
                    </div>

                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 leading-tight">
                        {wo.id_referencia?.nombre}
                      </h3>
                      <div className="mt-1 flex flex-col gap-0.5">
                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          Talla: <span className="font-bold">{wo.id_talla?.nombre}</span>
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Cantidad Esperada: <span className="font-semibold text-gray-700 dark:text-gray-200">{wo.cantidad_asignada}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">¿Se recibió la cantidad completa?</label>
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => handleEstadoChange(wo.id, true)}
                        className={`px-4 py-2 text-sm rounded-md transition-colors ${recepcion.completa ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                      >
                        Sí
                      </button>
                      <button
                        onClick={() => handleEstadoChange(wo.id, false)}
                        className={`px-4 py-2 text-sm rounded-md transition-colors ${!recepcion.completa ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {!recepcion.completa && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cantidad Recibida:</label>
                      <input
                        type="number"
                        value={recepcion.cantidadRecibida}
                        onChange={(e) => handleCantidadChange(wo.id, e.target.value)}
                        className="mt-1 block w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="Digite la cantidad"
                        max={wo.cantidad_asignada}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="text-red-500 text-center text-sm">{error}</p>}

          <div className="flex justify-end space-x-3 pt-4">
            <button onClick={onClose} disabled={isLoading} className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancelar</button>
            <button onClick={handleSubmit} disabled={isLoading} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
              {isLoading ? 'Procesando...' : 'Confirmar Recepción'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default RecepcionTallerModal;