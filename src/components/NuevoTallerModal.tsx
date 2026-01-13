import React, { useState, useEffect } from 'react';
import { XMarkIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import Portal from './Portal';
import FilterDropdown from './FilterDropdown';

import { Taller, Ciudad, Barrio } from '../types';

interface NuevoTallerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTallerGuardado: () => void;
    tallerAEditar?: Taller | null;
}

const opcionesTipoDocumento = [
    { id: '1', nombre: 'CC' },
    { id: '2', nombre: 'NIT' }
];

const opcionesLabor = [
    { id: '1', nombre: 'Confección' },
    { id: '2', nombre: 'Ojal y Botón' }
];

const NuevoTallerModal: React.FC<NuevoTallerModalProps> = ({
    isOpen,
    onClose,
    onTallerGuardado,
    tallerAEditar
}) => {
    const [nombre, setNombre] = useState('');
    const [tipoDocumento, setTipoDocumento] = useState<'CC' | 'NIT' | ''>('');
    const [nroDocumento, setNroDocumento] = useState('');
    const [direccion, setDireccion] = useState('');
    const [ciudadId, setCiudadId] = useState('');
    const [barrioId, setBarrioId] = useState('');
    const [celular, setCelular] = useState('');
    const [labor, setLabor] = useState<'Confección' | 'Ojal y Botón' | ''>('');
    const [descripcion, setDescripcion] = useState('');
    const [estaActivo, setEstaActivo] = useState(true);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showErrors, setShowErrors] = useState(false);

    // Estados para ciudad dinámica
    const [ciudadesDisponibles, setCiudadesDisponibles] = useState<{ id: string, nombre: string }[]>([]);
    const [mostrandoInputCiudad, setMostrandoInputCiudad] = useState(false);
    const [nuevaCiudad, setNuevaCiudad] = useState('');

    // Estados para barrio dinámico
    const [barriosDisponibles, setBarriosDisponibles] = useState<{ id: string, nombre: string }[]>([]);
    const [mostrandoInputBarrio, setMostrandoInputBarrio] = useState(false);
    const [nuevoBarrio, setNuevoBarrio] = useState('');

    // Estado para edición modal
    const [itemEditando, setItemEditando] = useState<{ type: 'ciudad' | 'barrio', id: string, nombre: string } | null>(null);
    const [nombreEditando, setNombreEditando] = useState('');

    // Validación Nombre
    const [errorNombre, setErrorNombre] = useState<string | null>(null);
    // Validación Celular
    const [errorCelular, setErrorCelular] = useState<string | null>(null);

    const cargarListas = async () => {
        try {
            const { data: ciudadesData } = await supabase.from('ciudades').select('id, nombre').order('nombre');
            if (ciudadesData) setCiudadesDisponibles(ciudadesData.map(c => ({ id: c.id, nombre: c.nombre })));

            const { data: barriosData } = await supabase.from('barrios').select('id, nombre').order('nombre');
            if (barriosData) setBarriosDisponibles(barriosData.map(b => ({ id: b.id, nombre: b.nombre })));
        } catch (error) {
            console.error('Error cargando listas:', error);
        }
    };

    useEffect(() => {
        if (isOpen) {
            cargarListas();
            setMostrandoInputCiudad(false);
            setNuevaCiudad('');
            setMostrandoInputBarrio(false);
            setNuevoBarrio('');
            setErrorNombre(null);
            setErrorCelular(null);

            if (tallerAEditar) {
                setNombre(tallerAEditar.nombre);
                setTipoDocumento((tallerAEditar.tipo_documento as 'CC' | 'NIT') || '');
                setNroDocumento(tallerAEditar.nro_documento || '');
                setDireccion(tallerAEditar.direccion || '');
                setCiudadId(tallerAEditar.ciudad_id || '');
                setBarrioId(tallerAEditar.barrio_id || '');
                setCelular(tallerAEditar.celular || '');
                setLabor((tallerAEditar.labor as 'Confección' | 'Ojal y Botón') || '');
                setDescripcion(tallerAEditar.descripcion || '');
                setEstaActivo(tallerAEditar.esta_activo !== undefined ? tallerAEditar.esta_activo : true);
            } else {
                setNombre('');
                setTipoDocumento('');
                setNroDocumento('');
                setDireccion('');
                setCiudadId('');
                setBarrioId('');
                setCelular('');
                setLabor('');
                setDescripcion('');
                setEstaActivo(true);
            }
            setError(null);
            setShowErrors(false);
        }
    }, [isOpen, tallerAEditar]);

    const handleNombreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNombre(val);
        if (/\d/.test(val)) {
            setErrorNombre('El nombre del taller no debe contener números.');
        } else {
            setErrorNombre(null);
        }
    };

    const handleNroDocumentoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (/^\d*$/.test(val)) {
            setNroDocumento(val);
        }
    };

    const handleCelularChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (/^\d*$/.test(val) && val.length <= 10) {
            setCelular(val);
            if (val.length > 0 && val[0] !== '3') {
                setErrorCelular('El número de celular debe comenzar con el dígito 3.');
            } else {
                setErrorCelular(null);
            }
        }
    };

    const confirmarNuevaCiudad = async () => {
        if (nuevaCiudad.trim()) {
            const nombreNormalizado = nuevaCiudad.trim();
            try {
                const { error } = await supabase.from('ciudades').insert([{ nombre: nombreNormalizado }]);
                if (!error) {
                    await cargarListas();
                    // Get the ID of the newly created ciudad
                    const { data: newCiudad } = await supabase.from('ciudades').select('id').eq('nombre', nombreNormalizado).single();
                    if (newCiudad) setCiudadId(newCiudad.id);
                }
            } catch (e) { console.error(e); }
        }
        setMostrandoInputCiudad(false);
        setNuevaCiudad('');
    };

    const handleEditarCiudad = (item: Ciudad) => {
        setItemEditando({ type: 'ciudad', id: item.id, nombre: item.nombre });
        setNombreEditando(item.nombre);
    };

    const confirmarNuevoBarrio = async () => {
        if (nuevoBarrio.trim()) {
            const nombreNormalizado = nuevoBarrio.trim();
            try {
                const { error } = await supabase.from('barrios').insert([{ nombre: nombreNormalizado }]);
                if (!error) {
                    await cargarListas();
                    // Get the ID of the newly created barrio
                    const { data: newBarrio } = await supabase.from('barrios').select('id').eq('nombre', nombreNormalizado).single();
                    if (newBarrio) setBarrioId(newBarrio.id);
                }
            } catch (e) { console.error(e); }
        }
        setMostrandoInputBarrio(false);
        setNuevoBarrio('');
    };

    const handleEditarBarrio = (item: Barrio) => {
        setItemEditando({ type: 'barrio', id: item.id, nombre: item.nombre });
        setNombreEditando(item.nombre);
    };

    const guardarEdicionItem = async () => {
        if (!itemEditando || !nombreEditando.trim() || nombreEditando.trim() === itemEditando.nombre) {
            setItemEditando(null);
            return;
        }

        const tableName = itemEditando.type === 'ciudad' ? 'ciudades' : 'barrios';

        try {
            const { data } = await supabase.from(tableName).select('id').eq('nombre', itemEditando.nombre).single();
            if (data) {
                const { error } = await supabase.from(tableName).update({ nombre: nombreEditando.trim() }).eq('id', data.id);
                if (!error) {
                    await cargarListas();
                    // No need to update selected IDs as they remain the same
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setItemEditando(null);
            setNombreEditando('');
        }
    };

    const guardarTaller = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowErrors(true);

        if (!nombre.trim()) { setError('Por favor, ingresa el nombre del taller.'); return; }
        if (/\d/.test(nombre)) { setError('El nombre del taller no debe contener números.'); return; }
        if (!tipoDocumento) { setError('Por favor, selecciona el tipo de documento.'); return; }
        if (!nroDocumento.trim()) { setError('Por favor, ingresa el número de documento.'); return; }
        if (!direccion.trim()) { setError('Por favor, ingresa la dirección.'); return; }
        if (!ciudadId) { setError('Por favor, selecciona la ciudad.'); return; }
        if (!barrioId) { setError('Por favor, selecciona el barrio.'); return; }
        if (!celular.trim() || celular.length !== 10) { setError('El celular debe tener exactamente 10 dígitos.'); return; }
        if (celular[0] !== '3') { setError('El número de celular debe comenzar con el dígito 3.'); return; }
        if (!labor) { setError('Por favor, selecciona la labor.'); return; }

        setCargando(true);
        setError(null);

        try {
            const payload = {
                nombre: nombre.trim(),
                tipo_documento: tipoDocumento,
                nro_documento: nroDocumento.trim(),
                direccion: direccion.trim(),
                ciudad_id: ciudadId,
                barrio_id: barrioId,
                celular: celular.trim(),
                labor: labor,
                descripcion: descripcion.trim() || null,
                esta_activo: estaActivo
            };

            if (tallerAEditar) {
                const { error: errorSupa } = await supabase
                    .from('talleres')
                    .update(payload)
                    .eq('id', tallerAEditar.id);
                if (errorSupa) throw errorSupa;
            } else {
                const { error: errorSupa } = await supabase
                    .from('talleres')
                    .insert([payload]);
                if (errorSupa) throw errorSupa;
            }

            onTallerGuardado();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Error al guardar el taller.');
        } finally {
            setCargando(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all h-[90vh] overflow-y-auto">
                    <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {tallerAEditar ? 'Editar Taller' : 'Nuevo Taller'}
                        </h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>

                    <form noValidate onSubmit={guardarTaller} className="p-6 space-y-4">
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
                                Nombre del Taller <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={nombre}
                                onChange={handleNombreChange}
                                className={`w-full px-4 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600 ${showErrors && !nombre.trim()
                                    ? 'border-red-500 focus:ring-red-500'
                                    : (errorNombre ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500')
                                    }`}
                                placeholder="Ej: Taller Central"
                            />
                            {errorNombre && (
                                <div className="mt-2 flex items-center justify-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 animate-in fade-in zoom-in duration-300">
                                    <ExclamationCircleIcon className="w-5 h-5 mr-2 flex-shrink-0" />
                                    <span className="text-sm font-medium">{errorNombre}</span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Tipo Documento <span className="text-red-500">*</span>
                            </label>
                            <FilterDropdown
                                placeholder="Seleccionar..."
                                options={opcionesTipoDocumento}
                                selectedValue={tipoDocumento}
                                onSelect={(val) => setTipoDocumento(val as any)}
                                hasError={showErrors && !tipoDocumento}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Nro Documento <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={nroDocumento}
                                onChange={handleNroDocumentoChange}
                                className={`w-full px-4 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600 ${showErrors && !nroDocumento.trim()
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                                    }`}
                                placeholder="Solo números"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Dirección <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={direccion}
                                onChange={(e) => setDireccion(e.target.value)}
                                className={`w-full px-4 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600 ${showErrors && !direccion.trim()
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                                    }`}
                                placeholder="Dirección completa"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Ciudad <span className="text-red-500">*</span>
                            </label>
                            {mostrandoInputCiudad ? (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={nuevaCiudad}
                                        onChange={(e) => setNuevaCiudad(e.target.value)}
                                        className="flex-grow px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                                        placeholder="Ej: Cartagena"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                confirmarNuevaCiudad();
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={confirmarNuevaCiudad}
                                        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                                    >
                                        Añadir
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMostrandoInputCiudad(false);
                                            setNuevaCiudad('');
                                        }}
                                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs"
                                    >
                                        X
                                    </button>
                                </div>
                            ) : (
                                <FilterDropdown
                                    placeholder="Seleccionar Ciudad..."
                                    options={[...ciudadesDisponibles, { id: 'nuevo', nombre: '+ Agregar nueva ciudad...' }]}
                                    selectedValue={ciudadId}
                                    valueKey="id"
                                    onSelect={(val) => {
                                        if (val === 'nuevo') {
                                            setMostrandoInputCiudad(true);
                                        } else {
                                            setCiudadId(val);
                                        }
                                    }}
                                    hasError={showErrors && !ciudadId}
                                    onEdit={handleEditarCiudad}
                                />
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Barrio <span className="text-red-500">*</span>
                            </label>
                            {mostrandoInputBarrio ? (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={nuevoBarrio}
                                        onChange={(e) => setNuevoBarrio(e.target.value)}
                                        className="flex-grow px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                                        placeholder="Ingrese el barrio..."
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                confirmarNuevoBarrio();
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={confirmarNuevoBarrio}
                                        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                                    >
                                        Añadir
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMostrandoInputBarrio(false);
                                            setNuevoBarrio('');
                                        }}
                                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs"
                                    >
                                        X
                                    </button>
                                </div>
                            ) : (
                                <FilterDropdown
                                    placeholder="Seleccionar Barrio..."
                                    options={[...barriosDisponibles, { id: 'nuevo', nombre: '+ Agregar nuevo barrio...' }]}
                                    selectedValue={barrioId}
                                    valueKey="id"
                                    onSelect={(val) => {
                                        if (val === 'nuevo') {
                                            setMostrandoInputBarrio(true);
                                        } else {
                                            setBarrioId(val);
                                        }
                                    }}
                                    hasError={showErrors && !barrioId}
                                    enableSearch={true}
                                    onEdit={handleEditarBarrio}
                                />
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Celular <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={celular}
                                onChange={handleCelularChange}
                                className={`w-full px-4 py-2 bg-white dark:bg-gray-700/50 border rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600 ${showErrors && (celular.length !== 10)
                                    ? 'border-red-500 focus:ring-red-500'
                                    : (errorCelular ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500')
                                    }`}
                                placeholder="3001234567 (10 dígitos)"
                            />
                            {errorCelular && (
                                <div className="mt-2 flex items-center justify-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 animate-in fade-in zoom-in duration-300">
                                    <ExclamationCircleIcon className="w-5 h-5 mr-2 flex-shrink-0" />
                                    <span className="text-sm font-medium">{errorCelular}</span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Labor <span className="text-red-500">*</span>
                            </label>
                            <FilterDropdown
                                placeholder="Seleccionar labor..."
                                options={opcionesLabor}
                                selectedValue={labor}
                                onSelect={(val) => setLabor(val as any)}
                                hasError={showErrors && !labor}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Descripción (Opcional)
                            </label>
                            <textarea
                                value={descripcion}
                                onChange={(e) => setDescripcion(e.target.value)}
                                rows={2}
                                className="w-full px-4 py-2 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-600"
                                placeholder="..."
                            />
                        </div>

                        {tallerAEditar && (
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
                            </div>
                        )}

                        <div className="flex gap-3 pt-4 border-t dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800 pb-2">
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
                                {cargando ? 'Guardando...' : (tallerAEditar ? 'Guardar Cambios' : 'Guardar Taller')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            {/* Modal de Edición de Item */}
            {itemEditando && (
                <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[60] p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
                        <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                                Editar {itemEditando.type === 'ciudad' ? 'Ciudad' : 'Barrio'}
                            </h3>
                            <button onClick={() => setItemEditando(null)} className="text-gray-400 hover:text-gray-600">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nombre
                            </label>
                            <input
                                type="text"
                                value={nombreEditando}
                                onChange={(e) => setNombreEditando(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') guardarEdicionItem();
                                }}
                            />
                            <div className="mt-6 flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setItemEditando(null)}
                                    className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={guardarEdicionItem}
                                    className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Portal>
    );
};

export default NuevoTallerModal;
