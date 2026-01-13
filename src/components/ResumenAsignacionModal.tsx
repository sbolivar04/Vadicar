import React from 'react';
import Portal from './Portal';
import { XMarkIcon } from '@heroicons/react/24/outline';
import TallaCantidadBadge from './TallaCantidadBadge';

// --- Interfaces ---
interface TallaAsignada {
  id: string;
  id_original_talla: string;
  nombre_talla: string;
  cantidad: number;
  id_referencia: string;
}

interface AsignacionesTaller {
  [id_taller: string]: TallaAsignada[];
}

import { Taller } from '../types';

interface ReferenciaAgrupada {
  id_referencia: string;
  nombre_referencia: string;
  imagen_url: string | null;
}

interface ResumenAsignacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  asignaciones: AsignacionesTaller;
  talleres: Taller[];
  referencias: ReferenciaAgrupada[];
  loading: boolean;
}

const ResumenAsignacionModal: React.FC<ResumenAsignacionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  asignaciones,
  talleres,
  referencias,
  loading
}) => {
  if (!isOpen) return null;

  const getTallerName = (id: string) => talleres.find(t => t.id === id)?.nombre || 'Taller Desconocido';
  const getReferenceData = (id: string) => referencias.find(r => r.id_referencia === id);


  // Agrupar asignaciones por taller y luego por referencia
  const resumenAgrupado = Object.keys(asignaciones).map(idTaller => {
    const asignacionesTaller = asignaciones[idTaller];
    const refsAgrupadas = new Map<string, TallaAsignada[]>();

    asignacionesTaller.forEach(asignacion => {
      if (!refsAgrupadas.has(asignacion.id_referencia)) {
        refsAgrupadas.set(asignacion.id_referencia, []);
      }
      refsAgrupadas.get(asignacion.id_referencia)!.push(asignacion);
    });

    return {
      idTaller,
      nombreTaller: getTallerName(idTaller),
      referencias: Array.from(refsAgrupadas.entries()).map(([idRef, tallas]) => ({
        idRef,
        nombreRef: getReferenceData(idRef)?.nombre_referencia || 'Referencia Desconocida',
        imagenUrl: getReferenceData(idRef)?.imagen_url || 'https://placehold.co/400x400/cccccc/666666?text=Sin+Imagen',
        tallas
      }))
    };
  });

  return (
    <Portal>
      <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60] p-4 backdrop-blur-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Resumen de Asignación</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-grow p-6 overflow-y-auto space-y-6">
            {resumenAgrupado.map(taller => (
              <div key={taller.idTaller} className="bg-gray-50 dark:bg-gray-900/50 p-0.5 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-1">{taller.nombreTaller}</h3>
                <div className="space-y-2">
                  {taller.referencias.map(ref => (
                    <div key={ref.idRef} className="flex items-center gap-3 p-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                      <img
                        src={ref.imagenUrl}
                        alt={ref.nombreRef}
                        className="w-12 h-12 object-cover rounded-md flex-shrink-0"
                      />
                      <div>
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200">{ref.nombreRef}</h4>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {ref.tallas.map(talla => (
                            <TallaCantidadBadge
                              key={talla.id}
                              talla={talla.nombre_talla}
                              cantidad={talla.cantidad}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex justify-end items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default ResumenAsignacionModal;
