

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."estado_orden_trabajo" AS ENUM (
    'pendiente',
    'en_progreso',
    'completada',
    'cancelada',
    'recibida',
    'recibida_incompleta',
    'reparacion_interna',
    'devuelto'
);


ALTER TYPE "public"."estado_orden_trabajo" OWNER TO "postgres";


CREATE TYPE "public"."tipo_referencia" AS ENUM (
    'vestido',
    'camisa',
    'pantalon',
    'blusa',
    'falda',
    'otro',
    'conjunto',
    'chaqueta'
);


ALTER TYPE "public"."tipo_referencia" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_cantidades_pedido_referencia"("p_id_pedido" "uuid", "p_nombre_referencia" "text", "p_nuevas_cantidades" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$DECLARE
    v_id_referencia uuid;
    v_id_pedido_referencia uuid;
    v_id_talla uuid;
    talla_nombre text;
    valor_cantidad text;
    nueva_cantidad integer;
    total_ref_cantidad integer;
BEGIN
    -- 1. Obtener el ID de la referencia
    SELECT id INTO v_id_referencia
    FROM public.referencias
    WHERE nombre = p_nombre_referencia;

    IF v_id_referencia IS NULL THEN
        RAISE EXCEPTION 'Referencia no encontrada: %', p_nombre_referencia;
    END IF;

    -- 2. Obtener el ID del registro de enlace pedido-referencia.
    -- Si no existe, se crea uno nuevo para mantener la integridad.
    INSERT INTO public.pedidos_referencias (id_pedido, id_referencia, cantidad_total_referencia, precio_total_referencia)
    VALUES (p_id_pedido, v_id_referencia, 0, 0)
    ON CONFLICT (id_pedido, id_referencia)
    DO UPDATE SET id_pedido = p_id_pedido -- Esto no cambia nada, pero permite que la cláusula RETURNING funcione siempre
    RETURNING id INTO v_id_pedido_referencia;

    -- 3. Iterar sobre las nuevas cantidades proporcionadas en el JSON
    FOR talla_nombre, valor_cantidad IN SELECT * FROM jsonb_each_text(p_nuevas_cantidades)
    LOOP
        BEGIN
            nueva_cantidad := CAST(valor_cantidad AS integer);
        EXCEPTION
            WHEN invalid_text_representation THEN
                RAISE EXCEPTION 'Cantidad inválida para la talla %: %', talla_nombre, valor_cantidad;
        END;

        -- Obtener el ID de la talla
        SELECT id INTO v_id_talla
        FROM public.tallas
        WHERE nombre = talla_nombre;

        IF v_id_talla IS NULL THEN
            RAISE WARNING 'Talla no encontrada, se omitirá: %', talla_nombre;
            CONTINUE;
        END IF;

        -- 4. Actualizar, insertar o eliminar en la tabla 'pedidos_referencias_tallas'
        IF nueva_cantidad > 0 THEN
            INSERT INTO public.pedidos_referencias_tallas (id_pedido_referencia, id_talla, cantidad)
            VALUES (v_id_pedido_referencia, v_id_talla, nueva_cantidad)
            ON CONFLICT (id_pedido_referencia, id_talla)
            DO UPDATE SET cantidad = EXCLUDED.cantidad;
        ELSE
            DELETE FROM public.pedidos_referencias_tallas
            WHERE id_pedido_referencia = v_id_pedido_referencia
              AND id_talla = v_id_talla;
        END IF;
    END LOOP;

    -- 5. Recalcular la cantidad total para esta referencia específica
    SELECT COALESCE(SUM(cantidad), 0) INTO total_ref_cantidad
    FROM public.pedidos_referencias_tallas
    WHERE id_pedido_referencia = v_id_pedido_referencia;

    UPDATE public.pedidos_referencias
    SET cantidad_total_referencia = total_ref_cantidad,
        precio_total_referencia = total_ref_cantidad * (SELECT precio_unitario FROM public.referencias WHERE id = v_id_referencia)
    WHERE id = v_id_pedido_referencia;
    
    -- 6. Finalmente, recalcular los totales de todo el pedido (unidades y costo)
    UPDATE public.pedidos
    SET 
        total_unidades = (
            SELECT COALESCE(SUM(cantidad_total_referencia), 0)
            FROM public.pedidos_referencias
            WHERE id_pedido = p_id_pedido
        ),
        Precio_total = (
            SELECT COALESCE(SUM(precio_total_referencia), 0)
            FROM public.pedidos_referencias
            WHERE id_pedido = p_id_pedido
        )
    WHERE id = p_id_pedido;

END;$$;


