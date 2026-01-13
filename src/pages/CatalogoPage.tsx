import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import Pagination from '../components/Pagination';
import RowsPerPageSelector from '../components/RowsPerPageSelector';
import NewReferenceModal from "../components/NewReferenceModal";
import EditReferenceModal from "../components/EditReferenceModal";
import GenericConfirmModal from "../components/GenericConfirmModal";
import { LayoutGrid, List, Pencil, Trash2 } from 'lucide-react';

// Definimos un tipo para la estructura de una Referencia
interface Referencia {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_unitario: number | null;
  tipo: string | null;
  imagen_url: string | null;
}

const CatalogoPage = () => {
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isNewReferenceModalOpen, setIsNewReferenceModalOpen] = useState(false);
  const [isEditReferenceModalOpen, setIsEditReferenceModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<Referencia | null>(null);
  const [referenceToDelete, setReferenceToDelete] = useState<Referencia | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const fetchReferencias = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('referencias')
      .select('id, nombre, descripcion, precio_unitario, tipo, imagen_url')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error cargando referencias:', error);
      setError(error.message);
    } else {
      setReferencias(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReferencias();
  }, []);

  const handleReferenceCreated = () => {
    fetchReferencias();
    setIsNewReferenceModalOpen(false);
  }

  const handleReferenceUpdated = () => {
    fetchReferencias();
    setIsEditReferenceModalOpen(false);
  }

  const handleEditClick = (referencia: Referencia) => {
    setSelectedReference(referencia);
    setIsEditReferenceModalOpen(true);
  };

  const handleDeleteClick = (referencia: Referencia) => {
    setReferenceToDelete(referencia);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!referenceToDelete) return;

    try {
      // First, delete the image from storage if it exists
      if (referenceToDelete.imagen_url) {
        // Extract path from URL. Example: https://<project>.supabase.co/storage/v1/object/public/imagenes/some-image.png -> some-image.png
        const urlParts = referenceToDelete.imagen_url.split('/imagenes/');
        const imagePath = urlParts[urlParts.length - 1];

        if (imagePath) {
          const { error: storageError } = await supabase.storage.from('imagenes').remove([imagePath]);
          if (storageError && storageError.message !== 'The resource was not found') {
            // We can ignore "not found" errors, as the image might have been deleted manually.
            console.error("Error deleting image from storage:", storageError);
            alert(`Error al eliminar la imagen del almacenamiento: ${storageError.message}`);
            return; // Stop if a real error occurred
          }
        }
      }

      // Then, delete the reference from the database
      const { error: dbError } = await supabase.from('referencias').delete().eq('id', referenceToDelete.id);

      if (dbError) {
        console.error("Error deleting reference from database:", dbError);
        alert(`Error al eliminar la referencia: ${dbError.message}`);
      } else {
        // Success: refetch data to update the UI
        fetchReferencias();
      }
    } catch (error) {
      console.error("An unexpected error occurred during deletion:", error);
      alert("Ocurrió un error inesperado al eliminar la referencia.");
    } finally {
      // Always close modal and reset state
      setIsDeleteModalOpen(false);
      setReferenceToDelete(null);
    }
  };

  const filteredReferencias = useMemo(() => {
    return referencias.filter(ref =>
      ref.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [referencias, searchTerm]);

  const totalPages = Math.ceil(filteredReferencias.length / rowsPerPage);
  const paginatedReferencias = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredReferencias.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredReferencias, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rowsPerPage, searchTerm]);

  if (loading) return <div className="p-6">Cargando catálogo...</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Catálogo de Referencias</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Gestiona y visualiza todas las prendas y productos.</p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 w-full sm:w-64">
              <input
                type="text"
                placeholder="Buscar referencia..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-900/50 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Vista de Mosaico"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Vista de Lista"
              >
                <List className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setIsNewReferenceModalOpen(true)}
              className="px-6 py-2.5 w-full sm:w-auto rounded-xl text-sm font-bold text-white transition-all bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95 shadow-lg shadow-blue-200 dark:shadow-none"
            >
              + Nueva Referencia
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {paginatedReferencias.map((ref) => (
              <div key={ref.id} className="group relative bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 shadow-sm border dark:border-gray-700 flex flex-col justify-between">
                <div className="flex-grow">
                  <img
                    src={ref.imagen_url || 'https://placehold.co/400x400/EFEFEF/AAAAAA&text=Sin+Imagen'}
                    alt={ref.nombre}
                    className="w-full h-48 object-cover rounded-lg mb-4"
                  />
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2 line-clamp-2 text-center">{ref.nombre}</h4>
                </div>
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEditClick(ref)} className="p-2 bg-gray-800 bg-opacity-50 rounded-full text-white">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteClick(ref)} className="p-2 bg-red-600 bg-opacity-80 rounded-full text-white">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedReferencias.map((ref) => (
              <div key={ref.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 shadow-sm border dark:border-gray-700 flex items-center gap-6">
                <img
                  src={ref.imagen_url || 'https://placehold.co/100x100/EFEFEF/AAAAAA&text=Sin+Imagen'}
                  alt={ref.nombre}
                  className="w-24 h-24 object-cover rounded-lg"
                />
                <div className="flex-grow">
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">{ref.nombre}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEditClick(ref)} className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600">
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDeleteClick(ref)} className="p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredReferencias.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No se encontraron referencias que coincidan con la búsqueda.
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <RowsPerPageSelector value={rowsPerPage} onChange={setRowsPerPage} />
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      </div>

      <NewReferenceModal
        isOpen={isNewReferenceModalOpen}
        onClose={() => setIsNewReferenceModalOpen(false)}
        onReferenceCreated={handleReferenceCreated}
      />

      <EditReferenceModal
        isOpen={isEditReferenceModalOpen}
        onClose={() => setIsEditReferenceModalOpen(false)}
        onReferenceUpdated={handleReferenceUpdated}
        referencia={selectedReference}
      />

      <GenericConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Eliminar Referencia"
        message={`¿Estás seguro de que quieres eliminar la referencia "${referenceToDelete?.nombre}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
};

export default CatalogoPage;