import React, { useState, useEffect } from 'react';
import Portal from './Portal';
import { XMarkIcon, WrenchIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import { WorkOrderForReview } from '../types';
import { useAuth } from '../auth/AuthProvider';

interface ConfirmarReparacionModalProps {
    isOpen: boolean;
    onClose: () => void;
    workOrders: WorkOrderForReview[];
    onRepairsConfirmed: () => void;
}

const ConfirmarReparacionModal: React.FC<ConfirmarReparacionModalProps> = ({
    isOpen,
    onClose,
    workOrders,
    onRepairsConfirmed
}) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Initialize selection when workOrders change
    useEffect(() => {
        if (isOpen) {
            // By default, select all? Or none? Let's select all for convenience.
            setSelectedIds(new Set(workOrders.map(wo => wo.id)));
        }
    }, [isOpen, workOrders]);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleConfirm = async () => {
        if (selectedIds.size === 0) {
            setError("Por favor, selecciona al menos una prenda reparada para confirmar.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Build payload only for SELECTED items
            const payload = workOrders
                .filter(wo => selectedIds.has(wo.id))
                .map(wo => ({
                    id_orden_trabajo: wo.id,
                    aprobada: wo.cantidad_asignada, // Total qty moves to Approved
                    reparacion: 0,
                    descarte: 0
                }));

            const { error: rpcError } = await supabase.rpc('confirmar_resultados_revision_batch', {
                p_revisiones: payload,
                p_id_usuario_accion: user?.trabajador_id
            });

            if (rpcError) throw rpcError;

            onRepairsConfirmed();
        } catch (err: any) {
            console.error('Error confirming repairs:', err);
            setError(err.message || 'Error al confirmar las reparaciones.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[60] backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg transform transition-all animate-fade-in-scale">
                    <div className="relative p-5 border-b dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 dark:bg-amber-800 rounded-lg">
                                <WrenchIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Confirmar Reparaciones</h2>
                        </div>
                        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><XMarkIcon className="h-6 w-6" /></button>
                    </div>

                    <div className="p-6">
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            Marca las prendas que han sido reparadas correctamente. Estas pasarán a la siguiente etapa (Ojal y Botón). Las no marcadas permanecerán en "Reparación Interna".
                        </p>

                        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

                        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                            {workOrders.map((wo) => {
                                const isSelected = selectedIds.has(wo.id);
                                return (
                                    <label key={wo.id} className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer ${isSelected ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-500' : 'border-gray-200 dark:border-gray-700 hover:border-amber-300'}`}>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelection(wo.id)}
                                                className="w-5 h-5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                                            />
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-800 dark:text-gray-200">{wo.id_referencia.nombre}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">Talla: {wo.id_talla.nombre}</span>
                                            </div>
                                        </div>
                                        <span className="font-bold text-lg text-amber-600 dark:text-amber-400">{wo.cantidad_asignada} <span className="text-xs font-normal text-gray-500">unids</span></span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-5 border-t dark:border-gray-700 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading || selectedIds.size === 0}
                            className="px-4 py-2 text-sm font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                        >
                            {loading ? 'Confirmando...' : `Confirmar (${selectedIds.size})`}
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export default ConfirmarReparacionModal;