ALTER FUNCTION "public"."actualizar_cantidades_pedido_referencia"("p_id_pedido" "uuid", "p_nombre_referencia" "text", "p_nuevas_cantidades" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_columna_actualizado_en"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."actualizar_columna_actualizado_en"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_etapa_pedido_principal"("p_id_pedido" "uuid", "p_id_trabajador" "uuid" DEFAULT NULL::"uuid", "p_id_usuario_accion" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_id_etapa_minima uuid;
    v_min_indice_orden integer;
    v_id_etapa_final uuid;
    v_id_estado_completado uuid;
    v_num_work_orders integer;
    v_num_active_work_orders integer;
    r_etapa RECORD;
BEGIN
    -- 1. Contar órdenes de trabajo
    SELECT COUNT(*) INTO v_num_work_orders FROM public.ordenes_de_trabajo WHERE id_pedido = p_id_pedido;
    IF v_num_work_orders = 0 THEN RETURN; END IF;

    -- 2. ENCONTRAR LA ETAPA DEL "CUELLO DE BOTELLA" (MIN)
    -- Consideramos activa cualquier orden que no esté completada ni cancelada.
    -- EXCEPCIÓN: Órdenes en REVISION completadas pero NO asignadas a la siguiente etapa aún se consideran activas.
    SELECT MIN(e.indice_orden)
    INTO v_min_indice_orden
    FROM public.ordenes_de_trabajo odt
    JOIN public.etapas e ON odt.id_etapa_actual = e.id
    WHERE odt.id_pedido = p_id_pedido 
      AND (
          odt.estado NOT IN ('completada', 'cancelada')
          OR (e.codigo = 'REVISION' AND odt.estado = 'completada' AND odt.asignado_sig_etapa = false)
      );

    IF v_min_indice_orden IS NOT NULL THEN
        SELECT id INTO v_id_etapa_minima FROM public.etapas WHERE indice_orden = v_min_indice_orden;
        
        -- Actualizar el pedido principal a la etapa del cuello de botella
        UPDATE public.pedidos SET id_etapa_actual = v_id_etapa_minima, actualizado_en = now() WHERE id = p_id_pedido;
    END IF;

    -- 3. GESTIÓN DE HISTORIAL PARALELO
    -- Abrir historiales para etapas que tengan trabajo activo
    FOR r_etapa IN 
        SELECT DISTINCT e.id, e.nombre, e.indice_orden
        FROM public.ordenes_de_trabajo odt
        JOIN public.etapas e ON odt.id_etapa_actual = e.id
        WHERE odt.id_pedido = p_id_pedido 
          AND (
              odt.estado NOT IN ('completada', 'cancelada')
              OR (e.codigo = 'REVISION' AND odt.estado = 'completada' AND odt.asignado_sig_etapa = false)
          )
        ORDER BY e.indice_orden ASC
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.historial_etapas_pedido WHERE id_pedido = p_id_pedido AND id_etapa = r_etapa.id AND es_actual = true) THEN
            INSERT INTO public.historial_etapas_pedido (id_pedido, id_etapa, es_actual, id_usuario_actualizacion_etapa, iniciado_en)
            VALUES (p_id_pedido, r_etapa.id, true, p_id_usuario_accion, now());
        END IF;
    END LOOP;

    -- Cerrar historiales de etapas que ya no tienen trabajo pendiente
    UPDATE public.historial_etapas_pedido hep
    SET completado_en = now(),
        es_actual = false,
        horas_invertidas = EXTRACT(EPOCH FROM (now() - iniciado_en)) / 3600,
        id_usuario_actualizacion_etapa = COALESCE(p_id_usuario_accion, id_usuario_actualizacion_etapa)
    WHERE hep.id_pedido = p_id_pedido 
      AND hep.es_actual = true
      AND NOT EXISTS (
          SELECT 1 FROM public.ordenes_de_trabajo odt
          JOIN public.etapas e ON odt.id_etapa_actual = e.id
          WHERE odt.id_pedido = p_id_pedido 
            AND odt.id_etapa_actual = hep.id_etapa
            AND (
                odt.estado NOT IN ('completada', 'cancelada')
                OR (e.codigo = 'REVISION' AND odt.estado = 'completada' AND odt.asignado_sig_etapa = false)
            )
      );

    -- 4. MANEJO DE FINALIZACIÓN
    -- Un pedido solo se completa si NO hay órdenes activas en ninguna etapa
    SELECT COUNT(*) INTO v_num_active_work_orders 
    FROM public.ordenes_de_trabajo odt
    JOIN public.etapas e ON odt.id_etapa_actual = e.id
    WHERE odt.id_pedido = p_id_pedido 
      AND (
          odt.estado NOT IN ('completada', 'cancelada')
          OR (e.codigo = 'REVISION' AND odt.estado = 'completada' AND odt.asignado_sig_etapa = false)
      );

    IF v_num_active_work_orders = 0 THEN
        SELECT id INTO v_id_etapa_final FROM public.etapas WHERE codigo = 'ENTREGA' LIMIT 1;
        SELECT id INTO v_id_estado_completado FROM public.estados_pedido WHERE nombre = 'Completado' LIMIT 1;
        
        IF v_id_etapa_final IS NOT NULL THEN
            UPDATE public.pedidos 
            SET id_etapa_actual = v_id_etapa_final, 
                id_estado = COALESCE(v_id_estado_completado, id_estado),
                finalizacion_real = now(),
                actualizado_en = now()
            WHERE id = p_id_pedido;
            
            -- Cerrar todos los historiales activos
            UPDATE public.historial_etapas_pedido
            SET completado_en = now(),
                es_actual = false,
                horas_invertidas = EXTRACT(EPOCH FROM (now() - iniciado_en)) / 3600,
                id_usuario_actualizacion_etapa = p_id_usuario_accion
            WHERE id_pedido = p_id_pedido AND es_actual = true AND id_etapa != v_id_etapa_final;

            -- Crear entrada de historial final si no existe
            IF NOT EXISTS (SELECT 1 FROM public.historial_etapas_pedido WHERE id_pedido = p_id_pedido AND id_etapa = v_id_etapa_final) THEN
                INSERT INTO public.historial_etapas_pedido (id_pedido, id_etapa, es_actual, completado_en, horas_invertidas, id_usuario_actualizacion_etapa, iniciado_en)
                VALUES (p_id_pedido, v_id_etapa_final, false, now(), 0, p_id_usuario_accion, now());
            END IF;
        END IF;
    END IF;
END;
$$;


ALTER FUNCTION "public"."actualizar_etapa_pedido_principal"("p_id_pedido" "uuid", "p_id_trabajador" "uuid", "p_id_usuario_accion" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_pedidos_retrasados"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_id_estado_retrasado UUID := '903b63ef-b89a-47cf-8c95-adb998ef7a04';
    v_id_estado_completado UUID := 'c821da62-e514-43f7-a9f5-3170ca8316b9';
BEGIN
    -- Actualizar pedidos que:
    -- 1. NO estén completados
    -- 2. Tengan 45 días o más desde su creación
    -- 3. NO estén ya marcados como "Retrasado"
    UPDATE public.pedidos
    SET id_estado = v_id_estado_retrasado
    WHERE id_estado != v_id_estado_completado
      AND id_estado != v_id_estado_retrasado
      AND EXTRACT(DAY FROM (NOW() - creado_en)) >= 45;
END;
$$;


ALTER FUNCTION "public"."actualizar_pedidos_retrasados"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agregar_valor_a_enum_referencia"("nuevo_valor" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Intentamos agregar el valor. Notar que ALTER TYPE ... ADD VALUE no puede estar en un bloque transaccional
    -- en versiones antiguas, pero Supabase usa versiones recientes. 
    -- Si falla por transaccionalidad, se informará.
    EXECUTE format('ALTER TYPE public.tipo_referencia ADD VALUE IF NOT EXISTS %L', nuevo_valor);
END;
$$;


ALTER FUNCTION "public"."agregar_valor_a_enum_referencia"("nuevo_valor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."asignar_planchado_desde_revision"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    asignacion record;
    v_id_etapa_planchado UUID;
    v_id_etapa_revision UUID;
    v_id_etapa_ojal UUID;
    v_nueva_orden_trabajo_id UUID;
    v_primer_planchador_id UUID;
    v_numero_ordenes_anteriores INTEGER;
    v_iniciado_en_anterior TIMESTAMPTZ;
    v_horas_distribuidas_anterior NUMERIC;
BEGIN
    -- 1. Obtener IDs de etapas necesarias
    SELECT id INTO v_id_etapa_planchado FROM public.etapas WHERE codigo = 'PLANCHADO' LIMIT 1;
    SELECT id INTO v_id_etapa_revision FROM public.etapas WHERE codigo = 'REVISION' LIMIT 1;
    SELECT id INTO v_id_etapa_ojal FROM public.etapas WHERE (codigo = 'OJAL' OR codigo = 'OJAL_BOTON') LIMIT 1;

    IF v_id_etapa_planchado IS NULL THEN
        RAISE EXCEPTION 'La etapa "Planchado y empaque" no fue encontrada.';
    END IF;

    -- 2. Marcar las órdenes originales de Revisión/Ojal como asignadas a la siguiente etapa
    -- ESTO DEBE SER LO PRIMERO para que actualizar_etapa_pedido_principal funcione bien
    UPDATE public.ordenes_de_trabajo
    SET asignado_sig_etapa = true,
        estado = 'completada',
        actualizado_en = now()
    WHERE id_pedido = p_id_pedido
      AND id_taller = p_id_taller
      AND id_etapa_actual IN (v_id_etapa_revision, v_id_etapa_ojal)
      -- Solo las que estamos enviando a planchado (las que vienen en el JSON de asignación)
      AND id_referencia IN (SELECT (x.id_referencia)::uuid FROM jsonb_to_recordset(p_asignaciones_json) AS x(id_referencia uuid));

    -- 3. CERRAR HISTORIALES de las etapas anteriores
    SELECT count(*), min(h.iniciado_en) INTO v_numero_ordenes_anteriores, v_iniciado_en_anterior
    FROM public.historial_ordenes_de_trabajo h
    JOIN public.ordenes_de_trabajo ot ON h.id_orden_trabajo = ot.id
    WHERE ot.id_pedido = p_id_pedido 
      AND ot.id_taller = p_id_taller 
      AND h.es_actual = true
      AND h.id_etapa IN (v_id_etapa_revision, v_id_etapa_ojal);

    IF v_numero_ordenes_anteriores > 0 THEN
        v_horas_distribuidas_anterior := (EXTRACT(EPOCH FROM (now() - v_iniciado_en_anterior)) / 3600) / v_numero_ordenes_anteriores;
        
        UPDATE public.historial_ordenes_de_trabajo h
        SET es_actual = false,
            completado_en = now(),
            horas_invertidas = v_horas_distribuidas_anterior
        FROM public.ordenes_de_trabajo ot
        WHERE h.id_orden_trabajo = ot.id
          AND ot.id_pedido = p_id_pedido
          AND ot.id_taller = p_id_taller
          AND h.es_actual = true
          AND h.id_etapa IN (v_id_etapa_revision, v_id_etapa_ojal);
    END IF;

    -- 4. PROCESAR NUEVAS ASIGNACIONES PARA PLANCHADO
    FOR asignacion IN SELECT * FROM jsonb_to_recordset(p_asignaciones_json) AS x(id_trabajador_asignado uuid, id_referencia uuid, id_talla uuid, cantidad integer)
    LOOP
        IF v_primer_planchador_id IS NULL THEN v_primer_planchador_id := asignacion.id_trabajador_asignado; END IF;

        INSERT INTO public.ordenes_de_trabajo (
            id_pedido, id_taller, id_referencia, id_talla, cantidad_asignada, 
            id_etapa_actual, id_trabajador_asignado, estado
        )
        VALUES (
            p_id_pedido, p_id_taller, asignacion.id_referencia, asignacion.id_talla, asignacion.cantidad, 
            v_id_etapa_planchado, asignacion.id_trabajador_asignado, 'pendiente'
        )
        RETURNING id INTO v_nueva_orden_trabajo_id;

        INSERT INTO public.historial_ordenes_de_trabajo (
            id_pedido, id_orden_trabajo, id_etapa, id_trabajador, id_usuario_actualizacion_etapa, es_actual, iniciado_en
        )
        VALUES (
            p_id_pedido, v_nueva_orden_trabajo_id, v_id_etapa_planchado, asignacion.id_trabajador_asignado, p_id_usuario_accion, true, now()
        );
    END LOOP;

    -- 5. ACTUALIZAR EL PEDIDO PRINCIPAL
    PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido, v_primer_planchador_id, p_id_usuario_accion);

END;
$$;


ALTER FUNCTION "public"."asignar_planchado_desde_revision"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."asignar_trabajador_pedido"("p_pedido_id" "uuid", "p_trabajador_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE public.pedidos
    SET id_trabajador_actual = p_trabajador_id
    WHERE id = p_pedido_id;
END;
$$;


ALTER FUNCTION "public"."asignar_trabajador_pedido"("p_pedido_id" "uuid", "p_trabajador_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avanzar_etapa_pedido"("payload" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  p_id_pedido uuid := (payload->>'p_id_pedido')::uuid;
  p_notas text := payload->>'p_notas';
  p_id_usuario_actualizacion_etapa uuid := (payload->>'p_id_usuario_actualizacion_etapa')::uuid;
  p_id_trabajador uuid := (payload->>'p_id_trabajador')::uuid;

  v_id_etapa_actual uuid;
  v_id_etapa_siguiente uuid;
  v_siguiente_indice_orden integer;
  v_id_estado_completado uuid;
BEGIN
  -- VALIDATION: Ensure a worker is always assigned
  IF p_id_trabajador IS NULL THEN
    RAISE EXCEPTION 'Se debe asignar un trabajador para avanzar la etapa del pedido.';
  END IF;

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

  -- Update the responsible worker on the 'pedidos' table
  UPDATE public.pedidos
  SET id_trabajador_actual = p_id_trabajador
  WHERE id = p_id_pedido;

  -- If there is a next stage, advance to it
  IF v_id_etapa_siguiente IS NOT NULL THEN
    UPDATE public.pedidos SET id_etapa_actual = v_id_etapa_siguiente WHERE id = p_id_pedido;

    INSERT INTO public.historial_etapas_pedido (id_pedido, id_etapa, id_trabajador, notas, es_actual, id_usuario_actualizacion_etapa)
    VALUES (p_id_pedido, v_id_etapa_siguiente, p_id_trabajador, p_notas, true, p_id_usuario_actualizacion_etapa);

    RETURN true;
  ELSE
    -- If there is no next stage, mark the order as completed
    UPDATE public.pedidos SET id_estado = v_id_estado_completado, finalizacion_real = now() WHERE id = p_id_pedido;
    RETURN true;
  END IF;
END;
$$;


ALTER FUNCTION "public"."avanzar_etapa_pedido"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_id_etapa_actual UUID;
  v_codigo_etapa_actual TEXT;
  v_id_etapa_siguiente UUID;
  v_codigo_etapa_siguiente TEXT;
  v_indice_etapa_actual INTEGER;
  r_work_order RECORD;
  v_numero_ordenes INTEGER;
  v_iniciado_en TIMESTAMPTZ;
  v_horas_distribuidas NUMERIC;
BEGIN
  -- 1. Obtener etapa actual
  SELECT e.id, e.indice_orden, e.codigo
  INTO v_id_etapa_actual, v_indice_etapa_actual, v_codigo_etapa_actual
  FROM public.ordenes_de_trabajo odt
  JOIN public.etapas e ON odt.id_etapa_actual = e.id
  WHERE odt.id_pedido = p_id_pedido AND odt.id_taller = p_id_taller AND odt.estado != 'completada'
  ORDER BY e.indice_orden ASC
  LIMIT 1;

  IF v_id_etapa_actual IS NULL THEN RETURN; END IF;

  -- 2. Etapa siguiente
  SELECT id, codigo INTO v_id_etapa_siguiente, v_codigo_etapa_siguiente
  FROM public.etapas
  WHERE indice_orden = v_indice_etapa_actual + 1;
  
  -- 3. CÁLCULO DISTRIBUIDO: Contar órdenes en esta etapa para este taller
  SELECT count(*), min(iniciado_en)
  INTO v_numero_ordenes, v_iniciado_en
  FROM public.historial_ordenes_de_trabajo h
  JOIN public.ordenes_de_trabajo ot ON h.id_orden_trabajo = ot.id
  WHERE ot.id_pedido = p_id_pedido 
    AND ot.id_taller = p_id_taller 
    AND ot.id_etapa_actual = v_id_etapa_actual
    AND h.es_actual = true;

  IF v_numero_ordenes > 0 THEN
      -- DIVISIÓN CLAVE: Repartir el tiempo entre las órdenes del lote
      v_horas_distribuidas := (EXTRACT(EPOCH FROM (now() - v_iniciado_en)) / 3600) / v_numero_ordenes;
  ELSE
      v_horas_distribuidas := 0;
  END IF;

  -- 4. Cerrar historial con horas repartidas
  UPDATE public.historial_ordenes_de_trabajo h
  SET
      completado_en = now(),
      es_actual = false,
      horas_invertidas = v_horas_distribuidas,
      id_usuario_actualizacion_etapa = p_id_usuario_actualizacion_etapa
  FROM public.ordenes_de_trabajo ot
  WHERE
      h.id_orden_trabajo = ot.id
      AND ot.id_pedido = p_id_pedido 
      AND ot.id_taller = p_id_taller
      AND ot.id_etapa_actual = v_id_etapa_actual
      AND h.es_actual = true;

  -- 5. Mover a la siguiente etapa
  IF v_codigo_etapa_siguiente = 'RECEPCION' THEN
     UPDATE public.ordenes_de_trabajo
     SET estado = 'completada'
     WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_etapa_actual = v_id_etapa_actual;
  ELSE
     UPDATE public.ordenes_de_trabajo
     SET id_etapa_actual = v_id_etapa_siguiente
     WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_etapa_actual = v_id_etapa_actual;

     FOR r_work_order IN
         SELECT id, id_trabajador_asignado FROM public.ordenes_de_trabajo
         WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_etapa_actual = v_id_etapa_siguiente
     LOOP
         INSERT INTO public.historial_ordenes_de_trabajo (
             id_pedido, id_orden_trabajo, id_etapa, id_trabajador, id_usuario_actualizacion_etapa, es_actual, iniciado_en
         ) VALUES (
             p_id_pedido, r_work_order.id, v_id_etapa_siguiente, r_work_order.id_trabajador_asignado, p_id_usuario_actualizacion_etapa, true, now()
         );
     END LOOP;
  END IF;

  PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido);
END;
$$;


ALTER FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid", "p_id_etapa_origen" "uuid" DEFAULT NULL::"uuid", "p_es_devuelto" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_id_etapa_actual UUID;
  v_id_etapa_siguiente UUID;
  v_codigo_etapa_siguiente TEXT;
  v_indice_etapa_actual INTEGER;
  r_work_order RECORD;
  v_numero_ordenes INTEGER;
  v_iniciado_en TIMESTAMPTZ;
  v_horas_distribuidas NUMERIC;
BEGIN
  -- 1. Determinar cuál es la etapa que estamos avanzando
  IF p_id_etapa_origen IS NOT NULL THEN
      v_id_etapa_actual := p_id_etapa_origen;
      SELECT indice_orden INTO v_indice_etapa_actual FROM public.etapas WHERE id = v_id_etapa_actual;
  ELSE
      SELECT e.id, e.indice_orden
      INTO v_id_etapa_actual, v_indice_etapa_actual
      FROM public.ordenes_de_trabajo odt
      JOIN public.etapas e ON odt.id_etapa_actual = e.id
      WHERE odt.id_pedido = p_id_pedido AND odt.id_taller = p_id_taller AND odt.estado != 'completada'
      ORDER BY e.indice_orden ASC LIMIT 1;
  END IF;

  IF v_id_etapa_actual IS NULL THEN RETURN; END IF;

  -- 2. Siguiente
  SELECT id, codigo INTO v_id_etapa_siguiente, v_codigo_etapa_siguiente
  FROM public.etapas
  WHERE indice_orden = v_indice_etapa_actual + 1;
  
  -- 3. Calcular horas distribuidas SOLO para el subconjunto afectado
  SELECT count(*), min(iniciado_en)
  INTO v_numero_ordenes, v_iniciado_en
  FROM public.historial_ordenes_de_trabajo h
  JOIN public.ordenes_de_trabajo ot ON h.id_orden_trabajo = ot.id
  WHERE ot.id_pedido = p_id_pedido 
    AND ot.id_taller = p_id_taller 
    AND ot.id_etapa_actual = v_id_etapa_actual
    AND h.es_actual = true
    AND (
        (p_es_devuelto = true AND ot.origen_reproceso = 'devolucion') OR 
        (p_es_devuelto = false AND (ot.origen_reproceso IS NULL OR ot.origen_reproceso != 'devolucion'))
    );

  IF v_numero_ordenes > 0 THEN
      v_horas_distribuidas := (EXTRACT(EPOCH FROM (now() - v_iniciado_en)) / 3600) / v_numero_ordenes;
  ELSE
      RETURN;
  END IF;

  -- 4. Cerrar historial del subconjunto
  UPDATE public.historial_ordenes_de_trabajo h
  SET completado_en = now(), es_actual = false, horas_invertidas = v_horas_distribuidas,
      id_usuario_actualizacion_etapa = p_id_usuario_actualizacion_etapa
  FROM public.ordenes_de_trabajo ot
  WHERE h.id_orden_trabajo = ot.id
    AND ot.id_pedido = p_id_pedido 
    AND ot.id_taller = p_id_taller
    AND ot.id_etapa_actual = v_id_etapa_actual
    AND h.es_actual = true
    AND (
        (p_es_devuelto = true AND ot.origen_reproceso = 'devolucion') OR 
        (p_es_devuelto = false AND (ot.origen_reproceso IS NULL OR ot.origen_reproceso != 'devolucion'))
    );

  -- 5. Avanzar órdenes
  IF v_codigo_etapa_siguiente = 'RECEPCION' THEN
     UPDATE public.ordenes_de_trabajo
     SET estado = 'completada'
     WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_etapa_actual = v_id_etapa_actual
       AND ((p_es_devuelto = true AND origen_reproceso = 'devolucion') OR (p_es_devuelto = false AND (origen_reproceso IS NULL OR origen_reproceso != 'devolucion')));
  ELSE
     UPDATE public.ordenes_de_trabajo
     SET id_etapa_actual = v_id_etapa_siguiente
     WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_etapa_actual = v_id_etapa_actual
       AND ((p_es_devuelto = true AND origen_reproceso = 'devolucion') OR (p_es_devuelto = false AND (origen_reproceso IS NULL OR origen_reproceso != 'devolucion')));

     FOR r_work_order IN
         SELECT id, id_trabajador_asignado FROM public.ordenes_de_trabajo
         WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_etapa_actual = v_id_etapa_siguiente
           AND ((p_es_devuelto = true AND origen_reproceso = 'devolucion') OR (p_es_devuelto = false AND (origen_reproceso IS NULL OR origen_reproceso != 'devolucion')))
     LOOP
         INSERT INTO public.historial_ordenes_de_trabajo (
             id_pedido, id_orden_trabajo, id_etapa, id_trabajador, id_usuario_actualizacion_etapa, es_actual, iniciado_en
         ) VALUES (
             p_id_pedido, r_work_order.id, v_id_etapa_siguiente, r_work_order.id_trabajador_asignado, p_id_usuario_actualizacion_etapa, true, now()
         );
     END LOOP;
  END IF;

  PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido);
END;
$$;


ALTER FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_id_etapa_recepcion UUID;
    v_numero_ordenes INTEGER;
    v_iniciado_en TIMESTAMPTZ;
    v_horas_distribuidas NUMERIC;
    r_orden_confeccion RECORD;
    v_new_work_order_id UUID;
BEGIN
    -- 1. Obtener ID de la etapa RECEPCIÓN
    SELECT id INTO v_id_etapa_recepcion FROM public.etapas WHERE codigo = 'RECEPCION' LIMIT 1;
    IF v_id_etapa_recepcion IS NULL THEN
        RAISE EXCEPTION 'Etapa de Recepción no encontrada';
    END IF;

    -- 2. Identificar qué órdenes están "activas" para este taller y pedido
    -- Pero MUY IMPORTANTE: Excluimos órdenes que YA están en la etapa de Recepción para evitar duplicados.
    CREATE TEMP TABLE IF NOT EXISTS temp_ot_activas_v4 (id_ot UUID) ON COMMIT DROP;
    TRUNCATE TABLE temp_ot_activas_v4;

    INSERT INTO temp_ot_activas_v4 (id_ot)
    SELECT ot.id 
    FROM public.ordenes_de_trabajo ot
    JOIN public.historial_ordenes_de_trabajo h ON ot.id = h.id_orden_trabajo
    WHERE ot.id_pedido = p_id_pedido 
      AND ot.id_taller = p_id_taller 
      AND h.es_actual = true
      AND ot.id_etapa_actual != v_id_etapa_recepcion; -- Filtro clave anti-duplicados

    -- 3. Calcular horas a distribuir (basado en el inicio más antiguo del lote que cerramos)
    SELECT count(*), min(iniciado_en)
    INTO v_numero_ordenes, v_iniciado_en
    FROM public.historial_ordenes_de_trabajo h
    JOIN temp_ot_activas_v4 toa ON h.id_orden_trabajo = toa.id_ot
    WHERE h.es_actual = true;
    
    IF v_numero_ordenes > 0 THEN
        v_horas_distribuidas := (EXTRACT(EPOCH FROM (now() - v_iniciado_en)) / 3600) / v_numero_ordenes;
    ELSE
        -- Si no hay órdenes para avanzar, terminamos silenciosamente
        RETURN;
    END IF;

    -- 4. PROCESAR LAS ÓRDENES (Primero crear la Recepción para asegurar la data)
    FOR r_orden_confeccion IN 
        SELECT ot.id_referencia, ot.id_talla, ot.cantidad_asignada, ot.id_taller, ot.origen_reproceso
        FROM public.ordenes_de_trabajo ot
        JOIN temp_ot_activas_v4 toa ON ot.id = toa.id_ot
    LOOP
        -- Insertar nueva orden en etapa RECEPCIÓN
        INSERT INTO public.ordenes_de_trabajo (
            id_pedido, 
            id_referencia, 
            id_talla, 
            cantidad_asignada, 
            id_etapa_actual, 
            id_trabajador_asignado,
            id_taller, 
            estado,
            creado_en,
            origen_reproceso
        ) VALUES (
            p_id_pedido,
            r_orden_confeccion.id_referencia,
            r_orden_confeccion.id_talla,
            r_orden_confeccion.cantidad_asignada, 
            v_id_etapa_recepcion,
            p_id_receptor_asignado,
            r_orden_confeccion.id_taller, 
            'pendiente', 
             now(),
             r_orden_confeccion.origen_reproceso
        )
        RETURNING id INTO v_new_work_order_id;
        
        -- Insertar historial inicial para esta nueva orden de recepción
        -- p_id_receptor_asignado es el trabajador asignado a la nueva etapa
        -- p_id_trabajador_logueado es quien hizo la acción (el administrador/supervisor)
        INSERT INTO public.historial_ordenes_de_trabajo (
            id_pedido,
            id_orden_trabajo,
            id_etapa,
            id_trabajador,
            id_usuario_actualizacion_etapa,
            es_actual,
            iniciado_en
        ) VALUES (
            p_id_pedido,
            v_new_work_order_id,
            v_id_etapa_recepcion,
            p_id_receptor_asignado,
            p_id_trabajador_logueado,
            true,
            now()
        );
    END LOOP;

    -- 5. CERRAR LAS ÓRDENES VIEJAS
    -- A. Marcar historial como completado
    UPDATE public.historial_ordenes_de_trabajo h
    SET
        completado_en = now(),
        es_actual = false,
        horas_invertidas = v_horas_distribuidas,
        id_usuario_actualizacion_etapa = p_id_trabajador_logueado
    FROM temp_ot_activas_v4 toa
    WHERE h.id_orden_trabajo = toa.id_ot AND h.es_actual = true;

    -- B. Marcar órdenes de trabajo físicas como completadas
    UPDATE public.ordenes_de_trabajo
    SET estado = 'completada', actualizado_en = now()
    WHERE id IN (SELECT id_ot FROM temp_ot_activas_v4);

    -- 6. Actualizar etapa general del pedido
    PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido);
END;
$$;


ALTER FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid", "p_id_etapa_origen" "uuid" DEFAULT NULL::"uuid", "p_es_devuelto" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_id_etapa_recepcion UUID;
    v_numero_ordenes INTEGER;
    v_iniciado_en TIMESTAMPTZ;
    v_horas_distribuidas NUMERIC;
    r_orden_confeccion RECORD;
    v_new_work_order_id UUID;
BEGIN
    -- Obtener ID de RECEPCIÓN
    SELECT id INTO v_id_etapa_recepcion FROM public.etapas WHERE codigo = 'RECEPCION' LIMIT 1;
    
    -- Tabla temporal para capturar SOLO lo que queremos avanzar
    CREATE TEMP TABLE IF NOT EXISTS temp_ot_activas_quirurgicas (id_ot UUID) ON COMMIT DROP;
    TRUNCATE TABLE temp_ot_activas_quirurgicas;

    INSERT INTO temp_ot_activas_quirurgicas (id_ot)
    SELECT ot.id 
    FROM public.ordenes_de_trabajo ot
    JOIN public.historial_ordenes_de_trabajo h ON ot.id = h.id_orden_trabajo
    WHERE ot.id_pedido = p_id_pedido 
      AND ot.id_taller = p_id_taller 
      AND h.es_actual = true
      AND ot.id_etapa_actual != v_id_etapa_recepcion
      -- FILTROS CLAVE PARA EVITAR MOVER LO QUE NO ES:
      AND (p_id_etapa_origen IS NULL OR ot.id_etapa_actual = p_id_etapa_origen)
      AND (
          (p_es_devuelto = true AND ot.origen_reproceso = 'devolucion') OR 
          (p_es_devuelto = false AND (ot.origen_reproceso IS NULL OR ot.origen_reproceso != 'devolucion'))
      );

    -- Calcular horas a distribuir
    SELECT count(*), min(iniciado_en)
    INTO v_numero_ordenes, v_iniciado_en
    FROM public.historial_ordenes_de_trabajo h
    JOIN temp_ot_activas_quirurgicas toa ON h.id_orden_trabajo = toa.id_ot
    WHERE h.es_actual = true;
    
    IF v_numero_ordenes > 0 THEN
        v_horas_distribuidas := (EXTRACT(EPOCH FROM (now() - v_iniciado_en)) / 3600) / v_numero_ordenes;
    ELSE
        RETURN; -- Nada que hacer
    END IF;

    -- CREAR RECEPCIÓN
    FOR r_orden_confeccion IN 
        SELECT ot.id_referencia, ot.id_talla, ot.cantidad_asignada, ot.id_taller, ot.origen_reproceso
        FROM public.ordenes_de_trabajo ot
        JOIN temp_ot_activas_quirurgicas toa ON ot.id = toa.id_ot
    LOOP
        INSERT INTO public.ordenes_de_trabajo (
            id_pedido, id_referencia, id_talla, cantidad_asignada, id_etapa_actual, 
            id_trabajador_asignado, id_taller, estado, creado_en, origen_reproceso
        ) VALUES (
            p_id_pedido, r_orden_confeccion.id_referencia, r_orden_confeccion.id_talla, 
            r_orden_confeccion.cantidad_asignada, v_id_etapa_recepcion,
            p_id_receptor_asignado, r_orden_confeccion.id_taller, 'pendiente', now(),
            r_orden_confeccion.origen_reproceso
        ) RETURNING id INTO v_new_work_order_id;
        
        INSERT INTO public.historial_ordenes_de_trabajo (
            id_pedido, id_orden_trabajo, id_etapa, id_trabajador, 
            id_usuario_actualizacion_etapa, es_actual, iniciado_en
        ) VALUES (
            p_id_pedido, v_new_work_order_id, v_id_etapa_recepcion, 
            p_id_receptor_asignado, p_id_trabajador_logueado, true, now()
        );
    END LOOP;

    -- CERRAR VIEJO
    UPDATE public.historial_ordenes_de_trabajo h
    SET completado_en = now(), es_actual = false, horas_invertidas = v_horas_distribuidas,
        id_usuario_actualizacion_etapa = p_id_trabajador_logueado
    FROM temp_ot_activas_quirurgicas toa
    WHERE h.id_orden_trabajo = toa.id_ot AND h.es_actual = true;

    UPDATE public.ordenes_de_trabajo
    SET estado = 'completada', actualizado_en = now()
    WHERE id IN (SELECT id_ot FROM temp_ot_activas_quirurgicas);

    PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido);
END;
$$;


ALTER FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avanzar_taller_a_revision_y_asignar_revisor"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_id_etapa_recepcion UUID;
    v_numero_ordenes INTEGER;
    v_iniciado_en TIMESTAMPTZ;
    v_horas_distribuidas NUMERIC;
    
    asignacion record;
    v_id_etapa_revision UUID;
    v_revisor_nombre TEXT;
    v_nueva_orden_trabajo_id UUID;
    v_primer_revisor_id UUID;
BEGIN
    -- 1. CERRAR RECEPCIÓN
    SELECT id INTO v_id_etapa_recepcion FROM public.etapas WHERE nombre = 'Recepción' LIMIT 1;

    SELECT count(*), min(h.iniciado_en) INTO v_numero_ordenes, v_iniciado_en
    FROM public.historial_ordenes_de_trabajo h
    JOIN public.ordenes_de_trabajo ot ON h.id_orden_trabajo = ot.id
    WHERE ot.id_pedido = p_id_pedido AND ot.id_taller = p_id_taller AND h.id_etapa = v_id_etapa_recepcion AND h.es_actual = true;

    IF v_numero_ordenes > 0 THEN
        v_horas_distribuidas := (EXTRACT(EPOCH FROM (now() - v_iniciado_en)) / 3600) / v_numero_ordenes;
    ELSE
        v_horas_distribuidas := 0;
    END IF;

    UPDATE public.historial_ordenes_de_trabajo h
    SET es_actual = false, completado_en = now(), horas_invertidas = v_horas_distribuidas, id_usuario_actualizacion_etapa = p_id_usuario_accion
    WHERE id_orden_trabajo IN (SELECT id FROM public.ordenes_de_trabajo WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller)
      AND h.id_etapa = v_id_etapa_recepcion AND h.es_actual = true;

    UPDATE public.ordenes_de_trabajo SET estado = 'completada', actualizado_en = now()
    WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_etapa_actual = v_id_etapa_recepcion;

    -- 2. ABRIR REVISIÓN
    SELECT id INTO v_id_etapa_revision FROM public.etapas WHERE nombre = 'Revisión' LIMIT 1;

    FOR asignacion IN SELECT * FROM jsonb_to_recordset(p_asignaciones_json) AS x(id_revisor uuid, id_referencia uuid, id_talla uuid, cantidad_a_revisar integer)
    LOOP
        IF v_primer_revisor_id IS NULL THEN v_primer_revisor_id := asignacion.id_revisor; END IF;

        BEGIN
            INSERT INTO public.ordenes_de_trabajo (id_pedido, id_taller, id_referencia, id_talla, cantidad_asignada, id_etapa_actual, id_trabajador_asignado, estado)
            VALUES (p_id_pedido, p_id_taller, asignacion.id_referencia, asignacion.id_talla, asignacion.cantidad_a_revisar, v_id_etapa_revision, asignacion.id_revisor, 'pendiente')
            RETURNING id INTO v_nueva_orden_trabajo_id;

            INSERT INTO public.historial_ordenes_de_trabajo (id_pedido, id_orden_trabajo, id_etapa, id_trabajador, id_usuario_actualizacion_etapa, es_actual)
            VALUES (p_id_pedido, v_nueva_orden_trabajo_id, v_id_etapa_revision, asignacion.id_revisor, p_id_usuario_accion, true);
        EXCEPTION WHEN unique_violation THEN
            SELECT id INTO v_nueva_orden_trabajo_id FROM public.ordenes_de_trabajo 
            WHERE id_pedido = p_id_pedido AND id_taller = p_id_taller AND id_referencia = asignacion.id_referencia AND id_talla = asignacion.id_talla AND id_etapa_actual = v_id_etapa_revision AND id_trabajador_asignado = asignacion.id_revisor AND estado = 'pendiente';

            UPDATE public.ordenes_de_trabajo SET cantidad_asignada = cantidad_asignada + asignacion.cantidad_a_revisar, actualizado_en = now() WHERE id = v_nueva_orden_trabajo_id;
        END;
    END LOOP;

    -- 3. ACTUALIZAR PEDIDO (Pasando primer revisor y usuario)
    PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido, v_primer_revisor_id, p_id_usuario_accion);
