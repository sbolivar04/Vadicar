# Documentación de la Base de Datos - Sistema de Gestión de Confección

Este documento explica el propósito y la finalidad de cada una de las tablas en la base de datos del proyecto.

## Tabla: `workers` (Trabajadores)

- **Finalidad:** Almacenar un registro de todos los empleados y colaboradores del taller. Es fundamental para saber quién está disponible y para asignar responsabilidades en los pedidos.
- **Uso:** Se utiliza para identificar a los supervisores, modistas, cortadores, etc. y para vincularlos a las etapas de producción en las que participan.

## Tabla: `stages` (Etapas)

- **Finalidad:** Definir cada uno de los pasos secuenciales que componen el flujo de producción de una prenda.
- **Uso:** Permite estandarizar el proceso de confección (Ingreso, Corte, Confección, Revisión, etc.) y medir los tiempos y la eficiencia de cada fase. El `order_index` es clave para saber qué etapa va después de otra.

## Tabla: `orders` (Pedidos)

- **Finalidad:** Es la tabla principal que representa cada trabajo solicitado por un cliente. Centraliza la información más importante de un pedido.
- **Uso:** Se usa para rastrear el estado general de un pedido (`en-proceso`, `retrasado`), su prioridad, la cantidad de prendas y a qué cliente pertenece.

## Tabla: `order_stage_history` (Historial de Etapas del Pedido)

- **Finalidad:** Guardar un registro detallado y cronológico del viaje de un pedido a través de las diferentes etapas de producción.
- **Uso:** Es la tabla de auditoría más importante. Permite saber exactamente cuándo un pedido entró y salió de una etapa, qué trabajador fue el responsable y cuánto tiempo se tardó. Es vital para calcular la eficiencia y encontrar cuellos de botella.

## Tabla: `quality_checks` (Controles de Calidad)

- **Finalidad:** Almacenar los resultados de las inspecciones de calidad que se realizan en puntos clave del proceso.
- **Uso:** Registra si un lote de prendas pasó la inspección, cuántos defectos se encontraron y quién realizó la revisión. Esto es crucial para mantener un estándar de calidad alto.

## Tabla: `time_logs` (Registros de Tiempo)

- **Finalidad:** Registrar de forma granular el tiempo que un trabajador específico dedica a una tarea dentro de una etapa de un pedido.
- **Uso:** Mientras que `order_stage_history` da una visión general del tiempo por etapa, esta tabla permite un análisis más profundo, incluyendo pausas. Ayuda a calcular la productividad real de los trabajadores.

## Tabla: `defect_types` (Tipos de Defecto)

- **Finalidad:** Crear un catálogo estandarizado de los posibles errores o defectos que pueden ocurrir durante la confección.
- **Uso:** En lugar de escribir "la costura está torcida" cada vez, se selecciona el tipo de defecto "Costura irregular". Esto permite generar estadísticas precisas sobre los problemas más comunes y trabajar en prevenirlos.

## Tabla: `order_defects` (Defectos del Pedido)

- **Finalidad:** Vincular un pedido específico con los defectos concretos que se encontraron durante un control de calidad.
- **Uso:** Si en un `quality_check` se encuentran 3 defectos, esta tabla tendrá 3 filas, cada una detallando qué tipo de defecto fue, en qué cantidad y si ya fue corregido.
## Estándar de Diseño: Listas Desplegables Premium (Dropdowns)

Para mantener la coherencia visual en toda la aplicación, las listas desplegables (especialmente en formularios y filtros) deben seguir este estándar basado en el componente `FilterDropdown.tsx`.

### 1. Estructura y Espaciado (Layout)
- **Contenedor Principal (Trigger):**
  - **Fondo:** `white` (Luz) / `gray-700/50` (Oscuro).
  - **Padding:** `px-3 py-2` (Espaciado interno equilibrado).
  - **Bordes:** `rounded-lg` (8px) con color `gray-300` (Luz) / `gray-600` (Oscuro).
  - **Sombra:** Sutil para dar profundidad en estados activos.

- **Menú Desplegable (Opciones):**
  - **Espaciado entre items:** `py-1.5` (Compacto pero legible).
  - **Padding lateral:** `px-4`.
  - **Borde del menú:** `border border-gray-200` (Luz) / `border-gray-700` (Oscuro).

