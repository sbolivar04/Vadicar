import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please connect to Supabase using the button in the top right.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Tipos actualizados para TypeScript
export interface Worker {
  id: string
  name: string
  email: string | null
  role: string
  specialization: string | null
  is_active: boolean
  hire_date: string
  created_at: string
  updated_at: string
}

export interface Stage {
  id: string
  name: string
  description: string | null
  order_index: number
  avg_time_hours: number | null
  is_quality_check: boolean
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  client_name: string
  description: string | null
  quantity: number
  current_stage_id: string | null
  status: 'en-proceso' | 'completado' | 'retrasado' | 'cancelado'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  estimated_completion: string | null
  actual_completion: string | null
  total_defects: number
  created_at: string
  updated_at: string
  // Relaciones
  current_stage?: Stage
  current_history?: OrderStageHistory
}

export interface OrderStageHistory {
  id: string
  order_id: string
  stage_id: string
  worker_id: string | null
  started_at: string
  completed_at: string | null
  time_spent_hours: number | null
  notes: string | null
  is_current: boolean
  created_at: string
  // Relaciones
  stage?: Stage
  worker?: Worker
}

export interface QualityCheck {
  id: string
  order_id: string
  stage_id: string
  worker_id: string
  checked_at: string
  passed: boolean
  defects_found: number
  notes: string | null
  created_at: string
  // Relaciones
  stage?: Stage
  worker?: Worker
}

export interface DefectType {
  id: string
  name: string
  description: string | null
  severity: 'low' | 'medium' | 'high'
  created_at: string
}

export interface OrderDefect {
  id: string
  order_id: string
  quality_check_id: string | null
  defect_type_id: string
  quantity: number
  description: string | null
  is_fixed: boolean
  fixed_at: string | null
  fixed_by: string | null
  created_at: string
  // Relaciones
  defect_type?: DefectType
  fixed_by_worker?: Worker
}

export interface TimeLog {
  id: string
  order_stage_history_id: string
  worker_id: string
  start_time: string
  end_time: string | null
  break_time_minutes: number
  notes: string | null
  created_at: string
  // Relaciones
  worker?: Worker
}

// Funciones de utilidad para la base de datos
export const supabaseQueries = {
  // Obtener todos los pedidos con información relacionada
  async getOrdersWithDetails() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        current_stage:stages!current_stage_id(*),
        current_history:order_stage_history!inner(
          *,
          stage:stages(*),
          worker:workers(*)
        )
      `)
      .eq('order_stage_history.is_current', true)
      .order('created_at', { ascending: false });
    
    return { data, error };
  },

  // Obtener métricas del dashboard
  async getDashboardMetrics() {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('status, quantity, total_defects');
    
    if (error) return { data: null, error };
    
    const metrics = {
      enProceso: orders.filter(o => o.status === 'en-proceso').length,
      completados: orders.filter(o => o.status === 'completado').length,
      retrasados: orders.filter(o => o.status === 'retrasado').length,
      totalPrendas: orders.reduce((sum, o) => sum + o.quantity, 0),
      defectos: orders.reduce((sum, o) => sum + o.total_defects, 0)
    };
    
    return { data: metrics, error: null };
  },

  // Obtener análisis de tiempos por etapa
  async getStageTimeAnalysis() {
    const { data, error } = await supabase
      .from('stages')
      .select(`
        *,
        order_stage_history(time_spent_hours)
      `)
      .order('order_index');
    
    return { data, error };
  },

  // Obtener productividad de trabajadores
  async getWorkerProductivity() {
    const { data, error } = await supabase
      .from('workers')
      .select(`
        *,
        order_stage_history!inner(
          order_id,
          orders!inner(quantity, total_defects)
        )
      `)
      .eq('is_active', true);
    
    return { data, error };
  },

  // Avanzar pedido a siguiente etapa
  async advanceOrderStage(orderId: string, workerId?: string, notes?: string) {
    const { data, error } = await supabase.rpc('advance_order_stage', {
      order_id_param: orderId,
      worker_id_param: workerId || null,
      notes_param: notes || null
    });
    
    return { data, error };
  },

  // Registrar control de calidad
  async registerQualityCheck(
    orderId: string, 
    stageId: string, 
    workerId: string, 
    passed: boolean, 
    defectsFound: number, 
    notes?: string
  ) {
    const { data, error } = await supabase
      .from('quality_checks')
      .insert({
        order_id: orderId,
        stage_id: stageId,
        worker_id: workerId,
        passed,
        defects_found: defectsFound,
        notes
      })
      .select()
      .single();
    
    return { data, error };
  }
}