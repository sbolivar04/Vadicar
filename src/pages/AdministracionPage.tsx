import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
    UsersIcon,
    KeyIcon,
    HomeModernIcon,
    PlusIcon,
    MagnifyingGlassIcon,
    PencilSquareIcon,
    TrashIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import NuevoTrabajadorModal from '../components/NuevoTrabajadorModal';
import NuevoTallerModal from '../components/NuevoTallerModal';
import GenericConfirmModal from '../components/GenericConfirmModal';
import GestionarUsuarioModal from '../components/GestionarUsuarioModal.tsx';
import Pagination from '../components/Pagination';
import RowsPerPageSelector from '../components/RowsPerPageSelector';
import FilterDropdown from '../components/FilterDropdown';

import { Trabajador, Taller } from '../types';

type TipoPestana = 'trabajadores' | 'usuarios' | 'talleres';

const AdministracionPage: React.FC = () => {
    const [pestanaActiva, setPestanaActiva] = useState<TipoPestana>('trabajadores');
    const [terminoBusqueda, setTerminoBusqueda] = useState('');

    // Estados de datos
    const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
    const [talleres, setTalleres] = useState<Taller[]>([]);
    const [cargando, setCargando] = useState(false);

    // Estados de filtros
    const [filtroEstadoTaller, setFiltroEstadoTaller] = useState('todos');
    const [filtroLaborTaller, setFiltroLaborTaller] = useState('todos');
    const [filtroCiudadTaller, setFiltroCiudadTaller] = useState('todos');
    const [listaCiudades, setListaCiudades] = useState<{ id: string, nombre: string }[]>([]);

    // Estados de paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Estados de modales
    const [esModalTrabajadorAbierto, setEsModalTrabajadorAbierto] = useState(false);
    const [esModalTallerAbierto, setEsModalTallerAbierto] = useState(false);
    const [trabajadorAEditar, setTrabajadorAEditar] = useState<Trabajador | null>(null);
    const [tallerAEditar, setTallerAEditar] = useState<Taller | null>(null);
    const [itemAEliminar, setItemAEliminar] = useState<{ id: string, tipo: 'trabajador' | 'taller' | 'quitar_acceso', nombre: string, email?: string } | null>(null);
    const [esModalGestionUsuarioAbierto, setEsModalGestionUsuarioAbierto] = useState(false);
    const [usuarioAGestionar, setUsuarioAGestionar] = useState<Trabajador | null>(null);
    const [emailsAuth, setEmailsAuth] = useState<string[]>([]);
    const [sincronizandoAuth, setSincronizandoAuth] = useState(false);
    const [notificacion, setNotificacion] = useState<{ mensaje: string; tipo: 'exito' | 'error' } | null>(null);

    const mostrarNotificacion = (mensaje: string, tipo: 'exito' | 'error' = 'exito') => {
        setNotificacion({ mensaje, tipo });
        const id = setTimeout(() => {
            setNotificacion(prev => (prev?.mensaje === mensaje ? null : prev));
        }, 5000);
        return () => clearTimeout(id);
    };

    // Función para obtener usuarios reales de Supabase Auth
    const obtenerUsuariosAuth = useCallback(async () => {
        setSincronizandoAuth(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: { action: 'list_users' }
            });

            if (error) {
                console.error("Error invoking edge function:", error);
                return;
            }

            if (data?.emails) {
                setEmailsAuth(data.emails);
            } else if (data?.error) {
                console.error("Error en Edge Function response:", data.error);
            }
        } catch (err) {
            console.error("Error fatal al sincronizar Auth:", err);
        } finally {
            setSincronizandoAuth(false);
        }
    }, []);

    // Funciones de obtención de datos
    const obtenerDatos = useCallback(async (pestana: TipoPestana) => {
        setCargando(true);
        try {
            if (pestana === 'trabajadores' || pestana === 'usuarios') {
                const { data } = await supabase
                    .from('trabajadores')
                    .select('*, cargos(nombre)')
                    .order('nombre_trabajador');
                setTrabajadores(data || []);

                // Si estamos en la pestaña de usuarios, sincronizamos con Supabase Auth
                if (pestana === 'usuarios') {
                    obtenerUsuariosAuth();
                }
            } else if (pestana === 'talleres') {
                const { data: talleresData } = await supabase
                    .from('talleres')
                    .select('*, ciudades(nombre), barrios(nombre)')
                    .order('nombre');
                setTalleres(talleresData || []);

                // Obtener lista de ciudades para el filtro
                const { data: ciudadesData } = await supabase
                    .from('ciudades')
                    .select('id, nombre')
                    .order('nombre');
                setListaCiudades(ciudadesData || []);
            }
        } catch (err) {
            console.error(`Error al obtener ${pestana}:`, err);
        } finally {
            setCargando(false);
        }
    }, [obtenerUsuariosAuth]);

    useEffect(() => {
        obtenerDatos(pestanaActiva);
        setTerminoBusqueda(''); // Resetear buscador
        setCurrentPage(1); // Resetear a la primera página al cambiar de pestaña
        setRowsPerPage(10); // Resetear filas por página al cambiar de pestaña
        setFiltroEstadoTaller('todos'); // Resetear filtro de estado
        setFiltroLaborTaller('todos'); // Resetear filtro de labor
        setFiltroCiudadTaller('todos'); // Resetear filtro de ciudad
    }, [pestanaActiva, obtenerDatos]);

    useEffect(() => {
        setCurrentPage(1); // Resetear al cambiar búsqueda o filas por página
    }, [terminoBusqueda, rowsPerPage]);

    // --- Suscripción en tiempo real ---
    useEffect(() => {
        const canalTrabajadores = supabase
            .channel('cambios-trabajadores')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'trabajadores' },
                () => obtenerDatos('trabajadores')
            )
            .subscribe();

        const canalTalleres = supabase
            .channel('cambios-talleres')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'talleres' },
                () => obtenerDatos('talleres')
            )
            .subscribe();

        const canalCargos = supabase
            .channel('cambios-cargos')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'cargos' },
                () => {
                    // Si cambia un cargo, refrescamos trabajadores ya que dependen del nombre del cargo
                    obtenerDatos('trabajadores');
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(canalTrabajadores);
            supabase.removeChannel(canalTalleres);
            supabase.removeChannel(canalCargos);
        };
    }, [obtenerDatos]);

    // --- Lógica de filtrado ---
    const trabajadoresFiltrados = useMemo(() => {
        return trabajadores.filter(t =>
            t.nombre_trabajador.toLowerCase().includes(terminoBusqueda.toLowerCase()) ||
            (t.cargos?.nombre && t.cargos.nombre.toLowerCase().includes(terminoBusqueda.toLowerCase()))
        );
    }, [trabajadores, terminoBusqueda]);

    const usuariosFiltrados = useMemo(() => {
        return trabajadores.filter(t => {
            const emailTraba = (t.correo_electronico || '').toLowerCase();
            // Verificamos si este correo existe en la lista de Auth
            const tieneAccesoReal = emailTraba && emailsAuth.some(e => e.toLowerCase() === emailTraba);

            return tieneAccesoReal && (
                (t.correo_electronico || '').toLowerCase().includes(terminoBusqueda.toLowerCase()) ||
                t.nombre_trabajador.toLowerCase().includes(terminoBusqueda.toLowerCase()) ||
                (t.nombre_usuario || '').toLowerCase().includes(terminoBusqueda.toLowerCase())
            );
        });
    }, [trabajadores, terminoBusqueda, emailsAuth]);

    const talleresFiltrados = useMemo(() => {
        return talleres.filter(t => {
            const matchesSearch =
                t.nombre.toLowerCase().includes(terminoBusqueda.toLowerCase()) ||
                (t.descripcion && t.descripcion.toLowerCase().includes(terminoBusqueda.toLowerCase()));

            const matchesStatus =
                filtroEstadoTaller === 'todos' ||
                (filtroEstadoTaller === 'activos' && t.esta_activo) ||
                (filtroEstadoTaller === 'inactivos' && !t.esta_activo);

            const matchesLabor =
                filtroLaborTaller === 'todos' ||
                t.labor === filtroLaborTaller;

            const matchesCiudad =
                filtroCiudadTaller === 'todos' ||
                t.ciudad_id === filtroCiudadTaller;

            return matchesSearch && matchesStatus && matchesLabor && matchesCiudad;
        });
    }, [talleres, terminoBusqueda, filtroEstadoTaller, filtroLaborTaller, filtroCiudadTaller]);

    // --- Paginación ---
    const datosFiltradosActuales = useMemo(() => {
        if (pestanaActiva === 'trabajadores') return trabajadoresFiltrados;
        if (pestanaActiva === 'usuarios') return usuariosFiltrados;
        return talleresFiltrados;
    }, [pestanaActiva, trabajadoresFiltrados, usuariosFiltrados, talleresFiltrados]);

    const totalPages = Math.ceil(datosFiltradosActuales.length / rowsPerPage);

    const datosPaginados = useMemo(() => {
        const startIndex = (currentPage - 1) * rowsPerPage;
        return datosFiltradosActuales.slice(startIndex, startIndex + rowsPerPage);
    }, [datosFiltradosActuales, currentPage, rowsPerPage]);

    const trabajadoresPaginados = useMemo(() =>
        pestanaActiva === 'trabajadores' ? (datosPaginados as Trabajador[]) : []
        , [pestanaActiva, datosPaginados]);

    const usuariosPaginados = useMemo(() =>
        pestanaActiva === 'usuarios' ? (datosPaginados as Trabajador[]) : []
        , [pestanaActiva, datosPaginados]);

    const talleresPaginados = useMemo(() =>
        pestanaActiva === 'talleres' ? (datosPaginados as Taller[]) : []
        , [pestanaActiva, datosPaginados]);

    const pestanas = [
        { id: 'trabajadores' as TipoPestana, label: 'Trabajadores', icon: UsersIcon },
        { id: 'usuarios' as TipoPestana, label: 'Usuarios', icon: KeyIcon },
        { id: 'talleres' as TipoPestana, label: 'Talleres', icon: HomeModernIcon },
    ];

    const manejarNuevoRegistro = () => {
        if (pestanaActiva === 'trabajadores') {
            setTrabajadorAEditar(null);
            setEsModalTrabajadorAbierto(true);
        } else if (pestanaActiva === 'usuarios') {
            setUsuarioAGestionar(null);
            setEsModalGestionUsuarioAbierto(true);
        } else if (pestanaActiva === 'talleres') {
            setTallerAEditar(null);
            setEsModalTallerAbierto(true);
        }
    };

    const manejarEditarTrabajador = (t: Trabajador) => {
        setTrabajadorAEditar(t);
        setEsModalTrabajadorAbierto(true);
    };

    const manejarEditarTaller = (t: Taller) => {
        setTallerAEditar(t);
        setEsModalTallerAbierto(true);
    };

    const manejarGestionarUsuario = (u: Trabajador) => {
        setUsuarioAGestionar(u);
        setEsModalGestionUsuarioAbierto(true);
    };

    const cambiarEstadoTaller = async (tallerId: string, nuevoEstado: boolean) => {
        try {
            const { error } = await supabase
                .from('talleres')
                .update({ esta_activo: nuevoEstado })
                .eq('id', tallerId);

            if (error) throw error;

            // Recargar datos
            obtenerDatos('talleres');
        } catch (err) {
            console.error('Error al cambiar estado del taller:', err);
        }
    };

    const cambiarEstadoTrabajador = async (trabajadorId: string, nuevoEstado: boolean) => {
        try {
            const { error } = await supabase
                .from('trabajadores')
                .update({ esta_activo: nuevoEstado })
                .eq('id', trabajadorId);

            if (error) throw error;

            // Recargar datos
            obtenerDatos('trabajadores');
        } catch (err) {
            console.error('Error al cambiar estado del trabajador:', err);
        }
    };

    const confirmarEliminacion = async () => {
        if (!itemAEliminar) return;
        try {
            if (itemAEliminar.tipo === 'quitar_acceso') {
                // 1. Actualizar tabla trabajadores: Conservar nombre_usuario, borrar contraseña visible
                const { error: err } = await supabase
                    .from('trabajadores')
                    .update({ contrasena_visible: null })
                    .eq('id', itemAEliminar.id);
                if (err) throw err;

                // 2. Intentar quitar de Auth via Function (Opcional, pero recomendado)
                if (itemAEliminar.email) {
                    await supabase.functions.invoke('manage-users', {
                        body: { action: 'delete_user', email: itemAEliminar.email }
                    });
                }
            } else {
                const tabla = itemAEliminar.tipo === 'trabajador' ? 'trabajadores' : 'talleres';
                const { error: err } = await supabase.from(tabla).delete().eq('id', itemAEliminar.id);
                if (err) throw err;
            }

            obtenerDatos(pestanaActiva);
            setItemAEliminar(null);
            mostrarNotificacion(
                itemAEliminar.tipo === 'quitar_acceso'
                    ? 'Acceso eliminado correctamente.'
                    : 'Registro eliminado correctamente.'
            );
        } catch (err: any) {
            console.error("Error al eliminar:", err);
            mostrarNotificacion("No se pudo eliminar el registro. Es posible que tenga datos asociados.", 'error');
        }
    };

    return (
        <div className="px-6 py-3 space-y-3">
            {/* Selector de Pestañas */}
            <div className="flex p-1 space-x-1 bg-gray-200/50 dark:bg-gray-800/50 rounded-xl w-fit">
                {pestanas.map((p) => {
                    const Icono = p.icon;
                    const esActiva = pestanaActiva === p.id;
                    return (
                        <button
                            key={p.id}
                            onClick={() => setPestanaActiva(p.id)}
                            className={`
                flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
                ${esActiva
                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
                                }
              `}
                        >
                            <Icono className={`h-4 w-4 ${esActiva ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                            {p.label}
                        </button>
                    );
                })}
            </div>

            {/* Barra de Acciones */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex flex-wrap items-center gap-4 flex-grow">
                    <div className="relative min-w-[200px] flex-grow md:max-w-md">
                        <input
                            type="text"
                            placeholder={`Buscar ${pestanaActiva === 'talleres' ? 'talleres' : pestanaActiva === 'trabajadores' ? 'trabajadores' : 'usuarios'}...`}
                            value={terminoBusqueda}
                            onChange={(e) => setTerminoBusqueda(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                        />
                        <MagnifyingGlassIcon className="absolute left-3.5 top-2.5 h-5 w-5 text-gray-400" />
                    </div>

                    {pestanaActiva === 'talleres' && (
                        <div className="flex flex-wrap items-center gap-3 flex-grow md:flex-nowrap">
                            <div className="flex-grow min-w-[140px]">
                                <FilterDropdown
                                    label="Estado"
                                    placeholder="Todos"
                                    selectedValue={filtroEstadoTaller}
                                    valueKey="id"
                                    options={[
                                        { id: 'todos', nombre: 'Todos' },
                                        { id: 'activos', nombre: 'Activos' },
                                        { id: 'inactivos', nombre: 'Inactivos' }
                                    ]}
                                    onSelect={setFiltroEstadoTaller}
                                />
                            </div>
                            <div className="flex-grow min-w-[150px]">
                                <FilterDropdown
                                    label="Labor"
                                    placeholder="Todos"
                                    selectedValue={filtroLaborTaller}
                                    valueKey="id"
                                    options={[
                                        { id: 'todos', nombre: 'Todos' },
                                        { id: 'Confección', nombre: 'Confección' },
                                        { id: 'Ojal y Botón', nombre: 'Ojal y Botón' }
                                    ]}
                                    onSelect={setFiltroLaborTaller}
                                />
                            </div>
                            <div className="flex-grow min-w-[180px]">
                                <FilterDropdown
                                    label="Ciudad"
                                    placeholder="Todos"
                                    selectedValue={filtroCiudadTaller}
                                    valueKey="id"
                                    options={[
                                        { id: 'todos', nombre: 'Todos' },
                                        ...listaCiudades
                                    ]}
                                    onSelect={setFiltroCiudadTaller}
                                    enableSearch
                                />
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={manejarNuevoRegistro}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-full transition-all hover:scale-105 shadow-md"
                >
                    <PlusIcon className="h-4 w-4" />
                    Nuevo {pestanaActiva === 'trabajadores' ? 'Trabajador' : pestanaActiva === 'usuarios' ? 'Usuario' : 'Taller'}
                </button>
            </div>

            {/* Contenido de Tabla */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                {cargando ? (
                    <div className="p-12 text-center text-gray-500">Cargando datos...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[600px]">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    {pestanaActiva === 'trabajadores' && (
                                        <>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[35%]">Nombre</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[25%]">Cargo</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[20%]">Estado</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[20%]">Acciones</th>
                                        </>
                                    )}
                                    {pestanaActiva === 'usuarios' && (
                                        <>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[35%]">
                                                Correo {sincronizandoAuth && <span className="text-blue-500 animate-pulse font-normal italic">(sincronizando...)</span>}
                                            </th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[25%]">Usuario</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[20%]">Cargo</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[20%]">Acciones</th>
                                        </>
                                    )}
                                    {pestanaActiva === 'talleres' && (
                                        <>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[18%]">Nombre Taller</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[10%]">Ciudad</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[10%]">Barrio</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[15%]">Dirección</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[12%]">Labor</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[10%]">Estado</th>
                                            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-[15%]">Acciones</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                {pestanaActiva === 'trabajadores' && (
                                    trabajadoresPaginados.length > 0 ? (
                                        trabajadoresPaginados.map((t) => (
                                            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                <td className="px-6 py-2 text-gray-900 dark:text-white text-sm text-center">{t.nombre_trabajador}</td>
                                                <td className="px-6 py-2 text-gray-600 dark:text-gray-300 text-sm text-center">{t.cargos?.nombre || 'Sin cargo'}</td>
                                                <td className="px-6 py-2 text-center">
                                                    <button
                                                        onClick={() => cambiarEstadoTrabajador(t.id, !t.esta_activo)}
                                                        className="group relative"
                                                    >
                                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${t.esta_activo
                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 group-hover:bg-green-200 dark:group-hover:bg-green-900/50'
                                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 group-hover:bg-gray-200 dark:group-hover:bg-gray-600'
                                                            }`}>
                                                            {t.esta_activo ? 'Activo' : 'Inactivo'}
                                                        </span>
                                                    </button>
                                                </td>
                                                <td className="px-6 py-2 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => manejarEditarTrabajador(t)}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                            title="Editar Trabajador"
                                                        >
                                                            <PencilSquareIcon className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setItemAEliminar({ id: t.id, tipo: 'trabajador', nombre: t.nombre_trabajador })}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Eliminar Trabajador"
                                                        >
                                                            <TrashIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">
                                                No se encontraron resultados para "{terminoBusqueda}"
                                            </td>
                                        </tr>
                                    )
                                )}

                                {pestanaActiva === 'usuarios' && (
                                    usuariosPaginados.length > 0 ? (
                                        usuariosPaginados.map((u) => (
                                            <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                <td className="px-6 py-2 text-gray-900 dark:text-white text-sm text-center">{u.correo_electronico || 'Sin correo'}</td>
                                                <td className="px-6 py-2 text-gray-600 dark:text-gray-300 text-sm text-center">{u.nombre_usuario || 'Sin usuario'}</td>
                                                <td className="px-6 py-2 text-gray-600 dark:text-gray-300 text-sm text-center">{u.cargos?.nombre || 'N/A'}</td>
                                                <td className="px-6 py-2 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => manejarGestionarUsuario(u)}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                            title="Gestionar Acceso"
                                                        >
                                                            <KeyIcon className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setItemAEliminar({ id: u.id, tipo: 'quitar_acceso', nombre: u.nombre_trabajador, email: u.correo_electronico })}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Quitar Acceso"
                                                        >
                                                            <TrashIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">
                                                {sincronizandoAuth ? 'Sincronizando con Supabase Auth...' : `No se encontraron resultados para "${terminoBusqueda}"`}
                                            </td>
                                        </tr>
                                    )
                                )}

                                {pestanaActiva === 'talleres' && (
                                    talleresPaginados.length > 0 ? (
                                        talleresPaginados.map((t) => (
                                            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                <td className="px-6 py-2 text-gray-900 dark:text-white text-sm text-center">{t.nombre}</td>
                                                <td className="px-6 py-2 text-gray-600 dark:text-gray-300 text-sm text-center">{t.ciudades?.nombre || 'N/A'}</td>
                                                <td className="px-6 py-2 text-gray-600 dark:text-gray-300 text-sm text-center">{t.barrios?.nombre || 'N/A'}</td>
                                                <td className="px-6 py-2 text-gray-600 dark:text-gray-300 text-sm text-center">{t.direccion || 'N/A'}</td>
                                                <td className="px-6 py-2 text-center">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400`}>
                                                        {t.labor || 'No definido'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2 text-center">
                                                    <button
                                                        onClick={() => cambiarEstadoTaller(t.id, !t.esta_activo)}
                                                        className="group relative"
                                                    >
                                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${t.esta_activo
                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 group-hover:bg-green-200 dark:group-hover:bg-green-900/50'
                                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 group-hover:bg-gray-200 dark:group-hover:bg-gray-600'
                                                            }`}>
                                                            {t.esta_activo ? 'Activo' : 'Inactivo'}
                                                        </span>
                                                    </button>
                                                </td>
                                                <td className="px-6 py-2 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => manejarEditarTaller(t)}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                            title="Editar Taller"
                                                        >
                                                            <PencilSquareIcon className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setItemAEliminar({ id: t.id, tipo: 'taller', nombre: t.nombre })}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Eliminar Taller"
                                                        >
                                                            <TrashIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic">
                                                No se encontraron resultados para "{terminoBusqueda}"
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>

                        {/* Paginación */}
                        <div className="mt-6 flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-700/50">
                            <RowsPerPageSelector value={rowsPerPage} onChange={setRowsPerPage} />
                            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                        </div>


                    </div>
                )}
            </div>

            {/* Modales */}
            <NuevoTrabajadorModal
                isOpen={esModalTrabajadorAbierto}
                onClose={() => {
                    setEsModalTrabajadorAbierto(false);
                    setTrabajadorAEditar(null);
                }}
                onTrabajadorCreado={() => obtenerDatos('trabajadores')}
                trabajadorAEditar={trabajadorAEditar}
            />

            <NuevoTallerModal
                isOpen={esModalTallerAbierto}
                onClose={() => {
                    setEsModalTallerAbierto(false);
                    setTallerAEditar(null);
                }}
                onTallerGuardado={() => obtenerDatos('talleres')}
                tallerAEditar={tallerAEditar}
            />

            <GenericConfirmModal
                isOpen={!!itemAEliminar}
                title={itemAEliminar?.tipo === 'quitar_acceso' ? 'Quitar Acceso' : `Eliminar ${itemAEliminar?.tipo === 'trabajador' ? 'Trabajador' : 'Taller'}`}
                message={itemAEliminar?.tipo === 'quitar_acceso'
                    ? `¿Estás seguro de que deseas quitar el acceso a "${itemAEliminar?.nombre}"? El usuario ya no podrá ingresar a la plataforma.`
                    : `¿Estás seguro de que deseas eliminar a "${itemAEliminar?.nombre}"? Esta acción no se puede deshacer.`}
                onConfirm={confirmarEliminacion}
                onClose={() => setItemAEliminar(null)}
            />

            <GestionarUsuarioModal
                isOpen={esModalGestionUsuarioAbierto}
                onClose={() => {
                    setEsModalGestionUsuarioAbierto(false);
                    setUsuarioAGestionar(null);
                }}
                usuarioExistente={usuarioAGestionar}
                onCambio={() => {
                    obtenerDatos('usuarios');
                    obtenerUsuariosAuth();
                }}
                trabajadores={trabajadores}
                emailsAuth={emailsAuth}
                onNotificar={mostrarNotificacion}
            />

            {/* Notificación Toast */}
            {notificacion && (
                <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl transition-all animate-in slide-in-from-right-10 fade-in duration-300 border ${notificacion.tipo === 'exito'
                    ? 'bg-white dark:bg-gray-800 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400'
                    : 'bg-white dark:bg-gray-800 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
                    }`}>
                    <div className={`p-2 rounded-full ${notificacion.tipo === 'exito' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        {notificacion.tipo === 'exito'
                            ? <CheckCircleIcon className="w-6 h-6" />
                            : <ExclamationCircleIcon className="w-6 h-6" />
                        }
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {notificacion.tipo === 'exito' ? '¡Éxito!' : 'Error'}
                        </span>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 max-w-xs">
                            {notificacion.mensaje}
                        </span>
                    </div>
                    <button
                        onClick={() => setNotificacion(null)}
                        className="ml-2 -mr-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>

                    {/* Barra de progreso de tiempo (opcional, visual only) */}
                    <div className={`absolute bottom-0 left-4 right-4 h-0.5 rounded-full overflow-hidden opacity-20 ${notificacion.tipo === 'exito' ? 'bg-green-500' : 'bg-red-500'}`}>
                        <div className="h-full w-full animate-[shrink_5s_linear_forwards] origin-left bg-current" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdministracionPage;