END;
$$;


ALTER FUNCTION "public"."avanzar_taller_a_revision_y_asignar_revisor"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calcular_tiempo_etapa_actual"("p_id_pedido" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."calcular_tiempo_etapa_actual"("p_id_pedido" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirmar_entrega_final_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_numero_ordenes INTEGER;
    v_iniciado_en TIMESTAMPTZ;
    v_horas_distribuidas NUMERIC;
    v_orden record;
BEGIN
    -- Calcular distribución para este taller en Entrega Final
    SELECT count(*), min(h.iniciado_en)
    INTO v_numero_ordenes, v_iniciado_en
    FROM public.ordenes_de_trabajo ot
    JOIN public.etapas e ON ot.id_etapa_actual = e.id
    JOIN public.historial_ordenes_de_trabajo h ON ot.id = h.id_orden_trabajo
    WHERE ot.id_pedido = p_id_pedido 
      AND ot.id_taller = p_id_taller
      AND e.codigo = 'ENTREGA'
      AND ot.estado != 'completada'
      AND h.es_actual = true;

    IF v_numero_ordenes > 0 THEN
        v_horas_distribuidas := (EXTRACT(EPOCH FROM (now() - v_iniciado_en)) / 3600) / v_numero_ordenes;
    ELSE
        v_horas_distribuidas := 0;
    END IF;

    -- Procesar todas las órdenes de ENTREGA pendientes
    FOR v_orden IN 
        SELECT ot.id
        FROM public.ordenes_de_trabajo ot
        JOIN public.etapas e ON ot.id_etapa_actual = e.id
        WHERE ot.id_pedido = p_id_pedido 
          AND ot.id_taller = p_id_taller
          AND e.codigo = 'ENTREGA'
          AND ot.estado != 'completada'
    LOOP
        -- 1. Marcar como completada
        UPDATE public.ordenes_de_trabajo 
        SET estado = 'completada', actualizado_en = NOW() 
        WHERE id = v_orden.id;

        -- 2. Cerrar historial con horas distribuidas
        UPDATE public.historial_ordenes_de_trabajo
        SET es_actual = false,
            completado_en = NOW(),
            horas_invertidas = v_horas_distribuidas,
            id_usuario_actualizacion_etapa = p_id_usuario_accion
        WHERE id_orden_trabajo = v_orden.id AND es_actual = true;
    END LOOP;

    -- 3. Actualizar estado global
    PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido, NULL, p_id_usuario_accion);
END;
$$;


