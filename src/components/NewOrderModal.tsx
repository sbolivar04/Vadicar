import React, { useState, useEffect, useMemo, useRef } from 'react';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';
import Portal from './Portal';
import ImagePreviewModal from './ImagePreviewModal'; // Importar el nuevo componente
import FilterDropdown from './FilterDropdown';

import SearchableDropdown from './SearchableDropdown';

// Interfaces
import { useAuth } from '../auth/AuthProvider';

interface Cliente { id: string; nombre: string;[key: string]: any; }
interface Prioridad { id: string; nombre: string;[key: string]: any; }
interface Talla { id: string; nombre: string; orden: number; }
interface Referencia { id: string; nombre: string; precio_unitario: number; imagen_url?: string;[key: string]: any; } // Added imagen_url

interface SelectedReference {
  id_referencia: string;
  nombre: string;
  precio_unitario: number;
  imagen_url?: string; // Added imagen_url
  quantities: { [tallaId: string]: number };
}

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated: (newOrderId: string) => void;
}

const NewOrderModal: React.FC<NewOrderModalProps> = ({ isOpen, onClose, onOrderCreated }) => {
  const { user } = useAuth();
  // Form state
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [selectedPrioridadId, setSelectedPrioridadId] = useState<string>('');
  const [selectedReferences, setSelectedReferences] = useState<SelectedReference[]>([]);
  const [activeReferenceTalla, setActiveReferenceTalla] = useState<{ referenceId: string; tallaId: string } | null>(null);
  const sizeSelectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // Estado para la imagen seleccionada

  const handleOpenSearchableDropdown = () => {
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollTop = formRef.current.scrollHeight;
      }
    }, 0);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sizeSelectionRef.current && !sizeSelectionRef.current.contains(event.target as Node)) {
        setActiveReferenceTalla(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [sizeSelectionRef, setActiveReferenceTalla]);

  useEffect(() => {
    if (activeReferenceTalla && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeReferenceTalla]);

  // Data from DB
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [prioridades, setPrioridades] = useState<Prioridad[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [allReferencias, setAllReferencias] = useState<Referencia[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const [
            { data: clientesData, error: clientesError },
            { data: prioridadesData, error: prioridadesError },
            { data: tallasData, error: tallasError },
            { data: referenciasData, error: referenciasError },
          ] = await Promise.all([
            supabase.from('clientes').select('id, nombre'),
            supabase.from('prioridades_pedido').select('id, nombre'),
            supabase.from('tallas').select('id, nombre, orden').order('orden'),
            supabase.from('referencias').select('id, nombre, precio_unitario, imagen_url'), // Select imagen_url
          ]);

          if (clientesError) throw clientesError;
          if (prioridadesError) throw prioridadesError;
          if (tallasError) throw tallasError;
          if (referenciasError) throw referenciasError;

          setClientes(clientesData || []);
          setPrioridades(prioridadesData || []);
          setTallas(tallasData || []);

          const finalReferencias = (referenciasData || []).map(ref => {
            if (ref.imagen_url) {
              if (ref.imagen_url.startsWith('http')) {
                return ref;
              }
              const { data: publicURL } = supabase.storage.from('imagenes').getPublicUrl(ref.imagen_url);
              return { ...ref, imagen_url: publicURL.publicUrl };
            }
            return ref;
          });

          setAllReferencias(finalReferencias);

          // if (clientesData?.length) setSelectedClienteId(clientesData[0].id); // Comentado para no seleccionar por defecto
          const mediaPrioridad = prioridadesData?.find(p => p.nombre.toLowerCase() === 'media');
          if (mediaPrioridad) {
            setSelectedPrioridadId(mediaPrioridad.id);
          }

        } catch (err: unknown) {
          console.error("Error fetching data for modal:", err);
          console.error("Full error object:", JSON.stringify(err, null, 2)); // Added this line
          setError(`No se pudieron cargar los datos necesarios: ${(err instanceof Error) ? err.message : 'Unknown error'}`);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    } else {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setSelectedClienteId('');
    setSelectedPrioridadId('');
    setSelectedReferences([]);
    setError(null);
  };

  const handleAddReference = (refId: string) => {
    if (!refId || selectedReferences.some(r => r.id_referencia === refId)) return;
    const refToAdd = allReferencias.find(r => r.id === refId);
    if (refToAdd) {
      setSelectedReferences(prev => [...prev, { ...refToAdd, id_referencia: refToAdd.id, quantities: {} }]);
    }
  };

  const handleRemoveReference = (refId: string) => {
    setSelectedReferences(prev => prev.filter(r => r.id_referencia !== refId));
  };

  const handleQuantityChange = (refId: string, tallaId: string, value: string) => {
    setSelectedReferences(prev =>
      prev.map(ref => {
        if (ref.id_referencia === refId) {
          const updatedQuantities = { ...ref.quantities };
          const numValue = Number(value); // Use Number() for more robust conversion
          if (isNaN(numValue)) {
            updatedQuantities[tallaId] = 0; // If not a number, set to 0
          } else {
            updatedQuantities[tallaId] = numValue;
          }
          return { ...ref, quantities: updatedQuantities };
        }
        return ref;
      })
    );
  };

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setActiveReferenceTalla(null);
    }
  };

  const { totalUnidades } = useMemo(() => {
    let unidades = 0;
    selectedReferences.forEach(ref => {
      const refTotalUnits = Object.values(ref.quantities).reduce((sum, qty) => sum + qty, 0);
      unidades += refTotalUnits;
    });
    return { totalUnidades: unidades };
  }, [selectedReferences]);

  const isOrderValid = useMemo(() => {
    if (!selectedClienteId || selectedReferences.length === 0) {
      return false;
    }
    // Check if every selected reference has at least one unit
    const allRefsHaveQuantities = selectedReferences.every(ref =>
      Object.values(ref.quantities).reduce((sum, qty) => sum + qty, 0) > 0
    );
    return allRefsHaveQuantities;
  }, [selectedClienteId, selectedReferences]);

  const handleConfirmOrder = async () => {
    setError(null);
    setLoading(true); // Start loading when confirming

    const p_referencias = selectedReferences.map(ref => ({
      id_referencia: ref.id_referencia,
      quantities: Object.entries(ref.quantities)
        .map(([id_talla, cantidad]) => ({ id_talla, cantidad }))
        .filter(t => t.cantidad > 0), // Ensure we only send items with quantity
    }));

    const { data: newOrderId, error: rpcError } = await supabase.rpc('crear_pedido_con_detalles', {
      p_id_cliente: selectedClienteId,
      p_id_prioridad: selectedPrioridadId,
      p_referencias,
      p_id_creador: user?.trabajador_id
    });

    if (rpcError) {
      console.error("Error creating order:", rpcError);
      console.error("Full error object:", JSON.stringify(rpcError, null, 2)); // Added this line
      setError(`Error al crear el pedido: ${rpcError.message}`);
      setLoading(false);
    } else {
      onOrderCreated(newOrderId);
      onClose();
      setShowConfirmModal(false); // Close confirm modal on success
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedClienteId) {
      setError("Por favor, selecciona un cliente.");
      return;
    }
    if (selectedReferences.length === 0) {
      setError("El pedido debe tener al menos una referencia.");
      return;
    }

    const refWithoutQuantities = selectedReferences.find(ref =>
      Object.values(ref.quantities).reduce((sum, qty) => sum + qty, 0) === 0
    );

    if (refWithoutQuantities) {
      setError(`La referencia "${refWithoutQuantities.nombre}" no tiene cantidades asignadas.`);
      return;
    }

    setShowConfirmModal(true); // Open confirmation modal
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedImage(imageUrl);
  };

  const handleClosePreview = () => {
    setSelectedImage(null);
  };

  if (!isOpen) return null;

  const availableRefsToAdd = allReferencias.filter(
    ref => !selectedReferences.some(sr => sr.id_referencia === ref.id)
  );

  return (
    <Portal>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 backdrop-blur-sm overflow-y-auto p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl h-[92vh] flex flex-col transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
          <div className="relative p-5 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Crear Nuevo Pedido</h2>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form id="new-order-form" ref={formRef} onSubmit={handleSubmit} className="flex-grow overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
                  <FilterDropdown
                    placeholder="-- Seleccionar Cliente --"
                    options={clientes}
                    selectedValue={selectedClienteId}
                    onSelect={setSelectedClienteId}
                    valueKey="id"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridad</label>
                  <FilterDropdown
                    placeholder="-- Seleccionar Prioridad --"
                    options={prioridades}
                    selectedValue={selectedPrioridadId}
                    onSelect={setSelectedPrioridadId}
                    valueKey="id"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white border-t dark:border-gray-700 pt-4">Referencias del Pedido</h3>
                {selectedReferences.map(ref => {
                  const refTotal = Object.values(ref.quantities).reduce((sum, qty) => sum + qty, 0);
                  return (
                    <div key={ref.id_referencia} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        {/* Image and Name/Price */}
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          {ref.imagen_url && (
                            <img
                              src={ref.imagen_url}
                              alt={ref.nombre}
                              className="w-16 h-16 object-cover rounded-md border dark:border-gray-600 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => handleImageClick(ref.imagen_url!)}
                            />
                          )}
                          <div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200">{ref.nombre}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {refTotal} unidades
                            </p>
                          </div>
                        </div>
                        {/* Remove Button */}
                        <button type="button" onClick={() => handleRemoveReference(ref.id_referencia)} className="text-red-500 hover:text-red-700 p-1 self-end sm:self-center">
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Size Selection - Horizontal Layout */}
                      <div ref={sizeSelectionRef} className="flex flex-wrap gap-2 justify-center sm:justify-start">
                        {tallas.map(talla => {
                          const hasQuantity = (ref.quantities[talla.id] || 0) > 0;
                          const isActive = activeReferenceTalla?.referenceId === ref.id_referencia && activeReferenceTalla?.tallaId === talla.id;
                          return (
                            <div
                              key={talla.id}
                              className={`
                              flex items-center gap-1 p-1 rounded-md border transition-all duration-500 ease-in-out
                              ${hasQuantity || isActive
                                  ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600'
                                  : 'bg-gray-100 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                                }
                            `}
                              onClick={() => {
                                if (!isActive) {
                                  setActiveReferenceTalla({ referenceId: ref.id_referencia, tallaId: talla.id });
                                } else if ((ref.quantities[talla.id] || 0) === 0) {
                                  setActiveReferenceTalla(null);
                                }
                              }}
                            >
                              {isActive ? ( // If active, always show input and buttons
                                <>
                                  <div className="flex items-center border rounded-md overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleQuantityChange(ref.id_referencia, talla.id, String(Math.max(0, (ref.quantities[talla.id] || 0) - 1))); }}
                                      className="p-0 bg-transparent text-red-500 hover:text-red-700 text-lg font-bold"
                                    >
                                      -
                                    </button>
                                    <input
                                      id={`quantity-${ref.id_referencia}-${talla.id}`}
                                      type="text"
                                      min="0"
                                      placeholder="0"
                                      value={ref.quantities[talla.id] || ''}
                                      onChange={e => handleQuantityChange(ref.id_referencia, talla.id, e.target.value)}
                                      onKeyDown={handleInputKeyDown}
                                      onFocus={() => setActiveReferenceTalla({ referenceId: ref.id_referencia, tallaId: talla.id })}
                                      onClick={(e) => e.stopPropagation()}
                                      ref={isActive ? inputRef : null}
                                      className="w-10 text-center bg-transparent text-sm p-0 focus:outline-none border-l border-r border-gray-300 dark:border-gray-600 no-arrows"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleQuantityChange(ref.id_referencia, talla.id, String((ref.quantities[talla.id] || 0) + 1)); }}
                                      className="p-0 bg-transparent text-green-500 hover:text-green-700 text-lg font-bold"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <label htmlFor={`quantity-${ref.id_referencia}-${talla.id}`} className={`text-xs ${hasQuantity ? 'text-blue-700 dark:text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {talla.nombre}
                                  </label>
                                </>
                              ) : ( // If not active
                                <>
                                  {hasQuantity ? ( // If not active AND has quantity
                                    <span className={`text-xs font-semibold text-blue-700 dark:text-blue-200`}>
                                      {(ref.quantities[talla.id] || 0)} {talla.nombre}
                                    </span>
                                  ) : ( // If not active AND no quantity
                                    <span className={`text-xs text-gray-500 dark:text-gray-400`}>
                                      {talla.nombre}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {availableRefsToAdd.length > 0 && (
                  <div className="pt-2">
                    <SearchableDropdown
                      placeholder="-- Añadir otra referencia --"
                      options={availableRefsToAdd}
                      onSelect={handleAddReference}
                      onOpen={handleOpenSearchableDropdown}
                    />
                  </div>
                )}
              </div>
            </div>
          </form>

          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
            {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
            <div className="flex justify-between items-center font-semibold text-base">
              <div className="text-gray-700 dark:text-gray-200">
                <span>Total Unidades: </span>
                <span className="text-blue-600 dark:text-blue-400">{totalUnidades}</span>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                Cancelar
              </button>
              <button type="submit" form="new-order-form" disabled={loading || !isOrderValid} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Creando...' : 'Crear Pedido'}
              </button>
            </div>
          </div>
        </div>
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmOrder}
          selectedClienteId={selectedClienteId}
          selectedPrioridadId={selectedPrioridadId}
          selectedReferences={selectedReferences}
          tallas={tallas}
          clientes={clientes}
          prioridades={prioridades}
          totalUnidades={totalUnidades}
        />
        <ImagePreviewModal
          isOpen={!!selectedImage}
          onClose={handleClosePreview}
          imageUrl={selectedImage}
        />
      </div>
    </Portal>
  );
};

export default NewOrderModal;