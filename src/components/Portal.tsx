import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
      portalRoot = document.createElement('div');
      portalRoot.setAttribute('id', 'modal-root');
      document.body.appendChild(portalRoot);
    }
    setContainer(portalRoot);
  }, []);

  return container ? createPortal(children, container) : null;
};

export default Portal;
