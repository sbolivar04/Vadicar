import React, { useState, useRef, useLayoutEffect } from 'react';
import Portal from './Portal';

interface SmartTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}

const SmartTooltip: React.FC<SmartTooltipProps> = ({ children, content, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  useLayoutEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const margin = 12;

      let top = triggerRect.top - tooltipRect.height - margin;
      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

      // Adjust if tooltip goes off-screen
      if (top < margin) {
        top = triggerRect.bottom + margin;
      }
      if (left < margin) {
        left = margin;
      }
      if (left + tooltipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tooltipRect.width - margin;
      }

      setPosition({ top, left });
    }
  }, [isVisible]);

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={triggerRef}
    >
      {children}
      
      <Portal>
        <div
          ref={tooltipRef}
          style={{ 
            top: `${position.top}px`, 
            left: `${position.left}px`,
            // Start with opacity 0 to prevent flicker on first render before position is calculated
            opacity: isVisible && position.top !== 0 ? 1 : 0,
          }}
          className={`fixed text-xs rounded-lg p-3 shadow-lg transition-opacity duration-200 z-50 w-full max-w-[288px] sm:w-56
            flex flex-col justify-center
            bg-white text-gray-800 border border-gray-200 
            dark:bg-gray-900 dark:text-white dark:border-gray-700
            ${className} ${
            !isVisible || position.top === 0 ? 'pointer-events-none' : ''
          }`}
        >
          {content}
        </div>
      </Portal>
    </div>
  );
};

export default SmartTooltip;