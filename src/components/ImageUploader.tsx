import React, { useState, useRef, useEffect } from 'react';
import { CameraIcon } from '@heroicons/react/24/solid';

interface ImageUploaderProps {
  onFileSelect: (file: File | null) => void;
  currentImageUrl: string | null;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onFileSelect, currentImageUrl }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Si la URL actual cambia desde el padre (ej. al abrir el modal), reseteamos la preview
    setPreviewUrl(null);
  }, [currentImageUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      onFileSelect(file);
    } else {
      // Si el usuario cancela la selección, no hacemos nada o reseteamos
      onFileSelect(null);
      setPreviewUrl(null);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const finalImageUrl = previewUrl || currentImageUrl;

  return (
    <div className="flex flex-col items-center justify-center space-y-3">
      <div className="relative w-40 h-40 rounded-lg overflow-hidden flex items-center justify-center">
        {finalImageUrl ? (
          <>
            <img src={finalImageUrl} alt="Vista previa" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={triggerFileInput}
                className="text-white text-sm bg-gray-800 bg-opacity-70 rounded-full px-3 py-1"
              >
                Cambiar
              </button>
            </div>
          </>
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 cursor-pointer"
            onClick={triggerFileInput}
          >
            <CameraIcon className="w-12 h-12" />
            <span className="mt-2 text-sm text-center">Añadir imagen</span>
          </div>
        )}
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
};

export default ImageUploader;