### 2. Tipografía y Colores
- **Fuente General:** `text-sm` (14px).
- **Placeholder (Sin selección):** 
  - Color: `text-gray-500` (Luz) / `text-gray-400` (Oscuro).
  - Estilo: Regular o Italic opcional.
- **Valor Seleccionado:**
  - Color: `text-gray-800` (Luz) / `text-gray-200` (Oscuro).
  - Estilo: `font-medium`.
- **Estados Hover (Al pasar el mouse):**
  - Opción estándar: `bg-gray-100` (Luz) / `bg-gray-700` (Oscuro).
  - Texto: Cambia sutilmente para indicar interactividad.

### 3. Opción Especial: "+ Agregar Nuevo..."
Esta opción debe resaltar para guiar al usuario a crear nuevos maestros (clientes, cargos, etc.):
- **Separación:** Línea superior (`border-t`) para diferenciarla de las opciones existentes.
- **Letra:** `font-bold`.
- **Color:** `text-blue-600` (Luz) / `text-blue-400` (Oscuro).
- **Hover Especial:** Fondo `bg-blue-50` (Luz) / `bg-blue-900/20` (Oscuro) para un resalte visual claro.

### 4. Animaciones y Comportamiento
- **Rotación de Icono:** El chevron (flecha) debe rotar 180° cuando el menú está abierto (`transform rotate-180`).
- **Transiciones:** Usar `transition-colors duration-150` y `animate-fade-in-fast` para una apertura suave.
- **Enfoque (Focus):** Al estar activo, mostrar un anillo de brillo: `focus:ring-2 focus:ring-blue-500`.

---
*Nota: Siempre que sea posible, utilizar el componente `<FilterDropdown />` en lugar de un `<select>` estándar de HTML para garantizar que el diseño sea coherente con la calidad premium del software.*

## Estándar de Diseño: Paginación y Control de Filas

Para garantizar una navegación fluida en tablas con grandes volúmenes de datos, se debe implementar el sistema de paginación basado en los componentes `Pagination.tsx` y `RowsPerPageSelector.tsx`.

### 1. Estructura y Ubicación (Layout)
- **Posición:** Siempre al final de la tabla, dentro de un contenedor con padding (`p-4` o `mt-6`) y un borde superior sutil (`border-t border-gray-100`).
- **Distribución:** 
  - **Izquierda:** Selector de filas por página (`RowsPerPageSelector`).
  - **Derecha:** Controles de navegación de páginas (`Pagination`).
- **Selector de Filas:** Texto descriptivo "Filas por página:" seguido de un mini-dropdown con opciones estándar (10, 20, 50, 100).

### 2. Tipografía y Estilos Visuales
- **Botones de Página:**
  - **Estado Normal:** Cuadrados con bordes redondeados (`rounded-lg`), fondo transparente o blanco, texto `text-gray-600`.
  - **Estado Activo:** Fondo azul sólido (`bg-blue-500`), texto blanco (`text-white`), fuente `font-bold`.
  - **Estado Hover:** Fondo gris suave (`bg-gray-100` / `dark:bg-gray-700`).
- **Botones "Anterior" y "Siguiente":** Incluyen íconos (Chevrons) y texto, con estados deshabilitados (`opacity-50`, `cursor-not-allowed`) cuando no hay más páginas.
- **Fuente:** `text-sm` (14px) para mantener la legibilidad sin ocupar espacio excesivo.

### 3. Comportamiento y lógica (UX)
- **Reinicio de Página:** La página actual debe volver a **1** automáticamente cuando:
  - Se cambia la categoría o pestaña de la tabla.
  - Se realiza una nueva búsqueda en el filtro.
  - Se cambia el número de filas por página.
- **Cálculo de Datos:** El paginado se realiza sobre el conjunto de datos **ya filtrados**.
- **Consistencia:** El diseño debe ser idéntico en todas las hojas del software (Pedidos, Administración, Inventario, etc.) para reducir la carga cognitiva del usuario.

### 4. Componentes Clave
- `<RowsPerPageSelector />`: Maneja el estado local de cuántos registros mostrar.
- `<Pagination />`: Calcula el rango de botones visibles (ej. 1, 2, 3...) y maneja el cambio de página.

