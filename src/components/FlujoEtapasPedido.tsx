import React from 'react';
import {
  Calendar,
  Scissors,
  Truck,
  Shirt,
  Package,
  Eye,
  Zap,
  CheckCircle,
  PlayCircle,
  Check,
  User,
  Clock,
  FileText
} from 'lucide-react';
import SmartTooltip from './SmartTooltip'; // Usamos el nuevo componente

// --- DEFINICIONES DE TIPO ---
export interface StageHistory {
  id_etapa: number;
  nombre_etapa: string;
  codigo_etapa: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  duracion_horas: number | null;
  nombre_trabajador: string | null;
  notas: string | null;
  estado: 'completada' | 'en_progreso' | 'pendiente';
}

interface FlujoEtapasPedidoProps {
  history: StageHistory[];
}

// --- MAPEO DE ICONOS ---
const stageIcons: { [key: string]: React.ElementType } = {
  "INGRESO": Calendar,
  "CORTE": Scissors,
  "PREPARACION": Truck,
  "CONFECCION": Shirt,
  "RECEPCION": Package,
  "REVISION": Eye,
  "PLANCHADO": Zap,
  "ENTREGA": CheckCircle,
  "OJAL_BOTON": Zap,
};

// --- FUNCIONES DE AYUDA ---
const formatDuration = (hours: number | null): string => {
  if (hours === null || hours < 0) return '-';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${parseFloat(hours.toFixed(1))} h`;
  const days = Math.floor(hours / 24);
  const remainingHours = parseFloat((hours % 24).toFixed(1));
  return `${days}d ${remainingHours}h`;
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// --- COMPONENTE DE ETAPA (Refactorizado) ---
const StageItem: React.FC<{ stage: StageHistory }> = ({ stage }) => {
  const Icon = stageIcons[stage.codigo_etapa] || Package;

  const stateStyles = {
    completada: { ring: 'ring-green-500', bg: 'bg-green-500', text: 'text-green-600 dark:text-green-400', icon: <Check size={14} className="text-white" />, stateText: 'text-green-500 dark:text-green-400' },
    en_progreso: { ring: 'ring-yellow-500', bg: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', icon: <PlayCircle size={14} className="text-white" />, stateText: 'text-yellow-500 dark:text-yellow-400' },
    pendiente: { ring: 'ring-gray-400 dark:ring-gray-600', bg: 'bg-gray-400 dark:bg-gray-600', text: 'text-gray-500 dark:text-gray-400', icon: null, stateText: 'text-gray-500 dark:text-gray-400' }
  };

  const styles = stateStyles[stage.estado];

  // El contenido del tooltip ahora se define aquí y es sensible al tema
  const tooltipContent = (
    <div className="space-y-2 text-left">
      <h4 className={`font-bold text-sm border-b border-gray-200 dark:border-gray-700 pb-1 mb-1 ${styles.stateText}`}>{stage.nombre_etapa}</h4>
      <div className="flex items-center"><Clock size={12} className="mr-2 flex-shrink-0" /> <span>{formatDuration(stage.duracion_horas)}</span></div>
      <div className="flex items-center"><User size={12} className="mr-2 flex-shrink-0" /> <span>{stage.nombre_trabajador || 'No asignado'}</span></div>
      <div className="flex items-start"><FileText size={12} className="mr-2 mt-0.5 flex-shrink-0" /> <span>{stage.notas || 'Sin notas'}</span></div>
      <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 space-y-1">
        <p><strong>Inicio:</strong> {formatDate(stage.fecha_inicio)}</p>
        <p><strong>Fin:</strong> {formatDate(stage.fecha_fin)}</p>
      </div>
    </div>
  );

  return (
    <SmartTooltip content={tooltipContent}>
      <div className="relative flex md:flex-col items-center z-10">
        {/* Círculo e Icono */}
        <div className={`relative w-12 h-12 rounded-full ${styles.bg} flex items-center justify-center ring-4 ${styles.ring} ring-offset-2 ring-offset-white dark:ring-offset-gray-800 cursor-pointer`}>
          <Icon className="w-6 h-6 text-white" />
          {stage.estado !== 'pendiente' && (
            <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full ${styles.bg} flex items-center justify-center ring-2 ring-white dark:ring-gray-800`}>
              {styles.icon}
            </div>
          )}
        </div>

        {/* Detalles bajo el círculo */}
        <div className="md:text-center mt-0 md:mt-3 ml-4 md:ml-0">
          <p className={`font-semibold text-sm ${styles.text}`}>{stage.nombre_etapa}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDuration(stage.duracion_horas)}</p>
        </div>
      </div>
    </SmartTooltip>
  );
};

// --- COMPONENTE PRINCIPAL ---
const FlujoEtapasPedido: React.FC<FlujoEtapasPedidoProps> = ({ history }) => {
  if (!history || history.length === 0) {
    return <p className="text-center text-gray-500 dark:text-gray-400">No hay datos de historial disponibles.</p>;
  }

  return (
    <div className="w-full py-8 px-4">
      <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="absolute left-6 top-0 w-0.5 h-full bg-gray-200 dark:bg-gray-700 md:hidden"></div>
        <div className="hidden md:block absolute top-6 left-0 w-full h-0.5 bg-gray-200 dark:bg-gray-700"></div>

        {history.map((stage) => (
          <div key={stage.id_etapa} className="flex-1 flex md:justify-center mb-10 md:mb-0 last:mb-0">
            <StageItem stage={stage} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FlujoEtapasPedido;