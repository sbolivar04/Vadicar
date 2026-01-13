import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import ImageUploader from './ImageUploader';
import Portal from './Portal';
import FilterDropdown, { GenericFilterItem } from './FilterDropdown';

interface NewReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReferenceCreated: () => void;
}

const NewReferenceModal: React.FC<NewReferenceModalProps> = ({ isOpen, onClose, onReferenceCreated }) => {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precioDisplay, setPrecioDisplay] = useState('');
  const [tipo, setTipo] = useState('');
  const [tipos, setTipos] = useState<GenericFilterItem[]>([]);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [creandoNuevoTipo, setCreandoNuevoTipo] = useState({ activo: false, valor: '' });
  const [editandoTipo, setEditandoTipo] = useState<{ id: string, valorInitial: string, valorActual: string } | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingType, setIsAddingType] = useState(false);

  const fetchTipos = async () => {
    try {
      const { data, error } = await supabase.rpc('obtener_valores_enum', { enum_type_name: 'tipo_referencia' });
      if (error) throw error;

      const formattedTipos = (data || []).map((t: string) => ({
        id: t,
        nombre: t.charAt(0).toUpperCase() + t.slice(1)
      })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

      setTipos([
        ...formattedTipos,
        { id: 'nuevo', nombre: '+ Agregar nuevo tipo...' }
      ]);
    } catch (error) {
      console.error('Error fetching enum types:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTipos();
    }
  }, [isOpen]);

  const handleAddNewType = async () => {
    const valorLimpio = creandoNuevoTipo.valor.trim().toLowerCase();
    if (!valorLimpio) {
      setCreandoNuevoTipo({ activo: false, valor: '' });
      return;
    }

    setIsAddingType(true);
    try {
      // 1. Guardar en base de datos
      const { error: rpcError } = await supabase.rpc('agregar_valor_a_enum_referencia', { nuevo_valor: valorLimpio });
      if (rpcError) throw rpcError;

      // 2. Recargar lista para que aparezca oficialmente
      await fetchTipos();

      // 3. Seleccionarlo automáticamente
      setTipo(valorLimpio);
      setCreandoNuevoTipo({ activo: false, valor: '' });
      if (errors.tipo) setErrors(prev => ({ ...prev, tipo: '' }));
    } catch (err: any) {
      console.error("Error al añadir tipo:", err);
      // Si ya existe, simplemente lo seleccionamos y recargamos
      await fetchTipos();
      setTipo(valorLimpio);
      setCreandoNuevoTipo({ activo: false, valor: '' });
    } finally {
      setIsAddingType(false);
    }
  };

  const formatMiles = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    if (!numericValue) return '';
    return new Intl.NumberFormat('es-CO').format(parseInt(numericValue));
  };

  const handlePrecioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatMiles(e.target.value);
    setPrecioDisplay(formatted);
  };

  const resetForm = () => {
    setNombre('');
    setDescripcion('');
    setPrecioDisplay('');
    setTipo('');
    setNewImageFile(null);
    setCreandoNuevoTipo({ activo: false, valor: '' });
    setEditandoTipo(null);
    setErrors({});
    setIsSaving(false);
  }

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!nombre.trim()) newErrors.nombre = 'El nombre de la referencia es obligatorio.';
    if (!tipo) newErrors.tipo = 'Debe seleccionar o añadir un tipo.';
    if (!newImageFile) newErrors.imageUrl = 'Debe seleccionar una imagen para la referencia.';
    return newErrors;
  }

  const handleEditTipo = async () => {
    if (!editandoTipo || !editandoTipo.valorActual.trim()) return;
    try {
      await supabase.rpc('renombrar_valor_enum_referencia', {
        valor_viejo: editandoTipo.id,
        valor_nuevo: editandoTipo.valorActual.toLowerCase()
      });
      await fetchTipos();
      if (tipo === editandoTipo.id) setTipo(editandoTipo.valorActual.toLowerCase());
      setEditandoTipo(null);
    } catch (err) {
      console.error("Error editando tipo:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      let currentImageUrl = '';

      if (newImageFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No se pudo identificar al usuario. Por favor, inicie sesión de nuevo.');

        const fileExt = newImageFile.name.split('.').pop();
        const fileName = `${Date.now()}_${nombre.replace(/\s+/g, '_')}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('imagenes')
          .upload(filePath, newImageFile);

        if (uploadError) throw new Error(`Error al subir la imagen: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(filePath);
        currentImageUrl = urlData.publicUrl;
      }

      const capitalizeWords = (str: string) => {
        if (!str) return '';
        return str
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };

      const formattedNombre = capitalizeWords(nombre);
      const finalPrecio = precioDisplay.replace(/\./g, '');

      const { error: insertError } = await supabase
        .from('referencias')
        .insert([{
          nombre: formattedNombre,
          descripcion,
          tipo: tipo.toLowerCase(),
          precio_unitario: finalPrecio ? Number(finalPrecio) : 0,
          imagen_url: currentImageUrl
        }]);

      if (insertError) throw insertError;

      onReferenceCreated();
      onClose();
    } catch (err: any) {
      console.error('Error creating reference:', err);
      setErrors({ form: err.message || 'Error inesperado al guardar.' });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center p-5 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Nueva Referencia</h3>
              <p className="text-xs text-gray-400 mt-1">Complete los campos marcados con <span className="text-red-500 font-bold">*</span></p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all opacity-70">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
            {errors.form && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2">
                {errors.form}
              </div>
            )}

            <div className="space-y-6">
              {/* Imagen */}
              <div className="flex flex-col items-center">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 w-full text-center">
                  Imagen de Referencia <span className="text-red-500">*</span>
                </label>
                <div className={`p-1 rounded-2xl border-2 border-dashed transition-all ${errors.imageUrl ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20 shadow-lg shadow-red-100 dark:shadow-none' : 'border-gray-200 dark:border-gray-700'}`}>
                  <ImageUploader
                    onFileSelect={(file) => {
                      setNewImageFile(file);
                      if (errors.imageUrl) setErrors(prev => ({ ...prev, imageUrl: '' }));
                    }}
                    currentImageUrl={null}
                  />
                </div>
                {errors.imageUrl && <p className="text-[10px] text-red-500 mt-2 font-bold uppercase tracking-wider">{errors.imageUrl}</p>}
              </div>

              {/* Nombre */}
              <div>
                <label htmlFor="nombre" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Nombre de la Referencia <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="nombre"
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    if (errors.nombre) setErrors(prev => ({ ...prev, nombre: '' }));
                  }}
                  placeholder="Ej: Vestido Gala Rojo"
                  className={`w-full px-4 py-2.5 bg-white dark:bg-gray-700/50 border rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-all ${errors.nombre ? 'border-red-400 focus:ring-red-400 shadow-sm shadow-red-100 bg-red-50/20' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'}`}
                />
                {errors.nombre && <p className="text-[10px] text-red-500 mt-1.5 font-bold uppercase tracking-wider">{errors.nombre}</p>}
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Tipo <span className="text-red-500">*</span>
                </label>
                {creandoNuevoTipo.activo ? (
                  <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <input
                      type="text"
                      autoFocus
                      value={creandoNuevoTipo.valor}
                      onChange={(e) => setCreandoNuevoTipo({ ...creandoNuevoTipo, valor: e.target.value })}
                      onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewType(); } }}
                      className="flex-grow px-4 py-2 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-400 dark:border-blue-700 rounded-xl text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="Ej: Chaqueta..."
                      disabled={isAddingType}
                    />
                    <button
                      type="button"
                      disabled={isAddingType}
                      onClick={handleAddNewType}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-md shadow-blue-200 dark:shadow-none disabled:opacity-50"
                    >
                      {isAddingType ? '...' : 'Añadir'}
                    </button>
                    <button
                      type="button"
                      disabled={isAddingType}
                      onClick={() => setCreandoNuevoTipo({ activo: false, valor: '' })}
                      className="px-3.5 py-2 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                    >
                      X
                    </button>
                  </div>
                ) : editandoTipo ? (
                  <div className="flex gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                    <input
                      type="text"
                      autoFocus
                      value={editandoTipo.valorActual}
                      onChange={(e) => setEditandoTipo({ ...editandoTipo, valorActual: e.target.value })}
                      onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEditTipo(); } }}
                      className="flex-grow px-4 py-2 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-400 rounded-xl text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleEditTipo}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-all"
                    >
                      Ok
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoTipo(null)}
                      className="px-3.5 py-2 bg-gray-200 dark:bg-gray-700 rounded-xl text-sm font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-300"
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <FilterDropdown
                    placeholder="Seleccione un categoría..."
                    options={tipos}
                    selectedValue={tipo}
                    valueKey="id"
                    onSelect={(val) => {
                      if (val === 'nuevo') {
                        setCreandoNuevoTipo({ activo: true, valor: '' });
                      } else {
                        setTipo(val);
                        if (errors.tipo) setErrors(prev => ({ ...prev, tipo: '' }));
                      }
                    }}
                    onEdit={(item) => setEditandoTipo({ id: item.id, valorInitial: item.nombre, valorActual: item.nombre })}
                    hasError={!!errors.tipo}
                  />
                )}
                {errors.tipo && <p className="text-[10px] text-red-500 mt-1.5 font-bold uppercase tracking-wider">{errors.tipo}</p>}
              </div>

              {/* Precio */}
              <div>
                <label htmlFor="precio" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Precio Unitario</label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-gray-500 dark:text-gray-400 font-bold sm:text-sm">$</span>
                  </div>
                  <input
                    type="text"
                    id="precio"
                    value={precioDisplay}
                    onChange={handlePrecioChange}
                    placeholder="0"
                    className="block w-full pl-8 pr-12 py-2.5 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-gray-50 transition-all font-medium"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <span className="text-gray-400 dark:text-gray-500 text-[10px] font-bold tracking-tight">COP</span>
                  </div>
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label htmlFor="descripcion" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Descripción</label>
                <textarea
                  id="descripcion"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                  placeholder="Detalle los acabados..."
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none shadow-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t dark:border-gray-700 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`flex-1 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 rounded-xl transition-all shadow-xl shadow-blue-200 dark:shadow-none active:scale-95 ${isSaving ? 'opacity-50 cursor-not-allowed invisible' : ''}`}
              >
                {isSaving ? 'Guardando...' : 'Crear Referencia'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
};

export default NewReferenceModal;
