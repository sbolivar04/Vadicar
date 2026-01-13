
-- Esquema Consolidado y Datos Iniciales (Versión Idempotente)

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Crear tipos ENUM finales
DO $body$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_referencia') THEN
        CREATE TYPE public.tipo_referencia AS ENUM (
            'vestido', 'camisa', 'pantalon', 'blusa', 'falda', 'conjunto', 'otro'
        );
    END IF;
END
$body$;

-- Creación de Tablas (Esquema Final)
--------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trabajadores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_trabajador text NOT NULL,
    nombre_usuario TEXT UNIQUE,
    correo_electronico text UNIQUE,
    rol text NOT NULL DEFAULT 'modista',
    especializacion text,
    esta_activo boolean DEFAULT true,
    fecha_contratacion date DEFAULT CURRENT_DATE,
    creado_en timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.etapas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL UNIQUE,
    descripcion text,
    indice_orden integer NOT NULL UNIQUE,
    tiempo_promedio_horas numeric(5,2) DEFAULT 0,
    es_control_calidad boolean DEFAULT false,
    creado_en timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tipos_defecto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL UNIQUE,
    descripcion text,
    severidad text DEFAULT 'medium' CHECK (severidad IN ('low', 'medium', 'high')),
    creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL UNIQUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.estados_pedido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.prioridades_pedido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.tallas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(10) NOT NULL UNIQUE,
    orden INTEGER NOT NULL UNIQUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referencias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL UNIQUE,
    descripcion TEXT,
    tipo public.tipo_referencia,
    precio_unitario NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    imagen_url TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.talleres (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL UNIQUE,
    creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_pedido SERIAL UNIQUE,
    id_cliente UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    id_etapa_actual UUID NOT NULL REFERENCES public.etapas(id),
    id_estado UUID REFERENCES public.estados_pedido(id) ON DELETE RESTRICT,
    id_prioridad UUID NOT NULL REFERENCES public.prioridades_pedido(id) ON DELETE RESTRICT,
    id_trabajador_actual uuid REFERENCES public.trabajadores(id) ON DELETE SET NULL,
    id_taller_asignado UUID REFERENCES public.talleres(id) ON DELETE SET NULL,
    finalizacion_real timestamptz,
    total_defectos integer DEFAULT 0,
    total_unidades INTEGER NOT NULL DEFAULT 0 CHECK (total_unidades >= 0),
    creado_en timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedidos_referencias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_pedido UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    id_referencia UUID NOT NULL REFERENCES public.referencias(id) ON DELETE RESTRICT,
    cantidad_total_referencia INTEGER NOT NULL DEFAULT 0,
    precio_total_referencia NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (id_pedido, id_referencia)
);

CREATE TABLE IF NOT EXISTS public.pedidos_referencias_tallas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pedido_referencia UUID NOT NULL REFERENCES public.pedidos_referencias(id) ON DELETE CASCADE,
    id_talla UUID NOT NULL REFERENCES public.tallas(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (id_pedido_referencia, id_talla)
);

