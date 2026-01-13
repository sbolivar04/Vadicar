import React, { useState, useEffect } from 'react';
import {
    XMarkIcon,
    KeyIcon,
    UserIcon,
    EyeIcon,
    EyeSlashIcon,
    ExclamationCircleIcon,
    CheckCircleIcon,
    PencilSquareIcon
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import Portal from './Portal';
import SearchableDropdown, { SearchableOption } from './SearchableDropdown';

import { Trabajador } from '../types';

interface GestionarUsuarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    usuarioExistente?: Trabajador | null; // El trabajador que ya tiene acceso
    onCambio: () => void;
    trabajadores: Trabajador[]; // Todos los trabajadores para elegir si es nuevo
    emailsAuth: string[]; // Emails que ya tienen cuenta en Supabase Auth
    onNotificar?: (mensaje: string, tipo?: 'exito' | 'error') => void;
}

const GestionarUsuarioModal: React.FC<GestionarUsuarioModalProps> = ({
    isOpen,
    onClose,
    usuarioExistente,
    onCambio,
    trabajadores,
    emailsAuth,
    onNotificar
}) => {
    const [trabajadorSeleccionado, setTrabajadorSeleccionado] = useState<Trabajador | null>(null);
    const [nombreUsuario, setNombreUsuario] = useState('');
    const [correo, setCorreo] = useState('');
    const [password, setPassword] = useState('');
    const [verPassword, setVerPassword] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editandoPassword, setEditandoPassword] = useState(false);

    // Opciones para el selector de trabajadores (Solo mostramos los que REALMENTE no tienen acceso en Auth)
    const opcionesTrabajadores: SearchableOption[] = trabajadores
        .filter(t => t.correo_electronico && !emailsAuth.includes(t.correo_electronico))
        .map(t => ({
            id: t.id,
            nombre: t.nombre_trabajador,
            correo: t.correo_electronico || ''
        }));

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setVerPassword(false); // Siempre ocultar contraseña al abrir
            if (usuarioExistente) {
                setTrabajadorSeleccionado(usuarioExistente);
                setNombreUsuario(usuarioExistente.nombre_usuario || '');
                setCorreo(usuarioExistente.correo_electronico || '');
                // Intentamos mostrar la contraseña guardada visiblemente, si existe
                setPassword(usuarioExistente.contrasena_visible || '');
                setEditandoPassword(false);
            } else {
                setTrabajadorSeleccionado(null);
                setNombreUsuario('');
                setCorreo('');
                setPassword('');
                setEditandoPassword(true);
            }
        }
    }, [isOpen, usuarioExistente]);

    const manejarSeleccionTrabajador = (id: string) => {
        const t = trabajadores.find(t => t.id === id);
        if (t) {
            setTrabajadorSeleccionado(t);
            setNombreUsuario(t.nombre_usuario || '');
            setCorreo(t.correo_electronico || '');
            setError(null);
        }
    };

    const guardarCambios = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!trabajadorSeleccionado) {
            setError('Por favor, selecciona un trabajador.');
            return;
        }

        if (!nombreUsuario.trim() || !correo.trim()) {
            setError('El trabajador seleccionado no tiene configurado un nombre de usuario o correo en su ficha.');
            return;
        }

        if (!usuarioExistente && !password) {
            setError('Debes asignar una contraseña para el nuevo acceso.');
            return;
        }

        // Validación de requisitos de contraseña antes de enviar
        if (password) {
            if (/\s/.test(password)) {
                setError('La contraseña no puede contener espacios en blanco.');
                return;
            }
            if (password.length < 6) {
                setError('La contraseña debe tener al menos 6 caracteres.');
                return;
            }
            if (!/[A-Z]/.test(password)) {
                setError('La contraseña debe incluir al menos una letra mayúscula.');
                return;
            }
            if (!/[0-9]/.test(password)) {
                setError('La contraseña debe incluir al menos un número.');
                return;
            }
            if (!/[a-z]/.test(password)) {
                setError('La contraseña debe incluir al menos una letra minúscula.');
                return;
            }
        }

        setCargando(true);

        try {
            // 1. Llamar a la Edge Function 'manage-users' para gestionar Auth (Supabase Auth)
            const { data: authData, error: authError } = await supabase.functions.invoke('manage-users', {
                body: {
                    action: 'upsert_user',
                    email: correo.trim(),
                    password: password || undefined,
                    username: nombreUsuario.trim()
                }
            });

            if (authError || (authData && authData.error)) {
                throw new Error(authError?.message || authData?.error || 'Error en el servicio de autenticación');
            }

            // 2. Actualizar tabla trabajadores (por si acaso hubiera algún cambio, aunque aquí es readonly en UI)
            const { error: errorTrabajador } = await supabase
                .from('trabajadores')
                .update({
                    nombre_usuario: nombreUsuario.trim(),
                    correo_electronico: correo.trim(),
                    contrasena_visible: password // Guardamos la contraseña visiblemente
                })
                .eq('id', trabajadorSeleccionado.id);

            if (errorTrabajador) throw errorTrabajador;

            const mensajeExito = usuarioExistente
                ? 'Datos de acceso y contraseña actualizados correctamente.'
                : 'Acceso creado correctamente.';

            if (onNotificar) {
                onNotificar(mensajeExito, 'exito');
            }

            onCambio();
            onClose();

        } catch (err: any) {
            setError(err.message || 'Error al procesar la solicitud.');
        } finally {
            setCargando(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                        <div className="flex items-center gap-2">
                            <KeyIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {usuarioExistente ? 'Gestionar Acceso' : 'Crear Nuevo Acceso'}
                            </h2>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>

                    <form onSubmit={guardarCambios} className="p-6 space-y-5">
                        {error && (
                            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs animate-shake">
                                <div className="flex items-center gap-2">
                                    <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
                                    <span>{error}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setError(null)}
                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors"
                                >
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Selección de Trabajador */}
                        {!usuarioExistente ? (
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 leading-none ${error && !trabajadorSeleccionado ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    Seleccionar Trabajador
                                </label>
                                <div className={`${error && !trabajadorSeleccionado ? 'ring-2 ring-red-500 rounded-lg' : ''}`}>
                                    <SearchableDropdown
                                        placeholder="Buscar trabajador..."
                                        options={opcionesTrabajadores}
                                        onSelect={manejarSeleccionTrabajador}
                                        selectedValue={trabajadorSeleccionado?.id}
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1 italic">
                                    Solo aparecen trabajadores que aún no tienen nombre de usuario.
                                </p>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl">
                                <div className="p-2 bg-blue-600 rounded-lg">
                                    <UserIcon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Trabajador</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{usuarioExistente.nombre_trabajador}</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            {/* Nombre de Usuario */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 leading-none">
                                    Nombre de Usuario
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        readOnly
                                        value={nombreUsuario}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed focus:outline-none transition-all"
                                        placeholder="Nombre de usuario..."
                                    />
                                    <UserIcon className="absolute left-3.5 top-2.5 h-5 w-5 text-gray-400" />
                                </div>
                            </div>

                            {/* Correo Electrónico */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 leading-none">
                                    Correo Electrónico
                                </label>
                                <input
                                    type="email"
                                    readOnly
                                    value={correo}
                                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed focus:outline-none transition-all"
                                    placeholder="Correo electrónico..."
                                />
                            </div>

                            {/* Contraseña */}
                            <div>
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label className={`block text-sm font-medium leading-none ${error && (!password && (!usuarioExistente || editandoPassword)) ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                            Contraseña
                                        </label>
                                        <div className="flex gap-2">
                                            {!editandoPassword && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEditandoPassword(true)}
                                                    className="text-gray-400 hover:text-blue-600 transition-colors"
                                                    title="Editar contraseña"
                                                >
                                                    <PencilSquareIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={verPassword ? "text" : "password"}
                                            value={password}
                                            readOnly={!editandoPassword}
                                            onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))} // Bloqueamos espacios aquí
                                            className={`w-full pl-10 pr-12 py-2.5 bg-gray-50 dark:bg-gray-700/50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white transition-all hover:bg-white dark:hover:bg-gray-700 
                                                ${error && (!password && (!usuarioExistente || editandoPassword)) ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'}
                                                ${!editandoPassword ? 'cursor-default opacity-80' : ''}`}
                                            placeholder={editandoPassword ? "Escribir contraseña..." : "Contraseña..."}
                                        />
                                        <KeyIcon className={`absolute left-3.5 top-2.5 h-5 w-5 ${error && (!password && (!usuarioExistente || editandoPassword)) ? 'text-red-500' : 'text-gray-400'}`} />
                                        <button
                                            type="button"
                                            onClick={() => setVerPassword(!verPassword)}
                                            className="absolute right-3.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                        >
                                            {verPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                                        </button>
                                    </div>

                                    {/* Indicadores de requisitos de contraseña: Solo visibles al editar */}
                                    {editandoPassword && (
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400 select-none animate-in fade-in slide-in-from-top-2">
                                            <div className={`flex items-center gap-1.5 transition-colors duration-200 ${password.length >= 6 ? 'text-green-600 dark:text-green-400' : ''}`}>
                                                {password.length >= 6
                                                    ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                                                    : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                                                }
                                                Mín. 6 caracteres
                                            </div>
                                            <div className={`flex items-center gap-1.5 transition-colors duration-200 ${/[A-Z]/.test(password) ? 'text-green-600 dark:text-green-400' : ''}`}>
                                                {/[A-Z]/.test(password)
                                                    ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                                                    : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                                                }
                                                Letra mayúscula
                                            </div>
                                            <div className={`flex items-center gap-1.5 transition-colors duration-200 ${/[0-9]/.test(password) ? 'text-green-600 dark:text-green-400' : ''}`}>
                                                {/[0-9]/.test(password)
                                                    ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                                                    : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                                                }
                                                Número
                                            </div>
                                            <div className={`flex items-center gap-1.5 transition-colors duration-200 ${/[a-z]/.test(password) ? 'text-green-600 dark:text-green-400' : ''}`}>
                                                {/[a-z]/.test(password)
                                                    ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                                                    : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                                                }
                                                Letra minúscula
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Botones de Acción: Solo visibles al editar (o si es nuevo usuario) */}
                        {editandoPassword && (
                            <div className="flex gap-3 pt-4 border-t dark:border-gray-700 font-bold animate-in fade-in slide-in-from-bottom-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (usuarioExistente) {
                                            setEditandoPassword(false);
                                            // Restaurar contraseña original si cancela
                                            setPassword(usuarioExistente.contrasena_visible || '');
                                            setError(null);
                                        } else {
                                            onClose();
                                        }
                                    }}
                                    className="flex-1 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={cargando}
                                    className={`flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg hover:scale-[1.02] active:scale-95 ${cargando ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {cargando ? 'Procesando...' : (usuarioExistente ? 'Actualizar Acceso' : 'Crear Acceso')}
                                </button>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </Portal>
    );
};

export default GestionarUsuarioModal;
