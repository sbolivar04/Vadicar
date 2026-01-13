import TallaCantidadBadge from './TallaCantidadBadge';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Portal from './Portal';
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ImagePreviewModal from './ImagePreviewModal';
import EditReferenceModal from './EditReferenceModal';
import EditOrderReferenceQuantitiesModal from './EditOrderReferenceQuantitiesModal';
import { Pedido } from '../types';

// --- TYPE DEFINITIONS ---
interface WorkOrder {
  id: string;
  cantidad_asignada: number;
  id_taller: { nombre: string };
  id_referencia: { nombre: string; imagen_url: string | null };
  id_talla: { nombre: string };
  id_etapa_actual: { nombre: string; id: string };
  id_trabajador_asignado?: { nombre_trabajador: string } | null;
  creado_en: string;
  actualizado_en: string;
  estado: string;
  origen_reproceso?: string;
}

interface EtapaMaster {
  id: string;
  nombre: string;
  codigo: string;
  indice_orden: number;
}

interface AggregatedReference {
  id: string;
  nombre: string;
  imagen_url: string | null;
  precio_unitario: number;
  total_cantidad: number;
  tallas: { [talla_nombre: string]: number };
}

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Pedido | null;
  onOrderUpdated?: () => void; // Prop para notificar actualizaciones
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ isOpen, onClose, order, onOrderUpdated }) => {
  const [details, setDetails] = useState<AggregatedReference[] | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [etapasMaster, setEtapasMaster] = useState<EtapaMaster[]>([]);
  const [orderHistory, setOrderHistory] = useState<any[]>([]); // Historial de transiciones generales
  const [woHistory, setWoHistory] = useState<any[]>([]); // Historial de órdenes de trabajo (Talleres)
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isEditReferenceModalOpen, setIsEditReferenceModalOpen] = useState(false);
  const [isEditQuantitiesModalOpen, setIsEditQuantitiesModalOpen] = useState(false);
  const [editingReference, setEditingReference] = useState<any | null>(null);
  const [shortages, setShortages] = useState<any[]>([]);

  // Estados para secciones contraíbles (cerradas por defecto)
  const [expandedSections, setExpandedSections] = useState({
    general: true, // Información General abierta por defecto
    workshop: false,
    responsible: false,
    history: false, // Regresando a contraído por defecto según solicitud
    references: true // Resumen de Referencias abierto por defecto
  });

  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => ({
      ...prev,
      [stageId]: !prev[stageId]
    }));
  };


  const cronologiaHistorial = useMemo(() => {
    // Definimos el mapa de etapas basado en el maestro para asegurar que salgan todas
    const etapasMap = new Map<string, any>();

    // 1. Encontrar el índice de la etapa actual del pedido para saber qué etapas ya pasaron
    const currentEtapaMaster = etapasMaster.find(e => e.id === order?.id_etapa_actual);
    const currentIndex = currentEtapaMaster?.indice_orden ?? -1;

    // Inicializamos el mapa con todas las etapas conocidas
    etapasMaster.forEach(e => {
      const stageCode = e.codigo || '';
      const esEtapaProduccionTaller = stageCode === 'CONFECCION' || stageCode === 'OJAL_BOTON';

      etapasMap.set(e.id, {
        id: e.id,
        nombreEtapa: e.nombre,
        indice_orden: e.indice_orden,
        esEtapaProduccionTaller,
        responsables: new Map<string, any>(),
        estaEtapaCompletada: e.indice_orden < currentIndex || (order?.nombre_estado?.toLowerCase() === 'completado'),
        estaEtapaActual: e.id === order?.id_etapa_actual,
        fechaInicioEtapa: null,
        fechaFinEtapa: null,
        cantidadTotalEtapa: 0,
        cantidadPendienteEtapa: 0,
        woIdsVistosEtapa: new Set<string>(),
        faltantes: [] as any[]
      });
    });

    // Mapa auxiliar para faltantes
    const missingMap = new Map<string, number>();
    shortages.forEach(s => {
      missingMap.set(s.id_orden_trabajo, (missingMap.get(s.id_orden_trabajo) || 0) + s.cantidad_faltante);
    });

    // 2. Procesar el HISTORIAL de transiciones generales (Gestión de pedido)
    orderHistory.forEach(h => {
      const etapaId = h.id_etapa;
      if (!etapaId || !etapasMap.has(etapaId)) return;
      const etapa = etapasMap.get(etapaId);

      // Si la etapa es de taller, NO mostramos trabajadores de gestión aquí, solo producción técnica.
      // Si la etapa es de oficina/revisión, NO mostramos talleres, solo personal interno.
      const worker = Array.isArray(h.id_trabajador) ? h.id_trabajador[0] : h.id_trabajador;
      const workshop = Array.isArray(h.id_taller) ? h.id_taller[0] : h.id_taller;

      if (etapa.esEtapaProduccionTaller) {
        if (!workshop) return; // En confección solo talleres
      } else {
        if (workshop && !worker) return; // En revisión/recepción solo trabajadores
      }

      const responsableNombre = worker?.nombre_trabajador || workshop?.nombre || (!etapa.esEtapaProduccionTaller && !worker ? 'Personal Administrativo' : null);
      if (!responsableNombre) return;

      const iniciado = h.iniciado_en;
      const completado = h.completado_en;

      if (!etapa.fechaInicioEtapa || (iniciado && new Date(iniciado) < new Date(etapa.fechaInicioEtapa))) {
        etapa.fechaInicioEtapa = iniciado;
      }
      if (completado && (!etapa.fechaFinEtapa || new Date(completado) > new Date(etapa.fechaFinEtapa))) {
        etapa.fechaFinEtapa = completado;
      }

      const actualizadorNombre = h.id_usuario_actualizacion_etapa?.nombre_trabajador;

      if (!etapa.responsables.has(responsableNombre)) {
        etapa.responsables.set(responsableNombre, {
          nombre: responsableNombre,
          tipo: workshop ? 'taller' : 'trabajador',
          cantidadTotal: 0,
          estaCompletado: !!completado,
          fechaFinalizacion: completado || iniciado,
          fechaInicio: iniciado,
          detalles: new Map<string, any>(),
          esDelHistorial: true,
          actualizadoPor: actualizadorNombre,
          woIdsVistos: new Set<string>()
        });
      }
    });

    // 3. Procesar el HISTORIAL de órdenes de trabajo (Producción y Revisiones)
    woHistory.forEach(h => {
      const etapaId = h.id_etapa;
      if (!etapaId || !etapasMap.has(etapaId)) return;
      const etapa = etapasMap.get(etapaId);

      const iniciado = h.iniciado_en;
      const completado = h.completado_en;

      if (!etapa.fechaInicioEtapa || (iniciado && new Date(iniciado) < new Date(etapa.fechaInicioEtapa))) {
        etapa.fechaInicioEtapa = iniciado;
      }
      if (completado && (!etapa.fechaFinEtapa || new Date(completado) > new Date(etapa.fechaFinEtapa))) {
        etapa.fechaFinEtapa = completado;
      }

      const orderData = Array.isArray(h.id_orden_trabajo) ? h.id_orden_trabajo[0] : h.id_orden_trabajo;
      if (!orderData || !orderData.id) return;

      const workshopInfo = Array.isArray(orderData.id_taller) ? orderData.id_taller[0] : orderData.id_taller;
      const workerInfo = Array.isArray(orderData.id_trabajador_asignado) ? orderData.id_trabajador_asignado[0] : orderData.id_trabajador_asignado;

      const responsableNombre = (workerInfo?.nombre_trabajador || workshopInfo?.nombre);
      if (!responsableNombre) return;

      const tipoResponsable = workerInfo ? 'trabajador' : 'taller';

      if (!responsableNombre) return;

      const actualizadorNombre = h.id_usuario_actualizacion_etapa?.nombre_trabajador;

      if (!etapa.responsables.has(responsableNombre)) {
        etapa.responsables.set(responsableNombre, {
          nombre: responsableNombre,
          tipo: tipoResponsable,
          cantidadTotal: 0,
          estaCompletado: !!completado,
          fechaFinalizacion: completado || iniciado,
          fechaInicio: iniciado,
          detalles: new Map<string, any>(),
          creadoPor: actualizadorNombre,
          woIdsVistos: new Set<string>()
        });
      }

      const resp = etapa.responsables.get(responsableNombre);
      if (!resp.woIdsVistos) resp.woIdsVistos = new Set<string>();

      const woId = orderData.id;
      const cant = orderData.cantidad_asignada || 0;
      const esDevuelto = orderData.origen_reproceso === 'devolucion';

      // 1. De-duplicación a nivel de ETAPA (Total Real)
      if (!etapa.woIdsVistosEtapa.has(woId)) {
        if (!esDevuelto) {
          etapa.cantidadTotalEtapa += cant;
        }
        etapa.woIdsVistosEtapa.add(woId);

        // Agregar faltantes si existen para esta OT y es etapa de Recepción
        if (missingMap.has(woId)) {
          const faltante = missingMap.get(woId);
          if (etapa.codigo === 'RECEPCION' || etapa.nombreEtapa?.toUpperCase().includes('RECEPCIÓN')) {
            etapa.faltantes.push({ woId, cantidad: faltante });
          }
        }
      }

      // 2. De-duplicación a nivel de RESPONSABLE (Trabajo Atribuido)
      const yaVistoPorResp = resp.woIdsVistos.has(woId);
      if (!yaVistoPorResp) {
        if (!esDevuelto) {
          resp.cantidadTotal += cant;
        }
        resp.woIdsVistos.add(woId);
      }

      if (!completado) {
        resp.estaCompletado = false;
      }

      if (completado && new Date(completado) > new Date(resp.fechaFinalizacion)) {
        resp.fechaFinalizacion = completado;
      }

      // Detalles de referencia
      const refInfo = Array.isArray(orderData.id_referencia) ? orderData.id_referencia[0] : orderData.id_referencia;
      const refKey = refInfo?.nombre;
      if (refKey && !resp.detalles.has(refKey)) {
        const imgUrl = refInfo?.imagen_url;
        const { data: publicURL } = imgUrl ? (imgUrl.startsWith('http') ? { data: { publicUrl: imgUrl } } : supabase.storage.from('imagenes').getPublicUrl(imgUrl)) : { data: { publicUrl: null } };

        resp.detalles.set(refKey, {
          nombre: refKey,
          imagenUrl: publicURL?.publicUrl,
          tallas: new Map<string, { cantidad: number; faltante: number }>()
        });
      }
      if (refKey) {
        const refData = resp.detalles.get(refKey);
        const tallaInfo = Array.isArray(orderData.id_talla) ? orderData.id_talla[0] : orderData.id_talla;
        const tallaNombre = tallaInfo?.nombre || 'N/A';

        if (!yaVistoPorResp) {
          const currentData = refData.tallas.get(tallaNombre) || { cantidad: 0, faltante: 0, devueltas: 0 };
          let additionalFaltante = 0;

          if (missingMap.has(woId)) {
            additionalFaltante = missingMap.get(woId) || 0;
          }

          refData.tallas.set(tallaNombre, {
            cantidad: currentData.cantidad + (esDevuelto ? 0 : cant),
            faltante: currentData.faltante + additionalFaltante,
            devueltas: currentData.devueltas + (esDevuelto ? cant : 0)
          });
        }
      }

      // IMPORTANTE: Detectar si hubo faltantes en esta historia específica para mostrarlos
      // Si la etapa es recepción, miramos si esta OT tuvo faltante
      if ((etapa.codigo === 'RECEPCION' || etapa.nombreEtapa?.toUpperCase().includes('RECEPCIÓN')) && missingMap.has(woId)) {
        if (!resp.faltantes) resp.faltantes = 0;
        if (!yaVistoPorResp) resp.faltantes += missingMap.get(woId);
      }
    });

    // 4. Procesar las ÓRDENES DE TRABAJO ACTUALES
    if (workOrders && workOrders.length > 0) {
      workOrders.forEach(wo => {
        const etapaId = wo.id_etapa_actual?.id;
        if (!etapaId || !etapasMap.has(etapaId)) return;

        const etapa = etapasMap.get(etapaId);

        if (!etapa.fechaInicioEtapa || new Date(wo.creado_en) < new Date(etapa.fechaInicioEtapa)) {
          etapa.fechaInicioEtapa = wo.creado_en;
        }
        if (!etapa.fechaFinEtapa || new Date(wo.actualizado_en) > new Date(etapa.fechaFinEtapa)) {
          etapa.fechaFinEtapa = wo.actualizado_en;
        }

        const workerInWo = Array.isArray(wo.id_trabajador_asignado) ? wo.id_trabajador_asignado[0] : wo.id_trabajador_asignado;
        const workshopInWo = Array.isArray(wo.id_taller) ? wo.id_taller[0] : wo.id_taller;

        const responsableNombre = workerInWo?.nombre_trabajador || workshopInWo?.nombre;
        if (!responsableNombre) return;

        const tipoResponsable = workerInWo ? 'trabajador' : 'taller';

        // Filtrar según el tipo de etapa: Producción -> Solo talleres, Resto -> Solo trabajadores
        if (etapa.esEtapaProduccionTaller) {
          if (tipoResponsable !== 'taller') return;
        } else {
          if (tipoResponsable !== 'trabajador') return;
        }

        if (!etapa.responsables.has(responsableNombre)) {
          etapa.responsables.set(responsableNombre, {
            nombre: responsableNombre,
            tipo: tipoResponsable,
            cantidadTotal: 0,
            estaCompletado: wo.estado === 'completada' || wo.estado === 'completado',
            fechaFinalizacion: wo.actualizado_en,
            fechaInicio: wo.creado_en,
            detalles: new Map<string, any>(),
            creadoPor: workerInWo?.nombre_trabajador,
            woIdsVistos: new Set<string>()
          });
        }

        const resp = etapa.responsables.get(responsableNombre);
        if (!resp.woIdsVistos) resp.woIdsVistos = new Set<string>();

        const woId = wo.id;
        const cant = wo.cantidad_asignada;
        const esDevuelto = wo.origen_reproceso === 'devolucion';

        // 1. Etapa de-duplication
        if (!etapa.woIdsVistosEtapa.has(woId)) {
          if (!esDevuelto) {
            etapa.cantidadTotalEtapa += cant;
          }
          etapa.woIdsVistosEtapa.add(woId);
        }

        // 2. Responsible de-duplication
        const yaVistoPorResp = resp.woIdsVistos.has(woId);
        if (!yaVistoPorResp) {
          if (!esDevuelto) {
            resp.cantidadTotal += cant;
          }
          resp.woIdsVistos.add(woId);
        }

        if (wo.estado !== 'completada' && wo.estado !== 'completado') {
          resp.estaCompletado = false;
        }

        if (new Date(wo.actualizado_en) > new Date(resp.fechaFinalizacion)) {
          resp.fechaFinalizacion = wo.actualizado_en;
        }
        if (new Date(wo.creado_en) < new Date(resp.fechaInicio)) {
          resp.fechaInicio = wo.creado_en;
        }

        const refInWo = Array.isArray(wo.id_referencia) ? wo.id_referencia[0] : wo.id_referencia;
        const refKey = refInWo?.nombre;
        if (refKey && !resp.detalles.has(refKey)) {
          const imgUrl = refInWo?.imagen_url;
          const { data: publicURL } = imgUrl ? (imgUrl.startsWith('http') ? { data: { publicUrl: imgUrl } } : supabase.storage.from('imagenes').getPublicUrl(imgUrl)) : { data: { publicUrl: null } };

          resp.detalles.set(refKey, {
            nombre: refKey,
            imagenUrl: publicURL?.publicUrl,
            tallas: new Map<string, { cantidad: number; faltante: number }>()
          });
        }
        if (refKey) {
          const refData = resp.detalles.get(refKey);
          const sizeInWo = Array.isArray(wo.id_talla) ? wo.id_talla[0] : wo.id_talla;
          const tallaNombre = sizeInWo?.nombre || 'N/A';
          if (!yaVistoPorResp) {
            const currentData = refData.tallas.get(tallaNombre) || { cantidad: 0, faltante: 0, devueltas: 0 };
            let additionalFaltante = 0;

            if (missingMap.has(woId)) {
              additionalFaltante = missingMap.get(woId) || 0;
            }

            refData.tallas.set(tallaNombre, {
              cantidad: currentData.cantidad + (esDevuelto ? 0 : cant),
              faltante: currentData.faltante + additionalFaltante,
              devueltas: currentData.devueltas + (esDevuelto ? cant : 0)
            });
          }
        }

        // Capturar Taller Origen para Recepción
        if (etapa.codigo === 'RECEPCION' || etapa.nombreEtapa?.toUpperCase().includes('RECEPCIÓN')) {
          if (workshopInWo && workshopInWo.nombre) {
            resp.tallerOrigen = workshopInWo.nombre;
          }
        }
      });
    }

    // Post-procesamiento
    return Array.from(etapasMap.values())
      .map(etapa => {
        let responsablesArr = Array.from(etapa.responsables.values());

        // Filtro importante: Si hay trabajadores o talleres reales asignados, 
        // eliminamos el "Personal Administrativo" (que suele ser solo la sombra de la transición de etapa)
        if (responsablesArr.length > 1) {
          const tieneResponsablesReales = responsablesArr.some((r: any) => r.nombre !== 'Personal Administrativo');
          if (tieneResponsablesReales) {
            responsablesArr = responsablesArr.filter((r: any) => r.nombre !== 'Personal Administrativo');
          }
        }

        const tieneActividad = responsablesArr.length > 0;
        const cantidadTotalEtapa = etapa.cantidadTotalEtapa;
        const tienePendientes = responsablesArr.some((r: any) => !r.estaCompletado);
        const cantidadPendienteEtapa = responsablesArr.reduce((sum: number, r: any) => sum + (!r.estaCompletado ? (r.cantidadTotal || 0) : 0), 0);
        const estaEtapaActiva = etapa.estaEtapaActual || tienePendientes;

        // Una etapa está "Completada" si:
        // 1. Ya tiene actividad AND esa actividad está 100% terminada
        // 2. O si es una etapa pasada (según índice oficial) y no tiene trabajos activos
        const etapaCompletada = (tieneActividad && !tienePendientes) ||
          (etapa.indice_orden < currentIndex && !tienePendientes) ||
          (order?.nombre_estado?.toLowerCase() === 'completado');

        return {
          ...etapa,
          tieneActividad,
          cantidadTotalEtapa,
          cantidadPendienteEtapa,
          estaEtapaActiva,
          estaEtapaCompletada: etapaCompletada,
          duracionGlobalMs: (etapaCompletada && etapa.fechaInicioEtapa && etapa.fechaFinEtapa)
            ? (new Date(etapa.fechaFinEtapa).getTime() - new Date(etapa.fechaInicioEtapa).getTime())
            : (estaEtapaActiva && etapa.fechaInicioEtapa ? (new Date().getTime() - new Date(etapa.fechaInicioEtapa).getTime()) : null),
          responsables: responsablesArr.map((r: any) => ({
            ...r,
            duracionMs: r.estaCompletado
              ? (new Date(r.fechaFinalizacion).getTime() - new Date(r.fechaInicio).getTime())
              : (new Date().getTime() - new Date(r.fechaInicio).getTime()),
            actualizadoPor: r.actualizadoPor || r.creadoPor,
            detalles: Array.from(r.detalles.values()).map((d: any) => ({
              referencia: d.nombre,
              imagenUrl: d.imagenUrl,
              tallas: Array.from((d.tallas as Map<string, any>).entries()).map(([nombre, data]) => ({
                nombre,
                cantidad: data.cantidad,
                faltante: data.faltante,
                devueltas: data.devueltas || 0
              }))
            })),
            faltantes: r.faltantes || 0
          }))
        };
      })
      .sort((a, b) => a.indice_orden - b.indice_orden);
  }, [workOrders, etapasMaster, orderHistory, woHistory, order?.id_etapa_actual, order?.nombre_estado, shortages]);

  const fetchAllDetails = useCallback(async () => {
    if (!order) return;
    setLoading(true);

    try {
      const [detailsResponse, workOrdersResponse, etapasResponse, historyResponse, woHistoryResponse, shortagesResponse] = await Promise.all([
        supabase.from('vista_detalles_pedido').select('*').eq('id_pedido', order.id),
        supabase.from('ordenes_de_trabajo').select(`
          id,
          cantidad_asignada,
          id_taller ( nombre ),
          id_referencia ( nombre, imagen_url ),
          id_talla ( nombre ),
          id_etapa_actual ( id, nombre ),
          id_trabajador_asignado ( nombre_trabajador ),
          creado_en,
          actualizado_en,
          estado,
          origen_reproceso
        `).eq('id_pedido', order.id),
        supabase.from('etapas').select('id, nombre, codigo, indice_orden'),
        // Historial de transiciones generales (quién movió el pedido de etapa)
        supabase.from('historial_etapas_pedido').select(`
          iniciado_en,
          completado_en,
          notas,
          id_etapa,
          id_trabajador (nombre_trabajador),
          id_taller (nombre),
          id_usuario_actualizacion_etapa (nombre_trabajador)
        `).eq('id_pedido', order.id),
        // Historial de órdenes de trabajo (quién y dónde se produjo cada prenda)
        supabase.from('historial_ordenes_de_trabajo').select(`
          iniciado_en,
          completado_en,
          id_etapa,
          id_usuario_actualizacion_etapa (nombre_trabajador),
          id_orden_trabajo (
            id,
            id_taller ( nombre ),
            id_referencia ( nombre, imagen_url ),
            id_talla ( nombre ),
            cantidad_asignada,
            id_trabajador_asignado ( nombre_trabajador ),
            origen_reproceso
          )
        `).eq('id_pedido', order.id),
        supabase.from('recepciones_taller_detalle').select('*').eq('id_pedido', order.id)
      ]);

      if (etapasResponse.error) throw etapasResponse.error;
      setEtapasMaster(etapasResponse.data || []);

      if (historyResponse.error) {
        console.warn("Could not fetch transition history:", historyResponse.error);
        setOrderHistory([]);
      } else {
        setOrderHistory(historyResponse.data || []);
      }

      if (woHistoryResponse.error) {
        console.warn("Could not fetch work order history:", woHistoryResponse.error);
        setWoHistory([]);
      } else {
        setWoHistory(woHistoryResponse.data || []);
      }

      if (shortagesResponse.error) {
        console.warn("Could not fetch shortages:", shortagesResponse.error);
        setShortages([]);
      } else {
        setShortages(shortagesResponse.data || []);
      }

      // 1. Procesar detalles de referencias
      if (detailsResponse.error) throw detailsResponse.error;
      const transformedData = detailsResponse.data.map((item: any) => ({
        cantidad: item.cantidad,
        referencias: {
          id: item.id_referencia,
          nombre: item.nombre_referencia,
          imagen_url: item.imagen_url,
          precio_unitario: item.precio_unitario
        },
        tallas: { nombre: item.nombre_talla }
      }));
      const aggregated = transformedData.reduce<Record<string, AggregatedReference>>((acc, item) => {
        const refName = item.referencias?.nombre;
        if (!refName) return acc;
        if (!acc[refName]) {
          acc[refName] = {
            id: item.referencias.id,
            nombre: refName,
            imagen_url: item.referencias?.imagen_url || null,
            precio_unitario: item.referencias?.precio_unitario || 0,
            total_cantidad: 0,
            tallas: {}
          };
        }
        const tallaName = item.tallas?.nombre || 'N/A';
        acc[refName].tallas[tallaName] = (acc[refName].tallas[tallaName] || 0) + item.cantidad;
        acc[refName].total_cantidad += item.cantidad;
        return acc;
      }, {});
      const finalDetails = Object.values(aggregated).map(detail => { if (detail.imagen_url && !detail.imagen_url.startsWith('http')) { const { data: publicURL } = supabase.storage.from('imagenes').getPublicUrl(detail.imagen_url); return { ...detail, imagen_url: publicURL.publicUrl }; } return detail; });
      setDetails(finalDetails);

      // 2. Procesar órdenes de trabajo
      if (workOrdersResponse.error) throw workOrdersResponse.error;
      const workOrderData = (workOrdersResponse.data || []).map((wo: any) => ({
        ...wo,
        id_taller: Array.isArray(wo.id_taller) ? wo.id_taller[0] : wo.id_taller,
        id_referencia: Array.isArray(wo.id_referencia) ? wo.id_referencia[0] : wo.id_referencia,
        id_talla: Array.isArray(wo.id_talla) ? wo.id_talla[0] : wo.id_talla,
        id_etapa_actual: Array.isArray(wo.id_etapa_actual) ? wo.id_etapa_actual[0] : wo.id_etapa_actual,
        id_trabajador_asignado: Array.isArray(wo.id_trabajador_asignado) ? wo.id_trabajador_asignado[0] : wo.id_trabajador_asignado,
      })) as WorkOrder[];
      setWorkOrders(workOrderData);

    } catch (err: unknown) {
      console.error("Error fetching order details or work orders:", err);
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (isOpen && order) {
      // Resetear secciones al abrir nuevo pedido (General abierta, el resto cerradas)
      setExpandedSections({
        general: true,
        workshop: false,
        responsible: false,
        history: false,
        references: true
      });
      setExpandedStages({}); // Todas las etapas de la cronología colapsadas
      fetchAllDetails();
    }
  }, [isOpen, order, fetchAllDetails]);

  const handleEditReference = (ref: AggregatedReference) => {
    setEditingReference(ref);
    setIsEditQuantitiesModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditReferenceModalOpen(false);
    setEditingReference(null);
  };

  const handleSaveEdit = () => {
    handleCloseEditModal();
    fetchAllDetails();
    if (onOrderUpdated) {
      onOrderUpdated();
    }
  };

  if (!isOpen || !order) return null;

  const handleImageClick = (imageUrl: string) => setSelectedImage(imageUrl);
  const handleClosePreview = () => setSelectedImage(null);
  const isEditableStage = order.codigo_etapa_actual === 'INGRESO' || order.codigo_etapa_actual === 'CORTE';

  const calculateDuration = (creationDate: string, status: string | null, completionDate?: string | null) => {
    const startDate = new Date(creationDate);
    const endDate = (status === 'Completado' && completionDate) ? new Date(completionDate) : new Date();

    if (isNaN(startDate.getTime())) return 'N/A';

    const diffDays = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return `${diffDays} día(s)`;
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 backdrop-blur-sm overflow-y-auto p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform transition-all duration-300">
          <div className="relative p-5 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalle del Pedido #{`P${String(order.numero_pedido).padStart(3, '0')}`}</h2>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6 space-y-3 overflow-y-auto flex-grow min-h-[300px]">
            {/* General Details */}
            <div className="pb-2">
              <button
                onClick={() => toggleSection('general')}
                className="w-full flex justify-between items-center text-left mb-2 group"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Información General</h3>
                <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${expandedSections.general ? 'rotate-180' : ''}`} />
              </button>

              <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 text-sm transition-all duration-300 overflow-hidden ${expandedSections.general ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                <div><p className="font-medium text-gray-500 dark:text-gray-400">Número Pedido</p><p className="text-gray-800 dark:text-gray-100 font-semibold">{`P${String(order.numero_pedido).padStart(3, '0')}`}</p></div>
                <div><p className="font-medium text-gray-500 dark:text-gray-400">Cliente</p><p className="text-gray-800 dark:text-gray-100 font-semibold">{order.nombre_cliente}</p></div>
                <div><p className="font-medium text-gray-500 dark:text-gray-400">Estado</p><p className="font-semibold"><span className={`px-2 py-1 rounded-full text-xs font-medium ${order.nombre_estado === 'Completado' ? 'bg-green-100 dark:bg-green-900 dark:text-green-300 text-green-800' : order.nombre_estado === 'Retrasado' ? 'bg-red-100 dark:bg-red-900 dark:text-red-300 text-red-800' : 'bg-blue-100 dark:bg-blue-900 dark:text-blue-300 text-blue-800'}`}>{order.nombre_estado}</span></p></div>
                <div><p className="font-medium text-gray-500 dark:text-gray-400">Etapa General</p><p className="text-gray-800 dark:text-gray-100 font-semibold">{order.nombre_etapa_actual}</p></div>
                <div><p className="font-medium text-gray-500 dark:text-gray-400">Fecha Creación</p><p className="text-gray-800 dark:text-gray-100 font-semibold">{new Date(order.creado_en).toLocaleDateString()}</p></div>
                <div>
                  <p className="font-medium text-gray-500 dark:text-gray-400">
                    {order.nombre_estado === 'Completado' ? 'Duración Total' : 'Tiempo Transcurrido'}
                  </p>
                  <p className="text-gray-800 dark:text-gray-100 font-semibold">
                    {calculateDuration(order.creado_en, order.nombre_estado || null, order.finalizacion_real)}
                  </p>
                </div>
              </div>
            </div>



            {/* Chronology / History */}
            <div className="pt-2">
              <div className="border-t dark:border-gray-700 -mx-6 mb-2"></div>
              <button
                onClick={() => toggleSection('history')}
                className="w-full flex justify-between items-center text-left group"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Trazabilidad y Avance por Etapas</h3>
                </div>
                <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${expandedSections.history ? 'rotate-180' : ''}`} />
              </button>

              <div className={`transition-all duration-300 overflow-hidden ${expandedSections.history ? 'max-h-[8000px] opacity-100 mt-5' : 'max-h-0 opacity-0'}`}>
                {loading ? (
                  <p className="text-gray-500 dark:text-gray-400">Cargando historial...</p>
                ) : cronologiaHistorial.length > 0 ? (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-700">
                    {cronologiaHistorial.map((etapa: any) => {
                      const hasActivity = etapa.responsables && etapa.responsables.length > 0;
                      const isExpanded = !!expandedStages[etapa.id];

                      return (
                        <div key={etapa.id} className="relative">
                          {/* Indicador de Punto en la Línea */}
                          <div className={`absolute -left-[21px] top-1.5 w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center z-10 transition-all duration-500 
                            ${etapa.estaEtapaCompletada ? 'bg-green-500 border-green-500 shadow-sm' :
                              etapa.estaEtapaActiva ? 'bg-white dark:bg-gray-800 border-blue-500 ring-4 ring-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.3)]' :
                                'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}>
                            {etapa.estaEtapaCompletada && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {etapa.estaEtapaActiva && !etapa.estaEtapaCompletada && (
                              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                            )}
                          </div>

                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => toggleStage(etapa.id)}
                              className="flex items-center justify-between w-full group/stage text-left"
                            >
                              <div className="flex items-center gap-3">
                                <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg transition-all duration-300
                                  ${etapa.estaEtapaCompletada ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30' :
                                    etapa.estaEtapaActiva ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500/20' :
                                      'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800'}`}>
                                  {etapa.estaEtapaActiva && !etapa.estaEtapaCompletada && (
                                    <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
                                  )}
                                  {etapa.nombreEtapa}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/40 px-2 py-0.5 rounded-full border dark:border-gray-700/50">
                                    {etapa.cantidadTotalEtapa} prendas
                                  </span>
                                  {etapa.cantidadPendienteEtapa > 0 && (
                                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/50">
                                      {etapa.cantidadPendienteEtapa} pendientes
                                    </span>
                                  )}
                                  {etapa.faltantes && etapa.faltantes.length > 0 && (
                                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800/50">
                                      -{etapa.faltantes.reduce((acc: number, f: any) => acc + f.cantidad, 0)} faltantes
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-[5000px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                              <div className="space-y-2">
                                {hasActivity ? (
                                  etapa.responsables.map((resp: any) => {
                                    const formatTime = (ms: number) => {
                                      const totalMinutes = Math.floor(ms / (1000 * 60));
                                      const d = Math.floor(totalMinutes / (24 * 60));
                                      const h = Math.floor((totalMinutes % (24 * 60)) / 60);
                                      const m = totalMinutes % 60;
                                      const parts = [];
                                      if (d > 0) parts.push(`${d}d`);
                                      if (h > 0) parts.push(`${h}h`);
                                      if (m > 0 || (d === 0 && h === 0)) parts.push(`${m}m`);
                                      return parts.join(' ');
                                    };

                                    return (
                                      <div key={`${etapa.id}-${resp.nombre}`} className="p-3 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between mb-2 pb-1 border-b dark:border-gray-700/50">
                                          <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${resp.tipo === 'trabajador' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                              {resp.nombre.charAt(0)}
                                            </div>
                                            <div>
                                              <p className="font-semibold text-gray-800 dark:text-gray-100">{resp.nombre}</p>
                                              <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                                  {resp.esDelHistorial ? 'Gestión Etapa' : `${resp.cantidadTotal} prendas`} • {resp.tipo === 'trabajador' ? 'Personal' : 'Taller'}
                                                  {/* Mostrar taller origen si existe (para recepción) */}
                                                  {resp.tallerOrigen && (
                                                    <span className="ml-1 text-gray-400 dark:text-gray-500">
                                                      (Recibido de: <span className="font-medium text-gray-600 dark:text-gray-300">{resp.tallerOrigen}</span>)
                                                    </span>
                                                  )}
                                                </p>
                                                {resp.duracionMs && (
                                                  <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                                                    ⏱️ {formatTime(resp.duracionMs)}
                                                  </span>
                                                )}
                                                {resp.actualizadoPor && resp.actualizadoPor !== resp.nombre && (
                                                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/50">
                                                    Actualizado por: {resp.actualizadoPor}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex flex-col items-end gap-1">
                                            {resp.estaCompletado ? (
                                              <>
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg text-right">
                                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                  COMPLETADO
                                                </span>
                                                <p className="text-[9px] text-gray-400 italic">Terminó el {new Date(resp.fechaFinalizacion).toLocaleDateString()}</p>
                                              </>
                                            ) : (
                                              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg">
                                                <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
                                                EN PROCESO
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <div className="space-y-1">
                                          {resp.detalles.map((det: any) => (
                                            <div key={det.referencia} className="pl-1 flex items-start gap-2">
                                              <div className="relative group">
                                                <img
                                                  src={det.imagenUrl || 'https://placehold.co/400x400/cccccc/666666?text=Sin+Imagen'}
                                                  alt={det.referencia}
                                                  className="w-10 h-10 object-cover rounded shadow-sm border dark:border-gray-600"
                                                />
                                              </div>
                                              <div className="flex-grow">
                                                <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                                                  {det.referencia}
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 pl-1">
                                                  {det.tallas.map((t: any) => (
                                                    <div key={`${t.nombre}-${det.referencia}`} className="flex items-center">
                                                      <TallaCantidadBadge talla={t.nombre} cantidad={t.cantidad} devueltas={t.devueltas} />
                                                      {t.faltante > 0 && (
                                                        <span className="ml-1 text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800">
                                                          (-{t.faltante} faltan)
                                                        </span>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="p-4 bg-gray-50/50 dark:bg-gray-900/30 border border-dashed dark:border-gray-700 rounded-xl flex items-center justify-center">
                                    <p className="text-[11px] text-gray-400 italic">Etapa pendiente o realizada en flujo general</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 italic pl-1 flex items-center justify-between">
                              <span>
                                {etapa.estaEtapaActiva && !etapa.estaEtapaCompletada ? 'Trabajando activamente en esta fase' : (etapa.estaEtapaCompletada ? 'Toda la etapa ha finalizado' : '')}
                              </span>
                              {etapa.estaEtapaCompletada && etapa.duracionGlobalMs && (
                                <span className="font-semibold text-green-600/80 dark:text-green-400/80">
                                  Cierre total: {(() => {
                                    const ms = etapa.duracionGlobalMs;
                                    const totalMinutes = Math.floor(ms / (1000 * 60));
                                    const d = Math.floor(totalMinutes / (24 * 60));
                                    const h = Math.floor((totalMinutes % (24 * 60)) / 60);
                                    const m = totalMinutes % 60;
                                    const parts = [];
                                    if (d > 0) parts.push(`${d}d`);
                                    if (h > 0) parts.push(`${h}h`);
                                    if (m > 0 || (d === 0 && h === 0)) parts.push(`${m}m`);
                                    return parts.join(' ');
                                  })()}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4 italic">No hay historial disponible para mostrar todavía.</p>
                )}
              </div>
            </div>

            {/* References Summary */}
            <div className="pt-2">
              <div className="border-t dark:border-gray-700 -mx-6 mb-2"></div>
              <button
                onClick={() => toggleSection('references')}
                className="w-full flex justify-between items-center text-left group"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen de Referencias del Pedido</h3>
                <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${expandedSections.references ? 'rotate-180' : ''}`} />
              </button>

              <div className={`transition-all duration-300 overflow-hidden ${expandedSections.references ? 'max-h-[2000px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                {loading ? (
                  <p className="text-gray-500 dark:text-gray-400">Cargando detalles...</p>
                ) : details && details.length > 0 ? (
                  <div className="space-y-4">
                    {details.map(ref => (
                      <div key={ref.nombre} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700">
                        <div className="flex items-center gap-3 mb-2">
                          {ref.imagen_url && <img src={ref.imagen_url} alt={ref.nombre} className="w-12 h-12 object-cover rounded-md border dark:border-gray-600 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleImageClick(ref.imagen_url!)} />}
                          <div className="flex-grow">
                            <div className="flex justify-between items-center">
                              <h4 className="font-semibold text-gray-800 dark:text-gray-200">{ref.nombre}</h4>
                              {isEditableStage && (
                                <button onClick={() => handleEditReference(ref)} className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{ref.total_cantidad} unidades</p>                        </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm">
                          {Object.entries(ref.tallas).map(([talla, cantidad]) => (
                            <TallaCantidadBadge key={talla} talla={talla} cantidad={cantidad} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No se encontraron detalles de referencias para este pedido.</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      </div>
      <ImagePreviewModal isOpen={!!selectedImage} onClose={handleClosePreview} imageUrl={selectedImage} />

      <EditReferenceModal
        isOpen={isEditReferenceModalOpen}
        onClose={handleCloseEditModal}
        onReferenceUpdated={handleSaveEdit}
        referencia={editingReference}
      />

      {order && editingReference && (
        <EditOrderReferenceQuantitiesModal
          isOpen={isEditQuantitiesModalOpen}
          onClose={() => {
            setIsEditQuantitiesModalOpen(false);
            setEditingReference(null);
          }}
          onUpdated={handleSaveEdit}
          orderId={order.id}
          referenciaNombre={editingReference.nombre}
          referenciaImagen={editingReference.imagen_url}
          initialQuantities={editingReference.tallas}
        />
      )}
    </Portal>
  );
};

export default OrderDetailsModal;