import React, { useState, useEffect } from 'react';
import Portal from './Portal';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import ImageUploader from './ImageUploader';
import FilterDropdown, { GenericFilterItem } from './FilterDropdown';

interface Referencia {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_unitario: number | null;
  tipo: string | null;
  imagen_url: string | null;
}

interface EditReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReferenceUpdated: () => void;
  referencia: Referencia | null;
}

const EditReferenceModal: React.FC<EditReferenceModalProps> = ({ isOpen, onClose, onReferenceUpdated, referencia }) => {
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    tipo: ''
  });
  const [precioDisplay, setPrecioDisplay] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingType, setIsAddingType] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [tiposOptions, setTiposOptions] = useState<GenericFilterItem[]>([]);
  const [creandoNuevoTipo, setCreandoNuevoTipo] = useState({ activo: false, valor: '' });
  const [editandoTipo, setEditandoTipo] = useState<{ id: string, valorInitial: string, valorActual: string } | null>(null);

  const formatMiles = (value: string | number) => {
    const numericValue = value.toString().replace(/\D/g, '');
    if (!numericValue) return '';
    return new Intl.NumberFormat('es-CO').format(parseInt(numericValue));
  };

  const handlePrecioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatMiles(e.target.value);
    setPrecioDisplay(formatted);
  };

  const fetchTipos = async () => {
    try {
      const { data, error } = await supabase.rpc('obtener_valores_enum', { enum_type_name: 'tipo_referencia' });
      if (error) throw error;

      const formattedTipos = (data || []).map((tipo: string) => ({
        id: tipo,
        nombre: tipo.charAt(0).toUpperCase() + tipo.slice(1)
      })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

      setTiposOptions([
        ...formattedTipos,
        { id: 'nuevo', nombre: '+ Agregar nuevo tipo...' }
      ]);
    } catch (error) {
      console.error("Error fetching reference types:", error);
    }
  };

  useEffect(() => {
    if (isOpen) fetchTipos();
  }, [isOpen]);

  useEffect(() => {
    if (referencia && isOpen) {
      setFormData({
        nombre: referencia.nombre || '',
        descripcion: referencia.descripcion || '',
        tipo: referencia.tipo || ''
      });
      setPrecioDisplay(referencia.precio_unitario ? formatMiles(referencia.precio_unitario) : '');
      setNewImageFile(null);
      setCreandoNuevoTipo({ activo: false, valor: '' });
      setEditandoTipo(null);
      setError(null);
      setFieldErrors({});
    }
  }, [referencia, isOpen]);

  const handleAddNewType = async () => {
    const valorLimpio = creandoNuevoTipo.valor.trim().toLowerCase();
    if (!valorLimpio) {
      setCreandoNuevoTipo({ activo: false, valor: '' });
      return;
    }

    setIsAddingType(true);
    try {
      await supabase.rpc('agregar_valor_a_enum_referencia', { nuevo_valor: valorLimpio });
      await fetchTipos();
      setFormData(prev => ({ ...prev, tipo: valorLimpio }));
      setCreandoNuevoTipo({ activo: false, valor: '' });
      if (fieldErrors.tipo) setFieldErrors(prev => ({ ...prev, tipo: '' }));
    } catch (err: any) {
      console.error("Error al añadir tipo:", err);
      await fetchTipos();
      setFormData(prev => ({ ...prev, tipo: valorLimpio }));
      setCreandoNuevoTipo({ activo: false, valor: '' });
    } finally {
      setIsAddingType(false);
    }
  };

  const validate = () => {
    const errors: { [key: string]: string } = {};
    if (!formData.nombre.trim()) errors.nombre = 'El nombre es obligatorio.';
    if (!formData.tipo) errors.tipo = 'El tipo es obligatorio.';
    return errors;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleTypeSelect = (value: string) => {
    if (value === 'nuevo') {
      setCreandoNuevoTipo({ activo: true, valor: '' });
    } else {
      setFormData(prev => ({ ...prev, tipo: value }));
      setCreandoNuevoTipo({ activo: false, valor: '' });
      if (fieldErrors.tipo) setFieldErrors(prev => ({ ...prev, tipo: '' }));
    }
  };

  const handleEditTipo = async () => {
    if (!editandoTipo || !editandoTipo.valorActual.trim()) return;
    try {
      await supabase.rpc('renombrar_valor_enum_referencia', {
        valor_viejo: editandoTipo.id,
        valor_nuevo: editandoTipo.valorActual.toLowerCase()
      });
      await fetchTipos();
      if (formData.tipo === editandoTipo.id) setFormData(prev => ({ ...prev, tipo: editandoTipo.valorActual.toLowerCase() }));
      setEditandoTipo(null);
    } catch (err) {
      console.error("Error editando tipo:", err);
    }
  };

  const handleSaveChanges = async () => {
    if (!referencia) return;

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let imageUrl = referencia.imagen_url;

      if (newImageFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No se pudo identificar al usuario. Por favor, inicie sesión de nuevo.');

        const fileExt = newImageFile.name.split('.').pop();
        const fileName = `${Date.now()}_${formData.nombre.replace(/\s+/g, '_')}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('imagenes')
          .upload(filePath, newImageFile);

        if (uploadError) throw new Error(`Error al subir la imagen: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }

      const finalPrecio = precioDisplay.replace(/\./g, '');

      const updatedData = {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        precio_unitario: finalPrecio ? parseFloat(finalPrecio) : null,
        tipo: formData.tipo.toLowerCase(),
        imagen_url: imageUrl
      };

      const { error: updateError } = await supabase
        .from('referencias')
        .update(updatedData)
        .eq('id', referencia.id);

      if (updateError) throw updateError;

      onReferenceUpdated();
      onClose();
    } catch (err: any) {
      console.error("Error updating reference:", err);
      setError(`Error al actualizar: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !referencia) return null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center p-5 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Editar Referencia</h3>
              <p className="text-xs text-gray-400 mt-1">Los campos con <span className="text-red-500 font-bold">*</span> son obligatorios</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all opacity-70">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSaveChanges(); }} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4 animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center mb-6">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Imagen de Referencia <span className="text-red-500">*</span></label>
              <div className="p-1 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <ImageUploader
                  onFileSelect={setNewImageFile}
                  currentImageUrl={referencia.imagen_url}
                />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="nombre_edit" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Nombre de la Referencia <span className="text-red-500">*</span></label>
                <input
                  type="text" name="nombre" id="nombre_edit"
                  value={formData.nombre} onChange={handleInputChange}
                  className={`w-full px-4 py-2.5 bg-white dark:bg-gray-700/50 border rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 transition-all ${fieldErrors.nombre ? 'border-red-400 focus:ring-red-400 shadow-sm shadow-red-100' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'}`}
                />
                {fieldErrors.nombre && <p className="text-[10px] text-red-500 mt-1.5 font-bold uppercase tracking-wider">{fieldErrors.nombre}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Tipo <span className="text-red-500">*</span></label>
                {creandoNuevoTipo.activo ? (
                  <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <input
                      type="text"
                      autoFocus
                      value={creandoNuevoTipo.valor}
                      onChange={(e) => setCreandoNuevoTipo({ ...creandoNuevoTipo, valor: e.target.value })}
                      onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewType(); } }}
                      className="flex-grow px-4 py-2 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-400 rounded-xl text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="Ej: Abrigo..."
                      disabled={isAddingType}
                    />
                    <button
                      type="button"
                      disabled={isAddingType}
                      onClick={handleAddNewType}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-200 disabled:opacity-50"
                    >
                      {isAddingType ? '...' : 'Añadir'}
                    </button>
                    <button
                      type="button"
                      disabled={isAddingType}
                      onClick={() => setCreandoNuevoTipo({ activo: false, valor: '' })}
                      className="px-3.5 py-2 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-xl text-sm font-bold disabled:opacity-50"
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
                      className="flex-grow px-4 py-2 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleEditTipo}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-200 hover:bg-blue-700 transition-all"
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
                    options={tiposOptions}
                    selectedValue={formData.tipo}
                    valueKey="id"
                    onSelect={handleTypeSelect}
                    onEdit={(item) => setEditandoTipo({ id: item.id, valorInitial: item.nombre, valorActual: item.nombre })}
                    hasError={!!fieldErrors.tipo}
                  />
                )}
                {fieldErrors.tipo && <p className="text-[10px] text-red-500 mt-1.5 font-bold uppercase tracking-wider">{fieldErrors.tipo}</p>}
              </div>

              <div>
                <label htmlFor="precio_edit" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Precio Unitario</label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-gray-500 dark:text-gray-400 font-bold sm:text-sm">$</span>
                  </div>
                  <input
                    type="text"
                    id="precio_edit"
                    value={precioDisplay}
                    onChange={handlePrecioChange}
                    placeholder="0"
                    className="block w-full pl-8 pr-12 py-2.5 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <span className="text-gray-400 dark:text-gray-500 text-[10px] font-bold tracking-tight">COP</span>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="descripcion_edit" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Descripción</label>
                <textarea
                  name="descripcion" id="descripcion_edit"
                  value={formData.descripcion} onChange={handleInputChange}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none shadow-sm"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50/50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex gap-3 -mx-6 -mb-6 mt-6">
              <button
                type="button" onClick={onClose}
                className="flex-1 px-4 py-3 text-sm font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
              >
                Cerrar
              </button>
              <button
                type="submit" disabled={isSaving}
                className={`flex-1 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 rounded-xl transition-all shadow-xl shadow-blue-200 dark:shadow-none active:scale-95 ${isSaving ? 'opacity-50 cursor-not-allowed invisible' : ''}`}
              >
                {isSaving ? 'Guardando...' : 'Aplicar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
};

export default EditReferenceModal;