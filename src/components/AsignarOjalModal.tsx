import TallaCantidadBadge from './TallaCantidadBadge';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Portal from './Portal';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Trash2, ChevronDown } from 'lucide-react'; // Importar el icono de papelera
import { supabase } from '../lib/supabase';
import { DndContext, closestCenter, useDraggable, useDroppable, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Active, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { nanoid } from 'nanoid';
import ReferenceCard from './ReferenceCard';
import ResumenAsignacionModal from './ResumenAsignacionModal';
import { Pedido } from '../types';
import { useAuth } from '../auth/AuthProvider';

import { Taller } from '../types';

interface TallaDisponible {
    id: string;
    nombre: string;
    cantidad: number;
    originalIds?: string[]; // Para guardar los IDs de las WOs que estamos quemando
}

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

interface ReferenciaAgrupada {
    id_referencia: string;
    nombre_referencia: string;
    imagen_url: string | null;
    tallas_disponibles: Map<string, TallaDisponible>;
    tallas_originales_global: Map<string, number>;
}

interface AsignarOjalModalProps {
    isOpen: boolean;
    onClose: () => void;
    pedido: Pedido | null;
    onAsignacionCompleta: () => void;
    labor?: string; // Nueva prop opcional
    etapaDestinoId?: string | null; // Nueva prop opcional
    approvedWorkOrders?: any[]; // Prendas que vienen filtradas de una revisión
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

interface AsignacionParaEnvio {
    id_taller: string;
    id_referencia: string;
    id_talla: string;
    cantidad: number;
}

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
                    className="px-1 text-xs bg-transparent dark:bg-transparent" // Usar fondo transparente y mantener el estilo de texto original
                />
            )}
        </div>
    );
};

