import TallaCantidadBadge from './TallaCantidadBadge';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Portal from './Portal';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Trash2, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DndContext, closestCenter, useDraggable, useDroppable, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Active, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { nanoid } from 'nanoid';
import ReferenceCard from './ReferenceCard';
import ResumenAsignacionModal from './ResumenAsignacionModal';
import { Taller } from '../types';
import { useAuth } from '../auth/AuthProvider';

interface TallaDisponible {
    id: string;
    nombre: string;
    cantidad: number;
    originalIds?: string[]; // IDs de las órdenes de trabajo que estamos quemando
}

interface TallaAsignada {
    id: string;
    id_original_talla: string;
    nombre_talla: string;
    cantidad: number;
    id_referencia: string;
}

interface AsignacionesPlanchador {
    [id_planchador: string]: TallaAsignada[];
}

interface ReferenciaAgrupada {
    id_referencia: string;
    nombre_referencia: string;
    imagen_url: string | null;
    tallas_disponibles: Map<string, TallaDisponible>;
    tallas_originales_global: Map<string, number>;
}

interface AsignarPlanchadoModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: string;
    onAsignacionComplete: () => void;
    id_taller_revision: string;
    approvedWorkOrders: {
        id_referencia: string;
        nombre_referencia: string;
        id_talla: string;
        nombre_talla: string;
        cantidad_aprobada: number;
    }[];
    orderNumber?: number | string;
}

interface DraggableTallaData {
    type: 'TallaDisponible';
    talla: TallaDisponible;
    idReferencia: string;
}

interface DraggableAsignadaData {
    type: 'TallaAsignada';
    item: TallaAsignada;
}

type ActiveDragData = DraggableTallaData | DraggableAsignadaData;

// --- Reusable Components ---
const DraggableTallaDisponible = ({ talla, idReferencia, onClick }: { talla: TallaDisponible, idReferencia: string, onClick: () => void }) => {
    const shouldBeDraggable = talla.cantidad > 0;
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `draggable-talla-${talla.id}-${idReferencia}`,
        data: { talla, type: 'TallaDisponible', idReferencia } as DraggableTallaData,
        disabled: !shouldBeDraggable,
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        cursor: shouldBeDraggable ? 'grab' : 'not-allowed',
    } : {
        cursor: shouldBeDraggable ? 'grab' : 'not-allowed',
    };

    const handleWrapperClick = () => {
        if (transform) return;
        if (shouldBeDraggable) {
            onClick();
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={handleWrapperClick}
            className={`flex-shrink-0 inline-flex items-center rounded-full
                  ${shouldBeDraggable
                    ? 'cursor-grab'
                    : 'opacity-50 cursor-not-allowed'}`}
        >
            <TallaCantidadBadge
                talla={talla.nombre}
                cantidad={talla.cantidad}
                className="px-2.5 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-full text-sm font-medium transition-colors"
            />
        </div>
    );
};

const AsignadaTallaPill = ({ item, onQuantityChange, onRemove, maxQuantity, referenceColor, referenceName }: { item: TallaAsignada, onQuantityChange: (newQty: number) => void, onRemove: (id: string) => void, maxQuantity: number, referenceColor: string, referenceName: string }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editingValue, setEditingValue] = useState(item.cantidad);
    const inputRef = useRef<HTMLInputElement>(null);

    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `draggable-asignada-${item.id}`,
        data: { item, type: 'TallaAsignada' } as DraggableAsignadaData,
    });

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing) {
            setEditingValue(item.cantidad);
        }
    }, [item.cantidad, isEditing]);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
    };

    const handleUpdate = () => {
        setIsEditing(false);
        const newQuantity = Math.max(0, Number(editingValue));
        if (!isNaN(newQuantity)) {
            if (newQuantity === 0) {
                onRemove(item.id);
            } else if (newQuantity !== item.cantidad) {
                onQuantityChange(newQuantity);
            }
        } else {
            setEditingValue(item.cantidad);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleUpdate();
        else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditingValue(item.cantidad);
        }
    };

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        borderColor: referenceColor,
    } : {
        borderColor: referenceColor,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="flex-shrink-0 flex items-center gap-2 p-1.5 rounded-full border-r-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold cursor-grab shadow-sl"
            onClick={handleClick}
            title={`Referencia: ${referenceName}`}
        >
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="number"
                    value={editingValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                        const newValue = Number(e.target.value);
                        const cappedValue = Math.max(0, Math.min(newValue, maxQuantity));
                        setEditingValue(cappedValue);
                    }}
                    onBlur={handleUpdate}
                    onKeyDown={handleKeyDown}
                    className="w-10 text-center bg-black/20 text-white rounded focus:outline-none text-xs"
                />
            ) : (
                <TallaCantidadBadge
                    talla={item.nombre_talla}
                    cantidad={item.cantidad}
                    className="px-1 text-xs bg-transparent dark:bg-transparent"
                />
            )}
        </div>
    );
};

