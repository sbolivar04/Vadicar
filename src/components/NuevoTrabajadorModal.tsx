import React, { useState, useEffect } from 'react';
import { XMarkIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import Portal from './Portal';
import FilterDropdown from './FilterDropdown';

import { Cargo, Trabajador } from '../types';

interface NuevoTrabajadorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTrabajadorCreado: () => void;
    trabajadorAEditar?: Trabajador | null; // Agregado para edición
}

const NuevoTrabajadorModal: React.FC<NuevoTrabajadorModalProps> = ({
    isOpen,
    onClose,
    onTrabajadorCreado,
    trabajadorAEditar
}) => {
    const [nombre, setNombre] = useState('');
    const [idCargo, setIdCargo] = useState('');
    const [nombreUsuario, setNombreUsuario] = useState('');
    const [correo, setCorreo] = useState('');
    const [estaActivo, setEstaActivo] = useState(true); // Nuevo estado
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usuarioDisponible, setUsuarioDisponible] = useState<boolean | null>(null);
    const [verificandoUsuario, setVerificandoUsuario] = useState(false);
    const [correoDisponible, setCorreoDisponible] = useState<boolean | null>(null);
    const [verificandoCorreo, setVerificandoCorreo] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    // Lista dinámica de cargos
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [creandoNuevoCargo, setCreandoNuevoCargo] = useState({ activo: false, valor: '' });

    useEffect(() => {
        if (isOpen) {
            if (trabajadorAEditar) {
                // Modo Edición
                setNombre(trabajadorAEditar.nombre_trabajador);
                setIdCargo(trabajadorAEditar.id_cargo || '');
                setNombreUsuario(trabajadorAEditar.nombre_usuario || '');
                setCorreo(trabajadorAEditar.correo_electronico || '');
                setEstaActivo(trabajadorAEditar.esta_activo);
                setError(null);
                setShowErrors(false);
                // No validamos disponibilidad si es su propio usuario/correo
                setUsuarioDisponible(null);
                setCorreoDisponible(null);
            } else {
                // Modo Creación
                limpiarFormulario();
            }
            obtenerCargos();
        }
    }, [isOpen, trabajadorAEditar]);

    // Verificación de usuario en tiempo real (solo si el valor cambia o es nuevo)
    useEffect(() => {
        const verificarUsuario = async () => {
            if (!nombreUsuario.trim()) {
                setUsuarioDisponible(null);
                return;
            }

            // Si estamos editando y el nombre de usuario es el mismo que el original, lo damos por disponible
            if (trabajadorAEditar && nombreUsuario.trim() === trabajadorAEditar.nombre_usuario) {
                setUsuarioDisponible(true);
                return;
            }

            setVerificandoUsuario(true);
            try {
                const { data, error: err } = await supabase
                    .from('trabajadores')
                    .select('id')
                    .eq('nombre_usuario', nombreUsuario.trim())
                    .maybeSingle();

                if (err) throw err;
                setUsuarioDisponible(data ? false : true);
            } catch (err) {
                console.error("Error al verificar usuario:", err);
            } finally {
                setVerificandoUsuario(false);
            }
        };

        const timeoutId = setTimeout(verificarUsuario, 500);
        return () => clearTimeout(timeoutId);
    }, [nombreUsuario]);

    // Verificación de correo en tiempo real
    useEffect(() => {
        const verificarCorreo = async () => {
            if (!correo.trim()) {
                setCorreoDisponible(null);
                return;
            }

            // Si estamos editando y el correo es el mismo que el original, lo damos por disponible
            if (trabajadorAEditar && correo.trim() === trabajadorAEditar.correo_electronico) {
                setCorreoDisponible(true);
                return;
            }

            setVerificandoCorreo(true);
            try {
                const { data, error: err } = await supabase
                    .from('trabajadores')
                    .select('id')
                    .eq('correo_electronico', correo.trim())
                    .maybeSingle();

                if (err) throw err;
                setCorreoDisponible(data ? false : true);
            } catch (err) {
                console.error("Error al verificar correo:", err);
            } finally {
                setVerificandoCorreo(false);
            }
        };

        const timeoutId = setTimeout(verificarCorreo, 500);
        return () => clearTimeout(timeoutId);
    }, [correo, trabajadorAEditar]);

    const obtenerCargos = async () => {
        const { data } = await supabase.from('cargos').select('id, nombre').order('nombre');
        setCargos(data || []);
    };

    const manejarNuevoCargo = async () => {
        if (!creandoNuevoCargo.valor.trim()) return;
        setCargando(true);
        try {
            const { data, error: err } = await supabase
                .from('cargos')
                .insert([{ nombre: creandoNuevoCargo.valor.trim() }])
                .select()
                .single();

            if (err) throw err;

            setCargos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setIdCargo(data.id);
            setCreandoNuevoCargo({ activo: false, valor: '' });
        } catch (err: any) {
            setError('Error al crear el cargo: ' + err.message);
        } finally {
            setCargando(false);
        }
    };

    const guardarTrabajador = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowErrors(true);
        const faltantes = [];
        if (!nombre) faltantes.push('Nombre Completo');
        if (!idCargo) faltantes.push('Rol / Cargo');

        if (faltantes.length > 0) {
            setError(`Por favor, completa los campos requeridos: ${faltantes.join(', ')}.`);
            return;
        }

        if (usuarioDisponible === false) {
            setError('El nombre de usuario seleccionado no está disponible.');
            return;
        }

        if (correoDisponible === false) {
            setError('El correo electrónico ya se encuentra registrado en el sistema.');
            return;
        }

        setCargando(true);
        setError(null);

        try {
            const payload = {
                nombre_trabajador: nombre,
                id_cargo: idCargo,
                nombre_usuario: nombreUsuario || null,
                correo_electronico: correo || null,
                esta_activo: estaActivo
            };

            if (trabajadorAEditar) {
                // Actualizar
                const { error: errorSupa } = await supabase
                    .from('trabajadores')
                    .update(payload)
                    .eq('id', trabajadorAEditar.id);

                if (errorSupa) throw errorSupa;
            } else {
                // Crear
                const { error: errorSupa } = await supabase
                    .from('trabajadores')
                    .insert([payload]);

                if (errorSupa) throw errorSupa;
            }

            onTrabajadorCreado();
            limpiarFormulario();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Error al guardar el trabajador.');
        } finally {
            setCargando(false);
        }
    };

    const limpiarFormulario = () => {
        setNombre('');
        setIdCargo('');
        setNombreUsuario('');
        setCorreo('');
        setEstaActivo(true);
        setCreandoNuevoCargo({ activo: false, valor: '' });
        setUsuarioDisponible(null);
        setCorreoDisponible(null);
        setError(null);
        setShowErrors(false);
    };

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
                    <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {trabajadorAEditar ? 'Editar Trabajador' : 'Nuevo Trabajador'}
                        </h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>

                    <form noValidate onSubmit={guardarTrabajador} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                        {error && (
                            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                                <ExclamationCircleIcon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-grow">
                                    <h3 className="text-sm font-bold text-red-800 dark:text-red-300">Atención</h3>
                                    <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed mt-0.5">{error}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setError(null)}
                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-800/50 rounded-lg transition-colors"
                                >
                                    <XMarkIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                                </button>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Nombre Completo <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={nombre}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setNombre(val);

                                    const partes = val.trim().split(/\s+/);
                                    if (partes.length >= 1 && partes[0] !== '') {
                                        const nombreBase = partes[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                                        if (partes.length >= 2) {
                                            const apellidoBase = partes[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                            // Correo: nombre_apellido@taller.com
                                            setCorreo(`${nombreBase}_${apellidoBase}@taller.com`);

                                            // Usuario: inicial + apellido
                                            const inicial = nombreBase[0];
                                            setNombreUsuario(`${inicial}${apellidoBase}`);
                                        } else {
                                            setCorreo(`${nombreBase}@taller.com`);
                                            setNombreUsuario(nombreBase);
                                        }
                                    } else {
                                        setCorreo('');
                                        setNombreUsuario('');
                                    }
                                }}
                                className={`w-full px-4 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600 ${showErrors && !nombre
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                                    }`}
                                placeholder="Nombre del trabajador"
                            />
                        </div>

                        {/* Selector de Cargo */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Rol / Cargo <span className="text-red-500">*</span>
                            </label>
                            {creandoNuevoCargo.activo ? (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={creandoNuevoCargo.valor}
                                        onChange={(e) => setCreandoNuevoCargo({ ...creandoNuevoCargo, valor: e.target.value })}
                                        className="flex-grow px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                                        placeholder="Ej: Jefe de Taller"
                                    />
                                    <button
                                        type="button"
                                        onClick={manejarNuevoCargo}
                                        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                                    >
                                        Añadir
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCreandoNuevoCargo({ activo: false, valor: '' })}
                                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs"
                                    >
                                        X
                                    </button>
                                </div>
                            ) : (
                                <FilterDropdown
                                    placeholder="-- Seleccionar Rol --"
                                    options={[
                                        ...cargos.map(c => ({ id: c.id, nombre: c.nombre })),
                                        { id: 'nuevo', nombre: '+ Agregar nuevo cargo...' }
                                    ]}
                                    selectedValue={idCargo}
                                    onSelect={(val) => {
                                        if (val === 'nuevo') {
                                            setCreandoNuevoCargo({ activo: true, valor: '' });
                                        } else {
                                            setIdCargo(val);
                                        }
                                    }}
                                    valueKey="id"
                                    hasError={showErrors && !idCargo}
                                />
                            )}
                        </div>

                        <div className="border-t dark:border-gray-700 pt-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 italic">
                                Información opcional para acceso al sistema:
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Nombre de Usuario
                                    </label>
                                    <input
                                        type="text"
                                        value={nombreUsuario}
                                        onChange={(e) => setNombreUsuario(e.target.value)}
                                        className={`w-full px-4 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600 ${usuarioDisponible === false
                                            ? 'border-red-500 focus:ring-red-500'
                                            : usuarioDisponible === true
                                                ? 'border-green-500 focus:ring-green-500'
                                                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                                            }`}
                                        placeholder="Ej: juan.perez"
                                    />
                                    {verificandoUsuario && <p className="text-[10px] text-gray-400 mt-1 animate-pulse">Verificando disponibilidad...</p>}
                                    {usuarioDisponible === false && <p className="text-[10px] text-red-500 mt-1">⚠️ Este nombre de usuario ya está ocupado.</p>}
                                    {usuarioDisponible === true && <p className="text-[10px] text-green-600 mt-1">✓ Nombre de usuario disponible.</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Correo Electrónico
                                    </label>
                                    <input
                                        type="email"
                                        value={correo}
                                        onChange={(e) => setCorreo(e.target.value)}
                                        className={`w-full px-4 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600 ${correoDisponible === false
                                            ? 'border-red-500 focus:ring-red-500'
                                            : correoDisponible === true
                                                ? 'border-green-500 focus:ring-green-500'
                                                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                                            }`}
                                        placeholder="ejemplo@correo.com"
                                    />
                                    {verificandoCorreo && <p className="text-[10px] text-gray-400 mt-1 animate-pulse">Verificando correo...</p>}
                                    {correoDisponible === false && <p className="text-[10px] text-red-500 mt-1">⚠️ Este correo ya está registrado.</p>}
                                    {correoDisponible === true && <p className="text-[10px] text-green-600 mt-1">✓ Correo disponible.</p>}
                                </div>
                            </div>
                        </div>

                        {trabajadorAEditar && (
                            <div className="pt-4 border-t dark:border-gray-700">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div
                                        onClick={() => setEstaActivo(!estaActivo)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${estaActivo ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <span
                                            className={`${estaActivo ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out`}
                                        />
                                    </div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Estado: <span className={estaActivo ? 'text-green-600' : 'text-gray-500'}>{estaActivo ? 'Activo' : 'Inactivo'}</span>
                                    </span>
                                </label>
                                <p className="text-[10px] text-gray-500 mt-1 italic">
                                    Si desactivas al trabajador, no aparecerá en las listas de asignación.
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4 border-t dark:border-gray-700">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={cargando}
                                className={`flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all ${cargando ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 shadow-md'}`}
                            >
                                {cargando ? 'Guardando...' : (trabajadorAEditar ? 'Guardar Cambios' : 'Guardar')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};

export default NuevoTrabajadorModal;