// Main Modal Component
const AsignarOjalModal: React.FC<AsignarOjalModalProps> = ({ isOpen, onClose, pedido, onAsignacionCompleta, labor = 'Ojal y botón', etapaDestinoId = null, approvedWorkOrders }) => {
    const { user } = useAuth();
    const [referenciasAgrupadas, setReferenciasAgrupadas] = useState<ReferenciaAgrupada[]>([]);
    const [talleresBD, setTalleresBD] = useState<Taller[]>([]);
    const [talleresAsignados, setTalleresAsignados] = useState<AsignacionesTaller>({});
    const [activeDraggableItem, setActiveDraggableItem] = useState<Active | null>(null);
    const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
    const [showTallerDropdown, setShowTallerDropdown] = useState(false);
    const [lastAddedTallerId, setLastAddedTallerId] = useState<string | null>(null);
    const [isResumenModalOpen, setIsResumenModalOpen] = useState(false);
    const [tallerSearchTerm, setTallerSearchTerm] = useState('');

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
        Object.values(talleresAsignados).forEach(asignaciones => {
            asignaciones.forEach(item => { totalAsignado += item.cantidad; });
        });
        return totalAsignado === totalPedidoOriginal;
    }, [talleresAsignados, referenciasAgrupadas]);

    // Initial Data Load
    useEffect(() => {
        if (isOpen && pedido) {
            setIsResumenModalOpen(false); // Seguridad: resetear siempre al abrir
            const fetchInitialData = async () => {
                setLoading(true);
                setError(null);
                try {
                    // 1. Intentar obtener el nombre oficial de la labor desde la tabla etapas usando el código 'OJAL_BOTON'
                    let laborNombreReal = 'Ojal y botón'; // Fallback por defecto
                    try {
                        const { data: etapaOjalData } = await supabase
                            .from('etapas')
                            .select('nombre')
                            .eq('codigo', 'OJAL_BOTON')
                            .maybeSingle(); // Usar maybeSingle para evitar errores si no existe

                        if (etapaOjalData?.nombre) {
                            laborNombreReal = etapaOjalData.nombre;
                        }
                    } catch (e) {
                        console.error("Error buscando etapa por código:", e);
                    }

                    let detallesData: any[] = [];
                    if (approvedWorkOrders && approvedWorkOrders.length > 0) {
                        detallesData = approvedWorkOrders.map(g => ({
                            id_referencia: g.id_referencia,
                            nombre_referencia: g.nombre_referencia,
                            imagen_url: g.imagen_url,
                            id_talla: g.id_talla,
                            nombre_talla: g.nombre_talla,
                            cantidad: g.cantidad_aprobada,
                            id_original: (g as any).id_original // Capturamos el ID original
                        }));
                    } else {
                        let query;
                        query = supabase.rpc('obtener_cantidades_disponibles_para_etapa', {
                            p_id_pedido: pedido.id,
                            p_nombre_etapa: laborNombreReal
                        });
                        const { data, error: detallesError } = await query;
                        if (detallesError) throw detallesError;
                        detallesData = data || [];
                    }

                    if (!detallesData || detallesData.length === 0) {
                        throw new Error(`Este pedido no tiene piezas disponibles para asignar a la etapa de ${laborNombreReal}.`);
                    }

                    const agrupadas = new Map<string, ReferenciaAgrupada>();
                    for (const d of detallesData) {
                        if (!agrupadas.has(d.id_referencia)) {
                            let publicURL = d.imagen_url;
                            if (publicURL && !publicURL.startsWith('http')) {
                                const { data } = supabase.storage.from('imagenes').getPublicUrl(publicURL);
                                publicURL = data.publicUrl;
                            }
                            agrupadas.set(d.id_referencia, {
                                id_referencia: d.id_referencia,
                                nombre_referencia: d.nombre_referencia,
                                imagen_url: publicURL,
                                tallas_disponibles: new Map(),
                                tallas_originales_global: new Map(),
                            });
                        }
                        const ref = agrupadas.get(d.id_referencia)!;

                        // Sumar si la talla ya existe, en lugar de sobreescribir
                        const existingTalla = ref.tallas_disponibles.get(d.id_talla);
                        const currentQty = existingTalla ? existingTalla.cantidad : 0;
                        const currentIds = existingTalla?.originalIds || [];
                        const newQty = currentQty + d.cantidad;

                        // Si el dato trae un id_original, lo acumulamos
                        const newIds = d.id_original ? [...currentIds, d.id_original] : currentIds;

                        ref.tallas_disponibles.set(d.id_talla, {
                            id: d.id_talla,
                            nombre: d.nombre_talla,
                            cantidad: newQty,
                            originalIds: newIds
                        });

                        ref.tallas_originales_global.set(d.id_talla, newQty);
                    }

                    const referenciasArray = Array.from(agrupadas.values());
                    setReferenciasAgrupadas(referenciasArray);
                    if (referenciasArray.length > 0) setSelectedReferenceId(referenciasArray[0].id_referencia);

                    const { data: todosLosTalleres, error: talleresError } = await supabase
                        .from('talleres')
                        .select('id, nombre, labor')
                        .eq('esta_activo', true)
                        .order('nombre', { ascending: true });

                    if (talleresError) throw talleresError;

                    // Filtrar en el cliente para ser más flexibles con los nombres
                    const talleresFiltradosPorLabor = (todosLosTalleres || []).filter(t => {
                        if (!t.labor) return false;

                        // Función interna para remover tildes y normalizar
                        const normalizar = (str: string) =>
                            str.toLowerCase()
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .trim();

                        const laborTaller = normalizar(t.labor);
                        const laborEtapa = normalizar(laborNombreReal);

                        return laborTaller.includes('ojal') ||
                            laborTaller === laborEtapa;
                    });

                    setTalleresBD(talleresFiltradosPorLabor);
                    setTalleresAsignados({});
                    setShowTallerDropdown(false);
                    setLastAddedTallerId(null);
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Error al cargar los datos.');
                } finally {
                    setLoading(false);
                }
            };
            fetchInitialData();
        }
    }, [isOpen, pedido, labor, approvedWorkOrders]);

    // Effect for click outside dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && showTallerDropdown) {
                setShowTallerDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownRef, showTallerDropdown]);

    // Reset search on close
    useEffect(() => {
        if (!showTallerDropdown) {
            setTallerSearchTerm('');
        }
    }, [showTallerDropdown]);

    // Auto-assignment by click
    const autoAssignTalla = (talla: TallaDisponible, idReferencia: string) => {
        if (!lastAddedTallerId) {
            setError("Primero debe seleccionar un taller.");
            setTimeout(() => setError(null), 3000);
            return;
        }
        if (talla.cantidad <= 0) return;

        const targetTallerId = lastAddedTallerId;

        setTalleresAsignados(prev => {
            const newAsignaciones = { ...prev };
            if (!newAsignaciones[targetTallerId]) newAsignaciones[targetTallerId] = [];

            let tallerActual = [...newAsignaciones[targetTallerId]];
            const existente = tallerActual.find(t => t.id_original_talla === talla.id && t.id_referencia === idReferencia);
            const cantidadToAdd = talla.cantidad;

            if (existente) {
                tallerActual = tallerActual.map(pill =>
                    pill.id === existente.id
                        ? { ...pill, cantidad: pill.cantidad + cantidadToAdd }
                        : pill
                );
            } else {
                tallerActual.push({
                    id: nanoid(),
                    id_original_talla: talla.id,
                    nombre_talla: talla.nombre,
                    cantidad: cantidadToAdd,
                    id_referencia: idReferencia,
                });
            }

            newAsignaciones[targetTallerId] = tallerActual;
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

    // Drag and Drop Handlers
    const handleDragStart = (event: DragStartEvent) => {
        setActiveDraggableItem(event.active);
        setError(null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDraggableItem(null);
        const { active, over } = event;
        const draggedItem = active.data.current as ActiveDragData | undefined;

        if (!draggedItem) return;

        // Determine the drop target ID, default to null if no over element
        const dropTargetId = over ? over.id.toString() : null;
        const isTargetAWorkshop = dropTargetId ? talleresBD.some(t => t.id === dropTargetId) : false;

        // Scenario 1: Dragging a TallaDisponible
        if (draggedItem.type === 'TallaDisponible') {
            const { talla: tallaArrastrada, idReferencia } = draggedItem;

            // Only allow dropping on a workshop and if quantity is greater than 0
            if (isTargetAWorkshop && tallaArrastrada.cantidad > 0) {
                setTalleresAsignados(prev => {
                    const newAsignaciones = { ...prev };
                    if (!newAsignaciones[dropTargetId!]) newAsignaciones[dropTargetId!] = [];

                    let tallerActual = newAsignaciones[dropTargetId!];
                    const existente = tallerActual.find(t => t.id_original_talla === tallaArrastrada.id && t.id_referencia === idReferencia);
                    const nuevaCantidad = (existente ? existente.cantidad : 0) + tallaArrastrada.cantidad;

                    // Remove existing pill if it exists, to re-add with updated quantity
                    tallerActual = tallerActual.filter(t => !(t.id_original_talla === tallaArrastrada.id && t.id_referencia === idReferencia));

                    tallerActual.push({
                        id: nanoid(), // New ID for the assigned pill
                        id_original_talla: tallaArrastrada.id,
                        nombre_talla: tallaArrastrada.nombre,
                        cantidad: nuevaCantidad,
                        id_referencia: idReferencia,
                    });

                    newAsignaciones[dropTargetId!] = tallerActual;
                    return newAsignaciones;
                });

                // Update available quantities to 0 for the dragged talla
                setReferenciasAgrupadas(prevRefs => prevRefs.map(ref => {
                    if (ref.id_referencia === idReferencia) {
                        const newTallasDisp = new Map(ref.tallas_disponibles);
                        const currentTalla = newTallasDisp.get(tallaArrastrada.id);
                        if (currentTalla) {
                            newTallasDisp.set(tallaArrastrada.id, { ...currentTalla, cantidad: 0 });
                        }
                        return { ...ref, tallas_disponibles: newTallasDisp };
                    }
                    return ref;
                }));
            }
        }
        // Scenario 2: Dragging a TallaAsignada
        else if (draggedItem.type === 'TallaAsignada') {
            const { item: tallaAsignada } = draggedItem;
            // Find the original workshop this pill came from
            let originalTallerId: string | null = null;
            for (const tId in talleresAsignados) {
                if (talleresAsignados[tId].some(pill => pill.id === tallaAsignada.id)) {
                    originalTallerId = tId;
                    break;
                }
            }

            if (!originalTallerId) return; // Should not happen if data is consistent

            // Dropped on "disponible-zone" or outside any valid droppable (unassign)
            if (dropTargetId === 'disponible-zone' || !over) {
                removeAssignedPill(tallaAsignada.id_original_talla, tallaAsignada.id, tallaAsignada.cantidad, tallaAsignada.id_referencia);
            }
            // Dropped on another workshop
            else if (isTargetAWorkshop && dropTargetId !== originalTallerId) {
                setTalleresAsignados(prev => {
                    const newAsignaciones = { ...prev };

                    // Remove from original workshop
                    newAsignaciones[originalTallerId!] = newAsignaciones[originalTallerId!].filter(pill => pill.id !== tallaAsignada.id);

                    // Add to new workshop
                    // Ensure new array instance for the destination workshop
                    let newTallerDestino = newAsignaciones[dropTargetId!] ? [...newAsignaciones[dropTargetId!]] : [];

                    const existente = newTallerDestino.find(t => t.id_original_talla === tallaAsignada.id_original_talla && t.id_referencia === tallaAsignada.id_referencia);

                    if (existente) {
                        // Create a new object for the existing pill with updated quantity
                        const updatedExistente = { ...existente, cantidad: existente.cantidad + tallaAsignada.cantidad };
                        // Replace the old existing pill with the updated one in the newTallerDestino array
                        newTallerDestino = newTallerDestino.map(pill =>
                            pill.id === existente.id ? updatedExistente : pill
                        );
                    } else {
                        // Add the new pill to the newTallerDestino array
                        newTallerDestino.push(tallaAsignada);
                    }
                    newAsignaciones[dropTargetId!] = newTallerDestino; // Assign the new array instance

                    // Clean up original workshop if it becomes empty
                    if (newAsignaciones[originalTallerId!].length === 0) {
                        delete newAsignaciones[originalTallerId!];
                    }

                    return newAsignaciones;
                });
            }
            // Dropped on its own workshop or an invalid target (do nothing)
            // Implicitly handled by not having other conditions
        }
    };

    // Assigned Pill Logic
    const handleAsignadaPillQuantityChange = (idTaller: string, idAsignadaPill: string, nuevaCantidadInput: number, idReferencia: string) => {
        let cantidadAnterior = 0;
        let idTallaOriginal = '';

        const reference = referenciasAgrupadas.find(r => r.id_referencia === idReferencia);
        const asignacionActual = talleresAsignados[idTaller]?.find(a => a.id === idAsignadaPill);

        if (!reference || !asignacionActual) return;

        cantidadAnterior = asignacionActual.cantidad;
        idTallaOriginal = asignacionActual.id_original_talla;

        let assignedToOthers = 0;
        Object.keys(talleresAsignados).forEach(tId => {
            if (tId !== idTaller) {
                talleresAsignados[tId].forEach(assignedPill => {
                    if (assignedPill.id_original_talla === idTallaOriginal && assignedPill.id_referencia === idReferencia) {
                        assignedToOthers += assignedPill.cantidad;
                    }
                });
            }
        });

        const refOriginalTotal = reference.tallas_originales_global.get(idTallaOriginal) || 0;
        const maxAllowedForThisPill = refOriginalTotal - assignedToOthers;
        const validatedNewQuantity = Math.max(0, Math.min(nuevaCantidadInput, maxAllowedForThisPill));

        setTalleresAsignados(prev => {
            const newAsignaciones = { ...prev };
            const tallerActual = newAsignaciones[idTaller];
            const pillToUpdate = tallerActual.find(a => a.id === idAsignadaPill);
            if (pillToUpdate) {
                pillToUpdate.cantidad = validatedNewQuantity;
            }
            return newAsignaciones;
        });

        setReferenciasAgrupadas(prevRefs => prevRefs.map(ref => {
            if (ref.id_referencia === idReferencia) {
                const newTallasDisp = new Map(ref.tallas_disponibles);
                const tallaOriginal = newTallasDisp.get(idTallaOriginal);
                if (tallaOriginal) {
                    const diferencia = validatedNewQuantity - cantidadAnterior;
                    newTallasDisp.set(idTallaOriginal, { ...tallaOriginal, cantidad: tallaOriginal.cantidad - diferencia });
                }
                return { ...ref, tallas_disponibles: newTallasDisp };
            }
            return ref;
        }));
    };

    const removeAssignedPill = (idTallaOriginal: string, idAsignadaPill: string, cantidadDevuelta: number, idReferencia: string) => {
        setTalleresAsignados(prev => {
            const newAsignaciones = { ...prev };
            for (const tId in newAsignaciones) {
                const index = newAsignaciones[tId].findIndex(pill => pill.id === idAsignadaPill);
                if (index !== -1) {
                    newAsignaciones[tId].splice(index, 1);
                    if (newAsignaciones[tId].length === 0) {
                        // Optionally decide if you want to remove the workshop if it's empty
                    }
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

    // Workshop Handlers
    const handleAddTaller = (taller: Taller) => {
        if (!talleresAsignados[taller.id]) {
            setTalleresAsignados(prev => ({
                ...prev,
                [taller.id]: []
            }));
        }
        setLastAddedTallerId(taller.id); // Set this as the last added
        setShowTallerDropdown(false);
    };

    const handleRemoveTaller = (idTaller: string) => {
        const tallerAsignaciones = talleresAsignados[idTaller];

        if (tallerAsignaciones && tallerAsignaciones.length > 0) {
            setReferenciasAgrupadas(prevRefs => {
                let newRefs = [...prevRefs];
                tallerAsignaciones.forEach(asignacion => {
                    newRefs = newRefs.map(ref => {
                        if (ref.id_referencia === asignacion.id_referencia) {
                            const newTallasDisp = new Map(ref.tallas_disponibles);
                            const tallaOriginal = newTallasDisp.get(asignacion.id_original_talla);
                            if (tallaOriginal) {
                                newTallasDisp.set(asignacion.id_original_talla, {
                                    ...tallaOriginal,
                                    cantidad: tallaOriginal.cantidad + asignacion.cantidad
                                });
                            }
                            return { ...ref, tallas_disponibles: newTallasDisp };
                        }
                        return ref;
                    });
                });
                return newRefs;
            });
        }

        setTalleresAsignados(prev => {
            const newAsignaciones = { ...prev };
            delete newAsignaciones[idTaller];

            // Update lastAddedTallerId if the removed one was the last
            setLastAddedTallerId(currentId => {
                if (currentId === idTaller) {
                    const remainingTallerIds = Object.keys(newAsignaciones);
                    if (remainingTallerIds.length > 0) {
                        return remainingTallerIds[remainingTallerIds.length - 1];
                    }
                    return null; // No workshops left
                }
                return currentId; // No change
            });

            return newAsignaciones;
        });
    };

    // Final Confirmation Logic
    const handleConfirmarAsignacion = async () => {
        if (!isAsignacionCompleta || !user || !user.trabajador_id) { // Validar que user.trabajador_id esté disponible
            setError('Usuario no autenticado o ID de trabajador no disponible para realizar la acción.');
            return;
        }

        setLoading(true);
        setError(null);

        const asignacionesParaEnviar: AsignacionParaEnvio[] = [];
        Object.keys(talleresAsignados).forEach(id_taller => {
            talleresAsignados[id_taller].forEach(item => {
                if (item.cantidad > 0) {
                    asignacionesParaEnviar.push({
                        id_taller: id_taller,
                        id_referencia: item.id_referencia,
                        id_talla: item.id_original_talla,
                        cantidad: item.cantidad,
                    });
                }
            });
        });

        try {
            let vEtapaDestinoId = etapaDestinoId;
            if (!vEtapaDestinoId) {
                const { data: etapaOjal } = await supabase.from('etapas').select('id').eq('codigo', 'OJAL_BOTON').single();
                vEtapaDestinoId = etapaOjal?.id;
            }

            const { error: rpcError } = await supabase.rpc('crear_ordenes_de_trabajo', {
                p_id_pedido: pedido!.id,
                p_asignaciones: asignacionesParaEnviar,
                p_id_usuario_autenticacion: user.trabajador_id,
                p_id_trabajador_accion: user.trabajador_id,
                p_id_etapa: vEtapaDestinoId // Pasamos la etapa destino
            });
            if (rpcError) {
                console.error('Error RPC al crear órdenes de trabajo:', rpcError);
                throw rpcError;
            }

            // --- LOGICA DE TU NUEVA COLUMNA ---
            // Obtenemos todos los IDs originales que hemos "consumido" en esta asignación
            const allOriginalIds: string[] = [];
            referenciasAgrupadas.forEach(ref => {
                ref.tallas_disponibles.forEach(talla => {
                    if (talla.originalIds) {
                        allOriginalIds.push(...talla.originalIds);
                    }
                });
            });

            if (allOriginalIds.length > 0) {
                const { error: updateError } = await supabase
                    .from('ordenes_de_trabajo')
                    .update({ asignado_sig_etapa: true })
                    .in('id', allOriginalIds);

                if (updateError) console.error("Error al marcar como asignado:", updateError);
            }
            // ---------------------------------

            onAsignacionCompleta();
            onClose();
        } catch (err) {
            const message = err instanceof Error ? `Error al confirmar la asignación: ${err.message}` : 'Error al confirmar la asignación.';
            console.error('Error general durante la asignación:', err); // DEBUGGING
            setError(message);
        } finally {
            setLoading(false);
            setIsResumenModalOpen(false);
        }
    };

    // --- Render ---
    if (!isOpen || !pedido) return null;

    const talleresNoAsignados = talleresBD.filter(t => !talleresAsignados[t.id]);
    const talleresFiltrados = talleresNoAsignados.filter(t =>
        t.nombre.toLowerCase().includes(tallerSearchTerm.toLowerCase())
    );

    return (
        <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
                <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    collisionDetection={closestCenter}
                >
                    <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
                        <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asignación Exclusiva: Ojal y Botón - Pedido #{pedido.numero_pedido}</h2>
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

                        {!loading && referenciasAgrupadas.length === 0 && !error && (
                            <div className="flex-grow flex items-center justify-center"><p className="text-gray-500">Este pedido no tiene referencias para asignar.</p></div>
                        )}

                        {!loading && referenciasAgrupadas.length > 0 && (
                            <div className="flex-grow p-4 grid grid-cols-12 gap-2 overflow-x-hidden">

                                <div className="col-span-5 lg:col-span-4 flex flex-col gap-3 overflow-y-auto pr-2">
                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Referencias del Pedido</h3>
                                    {referenciasConEstado.map((referencia) => (
                                        <ReferenceCard
                                            key={referencia.id_referencia}
                                            reference={referencia}
                                            isSelected={selectedReferenceId === referencia.id_referencia}
                                            onClick={() => setSelectedReferenceId(referencia.id_referencia)}
                                            isCompleted={referencia.isCompleted}
                                            referenceColor={colorMap.get(referencia.id_referencia) || '#ccc'}
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
                                                    {Array.from(selectedReference.tallas_disponibles.values()).map(talla =>
                                                        <DraggableTallaDisponible
                                                            key={talla.id}
                                                            talla={talla}
                                                            idReferencia={selectedReference.id_referencia}
                                                            onClick={() => autoAssignTalla(talla, selectedReference.id_referencia)}
                                                        />
                                                    )}
                                                </div>
                                            </DroppableTallasDisponiblesZone>

                                            <div className="flex-grow mt-4 flex flex-col overflow-y-auto pr-2">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Zonas de Asignación</h3>
                                                    <div className="relative" ref={dropdownRef}> {/* Attach ref here */}
                                                        <button
                                                            onClick={() => setShowTallerDropdown(prev => !prev)}
                                                            className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2"
                                                        >
                                                            <span>Añadir Taller</span>
                                                            <ChevronDown size={16} className={`transition-transform duration-200 ${showTallerDropdown ? 'rotate-180' : ''}`} />
                                                        </button>
                                                        {showTallerDropdown && (
                                                            <div
                                                                className="absolute z-10 top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-80 overflow-y-auto flex flex-col animate-fade-in-fast"
                                                                onClick={e => e.stopPropagation()} // Stop propagation here
                                                            >
                                                                <div className="p-2 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                                                                    <input
                                                                        type="text"
                                                                        value={tallerSearchTerm}
                                                                        onChange={(e) => setTallerSearchTerm(e.target.value)}
                                                                        className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                                                                        placeholder="Buscar taller..."
                                                                        autoFocus
                                                                    />
                                                                </div>
                                                                <div className="py-1">
                                                                    {talleresFiltrados.length > 0 ? (
                                                                        talleresFiltrados.map(taller => (
                                                                            <button
                                                                                key={taller.id}
                                                                                onClick={() => handleAddTaller(taller)}
                                                                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-200 transition-colors"
                                                                            >
                                                                                {taller.nombre}
                                                                            </button>
                                                                        ))
                                                                    ) : (
                                                                        <div className="px-4 py-3 text-sm text-gray-400 text-center italic">
                                                                            {talleresNoAsignados.length === 0 ? "Todos los talleres añadidos" : "No se encontraron resultados"}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    {Object.keys(talleresAsignados).map(id_taller => {
                                                        const taller = talleresBD.find(t => t.id === id_taller);
                                                        if (!taller) return null;

                                                        return (
                                                            <div key={id_taller} className="p-3 bg-gray-100 dark:bg-gray-900/50 rounded-lg shadow-sm flex flex-col lg:flex-row lg:items-center gap-2 transition-all">
                                                                {/* --- Wrapper for Mobile View Title/Button & Desktop View Title --- */}
                                                                <div className="flex justify-between items-center w-full lg:w-auto lg:flex-shrink-0">
                                                                    <h4 className="font-semibold text-base text-gray-800 dark:text-gray-200">{taller.nombre}:</h4>
                                                                    {/* Mobile-only Trash Button */}
                                                                    <button
                                                                        onClick={() => handleRemoveTaller(id_taller)}
                                                                        className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors lg:hidden"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>

                                                                {/* --- Drop Zone --- */}
                                                                <div className="w-full lg:flex-1">
                                                                    <DroppableTallerZone id={id_taller} items={talleresAsignados[id_taller]} onQuantityChange={handleAsignadaPillQuantityChange} onRemovePill={removeAssignedPill} referenciasAgrupadas={referenciasAgrupadas} colorMap={colorMap} />
                                                                </div>

                                                                {/* --- Desktop-only Trash Button --- */}
                                                                <button
                                                                    onClick={() => handleRemoveTaller(id_taller)}
                                                                    className="hidden lg:block text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                                                                >
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
                                    disabled={loading || !isAsignacionCompleta}
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
                            const referenceColor = colorMap.get(item.id_referencia) || '#64748b';
                            const referenceName = ref?.nombre_referencia || 'N/A';
                            return (
                                <AsignadaTallaPill
                                    item={item}
                                    onQuantityChange={() => { }}
                                    onRemove={() => { }}
                                    maxQuantity={999}
                                    referenceColor={referenceColor}
                                    referenceName={referenceName}
                                />
                            );
                        })()}
                    </DragOverlay>

                </DndContext>

                <ResumenAsignacionModal
                    isOpen={isResumenModalOpen}
                    onClose={() => setIsResumenModalOpen(false)}
                    onConfirm={handleConfirmarAsignacion}
                    asignaciones={talleresAsignados}
                    talleres={talleresBD}
                    referencias={referenciasAgrupadas}
                    loading={loading}
                />

            </div>
        </Portal>
    );
};

export default AsignarOjalModal;

const DroppableTallerZone = ({ id, items, onQuantityChange, onRemovePill, referenciasAgrupadas, colorMap }: {
    id: string,
    items: TallaAsignada[],
    onQuantityChange: (idTaller: string, idAsignadaPill: string, nuevaCantidad: number, idReferencia: string) => void,
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
                const cantidadDisponible = ref?.tallas_disponibles.get(item.id_original_talla)?.cantidad || 0;
                const maxQuantity = item.cantidad + cantidadDisponible;
                const referenceColor = colorMap.get(item.id_referencia) || '#64748b';
                const referenceName = ref?.nombre_referencia || 'N/A';

                return (
                    <AsignadaTallaPill
                        key={item.id}
                        item={item}
                        onQuantityChange={(newQty) => onQuantityChange(id, item.id, newQty, item.id_referencia)}
                        onRemove={(idToRemove) => onRemovePill(item.id_original_talla, idToRemove, item.cantidad, item.id_referencia)}
                        maxQuantity={maxQuantity}
                        referenceColor={referenceColor}
                        referenceName={referenceName}
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
