import React from 'react';
import Portal from './Portal';
import { XMarkIcon, BeakerIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/24/solid';

interface FlowDecisionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectFlow: (flow: 'OJAL' | 'PLANCHADO') => void;
    pedidoId: string | null;
    pedidoNumero?: number | string;
}

const FlowDecisionModal: React.FC<FlowDecisionModalProps> = ({
    isOpen,
    onClose,
    onSelectFlow,
    pedidoNumero
}) => {
    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[100] p-4 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all animate-in zoom-in-95 duration-300 border dark:border-gray-700">

                    {/* Header */}
                    <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Flujo de Terminaciones</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pedido #{pedidoNumero}</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <XMarkIcon className="h-6 w-6 text-gray-400" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-8 space-y-6">
                        <div className="text-center">
                            <p className="text-gray-600 dark:text-gray-300 text-lg">
                                Las prendas han superado la revisión de calidad. <br />
                                <span className="font-semibold text-gray-900 dark:text-white">¿Cuál es el siguiente paso para este pedido?</span>
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Opción Ojal y Botón */}
                            <button
                                onClick={() => onSelectFlow('OJAL')}
                                className="group relative flex flex-col items-center p-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-100 dark:border-blue-800/50 rounded-2xl hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-500 transition-all duration-300"
                            >
                                <div className="w-16 h-16 bg-blue-500 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                                    <BeakerIcon className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-blue-900 dark:text-blue-300 text-lg mb-2">Ojal y Botón</h3>
                                <p className="text-sm text-blue-700/70 dark:text-blue-400/70 text-center">
                                    Requiere asignación a talleres especializados.
                                </p>
                                <div className="mt-4 flex items-center text-blue-600 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                    Continuar <ArrowRightIcon className="w-4 h-4 ml-1" />
                                </div>
                            </button>

                            {/* Opción Planchado */}
                            <button
                                onClick={() => onSelectFlow('PLANCHADO')}
                                className="group relative flex flex-col items-center p-6 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-100 dark:border-purple-800/50 rounded-2xl hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:border-purple-500 transition-all duration-300"
                            >
                                <div className="w-16 h-16 bg-purple-500 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform">
                                    <SparklesIcon className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-purple-900 dark:text-purple-300 text-lg mb-2">Planchado y Empaque</h3>
                                <p className="text-sm text-purple-700/70 dark:text-purple-400/70 text-center">
                                    Continuar directamente con el alistamiento para entrega.
                                </p>
                                <div className="mt-4 flex items-center text-purple-600 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                    Continuar <ArrowRightIcon className="w-4 h-4 ml-1" />
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-center">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        >
                            Cerrar y decidir después
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export default FlowDecisionModal;
