import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Clock,
  Package,
  CheckCircle,
  AlertTriangle,
  Users,
  Scissors,
  Truck,
  Eye,
  Shirt,
  Zap,
  Calendar,
  BarChart3,
  CheckSquare,
  Info
} from 'lucide-react';
import { EyeIcon } from '@heroicons/react/24/outline';
import SmartTooltip from '../components/SmartTooltip';
import OrderDetailsModal from '../components/OrderDetailsModal';
import AdvanceStageModal from '../components/AdvanceStageModal';
import NewOrderModal from '../components/NewOrderModal';
import AsignarProduccionModal from '../components/AsignarProduccionModal';
import WorkshopStageModal from '../components/WorkshopStageModal';
import AsignarRevisorModal from '../components/AsignarRevisorModal';
import RecepcionTallerModal from '../components/RecepcionTallerModal';
import AsignarReceptorModal from '../components/AsignarReceptorModal';
import ConfirmarReparacionModal from '../components/ConfirmarReparacionModal';
import RevisionResultsModal from '../components/RevisionResultsModal';
import DynamicDuration from '../components/DynamicDuration';
import FlowDecisionModal from '../components/FlowDecisionModal';
import AsignarPlanchadoModal from '../components/AsignarPlanchadoModal';
import ConfirmarPlanchadoModal from '../components/ConfirmarPlanchadoModal';
import AsignarOjalModal from '../components/AsignarOjalModal';
import FilterDropdown, { GenericFilterItem } from '../components/FilterDropdown';
import Pagination from '../components/Pagination';
import RowsPerPageSelector from '../components/RowsPerPageSelector';
import DateRangePicker from '../components/DateRangePicker';
import { useAuth } from '../auth/AuthProvider';
import { Pedido, WorkOrderForReview } from '../types';

// --- HELPER FUNCTIONS ---
const formatDuration = (horas: number | null | undefined): string => {
  if (horas === null || typeof horas === 'undefined' || isNaN(horas) || horas < 0) return 'N/A';
  const dias = horas / 24;
  if (dias >= 1) {
    const diasEnteros = Math.floor(dias);
    const horasRestantes = Math.round((dias - diasEnteros) * 24);
    return `${diasEnteros}d ${horasRestantes}h`;
  }
  if (horas >= 1) return `${Math.round(horas)}h`;
  const minutosEnteros = Math.round(horas * 60);
  if (minutosEnteros < 1) return '< 1 min';
  return `${minutosEnteros} min`;
};

const formatTotalDuration = (start: string | null, end: string | null | undefined): string => {
  if (!start || end === null || typeof end === 'undefined') return 'N/A';

  const parsedStart = new Date(start);
  const parsedEnd = new Date(end);

  if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return 'N/A';
  }

  const diffHours = (parsedEnd.getTime() - parsedStart.getTime()) / (1000 * 60 * 60);
  return formatDuration(diffHours);
};

// --- TYPE DEFINITIONS ---
interface StageTime {
  stage: string;
  avgtime: number;
  realtime: number;
  efficiency: number;
}

interface Metrics {
  enProceso: number;
  completados: number;
  retrasados: number;
  totalPedidos: number;
  totalPrendas: number;
  defectos: number;
}

