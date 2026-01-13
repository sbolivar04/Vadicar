import React, { useState, useEffect, useMemo } from 'react';
import Portal from './Portal';
import {
    XMarkIcon,
    CheckCircleIcon,
    WrenchScrewdriverIcon,
    ArrowUturnLeftIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import { WorkOrderForReview } from '../types';
import { useAuth } from '../auth/AuthProvider';
import SmartTooltip from './SmartTooltip';

interface RevisionResultsModalProps {
    isOpen: boolean;
    onClose: () => void;
    workOrders: WorkOrderForReview[];
    onResultsConfirmed: (approved: {
        id_referencia: string;
        nombre_referencia: string;
        id_talla: string;
        nombre_talla: string;
        cantidad_aprobada: number;
    }[]) => void;
    numeroPedido?: number | string;
    tallerNombre?: string;
    allTallerWorkOrders: WorkOrderForReview[]; // Nueva prop
    onManageRepairs: (tallerId: string, workOrders: WorkOrderForReview[]) => void; // Nueva prop
    onRefresh?: () => Promise<void>;
}

interface ResultEntry {
    id_orden_trabajo: string;
    aprobada: number;
    reparacion: number;
    descarte: number;
    total_original: number;
    referencia: string;
    talla: string;
    id_revisor: string;
    nombre_revisor: string;
    confirmado: boolean;
    referencia_id: string;
    referencia_imagen_url: string;
    talla_id: string;
}

interface RevisorGroup {
    id: string;
    nombre: string;
    indices: number[]; // Indices into the results array
    total_unidades: number;
    pendingRepairs?: WorkOrderForReview[]; // Agregado
}

const RevisionResultsModal: React.FC<RevisionResultsModalProps> = ({
    isOpen,
    onClose,
    workOrders,
    onResultsConfirmed,
    numeroPedido,
    tallerNombre,
    allTallerWorkOrders,
    onManageRepairs,
    onRefresh
}) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<ResultEntry[]>([]);
    const [selectedRevisorId, setSelectedRevisorId] = useState<string | null>(null);

    // State for confirmation dialog
    const [indicesToConfirm, setIndicesToConfirm] = useState<number[] | null>(null);

    // Initialize results
    useEffect(() => {
        if (isOpen) {
            const initialResults = workOrders.map(wo => ({
                id_orden_trabajo: wo.id,
                aprobada: wo.cantidad_asignada,
                reparacion: 0,
                descarte: 0,
                total_original: wo.cantidad_asignada,
                referencia: wo.id_referencia.nombre,
                talla: wo.id_talla.nombre,
                id_revisor: wo.id_trabajador_asignado?.id || 'sin_revisor',
                nombre_revisor: wo.id_trabajador_asignado?.nombre_trabajador || 'Sin Asignar',
                confirmado: wo.id_etapa_actual?.nombre === 'Revisión' && wo.estado === 'completada', // Ser más específicos
                referencia_id: wo.id_referencia.id,
                referencia_imagen_url: wo.id_referencia.imagen_url,
                talla_id: wo.id_talla.id
            }));
            setResults(initialResults);

            const firstRevisorId = initialResults.length > 0 ? initialResults[0].id_revisor : null;
            setSelectedRevisorId(firstRevisorId);
        }
    }, [isOpen, workOrders]);

    // Grouping for Sidebar (by Revisor)
    const groupedRevisores = useMemo(() => {
        const groups: { [key: string]: RevisorGroup } = {};

        // 1. Identificar todos los revisores que tienen algo pendiente por HACER o por REPARAR
        const revisoresUnicos = new Set<string>();
        results.forEach(r => revisoresUnicos.add(r.id_revisor));
        allTallerWorkOrders.forEach(wo => {
            if (wo.id_etapa_actual?.nombre === 'Revisión' && wo.estado === 'reparacion_interna' && wo.id_trabajador_asignado) {
                revisoresUnicos.add(wo.id_trabajador_asignado.id);
            }
        });

        revisoresUnicos.forEach(revisorId => {
            const resultForThisRevisor = results.filter(r => r.id_revisor === revisorId);
            const repairForThisRevisor = allTallerWorkOrders.filter(wo =>
                wo.id_trabajador_asignado?.id === revisorId &&
                wo.estado === 'reparacion_interna'
            );

            // Obtener nombre del trabajador
            let nombre = 'Sin Asignar';
            if (resultForThisRevisor.length > 0) nombre = resultForThisRevisor[0].nombre_revisor;
            else if (repairForThisRevisor.length > 0) nombre = repairForThisRevisor[0].id_trabajador_asignado?.nombre_trabajador || 'Sin Asignar';

            groups[revisorId] = {
                id: revisorId,
                nombre: nombre,
                indices: results.map((r, i) => r.id_revisor === revisorId ? i : -1).filter(i => i !== -1),
                total_unidades: resultForThisRevisor.reduce((acc, curr) => acc + curr.total_original, 0),
                pendingRepairs: repairForThisRevisor
            };
        });

        return Object.values(groups);
    }, [results, allTallerWorkOrders]);

    const selectedGroup = groupedRevisores.find(g => g.id === selectedRevisorId);

    // Sub-grouping for Detail view (by Reference and Size within the Selected Revisor)
    const referenciasDelRevisor = useMemo(() => {
        if (!selectedGroup) return [];
        const refMap: {
            [refId: string]: {
                id: string,
                nombre: string,
                imagen: string,
                tallas: {
                    [tallaId: string]: {
                        tallaId: string,
                        tallaNombre: string,
                        indices: number[],
                        total: number,
                        aprobada: number,
                        reparacion: number,
                        descarte: number,
                        confirmado: boolean,
                        isError: boolean
                    }
                }
            }
        } = {};

        selectedGroup.indices.forEach(idx => {
            const res = results[idx];
            if (!refMap[res.referencia_id]) {
                refMap[res.referencia_id] = {
                    id: res.referencia_id,
                    nombre: res.referencia,
                    imagen: res.referencia_imagen_url,
                    tallas: {}
                };
            }
            // KEY CHANGE: Group by Talla + Confirmation status
            // Esto separa las prendas ya aprobadas de las que aún están pendientes por confirmar.
            const statusKey = res.confirmado ? 'confirmado' : 'pendiente';
            const tallaKey = `${res.talla_id}-${statusKey}`;

            if (!refMap[res.referencia_id].tallas[tallaKey]) {
                refMap[res.referencia_id].tallas[tallaKey] = {
                    tallaId: res.talla_id,
                    tallaNombre: res.talla,
                    indices: [],
                    total: 0,
                    aprobada: 0,
                    reparacion: 0,
                    descarte: 0,
                    confirmado: res.confirmado, // Preservar el estado
                    isError: false
                };
            }
            const group = refMap[res.referencia_id].tallas[tallaKey];
            group.indices.push(idx);
            group.total += res.total_original;
            group.aprobada += res.aprobada;
            group.reparacion += res.reparacion;
            group.descarte += res.descarte;
            if (!res.confirmado) group.confirmado = false;
        });

        // 2. Incorporate existing repairs (reparacion_interna) into the 'confirmado' groups
        selectedGroup.pendingRepairs?.forEach(repair => {
            const refId = repair.id_referencia.id;
            if (!refMap[refId]) {
                refMap[refId] = {
                    id: refId,
                    nombre: repair.id_referencia.nombre,
                    imagen: repair.id_referencia.imagen_url,
                    tallas: {}
                };
            }

            const statusKey = 'confirmado'; // Reparaciones ya confirmadas se muestran como bloqueadas
            const tallaKey = `${repair.id_talla.id}-${statusKey}`;

            if (!refMap[refId].tallas[tallaKey]) {
                refMap[refId].tallas[tallaKey] = {
                    tallaId: repair.id_talla.id,
                    tallaNombre: repair.id_talla.nombre,
                    indices: [],
                    total: 0,
                    aprobada: 0,
                    reparacion: 0,
                    descarte: 0,
                    confirmado: true,
                    isError: false
                };
            }
            const group = refMap[refId].tallas[tallaKey];
            group.total += repair.cantidad_asignada;
            group.reparacion += repair.cantidad_asignada;
        });

        // 3. Calculate errors and filter out empty rows
        Object.values(refMap).forEach(ref => {
            Object.values(ref.tallas).forEach(group => {
                group.isError = group.aprobada + group.reparacion + group.descarte !== group.total;
            });
        });

        return Object.values(refMap).map(ref => ({
            ...ref,
            // Filter out rows where total is 0
            tallas: Object.values(ref.tallas).filter(g => g.total > 0)
        })).filter(ref => ref.tallas.length > 0);
    }, [selectedGroup, results]);


    const handleGroupQtyChange = (indices: number[], field: keyof ResultEntry, groupNewValue: number) => {
        const newResults = [...results];
        let remainingValue = groupNewValue;

        // Distribuir el valor entre las órdenes del grupo
        indices.forEach((idx, i) => {
            const res = newResults[idx];
            const maxForThis = res.total_original;

            // Valor para esta orden: capturado por el total disponible o el remanente de lo que el usuario pidió
            let newValForThis = 0;
            if (i === indices.length - 1) {
                // Si es el último, le damos todo lo que queda (aunque exceda o falte, la lógica de balance lo arreglará)
                newValForThis = remainingValue;
            } else {
                newValForThis = Math.min(maxForThis, remainingValue);
                remainingValue -= newValForThis;
            }

            // Aplicar el cambio a esta orden individual usando la misma lógica de balance que handleQtyChange
            let val = Math.max(0, newValForThis);
            val = Math.min(val, maxForThis);

            const item = { ...res, [field]: val };

            // Replicar lógica de balance de handleQtyChange
            if (field === 'reparacion' || field === 'descarte') {
                if (item.reparacion + item.descarte > item.total_original) {
                    if (field === 'reparacion') item.descarte = item.total_original - item.reparacion;
                    else item.reparacion = item.total_original - item.descarte;
                }
                item.aprobada = item.total_original - (item.reparacion + item.descarte);
            } else if (field === 'aprobada') {
                const totalProblemasNecesarios = item.total_original - item.aprobada;
                if (item.reparacion + item.descarte !== totalProblemasNecesarios) {
                    if (item.reparacion >= totalProblemasNecesarios) {
                        item.reparacion = totalProblemasNecesarios;
                        item.descarte = 0;
                    } else {
                        item.descarte = totalProblemasNecesarios - item.reparacion;
                    }
                }
            }

            newResults[idx] = item;
        });

        setResults(newResults);
    };




    const handleSelectAllAction = (indices: number[], action: 'pasa' | 'defecto' | 'reparacion') => {
        const newResults = [...results];
        // Solo afectar los índices que NO estén confirmados
        indices.forEach(idx => {
            if (!newResults[idx].confirmado) {
                const total = newResults[idx].total_original;
                newResults[idx] = {
                    ...newResults[idx],
                    aprobada: action === 'pasa' ? total : 0,
                    reparacion: action === 'reparacion' ? total : 0,
                    descarte: action === 'defecto' ? total : 0
                };
            }
        });
        setResults(newResults);
    };

    const handleConfirmRevisor = (revisorIndices: number[]) => {
        // Validation for this specific revisor
        for (const idx of revisorIndices) {
            const res = results[idx];
            if (res.aprobada + res.reparacion + res.descarte !== res.total_original) {
                setError(`Error en ${res.referencia} (${res.talla}): La suma debe ser ${res.total_original}`);
                return;
            }
        }

        // Instead of immediate confirm, show the summary dialog
        setIndicesToConfirm(revisorIndices);
    };

    const executeConfirmRevisor = async () => {
        if (!indicesToConfirm) return;

        setLoading(true);
        setError(null);

        try {
            const payload = indicesToConfirm.map(idx => ({
                id_orden_trabajo: results[idx].id_orden_trabajo,
                aprobada: results[idx].aprobada,
                reparacion: results[idx].reparacion,
                descarte: results[idx].descarte
            }));

            const { error: rpcError } = await supabase.rpc('confirmar_resultados_revision_batch', {
                p_revisiones: payload,
                p_id_usuario_accion: user?.trabajador_id
            });

            if (rpcError) throw rpcError;

            // Refrescar datos antes de marcar localmente para asegurar que los nuevos reparaciones aparezcan
            if (onRefresh) await onRefresh();

            // Mark as confirmed locally (esto mantendrá el estado visual mientras el prop refresca)
            const newResults = [...results];
            indicesToConfirm.forEach(idx => {
                newResults[idx].confirmado = true;
            });
            setResults(newResults);

            setIndicesToConfirm(null); // Close confirm dialog

            // --- Lógica de Cierre Automático ---
            // Solo cerramos el modal si:
            // 1. Todo en 'results' está confirmado.
            // 2. NO se acaban de crear nuevos arreglos en este batch.
            // 3. NO hay otros arreglos pendientes en el taller (de este u otros trabajadores).

            const hasPendingInResults = newResults.some(r => !r.confirmado);
            const createdNewRepairs = payload.some(p => p.reparacion > 0);
            const hasExistingRepairs = groupedRevisores.some(g => (g.pendingRepairs?.length || 0) > 0);

            const allTrulyDone = !hasPendingInResults && !createdNewRepairs && !hasExistingRepairs;

            if (allTrulyDone) {
                const approved = newResults
                    .filter(r => r.aprobada > 0)
                    .map(r => ({
                        id_referencia: r.referencia_id,
                        nombre_referencia: r.referencia,
                        id_talla: r.talla_id,
                        nombre_talla: r.talla,
                        cantidad_aprobada: r.aprobada
                    }));
                onResultsConfirmed(approved);
            }
            else {
                // Select next revisor if current is done
                const currentIndex = groupedRevisores.findIndex(g => g.id === selectedRevisorId);
                const nextRevisor = groupedRevisores.find((g, i) => i > currentIndex && !g.indices.every(idx => results[idx].confirmado));
                if (nextRevisor) setSelectedRevisorId(nextRevisor.id);
            }
        } catch (err: any) {
            console.error('Error confirming revisor results:', err);
            setError(err.message || 'Error al confirmar los resultados.');
        } finally {
            setLoading(false);
        }
    };

    // Calculate summary for confirmation dialog
    const renderConfirmationModal = () => {
        if (!indicesToConfirm) return null;

        // Calcular totales SOLO de los ítems que se van a confirmar ahora
        const totals = indicesToConfirm.reduce((acc, idx) => {
            const res = results[idx];
            // Solo sumar si NO está confirmado aún (doble check de seguridad)
            if (!res.confirmado) {
                acc.approved += res.aprobada;
                acc.repair += res.reparacion;
                acc.discard += res.descarte;
            }
            return acc;
        }, { approved: 0, repair: 0, discard: 0 });
        const nombreRevisor = results[indicesToConfirm[0]].nombre_revisor;

        return (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border dark:border-gray-700 w-full max-w-sm p-6 space-y-5 animate-in zoom-in duration-200">
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto text-blue-600">
                            <ExclamationTriangleIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold">Confirmar Entrega</h3>
                        <p className="text-sm text-gray-500">¿Estás seguro de guardar los resultados para <strong>{nombreRevisor}</strong>?</p>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 space-y-3">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                                <span className="text-gray-600 dark:text-gray-400">Aprobadas:</span>
                                <span className="font-bold text-green-600 text-lg">{totals.approved}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                                <span className="text-gray-600 dark:text-gray-400">Arreglo Menor:</span>
                                <span className="font-bold text-amber-600 text-lg">{totals.repair}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-gray-600 dark:text-gray-400">Devolución:</span>
                                <span className="font-bold text-red-600 text-lg">{totals.discard}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setIndicesToConfirm(null)}
                            className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                        >
                            Corregir
                        </button>
                        <button
                            onClick={executeConfirmRevisor}
                            disabled={loading}
                            className="px-4 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                        >
                            {loading ? 'Guardando...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 backdrop-blur-md p-4 text-gray-900 dark:text-gray-100">
                <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden border dark:border-gray-800 animate-in fade-in zoom-in duration-300">

                    {/* Header */}
                    <div className="p-3 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
                        <div>
                            <h2 className="text-xl font-bold leading-tight">
                                Control de Calidad {numeroPedido ? `- Pedido #${numeroPedido}` : ''}
                            </h2>
                            {tallerNombre && (
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    Taller: {tallerNombre}
                                </p>
                            )}
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <XMarkIcon className="h-7 w-7 text-gray-500" />
                        </button>
                    </div>

                    <div className="flex flex-grow overflow-hidden">
                        {/* Sidebar List (Revisores) */}
                        <div className="w-1/3 min-w-[260px] flex-shrink-0 border-r dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/50 overflow-y-auto">
                            <div className="pl-3 px-3 space-y-0.5">
                                <p className="px-3 py-1 text-lg font-semibold text-gray-800 dark:text-white">Personal de Revisión</p>
                                {groupedRevisores.map((group) => {
                                    const allConfirmed = group.indices.every(idx => results[idx].confirmado);
                                    const isSelected = selectedRevisorId === group.id;

                                    return (
                                        <div
                                            key={group.id}
                                            onClick={() => setSelectedRevisorId(group.id)}
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
                                                    {group.total_unidades} prendas
                                                    {(group.pendingRepairs?.length || 0) > 0 && (
                                                        <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">
                                                            | {(group.pendingRepairs || []).reduce((acc, curr) => acc + curr.cantidad_asignada, 0)} arreglos
                                                        </span>
                                                    )}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                {/* Botón de Reparaciones (Si tiene) */}
                                                {(group.pendingRepairs?.length || 0) > 0 && (
                                                    <SmartTooltip content="Tiene arreglos menores pendientes">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const tallestId = (allTallerWorkOrders && allTallerWorkOrders.length > 0) ? (allTallerWorkOrders[0].id_taller || '') : '';
                                                                onManageRepairs(tallestId, group.pendingRepairs || []);
                                                            }}
                                                            className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 hover:bg-amber-200 transition-colors shadow-sm"
                                                        >
                                                            <WrenchScrewdriverIcon className="w-4 h-4" />
                                                        </button>
                                                    </SmartTooltip>
                                                )}

                                                {/* Botón de Confirmar (Si faltan prendas por revisar y es el seleccionado) */}
                                                {!allConfirmed ? (
                                                    isSelected && (
                                                        <SmartTooltip content="Confirmar resultados de este revisor">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleConfirmRevisor(group.indices);
                                                                }}
                                                                disabled={loading}
                                                                className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                                            >
                                                                <CheckCircleIcon className="w-5 h-5" />
                                                            </button>
                                                        </SmartTooltip>
                                                    )
                                                ) : (group.pendingRepairs?.length || 0) === 0 ? (
                                                    /* Estado: TODO TERMINADO (Sin prendas pendientes Y sin arreglos) */
                                                    <CheckCircleIcon className="w-6 h-6 text-green-500 animate-in zoom-in duration-300" />
                                                ) : null}

                                                {!allConfirmed && !isSelected && (
                                                    <ChevronRightIcon className="w-4 h-4 text-gray-300" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {results.length > 0 &&
                                    results.every(r => r.confirmado) &&
                                    groupedRevisores.every(g => (g.pendingRepairs?.length || 0) === 0) && (
                                        <div className="p-3 mt-4 animate-bounce">
                                            <button
                                                onClick={() => {
                                                    const approved = results
                                                        .filter(r => r.aprobada > 0)
                                                        .map(r => ({
                                                            id_referencia: r.referencia_id,
                                                            nombre_referencia: r.referencia,
                                                            imagen_url: r.referencia_imagen_url,
                                                            id_talla: r.talla_id,
                                                            nombre_talla: r.talla,
                                                            cantidad_aprobada: r.aprobada
                                                        }));
                                                    onResultsConfirmed(approved);
                                                }}
                                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 transition-all transform hover:scale-105 active:scale-95"
                                            >
                                                <CheckCircleIcon className="w-5 h-5" />
                                                <span>Finalizar Revisión</span>
                                            </button>
                                            <p className="text-[10px] text-gray-400 text-center mt-2 font-medium">Todos los trabajadores confirmados</p>
                                        </div>
                                    )}
                            </div>
                        </div>

                        {/* Main Content Detail (References of this Revisor) */}
                        <div className="flex-grow overflow-y-auto bg-white dark:bg-gray-900 p-3 relative">
                            {selectedGroup ? (
                                <div className="max-w-4xl mx-auto space-y-4 animate-in slide-in-from-right-4 duration-300">

                                    <div className="space-y-3">
                                        {referenciasDelRevisor.map(ref => {
                                            const allIndices = ref.tallas.flatMap(t => t.indices);
                                            const allConfirmedForRef = allIndices.every(idx => results[idx].confirmado);

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
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleSelectAllAction(allIndices, 'pasa')}
                                                                    title="Marcar todo como Aprobado"
                                                                    className="p-1 px-2.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded-xl hover:bg-green-200 transition-colors flex items-center justify-center shadow-sm active:scale-90"
                                                                >
                                                                    <CheckCircleIcon className="w-5 h-5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSelectAllAction(allIndices, 'reparacion')}
                                                                    title="Marcar todo como Reparación"
                                                                    className="p-1 px-2.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-xl hover:bg-amber-200 transition-colors flex items-center justify-center shadow-sm active:scale-90"
                                                                >
                                                                    <WrenchScrewdriverIcon className="w-5 h-5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSelectAllAction(allIndices, 'defecto')}
                                                                    title="Marcar todo como Devolución"
                                                                    className="p-1 px-2.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 rounded-xl hover:bg-red-200 transition-colors flex items-center justify-center shadow-sm active:scale-90"
                                                                >
                                                                    <ArrowUturnLeftIcon className="w-5 h-5" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="px-3 pb-3">
                                                        <div className="overflow-hidden rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800">
                                                            <table className="w-full text-center text-sm">
                                                                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500">
                                                                    <tr>
                                                                        <th className="px-2 py-1.5 font-bold">Talla</th>
                                                                        <th className="px-2 py-1.5 font-bold">Total</th>
                                                                        <th className="px-2 py-1.5 font-bold text-green-600">Aprobado</th>
                                                                        <th className="px-2 py-1.5 font-bold text-amber-600">Arreglo Menor</th>
                                                                        <th className="px-2 py-1.5 font-bold text-red-600">Devolución</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y dark:divide-gray-700">
                                                                    {ref.tallas.map(group => {
                                                                        return (
                                                                            <tr key={`${ref.id}-${group.tallaId}-${group.confirmado ? 'c' : 'p'}`} className={group.confirmado ? 'opacity-40' : ''}>
                                                                                <td className="p-0.5 text-center text-sm font-bold">{group.tallaNombre}</td>
                                                                                <td className="p-0.5 text-center text-sm font-bold text-gray-600 dark:text-gray-400">
                                                                                    {group.total}
                                                                                </td>
                                                                                <td className="p-0.5 text-center">
                                                                                    <input
                                                                                        type="number" min="0"
                                                                                        value={group.aprobada === 0 ? '' : group.aprobada}
                                                                                        placeholder="0"
                                                                                        onFocus={(e) => e.target.select()}
                                                                                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                                                                        disabled={group.confirmado}
                                                                                        onChange={(e) => handleGroupQtyChange(group.indices, 'aprobada', parseInt(e.target.value) || 0)}
                                                                                        style={{ width: `${Math.max(2, String(group.aprobada).length) + 1}ch`, minWidth: '2rem' }}
                                                                                        className={`no-arrows mx-auto p-1 text-center rounded-lg bg-green-100 dark:bg-green-900/40 border-transparent focus:bg-green-200 focus:border-green-400 dark:focus:bg-green-900/50 transition-all font-bold outline-none text-sm ${group.isError ? 'text-red-600 ring-2 ring-red-500/20' : 'text-green-900 dark:text-green-200'}`}
                                                                                    />
                                                                                </td>
                                                                                <td className="p-0.5 text-center">
                                                                                    <input
                                                                                        type="number" min="0"
                                                                                        value={group.reparacion === 0 ? '' : group.reparacion}
                                                                                        placeholder="0"
                                                                                        onFocus={(e) => e.target.select()}
                                                                                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                                                                        disabled={group.confirmado}
                                                                                        onChange={(e) => handleGroupQtyChange(group.indices, 'reparacion', parseInt(e.target.value) || 0)}
                                                                                        style={{ width: `${Math.max(2, String(group.reparacion).length) + 1}ch`, minWidth: '2rem' }}
                                                                                        className={`no-arrows mx-auto p-1 text-center rounded-lg bg-amber-100 dark:bg-amber-900/40 border-transparent focus:bg-amber-200 focus:border-amber-400 dark:focus:bg-amber-900/50 transition-all font-bold outline-none text-sm ${group.isError ? 'text-red-600 ring-2 ring-red-500/20' : 'text-amber-900 dark:text-amber-200'}`}
                                                                                    />
                                                                                </td>
                                                                                <td className="p-0.5 text-center">
                                                                                    <input
                                                                                        type="number" min="0"
                                                                                        value={group.descarte === 0 ? '' : group.descarte}
                                                                                        placeholder="0"
                                                                                        onFocus={(e) => e.target.select()}
                                                                                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                                                                        disabled={group.confirmado}
                                                                                        onChange={(e) => handleGroupQtyChange(group.indices, 'descarte', parseInt(e.target.value) || 0)}
                                                                                        style={{ width: `${Math.max(2, String(group.descarte).length) + 1}ch`, minWidth: '2rem' }}
                                                                                        className={`no-arrows mx-auto p-1 text-center rounded-lg bg-red-100 dark:bg-red-900/40 border-transparent focus:bg-red-200 focus:border-red-400 dark:focus:bg-red-900/50 transition-all font-bold outline-none text-sm ${group.isError ? 'text-red-600 ring-2 ring-red-500/20' : 'text-red-900 dark:text-red-200'}`}
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
                                    <p className="font-bold max-w-xs uppercase tracking-wider text-sm">Selecciona un revisor para procesar su entrega</p>
                                </div>
                            )}

                            {/* Local Confirmation Dialog Overlay */}
                            {/* Local Confirmation Dialog Overlay */}
                            {renderConfirmationModal()}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl shadow-2xl z-50 animate-bounce flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5" />
                        {error}
                    </div>
                )}
            </div>
        </Portal>
    );
};

export default RevisionResultsModal;
