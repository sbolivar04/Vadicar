import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Portal from './Portal';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon, ArchiveBoxArrowDownIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import { ArrowRightIcon } from '@heroicons/react/24/solid';
import TallaCantidadBadge from './TallaCantidadBadge';
import { useAuth } from '../auth/AuthProvider';
import { WorkOrderForReview } from '../types';

// --- Interfaces ---
interface WorkshopStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  onWorkshopStageAdvanced: () => void;
  onInitiateReceiverAssignment: (orderId: string, tallerId: string, etapaId: string, esDevuelto: boolean) => void;
  onInitiateReceptionConfirmation: (workOrders: WorkOrderForReview[]) => void;
  onAdvanceWorkshopToRevision: (orderId: string, tallerId: string, workOrdersForTaller: WorkOrderForReview[]) => void;
  onInitiateRevisionResults: (tallerId: string, workOrders: WorkOrderForReview[], tallerNombre: string, allTallerWorkOrders: WorkOrderForReview[]) => void;
  onInitiatePlanchadoAssignment: (orderId: string, tallerId: string) => void;
  onInitiatePlanchadoResults: (workOrders: WorkOrderForReview[], tallerNombre: string) => void;
  onConfirmFinalDelivery: (tallerId: string) => void;
  onRefreshTrigger: boolean;
  orderNumber?: number;
}

interface WorkshopInfo {
  id_taller: string;
  nombre_taller: string;
  etapa_actual_id: string;
  etapa_actual_nombre: string;
  etapa_actual_codigo: string;
  etapa_actual_indice: number;
  siguiente_etapa_nombre?: string;
  total_prendas: number;
  es_devuelto: boolean;
  cantidad_prendas_display?: string;
  isCompletado?: boolean;
}


