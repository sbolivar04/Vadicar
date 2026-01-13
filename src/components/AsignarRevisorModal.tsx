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
import { WorkOrderForReview, Taller } from '../types';
import { useAuth } from '../auth/AuthProvider';

interface TallaDisponible {
  id: string;
  nombre: string;
  cantidad: number;
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

interface AsignarRevisorModalProps { // Renombrado de AsignarProduccionModalModalProps
  isOpen: boolean;
  onClose: () => void;
  orderId: string; // Se añade orderId
  onRevisionComplete: () => void; // Renombrado de onAsignacionCompleta
  id_taller_revision: string; // Añadido para saber a qué taller se refiere la revisión
  workOrders: WorkOrderForReview[]; // Se añade workOrders
  orderNumber?: number; // Se añade el número legible del pedido
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
          className="px-1 text-xs bg-transparent dark:bg-transparent" // Usar fondo transparente y mantener el estilo de texto original
        />
      )}
    </div>
  );
};

// Main Modal Component
const AsignarRevisorModal: React.FC<AsignarRevisorModalProps> = ({ isOpen, onClose, orderId, orderNumber, id_taller_revision, workOrders, onRevisionComplete }) => {
  const { user, loading: authLoading } = useAuth(); // Usar useAuth para obtener el usuario y el estado de carga
  const [referenciasAgrupadas, setReferenciasAgrupadas] = useState<ReferenciaAgrupada[]>([]);
  const [revisoresBD, setRevisoresBD] = useState<Taller[]>([]); // Renombrado de talleresBD, usará la interfaz Taller para compatibilidad de UI
  const [revisoresAsignados, setRevisoresAsignados] = useState<AsignacionesTaller>({}); // Renombrado de talleresAsignados
  const [activeDraggableItem, setActiveDraggableItem] = useState<Active | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const [showRevisorDropdown, setShowRevisorDropdown] = useState(false); // Renombrado de showTallerDropdown
  const [lastAddedRevisorId, setLastAddedRevisorId] = useState<string | null>(null); // Renombrado de lastAddedTallerId
  const [isResumenModalOpen, setIsResumenModalOpen] = useState(false);
  const [revisorSearchTerm, setRevisorSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref for click outside

  const activeDragData = useMemo(() => activeDraggableItem?.data.current as ActiveDragData | undefined, [activeDraggableItem]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    const colorPalette = [
      '#ef4444', // red-500
      '#eab308', // yellow-500
      '#22c55e', // green-500
      '#3b82f6', // blue-500
      '#f97316', // orange-500
      '#8b5cf6', // violet-500
      '#ec4899', // pink-500
      '#6366f1', // indigo-500
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
    if (referenciasAgrupadas.length === 0) {
      return false;
    }

    let totalPedidoOriginal = 0;
    referenciasAgrupadas.forEach(ref => {
      ref.tallas_originales_global.forEach(cantidad => {
        totalPedidoOriginal += cantidad;
      });
    });

    if (totalPedidoOriginal === 0) {
      return false; // No hay nada que asignar
    }

    let totalAsignado = 0;
    Object.values(revisoresAsignados).forEach(asignaciones => { // Usa revisoresAsignados
      asignaciones.forEach(item => {
        totalAsignado += item.cantidad;
      });
    });

    return totalAsignado === totalPedidoOriginal;
  }, [revisoresAsignados, referenciasAgrupadas]); // Usa revisoresAsignados

  // Initial Data Load
  useEffect(() => {
    if (isOpen && orderId && id_taller_revision && workOrders) { // Adaptar dependencias
      const fetchInitialData = async () => {
        setLoading(true);
        setError(null);
        try {
          // Construir referenciasAgrupadas a partir de workOrders (que ya vienen filtradas por el WorkshopStageModal)
          const agrupadas = new Map<string, ReferenciaAgrupada>();
          // No necesitamos filtrar aquí, workOrders ya debería venir filtrado por el WorkshopStageModal
          const workOrdersRecibidas = workOrders;

          if (workOrdersRecibidas.length === 0) {
            setError("No hay órdenes de trabajo pendientes de asignación a revisores para este taller."); // Mensaje adaptado
            setReferenciasAgrupadas([]);
            setLoading(false);
            return;
          }

          for (const wo of workOrdersRecibidas) {
            if (!wo || !wo.id_referencia || !wo.id_talla || !wo.id_talla.id) {
              console.warn("Se omitió una orden de trabajo por tener datos corruptos o incompletos:", wo);
              continue;
            }

            const id_referencia = wo.id_referencia.id;
            const id_talla = wo.id_talla.id;

            if (!agrupadas.has(id_referencia)) {
              let publicURL = wo.id_referencia.imagen_url;
              if (publicURL && !publicURL.startsWith('http')) {
                const { data } = supabase.storage.from('imagenes').getPublicUrl(publicURL);
                publicURL = data.publicUrl;
              }
              agrupadas.set(id_referencia, {
                id_referencia: id_referencia,
                nombre_referencia: wo.id_referencia.nombre,
                imagen_url: publicURL,
                tallas_disponibles: new Map(),
                tallas_originales_global: new Map(),
              });
            }
            const ref = agrupadas.get(id_referencia)!;
            // Sumar cantidades si la misma talla aparece en varias workOrders para la misma referencia
            const currentCantidad = ref.tallas_disponibles.get(id_talla)?.cantidad || 0;
            ref.tallas_disponibles.set(id_talla, { id: id_talla, nombre: wo.id_talla.nombre, cantidad: currentCantidad + wo.cantidad_asignada });
            ref.tallas_originales_global.set(id_talla, currentCantidad + wo.cantidad_asignada); // También actualizar el total original
          }

          const referenciasArray = Array.from(agrupadas.values());
          setReferenciasAgrupadas(referenciasArray);

          if (referenciasArray.length > 0) {
            setSelectedReferenceId(referenciasArray[0].id_referencia);
          }

          // Fetch trabajadores activos
          const { data: trabajadoresData, error: trabajadoresError } = await supabase
            .from('trabajadores')
            .select('id, nombre_trabajador, cargos!id_cargo(nombre)')
            .eq('esta_activo', true);

          if (trabajadoresError) throw trabajadoresError;

          // Filtro estricto: Solo Recepción y Revisión
          const filtered = (trabajadoresData || []).filter(t => {
            const cargo = (t as any).cargos?.nombre;
            return cargo === 'Recepción' || cargo === 'Revisión';
          });

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

          setRevisoresBD(sorted);

          setRevisoresAsignados({}); // Usar setRevisoresAsignados
          setShowRevisorDropdown(false); // Usar showRevisorDropdown
          setLastAddedRevisorId(null); // Usar lastAddedRevisorId

        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar los datos.';
          setError(message);
        } finally {
          setLoading(false);
        }
      };
      fetchInitialData();
    }
  }, [isOpen, orderId, id_taller_revision, workOrders]);

  // Effect for click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && showRevisorDropdown) {
        setShowRevisorDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef, showRevisorDropdown]);

  // Reset search on close
  useEffect(() => {
    if (!showRevisorDropdown) {
      setRevisorSearchTerm('');
    }
  }, [showRevisorDropdown]);

  // Auto-assignment by click
  const autoAssignTalla = (talla: TallaDisponible, idReferencia: string) => {
    if (!lastAddedRevisorId) {
      setError("Primero debe seleccionar un revisor."); // Mensaje adaptado
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (talla.cantidad <= 0) return;

    const targetRevisorId = lastAddedRevisorId; // Usar targetRevisorId

    setRevisoresAsignados(prev => { // Usar setRevisoresAsignados
      const newAsignaciones = { ...prev };
      if (!newAsignaciones[targetRevisorId]) newAsignaciones[targetRevisorId] = [];

      let revisorActual = [...newAsignaciones[targetRevisorId]]; // Usar revisorActual
      const existente = revisorActual.find(t => t.id_original_talla === talla.id && t.id_referencia === idReferencia);
      const cantidadToAdd = talla.cantidad;

      if (existente) {
        revisorActual = revisorActual.map(pill =>
          pill.id === existente.id
            ? { ...pill, cantidad: pill.cantidad + cantidadToAdd }
            : pill
        );
      } else {
        revisorActual.push({
          id: nanoid(),
          id_original_talla: talla.id,
          nombre_talla: talla.nombre,
          cantidad: cantidadToAdd,
          id_referencia: idReferencia,
        });
      }

      newAsignaciones[targetRevisorId] = revisorActual;
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
    const isTargetARevisor = dropTargetId ? revisoresBD.some(t => t.id === dropTargetId) : false; // Cambiado a isTargetARevisor

    // Scenario 1: Dragging a TallaDisponible
    if (draggedItem.type === 'TallaDisponible') {
      const { talla: tallaArrastrada, idReferencia } = draggedItem;

      // Only allow dropping on a revisor and if quantity is greater than 0
      if (isTargetARevisor && tallaArrastrada.cantidad > 0) { // Cambiado a isTargetARevisor
        setRevisoresAsignados(prev => { // Cambiado a setRevisoresAsignados
          const newAsignaciones = { ...prev };
          if (!newAsignaciones[dropTargetId!]) newAsignaciones[dropTargetId!] = [];

          let revisorActual = newAsignaciones[dropTargetId!]; // Cambiado a revisorActual
          const existente = revisorActual.find(t => t.id_original_talla === tallaArrastrada.id && t.id_referencia === idReferencia);
          const nuevaCantidad = (existente ? existente.cantidad : 0) + tallaArrastrada.cantidad;

          // Remove existing pill if it exists, to re-add with updated quantity
          revisorActual = revisorActual.filter(t => !(t.id_original_talla === tallaArrastrada.id && t.id_referencia === idReferencia));

          revisorActual.push({
            id: nanoid(), // New ID for the assigned pill
            id_original_talla: tallaArrastrada.id,
            nombre_talla: tallaArrastrada.nombre,
            cantidad: nuevaCantidad,
            id_referencia: idReferencia,
          });

          newAsignaciones[dropTargetId!] = revisorActual;
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
      // Find the original revisor this pill came from
      let originalRevisorId: string | null = null; // Cambiado a originalRevisorId
      for (const tId in revisoresAsignados) { // Cambiado a revisoresAsignados
        if (revisoresAsignados[tId].some(pill => pill.id === tallaAsignada.id)) {
          originalRevisorId = tId;
          break;
        }
      }

      if (!originalRevisorId) return; // Should not happen if data is consistent

      // Dropped on "disponible-zone" or outside any valid droppable (unassign)
      if (dropTargetId === 'disponible-zone' || !over) {
        removeAssignedPill(tallaAsignada.id_original_talla, tallaAsignada.id, tallaAsignada.cantidad, tallaAsignada.id_referencia);
      }
      // Dropped on another revisor
      else if (isTargetARevisor && dropTargetId !== originalRevisorId) { // Cambiado a isTargetARevisor y originalRevisorId
        setRevisoresAsignados(prev => { // Cambiado a setRevisoresAsignados
          const newAsignaciones = { ...prev };

          // Remove from original revisor
          newAsignaciones[originalRevisorId!] = newAsignaciones[originalRevisorId!].filter(pill => pill.id !== tallaAsignada.id); // Cambiado a originalRevisorId

          // Add to new revisor
          // Ensure new array instance for the destination revisor
          let newRevisorDestino = newAsignaciones[dropTargetId!] ? [...newAsignaciones[dropTargetId!]] : []; // Cambiado a newRevisorDestino

          const existente = newRevisorDestino.find(t => t.id_original_talla === tallaAsignada.id_original_talla && t.id_referencia === tallaAsignada.id_referencia);

          if (existente) {
            // Create a new object for the existing pill with updated quantity
            const updatedExistente = { ...existente, cantidad: existente.cantidad + tallaAsignada.cantidad };
            // Replace the old existing pill with the updated one in the newRevisorDestino array
            newRevisorDestino = newRevisorDestino.map(pill =>
              pill.id === existente.id ? updatedExistente : pill
            );
          } else {
            // Add the new pill to the newRevisorDestino array
            newRevisorDestino.push(tallaAsignada);
          }
          newAsignaciones[dropTargetId!] = newRevisorDestino; // Assign the new array instance

          // Clean up original revisor if it becomes empty
          if (newAsignaciones[originalRevisorId!].length === 0) { // Cambiado a originalRevisorId
            delete newAsignaciones[originalRevisorId!]; // Cambiado a originalRevisorId
          }

          return newAsignaciones;
        });
      }
      // Dropped on its own revisor or an invalid target (do nothing)
      // Implicitly handled by not having other conditions
    }
  };

  // Assigned Pill Logic
  const handleAsignadaPillQuantityChange = (idRevisor: string, idAsignadaPill: string, nuevaCantidadInput: number, idReferencia: string) => { // idTaller a idRevisor
    let cantidadAnterior = 0;
    let idTallaOriginal = '';

    const reference = referenciasAgrupadas.find(r => r.id_referencia === idReferencia);
    const asignacionActual = revisoresAsignados[idRevisor]?.find(a => a.id === idAsignadaPill); // talleresAsignados a revisoresAsignados

    if (!reference || !asignacionActual) return;

    cantidadAnterior = asignacionActual.cantidad;
    idTallaOriginal = asignacionActual.id_original_talla;

    let assignedToOthers = 0;
    Object.keys(revisoresAsignados).forEach(tId => { // talleresAsignados a revisoresAsignados
      if (tId !== idRevisor) { // idTaller a idRevisor
        revisoresAsignados[tId].forEach(assignedPill => { // talleresAsignados a revisoresAsignados
          if (assignedPill.id_original_talla === idTallaOriginal && assignedPill.id_referencia === idReferencia) {
            assignedToOthers += assignedPill.cantidad;
          }
        });
      }
    });

    const refOriginalTotal = reference.tallas_originales_global.get(idTallaOriginal) || 0;
    const maxAllowedForThisPill = refOriginalTotal - assignedToOthers;
    const validatedNewQuantity = Math.max(0, Math.min(nuevaCantidadInput, maxAllowedForThisPill));

    setRevisoresAsignados(prev => { // setTalleresAsignados a setRevisoresAsignados
      const newAsignaciones = { ...prev };
      const revisorActual = newAsignaciones[idRevisor]; // tallerActual a revisorActual, idTaller a idRevisor
      const pillToUpdate = revisorActual.find(a => a.id === idAsignadaPill);
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
    setRevisoresAsignados(prev => { // setTalleresAsignados a setRevisoresAsignados
      const newAsignaciones = { ...prev };
      for (const tId in newAsignaciones) {
        const index = newAsignaciones[tId].findIndex(pill => pill.id === idAsignadaPill);
        if (index !== -1) {
          newAsignaciones[tId].splice(index, 1);
          if (newAsignaciones[tId].length === 0) {
            // Optionally decide if you want to remove the revisor if it's empty
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

  const handleAddRevisor = (revisor: Taller) => { // Taller se usa como tipo para compatibilidad con UI
    if (!revisoresAsignados[revisor.id]) { // revisoresAsignados
      setRevisoresAsignados(prev => ({ // setRevisoresAsignados
        ...prev,
        [revisor.id]: []
      }));
    }
    setLastAddedRevisorId(revisor.id); // lastAddedRevisorId
    setShowRevisorDropdown(false); // setShowRevisorDropdown
  };

  const handleRemoveRevisor = (idRevisor: string) => { // idTaller a idRevisor
    const revisorAsignaciones = revisoresAsignados[idRevisor]; // revisorAsignaciones

    if (revisorAsignaciones && revisorAsignaciones.length > 0) {
      setReferenciasAgrupadas(prevRefs => {
        let newRefs = [...prevRefs];
        revisorAsignaciones.forEach(asignacion => {
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

    setRevisoresAsignados(prev => { // setRevisoresAsignados
      const newAsignaciones = { ...prev };
      delete newAsignaciones[idRevisor]; // idRevisor

      // Update lastAddedRevisorId if the removed one was the last
      setLastAddedRevisorId(currentId => { // setLastAddedRevisorId
        if (currentId === idRevisor) { // idRevisor
          const remainingRevisorIds = Object.keys(newAsignaciones); // remainingRevisorIds
          if (remainingRevisorIds.length > 0) {
            return remainingRevisorIds[remainingRevisorIds.length - 1];
          }
          return null; // No revisors left
        }
        return currentId; // No change
      });

      return newAsignaciones;
    });
  };

  // Final Confirmation Logic
  const handleConfirmarRevision = async () => {
    if (authLoading || !user?.trabajador_id) {
      setError('Sesión de usuario no válida o aún cargando. Intente de nuevo en un momento.');
      return;
    }
    if (!orderId || !id_taller_revision) {
      setError('Datos del pedido o del taller incompletos.');
      return;
    }

    setLoading(true);
    setError(null);

    const totalAsignado = Object.values(revisoresAsignados).reduce((sum, asignaciones) => sum + asignaciones.length, 0);
    if (totalAsignado === 0) {
      setError('Debe asignar al menos una orden de trabajo a un revisor.');
      setLoading(false);
      return;
    }

    // 1. Construir un único payload con todas las asignaciones
    const asignacionesParaEnviar: any[] = [];
    for (const id_revisor in revisoresAsignados) {
      for (const item of revisoresAsignados[id_revisor]) {
        if (item.cantidad > 0) {
          const originalWorkOrder = workOrders.find(wo =>
            wo.id_referencia.id === item.id_referencia &&
            wo.id_talla.id === item.id_original_talla &&
            wo.id_taller === id_taller_revision
          );

          if (originalWorkOrder) {
            asignacionesParaEnviar.push({
              id_revisor: id_revisor,
              id_referencia: item.id_referencia,
              id_talla: item.id_original_talla,
              cantidad_a_revisar: item.cantidad,
              id_orden_trabajo_original: originalWorkOrder.id
            });
          } else {
            setError(`No se encontró la orden de trabajo original para la talla ${item.nombre_talla}.`);
            setLoading(false);
            return;
          }
        }
      }
    }

    try {
      // Usar la NUEVA función unificada y descriptiva
      const { error: rpcError } = await supabase.rpc('avanzar_taller_a_revision_y_asignar_revisor' as any, {
        p_id_pedido: orderId,
        p_id_taller: id_taller_revision,
        p_id_usuario_accion: user.trabajador_id,
        p_asignaciones_json: asignacionesParaEnviar
      });

      if (rpcError) throw rpcError;

      // Todo fue exitoso, cerrar modales y refrescar
      onRevisionComplete();
      onClose();

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido durante la confirmación.';
      console.error('Error en handleConfirmarRevision:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // --- Render ---
  if (!isOpen || !orderId) return null;

  const revisoresNoAsignados = revisoresBD.filter(t => !revisoresAsignados[t.id]);
  const revisoresFiltrados = revisoresNoAsignados.filter(t =>
    t.nombre.toLowerCase().includes(revisorSearchTerm.toLowerCase())
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
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asignar Revisión - Pedido #{orderNumber || orderId.substring(0, 8)}</h2> {/* Título adaptado */}
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
              <div className="flex-grow flex items-center justify-center"><p className="text-gray-500">Este pedido no tiene órdenes de trabajo para revisar.</p></div>
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
                          {Array.from(selectedReference.tallas_disponibles.values())
                            .filter(talla => talla.cantidad > 0)
                            .map(talla =>
                              <DraggableTallaDisponible
                                key={`talla-${talla.id}-${selectedReference.id_referencia}`}
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
                              onClick={() => setShowRevisorDropdown(prev => !prev)} // showRevisorDropdown
                              className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2"
                            >
                              <span>Añadir Revisor</span>
                              <ChevronDown size={16} className={`transition-transform duration-200 ${showRevisorDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showRevisorDropdown && ( // showRevisorDropdown
                              <div
                                className="absolute z-10 top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-80 overflow-y-auto flex flex-col animate-fade-in-fast"
                                onClick={e => e.stopPropagation()} // Stop propagation here
                              >
                                <div className="p-2 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                                  <input
                                    type="text"
                                    value={revisorSearchTerm}
                                    onChange={(e) => setRevisorSearchTerm(e.target.value)}
                                    className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                                    placeholder="Buscar revisor..."
                                    autoFocus
                                  />
                                </div>
                                <div className="py-1">
                                  {revisoresFiltrados.length > 0 ? ( // revisoresFiltrados
                                    revisoresFiltrados.map(revisor => ( // revisoresFiltrados.map
                                      <button
                                        key={revisor.id}
                                        onClick={() => handleAddRevisor(revisor)} // handleAddRevisor(revisor)
                                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-200 transition-colors"
                                      >
                                        {revisor.nombre}
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-4 py-3 text-sm text-gray-400 text-center italic">
                                      {revisoresNoAsignados.length === 0 ? "Todos los revisores añadidos" : "No se encontraron resultados"}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          {Object.keys(revisoresAsignados).map(id_revisor => { // revisoresAsignados
                            const revisor = revisoresBD.find(t => t.id === id_revisor); // revisoresBD
                            if (!revisor) return null;

                            return (
                              <div key={id_revisor} className="p-3 bg-gray-100 dark:bg-gray-900/50 rounded-lg shadow-sm flex flex-col lg:flex-row lg:items-center gap-2 transition-all">
                                {/* --- Wrapper for Mobile View Title/Button & Desktop View Title --- */}
                                <div className="flex justify-between items-center w-full lg:w-auto lg:flex-shrink-0">
                                  <h4 className="font-semibold text-base text-gray-800 dark:text-gray-200">{revisor.nombre}:</h4> {/* revisor.nombre */}
                                  {/* Mobile-only Trash Button */}
                                  <button
                                    onClick={() => handleRemoveRevisor(id_revisor)} // handleRemoveRevisor(id_revisor)
                                    className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors lg:hidden"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>

                                {/* --- Drop Zone --- */}
                                <div className="w-full lg:flex-1">
                                  <DroppableRevisorZone id={id_revisor} items={revisoresAsignados[id_revisor]} onQuantityChange={handleAsignadaPillQuantityChange} onRemovePill={removeAssignedPill} referenciasAgrupadas={referenciasAgrupadas} colorMap={colorMap} /> {/* DroppableRevisorZone */}
                                </div>

                                {/* --- Desktop-only Trash Button --- */}
                                <button
                                  onClick={() => handleRemoveRevisor(id_revisor)} // handleRemoveRevisor(id_revisor)
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
              const referenceColor = colorMap.get(item.id_referencia) || '#ccc';
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
          onConfirm={handleConfirmarRevision} // Cambiado a handleConfirmarRevision
          asignaciones={revisoresAsignados} // revisoresAsignados
          talleres={revisoresBD} // revisoresBD
          referencias={referenciasAgrupadas}
          loading={loading}
        />

      </div>
    </Portal>
  );
};

export default AsignarRevisorModal; // Exportación del componente renombrado

const DroppableRevisorZone = ({ id, items, onQuantityChange, onRemovePill, referenciasAgrupadas, colorMap }: {
  id: string,
  items: TallaAsignada[],
  onQuantityChange: (idRevisor: string, idAsignadaPill: string, nuevaCantidad: number, idReferencia: string) => void, // Cambiado idTaller a idRevisor
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
            onQuantityChange={(newQty) => onQuantityChange(id, item.id, newQty, item.id_referencia)} // idTaller a id
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