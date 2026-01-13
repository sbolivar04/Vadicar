export interface EtapaDesglose {
  etapa: string;
  codigo?: string;
  cantidad: number;
}

export interface Pedido {
  id: string;
  creado_en: string;
  finalizacion_real: string | null;
  numero_pedido: number;
  total_unidades: number;
  actualizado_en: string;
  fecha_inicio_etapa_actual: string | null;
  id_etapa_actual: string; // ID for supabase queries
  nombre_etapa_actual: string; // Name for display
  codigo_etapa_actual: string; // Code for logic
  id_estado: string; // ID for supabase queries
  nombre_estado: string; // Name for display
  id_prioridad: string; // ID for supabase queries
  nombre_prioridad: string; // Name for display
  id_cliente: string; // ID for supabase queries
  nombre_cliente: string; // Name for display
  numero_de_etapas_activas: number;
  desglose_etapas: EtapaDesglose[] | null;
  tiempo_en_etapa_actual?: number | null;
  recepcion_confirmada: boolean;
}

export interface Cargo {
  id: string;
  nombre: string;
  descripcion?: string;
}

export interface Ciudad {
  id: string;
  nombre: string;
}

export interface Barrio {
  id: string;
  nombre: string;
}

export interface Trabajador {
  id: string;
  nombre_trabajador: string;
  id_cargo?: string;
  cargos?: {
    nombre: string;
  };
  esta_activo: boolean;
  correo_electronico?: string;
  nombre_usuario?: string;
  contrasena_visible?: string | null;
}

export interface Taller {
  id: string;
  nombre: string;
  descripcion?: string;
  labor?: 'Confección' | 'Ojal y Botón';
  tipo_documento?: 'CC' | 'NIT';
  nro_documento?: string;
  direccion?: string;
  ciudad_id?: string;
  barrio_id?: string;
  celular?: string;
  ciudades?: { nombre: string };
  barrios?: { nombre: string };
  esta_activo?: boolean;
}

export interface WorkOrderForReview {
  id: string;
  cantidad_asignada: number;
  id_referencia: {
    id: string;
    nombre: string;
    imagen_url: string;
  };
  id_talla: {
    id: string;
    nombre: string;
  };
  id_taller?: string;
  id_etapa_actual?: {
    id: string;
    nombre: string;
    codigo: string;
  };
  estado?: string;
  id_trabajador_asignado?: {
    id: string;
    nombre_trabajador: string;
  };
  origen_reproceso?: string;
  asignado_sig_etapa?: boolean;
  // Fallbacks for join results that might come as arrays or objects depending on the query
  referencias?: { nombre: string } | { nombre: string }[];
  tallas?: { nombre: string } | { nombre: string }[];
}