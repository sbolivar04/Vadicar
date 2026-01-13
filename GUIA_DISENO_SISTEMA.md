# 📒 Guía de Sistema de Diseño - Confecciones

Este documento sirve como referencia oficial para mantener la consistencia visual en todas las interfaces de la aplicación. Cualquier nuevo componente, botón o vista debe seguir estas reglas de tipografía, color y estilo.

---

## 🎨 Paleta de Colores

### Colores Principales (Acción)
- **Principal (Azul):** `blue-500` (#3b82f6) / `blue-600` (#2563eb)
  - Uso: Botones primarios, iconos de acción, pasos positivos.
- **Éxito (Verde):** `green-500` / `green-100` (bg)
  - Uso: Estados "Completado", iconos de visualización.
- **Peligro (Rojo):** `red-500` / `red-100` (bg)
  - Uso: Prioridad Alta, estados de error o retraso.
- **Advertencia (Amarillo):** `yellow-500` / `yellow-100` (bg)
  - Uso: Prioridad Media.

### Colores Neutros (Estructura)
- **Fondos:** `white` / `gray-50` (soft backgrounds) / `gray-800` (Dark Mode).
- **Bordes:** `gray-200` / `gray-300` / `gray-700` (Dark Mode).
- **Texto:** `gray-800` (Principal) / `gray-500` (Secundario/Muted) / `white` (Sobre fondos oscuros).

---

## ✍️ Tipografía

| Nivel | Clase Tailwind | Estilo | Uso |
| :--- | :--- | :--- | :--- |
| **Título Principal** | `text-xl font-bold` | Negrita (Bold) | Títulos de página o modales. |
| **Subtítulo** | `text-lg font-semibold` | Seminegrita | Títulos de secciones internas. |
| **Texto de Tabla/Lista** | `text-sm font-medium` | Medio | Nombres, valores en celdas, labels de filtros. |
| **Badges/Etiquetas** | `text-xs font-medium` | Medio | Estados, prioridades, tallas. |
| **Texto Muted** | `text-xs text-gray-500` | Regular | Notas secundarias, descripciones breves. |

---

## 🔘 Botones

### 1. Botón Primario (Redondeado)
- **Clases:** `px-4 py-2 rounded-full text-sm font-medium text-white transition-all hover:scale-105 bg-blue-500 hover:bg-blue-600`
- **Características:** Siempre azul, esquinas totalmente redondeadas (`rounded-full`), efecto de escala suave al pasar el mouse.

### 2. Botón de Icono (Circular)
- **Clases:** `p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors`
- **Uso:** Acciones en tablas (Ver, Editar, Avanzar).

---

## 🏷️ Estados y Badges (Píldoras)

Todos los estados usan el formato "Pill" (`rounded-full`) con texto pequeño.

- **Completado:** `bg-green-100 text-green-800`
- **Retrasado:** `bg-red-100 text-red-800`
- **En Proceso/General:** `bg-blue-100 text-blue-800`
- **Prioridad Alta:** `bg-red-100 text-red-800` (Igual a error pero contexto de prioridad).

---

## 🗂️ Estructura y Contenedores

- **Tarjetas (Cards):** 
  - `bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700`
  - Las esquinas redondeadas deben ser generosas (`rounded-xl` o `rounded-2xl`).
- **Tablas:**
  - Encabezados: `text-gray-500 text-sm font-medium uppercase tracking-wider` (opcional).
  - Filas: `border-b hover:bg-gray-50 transition-colors`.
- **Inputs:**
  - `rounded-lg border-gray-300 focus:ring-2 focus:ring-blue-500 py-2 text-sm`.

---

## 📏 Espaciado
- **Padding General de Páginas:** `p-6`.
- **Gaps en Grids de Filtros:** `gap-4`.
- **Margen entre secciones:** `mt-4` o `mt-6`.

---

## 💡 Documentación de Secciones Contraíbles (Nuevo Estándar)
Si usas secciones que se expanden (como en Detalles de Pedido):
- **Botón de Toggle:** `w-full flex justify-between items-center text-left`.
- **Separador:** Línea horizontal de borde a borde usando `-mx-6` (negativo) para tocar los laterales del contenedor.
- **Icono:** `ChevronDownIcon` con `transition-transform` y rotación de 180 grados al expandir.

---

## 📑 Selector de Pestañas (Tab Switcher)
Para navegar entre sub-vistas (como en Administración):
- **Contenedor:** Fondo gris muy claro (`bg-gray-200/50`) con esquinas `rounded-xl`.
- **Botón Activo:** Fondo blanco con sombra ligera y texto del color principal (`blue-600`).
- **Botón Inactivo:** Texto gris, sin fondo, con efecto hover suave.
- **Interacción:** Las transiciones deben ser instantáneas o con un fundido muy sutil.