const WorkshopStageModal: React.FC<WorkshopStageModalProps> = ({
  isOpen,
  onClose,
  orderId,
  onWorkshopStageAdvanced,
  onInitiateReceiverAssignment,
  onInitiateReceptionConfirmation,
  onAdvanceWorkshopToRevision,
  onInitiateRevisionResults,
  onInitiatePlanchadoAssignment,
  onInitiatePlanchadoResults,
  onConfirmFinalDelivery,
  onRefreshTrigger,
  orderNumber
}) => {
  const { user } = useAuth();
  const [workshops, setWorkshops] = useState<WorkshopInfo[]>([]);
  const [detailedWorkOrders, setDetailedWorkOrders] = useState<WorkOrderForReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [advancingTallerId, setAdvancingTallerId] = useState<string | null>(null);
  const [expandedTallerKey, setExpandedTallerKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<{
    taller: WorkshopInfo;
    onConfirm: () => void;
    title?: string;
    message?: React.ReactNode;
    icon?: React.ReactNode;
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [statusRes, detailsRes] = await Promise.all([
        supabase.rpc('obtener_estado_talleres_por_pedido', { p_id_pedido: orderId }),
        supabase.from('ordenes_de_trabajo').select(`
            id,
            cantidad_asignada,
            id_taller,
            estado,
            id_referencia (id, nombre, imagen_url),
            id_talla (id, nombre),
            id_etapa_actual (nombre, codigo),
            id_trabajador_asignado (id, nombre_trabajador),
            origen_reproceso,
            asignado_sig_etapa
        `)
          .eq('id_pedido', orderId)
      ]);

      if (statusRes.error) throw statusRes.error;
      if (detailsRes.error) throw detailsRes.error;

      const baseWorkshops = statusRes.data || [];
      const workOrderData = (detailsRes.data || []).map((wo: any) => ({
        ...wo,
        id_referencia: (Array.isArray(wo.id_referencia) ? wo.id_referencia[0] : wo.id_referencia) as WorkOrderForReview['id_referencia'],
        id_talla: (Array.isArray(wo.id_talla) ? wo.id_talla[0] : wo.id_talla) as WorkOrderForReview['id_talla'],
        id_etapa_actual: (Array.isArray(wo.id_etapa_actual) ? wo.id_etapa_actual[0] : wo.id_etapa_actual),
        id_trabajador_asignado: (Array.isArray(wo.id_trabajador_asignado) ? wo.id_trabajador_asignado[0] : wo.id_trabajador_asignado)
      })) as WorkOrderForReview[];

      setDetailedWorkOrders(workOrderData);

      // Enriquecer la información de talleres con conteos de progreso
      const enrichedWorkshops = baseWorkshops.map((taller: WorkshopInfo) => {
        const tellerOrders = workOrderData.filter(wo => {
          const isCorrectTaller = wo.id_taller === taller.id_taller;
          const isCurrentOrNextStage = wo.id_etapa_actual?.nombre === taller.etapa_actual_nombre || wo.id_etapa_actual?.nombre === taller.siguiente_etapa_nombre;
          const isCorrectDevuelto = taller.es_devuelto ? wo.origen_reproceso === 'devolucion' : (wo.origen_reproceso !== 'devolucion' || !wo.origen_reproceso);

          // Si estamos en Revisión o Planchado, ignoramos las que ya fueron asignadas a la siguiente etapa
          const isAlreadyAssigned = (wo.id_etapa_actual?.codigo === 'REVISION' || wo.id_etapa_actual?.codigo === 'PLANCHADO') && (wo as any).asignado_sig_etapa;

          return isCorrectTaller && isCurrentOrNextStage && isCorrectDevuelto && !isAlreadyAssigned;
        });

        const completadas = tellerOrders.filter(wo => wo.estado === 'completada').reduce((sum, wo) => sum + wo.cantidad_asignada, 0);
        const totales = tellerOrders.reduce((sum, wo) => sum + wo.cantidad_asignada, 0);

        return {
          ...taller,
          cantidad_prendas_display: `${completadas}/${totales}`,
          isCompletado: completadas === totales && totales > 0,
          total_real_calculado: totales // Guardamos para filtrar
        };
      }).filter((t: any) => t.total_real_calculado > 0);

      setWorkshops(enrichedWorkshops);
      if (enrichedWorkshops.length === 0) {
        onClose();
      }
    } catch (err: unknown) {
      console.error("Error fetching workshop data:", err);
      setError(`No se pudo cargar el estado de los talleres: ${(err instanceof Error) ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (isOpen) {
      setExpandedTallerKey(null);
      fetchData();
    }
  }, [isOpen, fetchData, onRefreshTrigger]);

  const receptionsConfirmed = useMemo(() => {
    const confirmed: { [key: string]: boolean } = {};
    workshops.forEach(taller => {
      const tallerKey = `${taller.id_taller}-${taller.etapa_actual_id}-${taller.es_devuelto}`;
      const tallerWorkOrders = detailedWorkOrders.filter(wo => {
        const isCorrectTaller = wo.id_taller === taller.id_taller;
        const isReceptionStatus = wo.id_etapa_actual?.nombre === 'Recepción';
        const isCorrectDevuelto = taller.es_devuelto ? wo.origen_reproceso === 'devolucion' : (wo.origen_reproceso !== 'devolucion' || !wo.origen_reproceso);
        return isCorrectTaller && isReceptionStatus && isCorrectDevuelto;
      });

      if (tallerWorkOrders.length === 0) {
        confirmed[tallerKey] = false;
        return;
      }
      confirmed[tallerKey] = tallerWorkOrders.every(wo => wo.estado === 'recibida' || wo.estado === 'recibida_incompleta');
    });
    return confirmed;
  }, [detailedWorkOrders, workshops]);

  const handleAdvance = async (taller: WorkshopInfo) => {
    if (!orderId || !user?.trabajador_id) {
      setError("No se puede avanzar la etapa: falta el ID del pedido o el ID del trabajador no está disponible.");
      return;
    }
    setAdvancingTallerId(taller.id_taller);
    setError(null);

    if (taller.siguiente_etapa_nombre === 'Recepción' || taller.siguiente_etapa_nombre === 'Recepcion') {
      onInitiateReceiverAssignment(orderId, taller.id_taller, taller.etapa_actual_id, taller.es_devuelto);
      setAdvancingTallerId(null);
      return;
    }

    // Interceptar avance de Ojal y Botón hacia Planchado para asignar planchador
    if (taller.etapa_actual_codigo === 'OJAL_BOTON') {
      onInitiatePlanchadoAssignment(orderId, taller.id_taller);
      setAdvancingTallerId(null);
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc('avanzar_etapa_taller', {
        p_id_pedido: orderId,
        p_id_taller: taller.id_taller,
        p_id_usuario_actualizacion_etapa: user.trabajador_id,
        p_id_etapa_origen: taller.etapa_actual_id,
        p_es_devuelto: taller.es_devuelto
      });
      if (rpcError) throw rpcError;

      fetchData();
      onWorkshopStageAdvanced();

    } catch (err: unknown) {
      setError(`Error al avanzar el taller: ${(err instanceof Error) ? err.message : 'Unknown error'}`);
    } finally {
      setAdvancingTallerId(null);
    }
  };

  const toggleDetails = (tallerKey: string) => {
    setExpandedTallerKey(prevKey => prevKey === tallerKey ? null : tallerKey);
  };

  const getReferencesForTaller = (taller: WorkshopInfo) => {
    // Para el detalle, mostramos todo lo que pertenece a esa etapa (incluyendo completados para ver el historial)
    const ordersForTaller = detailedWorkOrders.filter(wo => {
      const isCorrectTaller = wo.id_taller === taller.id_taller;
      const isCurrentOrNextStage = wo.id_etapa_actual?.nombre === taller.etapa_actual_nombre || wo.id_etapa_actual?.nombre === taller.siguiente_etapa_nombre;
      const isCorrectDevuelto = taller.es_devuelto ? wo.origen_reproceso === 'devolucion' : (wo.origen_reproceso !== 'devolucion' || !wo.origen_reproceso);

      // Si estamos en Revisión o Planchado, ignoramos las que ya fueron asignadas a la siguiente etapa
      const isAlreadyAssigned = (wo.id_etapa_actual?.codigo === 'REVISION' || wo.id_etapa_actual?.codigo === 'PLANCHADO') && (wo as any).asignado_sig_etapa;

      return isCorrectTaller && isCurrentOrNextStage && isCorrectDevuelto && !isAlreadyAssigned;
    });

    const groupedByRef = ordersForTaller.reduce((acc, wo) => {
      const refId = wo.id_referencia.id;
      if (!acc[refId]) {
        acc[refId] = {
          nombreRef: wo.id_referencia.nombre,
          imagenUrl: wo.id_referencia.imagen_url,
          tallas: new Map<string, number>()
        };
      }
      const currentQty = acc[refId].tallas.get(wo.id_talla.nombre) || 0;
      acc[refId].tallas.set(wo.id_talla.nombre, currentQty + wo.cantidad_asignada);

      return acc;
    }, {} as { [key: string]: { nombreRef: string; imagenUrl: string; tallas: Map<string, number> } });

    return Object.values(groupedByRef).map(group => ({
      ...group,
      tallas: Array.from(group.tallas.entries()).map(([nombre, cantidad]) => ({ nombre, cantidad }))
    }));
  };

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] min-h-[460px] flex flex-col transform transition-all duration-300 animate-fade-in-scale">
          <div className="relative p-5 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gestionar Etapas por Taller - Pedido #{orderNumber || (orderId ? orderId.substring(0, 8) : '')}</h2>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"><XMarkIcon className="h-6 w-6" /></button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto flex-grow">
            {loading && <p className="text-center text-gray-500 dark:text-gray-400">Cargando talleres...</p>}
            {error && <p className="text-center text-red-500">{error}</p>}

            {!loading && !error && workshops.length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400">No hay talleres con órdenes de trabajo para este pedido.</p>
            )}

            {!loading && !error && workshops.map(taller => {
              const tallerKey = `${taller.id_taller}-${taller.etapa_actual_id}-${taller.es_devuelto}`;
              const isExpanded = expandedTallerKey === tallerKey;

              return (
                <div key={tallerKey} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg transition-shadow duration-300">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleDetails(tallerKey)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Ver Detalles">
                        {isExpanded ? (<ChevronUpIcon className="w-5 h-5 text-gray-500" />) : (<ChevronDownIcon className="w-5 h-5 text-gray-500" />)}
                      </button>
                      <div>
                        <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-200">
                          {taller.nombre_taller}
                          {taller.es_devuelto && (
                            <span className="ml-2 text-red-600 dark:text-red-400 italic font-bold">
                              (Devuelto)
                            </span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
                          <span>{taller.etapa_actual_nombre}</span>
                          {taller.siguiente_etapa_nombre && <ArrowRightIcon className="w-4 h-4 text-gray-400" />}
                          {taller.siguiente_etapa_nombre && <span className="font-medium text-gray-700 dark:text-gray-300">{taller.siguiente_etapa_nombre}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${taller.isCompletado
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                            {taller.cantidad_prendas_display} prendas
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {taller.etapa_actual_nombre === 'Recepción' && (
                        <button
                          onClick={() => onInitiateReceptionConfirmation(detailedWorkOrders.filter(wo =>
                            wo.id_taller === taller.id_taller &&
                            wo.id_etapa_actual?.nombre === 'Recepción' &&
                            (taller.es_devuelto ? wo.origen_reproceso === 'devolucion' : (wo.origen_reproceso !== 'devolucion' || !wo.origen_reproceso))
                          ))}
                          disabled={receptionsConfirmed[tallerKey]}
                          className="p-1 rounded-full text-amber-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={receptionsConfirmed[tallerKey] ? 'Recepción Confirmada' : 'Confirmar Recepción'}
                        >
                          <ArchiveBoxArrowDownIcon className="w-5 h-5" />
                        </button>
                      )}
                      {taller.siguiente_etapa_nombre ? (
                        <button
                          onClick={() => {
                            const onConfirmAction = () => {
                              if (taller.etapa_actual_nombre === 'Recepción') {
                                const workOrdersForReview = detailedWorkOrders.filter(wo =>
                                  wo.id_taller === taller.id_taller &&
                                  wo.id_etapa_actual?.nombre === 'Recepción' &&
                                  (taller.es_devuelto ? wo.origen_reproceso === 'devolucion' : (wo.origen_reproceso !== 'devolucion' || !wo.origen_reproceso)) &&
                                  (wo.estado === 'recibida' || wo.estado === 'recibida_incompleta')
                                );
                                onAdvanceWorkshopToRevision(orderId as string, taller.id_taller, workOrdersForReview);
                              } else if (taller.etapa_actual_nombre === 'Revisión') {
                                const allTallerWorkOrders = detailedWorkOrders.filter(wo => wo.id_taller === taller.id_taller);
                                const ordersForTable = allTallerWorkOrders.filter(wo => {
                                  const isCorrectStage = wo.id_etapa_actual?.nombre === 'Revisión';
                                  const isValidStatus = wo.estado === 'pendiente' || wo.estado === 'recibida' || wo.estado === 'recibida_incompleta' || wo.estado === 'completada';
                                  const isAlreadyAssigned = (wo as any).asignado_sig_etapa === true;

                                  return isCorrectStage && isValidStatus && !isAlreadyAssigned;
                                });
                                onInitiateRevisionResults(taller.id_taller, ordersForTable, taller.nombre_taller, allTallerWorkOrders);
                              } else if (taller.etapa_actual_nombre === 'Planchado y empaque') {
                                const ordersForTable = detailedWorkOrders.filter(wo =>
                                  wo.id_taller === taller.id_taller &&
                                  wo.id_etapa_actual?.nombre === 'Planchado y empaque'
                                );
                                onInitiatePlanchadoResults(ordersForTable, taller.nombre_taller);
                              } else {
                                handleAdvance(taller);
                              }
                              setConfirmacion(null);
                            };

                            // SALTAR CONFIRMACIÓN PARA REVISIÓN Y PLANCHADO: Abrir resultados directo
                            if (taller.etapa_actual_codigo === 'REVISION' || taller.etapa_actual_codigo === 'PLANCHADO') {
                              onConfirmAction();
                            } else {
                              setConfirmacion({
                                taller,
                                onConfirm: onConfirmAction
                              });
                            }
                          }}
                          disabled={advancingTallerId === taller.id_taller || (taller.etapa_actual_codigo === 'RECEPCION' && !receptionsConfirmed[tallerKey])}
                          className={`p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600`}
                          title="Avanzar etapa"
                        >
                          {advancingTallerId === taller.id_taller ? (
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Avanzando...</span>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-play w-4 h-4 text-blue-600 dark:text-blue-400`}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                          )}
                        </button>
                      ) : (
                        taller.etapa_actual_codigo === 'ENTREGA' && !taller.isCompletado ? (
                          <button
                            onClick={() => {
                              setConfirmacion({
                                taller,
                                title: 'Finalizar Entrega',
                                message: (
                                  <p>
                                    ¿Estás seguro de que deseas finalizar la entrega del taller <span className="font-bold text-gray-800 dark:text-gray-200">"{taller.nombre_taller}"</span>? Todas las órdenes de entrega final para este taller se marcarán como completadas.
                                  </p>
                                ),
                                onConfirm: () => {
                                  onConfirmFinalDelivery(taller.id_taller);
                                  setConfirmacion(null);
                                },
                                icon: <CheckCircleIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
                              });
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md shadow-indigo-500/20 transition-all hover:scale-105"
                            title="Confirmar Entrega Final"
                          >
                            <CheckCircleIcon className="w-4 h-4" />
                            Finalizar
                          </button>
                        ) : (
                          taller.etapa_actual_codigo !== 'RECEPCION' && <span className="px-3 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full dark:bg-green-900 dark:text-green-300">Finalizado</span>
                        )
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t dark:border-gray-600 p-3 space-y-2 animate-fade-in-fast">
                      {getReferencesForTaller(taller).map(ref => (
                        <div key={ref.nombreRef} className="flex items-start gap-3 p-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                          <img src={ref.imagenUrl || undefined} alt={ref.nombreRef} className="w-12 h-12 object-cover rounded-md flex-shrink-0" />
                          <div className="flex-grow">
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200">{ref.nombreRef}</h4>
                            <div className="mt-0.5 flex flex-wrap gap-2">
                              {ref.tallas.map(talla => (<TallaCantidadBadge key={talla.nombre} talla={talla.nombre} cantidad={talla.cantidad} />))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex justify-end">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">Cerrar</button>
          </div>
        </div>
      </div>

      {/* Modal de Confirmación */}
      {confirmacion && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[70] p-4 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all animate-in zoom-in-95 duration-300">
              <div className="p-6 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmacion.icon ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                  {confirmacion.icon || <ArrowRightIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />}
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {confirmacion.title || 'Confirmar Avance'}
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {confirmacion.message || (
                    <p>
                      ¿Estás seguro de que deseas avanzar el taller <span className="font-bold text-gray-800 dark:text-gray-200">"{confirmacion.taller.nombre_taller}"</span> de la etapa <span className="font-bold text-blue-600 dark:text-blue-400">{confirmacion.taller.etapa_actual_nombre}</span> a <span className="font-bold text-indigo-600 dark:text-indigo-400">{confirmacion.taller.siguiente_etapa_nombre}</span>?
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700">
                <button
                  onClick={() => setConfirmacion(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmacion.onConfirm}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:scale-105"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </Portal>
  );
};

export default WorkshopStageModal;