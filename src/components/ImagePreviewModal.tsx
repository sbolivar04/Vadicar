import React from 'react';
import Portal from './Portal';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ isOpen, onClose, imageUrl }) => {
  if (!isOpen || !imageUrl) return null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="relative" onClick={e => e.stopPropagation()}>
          <img src={imageUrl} alt="Vista previa de la imagen" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          <button onClick={onClose} className="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition-colors">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </Portal>
  );
};

export default ImagePreviewModal;