export default function DashboardPage() {
  const { user } = useAuth();

  // Modal States from PedidosPage
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isAdvanceStageModalOpen, setIsAdvanceStageModalOpen] = useState(false);
  const [isAsignarProduccionModalOpen, setIsAsignarProduccionModalOpen] = useState(false);
  const [isWorkshopStageModalOpen, setIsWorkshopStageModalOpen] = useState(false);
  const [isAsignarRevisorModalOpen, setIsAsignarRevisorModalOpen] = useState(false);
  const [isRecepcionTallerModalOpen, setIsRecepcionTallerModalOpen] = useState(false);
  const [isFlowDecisionModalOpen, setIsFlowDecisionModalOpen] = useState(false);
  const [isAsignarPlanchadoModalOpen, setIsAsignarPlanchadoModalOpen] = useState(false);
  const [isConfirmarPlanchadoModalOpen, setIsConfirmarPlanchadoModalOpen] = useState(false);
  const [isAsignarOjalModalOpen, setIsAsignarOjalModalOpen] = useState(false);
  const [pedidoIdForRecepcion, setPedidoIdForRecepcion] = useState<string | null>(null);
  const [trabajadorIdForRecepcion, setTrabajadorIdForRecepcion] = useState<string | null>(null);
  const [approvedGarments, setApprovedGarments] = useState<any[]>([]);

  // New states for AsignarReceptorModal
  const [isAsignarReceptorModalOpen, setIsAsignarReceptorModalOpen] = useState(false);
  const [orderIdForReceiverAssignment, setOrderIdForReceiverAssignment] = useState<string | null>(null);
  const [tallerIdForReceiverAssignment, setTallerIdForReceiverAssignment] = useState<string | null>(null);
  const [etapaIdForReceiverAssignment, setEtapaIdForReceiverAssignment] = useState<string | null>(null);
  const [esDevueltoForReceiverAssignment, setEsDevueltoForReceiverAssignment] = useState<boolean>(false);
  const [tallerIdForRevision, setTallerIdForRevision] = useState<string | null>(null);

  // States for ConfirmarReparacionModal
  const [isReparacionModalOpen, setIsReparacionModalOpen] = useState(false);
  const [workOrdersForRepair, setWorkOrdersForRepair] = useState<WorkOrderForReview[]>([]);

  // States for RevisionResultsModal
  const [isRevisionResultsModalOpen, setIsRevisionResultsModalOpen] = useState(false);
  const [workOrdersForResults, setWorkOrdersForResults] = useState<WorkOrderForReview[]>([]);
  const [allTallerWorkOrders, setAllTallerWorkOrders] = useState<WorkOrderForReview[]>([]);
  const [selectedTallerNombre, setSelectedTallerNombre] = useState<string>('');
  const [activeTallerIdForRevision, setActiveTallerIdForRevision] = useState<string | null>(null);
  const [workOrdersForPlanchadoResults, setWorkOrdersForPlanchadoResults] = useState<WorkOrderForReview[]>([]);

  // Planchado Assignment State
  const [planchadoAssignmentData, setPlanchadoAssignmentData] = useState<any[]>([]);
  const [tallerIdForPlanchadoSource, setTallerIdForPlanchadoSource] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Pedido | null>(null);
  const [workOrdersToReview, setWorkOrdersToReview] = useState<WorkOrderForReview[]>([]);
  const [workOrdersForRevision, setWorkOrdersForRevision] = useState<WorkOrderForReview[] | null>(null);

  const [refreshWorkshopStageModal, setRefreshWorkshopStageModal] = useState(false);
  const [modalAsignacionConfig, setModalAsignacionConfig] = useState<{ labor: string; etapaDestinoId: string | null }>({
    labor: 'Confección',
    etapaDestinoId: null
  });

  // Data States
  const [orders, setOrders] = useState<Pedido[]>([]);
  const [stageTimes, setStageTimes] = useState<StageTime[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    enProceso: 0,
    completados: 0,
    retrasados: 0,
    totalPedidos: 0,
    totalPrendas: 0,
    defectos: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('todas');
  const [selectedPrioridad, setSelectedPrioridad] = useState('todas');
  const [selectedEtapa, setSelectedEtapa] = useState('todas');
  const [fechaInicio, setFechaInicio] = useState<string | null>(null);
  const [fechaFin, setFechaFin] = useState<string | null>(null);

  // Data States for filters
  const [estados, setEstados] = useState<GenericFilterItem[]>([]);
  const [prioridades, setPrioridades] = useState<GenericFilterItem[]>([]);
  const [etapas, setEtapas] = useState<GenericFilterItem[]>([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const formatTime = (hours: number): string => {
    if (isNaN(hours) || hours < 0) return 'N/A';
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes} min`;
    } else if (hours < 24) {
      return `${hours.toFixed(1)} h`;
    } else if (hours < 24 * 7) {
      const days = Math.round(hours / 24);
      return `${days} día${days === 1 ? '' : 's'}`;
    } else if (hours < 24 * 30) {
      const weeks = Math.round(hours / (24 * 7));
      return `${weeks} semana${weeks === 1 ? '' : 's'}`;
    } else {
      const months = Math.round(hours / (24 * 30));
      return `${months} mes${months === 1 ? '' : 'es'}`;
    }
  };

  const fetchFilters = useCallback(async () => {
    try {
      const [estadosResponse, prioridadesResponse, etapasResponse] = await Promise.all([
        supabase.from('estados_pedido').select('id, nombre'),
        supabase.from('prioridades_pedido').select('id, nombre'),
        supabase.from('etapas').select('id, nombre, codigo').order('indice_orden'),
      ]);
      if (estadosResponse.error) throw estadosResponse.error;
      if (prioridadesResponse.error) throw prioridadesResponse.error;
      if (etapasResponse.error) throw etapasResponse.error;

      setEstados(estadosResponse.data || []);
      setPrioridades(prioridadesResponse.data || []);
      setEtapas(etapasResponse.data || []);
    } catch (err: unknown) {
      setError((err instanceof Error) ? err.message : 'Error al cargar los filtros.');
      console.error('Error fetching filters:', err);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setError(null);
    try {
      await supabase.rpc('actualizar_pedidos_retrasados');

      const { data, error } = await supabase
        .from('vista_pedidos_detalle')
        .select('*')
        .order('numero_pedido', { ascending: false });

      if (error) throw error;

      const pedidos = data as Pedido[];
      setOrders(pedidos);
      setRefreshWorkshopStageModal(prev => !prev);

      const newMetrics = {
        enProceso: pedidos.filter((p: Pedido) => p.nombre_estado?.toLowerCase() === 'en proceso' || p.nombre_estado?.toLowerCase() === 'retrasado').length,
        completados: pedidos.filter((p: Pedido) => p.nombre_estado?.toLowerCase() === 'completado').length,
        retrasados: pedidos.filter((p: Pedido) => p.nombre_estado?.toLowerCase() === 'retrasado').length,
        totalPedidos: pedidos.length,
        totalPrendas: pedidos.reduce((sum: number, p: Pedido) => sum + (p.total_unidades || 0), 0),
        defectos: 0
      };
      setMetrics(newMetrics);

    } catch (err: unknown) {
      console.error('Error fetching data:', err);
      setError((err instanceof Error) ? err.message : 'Error al cargar los datos.');
    }
  }, []);

  const fetchDataForDashboardMetrics = useCallback(async () => {
    try {
      const { data: times, error: timesError } = await supabase.rpc('obtener_tiempos_etapas', { p_fecha_inicio: fechaInicio, p_fecha_fin: fechaFin });
      if (timesError) throw timesError;
      setStageTimes(times);
    } catch (err) {
      console.error("Error fetching dashboard metrics:", err);
    }
  }, [fechaInicio, fechaFin]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([
        fetchFilters(),
        fetchOrders(),
        fetchDataForDashboardMetrics()
      ]);
      setLoading(false);
    };

    loadInitialData();
  }, [fetchFilters, fetchOrders, fetchDataForDashboardMetrics]);

  useEffect(() => {
    const pendingUpdates = new Map<string, NodeJS.Timeout>();

    const handleRealtimeUpdate = async (payload: any) => {
      if (payload.errors) {
        console.error('Realtime error:', payload.errors);
        return;
      }

      const { eventType, table, new: newRecord, old: oldRecord } = payload;

      if (table === 'pedidos' && eventType === 'DELETE') {
        const deletedId = oldRecord?.id;
        if (deletedId) {
          setOrders(prevOrders => prevOrders.filter(p => p.id !== deletedId));
        }
        return;
      }

      let affectedPedidoId: string | null = null;
      if (table === 'pedidos') {
        affectedPedidoId = newRecord?.id;
      } else if (table === 'ordenes_de_trabajo') {
        affectedPedidoId = newRecord?.id_pedido || oldRecord?.id_pedido;
      }

      if (affectedPedidoId) {
        if (pendingUpdates.has(affectedPedidoId)) {
          clearTimeout(pendingUpdates.get(affectedPedidoId)!);
        }

        const timeout = setTimeout(async () => {
          try {
            const { data: updatedPedido, error } = await supabase
              .from('vista_pedidos_detalle')
              .select('*')
              .eq('id', affectedPedidoId)
              .single();

            if (error) {
              console.error('Error fetching updated pedido:', error);
              fetchOrders();
              return;
            }

            if (updatedPedido) {
              setOrders(prevOrders => {
                const exists = prevOrders.some(p => p.id === updatedPedido.id);
                if (!exists && eventType === 'INSERT' && table === 'pedidos') {
                  return [updatedPedido, ...prevOrders];
                }
                return prevOrders.map(p => p.id === updatedPedido.id ? updatedPedido : p);
              });
            }
          } catch (err) {
            console.error('Failed to process realtime update:', err);
          } finally {
            pendingUpdates.delete(affectedPedidoId!);
          }
        }, 300);

        pendingUpdates.set(affectedPedidoId, timeout);
      }
    };

    const subscription = supabase
      .channel('dashboard-page-realtime-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, handleRealtimeUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_de_trabajo' }, handleRealtimeUpdate)
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
      pendingUpdates.forEach(timeout => clearTimeout(timeout));
    };
  }, [fetchOrders]);

  const handleViewDetails = (order: Pedido) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const handleCloseDetails = () => {
    setIsDetailsModalOpen(false);
    setSelectedOrder(null);
  };

  const handleAdvanceStageClick = async (order: Pedido) => {
    setSelectedOrder(order);
    const stageCode = order.codigo_etapa_actual;

    if (stageCode === 'RECEPCION' || stageCode === 'CONFECCION' || stageCode === 'REVISION' || stageCode === 'OJAL_BOTON' || stageCode === 'PLANCHADO' || stageCode === 'ENTREGA') {
      setIsWorkshopStageModalOpen(true);
    } else if (stageCode === 'PREPARACION') {
      setApprovedGarments([]);
      setModalAsignacionConfig({ labor: 'Confección', etapaDestinoId: null });
      setIsAsignarProduccionModalOpen(true);
    } else {
      setIsAdvanceStageModalOpen(true);
    }
  };

  const handleCloseAdvanceStageModal = () => {
    setIsAdvanceStageModalOpen(false);
    setSelectedOrder(null);
  };

  const onStageAdvanced = () => {
    fetchOrders();
    setIsAdvanceStageModalOpen(false);
    setSelectedOrder(null);
  };

  const onAsignacionCompleta = () => {
    fetchOrders();
    setApprovedGarments([]);
    setIsAsignarProduccionModalOpen(false);
    setSelectedOrder(null);
  };

  const handleCloseAsignarProduccion = () => {
    setIsAsignarProduccionModalOpen(false);
    setApprovedGarments([]);
    setSelectedOrder(null);
  };

  const onAsignacionOjalCompleta = () => {
    fetchOrders();
    setApprovedGarments([]);
    setIsAsignarOjalModalOpen(false);
    setSelectedOrder(null);
  };

  const handleCloseAsignarOjal = () => {
    setIsAsignarOjalModalOpen(false);
    setApprovedGarments([]);
    setSelectedOrder(null);
  };

  const handleWorkshopStageAdvanced = () => {
    fetchOrders();
    setRefreshWorkshopStageModal(prev => !prev);
  };

  const handleInitiateReceiverAssignment = (orderId: string, tallerId: string, etapaId: string, esDevuelto: boolean) => {
    setOrderIdForReceiverAssignment(orderId);
    setTallerIdForReceiverAssignment(tallerId);
    setEtapaIdForReceiverAssignment(etapaId);
    setEsDevueltoForReceiverAssignment(esDevuelto);
    setIsAsignarReceptorModalOpen(true);
    setIsWorkshopStageModalOpen(false);
  };

  const handleInitiateReceptionConfirmation = (workOrders: WorkOrderForReview[]) => {
    setWorkOrdersToReview(workOrders);
    setPedidoIdForRecepcion(selectedOrder?.id || null);
    setTrabajadorIdForRecepcion(user?.trabajador_id || null);
    setIsRecepcionTallerModalOpen(true);
  };

  const handleConfirmReceiverAssignment = async (trabajadorId: string, orderId: string, tallerId: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!user || !user.trabajador_id) {
        throw new Error("Usuario no autenticado o ID de trabajador no disponible.");
      }
      const { error: rpcError } = await supabase.rpc('avanzar_taller_a_recepcion', {
        p_id_pedido: orderId,
        p_id_taller: tallerId,
        p_id_receptor_asignado: trabajadorId,
        p_id_trabajador_logueado: user.trabajador_id,
        p_id_etapa_origen: etapaIdForReceiverAssignment,
        p_es_devuelto: esDevueltoForReceiverAssignment
      });
      if (rpcError) throw rpcError;

      fetchOrders();
      setIsAsignarReceptorModalOpen(false);
    } catch (err: unknown) {
      setError(`Error al confirmar la asignación del receptor: ${(err instanceof Error) ? err.message : 'Unknown error'}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateRevisionResults = (tallerId: string, workOrders: WorkOrderForReview[], tallerNombre: string, allWorkOrders: WorkOrderForReview[]) => {
    setWorkOrdersForResults(workOrders);
    setAllTallerWorkOrders(allWorkOrders);
    setSelectedTallerNombre(tallerNombre);
    setActiveTallerIdForRevision(tallerId);
    setIsWorkshopStageModalOpen(false);
    setIsRevisionResultsModalOpen(true);
  };

  const handleInitiatePlanchadoResults = (workOrders: WorkOrderForReview[], tallerNombre: string) => {
    setWorkOrdersForPlanchadoResults(workOrders);
    setSelectedTallerNombre(tallerNombre);
    setIsWorkshopStageModalOpen(false);
    setIsConfirmarPlanchadoModalOpen(true);
  };

  const handleInitiatePlanchadoAssignment = async (orderId: string, tallerIdSource: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: workOrders, error: woError } = await supabase
        .from('ordenes_de_trabajo')
        .select(`
          id,
          cantidad_asignada,
          id_referencia (id, nombre, imagen_url),
          id_talla (id, nombre),
          id_etapa_actual (id, nombre, codigo),
          estado,
          asignado_sig_etapa
        `)
        .eq('id_pedido', orderId)
        .eq('id_taller', tallerIdSource);

      if (woError) throw woError;

      if (!workOrders || workOrders.length === 0) {
        alert("No se encontraron órdenes de trabajo para este taller.");
        setLoading(false);
        return;
      }

      const validOrders = workOrders.filter((wo: any) => {
        const stageCode = wo.id_etapa_actual?.codigo;
        const status = wo.estado;
        const alreadyAssigned = wo.asignado_sig_etapa;

        if (stageCode === 'OJAL_BOTON') return status === 'pendiente';
        if (stageCode === 'REVISION') return status === 'completada' && !alreadyAssigned;
        if (stageCode === 'PLANCHADO') return status === 'pendiente';
        return status === 'pendiente' || (status === 'completada' && !alreadyAssigned);
      });

      if (validOrders.length === 0) {
        alert("No hay prendas disponibles para asignar a planchado.");
        setLoading(false);
        return;
      }

      const formattedData = validOrders.map((wo: any) => {
        const ref = Array.isArray(wo.id_referencia) ? wo.id_referencia[0] : wo.id_referencia;
        const talla = Array.isArray(wo.id_talla) ? wo.id_talla[0] : wo.id_talla;
        return {
          id_referencia: ref.id,
          nombre_referencia: ref.nombre,
          imagen_url: ref.imagen_url,
          id_talla: talla.id,
          nombre_talla: talla.nombre,
          cantidad_aprobada: wo.cantidad_asignada,
          id_original: wo.id
        };
      });

      setPlanchadoAssignmentData([...formattedData]);
      setTallerIdForPlanchadoSource(tallerIdSource);
      setIsWorkshopStageModalOpen(false);
      setIsAsignarPlanchadoModalOpen(true);
    } catch (err: any) {
      console.error("Error al capturar piezas para planchar:", err);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmFinalDelivery = async (tallerId: string) => {
    if (!selectedOrder || !user?.trabajador_id) return;
    setLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc('confirmar_entrega_final_taller', {
        p_id_pedido: selectedOrder.id,
        p_id_taller: tallerId,
        p_id_usuario_accion: user.trabajador_id
      });
      if (rpcError) throw rpcError;
      handleWorkshopStageAdvanced();
    } catch (err: any) {
      console.error("Error confirming final delivery:", err);
      alert(`Error al confirmar entrega: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFlow = async (flow: 'OJAL' | 'PLANCHADO') => {
    setLoading(true);
    try {
      const { data: etapaRevision } = await supabase.from('etapas').select('id').eq('codigo', 'REVISION').single();
      if (!etapaRevision) throw new Error("No se encontró la etapa de Revisión");

      const { data: workOrders, error: woError } = await supabase
        .from('ordenes_de_trabajo')
        .select(`
          id,
          cantidad_asignada,
          id_referencia (id, nombre, imagen_url),
          id_talla (id, nombre),
          id_taller,
          estado,
          asignado_sig_etapa
        `)
        .eq('id_pedido', selectedOrder?.id)
        .eq('id_etapa_actual', etapaRevision.id)
        .eq('estado', 'completada')
        .eq('asignado_sig_etapa', false)
        .eq('id_taller', activeTallerIdForRevision);

      if (woError) throw woError;

      if (!workOrders || workOrders.length === 0) {
        alert("No se encontraron prendas aprobadas nuevas por asignar para este taller.");
        setIsFlowDecisionModalOpen(false);
        setLoading(false);
        return;
      }

      const formattedData = workOrders.map((wo: any) => {
        const ref = Array.isArray(wo.id_referencia) ? wo.id_referencia[0] : wo.id_referencia;
        const talla = Array.isArray(wo.id_talla) ? wo.id_talla[0] : wo.id_talla;
        return {
          id_referencia: ref.id,
          nombre_referencia: ref.nombre,
          imagen_url: ref.imagen_url,
          id_talla: talla.id,
          nombre_talla: talla.nombre,
          cantidad_aprobada: wo.cantidad_asignada,
          id_original: wo.id
        };
      });

      setIsFlowDecisionModalOpen(false);
      if (flow === 'OJAL') {
        setApprovedGarments(formattedData);
        setTimeout(() => setIsAsignarOjalModalOpen(true), 100);
      } else {
        setPlanchadoAssignmentData(formattedData);
        setTallerIdForPlanchadoSource(activeTallerIdForRevision);
        setTimeout(() => setIsAsignarPlanchadoModalOpen(true), 100);
      }
    } catch (err: any) {
      console.error("Error consolidando prendas aprobadas:", err);
      alert(`Error al cargar prendas: ${err.message}`);
      setIsFlowDecisionModalOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const refreshRevisionWorkOrders = async () => {
    if (!selectedOrder || !activeTallerIdForRevision) return;
    try {
      const { data, error } = await supabase.from('ordenes_de_trabajo').select(`
            id,
            cantidad_asignada,
            id_taller,
            estado,
            id_referencia (id, nombre, imagen_url),
            id_talla (id, nombre),
            id_etapa_actual (nombre),
            id_trabajador_asignado (id, nombre_trabajador)
        `)
        .eq('id_pedido', selectedOrder.id);
      if (error) throw error;

      const workOrderData = (data || []).map((wo: any) => ({
        ...wo,
        id_referencia: (Array.isArray(wo.id_referencia) ? wo.id_referencia[0] : wo.id_referencia),
        id_talla: (Array.isArray(wo.id_talla) ? wo.id_talla[0] : wo.id_talla),
        id_trabajador_asignado: (Array.isArray(wo.id_trabajador_asignado) ? wo.id_trabajador_asignado[0] : wo.id_trabajador_asignado)
      })) as WorkOrderForReview[];

      const tallerOrders = workOrderData.filter(wo => wo.id_taller === activeTallerIdForRevision);
      setAllTallerWorkOrders(tallerOrders);

      const pendingOrders = tallerOrders.filter(wo =>
        wo.id_etapa_actual?.nombre === 'Revisión' &&
        (wo.estado === 'pendiente' || wo.estado === 'recibida' || wo.estado === 'recibida_incompleta' || wo.estado === 'completada')
      );
      setWorkOrdersForResults(pendingOrders);
    } catch (err) {
      console.error("Error refreshing revision work orders:", err);
    }
  };

  const handleAdvanceWorkshopToRevision = (orderId: string, tallerId: string, workOrdersForTaller: WorkOrderForReview[]) => {
    setSelectedOrder(orders.find(o => o.id === orderId) || null);
    setWorkOrdersForRevision(workOrdersForTaller);
    setTallerIdForRevision(tallerId);
    setIsAsignarRevisorModalOpen(true);
  };

  const onOrderCreated = () => {
    fetchOrders();
    setIsNewOrderModalOpen(false);
  };

  const handleResultsConfirmed = (approved: any[]) => {
    setApprovedGarments([]);
    setPlanchadoAssignmentData([]);
    setApprovedGarments(approved);
    setIsFlowDecisionModalOpen(true);
    setIsRevisionResultsModalOpen(false);
  };

  const renderStageCell = (order: Pedido) => {
    if (order.numero_de_etapas_activas > 1 && order.desglose_etapas) {
      const tooltipContent = (
        <div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-0">Desglose de Etapas</h4>
          <ul className="list-disc pl-5 space-y-1">
            {order.desglose_etapas.map(d => (
              <li key={d.etapa}>
                <span className="font-semibold">{d.etapa}:</span> {d.cantidad} unidades
              </li>
            ))}
          </ul>
        </div>
      );
      return (
        <SmartTooltip content={tooltipContent}>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500 text-white">
            Multi-Etapa
          </span>
        </SmartTooltip>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500 text-white">
        {order.nombre_etapa_actual}
      </span>
    );
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const searchMatch = searchTerm === '' || `P${String(order.numero_pedido).padStart(3, '0')}`.toLowerCase().includes(searchTerm.toLowerCase());
      const estadoMatch = selectedEstado === 'todas' || order.nombre_estado === selectedEstado;
      const prioridadMatch = selectedPrioridad === 'todas' || order.nombre_prioridad === selectedPrioridad;
      const etapaMatch = selectedEtapa === 'todas' || order.nombre_etapa_actual === selectedEtapa;
      return searchMatch && estadoMatch && prioridadMatch && etapaMatch;
    });
  }, [orders, searchTerm, selectedEstado, selectedPrioridad, selectedEtapa]);

  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredOrders.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredOrders, currentPage, rowsPerPage]);

  const stages = [
    { name: "Ingreso", icon: Calendar, color: "bg-blue-500" },
    { name: "Corte", icon: Scissors, color: "bg-purple-500" },
    { name: "Preparación", icon: Truck, color: "bg-green-500" },
    { name: "Confección", icon: Shirt, color: "bg-yellow-500" },
    { name: "Recepción", icon: Package, color: "bg-orange-500" },
    { name: "Revisión", icon: Eye, color: "bg-red-500" },
    { name: "Ojal y botón", icon: CheckSquare, color: "bg-indigo-500" },
    { name: "Planchado", icon: Zap, color: "bg-pink-500" },
    { name: "Entrega", icon: CheckCircle, color: "bg-emerald-500" }
  ];

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">Cargando Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-start">
          <DateRangePicker
            initialStartDate={fechaInicio}
            initialEndDate={fechaFin}
            onRangeChange={(start, end) => {
              setFechaInicio(start);
              setFechaFin(end);
            }}
          />
        </div>

        {/* Métricas Principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">En Proceso</p>
                <p className="text-2xl font-semibold mt-1 text-gray-800 dark:text-gray-100">{metrics.enProceso}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Completados</p>
                <p className="text-2xl font-semibold mt-1 text-gray-800 dark:text-gray-100">{metrics.completados}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-500">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Retrasados</p>
                <p className="text-2xl font-semibold mt-1 text-gray-800 dark:text-gray-100">{metrics.retrasados}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Pedidos</p>
                <p className="text-2xl font-semibold mt-1 text-gray-800 dark:text-gray-100">{metrics.totalPedidos}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-purple-500">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Flujo de Etapas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Flujo de Etapas del Pedido</h2>
          <div className="flex items-center overflow-x-auto pb-4 justify-between">
            {stages.map((stage, index) => (
              <div key={stage.name} className="flex items-center">
                <div className="flex flex-col items-center min-w-[120px]">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stage.color} shadow-sm`}>
                    <stage.icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-sm font-medium mt-2 text-center text-gray-800 dark:text-gray-100">{stage.name}</p>
                  <p className="text-xs text-center mt-1 text-gray-500 dark:text-gray-400">
                    {formatTime(stageTimes.find(st =>
                      st.stage.toLowerCase().includes(stage.name.toLowerCase()) ||
                      (stage.name === 'Preparación' && st.stage.toLowerCase().includes('preparación')) ||
                      (stage.name === 'Ojal y botón' && st.stage.toLowerCase().includes('ojal'))
                    )?.realtime || 0)} promedio
                  </p>
                </div>
                {index < stages.length - 1 && (
                  <div className="flex-1 h-0.5 w-0 bg-gray-200 dark:bg-gray-700"></div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Análisis de Tiempos */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center">
              Análisis de Tiempos por Etapa
              <SmartTooltip content={
                <div className="p-2 text-sm text-gray-700 dark:text-gray-200">
                  <p><strong className="text-gray-900 dark:text-gray-50">Meta:</strong> El tiempo objetivo establecido para cada etapa de producción.</p>
                  <p><strong className="text-900 dark:text-gray-50">Real:</strong> El tiempo promedio que actualmente toma completar cada etapa.</p>
                  <p><strong className="text-gray-900 dark:text-gray-50">% Efectividad:</strong> Indica qué tan cerca está el tiempo real del objetivo. Permite identificar rápidamente etapas eficientes (alto %) o cuellos de botella (bajo %).</p>
                </div>
              }>
                <Info size={18} className="ml-2 text-gray-400 dark:text-gray-500 cursor-pointer" />
              </SmartTooltip>
            </h2>
            <div className="space-y-4">
              {stageTimes.map((stage) => (
                <div key={stage.stage} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{stage.stage}</span>
                    <div className="flex items-center space-x-4">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        <strong className="font-medium">Meta:</strong> {formatTime(stage.avgtime || 0)} / <strong className="font-medium">Real:</strong> {formatTime(stage.realtime || 0)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${stage.efficiency >= 100 ? 'bg-green-100 dark:bg-green-900 dark:text-green-300 text-green-800' :
                        stage.efficiency >= 80 ? 'bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300 text-yellow-800' : 'bg-red-100 dark:bg-red-900 dark:text-red-300 text-red-800'
                        }`}>
                        {stage.efficiency.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        backgroundColor: stage.efficiency >= 100 ? '#62D2C3' : stage.efficiency >= 80 ? '#4A6CF7' : '#EF4444',
                        width: `${Math.min(stage.efficiency, 100)}%`
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Productividad del Taller */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Productividad del Taller</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">María González</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Confección</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">25 prendas</p>
                  <p className="text-sm text-green-600 dark:text-green-400">0 defectos</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">Carlos Ruiz</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Revisión</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">30 prendas</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">2 defectos</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">Ana López</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Corte</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">50 prendas</p>
                  <p className="text-sm text-green-600 dark:text-green-400">0 defectos</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Defectos</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{metrics.defectos}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Tasa de Calidad</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {metrics.totalPrendas > 0 ? ((metrics.totalPrendas - metrics.defectos) / metrics.totalPrendas * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Pedidos en Curso */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Lista de pedidos</h2>
            <button onClick={() => setIsNewOrderModalOpen(true)} className="px-4 py-2 rounded-full text-sm font-medium text-white transition-all hover:scale-105 bg-blue-500 hover:bg-blue-600">
              Nuevo Pedido
            </button>
          </div>

          {/* --- Filtros y Búsqueda --- */}
          <div className="bg-white dark:bg-gray-800/50 rounded-xl p-4 mb-4 shadow-sm border dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[150px]">
                <input type="text" placeholder="Buscar por N° Pedido..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>

              <div className="flex-1 min-w-[150px]">
                <FilterDropdown
                  label="Estado"
                  placeholder="Todos"
                  options={estados}
                  selectedValue={selectedEstado}
                  onSelect={setSelectedEstado}
                  showAllOption={true}
                  allOptionLabel="Todos los Estados"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <FilterDropdown
                  label="Prioridad"
                  placeholder="Todas"
                  options={prioridades}
                  selectedValue={selectedPrioridad}
                  onSelect={setSelectedPrioridad}
                  showAllOption={true}
                  allOptionLabel="Todos los Prioridades"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <FilterDropdown
                  label="Etapa"
                  placeholder="Todas"
                  options={etapas}
                  selectedValue={selectedEtapa}
                  onSelect={setSelectedEtapa}
                  showAllOption={true}
                  allOptionLabel="Todas las Etapas"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800/50 rounded-xl p-4 shadow-sm border dark:border-gray-700">
            {loading && <p className="text-gray-500 dark:text-gray-400 text-center py-4">Cargando pedidos...</p>}
            {!loading && !error && filteredOrders.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                {orders.length > 0 ? "No se encontraron pedidos que coincidan con los filtros." : "Aún no hay pedidos registrados."}
              </p>
            )}
            {!loading && !error && filteredOrders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-center py-3 px-4 font-medium text-sm text-gray-500 dark:text-gray-400">Pedido</th>
                      <th className="text-center py-3 px-4 font-medium text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Etapa</th>
                      <th className="text-center py-3 px-4 font-medium text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Duración</th>
                      <th className="text-center py-3 px-4 font-medium text-sm text-gray-500 dark:text-gray-400">Estado</th>
                      <th className="text-center py-3 px-4 font-medium text-sm text-gray-500 dark:text-gray-400">Prioridad</th>
                      <th className="text-center py-3 px-4 font-medium text-sm text-gray-500 dark:text-gray-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order) => {
                      return (
                        <tr key={order.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <td className="py-4 px-4 text-center"><span className="font-medium text-gray-800 dark:text-gray-100">{`P${String(order.numero_pedido).padStart(3, '0')}`}</span></td>
                          <td className="py-4 px-4 text-center whitespace-nowrap">{renderStageCell(order)}</td>
                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span className="font-medium text-gray-800 dark:text-gray-100">
                              {order.nombre_estado === 'Completado'
                                ? formatTotalDuration(order.creado_en, order.finalizacion_real)
                                : <DynamicDuration startDate={order.fecha_inicio_etapa_actual || order.creado_en} />}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {(() => {
                                if (order.nombre_estado === 'Completado') return null;
                                const daysSinceCreation = Math.floor((Date.now() - new Date(order.creado_en).getTime()) / (1000 * 60 * 60 * 24));
                                let circleColor = 'bg-green-500';
                                if (daysSinceCreation >= 45) {
                                  circleColor = 'bg-red-500';
                                } else if (daysSinceCreation >= 36) {
                                  circleColor = 'bg-yellow-500';
                                }
                                return <div className={`w-2.5 h-2.5 rounded-full ${circleColor}`} title={`${daysSinceCreation} días desde creación`} />;
                              })()}
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${order.nombre_estado === 'Completado' ? 'bg-green-100 dark:bg-green-900 dark:text-green-300 text-green-800' : order.nombre_estado === 'Retrasado' ? 'bg-red-100 dark:bg-red-900 dark:text-red-300 text-red-800' : 'bg-blue-100 dark:bg-blue-900 dark:text-blue-300 text-blue-800'}`}>{order.nombre_estado}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-medium ${order.nombre_prioridad?.toLowerCase() === 'alta' ? 'bg-red-100 dark:bg-red-900 dark:text-red-300 text-red-800' : order.nombre_prioridad?.toLowerCase() === 'media' ? 'bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300 text-yellow-800' : order.nombre_prioridad?.toLowerCase() === 'baja' ? 'bg-green-100 dark:bg-green-900 dark:text-green-300 text-green-800' : 'bg-gray-100 dark:bg-gray-900 dark:text-gray-300 text-gray-800'}`}>{order.nombre_prioridad}</span></td>
                          <td className="py-4 px-4 text-center">
                            <div className="flex space-x-2 justify-center">
                              <button onClick={() => handleViewDetails(order)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" title="Ver Detalles"><EyeIcon className="w-4 h-4 text-green-500" /></button>
                              {order.nombre_estado !== 'Completado' && order.nombre_estado !== 'Cancelado' && (
                                <button
                                  onClick={() => handleAdvanceStageClick(order)}
                                  className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                  title="Avanzar etapa">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-play w-4 h-4 text-blue-500"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="mt-4 flex items-center justify-between">
                  <RowsPerPageSelector value={rowsPerPage} onChange={setRowsPerPage} />
                  <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Botones de Acción Rápida */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all hover:scale-105 text-left">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Generar Reporte</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Reporte de productividad semanal</p>
              </div>
            </div>
          </button>

          <button className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all hover:scale-105 text-left">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-500">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Asignar Modista</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Reasignar pedidos pendientes</p>
              </div>
            </div>
          </button>

          <button className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all hover:scale-105 text-left">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-purple-500">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Alertas</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ver pedidos con retraso</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <NewOrderModal isOpen={isNewOrderModalOpen} onClose={() => setIsNewOrderModalOpen(false)} onOrderCreated={onOrderCreated} />
      <OrderDetailsModal isOpen={isDetailsModalOpen} onClose={handleCloseDetails} order={selectedOrder} onOrderUpdated={fetchOrders} />
      <AdvanceStageModal isOpen={isAdvanceStageModalOpen} onClose={handleCloseAdvanceStageModal} order={selectedOrder} onStageAdvanced={onStageAdvanced} />
      <AsignarProduccionModal
        isOpen={isAsignarProduccionModalOpen}
        onClose={handleCloseAsignarProduccion}
        pedido={selectedOrder}
        onAsignacionCompleta={onAsignacionCompleta}
        labor={modalAsignacionConfig.labor}
        etapaDestinoId={modalAsignacionConfig.etapaDestinoId}
        approvedWorkOrders={approvedGarments}
      />
      <FlowDecisionModal
        isOpen={isFlowDecisionModalOpen}
        onClose={() => setIsFlowDecisionModalOpen(false)}
        onSelectFlow={handleSelectFlow}
        pedidoId={selectedOrder?.id || null}
        pedidoNumero={selectedOrder?.numero_pedido}
      />
      <WorkshopStageModal
        isOpen={isWorkshopStageModalOpen}
        onClose={() => setIsWorkshopStageModalOpen(false)}
        orderId={selectedOrder?.id || null}
        onWorkshopStageAdvanced={handleWorkshopStageAdvanced}
        onInitiateReceiverAssignment={handleInitiateReceiverAssignment}
        onInitiateReceptionConfirmation={handleInitiateReceptionConfirmation}
        onAdvanceWorkshopToRevision={handleAdvanceWorkshopToRevision}
        onInitiateRevisionResults={handleInitiateRevisionResults}
        onInitiatePlanchadoResults={handleInitiatePlanchadoResults}
        onInitiatePlanchadoAssignment={handleInitiatePlanchadoAssignment}
        onConfirmFinalDelivery={handleConfirmFinalDelivery}
        onRefreshTrigger={refreshWorkshopStageModal}
        orderNumber={selectedOrder?.numero_pedido}
      />
      {isAsignarRevisorModalOpen && (
        <AsignarRevisorModal
          isOpen={isAsignarRevisorModalOpen}
          onClose={() => setIsAsignarRevisorModalOpen(false)}
          workOrders={workOrdersForRevision || []}
          onRevisionComplete={() => {
            setIsAsignarRevisorModalOpen(false);
            setIsWorkshopStageModalOpen(false);
            fetchOrders();
          }}
          orderId={selectedOrder?.id || ''}
          orderNumber={selectedOrder?.numero_pedido}
          id_taller_revision={tallerIdForRevision || ''}
        />
      )}

      <AsignarOjalModal
        isOpen={isAsignarOjalModalOpen}
        onClose={handleCloseAsignarOjal}
        pedido={selectedOrder}
        onAsignacionCompleta={onAsignacionOjalCompleta}
        approvedWorkOrders={approvedGarments}
      />

      <AsignarPlanchadoModal
        isOpen={isAsignarPlanchadoModalOpen}
        onClose={() => {
          setIsAsignarPlanchadoModalOpen(false);
          setPlanchadoAssignmentData([]);
          fetchOrders();
        }}
        orderId={selectedOrder?.id || ''}
        orderNumber={selectedOrder?.numero_pedido}
        id_taller_revision={tallerIdForPlanchadoSource || ''}
        approvedWorkOrders={planchadoAssignmentData}
        onAsignacionComplete={() => {
          fetchOrders();
          setIsAsignarPlanchadoModalOpen(false);
          setPlanchadoAssignmentData([]);
        }}
      />

      <RecepcionTallerModal
        isOpen={isRecepcionTallerModalOpen}
        onClose={() => setIsRecepcionTallerModalOpen(false)}
        workOrders={workOrdersToReview}
        pedidoId={pedidoIdForRecepcion}
        trabajadorId={trabajadorIdForRecepcion}
        onRecepcionComplete={() => {
          setIsRecepcionTallerModalOpen(false);
          fetchOrders();
          setIsWorkshopStageModalOpen(false);
          setIsWorkshopStageModalOpen(true);
        }}
      />
      <AsignarReceptorModal
        isOpen={isAsignarReceptorModalOpen}
        onClose={() => setIsAsignarReceptorModalOpen(false)}
        onConfirm={handleConfirmReceiverAssignment}
        orderId={orderIdForReceiverAssignment || ''}
        tallerId={tallerIdForReceiverAssignment || ''}
      />
      <ConfirmarReparacionModal
        isOpen={isReparacionModalOpen}
        onClose={() => {
          setIsReparacionModalOpen(false);
          if (!isRevisionResultsModalOpen) {
            setIsWorkshopStageModalOpen(true);
          }
        }}
        workOrders={workOrdersForRepair}
        onRepairsConfirmed={() => {
          fetchOrders();
          refreshRevisionWorkOrders();
          setIsReparacionModalOpen(false);
          if (!isRevisionResultsModalOpen) {
            setIsWorkshopStageModalOpen(true);
          }
        }}
      />
      {isRevisionResultsModalOpen && (
        <RevisionResultsModal
          isOpen={isRevisionResultsModalOpen}
          onClose={() => {
            setIsRevisionResultsModalOpen(false);
            setIsWorkshopStageModalOpen(true);
          }}
          workOrders={workOrdersForResults}
          allTallerWorkOrders={allTallerWorkOrders}
          numeroPedido={selectedOrder?.numero_pedido}
          tallerNombre={selectedTallerNombre}
          onResultsConfirmed={handleResultsConfirmed}
          onManageRepairs={(_tallerId, workOrders) => {
            setWorkOrdersForRepair(workOrders);
            setIsReparacionModalOpen(true);
          }}
          onRefresh={refreshRevisionWorkOrders}
        />
      )}

      {isConfirmarPlanchadoModalOpen && (
        <ConfirmarPlanchadoModal
          isOpen={isConfirmarPlanchadoModalOpen}
          onClose={() => {
            setIsConfirmarPlanchadoModalOpen(false);
            setIsWorkshopStageModalOpen(true);
          }}
          onConfirmComplete={() => {
            setIsConfirmarPlanchadoModalOpen(false);
            fetchOrders();
          }}
          workOrders={workOrdersForPlanchadoResults}
          numeroPedido={selectedOrder?.numero_pedido}
        />
      )}
    </div>
  );
}