CREATE TABLE IF NOT EXISTS public.historial_etapas_pedido (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pedido uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    id_etapa uuid NOT NULL REFERENCES public.etapas(id) ON DELETE RESTRICT,
    id_trabajador uuid REFERENCES public.trabajadores(id) ON DELETE SET NULL,
    iniciado_en timestamptz NOT NULL DEFAULT now(),
    completado_en timestamptz,
    horas_invertidas numeric(10, 2),
    notas text,
    es_actual boolean DEFAULT true,
    creado_en timestamptz DEFAULT now(),
    id_taller uuid REFERENCES public.talleres(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.registros_tiempo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_historial_etapa_pedido uuid NOT NULL REFERENCES public.historial_etapas_pedido(id) ON DELETE CASCADE,
    id_trabajador uuid NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
    tiempo_inicio timestamptz NOT NULL DEFAULT now(),
    tiempo_fin timestamptz,
    observaciones text
);

CREATE TABLE IF NOT EXISTS public.controles_calidad (
    id uuid not null default gen_random_uuid(),
    id_pedido uuid not null,
    id_etapa uuid not null,
    id_trabajador uuid not null,
    revisado_en timestamp with time zone default now(),
    aprobo boolean not null,
    defectos_encontrados integer default 0,
    notas text,
    creado_en timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.defectos_pedido (
    id uuid not null default gen_random_uuid(),
    id_pedido uuid not null,
    id_control_calidad uuid,
    id_tipo_defecto uuid not null,
    cantidad integer default 1,
    descripcion text,
    esta_corregido boolean default false,
    corregido_en timestamp with time zone,
    corregido_por uuid,
    creado_en timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.pedido_historial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_pedido UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    id_etapa UUID NOT NULL REFERENCES public.etapas(id) ON DELETE RESTRICT,
    fecha_inicio timestamptz NOT NULL DEFAULT now(),
    fecha_fin timestamptz,
    creado_en timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);

-- Inserción de Datos Iniciales (Seed Data)
--------------------------------------------------

INSERT INTO public.trabajadores (nombre_trabajador, correo_electronico, rol, especializacion, nombre_usuario) VALUES
  ('María González', 'maria@taller.com', 'modista', 'Confección general', 'mgonzalez'),
  ('Carlos Ruiz', 'carlos@taller.com', 'supervisor', 'Control de calidad', 'cruiz'),
  ('Ana López', 'ana@taller.com', 'cortador', 'Corte de patrones', 'alopez'),
  ('Luis Morales', 'luis@taller.com', 'planchador', 'Acabados', 'lmorales'),
  ('Carmen Vega', 'carmen@taller.com', 'coordinador', 'Logística', 'cvega')
ON CONFLICT (correo_electronico) DO NOTHING;

INSERT INTO public.etapas (nombre, descripcion, indice_orden, tiempo_promedio_horas, es_control_calidad) VALUES
  ('Ingreso', 'Recepción y registro del pedido', 1, 0.5, false),
  ('Corte de tela', 'Corte de patrones y preparación de materiales', 2, 4.0, false),
  ('Empaque/Envío a modistas', 'Preparación y envío de materiales a modistas externas', 3, 2.0, false),
  ('Confección', 'Proceso de costura y ensamblaje', 4, 48.0, false),
  ('Recepción', 'Recepción de prendas confeccionadas', 5, 1.0, false),
  ('Revisión', 'Control de calidad y detección de defectos', 6, 6.0, true),
  ('Planchado y empaque', 'Acabado final y empaque', 7, 4.0, false),
  ('Entrega final', 'Entrega al cliente', 8, 2.0, false)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.tipos_defecto (nombre, descripcion, severidad) VALUES
  ('Costura irregular', 'Puntadas desiguales o mal alineadas', 'medium'),
  ('Hilo suelto', 'Hilos sin cortar o mal rematados', 'low'),
  ('Mancha', 'Manchas en la tela', 'high'),
  ('Medida incorrecta', 'Dimensiones fuera de especificación', 'high'),
  ('Botón mal cosido', 'Botones flojos o mal ubicados', 'medium'),
  ('Cremallera defectuosa', 'Problemas con cierres', 'high'),
  ('Dobladillo irregular', 'Dobladillos mal hechos', 'medium'),
  ('Tela dañada', 'Roturas o daños en la tela', 'high')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.estados_pedido (nombre) VALUES
('En proceso'), ('Completado'), ('Retrasado'), ('Cancelado')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.prioridades_pedido (nombre) VALUES
('alta'), ('media'), ('baja')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.tallas (nombre, orden) VALUES
('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.referencias (nombre, descripcion, tipo, precio_unitario, imagen_url) VALUES
('Vestido Verano Floral', 'Vestido ligero con estampado floral para verano', 'vestido', 45.50, 'https://placehold.co/100x100/EFEFEF/AAAAAA&text=Vestido'),
('Camisa Casual Rayas', 'Camisa de algodón con rayas azules y blancas', 'camisa', 30.00, 'https://placehold.co/100x100/EFEFEF/AAAAAA&text=Camisa'),
('Pantalón Chino Slim Fit', 'Pantalón casual de corte ajustado en color beige', 'pantalon', 55.00, 'https://placehold.co/100x100/EFEFEF/AAAAAA&text=Pantalón'),
('Blusa Seda Elegante', 'Blusa de seda con cuello en V y mangas largas', 'blusa', 60.00, 'https://placehold.co/100x100/EFEFEF/AAAAAA&text=Blusa'),
('Falda Midi Plisada', 'Falda plisada de largo medio en color negro', 'falda', 40.00, 'https://placehold.co/100x100/EFEFEF/AAAAAA&text=Falda')
ON CONFLICT (nombre) DO NOTHING;

-- Funciones y Vistas Finales
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.actualizar_columna_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION public.crear_pedido_con_detalles(
    p_id_cliente UUID,
    p_id_prioridad UUID,
    p_referencias JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $BODY$
DECLARE
    v_id_pedido UUID;
    v_id_estado_en_proceso UUID;
    v_id_etapa_ingreso UUID; -- Variable para el ID de la etapa "Ingreso"
    v_total_unidades INT := 0;
    ref RECORD;
    talla RECORD;
    v_id_pedido_referencia UUID;
    ref_precio_unitario NUMERIC(10, 2);
    ref_cantidad_total INT;
    ref_precio_total NUMERIC(10, 2);
BEGIN
    -- Obtener ID del estado "En proceso"
    SELECT id INTO v_id_estado_en_proceso FROM public.estados_pedido WHERE nombre = 'En proceso' LIMIT 1;
    IF v_id_estado_en_proceso IS NULL THEN
        RAISE EXCEPTION 'Estado "En proceso" no encontrado.';
    END IF;

    -- Obtener ID de la etapa "Ingreso"
    SELECT id INTO v_id_etapa_ingreso FROM public.etapas WHERE nombre = 'Ingreso' LIMIT 1;
    IF v_id_etapa_ingreso IS NULL THEN
        RAISE EXCEPTION 'Etapa "Ingreso" no encontrada.';
    END IF;

    -- Calcular el total de unidades del pedido
    FOR ref IN SELECT * FROM jsonb_to_recordset(p_referencias) AS x(id_referencia UUID, quantities JSONB)
    LOOP
        ref_cantidad_total := 0;
        FOR talla IN SELECT * FROM jsonb_to_recordset(ref.quantities) AS y(id_talla UUID, cantidad INT)
        LOOP
            ref_cantidad_total := ref_cantidad_total + talla.cantidad;
        END LOOP;
        v_total_unidades := v_total_unidades + ref_cantidad_total;
    END LOOP;

    IF v_total_unidades <= 0 THEN
        RAISE EXCEPTION 'El pedido debe tener al menos una unidad.';
    END IF;

    -- Insertar el pedido principal, AÑADIENDO la etapa actual
    INSERT INTO public.pedidos (id_cliente, id_prioridad, id_estado, total_unidades, id_etapa_actual)
    VALUES (p_id_cliente, p_id_prioridad, v_id_estado_en_proceso, v_total_unidades, v_id_etapa_ingreso)
    RETURNING id INTO v_id_pedido;

    -- Insertar los detalles del pedido (referencias y tallas)
    FOR ref IN SELECT * FROM jsonb_to_recordset(p_referencias) AS x(id_referencia UUID, quantities JSONB)
    LOOP
        ref_cantidad_total := 0;
        ref_precio_total := 0.00;
        SELECT precio_unitario INTO ref_precio_unitario FROM public.referencias WHERE id = ref.id_referencia;

        FOR talla IN SELECT * FROM jsonb_to_recordset(ref.quantities) AS y(id_talla UUID, cantidad INT)
        LOOP
            ref_cantidad_total := ref_cantidad_total + talla.cantidad;
        END LOOP;
        ref_precio_total := ref_cantidad_total * ref_precio_unitario;

        INSERT INTO public.pedidos_referencias (id_pedido, id_referencia, cantidad_total_referencia, precio_total_referencia)
        VALUES (v_id_pedido, ref.id_referencia, ref_cantidad_total, ref_precio_total)
        RETURNING id INTO v_id_pedido_referencia;

        FOR talla IN SELECT * FROM jsonb_to_recordset(ref.quantities) AS y(id_talla UUID, cantidad INT)
        LOOP
            IF talla.cantidad > 0 THEN
                INSERT INTO public.pedidos_referencias_tallas (id_pedido_referencia, id_talla, cantidad)
                VALUES (v_id_pedido_referencia, talla.id_talla, talla.cantidad);
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_id_pedido;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.avanzar_etapa_pedido(p_id_pedido uuid, p_id_trabajador uuid, p_notas text, p_id_taller uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
AS $BODY$
DECLARE
  v_id_etapa_actual uuid;
  v_id_etapa_siguiente uuid;
  v_siguiente_indice_orden integer;
  v_id_estado_completado uuid;
BEGIN
  -- Get the ID for the 'Completado' state
  SELECT id INTO v_id_estado_completado FROM public.estados_pedido WHERE nombre = 'Completado';
  
  -- Get the current stage of the order
  SELECT id_etapa_actual INTO v_id_etapa_actual FROM public.pedidos WHERE id = p_id_pedido;
  
  -- Complete the current stage in the history
  UPDATE public.historial_etapas_pedido 
  SET completado_en = now(), 
      es_actual = false,
      horas_invertidas = EXTRACT(EPOCH FROM (now() - iniciado_en)) / 3600
  WHERE id_pedido = p_id_pedido AND es_actual = true;
  
  -- Find the next stage
  SELECT e.id, e.indice_orden INTO v_id_etapa_siguiente, v_siguiente_indice_orden
  FROM public.etapas e
  WHERE e.indice_orden = (
    SELECT indice_orden + 1 FROM public.etapas WHERE id = v_id_etapa_actual
  );
  
  -- CORRECTLY update the assigned workshop on the 'pedidos' table
  IF p_id_taller IS NOT NULL THEN
    UPDATE public.pedidos
    SET id_taller_asignado = p_id_taller
    WHERE id = p_id_pedido;
  END IF;

  -- Update the responsible worker on the 'pedidos' table
  IF p_id_trabajador IS NOT NULL THEN
    UPDATE public.pedidos
    SET id_trabajador_actual = p_id_trabajador
    WHERE id = p_id_pedido;
  END IF;
  
  -- If there is a next stage, advance to it
  IF v_id_etapa_siguiente IS NOT NULL THEN
    UPDATE public.pedidos SET id_etapa_actual = v_id_etapa_siguiente WHERE id = p_id_pedido;
    
    INSERT INTO public.historial_etapas_pedido (id_pedido, id_etapa, id_trabajador, notas, es_actual)
    VALUES (p_id_pedido, v_id_etapa_siguiente, p_id_trabajador, p_notas, true);
    
    RETURN true;
  ELSE
    -- If there is no next stage, mark the order as completed
    UPDATE public.pedidos SET id_estado = v_id_estado_completado, finalizacion_real = now() WHERE id = p_id_pedido;
    RETURN true;
  END IF;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.obtener_tiempos_etapas()
RETURNS TABLE(
    stage text,
    avgtime numeric,
    realtime numeric,
    efficiency numeric
)
LANGUAGE plpgsql
AS $BODY$
BEGIN
    RETURN QUERY
    WITH stage_durations AS (
        -- Calcula la duración para cada registro del historial, incluyendo los que están en curso
        SELECT
            h.id_etapa,
            COALESCE(h.horas_invertidas, EXTRACT(EPOCH FROM (now() - h.iniciado_en)) / 3600) AS duration_hours
        FROM
            public.historial_etapas_pedido h
    ),
    avg_stage_durations AS (
        -- Calcula la duración promedio para cada etapa
        SELECT
            sd.id_etapa,
            AVG(sd.duration_hours) as avg_duration
        FROM
            stage_durations sd
        GROUP BY
            sd.id_etapa
    )
    -- Selección final y cálculos
    SELECT
        CASE e.nombre
            WHEN 'Corte de tela' THEN 'Corte'
            WHEN 'Empaque/Envío a modistas' THEN 'Envío'
            WHEN 'Planchado y empaque' THEN 'Planchado'
            WHEN 'Entrega final' THEN 'Entrega'
            ELSE e.nombre
        END AS stage,
        COALESCE(e.tiempo_promedio_horas, 0) AS avgtime,
        COALESCE(asd.avg_duration, 0) AS realtime,
        CASE
            WHEN COALESCE(asd.avg_duration, 0) <= 0 THEN 100.0
            ELSE (COALESCE(e.tiempo_promedio_horas, 0) / asd.avg_duration) * 100
        END AS efficiency
    FROM
        public.etapas e
    LEFT JOIN
        avg_stage_durations asd ON e.id = asd.id_etapa
    ORDER BY
        e.indice_orden;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.calcular_tiempo_etapa_actual(p_id_pedido uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_iniciado_en timestamptz;
  v_tiempo_en_horas numeric(10, 2);
BEGIN
  SELECT iniciado_en INTO v_iniciado_en
  FROM public.historial_etapas_pedido
  WHERE id_pedido = p_id_pedido AND es_actual = true;

  IF v_iniciado_en IS NOT NULL THEN
    v_tiempo_en_horas := EXTRACT(EPOCH FROM (now() - v_iniciado_en)) / 3600;
    RETURN v_tiempo_en_horas;
  ELSE
    RETURN NULL;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION obtener_valores_enum(enum_type_name text)
RETURNS json AS $$
DECLARE
  enum_values json;
BEGIN
  EXECUTE format('SELECT array_to_json(enum_range(NULL::%s))', enum_type_name)
  INTO enum_values;
  RETURN enum_values;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW public.vista_detalles_pedido AS
SELECT
    prt.cantidad,
    pr.id_pedido,
    pr.id_referencia,
    t.id AS id_talla,
    ref.nombre AS nombre_referencia,
    ref.imagen_url,
    ref.precio_unitario,
    t.nombre AS nombre_talla
FROM
    pedidos_referencias_tallas prt
JOIN
    pedidos_referencias pr ON prt.id_pedido_referencia = pr.id
JOIN
    referencias ref ON pr.id_referencia = ref.id
JOIN
    tallas t ON prt.id_talla = t.id;

-- Triggers y Políticas de Seguridad (RLS)
--------------------------------------------------

-- Triggers
CREATE OR REPLACE FUNCTION public.crear_historial_inicial()
RETURNS TRIGGER AS $BODY$
BEGIN
    INSERT INTO public.historial_etapas_pedido (id_pedido, id_etapa, es_actual)
    VALUES (NEW.id, NEW.id_etapa_actual, true);
    RETURN NEW;
END;
$BODY$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actualizar_trabajadores_actualizado_en ON public.trabajadores;
CREATE TRIGGER trg_actualizar_trabajadores_actualizado_en BEFORE UPDATE ON public.trabajadores FOR EACH ROW EXECUTE FUNCTION public.actualizar_columna_actualizado_en();

DROP TRIGGER IF EXISTS trg_actualizar_etapas_actualizado_en ON public.etapas;
CREATE TRIGGER trg_actualizar_etapas_actualizado_en BEFORE UPDATE ON public.etapas FOR EACH ROW EXECUTE FUNCTION public.actualizar_columna_actualizado_en();

DROP TRIGGER IF EXISTS trg_actualizar_pedidos_actualizado_en ON public.pedidos;
CREATE TRIGGER trg_actualizar_pedidos_actualizado_en BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.actualizar_columna_actualizado_en();

DROP TRIGGER IF EXISTS trg_actualizar_referencias_actualizado_en ON public.referencias;
CREATE TRIGGER trg_actualizar_referencias_actualizado_en BEFORE UPDATE ON public.referencias FOR EACH ROW EXECUTE FUNCTION public.actualizar_columna_actualizado_en();

DROP TRIGGER IF EXISTS trg_crear_historial_inicial ON public.pedidos;
CREATE TRIGGER trg_crear_historial_inicial
AFTER INSERT ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.crear_historial_inicial();

DROP TRIGGER IF EXISTS trg_actualizar_pedido_historial_actualizado_en ON public.pedido_historial;
CREATE TRIGGER trg_actualizar_pedido_historial_actualizado_en BEFORE UPDATE ON public.pedido_historial FOR EACH ROW EXECUTE FUNCTION public.actualizar_columna_actualizado_en();

-- Habilitar RLS
ALTER TABLE public.trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_defecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estados_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prioridades_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tallas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_referencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_referencias_tallas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_etapas_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_tiempo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controles_calidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defectos_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talleres ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.trabajadores FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir lectura pública para login" ON public.trabajadores FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.etapas FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir lectura a anonimos" ON public.etapas FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.tipos_defecto FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir lectura a anonimos" ON public.tipos_defecto FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir lectura a todos los usuarios" ON public.clientes FOR SELECT USING (true);
CREATE POLICY "Permitir inserción a autenticados" ON public.clientes FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir lectura a todos los usuarios" ON public.estados_pedido FOR SELECT USING (true);
CREATE POLICY "Permitir inserción a autenticados" ON public.estados_pedido FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir lectura a todos los usuarios" ON public.prioridades_pedido FOR SELECT USING (true);
CREATE POLICY "Permitir inserción a autenticados" ON public.prioridades_pedido FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir lectura a todos los usuarios" ON public.tallas FOR SELECT USING (true);
CREATE POLICY "Permitir inserción a autenticados" ON public.tallas FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir lectura a todos los usuarios" ON public.referencias FOR SELECT USING (true);
CREATE POLICY "Permitir inserción a autenticados" ON public.referencias FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Permitir actualización a autenticados" ON public.referencias FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminación a autenticados" ON public.referencias FOR DELETE USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.pedidos FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.pedidos_referencias FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.pedidos_referencias_tallas FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.historial_etapas_pedido FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.registros_tiempo FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados en controles_calidad" ON public.controles_calidad FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados en defectos_pedido" ON public.defectos_pedido FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.pedido_historial FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.talleres FOR SELECT TO authenticated USING (true);


-- Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('imagenes', 'imagenes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Acceso total de usuarios a su propia carpeta de imagenes"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'imagenes' AND (storage.foldername(name))[1] = auth.uid()::text )
WITH CHECK ( bucket_id = 'imagenes' AND (storage.foldername(name))[1] = auth.uid()::text );

CREATE POLICY "Permitir acceso público de solo lectura a las imágenes"
ON storage.objects
FOR SELECT
USING ( bucket_id = 'imagenes' );

GRANT SELECT ON TABLE public.vista_detalles_pedido TO authenticated;
GRANT EXECUTE ON FUNCTION public.avanzar_etapa_pedido(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_tiempos_etapas() TO authenticated;

GRANT EXECUTE ON FUNCTION public.crear_pedido_con_detalles(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_tiempo_etapa_actual(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_valores_enum(text) TO authenticated;
