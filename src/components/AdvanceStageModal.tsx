import React, { useState, useEffect, useRef } from 'react';
import Portal from './Portal';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import FilterDropdown from './FilterDropdown'; // Importar el componente de dropdown
import { Pedido } from '../types';
import { useAuth } from '../auth/AuthProvider'; // Importar useAuth

interface GenericItem { id: string; nombre: string; }

interface AdvanceStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Pedido | null;
  onStageAdvanced: () => void;
}

const AdvanceStageModal: React.FC<AdvanceStageModalProps> = ({ isOpen, onClose, order, onStageAdvanced }) => {
  const { user } = useAuth(); // OBTENER EL USUARIO AQUÍ, EN EL NIVEL SUPERIOR DEL COMPONENTE
  // Data from DB
  const [trabajadores, setTrabajadores] = useState<GenericItem[]>([]);

  // Form state
  const [selectedTrabajadorId, setSelectedTrabajadorId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && order) {
      // Reset state on open
      setSelectedTrabajadorId('');
      setNotes('');
      setError(null);

      const fetchData = async () => {
        setLoading(true);
        try {
          // 1. Obtener todas las etapas para saber cuál es la siguiente
          const { data: etapasData, error: etapasError } = await supabase
            .from('etapas')
            .select('nombre, codigo, indice_orden')
            .order('indice_orden', { ascending: true });

          if (etapasError) throw etapasError;

          // 2. Encontrar la etapa actual y la siguiente
          const currentStage = etapasData.find(e => e.codigo === order.codigo_etapa_actual);
          const nextStage = currentStage
            ? etapasData.find(e => e.indice_orden > currentStage.indice_orden)
            : null;

          const nextStageCode = nextStage?.codigo || '';

          // 3. Definir los cargos permitidos según la etapa destino
          let cargosPermitidos: string[] = [];

          const stageCode = nextStageCode; // Alias for clarity

          if (stageCode === 'CORTE') {
            cargosPermitidos = ['Corte'];
          } else if (stageCode === 'PREPARACION') {
            cargosPermitidos = ['Preparación'];
          } else if (stageCode === 'RECEPCION' || stageCode === 'REVISION') {
            cargosPermitidos = ['Recepción', 'Revisión'];
          } else if (stageCode === 'CONFECCION') {
            // A veces Confección se asigna a taller, pero si se selecciona trabajador, debe ser de Confección
            cargosPermitidos = ['Confección'];
          } else if (stageCode === 'PLANCHADO') {
            cargosPermitidos = ['Planchado'];
          } else if (stageCode === 'OJAL_BOTON') {
            cargosPermitidos = ['Confección', 'Ojal y botón', 'Ojal y Botón']; // Coverage for potential future naming
          }

          const { data, error } = await supabase
            .from('trabajadores')
            .select('id, nombre_trabajador, cargos!id_cargo(nombre)')
            .eq('esta_activo', true);

          if (error) throw error;

          // 5. Filtrar MANUALMENTE en JS
          let filtered = data || [];

          if (cargosPermitidos.length > 0) {
            filtered = filtered.filter(t => {
              const cargoNombre = (t as any).cargos?.nombre;
              return cargosPermitidos.includes(cargoNombre);
            });
          } else {
            // Fallback default: exclude Admins/Devs if no specific rule
            filtered = filtered.filter(t => {
              const cargoNombre = (t as any).cargos?.nombre;
              return !['Desarrollador', 'Administrador'].includes(cargoNombre);
            });
          }

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
          setError(`No se pudieron cargar los datos necesarios: ${(err instanceof Error) ? err.message : 'Unknown error'}`);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [isOpen, order]);

  const handleAdvanceStage = async () => {
    if (!user || !user.trabajador_id) { // Validar que el usuario y su ID de trabajador estén disponibles
      setError('Usuario no autenticado o ID de trabajador no disponible para realizar la acción.');
      return;
    }

    if (!order) {
      setError('No se ha seleccionado ningún pedido.');
      return;
    }

    // Determinar el ID del trabajador para la etapa. Si se seleccionó uno en el dropdown, usar ese.
    // De lo contrario, usar el ID del trabajador logueado como fallback.
    const idTrabajadorParaEtapa = selectedTrabajadorId || user.trabajador_id;

    if (!idTrabajadorParaEtapa && (order.codigo_etapa_actual !== 'INGRESO' && order.codigo_etapa_actual !== 'PREPARACION')) {
      setError('Se requiere un ID de trabajador para esta etapa.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 1. Conflict Detection: Fetch current actualizado_en
      const { data: currentOrderData, error: fetchError } = await supabase
        .from('pedidos')
        .select('actualizado_en')
        .eq('id', order.id)
        .single();

      if (fetchError) {
        throw new Error('No se pudo verificar el estado actual del pedido.');
      }

      // 2. Compare timestamps by parsing them to numbers
      const remoteTimestamp = new Date(currentOrderData.actualizado_en).getTime();
      const localTimestamp = new Date(order.actualizado_en).getTime();

      if (remoteTimestamp !== localTimestamp) {
        console.error('Conflict detected', { remote: currentOrderData.actualizado_en, local: order.actualizado_en });
        setError('El pedido fue modificado por otro usuario. Cierra esta ventana para ver los cambios.');
        setLoading(false);
        return;
      }

      // 3. Proceed with the RPC call if no conflict
      const payload = {
        p_id_pedido: order.id,
        p_notas: notes || '',
        p_id_usuario_actualizacion_etapa: user.trabajador_id, // Corregido a user.trabajador_id
        p_id_trabajador: idTrabajadorParaEtapa // ID del trabajador basado en la selección o el logueado
      };
      const { error: rpcError } = await supabase.rpc(
        'avanzar_etapa_pedido',
        { payload: payload }
      );

      if (rpcError) {
        // Asegurarse de que el error sea un objeto Error estándar
        const errorToThrow = new Error(rpcError.message || `Error RPC desconocido: ${JSON.stringify(rpcError)}`);
        // Copiar propiedades relevantes si existen
        Object.assign(errorToThrow, rpcError);
        throw errorToThrow;
      }

      onStageAdvanced();
      onClose();
    } catch (err: unknown) {
      console.error('Error capturado al avanzar etapa:', err); // Añadir esta línea para depuración
      setError(`Error al avanzar la etapa: ${(err instanceof Error) ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!isOpen || !order) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 backdrop-blur-sm p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale"
        >
          <div className="relative p-5 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Avanzar Etapa del Pedido</h2>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignar Trabajador <span className="text-red-500">*</span></label>
              <FilterDropdown
                placeholder="-- Seleccionar Trabajador --"
                options={trabajadores as any}
                selectedValue={selectedTrabajadorId}
                onSelect={setSelectedTrabajadorId}
                valueKey="id"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (Opcional)</label>
              <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          </div>

          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cancelar</button>
            <button type="button" onClick={handleAdvanceStage} disabled={loading} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Avanzando...' : 'Confirmar y Avanzar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default AdvanceStageModal;