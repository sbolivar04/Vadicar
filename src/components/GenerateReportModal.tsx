import React, { useState } from 'react';
import Portal from './Portal';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface GenerateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateReport: (reportType: string) => void;
}

const GenerateReportModal: React.FC<GenerateReportModalProps> = ({ isOpen, onClose, onGenerateReport }) => {
  const [selectedReportType, setSelectedReportType] = useState('');

  const handleGenerate = () => {
    if (selectedReportType) {
      onGenerateReport(selectedReportType);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
          <div className="relative p-5 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Generar Reporte</h2>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="reportType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Selecciona el tipo de reporte:</label>
              <select
                id="reportType"
                value={selectedReportType}
                onChange={(e) => setSelectedReportType(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">-- Seleccionar --</option>
                <option value="order_productivity">Reporte de Productividad de Pedidos</option>
                <option value="quality_defects">Reporte de Calidad y Defectos</option>
                <option value="workshop_workload">Reporte de Carga de Trabajo por Taller</option>
              </select>
            </div>
          </div>

          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cancelar</button>
            <button type="button" onClick={handleGenerate} disabled={!selectedReportType} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Generar y Descargar
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default GenerateReportModal;
