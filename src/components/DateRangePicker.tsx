import React, { useState, useRef, useEffect, useMemo } from 'react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale'; // Import Spanish locale
import { DayPicker, SelectRangeEventHandler, DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css'; // Default styles for react-day-picker


interface DateRangePickerProps {
  initialStartDate: string | null;
  initialEndDate: string | null;
  onRangeChange: (startDate: string | null, endDate: string | null) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ initialStartDate, initialEndDate, onRangeChange }) => {
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const compactControlRef = useRef<HTMLDivElement>(null);

  // Estado para controlar el mes visible en el calendario
  const [displayDate, setDisplayDate] = useState<Date>(new Date()); // Inicializar con la fecha actual

  const modifiers = {
    selected: range?.from && range?.to ? { from: range.from, to: range.to } : undefined,
    today: new Date(),
  };

  const modifiersStyles = {
    selected: {
      backgroundColor: '#3B82F6', // blue-500
      color: 'white',
      borderRadius: '9999px', // full rounded
    },
    today: {
      fontWeight: 'bold',
      color: '#3B82F6', // blue-500
    },
    range_middle: {
      backgroundColor: '#BFDBFE', // blue-200
      color: '#1E40AF', // blue-800
    },
  };

  // Convert initial string dates to Date objects for internal state
  useEffect(() => {
    const from = initialStartDate ? new Date(initialStartDate + 'T00:00:00') : undefined;
    const to = initialEndDate ? new Date(initialEndDate + 'T00:00:00') : undefined;
    if (from) {
      setRange({ from, to });
      setDisplayDate(from); // Inicializar displayDate con la fecha de inicio si existe
    } else {
      setRange(undefined);
    }
  }, [initialStartDate, initialEndDate]);

  // Handle clicks outside the popover to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
          compactControlRef.current && !compactControlRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // --- Date Formatting ---
  const formatDateDisplay = useMemo(() => {
    if (!range?.from) return 'Seleccionar rango de fecha';

    const currentYear = new Date().getFullYear();

    const formatPart = (date: Date) => {
      if (date.getFullYear() === currentYear) {
        return format(date, 'd \'de\' MMMM', { locale: es });
      }
      return format(date, 'd \'de\' MMMM, yyyy', { locale: es });
    };

    if (range.from && range.to && !isSameDay(range.from, range.to)) {
      // Range selected
      const fromFormatted = formatPart(range.from);
      const toFormatted = formatPart(range.to);
      return `${fromFormatted} - ${toFormatted}`;
    } else if (range.from) {
      // Single day selected or only 'from' is set
      return formatPart(range.from);
    }
    return 'Seleccionar rango de fecha';
  }, [range]);


  // --- DayPicker Handlers ---
  const handleRangeSelect: SelectRangeEventHandler = (selectedRange) => {
    setRange(selectedRange);
  };

  // --- Presets ---
  const handlePresetClick = (preset: string) => {
    const today = new Date();
    let newFrom: Date | undefined;
    let newTo: Date | undefined;

    switch (preset) {
      case 'Hoy':
        newFrom = today;
        newTo = today;
        break;
      case 'Ayer':
        newFrom = subDays(today, 1);
        newTo = subDays(today, 1);
        break;
      case 'Esta semana':
        newFrom = startOfWeek(today, { locale: es });
        newTo = today; // La semana actual debe ir hasta el día de hoy
        break;
      case 'Semana pasada':
        newFrom = startOfWeek(subDays(today, 7), { locale: es });
        newTo = endOfWeek(subDays(today, 7), { locale: es });
        break;
      case 'Últimos 7 días':
        newFrom = subDays(today, 6);
        newTo = today;
        break;
      case 'Este mes':
        newFrom = startOfMonth(today);
        newTo = today;
        break;
      case 'Mes pasado':
        newFrom = startOfMonth(subMonths(today, 1));
        newTo = endOfMonth(subMonths(today, 1));
        break;
      case 'Últimos 30 días':
        newFrom = subDays(today, 29);
        newTo = today;
        break;
      case 'Últimos 3 meses':
        newFrom = startOfMonth(subMonths(today, 2)); // Start of 3 months ago, to today
        newTo = today;
        break;
      default:
        break;
    }
    if (newFrom && newTo) {
      setRange({ from: newFrom, to: newTo });
      setDisplayDate(newFrom);
    }
  };

  // --- Apply/Cancel Handlers ---
  const handleApply = () => {
    if (range?.from) {
      const startDateString = format(range.from, 'yyyy-MM-dd');
      const endDateString = range.to ? format(range.to, 'yyyy-MM-dd') : startDateString;
      onRangeChange(startDateString, endDateString);
    } else {
      onRangeChange(null, null); // Clear filter if nothing selected
    }
    setIsPopoverOpen(false);
  };

  const handleCancel = () => {
    setIsPopoverOpen(false);
    // Optionally reset range to initial values or last applied values
    const from = initialStartDate ? new Date(initialStartDate) : undefined;
    const to = initialEndDate ? new Date(initialEndDate) : undefined;
    if (from) {
      setRange({ from, to });
    } else {
      setRange(undefined);
    }
  };





  return (
    <div className="relative w-fit mx-auto">
      <div
        ref={compactControlRef}
        className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-chevron-left w-4 h-4 text-gray-500 hover:text-gray-700"

        >
          <path d="m15 18-6-6 6-6"></path>
        </svg>
        <span className="mx-2 whitespace-nowrap text-blue-600 dark:text-blue-400">
          {formatDateDisplay}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-chevron-right w-4 h-4 text-gray-500 hover:text-gray-700"
        >
          <path d="m9 18 6-6-6-6"></path>
        </svg>
      </div>

      {isPopoverOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 mt-2 w-full max-w-3xl bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row gap-4 left-1/2 -translate-x-1/2"
          style={{ minWidth: '600px' }} // Ajusta el ancho mínimo para que quepan los dos calendarios
        >
          {/* Columna de preestablecidos */} 
          <div className="flex-shrink-0 w-full md:w-1/3 pr-4 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 pb-4 md:pb-0">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">PREESTABLECIDOS</h3>
            <ul className="space-y-1">
              {['Hoy', 'Ayer', 'Esta semana', 'Semana pasada', 'Últimos 7 días', 'Este mes', 'Mes pasado', 'Últimos 30 días', 'Últimos 3 meses'].map(
                (preset) => (
                  <li
                    key={preset}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 cursor-pointer text-sm"
                    onClick={() => handlePresetClick(preset)}
                  >
                    {preset}
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Área central de calendarios */} 
          <div className="flex-grow flex flex-col items-center">
            <DayPicker
            mode="range"
            selected={range}
            onSelect={handleRangeSelect}
            locale={es}
            showOutsideDays

            disabled={{ after: new Date() }} // Deshabilitar días después de la fecha actual

            modifiers={modifiers}
            modifiersStyles={modifiersStyles}

            components={{
              CaptionLabel: (props: { displayMonth?: Date; month?: Date; }) => {
              const month = props.displayMonth || props.month || displayDate; // fallback seguro

              // 🧩 Validación: si no hay mes válido, evita el format
              if (!(month instanceof Date) || isNaN(month.getTime())) {
                return <span className="text-gray-500">Mes inválido</span>;
              }

              return (
                <div className="flex items-center justify-center py-2 w-full">
                  <button
                    type="button"
                    onClick={() => setDisplayDate(subMonths(displayDate, 1))}
                    className="p-1 hover:bg-gray-100 rounded-full mr-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="#3B82F6"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-blue-500"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>

                  <h2 className="text-base font-semibold text-gray-800 capitalize text-center whitespace-nowrap">
                    {format(month, 'MMMM yyyy', { locale: es })}
                  </h2>

                  <button
                    type="button"
                    onClick={() => setDisplayDate(addMonths(displayDate, 1))}
                    className="p-1 hover:bg-gray-100 rounded-full ml-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="#3B82F6"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-blue-500"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              );
            },
          }}
            month={displayDate}
            onMonthChange={setDisplayDate}
            fromMonth={subMonths(new Date(), 12)}
            toMonth={addMonths(new Date(), 12)}
            className="rdp-custom-styles"
            classNames={{
              months: 'flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4',
              month: 'space-y-4',
              caption: 'flex justify-center py-2 items-center',
              caption_label: 'text-sm font-medium text-gray-900 dark:text-gray-100 capitalize mx-2',
              nav: 'hidden',
              nav_button: 'hidden',
              nav_button_previous: 'hidden',
              nav_button_next: 'hidden',
              table: 'w-full border-collapse',
              head_row: 'font-medium text-gray-500 dark:text-gray-400',
              head_cell: 'm-0 font-normal text-sm',
              row: 'mt-2',
              cell: 'p-0 relative text-center focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-gray-100 dark:[&:has([aria-selected])]:bg-gray-700',
              day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
              day_range_end: 'day-range-end',
              day_range_start: 'day-range-start',
              day_range_middle: 'day-range-middle',
              day_hidden: 'invisible',
              day_outside: 'text-gray-400 opacity-50',
              day_selected: 'rounded-full bg-blue-600 text-white',
              day_today: 'font-bold text-blue-600',
              day_disabled: 'text-gray-300 opacity-50',
            }}
          />
            {/* Mover los botones aquí */}
            <div className="flex justify-end gap-2 mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 w-full"> {/* Añadir w-full */}
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApply}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;