// Main Modal Component
const AsignarPlanchadoModal: React.FC<AsignarPlanchadoModalProps> = ({ isOpen, onClose, orderId, orderNumber, id_taller_revision, approvedWorkOrders, onAsignacionComplete }) => {
    const { user, loading: authLoading } = useAuth();
    const [referenciasAgrupadas, setReferenciasAgrupadas] = useState<ReferenciaAgrupada[]>([]);
    const [planchadoresBD, setPlanchadoresBD] = useState<Taller[]>([]);
    const [planchadoresAsignados, setPlanchadoresAsignados] = useState<AsignacionesPlanchador>({});
    const [activeDraggableItem, setActiveDraggableItem] = useState<Active | null>(null);
    const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
    const [showPlanchadorDropdown, setShowPlanchadorDropdown] = useState(false);
    const [lastAddedPlanchadorId, setLastAddedPlanchadorId] = useState<string | null>(null);
    const [isResumenModalOpen, setIsResumenModalOpen] = useState(false);
    const [planchadorSearchTerm, setPlanchadorSearchTerm] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );
    const dropdownRef = useRef<HTMLDivElement>(null);

    const activeDragData = useMemo(() => activeDraggableItem?.data.current as ActiveDragData | undefined, [activeDraggableItem]);

    const colorMap = useMemo(() => {
        const map = new Map<string, string>();
        const colorPalette = [
            '#ef4444', '#eab308', '#22c55e', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899', '#6366f1',
        ];
        let colorIndex = 0;

        referenciasAgrupadas.forEach(ref => {
            if (!map.has(ref.id_referencia)) {
                map.set(ref.id_referencia, colorPalette[colorIndex % colorPalette.length]);
                colorIndex++;
            }
        });
        return map;
    }, [referenciasAgrupadas]);

    const selectedReference = useMemo(() => {
        if (!selectedReferenceId) return null;
        return referenciasAgrupadas.find(ref => ref.id_referencia === selectedReferenceId) || null;
    }, [selectedReferenceId, referenciasAgrupadas]);

    const referenciasConEstado = useMemo(() => {
        return referenciasAgrupadas.map(ref => {
            const totalDisponible = Array.from(ref.tallas_disponibles.values()).reduce((sum, talla) => sum + talla.cantidad, 0);
            const isCompleted = totalDisponible === 0;
            return { ...ref, isCompleted };
        });
    }, [referenciasAgrupadas]);

    const isAsignacionCompleta = useMemo(() => {
        if (referenciasAgrupadas.length === 0) return false;

        let totalPedidoOriginal = 0;
        referenciasAgrupadas.forEach(ref => {
            ref.tallas_originales_global.forEach(cantidad => {
                totalPedidoOriginal += cantidad;
            });
        });

        if (totalPedidoOriginal === 0) return false;

        let totalAsignado = 0;
        Object.values(planchadoresAsignados).forEach(asignaciones => {
            asignaciones.forEach(item => {
                totalAsignado += item.cantidad;
            });
        });

        return totalAsignado === totalPedidoOriginal;
    }, [planchadoresAsignados, referenciasAgrupadas]);

    // Initial Data Load
    useEffect(() => {
        if (isOpen && orderId && approvedWorkOrders) {
            setIsResumenModalOpen(false); // Seguridad: resetear siempre al abrir
            const fetchInitialData = async () => {
                setLoading(true);
                setError(null);
                try {
                    const agrupadas = new Map<string, ReferenciaAgrupada>();

                    if (!approvedWorkOrders || approvedWorkOrders.length === 0) {
                        setReferenciasAgrupadas([]);
                        setLoading(false);
                        return;
                    }

                    setLoading(true); // Asegurar que estamos cargando si hay datos

                    for (const wo of approvedWorkOrders) {
                        const id_referencia = wo.id_referencia;
                        const id_talla = wo.id_talla;
                        const id_original = (wo as any).id_original; // ID de la WO fuente

                        if (!agrupadas.has(id_referencia)) {
                            // Intentar obtener la imagen de la referencia si no viene en los datos
                            const { data: refData } = await supabase
                                .from('referencias')
                                .select('imagen_url')
                                .eq('id', id_referencia)
                                .single();

                            let publicURL = refData?.imagen_url;
                            if (publicURL && !publicURL.startsWith('http')) {
                                const { data } = supabase.storage.from('imagenes').getPublicUrl(publicURL);
                                publicURL = data.publicUrl;
                            }

                            agrupadas.set(id_referencia, {
                                id_referencia: id_referencia,
                                nombre_referencia: wo.nombre_referencia,
                                imagen_url: publicURL || null,
                                tallas_disponibles: new Map(),
                                tallas_originales_global: new Map(),
                            });
                        }
                        const ref = agrupadas.get(id_referencia)!;
                        const existingTalla = ref.tallas_disponibles.get(id_talla);
                        const currentCantidad = existingTalla?.cantidad || 0;
                        const currentIds = existingTalla?.originalIds || [];

                        const newQty = currentCantidad + wo.cantidad_aprobada;
                        const newIds = id_original ? [...currentIds, id_original] : currentIds;

                        ref.tallas_disponibles.set(id_talla, {
                            id: id_talla,
                            nombre: wo.nombre_talla,
                            cantidad: newQty,
                            originalIds: newIds
                        });
                        ref.tallas_originales_global.set(id_talla, newQty);
                    }

                    const referenciasArray = Array.from(agrupadas.values());
                    setReferenciasAgrupadas(referenciasArray);

                    if (referenciasArray.length > 0) {
                        setSelectedReferenceId(referenciasArray[0].id_referencia);
                    }

                    // Fetch planchadores activos
                    const { data: trabajadoresData, error: trabajadoresError } = await supabase
                        .from('trabajadores')
                        .select('id, nombre_trabajador, cargos!id_cargo(nombre)')
                        .eq('esta_activo', true);

                    if (trabajadoresError) throw trabajadoresError;

                    const filtered = (trabajadoresData || []).filter(t => {
                        const cargo = (t as any).cargos?.nombre;
                        return cargo === 'Planchado';
                    });

                    const sorted = filtered
                        .map(t => ({
                            id: t.id,
                            nombre: t.nombre_trabajador
                        }))
                        .sort((a, b) => a.nombre.localeCompare(b.nombre));

                    setPlanchadoresBD(sorted);
                    setPlanchadoresAsignados({});
                    setShowPlanchadorDropdown(false);
                    setLastAddedPlanchadorId(null);

                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Error al cargar los datos.');
                } finally {
                    setLoading(false);
                }
            };
            fetchInitialData();
        }
    }, [isOpen, orderId, approvedWorkOrders]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && showPlanchadorDropdown) {
                setShowPlanchadorDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownRef, showPlanchadorDropdown]);

    useEffect(() => {
        if (!showPlanchadorDropdown) {
            setPlanchadorSearchTerm('');
        }
    }, [showPlanchadorDropdown]);

    const autoAssignTalla = (talla: TallaDisponible, idReferencia: string) => {
        if (!lastAddedPlanchadorId) {
            setError("Primero debe seleccionar un planchador.");
            setTimeout(() => setError(null), 3000);
            return;
        }
        if (talla.cantidad <= 0) return;

        const targetId = lastAddedPlanchadorId;

        setPlanchadoresAsignados(prev => {
            const newAsignaciones = { ...prev };
            if (!newAsignaciones[targetId]) newAsignaciones[targetId] = [];

            let planchadorActual = [...newAsignaciones[targetId]];
            const existente = planchadorActual.find(t => t.id_original_talla === talla.id && t.id_referencia === idReferencia);
            const cantidadToAdd = talla.cantidad;

            if (existente) {
                planchadorActual = planchadorActual.map(pill =>
                    pill.id === existente.id ? { ...pill, cantidad: pill.cantidad + cantidadToAdd } : pill
                );
            } else {
                planchadorActual.push({
                    id: nanoid(),
                    id_original_talla: talla.id,
                    nombre_talla: talla.nombre,
                    cantidad: cantidadToAdd,
                    id_referencia: idReferencia,
                });
            }

            newAsignaciones[targetId] = planchadorActual;
            return newAsignaciones;
        });

        setReferenciasAgrupadas(prevRefs => prevRefs.map(ref => {
            if (ref.id_referencia === idReferencia) {
                const newTallasDisp = new Map(ref.tallas_disponibles);
                const currentTalla = newTallasDisp.get(talla.id);
                if (currentTalla) {
                    newTallasDisp.set(talla.id, { ...currentTalla, cantidad: 0 });
                }
                return { ...ref, tallas_disponibles: newTallasDisp };
            }
            return ref;
        }));
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDraggableItem(event.active);
        setError(null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDraggableItem(null);
        const { active, over } = event;
        const draggedItem = active.data.current as ActiveDragData | undefined;

        if (!draggedItem) return;

        const dropTargetId = over ? over.id.toString() : null;
        const isTargetAPlanchador = dropTargetId ? planchadoresBD.some(t => t.id === dropTargetId) : false;

        if (draggedItem.type === 'TallaDisponible') {
            const { talla, idReferencia } = draggedItem;
            if (isTargetAPlanchador && talla.cantidad > 0) {
                setPlanchadoresAsignados(prev => {
                    const newAsignaciones = { ...prev };
                    if (!newAsignaciones[dropTargetId!]) newAsignaciones[dropTargetId!] = [];
                    let planchadorActual = newAsignaciones[dropTargetId!];
                    const existente = planchadorActual.find(t => t.id_original_talla === talla.id && t.id_referencia === idReferencia);
                    const nuevaCantidad = (existente ? existente.cantidad : 0) + talla.cantidad;
                    planchadorActual = planchadorActual.filter(t => !(t.id_original_talla === talla.id && t.id_referencia === idReferencia));
                    planchadorActual.push({
                        id: nanoid(),
                        id_original_talla: talla.id,
                        nombre_talla: talla.nombre,
                        cantidad: nuevaCantidad,
                        id_referencia: idReferencia,
                    });
                    newAsignaciones[dropTargetId!] = planchadorActual;
                    return newAsignaciones;
                });

                setReferenciasAgrupadas(prevRefs => prevRefs.map(ref => {
                    if (ref.id_referencia === idReferencia) {
                        const newTallasDisp = new Map(ref.tallas_disponibles);
                        const currentTalla = newTallasDisp.get(talla.id);
                        if (currentTalla) newTallasDisp.set(talla.id, { ...currentTalla, cantidad: 0 });
                        return { ...ref, tallas_disponibles: newTallasDisp };
                    }
                    return ref;
                }));
            }
        } else if (draggedItem.type === 'TallaAsignada') {
            const { item } = draggedItem;
            let originalId: string | null = null;
            for (const tId in planchadoresAsignados) {
                if (planchadoresAsignados[tId].some(pill => pill.id === item.id)) {
                    originalId = tId;
                    break;
                }
            }
            if (!originalId) return;

            if (dropTargetId === 'disponible-zone' || !over) {
                removeAssignedPill(item.id_original_talla, item.id, item.cantidad, item.id_referencia);
            } else if (isTargetAPlanchador && dropTargetId !== originalId) {
                setPlanchadoresAsignados(prev => {
                    const newAsignaciones = { ...prev };
                    newAsignaciones[originalId!] = newAsignaciones[originalId!].filter(pill => pill.id !== item.id);
                    let newDest = newAsignaciones[dropTargetId!] ? [...newAsignaciones[dropTargetId!]] : [];
                    const existente = newDest.find(t => t.id_original_talla === item.id_original_talla && t.id_referencia === item.id_referencia);
                    if (existente) {
                        newDest = newDest.map(pill => pill.id === existente.id ? { ...pill, cantidad: pill.cantidad + item.cantidad } : pill);
                    } else {
                        newDest.push(item);
                    }
                    newAsignaciones[dropTargetId!] = newDest;
                    if (newAsignaciones[originalId!].length === 0) delete newAsignaciones[originalId!];
                    return newAsignaciones;
                });
            }
        }
    };

    const handleAsignadaPillQuantityChange = (idPlanchador: string, idAsignadaPill: string, nuevaCantidadInput: number, idReferencia: string) => {
        const reference = referenciasAgrupadas.find(r => r.id_referencia === idReferencia);
        const asignacionActual = planchadoresAsignados[idPlanchador]?.find(a => a.id === idAsignadaPill);
        if (!reference || !asignacionActual) return;

        const cantidadAnterior = asignacionActual.cantidad;
        const idTallaOriginal = asignacionActual.id_original_talla;

        let assignedToOthers = 0;
        Object.keys(planchadoresAsignados).forEach(tId => {
            if (tId !== idPlanchador) {
                planchadoresAsignados[tId].forEach(pill => {
                    if (pill.id_original_talla === idTallaOriginal && pill.id_referencia === idReferencia) {
                        assignedToOthers += pill.cantidad;
                    }
                });
            }
        });

        const refOriginalTotal = reference.tallas_originales_global.get(idTallaOriginal) || 0;
        const maxAllowed = refOriginalTotal - assignedToOthers;
        const validatedQty = Math.max(0, Math.min(nuevaCantidadInput, maxAllowed));

        setPlanchadoresAsignados(prev => {
            const newAsignaciones = { ...prev };
            const current = newAsignaciones[idPlanchador];
            const pill = current.find(a => a.id === idAsignadaPill);
            if (pill) pill.cantidad = validatedQty;
            return newAsignaciones;
        });

        setReferenciasAgrupadas(prevRefs => prevRefs.map(ref => {
            if (ref.id_referencia === idReferencia) {
                const newTallasDisp = new Map(ref.tallas_disponibles);
                const tallaOriginal = newTallasDisp.get(idTallaOriginal);
                if (tallaOriginal) {
                    const diferencia = validatedQty - cantidadAnterior;
                    newTallasDisp.set(idTallaOriginal, { ...tallaOriginal, cantidad: tallaOriginal.cantidad - diferencia });
                }
                return { ...ref, tallas_disponibles: newTallasDisp };
            }
            return ref;
        }));
    };

    const removeAssignedPill = (idTallaOriginal: string, idAsignadaPill: string, cantidadDevuelta: number, idReferencia: string) => {
        setPlanchadoresAsignados(prev => {
            const newAsignaciones = { ...prev };
            for (const tId in newAsignaciones) {
                const index = newAsignaciones[tId].findIndex(pill => pill.id === idAsignadaPill);
                if (index !== -1) {
                    newAsignaciones[tId].splice(index, 1);
                    break;
                }
            }
            return newAsignaciones;
        });

        setReferenciasAgrupadas(prevRefs => prevRefs.map(ref => {
            if (ref.id_referencia === idReferencia) {
                const newTallasDisp = new Map(ref.tallas_disponibles);
                const tallaOriginal = newTallasDisp.get(idTallaOriginal);
                if (tallaOriginal) {
                    newTallasDisp.set(idTallaOriginal, { ...tallaOriginal, cantidad: tallaOriginal.cantidad + cantidadDevuelta });
                }
                return { ...ref, tallas_disponibles: newTallasDisp };
            }
            return ref;
        }));
    };

    const handleAddPlanchador = (planchador: Taller) => {
        if (!planchadoresAsignados[planchador.id]) {
            setPlanchadoresAsignados(prev => ({ ...prev, [planchador.id]: [] }));
        }
        setLastAddedPlanchadorId(planchador.id);
        setShowPlanchadorDropdown(false);
    };

    const handleRemovePlanchador = (idPlanchador: string) => {
        const asignaciones = planchadoresAsignados[idPlanchador];
        if (asignaciones && asignaciones.length > 0) {
            setReferenciasAgrupadas(prevRefs => {
                let newRefs = [...prevRefs];
                asignaciones.forEach(a => {
                    newRefs = newRefs.map(ref => {
                        if (ref.id_referencia === a.id_referencia) {
                            const newTallas = new Map(ref.tallas_disponibles);
                            const t = newTallas.get(a.id_original_talla);
                            if (t) newTallas.set(a.id_original_talla, { ...t, cantidad: t.cantidad + a.cantidad });
                            return { ...ref, tallas_disponibles: newTallas };
                        }
                        return ref;
                    });
                });
                return newRefs;
            });
        }

        setPlanchadoresAsignados(prev => {
            const { [idPlanchador]: removed, ...rest } = prev;
            return rest;
        });

        setLastAddedPlanchadorId(current => {
            if (current === idPlanchador) {
                const keys = Object.keys(planchadoresAsignados).filter(k => k !== idPlanchador);
                return keys.length > 0 ? keys[keys.length - 1] : null;
            }
            return current;
        });
    };

    const handleConfirmarAsignacion = async () => {
        if (authLoading || !user?.trabajador_id) {
            setError('Sesión de usuario no válida.');
            return;
        }

        setLoading(true);
        setError(null);

        const asignacionesParaEnviar: any[] = [];
        for (const id_planchador in planchadoresAsignados) {
            for (const item of planchadoresAsignados[id_planchador]) {
                if (item.cantidad > 0) {
                    asignacionesParaEnviar.push({
                        id_trabajador_asignado: id_planchador,
                        id_referencia: item.id_referencia,
                        id_talla: item.id_original_talla,
                        cantidad: item.cantidad
                    });
                }
            }
        }

        if (asignacionesParaEnviar.length === 0) {
            setError('Debe asignar al menos una prenda.');
            setLoading(false);
            return;
        }

        try {
            const { error: rpcError } = await supabase.rpc('asignar_planchado_desde_revision', {
                p_id_pedido: orderId,
                p_id_taller: id_taller_revision,
                p_id_usuario_accion: user.trabajador_id,
                p_asignaciones_json: asignacionesParaEnviar
            });

            if (rpcError) throw rpcError;

            onAsignacionComplete();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al confirmar la asignación.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !orderId) return null;

    const planchadoresNoAsignados = planchadoresBD.filter(t => !planchadoresAsignados[t.id]);
    const planchadoresFiltrados = planchadoresNoAsignados.filter(t =>
        t.nombre.toLowerCase().includes(planchadorSearchTerm.toLowerCase())
    );

    return (
        <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
                        <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asignar Planchado - Pedido #{orderNumber || orderId.substring(0, 8)}</h2>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
                        </div>

                        {loading && <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center z-20"><p>Cargando...</p></div>}

                        {error && !loading && (
                            <div className="absolute top-5 left-1/2 -translate-x-1/2 w-full max-w-md z-50 px-4">
                                <div className="flex items-center justify-center bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg shadow-lg" role="alert">
                                    <ExclamationTriangleIcon className="h-6 w-6 mr-3" />
                                    <span className="font-medium">{error}</span>
                                </div>
                            </div>
                        )}

                        {!loading && referenciasAgrupadas.length > 0 && (
                            <div className="flex-grow p-4 grid grid-cols-12 gap-2 overflow-x-hidden">
                                <div className="col-span-5 lg:col-span-4 flex flex-col gap-3 overflow-y-auto pr-2">
                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Referencias del Pedido</h3>
                                    {referenciasConEstado.map((ref) => (
                                        <ReferenceCard
                                            key={ref.id_referencia}
                                            reference={ref}
                                            isSelected={selectedReferenceId === ref.id_referencia}
                                            onClick={() => setSelectedReferenceId(ref.id_referencia)}
                                            isCompleted={ref.isCompleted}
                                            referenceColor={colorMap.get(ref.id_referencia) || '#ccc'}
                                        />
                                    ))}
                                </div>

                                <div className="col-span-7 lg:col-span-8 flex flex-col overflow-hidden">
                                    {selectedReference ? (
                                        <>
                                            <DroppableTallasDisponiblesZone>
                                                <h3 className="text-xl font-bold text-gray-800 dark:text-white">Tallas Disponibles para:</h3>
                                                <p className="text-lg text-gray-600 dark:text-gray-300">{selectedReference.nombre_referencia}</p>
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {Array.from(selectedReference.tallas_disponibles.values())
                                                        .filter(t => t.cantidad > 0)
                                                        .map(t =>
                                                            <DraggableTallaDisponible
                                                                key={`talla-${t.id}-${selectedReference.id_referencia}`}
                                                                talla={t}
                                                                idReferencia={selectedReference.id_referencia}
                                                                onClick={() => autoAssignTalla(t, selectedReference.id_referencia)}
                                                            />
                                                        )}
                                                </div>
                                            </DroppableTallasDisponiblesZone>

                                            <div className="flex-grow mt-4 flex flex-col overflow-y-auto pr-2">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Zonas de Asignación</h3>
                                                    <div className="relative" ref={dropdownRef}>
                                                        <button
                                                            onClick={() => setShowPlanchadorDropdown(prev => !prev)}
                                                            className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2"
                                                        >
                                                            <span>Añadir Planchador</span>
                                                            <ChevronDown size={16} className={`transition-transform duration-200 ${showPlanchadorDropdown ? 'rotate-180' : ''}`} />
                                                        </button>
                                                        {showPlanchadorDropdown && (
                                                            <div className="absolute z-10 top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-80 overflow-y-auto flex flex-col animate-fade-in-fast" onClick={e => e.stopPropagation()}>
                                                                <div className="p-2 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                                                                    <input
                                                                        type="text"
                                                                        value={planchadorSearchTerm}
                                                                        onChange={(e) => setPlanchadorSearchTerm(e.target.value)}
                                                                        className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                                                                        placeholder="Buscar planchador..."
                                                                        autoFocus
                                                                    />
                                                                </div>
                                                                <div className="py-1">
                                                                    {planchadoresFiltrados.length > 0 ? (
                                                                        planchadoresFiltrados.map(p => (
                                                                            <button key={p.id} onClick={() => handleAddPlanchador(p)} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-200 transition-colors">
                                                                                {p.nombre}
                                                                            </button>
                                                                        ))
                                                                    ) : (
                                                                        <div className="px-4 py-3 text-sm text-gray-400 text-center italic">
                                                                            {planchadoresNoAsignados.length === 0 ? "Todos los planchadores añadidos" : "No se encontraron resultados"}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    {Object.keys(planchadoresAsignados).map(id_p => {
                                                        const planchador = planchadoresBD.find(t => t.id === id_p);
                                                        if (!planchador) return null;
                                                        return (
                                                            <div key={id_p} className="p-3 bg-gray-100 dark:bg-gray-900/50 rounded-lg shadow-sm flex flex-col lg:flex-row lg:items-center gap-2 transition-all">
                                                                <div className="flex justify-between items-center w-full lg:w-auto lg:flex-shrink-0">
                                                                    <h4 className="font-semibold text-base text-gray-800 dark:text-gray-200">{planchador.nombre}:</h4>
                                                                    <button onClick={() => handleRemovePlanchador(id_p)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors lg:hidden">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                                <div className="w-full lg:flex-1">
                                                                    <DroppablePlanchadorZone id={id_p} items={planchadoresAsignados[id_p]} onQuantityChange={handleAsignadaPillQuantityChange} onRemovePill={removeAssignedPill} referenciasAgrupadas={referenciasAgrupadas} colorMap={colorMap} />
                                                                </div>
                                                                <button onClick={() => handleRemovePlanchador(id_p)} className="hidden lg:block text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-grow flex items-center justify-center">
                                            <p className="text-gray-500">Selecciona una referencia para ver las tallas.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end items-center rounded-b-2xl">
                            <div className="flex space-x-3">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cancelar</button>
                                <button
                                    type="button"
                                    onClick={() => setIsResumenModalOpen(true)}
                                    disabled={loading || authLoading || !isAsignacionCompleta}
                                    className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                    Revisar y Confirmar
                                </button>
                            </div>
                        </div>
                    </div>

                    <DragOverlay dropAnimation={null}>
                        {activeDragData?.type === 'TallaDisponible' && (
                            <div className="flex items-baseline px-3 py-1 bg-blue-500 text-white rounded-md text-sm font-medium shadow-lg cursor-grabbing whitespace-nowrap">
                                <span className="text-white">{activeDragData.talla.nombre} ({activeDragData.talla.cantidad})</span>
                            </div>
                        )}
                        {activeDragData?.type === 'TallaAsignada' && (() => {
                            const item = activeDragData.item;
                            const ref = referenciasAgrupadas.find(r => r.id_referencia === item.id_referencia);
                            const color = colorMap.get(item.id_referencia) || '#ccc';
                            return (
                                <AsignadaTallaPill
                                    item={item}
                                    onQuantityChange={() => { }}
                                    onRemove={() => { }}
                                    maxQuantity={999}
                                    referenceColor={color}
                                    referenceName={ref?.nombre_referencia || 'N/A'}
                                />
                            );
                        })()}
                    </DragOverlay>
                </DndContext>

                <ResumenAsignacionModal
                    isOpen={isResumenModalOpen}
                    onClose={() => setIsResumenModalOpen(false)}
                    onConfirm={handleConfirmarAsignacion}
                    asignaciones={planchadoresAsignados}
                    talleres={planchadoresBD}
                    referencias={referenciasAgrupadas}
                    loading={loading}
                />
            </div>
        </Portal>
    );
};

export default AsignarPlanchadoModal;

const DroppablePlanchadorZone = ({ id, items, onQuantityChange, onRemovePill, referenciasAgrupadas, colorMap }: {
    id: string,
    items: TallaAsignada[],
    onQuantityChange: (idPlanchador: string, idAsignadaPill: string, nuevaCantidad: number, idReferencia: string) => void,
    onRemovePill: (idTallaOriginal: string, idAsignadaPill: string, cantidadDevuelta: number, idReferencia: string) => void,
    referenciasAgrupadas: ReferenciaAgrupada[],
    colorMap: Map<string, string>
}) => {
    const { setNodeRef } = useDroppable({ id });

    return (
        <div ref={setNodeRef} className="flex-1 min-h-[40px] bg-gray-200 dark:bg-gray-700 rounded-md p-2 flex flex-wrap items-center gap-2">
            {items.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center flex-1">Arrastra una talla aquí</p>
            )}
            {items.map(item => {
                const ref = referenciasAgrupadas.find(r => r.id_referencia === item.id_referencia);
                const disp = ref?.tallas_disponibles.get(item.id_original_talla)?.cantidad || 0;
                return (
                    <AsignadaTallaPill
                        key={item.id}
                        item={item}
                        onQuantityChange={(newQty) => onQuantityChange(id, item.id, newQty, item.id_referencia)}
                        onRemove={(idToRemove) => onRemovePill(item.id_original_talla, idToRemove, item.cantidad, item.id_referencia)}
                        maxQuantity={item.cantidad + disp}
                        referenceColor={colorMap.get(item.id_referencia) || '#64748b'}
                        referenceName={ref?.nombre_referencia || 'N/A'}
                    />
                )
            })}
        </div>
    );
};

const DroppableTallasDisponiblesZone = ({ children }: { children: React.ReactNode }) => {
    const { setNodeRef } = useDroppable({ id: 'disponible-zone' });
    return <div ref={setNodeRef}>{children}</div>;
};
