import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import ImageUploader from "./ImageUploader";

// Definimos un tipo para la estructura de una Referencia
interface Referencia {
  id: string;
  nombre: string;
  imagen_url: string | null;
}

const GestionReferencias = () => {
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Efecto para cargar las referencias cuando el componente se monta
  useEffect(() => {
    const fetchReferencias = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('referencias')
        .select('id, nombre, imagen_url');

      if (error) {
        console.error('Error cargando referencias:', error);
        setError(error.message);
      } else {
        setReferencias(data || []);
      }
      setLoading(false);
    };

    fetchReferencias();
  }, []);

  // Función que se llamará cuando una imagen se suba con éxito
  const handleImageUpdate = async (referenciaId: string, newImageUrl: string) => {
    const { error } = await supabase
      .from('referencias')
      .update({ imagen_url: newImageUrl })
      .eq('id', referenciaId);

    if (error) {
      alert(`Error actualizando la imagen: ${error.message}`);
    } else {
      alert('¡Referencia actualizada con la nueva imagen!');
      // Actualizamos el estado local para que la UI refleje el cambio al instante
      setReferencias(prev => 
        prev.map(ref => 
          ref.id === referenciaId ? { ...ref, imagen_url: newImageUrl } : ref
        )
      );
    }
  };

  if (loading) return <p>Cargando referencias...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Gestionar Imágenes de Referencias</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {referencias.map((ref) => (
          <div key={ref.id} style={{ border: '1px solid #eee', padding: '15px', borderRadius: '8px' }}>
            <h4>{ref.nombre}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <img 
                src={ref.imagen_url || 'https://placehold.co/100x100/EFEFEF/AAAAAA&text=Sin+Imagen'} 
                alt={ref.nombre} 
                style={{ width: '100px', height: '100px', objectFit: 'cover' }}
              />
              <ImageUploader 
                onUploadFinished={(newUrl) => handleImageUpdate(ref.id, newUrl)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GestionReferencias;