ALTER FUNCTION "public"."confirmar_entrega_final_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirmar_resultados_planchado_batch"("p_resultados" "jsonb", "p_id_usuario_accion" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_resultado record;
    v_id_etapa_entrega UUID;
    v_orden_actual record;
    v_nueva_orden_trabajo_id UUID;
    
    v_numero_ordenes_batch INTEGER;
    v_iniciado_en_batch TIMESTAMPTZ;
    v_horas_distribuidas_batch NUMERIC;
BEGIN
    SELECT id INTO v_id_etapa_entrega FROM public.etapas WHERE codigo = 'ENTREGA' LIMIT 1;

    -- Calcular distribución para este lote de planchado
    SELECT count(*), min(h.iniciado_en)
    INTO v_numero_ordenes_batch, v_iniciado_en_batch
    FROM public.historial_ordenes_de_trabajo h
    WHERE h.id_orden_trabajo IN (SELECT (value->>'id_orden_trabajo')::UUID FROM jsonb_array_elements(p_resultados))
      AND h.es_actual = true;

    IF v_numero_ordenes_batch > 0 THEN
        v_horas_distribuidas_batch := (EXTRACT(EPOCH FROM (now() - v_iniciado_en_batch)) / 3600) / v_numero_ordenes_batch;
    ELSE
        v_horas_distribuidas_batch := 0;
    END IF;

    FOR v_resultado IN SELECT * FROM jsonb_to_recordset(p_resultados) AS x(id_orden_trabajo uuid, cantidad_planchada integer)
    LOOP
        SELECT * INTO v_orden_actual FROM public.ordenes_de_trabajo WHERE id = v_resultado.id_orden_trabajo;

        IF v_orden_actual.id IS NOT NULL THEN
            -- MODIFICACIÓN: Marcar asignado_sig_etapa = true ya que estamos creando la siguiente orden en el mismo batch
            UPDATE public.ordenes_de_trabajo 
            SET estado = 'completada', 
                actualizado_en = NOW(),
                asignado_sig_etapa = true
            WHERE id = v_resultado.id_orden_trabajo;

            UPDATE public.historial_ordenes_de_trabajo
            SET es_actual = false,
                completado_en = NOW(),
                horas_invertidas = v_horas_distribuidas_batch,
                id_usuario_actualizacion_etapa = p_id_usuario_accion
            WHERE id_orden_trabajo = v_resultado.id_orden_trabajo AND es_actual = true;

            IF v_id_etapa_entrega IS NOT NULL THEN
                INSERT INTO public.ordenes_de_trabajo (id_pedido, id_taller, id_referencia, id_talla, cantidad_asignada, id_etapa_actual, id_trabajador_asignado, estado, origen_reproceso)
                VALUES (v_orden_actual.id_pedido, v_orden_actual.id_taller, v_orden_actual.id_referencia, v_orden_actual.id_talla, v_resultado.cantidad_planchada, v_id_etapa_entrega, v_orden_actual.id_trabajador_asignado, 'pendiente', v_orden_actual.origen_reproceso)
                RETURNING id INTO v_nueva_orden_trabajo_id;

                INSERT INTO public.historial_ordenes_de_trabajo (id_pedido, id_orden_trabajo, id_etapa, id_trabajador, id_usuario_actualizacion_etapa, es_actual, iniciado_en)
                VALUES (v_orden_actual.id_pedido, v_nueva_orden_trabajo_id, v_id_etapa_entrega, v_orden_actual.id_trabajador_asignado, p_id_usuario_accion, true, NOW());
            END IF;
        END IF;
    END LOOP;

    PERFORM public.actualizar_etapa_pedido_principal(v_orden_actual.id_pedido, NULL, p_id_usuario_accion);
END;
$$;


ALTER FUNCTION "public"."confirmar_resultados_planchado_batch"("p_resultados" "jsonb", "p_id_usuario_accion" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirmar_resultados_revision_batch"("p_revisiones" "jsonb", "p_id_usuario_accion" "uuid", "p_notas" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_item JSONB;
    v_id_orden_trabajo UUID;
    v_id_pedido UUID;
    v_aprobada INTEGER;
    v_reparacion INTEGER;
    v_descarte INTEGER;
    
    v_ot_original public.ordenes_de_trabajo;
    v_id_etapa_confeccion UUID;
    v_id_etapa_revision UUID; 
    v_new_ot_id UUID;

    v_numero_ordenes_batch INTEGER;
    v_iniciado_en_batch TIMESTAMPTZ;
    v_horas_distribuidas_batch NUMERIC;
BEGIN
    -- Obtener IDs de etapas necesarias
    SELECT id INTO v_id_etapa_confeccion FROM public.etapas WHERE nombre = 'Confección' LIMIT 1;
    SELECT id INTO v_id_etapa_revision FROM public.etapas WHERE nombre = 'Revisión' LIMIT 1;

    -- 1. CALCULAR DISTRIBUCIÓN DE HORAS (Proporcional entre las órdenes del batch)
    SELECT count(*), min(h.iniciado_en) INTO v_numero_ordenes_batch, v_iniciado_en_batch
    FROM public.historial_ordenes_de_trabajo h
    WHERE h.id_orden_trabajo IN (SELECT (value->>'id_orden_trabajo')::UUID FROM jsonb_array_elements(p_revisiones))
      AND h.es_actual = true;

    IF v_numero_ordenes_batch > 0 THEN
        v_horas_distribuidas_batch := (EXTRACT(EPOCH FROM (now() - v_iniciado_en_batch)) / 3600) / v_numero_ordenes_batch;
    ELSE
        v_horas_distribuidas_batch := 0;
    END IF;

    -- 2. PROCESAR EL BATCH
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_revisiones)
    LOOP
        v_id_orden_trabajo := (v_item->>'id_orden_trabajo')::UUID;
        v_aprobada := COALESCE((v_item->>'aprobada')::INTEGER, 0);
        v_reparacion := COALESCE((v_item->>'reparacion')::INTEGER, 0);
        v_descarte := COALESCE((v_item->>'descarte')::INTEGER, 0);

        -- Obtener datos de la orden original (la que se está revisando)
        SELECT * INTO v_ot_original FROM public.ordenes_de_trabajo WHERE id = v_id_orden_trabajo;
        v_id_pedido := v_ot_original.id_pedido;

        -- A. Cerrar el historial actual de la orden de Revisión
        UPDATE public.historial_ordenes_de_trabajo
        SET es_actual = false,
            completado_en = now(),
            horas_invertidas = v_horas_distribuidas_batch,
            id_usuario_actualizacion_etapa = p_id_usuario_accion
        WHERE id_orden_trabajo = v_id_orden_trabajo AND es_actual = true;

        -- B. ACTUALIZAR LA ORDEN ORIGINAL: Ajustamos la cantidad a lo que realmente se aprobó
        -- Esto evita duplicidad de conteos al crear los hijos de reparación y descarte.
        UPDATE public.ordenes_de_trabajo 
        SET estado = 'completada',
            cantidad_asignada = v_aprobada,
            actualizado_en = now()
        WHERE id = v_id_orden_trabajo;

        -- C. CREAR ORDEN DE REPARACIÓN INTERNA (Arreglos menores)
        -- SE ASIGNA AL REVISOR QUE LAS ENCONTRÓ (v_ot_original.id_trabajador_asignado)
        IF v_reparacion > 0 THEN
            INSERT INTO public.ordenes_de_trabajo (
                id_pedido, id_taller, id_referencia, id_talla, 
                cantidad_asignada, id_etapa_actual, estado, 
                origen_reproceso, id_trabajador_asignado
            )
            VALUES (
                v_id_pedido, v_ot_original.id_taller, v_ot_original.id_referencia, v_ot_original.id_talla, 
                v_reparacion, v_id_etapa_revision, 'reparacion_interna', 
                'reparacion', v_ot_original.id_trabajador_asignado
            )
            RETURNING id INTO v_new_ot_id;

            INSERT INTO public.historial_ordenes_de_trabajo (
                id_pedido, id_orden_trabajo, id_etapa, id_trabajador, 
                id_usuario_actualizacion_etapa, es_actual, notas, iniciado_en
            )
            VALUES (
                v_id_pedido, v_new_ot_id, v_id_etapa_revision, v_ot_original.id_trabajador_asignado, 
                p_id_usuario_accion, true, 'Arreglo menor detectado en revisión', now()
            );
        END IF;

        -- D. CREAR ORDEN DE DEVOLUCIÓN AL TALLER (Reproceso de Confección)
        IF v_descarte > 0 THEN
            INSERT INTO public.ordenes_de_trabajo (
                id_pedido, id_taller, id_referencia, id_talla, 
                cantidad_asignada, id_etapa_actual, estado, origen_reproceso
            )
            VALUES (
                v_id_pedido, v_ot_original.id_taller, v_ot_original.id_referencia, v_ot_original.id_talla, 
                v_descarte, v_id_etapa_confeccion, 'devuelto', 'devolucion'
            )
            RETURNING id INTO v_new_ot_id;

            INSERT INTO public.historial_ordenes_de_trabajo (
                id_pedido, id_orden_trabajo, id_etapa, 
                id_usuario_actualizacion_etapa, es_actual, notas, iniciado_en
            )
            VALUES (
                v_id_pedido, v_new_ot_id, v_id_etapa_confeccion, 
                p_id_usuario_accion, true, 'Devuelto al taller por fallas de calidad', now()
            );
        END IF;
    END LOOP;
    
    -- Actualizar el estado global del pedido para reflejar los cambios en las órdenes
    PERFORM public.actualizar_etapa_pedido_principal(v_id_pedido);
END;
$$;


ALTER FUNCTION "public"."confirmar_resultados_revision_batch"("p_revisiones" "jsonb", "p_id_usuario_accion" "uuid", "p_notas" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_historial_inicial"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO public.historial_etapas_pedido (id_pedido, id_etapa, es_actual, id_trabajador)
    VALUES (NEW.id, NEW.id_etapa_actual, true, NEW.id_trabajador_actual);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."crear_historial_inicial"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    asignacion RECORD;
    v_id_etapa_confeccion UUID;
    v_cantidad_total_pedido INT;
    v_cantidad_total_asignada INT := 0;
    v_nueva_ot_id UUID;
BEGIN
    -- 1. Obtener ID de la etapa 'Confección'
    SELECT id INTO v_id_etapa_confeccion FROM public.etapas WHERE nombre = 'Confección' LIMIT 1;
    IF v_id_etapa_confeccion IS NULL THEN
        RAISE EXCEPTION 'La etapa "Confección" no fue encontrada.';
    END IF;

    -- 2. Validar que las cantidades coincidan
    SELECT total_unidades INTO v_cantidad_total_pedido FROM public.pedidos WHERE id = p_id_pedido;
    FOR asignacion IN SELECT * FROM jsonb_to_recordset(p_asignaciones) AS x(cantidad INT) LOOP
        v_cantidad_total_asignada := v_cantidad_total_asignada + asignacion.cantidad;
    END LOOP;
    IF v_cantidad_total_pedido != v_cantidad_total_asignada THEN
        RAISE EXCEPTION 'La suma de las cantidades asignadas (%) no coincide con el total de unidades del pedido (%).', v_cantidad_total_asignada, v_cantidad_total_pedido;
    END IF;

    -- 3. Crear las órdenes de trabajo e historiales
    FOR asignacion IN SELECT * FROM jsonb_to_recordset(p_asignaciones) AS x(id_taller UUID, id_referencia UUID, id_talla UUID, cantidad INT) LOOP
        -- Insertar la nueva orden de trabajo.
        INSERT INTO public.ordenes_de_trabajo (
            id_pedido, id_taller, id_referencia, id_talla, cantidad_asignada, id_etapa_actual
        ) VALUES (
            p_id_pedido, asignacion.id_taller, asignacion.id_referencia, asignacion.id_talla,
            asignacion.cantidad, v_id_etapa_confeccion
        )
        RETURNING id INTO v_nueva_ot_id; -- Obtener el ID de la nueva OT

        -- Crear el historial para esta nueva orden de trabajo
        INSERT INTO public.historial_ordenes_de_trabajo (
            id_pedido, id_orden_trabajo, id_etapa, id_trabajador, id_usuario_actualizacion_etapa, es_actual
        ) VALUES (
            p_id_pedido,
            v_nueva_ot_id,
            v_id_etapa_confeccion,
            p_id_trabajador_accion,       -- ID del trabajador
            p_id_usuario_autenticacion,   -- ID del usuario de autenticación
            true
        );
    END LOOP;

    -- 4. Avanzar la etapa del pedido principal usando la función existente
    PERFORM public.avanzar_etapa_pedido(
      jsonb_build_object(
        'p_id_pedido', p_id_pedido,
        'p_notas', 'Producción asignada a talleres.',
        'p_id_usuario_actualizacion_etapa', p_id_usuario_autenticacion,
        'p_id_trabajador', p_id_trabajador_accion -- Usar el trabajador que realiza la acción
      )
    );

END;
$$;


ALTER FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid", "p_id_etapa" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
 DECLARE
     asignacion RECORD;
     v_id_etapa_final uuid;
     v_cantidad_total_pedido INT;
     v_cantidad_total_asignada INT := 0;
     v_nueva_ot_id UUID;
 BEGIN
     -- 1. Determinar la etapa a usar
     IF p_id_etapa IS NULL THEN
         SELECT id INTO v_id_etapa_final FROM public.etapas WHERE nombre = 'Confección' LIMIT 1;
     ELSE
         v_id_etapa_final := p_id_etapa;
     END IF;
 
     IF v_id_etapa_final IS NULL THEN
         RAISE EXCEPTION 'La etapa de destino no fue encontrada.';
     END IF;
 
     -- 2. Validar que las cantidades coincidan (Solo para seguridad)
     -- Nota: Se asume que el frontend ya validó que las cantidades por referencia/talla son correctas
 
     -- 3. Crear las órdenes de trabajo e historiales
     FOR asignacion IN SELECT * FROM jsonb_to_recordset(p_asignaciones) AS x(id_taller UUID, id_referencia UUID, id_talla UUID, cantidad INT) LOOP
         -- Insertar la nueva orden de trabajo.
         INSERT INTO public.ordenes_de_trabajo (
             id_pedido, id_taller, id_referencia, id_talla, cantidad_asignada, id_etapa_actual
         ) VALUES (
             p_id_pedido, asignacion.id_taller, asignacion.id_referencia, asignacion.id_talla,
             asignacion.cantidad, v_id_etapa_final
         )
         RETURNING id INTO v_nueva_ot_id;
 
         -- Crear el historial para esta nueva orden de trabajo
         INSERT INTO public.historial_ordenes_de_trabajo (
             id_pedido, id_orden_trabajo, id_etapa, id_trabajador, id_usuario_actualizacion_etapa, es_actual
         ) VALUES (
             p_id_pedido,
             v_nueva_ot_id,
             v_id_etapa_final,
             p_id_trabajador_accion,
             p_id_usuario_autenticacion,
             true
         );
     END LOOP;
 
     -- 4. Actualizar el estado del pedido principal basado en el cuello de botella
     -- Usamos actualizar_etapa_pedido_principal porque es más inteligente que avanzar_etapa_pedido (index+1)
     PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido, p_id_trabajador_accion, p_id_usuario_autenticacion);
 
 END;
 $$;


ALTER FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid", "p_id_etapa" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_id_pedido UUID;
    v_id_estado_en_proceso UUID;
    v_id_etapa_ingreso UUID;
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

    -- Insertar el pedido principal, AÑADIENDO la etapa actual (sin id_taller_asignado)
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
$$;


ALTER FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb", "p_id_creador" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_id_pedido UUID;
    v_id_estado_en_proceso UUID;
    v_id_etapa_ingreso UUID;
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

    -- Insertar el pedido principal
    -- Se incluye id_trabajador_actual con el p_id_creador
    INSERT INTO public.pedidos (id_cliente, id_prioridad, id_estado, total_unidades, id_etapa_actual, id_trabajador_actual)
    VALUES (p_id_cliente, p_id_prioridad, v_id_estado_en_proceso, v_total_unidades, v_id_etapa_ingreso, p_id_creador)
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
$$;


ALTER FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb", "p_id_creador" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_cantidades_disponibles_para_etapa"("p_id_pedido" "uuid", "p_nombre_etapa" "text", "p_filtro_taller" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id_referencia" "uuid", "nombre_referencia" character varying, "imagen_url" "text", "id_talla" "uuid", "nombre_talla" character varying, "cantidad" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_codigo_destino text;
BEGIN
    -- Detección de etapa destino
    IF p_nombre_etapa ILIKE '%Confecc%' THEN
        v_codigo_destino := 'CONFECCION';
    ELSIF p_nombre_etapa ILIKE '%Ojal%' THEN
        v_codigo_destino := 'OJAL_BOTON';
    ELSIF p_nombre_etapa ILIKE '%Planchado%' THEN
        v_codigo_destino := 'PLANCHADO';
    ELSE
        RETURN;
    END IF;

    -- ==========================================
    -- CONFECCION
    -- ==========================================
    IF v_codigo_destino = 'CONFECCION' THEN
         RETURN QUERY
        SELECT 
            vdp.id_referencia, 
            vdp.nombre_referencia::varchar, 
            vdp.imagen_url, 
            vdp.id_talla, 
            vdp.nombre_talla::varchar,
            (vdp.cantidad - COALESCE(asignadas.total, 0))::bigint
        FROM public.vista_detalles_pedido vdp
        LEFT JOIN (
            SELECT ot.id_referencia, ot.id_talla, SUM(ot.cantidad_asignada) as total
            FROM public.ordenes_de_trabajo ot
            JOIN public.etapas e ON ot.id_etapa_actual = e.id
            WHERE ot.id_pedido = p_id_pedido AND e.codigo = 'CONFECCION'
            GROUP BY ot.id_referencia, ot.id_talla
        ) asignadas ON vdp.id_referencia = asignadas.id_referencia AND vdp.id_talla = asignadas.id_talla
        WHERE vdp.id_pedido = p_id_pedido;

    -- ==========================================
    -- OJAL Y BOTON (Fuente: solo Revisión)
    -- ==========================================
    ELSIF v_codigo_destino = 'OJAL_BOTON' THEN
        RETURN QUERY
        SELECT 
            ref.id, ref.nombre::varchar, ref.imagen_url, t.id, t.nombre::varchar,
            (COALESCE(aprobadas.total, 0) - COALESCE(ya_asignadas.total, 0))::bigint
        FROM (
            SELECT ot.id_referencia, ot.id_talla, SUM(ot.cantidad_asignada) as total
            FROM public.ordenes_de_trabajo ot
            JOIN public.etapas e ON ot.id_etapa_actual = e.id
            WHERE ot.id_pedido = p_id_pedido AND e.codigo = 'REVISION' AND ot.estado = 'completada'
            GROUP BY ot.id_referencia, ot.id_talla
        ) aprobadas
        JOIN public.referencias ref ON aprobadas.id_referencia = ref.id
        JOIN public.tallas t ON aprobadas.id_talla = t.id
        LEFT JOIN (
            SELECT ot.id_referencia, ot.id_talla, SUM(ot.cantidad_asignada) as total
            FROM public.ordenes_de_trabajo ot
            JOIN public.etapas e ON ot.id_etapa_actual = e.id
            WHERE ot.id_pedido = p_id_pedido AND e.indice_orden >= (SELECT indice_orden FROM public.etapas WHERE codigo = 'OJAL_BOTON')
            GROUP BY ot.id_referencia, ot.id_talla
        ) ya_asignadas ON aprobadas.id_referencia = ya_asignadas.id_referencia AND aprobadas.id_talla = ya_asignadas.id_talla
        WHERE (COALESCE(aprobadas.total, 0) - COALESCE(ya_asignadas.total, 0)) > 0;

    -- ==========================================
    -- PLANCHADO Y EMPAQUE (Fuente: Ojal Activo O Revisión Directa)
    -- ==========================================
    ELSIF v_codigo_destino = 'PLANCHADO' THEN
        RETURN QUERY
        SELECT 
            ref.id, ref.nombre::varchar, ref.imagen_url, t.id, t.nombre::varchar,
            SUM(fuente.cantidad)::bigint
        FROM (
            -- 1. Desde OJAL (Activos)
            SELECT ot.id_referencia, ot.id_talla, ot.cantidad_asignada as cantidad
            FROM public.ordenes_de_trabajo ot
            JOIN public.etapas e ON ot.id_etapa_actual = e.id
            WHERE ot.id_pedido = p_id_pedido 
              AND e.codigo = 'OJAL_BOTON'
              AND ot.estado NOT IN ('completada', 'cancelada')
              -- Si hay filtro, se aplica estrictamente aquí
              AND (p_filtro_taller IS NULL OR ot.id_taller = p_filtro_taller)

            UNION ALL

            -- 2. Desde REVISIÓN (Directo, solo si no hay filtro de taller o el filtro es irrelevante para esta ruta)
            -- Nota: Si el usuario filtra por un taller específico de Ojal, probablemente NO quiere ver lo de revisión directa.
            -- Pero para ser seguros, solo mostraremos Revisión si p_filtro_taller ES NULL.
            SELECT 
                r_aprob.id_referencia, 
                r_aprob.id_talla, 
                (r_aprob.total - COALESCE(r_ya.total, 0)) as cantidad
            FROM (
                SELECT ot.id_referencia, ot.id_talla, SUM(ot.cantidad_asignada) as total
                FROM public.ordenes_de_trabajo ot
                JOIN public.etapas e ON ot.id_etapa_actual = e.id
                WHERE ot.id_pedido = p_id_pedido AND e.codigo = 'REVISION' AND ot.estado = 'completada'
                GROUP BY ot.id_referencia, ot.id_talla
            ) r_aprob
            LEFT JOIN (
                SELECT ot.id_referencia, ot.id_talla, SUM(ot.cantidad_asignada) as total
                FROM public.ordenes_de_trabajo ot
                JOIN public.etapas e ON ot.id_etapa_actual = e.id
                WHERE ot.id_pedido = p_id_pedido AND e.indice_orden > (SELECT indice_orden FROM public.etapas WHERE codigo = 'REVISION')
                GROUP BY ot.id_referencia, ot.id_talla
            ) r_ya ON r_aprob.id_referencia = r_ya.id_referencia AND r_aprob.id_talla = r_ya.id_talla
            WHERE (r_aprob.total - COALESCE(r_ya.total, 0)) > 0
              AND p_filtro_taller IS NULL -- Solo mostrar ruta directa si no estamos filtrando por un taller específico de Ojal
        ) fuente
        JOIN public.referencias ref ON fuente.id_referencia = ref.id
        JOIN public.tallas t ON fuente.id_talla = t.id
        GROUP BY ref.id, ref.nombre, ref.imagen_url, t.id, t.nombre;

    ELSE
        RETURN;
    END IF;
END;
$$;


ALTER FUNCTION "public"."obtener_cantidades_disponibles_para_etapa"("p_id_pedido" "uuid", "p_nombre_etapa" "text", "p_filtro_taller" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_estado_talleres_por_pedido"("p_id_pedido" "uuid") RETURNS TABLE("id_taller" "uuid", "nombre_taller" "text", "etapa_actual_id" "uuid", "etapa_actual_nombre" "text", "etapa_actual_codigo" "text", "etapa_actual_indice" integer, "siguiente_etapa_nombre" "text", "total_prendas" bigint, "es_devuelto" boolean)
    LANGUAGE "sql"
    AS $$
    SELECT
      odt.id_taller,
      t.nombre as nombre_taller,
      e.id AS etapa_actual_id,
      e.nombre AS etapa_actual_nombre,
      e.codigo AS etapa_actual_codigo,
      e.indice_orden AS etapa_actual_indice,
      (SELECT nombre FROM public.etapas WHERE indice_orden = e.indice_orden + 1 LIMIT 1) AS siguiente_etapa_nombre,
      SUM(odt.cantidad_asignada) as total_prendas,
      (COALESCE(odt.origen_reproceso, '') = 'devolucion') as es_devuelto
    FROM public.ordenes_de_trabajo odt
    JOIN public.etapas e ON odt.id_etapa_actual = e.id
    JOIN public.talleres t ON odt.id_taller = t.id
    WHERE odt.id_pedido = p_id_pedido 
      AND (
        -- Regla 1: Mostrar siempre si tiene trabajo pendiente
        odt.estado NOT IN ('completada', 'cancelada')
        OR 
        -- Regla 2: Mostrar Revisión completada SOLO si sus piezas NO han pasado a la siguiente etapa
        (
          e.codigo = 'REVISION' 
          AND odt.estado = 'completada'
          AND odt.asignado_sig_etapa = false
        )
        OR
        -- Regla 3: Mostrar Planchado completado SOLO si sus piezas NO han pasado a la siguiente etapa (NUEVO)
        (
          e.codigo = 'PLANCHADO' 
          AND odt.estado = 'completada'
          AND odt.asignado_sig_etapa = false
        )
      )
    GROUP BY odt.id_taller, t.nombre, e.id, e.nombre, e.codigo, e.indice_orden, (COALESCE(odt.origen_reproceso, '') = 'devolucion')
    ORDER BY t.nombre ASC, es_devuelto DESC, etapa_actual_indice ASC;
$$;


ALTER FUNCTION "public"."obtener_estado_talleres_por_pedido"("p_id_pedido" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_tiempos_etapas"("p_fecha_inicio" "date" DEFAULT NULL::"date", "p_fecha_fin" "date" DEFAULT NULL::"date") RETURNS TABLE("stage" "text", "avgtime" numeric, "realtime" numeric, "efficiency" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    WITH order_stage_totals AS (
        -- Sum durations for the same stage within the same order (handles reprocesos)
        SELECT
            h.id_pedido,
            h.id_etapa,
            SUM(COALESCE(h.horas_invertidas, 
                CASE 
                    WHEN h.es_actual = true THEN EXTRACT(EPOCH FROM (now() - h.iniciado_en)) / 3600
                    ELSE 0 
                END
            )) AS total_duration_hours
        FROM
            public.historial_etapas_pedido h
        INNER JOIN public.pedidos p ON h.id_pedido = p.id
        WHERE
            (p_fecha_inicio IS NULL OR p.creado_en::date >= p_fecha_inicio) AND
            (p_fecha_fin IS NULL OR p.creado_en::date <= p_fecha_fin)
        GROUP BY
            h.id_pedido, h.id_etapa
    ),
    avg_stage_durations AS (
        -- Calculate the average total duration for each stage across all orders
        SELECT
            ost.id_etapa,
            AVG(ost.total_duration_hours) as avg_duration
        FROM
            order_stage_totals ost
        GROUP BY
            ost.id_etapa
    )
    -- Final selection and calculations
    SELECT
        e.nombre AS stage,
        COALESCE(e.tiempo_promedio_horas, 0) AS avgtime,
        COALESCE(asd.avg_duration, 0) AS realtime,
        CASE
            WHEN COALESCE(e.tiempo_promedio_horas, 0) <= 0 THEN 0
            WHEN COALESCE(asd.avg_duration, 0) <= 0 THEN 100
            ELSE (e.tiempo_promedio_horas / asd.avg_duration) * 100
        END AS efficiency
    FROM
        public.etapas e
    LEFT JOIN
        avg_stage_durations asd ON e.id = asd.id_etapa
    ORDER BY
        e.indice_orden;
END;
$$;


ALTER FUNCTION "public"."obtener_tiempos_etapas"("p_fecha_inicio" "date", "p_fecha_fin" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_valores_enum"("enum_type_name" "text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  enum_values json;
BEGIN
  EXECUTE format('SELECT array_to_json(enum_range(NULL::%s))', enum_type_name)
  INTO enum_values;
  RETURN enum_values;
END;
$$;


ALTER FUNCTION "public"."obtener_valores_enum"("enum_type_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."procesar_recepcion_taller"("p_id_pedido" "uuid", "p_id_usuario_receptor" "uuid", "p_recepciones" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    r_recepcion RECORD;
    v_id_orden_trabajo UUID;
    v_cantidad_recibida INTEGER;
    v_completa BOOLEAN;
    v_cantidad_original INTEGER;
    v_diferencia INTEGER;
BEGIN
    -- NOTA: Usamos comillas dobles en "cantidadRecibida" para respetar el CamelCase del JSON que envía el frontend
    FOR r_recepcion IN SELECT * FROM jsonb_to_recordset(p_recepciones) AS x(id_orden_trabajo UUID, completa BOOLEAN, "cantidadRecibida" INTEGER)
    LOOP
        v_id_orden_trabajo := r_recepcion.id_orden_trabajo;
        v_completa := r_recepcion.completa;
        -- Accedemos usando el nombre sensible a mayúsculas
        v_cantidad_recibida := r_recepcion."cantidadRecibida";

        -- Obtener la cantidad asignada original
        SELECT cantidad_asignada INTO v_cantidad_original
        FROM public.ordenes_de_trabajo
        WHERE id = v_id_orden_trabajo;

        -- Calcular diferencia real
        IF v_completa THEN
            v_cantidad_recibida := v_cantidad_original;
            v_diferencia := 0;
        ELSE
            IF v_cantidad_recibida IS NULL THEN
                 v_cantidad_recibida := 0; 
            END IF;
            v_diferencia := v_cantidad_original - v_cantidad_recibida;
        END IF;

        IF v_diferencia > 0 THEN
            -- HUBO FALTANTE
            UPDATE public.ordenes_de_trabajo
            SET cantidad_asignada = v_cantidad_recibida, 
                estado = 'recibida_incompleta'
            WHERE id = v_id_orden_trabajo;

            -- Registrar el faltante
            INSERT INTO public.recepciones_taller_detalle (
                id_pedido,
                id_orden_trabajo,
                id_usuario_receptor, 
                cantidad_esperada,
                cantidad_recibida,
                cantidad_faltante,
                recibido_completo,
                creado_en
            ) VALUES (
                p_id_pedido,
                v_id_orden_trabajo,
                p_id_usuario_receptor, 
                v_cantidad_original,
                v_cantidad_recibida,
                v_diferencia,
                v_completa,
                now()
            );
            
            -- Actualizar total unidades pedido
            UPDATE public.pedidos
            SET total_unidades = total_unidades - v_diferencia
            WHERE id = p_id_pedido;

        ELSE
            -- RECEPCIÓN COMPLETA
            UPDATE public.ordenes_de_trabajo
            SET estado = 'recibida'
            WHERE id = v_id_orden_trabajo;
        END IF;
        
    END LOOP;
    
    PERFORM public.actualizar_etapa_pedido_principal(p_id_pedido);
END;
$$;


ALTER FUNCTION "public"."procesar_recepcion_taller"("p_id_pedido" "uuid", "p_id_usuario_receptor" "uuid", "p_recepciones" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."procesar_revision_ot"("p_id_orden_trabajo_revision" "uuid", "p_id_usuario_revisor" "uuid", "p_cantidad_aprobada" integer, "p_cantidad_corregida_internamente" integer, "p_cantidad_devuelta_taller" integer, "p_observaciones_devolucion" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_ot_revision public.ordenes_de_trabajo;
    v_id_etapa_revision UUID;
    v_id_etapa_ojal_boton UUID;
    v_id_etapa_confeccion UUID;
    v_cantidad_total_revisada INT;
BEGIN
    -- 1. Obtener IDs de etapas
    SELECT id INTO v_id_etapa_revision FROM public.etapas WHERE nombre = 'Revisión' LIMIT 1;
    SELECT id INTO v_id_etapa_ojal_boton FROM public.etapas WHERE nombre = 'Ojal y Botón' LIMIT 1;
    SELECT id INTO v_id_etapa_confeccion FROM public.etapas WHERE nombre = 'Confección' LIMIT 1;

    -- 2. Validar la orden de trabajo de revisión
    -- Se asume que la OT a revisar se pone 'en_progreso' al abrir el modal en el frontend
    SELECT * INTO v_ot_revision
    FROM public.ordenes_de_trabajo
    WHERE id = p_id_orden_trabajo_revision AND id_etapa_actual = v_id_etapa_revision AND estado = 'en_progreso';

    IF v_ot_revision IS NULL THEN
        RAISE EXCEPTION 'Orden de trabajo de revisión no válida, no encontrada o no está "en progreso".';
    END IF;

    -- 3. Validar cantidades
    v_cantidad_total_revisada := p_cantidad_aprobada + p_cantidad_corregida_internamente + p_cantidad_devuelta_taller;
    IF v_cantidad_total_revisada != v_ot_revision.cantidad_asignada THEN
        RAISE EXCEPTION 'La suma de cantidades revisadas (%) no coincide con la cantidad asignada (%)', v_cantidad_total_revisada, v_ot_revision.cantidad_asignada;
    END IF;

    -- 4. Registrar el detalle de la revisión
    INSERT INTO public.revisiones_detalle (
        id_pedido,
        id_referencia,
        id_talla,
        cantidad_aprobada,
        cantidad_corregida_internamente,
        cantidad_devuelta_taller,
        id_usuario_revisor,
        observaciones_devolucion,
        id_orden_trabajo_origen
    )
    VALUES (
        v_ot_revision.id_pedido,
        v_ot_revision.id_referencia,
        v_ot_revision.id_talla,
        p_cantidad_aprobada,
        p_cantidad_corregida_internamente,
        p_cantidad_devuelta_taller,
        p_id_usuario_revisor,
        p_observaciones_devolucion,
        p_id_orden_trabajo_revision
    );

    -- 5. Marcar la orden de trabajo de revisión como completada
    UPDATE public.ordenes_de_trabajo
    SET estado = 'completada', actualizado_en = now()
    WHERE id = p_id_orden_trabajo_revision;

    -- 6. Crear nueva orden de trabajo para lo aprobado y corregido (si aplica)
    IF p_cantidad_aprobada + p_cantidad_corregida_internamente > 0 THEN
        INSERT INTO public.ordenes_de_trabajo (
            id_pedido, id_taller, id_referencia, id_talla, cantidad_asignada, id_etapa_actual, estado
        ) VALUES (
            v_ot_revision.id_pedido,
            v_ot_revision.id_taller,
            v_ot_revision.id_referencia,
            v_ot_revision.id_talla,
            p_cantidad_aprobada + p_cantidad_corregida_internamente,
            v_id_etapa_ojal_boton,
            'pendiente'
        );
    END IF;

    -- 7. Crear nueva orden de trabajo para lo devuelto al taller (si aplica)
    IF p_cantidad_devuelta_taller > 0 THEN
        INSERT INTO public.ordenes_de_trabajo (
            id_pedido, id_taller, id_referencia, id_talla, cantidad_asignada, id_etapa_actual, estado
        ) VALUES (
            v_ot_revision.id_pedido,
            v_ot_revision.id_taller,
            v_ot_revision.id_referencia,
            v_ot_revision.id_talla,
            p_cantidad_devuelta_taller,
            v_id_etapa_confeccion,
            'pendiente'
        );
    END IF;

END;
$$;


ALTER FUNCTION "public"."procesar_revision_ot"("p_id_orden_trabajo_revision" "uuid", "p_id_usuario_revisor" "uuid", "p_cantidad_aprobada" integer, "p_cantidad_corregida_internamente" integer, "p_cantidad_devuelta_taller" integer, "p_observaciones_devolucion" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."procesar_revision_pedido"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_revisor" "uuid", "p_id_usuario_accion" "uuid", "p_revisiones_detalle" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    rev_detail record;
    v_id_etapa_revision UUID;
    v_ot_original public.ordenes_de_trabajo;
    v_revisor_nombre TEXT;
    v_referencia_nombre TEXT;
    v_talla_nombre TEXT;
BEGIN
    -- 1. Obtener el ID de la etapa de "Revisión"
    SELECT id INTO v_id_etapa_revision FROM public.etapas WHERE nombre = 'Revisión' LIMIT 1;
    IF v_id_etapa_revision IS NULL THEN
        RAISE EXCEPTION 'La etapa "Revisión" no se encuentra en la tabla de etapas.';
    END IF;

    -- Obtener nombre del revisor para el historial
    SELECT nombre_trabajador INTO v_revisor_nombre FROM public.trabajadores WHERE id = p_id_revisor;

    -- 2. Iterar sobre los detalles de revisión proporcionados en el JSON
    FOR rev_detail IN 
        SELECT * FROM jsonb_to_recordset(p_revisiones_detalle) AS x(
            id_orden_trabajo UUID, 
            id_referencia UUID, 
            cantidad_a_revisar INT, 
            id_talla UUID
        )
    LOOP
        -- 3. Obtener y bloquear la orden de trabajo original para evitar condiciones de carrera
        SELECT * INTO v_ot_original
        FROM public.ordenes_de_trabajo
        WHERE id = rev_detail.id_orden_trabajo
        FOR UPDATE;

        -- 4. Validar la orden de trabajo original
        IF v_ot_original IS NULL THEN
            RAISE WARNING 'No se encontró la orden de trabajo original con ID %', rev_detail.id_orden_trabajo;
            CONTINUE; -- Saltar a la siguiente iteración si no se encuentra la OT
        END IF;

        IF v_ot_original.cantidad_asignada < rev_detail.cantidad_a_revisar THEN
            RAISE EXCEPTION 'La cantidad a revisar (%) para la OT % excede la cantidad disponible (%)',
                rev_detail.cantidad_a_revisar, v_ot_original.id, v_ot_original.cantidad_asignada;
        END IF;

        -- 5. Actualizar la orden de trabajo original (la del taller)
        -- Resta la cantidad que se va a revisión. Si llega a 0, se completa.
        UPDATE public.ordenes_de_trabajo
        SET 
            cantidad_asignada = cantidad_asignada - rev_detail.cantidad_a_revisar,
            estado = CASE
                         WHEN (cantidad_asignada - rev_detail.cantidad_a_revisar) = 0 THEN 'completada'
                         ELSE estado
                     END,
            actualizado_en = now()
        WHERE id = v_ot_original.id;

        -- 6. Crear la nueva orden de trabajo para el revisor en la etapa de "Revisión"
        INSERT INTO public.ordenes_de_trabajo (
            id_pedido,
            id_taller,
            id_referencia,
            id_talla,
            cantidad_asignada,
            id_etapa_actual,
            estado,
            id_trabajador_asignado_a_revisar -- Asigna la OT directamente al revisor
        ) VALUES (
            p_id_pedido,
            v_ot_original.id_taller, -- La OT de revisión pertenece al mismo taller que la original
            rev_detail.id_referencia,
            rev_detail.id_talla,
            rev_detail.cantidad_a_revisar,
            v_id_etapa_revision,
            'pendiente',
            p_id_revisor
        );

        -- 7. Registrar un evento en el historial del pedido para auditoría
        SELECT nombre INTO v_referencia_nombre FROM public.referencias WHERE id = rev_detail.id_referencia;
        SELECT nombre INTO v_talla_nombre FROM public.tallas WHERE id = rev_detail.id_talla;

        INSERT INTO public.pedido_historial (
            id_pedido,
            id_etapa,
            id_usuario,
            descripcion
        ) VALUES (
            p_id_pedido,
            v_id_etapa_revision,
            p_id_usuario_accion,
            'Asignó ' || rev_detail.cantidad_a_revisar || ' uds. de ' || v_referencia_nombre || ' (Talla: ' || v_talla_nombre || ') para revisión a ' || v_revisor_nombre
        );

    END LOOP;
END;
$$;


ALTER FUNCTION "public"."procesar_revision_pedido"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_revisor" "uuid", "p_id_usuario_accion" "uuid", "p_revisiones_detalle" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."renombrar_valor_enum_referencia"("valor_viejo" "text", "valor_nuevo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    EXECUTE format('ALTER TYPE public.tipo_referencia RENAME VALUE %L TO %L', valor_viejo, valor_nuevo);
END;
$$;


ALTER FUNCTION "public"."renombrar_valor_enum_referencia"("valor_viejo" "text", "valor_nuevo" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."barrios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."barrios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cargos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cargos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ciudades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ciudades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" character varying(255) NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estados_pedido" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" character varying(50) NOT NULL
);


ALTER TABLE "public"."estados_pedido" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."etapas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "indice_orden" integer NOT NULL,
    "tiempo_promedio_horas" numeric(5,2) DEFAULT 0,
    "es_control_calidad" boolean DEFAULT false,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"(),
    "codigo" "text"
);


ALTER TABLE "public"."etapas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_etapas_pedido" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_pedido" "uuid" NOT NULL,
    "id_etapa" "uuid" NOT NULL,
    "id_trabajador" "uuid",
    "iniciado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completado_en" timestamp with time zone,
    "horas_invertidas" numeric(10,2),
    "notas" "text",
    "es_actual" boolean DEFAULT true,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "id_taller" "uuid",
    "id_usuario_actualizacion_etapa" "uuid"
);


ALTER TABLE "public"."historial_etapas_pedido" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_ordenes_de_trabajo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_orden_trabajo" "uuid" NOT NULL,
    "id_etapa" "uuid" NOT NULL,
    "id_trabajador" "uuid",
    "id_usuario_actualizacion_etapa" "uuid" NOT NULL,
    "iniciado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completado_en" timestamp with time zone,
    "horas_invertidas" numeric(10,2),
    "notas" "text",
    "es_actual" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "id_pedido" "uuid" NOT NULL
);


ALTER TABLE "public"."historial_ordenes_de_trabajo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordenes_de_trabajo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_pedido" "uuid" NOT NULL,
    "id_taller" "uuid" NOT NULL,
    "id_referencia" "uuid" NOT NULL,
    "id_talla" "uuid" NOT NULL,
    "cantidad_asignada" integer NOT NULL,
    "id_etapa_actual" "uuid" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"(),
    "estado" "public"."estado_orden_trabajo" DEFAULT 'pendiente'::"public"."estado_orden_trabajo" NOT NULL,
    "id_trabajador_asignado" "uuid",
    "origen_reproceso" "text",
    "asignado_sig_etapa" boolean DEFAULT false,
    CONSTRAINT "ordenes_de_trabajo_cantidad_asignada_check" CHECK (("cantidad_asignada" >= 0))
);


ALTER TABLE "public"."ordenes_de_trabajo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "id_etapa_actual" "uuid" DEFAULT '346ab84a-0d88-4584-8136-72c6083555bb'::"uuid" NOT NULL,
    "finalizacion_real" timestamp with time zone,
    "total_defectos" integer DEFAULT 0,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"(),
    "id_cliente" "uuid" NOT NULL,
    "id_estado" "uuid",
    "id_prioridad" "uuid" NOT NULL,
    "total_unidades" integer DEFAULT 0 NOT NULL,
    "numero_pedido" integer NOT NULL,
    "id_trabajador_actual" "uuid",
    "precio_total" numeric(10,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pedidos_numero_pedido_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pedidos_numero_pedido_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pedidos_numero_pedido_seq" OWNED BY "public"."pedidos"."numero_pedido";



CREATE TABLE IF NOT EXISTS "public"."pedidos_referencias" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "id_pedido" "uuid" NOT NULL,
    "id_referencia" "uuid" NOT NULL,
    "cantidad_total_referencia" integer DEFAULT 0 NOT NULL,
    "precio_total_referencia" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pedidos_referencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos_referencias_tallas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_pedido_referencia" "uuid" NOT NULL,
    "id_talla" "uuid" NOT NULL,
    "cantidad" integer DEFAULT 0 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pedidos_referencias_tallas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prioridades_pedido" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" character varying(50) NOT NULL
);


ALTER TABLE "public"."prioridades_pedido" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recepciones_taller_detalle" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_orden_trabajo" "uuid" NOT NULL,
    "id_usuario_receptor" "uuid" NOT NULL,
    "cantidad_recibida" integer NOT NULL,
    "recibido_completo" boolean NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_pedido" "uuid",
    "cantidad_esperada" integer DEFAULT 0 NOT NULL,
    "cantidad_faltante" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."recepciones_taller_detalle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referencias" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" character varying(255) NOT NULL,
    "descripcion" "text",
    "tipo" "public"."tipo_referencia",
    "precio_unitario" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"(),
    "imagen_url" "text"
);


ALTER TABLE "public"."referencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registros_diarios" (
    "id" bigint NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"(),
    "descripcion" "text"
);


ALTER TABLE "public"."registros_diarios" OWNER TO "postgres";


ALTER TABLE "public"."registros_diarios" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."registros_diarios_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."revisiones_detalle" (
    "id" bigint NOT NULL,
    "id_pedido" "uuid" NOT NULL,
    "id_referencia" "uuid" NOT NULL,
    "cantidad_aprobada" integer DEFAULT 0 NOT NULL,
    "cantidad_corregida_internamente" integer DEFAULT 0 NOT NULL,
    "cantidad_devuelta_taller" integer DEFAULT 0 NOT NULL,
    "id_usuario_revisor" "uuid" NOT NULL,
    "observaciones_devolucion" "text",
    "fecha_revision" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_talla" "uuid" NOT NULL,
    "id_orden_trabajo_origen" "uuid" NOT NULL,
    CONSTRAINT "cantidades_check" CHECK ((("cantidad_aprobada" >= 0) AND ("cantidad_corregida_internamente" >= 0) AND ("cantidad_devuelta_taller" >= 0) AND (("cantidad_aprobada" > 0) OR ("cantidad_corregida_internamente" > 0) OR ("cantidad_devuelta_taller" > 0))))
);


ALTER TABLE "public"."revisiones_detalle" OWNER TO "postgres";


COMMENT ON TABLE "public"."revisiones_detalle" IS 'Registra el desglose de cantidades de un pedido durante la etapa de revisión de calidad.';



COMMENT ON COLUMN "public"."revisiones_detalle"."id_pedido" IS 'El pedido que se está revisando.';



COMMENT ON COLUMN "public"."revisiones_detalle"."id_referencia" IS 'La referencia específica que se está evaluando.';



COMMENT ON COLUMN "public"."revisiones_detalle"."cantidad_aprobada" IS 'Cantidad de prendas que pasaron la revisión y avanzan a la siguiente etapa.';



COMMENT ON COLUMN "public"."revisiones_detalle"."cantidad_corregida_internamente" IS 'Cantidad de prendas con defectos menores que son corregidos por el equipo de revisión.';



COMMENT ON COLUMN "public"."revisiones_detalle"."cantidad_devuelta_taller" IS 'Cantidad de prendas con defectos mayores que se devuelven al taller de confección.';



COMMENT ON COLUMN "public"."revisiones_detalle"."id_usuario_revisor" IS 'El usuario que realizó la revisión.';



COMMENT ON COLUMN "public"."revisiones_detalle"."observaciones_devolucion" IS 'Notas para el taller explicando por qué se devuelven las prendas.';



COMMENT ON COLUMN "public"."revisiones_detalle"."fecha_revision" IS 'La fecha en que se realizó la revisión.';



ALTER TABLE "public"."revisiones_detalle" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."revisiones_detalle_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tallas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" character varying(10) NOT NULL,
    "orden" integer NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tallas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."talleres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "descripcion" "text",
    "labor" "text" DEFAULT 'Confección'::"text",
    "tipo_documento" "text",
    "nro_documento" "text",
    "direccion" "text",
    "celular" "text",
    "ciudad_id" "uuid",
    "barrio_id" "uuid",
    "esta_activo" boolean DEFAULT true
);


ALTER TABLE "public"."talleres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_defecto_posible_borrar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "severidad" "text" DEFAULT 'medium'::"text",
    "creado_en" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "defect_types_severity_check" CHECK (("severidad" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."tipos_defecto_posible_borrar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trabajadores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_trabajador" "text" NOT NULL,
    "correo_electronico" "text",
    "esta_activo" boolean DEFAULT true,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"(),
    "nombre_usuario" "text",
    "id_cargo" "uuid",
    "contrasena_visible" "text"
);


ALTER TABLE "public"."trabajadores" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vista_detalles_pedido" AS
 SELECT "prt"."cantidad",
    "pr"."id_pedido",
    "pr"."id_referencia",
    "t"."id" AS "id_talla",
    "ref"."nombre" AS "nombre_referencia",
    "ref"."imagen_url",
    "ref"."precio_unitario",
    "t"."nombre" AS "nombre_talla"
   FROM ((("public"."pedidos_referencias_tallas" "prt"
     JOIN "public"."pedidos_referencias" "pr" ON (("prt"."id_pedido_referencia" = "pr"."id")))
     JOIN "public"."referencias" "ref" ON (("pr"."id_referencia" = "ref"."id")))
     JOIN "public"."tallas" "t" ON (("prt"."id_talla" = "t"."id")));


ALTER VIEW "public"."vista_detalles_pedido" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vista_pedidos_detalle" AS
 SELECT "p"."id",
    "p"."id_etapa_actual",
    "p"."finalizacion_real",
    "p"."total_defectos",
    "p"."creado_en",
    "p"."actualizado_en",
    "p"."id_cliente",
    "p"."id_estado",
    "p"."id_prioridad",
    "p"."total_unidades",
    "p"."numero_pedido",
    "p"."id_trabajador_actual",
    "p"."precio_total",
    "et"."nombre" AS "nombre_etapa_actual",
    "et"."codigo" AS "codigo_etapa_actual",
    "es"."nombre" AS "nombre_estado",
    "pr"."nombre" AS "nombre_prioridad",
    "c"."nombre" AS "nombre_cliente",
    COALESCE("stages"."numero_de_etapas_activas", (1)::bigint) AS "numero_de_etapas_activas",
    "stages"."desglose_etapas",
    "hep"."iniciado_en" AS "fecha_inicio_etapa_actual"
   FROM (((((("public"."pedidos" "p"
     LEFT JOIN "public"."etapas" "et" ON (("p"."id_etapa_actual" = "et"."id")))
     LEFT JOIN "public"."estados_pedido" "es" ON (("p"."id_estado" = "es"."id")))
     LEFT JOIN "public"."prioridades_pedido" "pr" ON (("p"."id_prioridad" = "pr"."id")))
     LEFT JOIN "public"."clientes" "c" ON (("p"."id_cliente" = "c"."id")))
     LEFT JOIN ( SELECT DISTINCT ON ("historial_etapas_pedido"."id_pedido") "historial_etapas_pedido"."id_pedido",
            "historial_etapas_pedido"."iniciado_en"
           FROM "public"."historial_etapas_pedido"
          WHERE ("historial_etapas_pedido"."es_actual" = true)
          ORDER BY "historial_etapas_pedido"."id_pedido", "historial_etapas_pedido"."iniciado_en" DESC) "hep" ON (("p"."id" = "hep"."id_pedido")))
     LEFT JOIN ( SELECT "sub"."id_pedido",
            "count"(*) AS "numero_de_etapas_activas",
            "jsonb_agg"("jsonb_build_object"('etapa', "sub"."nombre_etapa", 'cantidad', "sub"."cantidad_total") ORDER BY "sub"."nombre_etapa") AS "desglose_etapas"
           FROM ( SELECT "ot"."id_pedido",
                    "e"."nombre" AS "nombre_etapa",
                    "sum"("ot"."cantidad_asignada") AS "cantidad_total"
                   FROM ("public"."ordenes_de_trabajo" "ot"
                     JOIN "public"."etapas" "e" ON (("ot"."id_etapa_actual" = "e"."id")))
                  WHERE (("ot"."estado" <> 'cancelada'::"public"."estado_orden_trabajo") AND (("ot"."estado" <> 'completada'::"public"."estado_orden_trabajo") OR (("e"."codigo" = 'REVISION'::"text") AND ("ot"."asignado_sig_etapa" = false))))
                  GROUP BY "ot"."id_pedido", "e"."nombre") "sub"
          GROUP BY "sub"."id_pedido") "stages" ON (("p"."id" = "stages"."id_pedido")));


ALTER VIEW "public"."vista_pedidos_detalle" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vista_reporte_tiempos_por_etapa" AS
 WITH "tiempos_etapas_agregados" AS (
         SELECT "hep"."id_pedido",
            "hep"."id_etapa",
            "sum"(COALESCE("hep"."horas_invertidas",
                CASE
                    WHEN ("hep"."es_actual" = true) THEN (EXTRACT(epoch FROM ("now"() - "hep"."iniciado_en")) / (3600)::numeric)
                    ELSE (0)::numeric
                END)) AS "total_horas_pedido"
           FROM "public"."historial_etapas_pedido" "hep"
          GROUP BY "hep"."id_pedido", "hep"."id_etapa"
        )
 SELECT "p"."id" AS "id_pedido",
    "e"."id" AS "id_etapa",
    "e"."nombre" AS "nombre_etapa",
    COALESCE("tea"."total_horas_pedido", (0)::numeric) AS "horas_invertidas_totales"
   FROM (("public"."pedidos" "p"
     CROSS JOIN "public"."etapas" "e")
     LEFT JOIN "tiempos_etapas_agregados" "tea" ON ((("p"."id" = "tea"."id_pedido") AND ("e"."id" = "tea"."id_etapa"))))
  ORDER BY "p"."id", "e"."indice_orden";


ALTER VIEW "public"."vista_reporte_tiempos_por_etapa" OWNER TO "postgres";


ALTER TABLE ONLY "public"."pedidos" ALTER COLUMN "numero_pedido" SET DEFAULT "nextval"('"public"."pedidos_numero_pedido_seq"'::"regclass");



ALTER TABLE ONLY "public"."barrios"
    ADD CONSTRAINT "barrios_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."barrios"
    ADD CONSTRAINT "barrios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cargos"
    ADD CONSTRAINT "cargos_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."cargos"
    ADD CONSTRAINT "cargos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ciudades"
    ADD CONSTRAINT "ciudades_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."ciudades"
    ADD CONSTRAINT "ciudades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_defecto_posible_borrar"
    ADD CONSTRAINT "defect_types_name_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."tipos_defecto_posible_borrar"
    ADD CONSTRAINT "defect_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estados_pedido"
    ADD CONSTRAINT "estados_pedido_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."estados_pedido"
    ADD CONSTRAINT "estados_pedido_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."etapas"
    ADD CONSTRAINT "etapas_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."historial_etapas_pedido"
    ADD CONSTRAINT "historial_etapas_pedido_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historial_ordenes_de_trabajo"
    ADD CONSTRAINT "historial_ordenes_de_trabajo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordenes_de_trabajo"
    ADD CONSTRAINT "ordenes_de_trabajo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_numero_pedido_key" UNIQUE ("numero_pedido");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_referencias"
    ADD CONSTRAINT "pedidos_referencias_id_pedido_id_referencia_key" UNIQUE ("id_pedido", "id_referencia");



ALTER TABLE ONLY "public"."pedidos_referencias"
    ADD CONSTRAINT "pedidos_referencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_referencias_tallas"
    ADD CONSTRAINT "pedidos_referencias_tallas_id_pedido_referencia_id_talla_key" UNIQUE ("id_pedido_referencia", "id_talla");



ALTER TABLE ONLY "public"."pedidos_referencias_tallas"
    ADD CONSTRAINT "pedidos_referencias_tallas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prioridades_pedido"
    ADD CONSTRAINT "prioridades_pedido_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."prioridades_pedido"
    ADD CONSTRAINT "prioridades_pedido_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recepciones_taller_detalle"
    ADD CONSTRAINT "recepciones_taller_detalle_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referencias"
    ADD CONSTRAINT "referencias_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."referencias"
    ADD CONSTRAINT "referencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registros_diarios"
    ADD CONSTRAINT "registros_diarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."revisiones_detalle"
    ADD CONSTRAINT "revisiones_detalle_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."etapas"
    ADD CONSTRAINT "stages_name_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."etapas"
    ADD CONSTRAINT "stages_order_index_key" UNIQUE ("indice_orden");



ALTER TABLE ONLY "public"."etapas"
    ADD CONSTRAINT "stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tallas"
    ADD CONSTRAINT "tallas_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."tallas"
    ADD CONSTRAINT "tallas_orden_key" UNIQUE ("orden");



ALTER TABLE ONLY "public"."tallas"
    ADD CONSTRAINT "tallas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."talleres"
    ADD CONSTRAINT "talleres_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."talleres"
    ADD CONSTRAINT "talleres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trabajadores"
    ADD CONSTRAINT "trabajadores_nombre_usuario_key" UNIQUE ("nombre_usuario");



ALTER TABLE ONLY "public"."revisiones_detalle"
    ADD CONSTRAINT "unique_revision_por_ot" UNIQUE ("id_orden_trabajo_origen");



ALTER TABLE ONLY "public"."trabajadores"
    ADD CONSTRAINT "workers_email_key" UNIQUE ("correo_electronico");



ALTER TABLE ONLY "public"."trabajadores"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_historial_ordenes_trabajo_id_pedido" ON "public"."historial_ordenes_de_trabajo" USING "btree" ("id_pedido");



CREATE OR REPLACE TRIGGER "trg_actualizar_etapas_actualizado_en" BEFORE UPDATE ON "public"."etapas" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_columna_actualizado_en"();



CREATE OR REPLACE TRIGGER "trg_actualizar_ordenes_de_trabajo_actualizado_en" BEFORE UPDATE ON "public"."ordenes_de_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_columna_actualizado_en"();



CREATE OR REPLACE TRIGGER "trg_actualizar_pedidos_actualizado_en" BEFORE UPDATE ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_columna_actualizado_en"();



CREATE OR REPLACE TRIGGER "trg_actualizar_referencias_actualizado_en" BEFORE UPDATE ON "public"."referencias" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_columna_actualizado_en"();



CREATE OR REPLACE TRIGGER "trg_actualizar_trabajadores_actualizado_en" BEFORE UPDATE ON "public"."trabajadores" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_columna_actualizado_en"();



CREATE OR REPLACE TRIGGER "trg_crear_historial_inicial" AFTER INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."crear_historial_inicial"();



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "fk_cliente" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "fk_estado" FOREIGN KEY ("id_estado") REFERENCES "public"."estados_pedido"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "fk_prioridad" FOREIGN KEY ("id_prioridad") REFERENCES "public"."prioridades_pedido"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recepciones_taller_detalle"
    ADD CONSTRAINT "fk_recepciones_taller_detalle_id_pedido" FOREIGN KEY ("id_pedido") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_etapas_pedido"
    ADD CONSTRAINT "historial_etapas_pedido_id_etapa_fkey" FOREIGN KEY ("id_etapa") REFERENCES "public"."etapas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."historial_etapas_pedido"
    ADD CONSTRAINT "historial_etapas_pedido_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_etapas_pedido"
    ADD CONSTRAINT "historial_etapas_pedido_id_taller_fkey" FOREIGN KEY ("id_taller") REFERENCES "public"."talleres"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."historial_etapas_pedido"
    ADD CONSTRAINT "historial_etapas_pedido_id_trabajador_fkey" FOREIGN KEY ("id_trabajador") REFERENCES "public"."trabajadores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."historial_etapas_pedido"
    ADD CONSTRAINT "historial_etapas_pedido_id_usuario_actualizacion_etapa_fkey" FOREIGN KEY ("id_usuario_actualizacion_etapa") REFERENCES "public"."trabajadores"("id");



ALTER TABLE ONLY "public"."historial_ordenes_de_trabajo"
    ADD CONSTRAINT "historial_ordenes_de_trabajo_id_etapa_fkey" FOREIGN KEY ("id_etapa") REFERENCES "public"."etapas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."historial_ordenes_de_trabajo"
    ADD CONSTRAINT "historial_ordenes_de_trabajo_id_orden_trabajo_fkey" FOREIGN KEY ("id_orden_trabajo") REFERENCES "public"."ordenes_de_trabajo"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_ordenes_de_trabajo"
    ADD CONSTRAINT "historial_ordenes_de_trabajo_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_ordenes_de_trabajo"
    ADD CONSTRAINT "historial_ordenes_de_trabajo_id_trabajador_fkey" FOREIGN KEY ("id_trabajador") REFERENCES "public"."trabajadores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."historial_ordenes_de_trabajo"
    ADD CONSTRAINT "historial_ordenes_de_trabajo_id_usuario_actualizacion_etap_fkey" FOREIGN KEY ("id_usuario_actualizacion_etapa") REFERENCES "public"."trabajadores"("id");



ALTER TABLE ONLY "public"."ordenes_de_trabajo"
    ADD CONSTRAINT "ordenes_de_trabajo_id_etapa_actual_fkey" FOREIGN KEY ("id_etapa_actual") REFERENCES "public"."etapas"("id");



ALTER TABLE ONLY "public"."ordenes_de_trabajo"
    ADD CONSTRAINT "ordenes_de_trabajo_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordenes_de_trabajo"
    ADD CONSTRAINT "ordenes_de_trabajo_id_referencia_fkey" FOREIGN KEY ("id_referencia") REFERENCES "public"."referencias"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ordenes_de_trabajo"
    ADD CONSTRAINT "ordenes_de_trabajo_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "public"."tallas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ordenes_de_trabajo"
    ADD CONSTRAINT "ordenes_de_trabajo_id_taller_fkey" FOREIGN KEY ("id_taller") REFERENCES "public"."talleres"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ordenes_de_trabajo"
    ADD CONSTRAINT "ordenes_de_trabajo_id_trabajador_asignado_fkey" FOREIGN KEY ("id_trabajador_asignado") REFERENCES "public"."trabajadores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "orders_current_stage_id_fkey" FOREIGN KEY ("id_etapa_actual") REFERENCES "public"."etapas"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_id_trabajador_actual_fkey" FOREIGN KEY ("id_trabajador_actual") REFERENCES "public"."trabajadores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedidos_referencias"
    ADD CONSTRAINT "pedidos_referencias_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedidos_referencias"
    ADD CONSTRAINT "pedidos_referencias_id_referencia_fkey" FOREIGN KEY ("id_referencia") REFERENCES "public"."referencias"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pedidos_referencias_tallas"
    ADD CONSTRAINT "pedidos_referencias_tallas_id_pedido_referencia_fkey" FOREIGN KEY ("id_pedido_referencia") REFERENCES "public"."pedidos_referencias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedidos_referencias_tallas"
    ADD CONSTRAINT "pedidos_referencias_tallas_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "public"."tallas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recepciones_taller_detalle"
    ADD CONSTRAINT "recepciones_taller_detalle_id_orden_trabajo_fkey" FOREIGN KEY ("id_orden_trabajo") REFERENCES "public"."ordenes_de_trabajo"("id");



ALTER TABLE ONLY "public"."recepciones_taller_detalle"
    ADD CONSTRAINT "recepciones_taller_detalle_id_usuario_receptor_fkey" FOREIGN KEY ("id_usuario_receptor") REFERENCES "public"."trabajadores"("id");



ALTER TABLE ONLY "public"."revisiones_detalle"
    ADD CONSTRAINT "revisiones_detalle_id_orden_trabajo_origen_fkey" FOREIGN KEY ("id_orden_trabajo_origen") REFERENCES "public"."ordenes_de_trabajo"("id");



ALTER TABLE ONLY "public"."revisiones_detalle"
    ADD CONSTRAINT "revisiones_detalle_id_pedido_fkey" FOREIGN KEY ("id_pedido") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."revisiones_detalle"
    ADD CONSTRAINT "revisiones_detalle_id_referencia_fkey" FOREIGN KEY ("id_referencia") REFERENCES "public"."referencias"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."revisiones_detalle"
    ADD CONSTRAINT "revisiones_detalle_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "public"."tallas"("id");



ALTER TABLE ONLY "public"."revisiones_detalle"
    ADD CONSTRAINT "revisiones_detalle_id_usuario_revisor_fkey" FOREIGN KEY ("id_usuario_revisor") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."talleres"
    ADD CONSTRAINT "talleres_barrio_id_fkey" FOREIGN KEY ("barrio_id") REFERENCES "public"."barrios"("id");



ALTER TABLE ONLY "public"."talleres"
    ADD CONSTRAINT "talleres_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "public"."ciudades"("id");



ALTER TABLE ONLY "public"."trabajadores"
    ADD CONSTRAINT "trabajadores_id_cargo_fkey" FOREIGN KEY ("id_cargo") REFERENCES "public"."cargos"("id");



CREATE POLICY "Allow management of talleres for authenticated users" ON "public"."talleres" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Auth insert barrios" ON "public"."barrios" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Auth insert ciudades" ON "public"."ciudades" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Auth update barrios" ON "public"."barrios" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Auth update ciudades" ON "public"."ciudades" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all for authenticated users on pedidos_referencias" ON "public"."pedidos_referencias" TO "authenticated" USING (true);



CREATE POLICY "Enable all for authenticated users on pedidos_referencias_talla" ON "public"."pedidos_referencias_tallas" TO "authenticated" USING (true);



CREATE POLICY "Enable insert for authenticated users on clientes" ON "public"."clientes" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users on estados_pedido" ON "public"."estados_pedido" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users on prioridades_pedido" ON "public"."prioridades_pedido" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users on referencias" ON "public"."referencias" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users on tallas" ON "public"."tallas" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users on clientes" ON "public"."clientes" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users on estados_pedido" ON "public"."estados_pedido" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users on prioridades_pedido" ON "public"."prioridades_pedido" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users on referencias" ON "public"."referencias" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users on tallas" ON "public"."tallas" FOR SELECT USING (true);



CREATE POLICY "Permitir acceso autenticado a detalles de recepcion" ON "public"."recepciones_taller_detalle" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir actualización a autenticados" ON "public"."referencias" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir eliminación a autenticados" ON "public"."referencias" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Permitir inserción a autenticados" ON "public"."clientes" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir inserción a autenticados" ON "public"."estados_pedido" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir inserción a autenticados" ON "public"."prioridades_pedido" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir inserción a autenticados" ON "public"."referencias" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir inserción a autenticados" ON "public"."tallas" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir lectura a anonimos" ON "public"."etapas" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Permitir lectura a anonimos" ON "public"."tipos_defecto_posible_borrar" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Permitir lectura a anonimos en etapas" ON "public"."etapas" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Permitir lectura a anonimos en tipos_defecto" ON "public"."tipos_defecto_posible_borrar" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Permitir lectura a todos los usuarios" ON "public"."clientes" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura a todos los usuarios" ON "public"."estados_pedido" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura a todos los usuarios" ON "public"."prioridades_pedido" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura a todos los usuarios" ON "public"."referencias" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura a todos los usuarios" ON "public"."tallas" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura a usuarios autenticados" ON "public"."talleres" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir lectura pública de trabajadores para login" ON "public"."trabajadores" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Permitir lectura pública para login" ON "public"."trabajadores" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."etapas" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."historial_etapas_pedido" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."ordenes_de_trabajo" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."pedidos" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."pedidos_referencias" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."pedidos_referencias_tallas" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."tipos_defecto_posible_borrar" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."trabajadores" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados en etapas" ON "public"."etapas" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados en pedidos" ON "public"."pedidos" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados en tipos_defecto" ON "public"."tipos_defecto_posible_borrar" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados en trabajadores" ON "public"."trabajadores" TO "authenticated" USING (true);



CREATE POLICY "Permitir todo a usuarios autenticados para historial_ordenes_de" ON "public"."historial_ordenes_de_trabajo" TO "authenticated" USING (true);



CREATE POLICY "Public read barrios" ON "public"."barrios" FOR SELECT USING (true);



CREATE POLICY "Public read ciudades" ON "public"."ciudades" FOR SELECT USING (true);



ALTER TABLE "public"."barrios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ciudades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estados_pedido" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."etapas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historial_etapas_pedido" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historial_ordenes_de_trabajo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ordenes_de_trabajo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos_referencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos_referencias_tallas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prioridades_pedido" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recepciones_taller_detalle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tallas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."talleres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipos_defecto_posible_borrar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trabajadores" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."historial_etapas_pedido";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pedidos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trabajadores";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."actualizar_cantidades_pedido_referencia"("p_id_pedido" "uuid", "p_nombre_referencia" "text", "p_nuevas_cantidades" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_cantidades_pedido_referencia"("p_id_pedido" "uuid", "p_nombre_referencia" "text", "p_nuevas_cantidades" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_cantidades_pedido_referencia"("p_id_pedido" "uuid", "p_nombre_referencia" "text", "p_nuevas_cantidades" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_columna_actualizado_en"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_columna_actualizado_en"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_columna_actualizado_en"() TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_etapa_pedido_principal"("p_id_pedido" "uuid", "p_id_trabajador" "uuid", "p_id_usuario_accion" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_etapa_pedido_principal"("p_id_pedido" "uuid", "p_id_trabajador" "uuid", "p_id_usuario_accion" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_etapa_pedido_principal"("p_id_pedido" "uuid", "p_id_trabajador" "uuid", "p_id_usuario_accion" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_pedidos_retrasados"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_pedidos_retrasados"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_pedidos_retrasados"() TO "service_role";



GRANT ALL ON FUNCTION "public"."agregar_valor_a_enum_referencia"("nuevo_valor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."agregar_valor_a_enum_referencia"("nuevo_valor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agregar_valor_a_enum_referencia"("nuevo_valor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."asignar_planchado_desde_revision"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."asignar_planchado_desde_revision"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."asignar_planchado_desde_revision"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."asignar_trabajador_pedido"("p_pedido_id" "uuid", "p_trabajador_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."asignar_trabajador_pedido"("p_pedido_id" "uuid", "p_trabajador_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."asignar_trabajador_pedido"("p_pedido_id" "uuid", "p_trabajador_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."avanzar_etapa_pedido"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."avanzar_etapa_pedido"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avanzar_etapa_pedido"("payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."avanzar_etapa_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_actualizacion_etapa" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."avanzar_taller_a_recepcion"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_receptor_asignado" "uuid", "p_id_trabajador_logueado" "uuid", "p_id_etapa_origen" "uuid", "p_es_devuelto" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."avanzar_taller_a_revision_y_asignar_revisor"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."avanzar_taller_a_revision_y_asignar_revisor"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avanzar_taller_a_revision_y_asignar_revisor"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid", "p_asignaciones_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."calcular_tiempo_etapa_actual"("p_id_pedido" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calcular_tiempo_etapa_actual"("p_id_pedido" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calcular_tiempo_etapa_actual"("p_id_pedido" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirmar_entrega_final_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirmar_entrega_final_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirmar_entrega_final_taller"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_usuario_accion" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirmar_resultados_planchado_batch"("p_resultados" "jsonb", "p_id_usuario_accion" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirmar_resultados_planchado_batch"("p_resultados" "jsonb", "p_id_usuario_accion" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirmar_resultados_planchado_batch"("p_resultados" "jsonb", "p_id_usuario_accion" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirmar_resultados_revision_batch"("p_revisiones" "jsonb", "p_id_usuario_accion" "uuid", "p_notas" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirmar_resultados_revision_batch"("p_revisiones" "jsonb", "p_id_usuario_accion" "uuid", "p_notas" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirmar_resultados_revision_batch"("p_revisiones" "jsonb", "p_id_usuario_accion" "uuid", "p_notas" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_historial_inicial"() TO "anon";
GRANT ALL ON FUNCTION "public"."crear_historial_inicial"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_historial_inicial"() TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid", "p_id_etapa" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid", "p_id_etapa" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_ordenes_de_trabajo"("p_id_pedido" "uuid", "p_asignaciones" "jsonb", "p_id_usuario_autenticacion" "uuid", "p_id_trabajador_accion" "uuid", "p_id_etapa" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb", "p_id_creador" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb", "p_id_creador" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_pedido_con_detalles"("p_id_cliente" "uuid", "p_id_prioridad" "uuid", "p_referencias" "jsonb", "p_id_creador" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_cantidades_disponibles_para_etapa"("p_id_pedido" "uuid", "p_nombre_etapa" "text", "p_filtro_taller" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_cantidades_disponibles_para_etapa"("p_id_pedido" "uuid", "p_nombre_etapa" "text", "p_filtro_taller" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_cantidades_disponibles_para_etapa"("p_id_pedido" "uuid", "p_nombre_etapa" "text", "p_filtro_taller" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_estado_talleres_por_pedido"("p_id_pedido" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_estado_talleres_por_pedido"("p_id_pedido" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_estado_talleres_por_pedido"("p_id_pedido" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_tiempos_etapas"("p_fecha_inicio" "date", "p_fecha_fin" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_tiempos_etapas"("p_fecha_inicio" "date", "p_fecha_fin" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_tiempos_etapas"("p_fecha_inicio" "date", "p_fecha_fin" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_valores_enum"("enum_type_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_valores_enum"("enum_type_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_valores_enum"("enum_type_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."procesar_recepcion_taller"("p_id_pedido" "uuid", "p_id_usuario_receptor" "uuid", "p_recepciones" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."procesar_recepcion_taller"("p_id_pedido" "uuid", "p_id_usuario_receptor" "uuid", "p_recepciones" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."procesar_recepcion_taller"("p_id_pedido" "uuid", "p_id_usuario_receptor" "uuid", "p_recepciones" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."procesar_revision_ot"("p_id_orden_trabajo_revision" "uuid", "p_id_usuario_revisor" "uuid", "p_cantidad_aprobada" integer, "p_cantidad_corregida_internamente" integer, "p_cantidad_devuelta_taller" integer, "p_observaciones_devolucion" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."procesar_revision_ot"("p_id_orden_trabajo_revision" "uuid", "p_id_usuario_revisor" "uuid", "p_cantidad_aprobada" integer, "p_cantidad_corregida_internamente" integer, "p_cantidad_devuelta_taller" integer, "p_observaciones_devolucion" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."procesar_revision_ot"("p_id_orden_trabajo_revision" "uuid", "p_id_usuario_revisor" "uuid", "p_cantidad_aprobada" integer, "p_cantidad_corregida_internamente" integer, "p_cantidad_devuelta_taller" integer, "p_observaciones_devolucion" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."procesar_revision_pedido"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_revisor" "uuid", "p_id_usuario_accion" "uuid", "p_revisiones_detalle" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."procesar_revision_pedido"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_revisor" "uuid", "p_id_usuario_accion" "uuid", "p_revisiones_detalle" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."procesar_revision_pedido"("p_id_pedido" "uuid", "p_id_taller" "uuid", "p_id_revisor" "uuid", "p_id_usuario_accion" "uuid", "p_revisiones_detalle" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."renombrar_valor_enum_referencia"("valor_viejo" "text", "valor_nuevo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."renombrar_valor_enum_referencia"("valor_viejo" "text", "valor_nuevo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."renombrar_valor_enum_referencia"("valor_viejo" "text", "valor_nuevo" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."barrios" TO "anon";
GRANT ALL ON TABLE "public"."barrios" TO "authenticated";
GRANT ALL ON TABLE "public"."barrios" TO "service_role";



GRANT ALL ON TABLE "public"."cargos" TO "anon";
GRANT ALL ON TABLE "public"."cargos" TO "authenticated";
GRANT ALL ON TABLE "public"."cargos" TO "service_role";



GRANT ALL ON TABLE "public"."ciudades" TO "anon";
GRANT ALL ON TABLE "public"."ciudades" TO "authenticated";
GRANT ALL ON TABLE "public"."ciudades" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."estados_pedido" TO "anon";
GRANT ALL ON TABLE "public"."estados_pedido" TO "authenticated";
GRANT ALL ON TABLE "public"."estados_pedido" TO "service_role";



GRANT ALL ON TABLE "public"."etapas" TO "anon";
GRANT ALL ON TABLE "public"."etapas" TO "authenticated";
GRANT ALL ON TABLE "public"."etapas" TO "service_role";



GRANT ALL ON TABLE "public"."historial_etapas_pedido" TO "anon";
GRANT ALL ON TABLE "public"."historial_etapas_pedido" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_etapas_pedido" TO "service_role";



GRANT ALL ON TABLE "public"."historial_ordenes_de_trabajo" TO "anon";
GRANT ALL ON TABLE "public"."historial_ordenes_de_trabajo" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_ordenes_de_trabajo" TO "service_role";



GRANT ALL ON TABLE "public"."ordenes_de_trabajo" TO "anon";
GRANT ALL ON TABLE "public"."ordenes_de_trabajo" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_de_trabajo" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos" TO "anon";
GRANT ALL ON TABLE "public"."pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedidos_numero_pedido_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedidos_numero_pedido_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedidos_numero_pedido_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_referencias" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_referencias" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_referencias" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_referencias_tallas" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_referencias_tallas" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_referencias_tallas" TO "service_role";



GRANT ALL ON TABLE "public"."prioridades_pedido" TO "anon";
GRANT ALL ON TABLE "public"."prioridades_pedido" TO "authenticated";
GRANT ALL ON TABLE "public"."prioridades_pedido" TO "service_role";



GRANT ALL ON TABLE "public"."recepciones_taller_detalle" TO "anon";
GRANT ALL ON TABLE "public"."recepciones_taller_detalle" TO "authenticated";
GRANT ALL ON TABLE "public"."recepciones_taller_detalle" TO "service_role";



GRANT ALL ON TABLE "public"."referencias" TO "anon";
GRANT ALL ON TABLE "public"."referencias" TO "authenticated";
GRANT ALL ON TABLE "public"."referencias" TO "service_role";



GRANT ALL ON TABLE "public"."registros_diarios" TO "anon";
GRANT ALL ON TABLE "public"."registros_diarios" TO "authenticated";
GRANT ALL ON TABLE "public"."registros_diarios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registros_diarios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registros_diarios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registros_diarios_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."revisiones_detalle" TO "anon";
GRANT ALL ON TABLE "public"."revisiones_detalle" TO "authenticated";
GRANT ALL ON TABLE "public"."revisiones_detalle" TO "service_role";



GRANT ALL ON SEQUENCE "public"."revisiones_detalle_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."revisiones_detalle_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."revisiones_detalle_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tallas" TO "anon";
GRANT ALL ON TABLE "public"."tallas" TO "authenticated";
GRANT ALL ON TABLE "public"."tallas" TO "service_role";



GRANT ALL ON TABLE "public"."talleres" TO "anon";
GRANT ALL ON TABLE "public"."talleres" TO "authenticated";
GRANT ALL ON TABLE "public"."talleres" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_defecto_posible_borrar" TO "anon";
GRANT ALL ON TABLE "public"."tipos_defecto_posible_borrar" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_defecto_posible_borrar" TO "service_role";



GRANT ALL ON TABLE "public"."trabajadores" TO "anon";
GRANT ALL ON TABLE "public"."trabajadores" TO "authenticated";
GRANT ALL ON TABLE "public"."trabajadores" TO "service_role";



GRANT ALL ON TABLE "public"."vista_detalles_pedido" TO "anon";
GRANT ALL ON TABLE "public"."vista_detalles_pedido" TO "authenticated";
GRANT ALL ON TABLE "public"."vista_detalles_pedido" TO "service_role";



GRANT ALL ON TABLE "public"."vista_pedidos_detalle" TO "anon";
GRANT ALL ON TABLE "public"."vista_pedidos_detalle" TO "authenticated";
GRANT ALL ON TABLE "public"."vista_pedidos_detalle" TO "service_role";



GRANT ALL ON TABLE "public"."vista_reporte_tiempos_por_etapa" TO "anon";
GRANT ALL ON TABLE "public"."vista_reporte_tiempos_por_etapa" TO "authenticated";
GRANT ALL ON TABLE "public"."vista_reporte_tiempos_por_etapa" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























