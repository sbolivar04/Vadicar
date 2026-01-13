import React, { useState, useEffect, useMemo } from 'react';
import Portal from './Portal';
import {
    XMarkIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import { WorkOrderForReview } from '../types';
import { useAuth } from '../auth/AuthProvider';

interface ConfirmarPlanchadoModalProps {
    isOpen: boolean;
    onClose: () => void;
    workOrders: WorkOrderForReview[];
    onConfirmComplete: () => void;
    numeroPedido?: number | string;
}

interface ResultEntry {
    id_orden_trabajo: string;
    cantidad_planchada: number;
    total_original: number;
    referencia: string;
    talla: string;
    id_planchador: string;
    nombre_planchador: string;
    confirmado: boolean;
    referencia_id: string;
    referencia_imagen_url: string;
    talla_id: string;
}

interface PlanchadorGroup {
    id: string;
    nombre: string;
    indices: number[]; // Indices into the results array
    total_unidades: number;
}

const ConfirmarPlanchadoModal: React.FC<ConfirmarPlanchadoModalProps> = ({
    isOpen,
    onClose,
    workOrders,
    onConfirmComplete,
    numeroPedido
}) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<ResultEntry[]>([]);
    const [selectedPlanchadorId, setSelectedPlanchadorId] = useState<string | null>(null);

    // State for confirmation dialog
    const [indicesToConfirm, setIndicesToConfirm] = useState<number[] | null>(null);

    // Initialize results
    useEffect(() => {
        if (isOpen && workOrders.length > 0) {
            const initialResults = workOrders.map(wo => ({
                id_orden_trabajo: wo.id,
                cantidad_planchada: wo.cantidad_asignada,
                total_original: wo.cantidad_asignada,
                referencia: wo.id_referencia.nombre,
                talla: wo.id_talla.nombre,
                id_planchador: wo.id_trabajador_asignado?.id || 'sin_asignar',
                nombre_planchador: wo.id_trabajador_asignado?.nombre_trabajador || 'Sin Asignar',
                confirmado: wo.estado === 'completada',
                referencia_id: wo.id_referencia.id,
                referencia_imagen_url: wo.id_referencia.imagen_url,
                talla_id: wo.id_talla.id
            }));
            setResults(initialResults);

            const firstPlanchadorId = initialResults.length > 0 ? initialResults[0].id_planchador : null;
            setSelectedPlanchadorId(firstPlanchadorId);
        }
    }, [isOpen, workOrders]);

    // Grouping for Sidebar (by Planchador)
    const groupedPlanchadores = useMemo(() => {
        const groups: { [key: string]: PlanchadorGroup } = {};

        results.forEach((r, i) => {
            if (!groups[r.id_planchador]) {
                groups[r.id_planchador] = {
                    id: r.id_planchador,
                    nombre: r.nombre_planchador,
                    indices: [],
                    total_unidades: 0
                };
            }
            groups[r.id_planchador].indices.push(i);
            groups[r.id_planchador].total_unidades += r.total_original;
        });

        return Object.values(groups);
    }, [results]);

    const selectedGroup = groupedPlanchadores.find(g => g.id === selectedPlanchadorId);

    // Sub-grouping for Detail view (by Reference within the Selected Planchador)
    const referenciasDelPlanchador = useMemo(() => {
        if (!selectedGroup) return [];
        const refMap: { [refId: string]: { id: string, nombre: string, imagen: string, indices: number[] } } = {};

        selectedGroup.indices.forEach(idx => {
            const res = results[idx];
            if (!refMap[res.referencia_id]) {
                refMap[res.referencia_id] = {
                    id: res.referencia_id,
                    nombre: res.referencia,
                    imagen: res.referencia_imagen_url,
                    indices: []
                };
            }
            refMap[res.referencia_id].indices.push(idx);
        });

        return Object.values(refMap);
    }, [selectedGroup, results]);

    const handleQtyChange = (resultIndex: number, value: string) => {
        const val = Math.max(0, parseInt(value) || 0);
        const newResults = [...results];
        const currentItem = newResults[resultIndex];

        // Se limita a no exceder el total asignado por seguridad, aunque el usuario dijo que es solo confirmación
        newResults[resultIndex] = {
            ...currentItem,
            cantidad_planchada: Math.min(val, currentItem.total_original)
        };
        setResults(newResults);
    };

    const handleSelectAllAction = (indices: number[]) => {
        const newResults = [...results];
        indices.forEach(idx => {
            newResults[idx].cantidad_planchada = newResults[idx].total_original;
        });
        setResults(newResults);
    };

    const handleConfirmPlanchador = (revisorIndices: number[]) => {
        setIndicesToConfirm(revisorIndices);
    };

    const executeConfirmPlanchador = async () => {
        if (!indicesToConfirm) return;

        setLoading(true);
        setError(null);

        try {
            const payload = indicesToConfirm.map(idx => ({
                id_orden_trabajo: results[idx].id_orden_trabajo,
                cantidad_planchada: results[idx].cantidad_planchada
            }));

            const { error: rpcError } = await supabase.rpc('confirmar_resultados_planchado_batch', {
                p_resultados: payload,
                p_id_usuario_accion: user?.trabajador_id
            });

            if (rpcError) throw rpcError;

            // Mark as confirmed locally
            const newResults = [...results];
            indicesToConfirm.forEach(idx => {
                newResults[idx].confirmado = true;
            });
            setResults(newResults);

            setIndicesToConfirm(null);

            // If all results are confirmed, close or notify
            const allDone = newResults.every(r => r.confirmado);
            if (allDone) {
                onConfirmComplete();
            }
            else {
                // Select next planchador if current is done
                const currentIndex = groupedPlanchadores.findIndex(g => g.id === selectedPlanchadorId);
                const nextPlanchador = groupedPlanchadores.find((g, i) => i > currentIndex && !g.indices.every(idx => results[idx].confirmado));
                if (nextPlanchador) setSelectedPlanchadorId(nextPlanchador.id);
            }
        } catch (err: any) {
            console.error('Error confirming ironing results:', err);
            setError(err.message || 'Error al confirmar los resultados.');
        } finally {
            setLoading(false);
        }
    };

    const confirmSummary = useMemo(() => {
        if (!indicesToConfirm) return null;
        const totalPlanchada = indicesToConfirm.reduce((sum, idx) => sum + results[idx].cantidad_planchada, 0);
        const nombrePlanchador = results[indicesToConfirm[0]].nombre_planchador;

        return { totalPlanchada, nombrePlanchador };
    }, [indicesToConfirm, results]);

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 backdrop-blur-md p-4 text-gray-900 dark:text-gray-100">
                <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden border dark:border-gray-800 animate-in fade-in zoom-in duration-300">

                    {/* Header */}
                    <div className="p-3 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
                        <div>
                            <h2 className="text-xl font-bold leading-tight">
                                Terminación de Planchado {numeroPedido ? `- Pedido #${numeroPedido}` : ''}
                            </h2>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                Confirmación de prendas procesadas
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <XMarkIcon className="h-7 w-7 text-gray-500" />
                        </button>
                    </div>

                    <div className="flex flex-grow overflow-hidden">
                        {/* Sidebar List (Planchadores) */}
                        <div className="w-1/3 min-w-[260px] flex-shrink-0 border-r dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/50 overflow-y-auto">
                            <div className="pl-3 px-3 space-y-0.5">
                                <p className="px-3 py-1 text-lg font-semibold text-gray-800 dark:text-white mt-2">Personal de Planchado</p>
                                {groupedPlanchadores.map((group) => {
                                    const allConfirmed = group.indices.every(idx => results[idx].confirmado);
                                    const isSelected = selectedPlanchadorId === group.id;

                                    return (
                                        <div
                                            key={group.id}
                                            onClick={() => setSelectedPlanchadorId(group.id)}
                                            className={`w-full flex items-center justify-between p-2 px-3 rounded-xl transition-all border cursor-pointer ${isSelected
                                                ? 'bg-blue-50 dark:bg-blue-900/40 shadow-sm ring-1 ring-blue-500/30 border-blue-200 dark:border-blue-800'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800/30 border-transparent'
                                                }`}
                                        >
                                            <div className="text-left flex-grow">
                                                <h3 className={`font-bold leading-tight ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>
                                                    {group.nombre}
                                                </h3>
                                                <p className="text-[12px] text-gray-400 mt-0.5 font-medium">
                                                    {group.total_unidades} unidades asignadas
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {allConfirmed ? (
                                                    <CheckCircleIcon className="w-6 h-6 text-green-500 animate-in zoom-in duration-300" />
                                                ) : isSelected && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleConfirmPlanchador(group.indices);
                                                        }}
                                                        disabled={loading}
                                                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50"
                                                    >
                                                        Confirmar
                                                    </button>
                                                )}
                                                {!allConfirmed && !isSelected && (
                                                    <ChevronRightIcon className="w-4 h-4 text-gray-300" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {results.length > 0 && results.every(r => r.confirmado) && (
                                    <div className="p-3 mt-4 animate-bounce">
                                        <button
                                            onClick={onConfirmComplete}
                                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 transition-all transform hover:scale-105 active:scale-95"
                                        >
                                            <CheckCircleIcon className="w-5 h-5" />
                                            <span>Finalizar Etapa</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Main Content Detail */}
                        <div className="flex-grow overflow-y-auto bg-white dark:bg-gray-900 p-3 relative">
                            {selectedGroup ? (
                                <div className="max-w-4xl mx-auto space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <div className="space-y-3">
                                        {referenciasDelPlanchador.map(ref => {
                                            const allConfirmedForRef = ref.indices.every(idx => results[idx].confirmado);

                                            return (
                                                <div key={ref.id} className={`rounded-3xl border transition-all ${allConfirmedForRef ? 'bg-green-50/30 dark:bg-green-900/10 border-green-100 dark:border-green-900/30' : 'bg-gray-50/50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-800'}`}>
                                                    <div className="p-3 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <img src={ref.imagen || '/placeholder-ref.png'} className="w-12 h-12 object-cover rounded-2xl shadow-sm" alt={ref.nombre} />
                                                            <div>
                                                                <h4 className="text-base font-bold text-gray-800 dark:text-white leading-tight">{ref.nombre}</h4>
                                                            </div>
                                                        </div>

                                                        {!allConfirmedForRef && (
                                                            <button
                                                                onClick={() => handleSelectAllAction(ref.indices)}
                                                                title="Confirmar todo para esta referencia"
                                                                className="p-1 px-2.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded-xl hover:bg-green-200 transition-colors flex items-center justify-center shadow-sm active:scale-90"
                                                            >
                                                                <CheckCircleIcon className="w-5 h-5 mr-1" />
                                                                <span className="text-xs font-bold">Todo Listo</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="px-3 pb-3">
                                                        <div className="overflow-hidden rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800">
                                                            <table className="w-full text-center text-sm">
                                                                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500">
                                                                    <tr>
                                                                        <th className="px-2 py-1.5 font-bold">Talla</th>
                                                                        <th className="px-2 py-1.5 font-bold">Asignado</th>
                                                                        <th className="px-2 py-1.5 font-bold text-blue-600">Completado</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y dark:divide-gray-700">
                                                                    {ref.indices.map(idx => {
                                                                        const item = results[idx];
                                                                        return (
                                                                            <tr key={item.id_orden_trabajo} className={item.confirmado ? 'opacity-40' : ''}>
                                                                                <td className="p-2 text-center text-sm font-bold">{item.talla}</td>
                                                                                <td className="p-2 text-center text-sm font-bold text-gray-600 dark:text-gray-400">
                                                                                    {item.total_original}
                                                                                </td>
                                                                                <td className="p-2 text-center">
                                                                                    <input
                                                                                        type="number" min="0"
                                                                                        value={item.cantidad_planchada === 0 ? '' : item.cantidad_planchada}
                                                                                        placeholder="0"
                                                                                        onFocus={(e) => e.target.select()}
                                                                                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                                                                        disabled={item.confirmado}
                                                                                        onChange={(e) => handleQtyChange(idx, e.target.value)}
                                                                                        className="no-arrows mx-auto p-1.5 text-center rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 focus:bg-blue-100 focus:border-blue-400 dark:focus:bg-blue-900/40 transition-all font-bold outline-none text-sm w-20"
                                                                                    />
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center space-y-4">
                                    <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                        <CheckCircleIcon className="w-12 h-12 opacity-10" />
                                    </div>
                                    <p className="font-bold max-w-xs uppercase tracking-wider text-sm">Selecciona un trabajador para confirmar su entrega</p>
                                </div>
                            )}

                            {/* Local Confirmation Dialog Overlay */}
                            {indicesToConfirm && confirmSummary && (
                                <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                                    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border dark:border-gray-700 w-full max-w-sm p-6 space-y-5 animate-in zoom-in duration-200">
                                        <div className="text-center space-y-2">
                                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto text-blue-600">
                                                <CheckCircleIcon className="w-8 h-8" />
                                            </div>
                                            <h3 className="text-xl font-bold">Confirmar Trabajo</h3>
                                            <p className="text-sm text-gray-500">¿Confirmar que <strong>{confirmSummary.nombrePlanchador}</strong> terminó sus prendas?</p>
                                        </div>

                                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 flex justify-between items-center">
                                            <span className="text-sm font-medium text-gray-500">Total Planchadas:</span>
                                            <span className="text-xl font-bold text-blue-600">{confirmSummary.totalPlanchada}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setIndicesToConfirm(null)}
                                                className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                                            >
                                                Corregir
                                            </button>
                                            <button
                                                onClick={executeConfirmPlanchador}
                                                disabled={loading}
                                                className="px-4 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                                            >
                                                {loading ? 'Guardando...' : 'Confirmar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl shadow-2xl z-50 animate-bounce flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-5 h-5" />
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </Portal>
    );
};

export default ConfirmarPlanchadoModal;
