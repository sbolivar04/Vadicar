import { useState, useEffect } from 'react';

interface DynamicDurationProps {
  startDate: string | null | undefined;
}

const formatCustomDuration = (ms: number): string => {
  if (ms < 0) ms = 0; // Tratar duraciones negativas como 0 (la fecha de inicio está en el futuro)

  const totalHours = ms / (1000 * 60 * 60);
  const totalDays = totalHours / 24;

  if (totalDays >= 1) {
    const daysInt = Math.floor(totalDays);
    const remainingHours = Math.round((totalDays - daysInt) * 24);
    return `${daysInt}d ${remainingHours}h`;
  }
  if (totalHours >= 1) {
    return `${Math.round(totalHours)}h`;
  }
  const totalMinutes = Math.round(totalHours * 60);
  if (totalMinutes < 1) return '< 1m';
  return `${totalMinutes}m`;
};

const DynamicDuration = ({ startDate }: DynamicDurationProps) => {
  const [duration, setDuration] = useState<string>('...');

  useEffect(() => {
    if (!startDate) {
      setDuration('N/A');
      return;
    }

    const calculateDuration = () => {
      const now = new Date();
      const start = new Date(startDate);
      const diffMs = now.getTime() - start.getTime();
      setDuration(formatCustomDuration(diffMs));
    };

    calculateDuration();

    const intervalId = setInterval(calculateDuration, 60000); // Actualizar cada minuto

    return () => clearInterval(intervalId);
  }, [startDate]);

  return <>{duration}</>;
};

export default DynamicDuration;
