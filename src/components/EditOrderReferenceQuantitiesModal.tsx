import React, { useState, useEffect, useMemo, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import Portal from './Portal';

interface Talla {
    id: string;
    nombre: string;
    orden: number;
}

interface EditOrderReferenceQuantitiesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdated: () => void;
    orderId: string;
    referenciaNombre: string;
    referenciaImagen?: string | null;
    initialQuantities: { [tallaNombre: string]: number };
}

const EditOrderReferenceQuantitiesModal: React.FC<EditOrderReferenceQuantitiesModalProps> = ({
    isOpen,
    onClose,
    onUpdated,
    orderId,
    referenciaNombre,
    referenciaImagen,
    initialQuantities
}) => {
    const [tallas, setTallas] = useState<Talla[]>([]);
    const [quantities, setQuantities] = useState<{ [tallaNombre: string]: number }>({});
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTalla, setActiveTalla] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const sizeSelectionRef = useRef<HTMLDivElement>(null);

    // Cargar tallas maestras
    useEffect(() => {
        if (isOpen) {
            const fetchTallas = async () => {
                setLoading(true);
                try {
                    const { data, error: tallasError } = await supabase
                        .from('tallas')
                        .select('id, nombre, orden')
                        .order('orden');

                    if (tallasError) throw tallasError;
                    setTallas(data || []);

                    // Inicializar cantidades (mapear de nombres a valores)
                    setQuantities({ ...initialQuantities });
                } catch (err: any) {
                    console.error("Error fetching tallas:", err);
                    setError("No se pudieron cargar las tallas.");
                } finally {
                    setLoading(false);
                }
            };
            fetchTallas();
        }
    }, [isOpen, initialQuantities]);

    // Manejar click fuera para cerrar el input activo
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sizeSelectionRef.current && !sizeSelectionRef.current.contains(event.target as Node)) {
                setActiveTalla(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-focus en el input cuando se activa una talla
    useEffect(() => {
        if (activeTalla && inputRef.current) {
            inputRef.current.focus();
        }
    }, [activeTalla]);

    const handleQuantityChange = (tallaNombre: string, value: string) => {
        const numValue = parseInt(value) || 0;
        setQuantities(prev => ({
            ...prev,
            [tallaNombre]: Math.max(0, numValue)
        }));
    };

    const handleApplyChanges = async () => {
        setIsSaving(true);
        setError(null);
        try {
            // Llamar a la RPC de la base de datos
            const { error: rpcError } = await supabase.rpc('actualizar_cantidades_pedido_referencia', {
                p_id_pedido: orderId,
                p_nombre_referencia: referenciaNombre,
                p_nuevas_cantidades: quantities
            });

            if (rpcError) throw rpcError;

            onUpdated();
            onClose();
        } catch (err: any) {
            console.error("Error updating quantities:", err);
            setError(`Error al guardar: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const totalUnidades = useMemo(() => {
        return Object.values(quantities).reduce((sum, q) => sum + q, 0);
    }, [quantities]);

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[60] backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col transform transition-all animate-fade-in-scale">
                    <div className="relative p-5 border-b dark:border-gray-700">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Editar Cantidades</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{referenciaNombre}</p>
                        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                        <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl">
                            {referenciaImagen && (
                                <img src={referenciaImagen} alt={referenciaNombre} className="w-16 h-16 object-cover rounded-lg shadow-sm border dark:border-gray-700" />
                            )}
                            <div>
                                <h3 className="font-bold text-gray-800 dark:text-gray-200">{referenciaNombre}</h3>
                                <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">{totalUnidades} unidades totales</p>
                            </div>
                        </div>

                        {loading ? (
                            <p className="text-center py-4 text-gray-500">Cargando tallas...</p>
                        ) : (
                            <div ref={sizeSelectionRef} className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                {tallas.map(talla => {
                                    const qty = quantities[talla.nombre] || 0;
                                    const isActive = activeTalla === talla.nombre;

                                    return (
                                        <div
                                            key={talla.id}
                                            className={`
                                                relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-300 cursor-pointer
                                                ${qty > 0 || isActive
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 ring-1 ring-blue-500/20'
                                                    : 'bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-gray-300'}
                                            `}
                                            onClick={() => !isActive && setActiveTalla(talla.nombre)}
                                        >
                                            <span className={`text-[11px] font-bold uppercase mb-0.5 ${qty > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400'}`}>
                                                {talla.nombre}
                                            </span>

                                            {isActive ? (
                                                <input
                                                    ref={inputRef}
                                                    type="number"
                                                    value={qty || ''}
                                                    onChange={(e) => handleQuantityChange(talla.nombre, e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && setActiveTalla(null)}
                                                    onFocus={(e) => e.target.select()}
                                                    onBlur={() => setActiveTalla(null)}
                                                    className="w-full text-center bg-transparent font-bold text-lg outline-none no-arrows text-blue-600 dark:text-blue-400"
                                                />
                                            ) : (
                                                <span className={`text-lg font-bold ${qty > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300 dark:text-gray-600'}`}>
                                                    {qty}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {error && <p className="text-red-500 text-xs text-center">{error}</p>}
                    </div>

                    <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleApplyChanges}
                            disabled={isSaving || loading}
                            className="flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50"
                        >
                            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export default EditOrderReferenceQuantitiesModal;
