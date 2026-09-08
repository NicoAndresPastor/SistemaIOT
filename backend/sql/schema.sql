

CREATE TYPE sistema_operativo AS ENUM ('IOS', 'ANDROID');

CREATE TYPE estado_entrega AS ENUM ('PENDIENTE', 'ENTREGADA', 'FALLIDA');

CREATE TYPE tipo_agua AS ENUM ('DULCE', 'SALADA');

CREATE TYPE origen_medicion AS ENUM ('AUTOMATICA', 'MANUAL');

CREATE TYPE tipo_desvio AS ENUM ('POR_DEBAJO', 'POR_ENCIMA');

CREATE TYPE estado_recomendacion AS ENUM ('VIGENTE', 'ATENDIDA', 'DESCARTADA');

CREATE TYPE tipo_hallazgo AS ENUM ('TENDENCIA_ASCENDENTE', 'TENDENCIA_DESCENDENTE', 'OSCILACION_ANORMAL');

CREATE TYPE tipo_evento_bitacora AS ENUM ('ALIMENTACION', 'CAMBIO_AGUA', 'PODA_PLANTAS', 'MEDICACION', 'OTRO');


CREATE TABLE usuario (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                  TEXT NOT NULL UNIQUE,
    contrasena_hash        TEXT NOT NULL,
    fecha_alta             TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_consentimiento   TIMESTAMPTZ NOT NULL
);

CREATE TABLE sesion (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id                  UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    token_refresco_hash         TEXT NOT NULL UNIQUE,
    token_notificaciones_push   TEXT,
    sistema_operativo           sistema_operativo NOT NULL,
    fecha_creacion              TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion            TIMESTAMPTZ NOT NULL,
    fecha_fin_sesion            TIMESTAMPTZ
);

CREATE INDEX idx_sesion_usuario ON sesion(usuario_id);


CREATE TABLE parametro (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    unidad          TEXT NOT NULL,
    tiene_sensor    BOOLEAN NOT NULL,
    min_fisico      DECIMAL NOT NULL,
    max_fisico      DECIMAL NOT NULL,
    min_por_defecto DECIMAL NOT NULL,
    max_por_defecto DECIMAL NOT NULL,
    CHECK (min_fisico < max_fisico),
    CHECK (min_por_defecto < max_por_defecto)
);

CREATE TABLE dispositivo (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identificador_hardware  TEXT NOT NULL UNIQUE,
    ultima_comunicacion     TIMESTAMPTZ
);


CREATE TABLE acuario (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    volumen_litros  REAL,
    tipo_agua       tipo_agua,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_acuario_usuario ON acuario(usuario_id);

CREATE TABLE configuracion_parametro (
    acuario_id                  UUID NOT NULL REFERENCES acuario(id) ON DELETE CASCADE,
    parametro_id                SMALLINT NOT NULL REFERENCES parametro(id),
    valor_minimo                DECIMAL NOT NULL,
    valor_maximo                DECIMAL NOT NULL,
    notificaciones_habilitadas  BOOLEAN NOT NULL DEFAULT true,
    fecha_actualizacion         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (acuario_id, parametro_id),
    CHECK (valor_minimo < valor_maximo)
);


CREATE TABLE vinculacion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acuario_id      UUID NOT NULL REFERENCES acuario(id) ON DELETE CASCADE,
    dispositivo_id  UUID NOT NULL REFERENCES dispositivo(id) ON DELETE CASCADE,
    fecha_inicio    TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_fin       TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_vinculacion_dispositivo_vigente
    ON vinculacion(dispositivo_id) WHERE fecha_fin IS NULL;

CREATE UNIQUE INDEX idx_vinculacion_acuario_vigente
    ON vinculacion(acuario_id) WHERE fecha_fin IS NULL;

CREATE TABLE enchufe (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispositivo_id  UUID NOT NULL REFERENCES dispositivo(id) ON DELETE CASCADE,
    numero_canal    SMALLINT NOT NULL,
    nombre          TEXT NOT NULL,
    estado_actual   BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (dispositivo_id, numero_canal)
);

CREATE TABLE accionamiento (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enchufe_id      UUID NOT NULL REFERENCES enchufe(id) ON DELETE CASCADE,
    usuario_id      UUID REFERENCES usuario(id) ON DELETE SET NULL,
    estado_inicial  BOOLEAN NOT NULL,
    estado_final    BOOLEAN NOT NULL,
    fecha_hora      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accionamiento_enchufe ON accionamiento(enchufe_id);

CREATE TABLE calibracion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispositivo_id  UUID NOT NULL REFERENCES dispositivo(id) ON DELETE CASCADE,
    parametro_id    SMALLINT NOT NULL REFERENCES parametro(id),
    fecha_hora      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calibracion_dispositivo ON calibracion(dispositivo_id);

CREATE TABLE punto_calibracion (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calibracion_id      UUID NOT NULL REFERENCES calibracion(id) ON DELETE CASCADE,
    valor_referencia    REAL NOT NULL,
    lectura_antes       REAL NOT NULL,
    lectura_despues     REAL NOT NULL
);

CREATE INDEX idx_punto_calibracion_calibracion ON punto_calibracion(calibracion_id);


CREATE TABLE medicion (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    acuario_id      UUID NOT NULL REFERENCES acuario(id) ON DELETE CASCADE,
    parametro_id    SMALLINT NOT NULL REFERENCES parametro(id),
    dispositivo_id  UUID REFERENCES dispositivo(id) ON DELETE SET NULL,
    valor           REAL NOT NULL,
    marca_temporal  TIMESTAMPTZ NOT NULL,
    origen          origen_medicion NOT NULL,
    fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_medicion_acuario_parametro_tiempo
    ON medicion(acuario_id, parametro_id, marca_temporal);

CREATE UNIQUE INDEX idx_medicion_dispositivo_parametro_marca
    ON medicion(dispositivo_id, parametro_id, marca_temporal)
    WHERE dispositivo_id IS NOT NULL;

CREATE TABLE alerta (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    medicion_id     BIGINT NOT NULL UNIQUE REFERENCES medicion(id) ON DELETE CASCADE,
    tipo_desvio     tipo_desvio NOT NULL,
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_lectura   TIMESTAMPTZ
);

CREATE TABLE entrega_notificacion (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sesion_id       UUID NOT NULL REFERENCES sesion(id) ON DELETE CASCADE,
    alerta_id       BIGINT NOT NULL REFERENCES alerta(id) ON DELETE CASCADE,
    estado          estado_entrega NOT NULL DEFAULT 'PENDIENTE',
    intentos        SMALLINT NOT NULL DEFAULT 0,
    fecha_envio     TIMESTAMPTZ,
    detalle_error   TEXT
);

CREATE INDEX idx_entrega_notificacion_sesion ON entrega_notificacion(sesion_id);
CREATE INDEX idx_entrega_notificacion_alerta ON entrega_notificacion(alerta_id);


CREATE TABLE entrada_bitacora (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acuario_id      UUID NOT NULL REFERENCES acuario(id) ON DELETE CASCADE,
    tipo_evento     tipo_evento_bitacora NOT NULL,
    observacion     TEXT,
    fecha_evento    TIMESTAMPTZ NOT NULL,
    fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entrada_bitacora_acuario_fecha
    ON entrada_bitacora(acuario_id, fecha_evento DESC);

CREATE TABLE imagen (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entrada_bitacora_id UUID NOT NULL REFERENCES entrada_bitacora(id) ON DELETE CASCADE,
    ruta_archivo        TEXT NOT NULL,
    nombre_archivo      TEXT NOT NULL,
    tamano_bytes        INTEGER NOT NULL,
    fecha_carga         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_imagen_entrada_bitacora ON imagen(entrada_bitacora_id);

CREATE TABLE recomendacion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acuario_id      UUID NOT NULL REFERENCES acuario(id) ON DELETE CASCADE,
    parametro_id    SMALLINT NOT NULL REFERENCES parametro(id),
    tipo_hallazgo   tipo_hallazgo NOT NULL,
    descripcion     TEXT NOT NULL,
    periodo_inicio  TIMESTAMPTZ NOT NULL,
    periodo_fin     TIMESTAMPTZ NOT NULL,
    estado          estado_recomendacion NOT NULL DEFAULT 'VIGENTE',
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_resolucion TIMESTAMPTZ,
    CHECK (periodo_inicio < periodo_fin)
);

CREATE INDEX idx_recomendacion_acuario_estado ON recomendacion(acuario_id, estado);


INSERT INTO parametro (codigo, nombre, unidad, tiene_sensor, min_fisico, max_fisico, min_por_defecto, max_por_defecto) VALUES
    ('TEMP',      'Temperatura',   '°C',     true,  0,   40,   24,  28),
    ('PH',        'pH',            'pH',     true,  0,   14,   6.5, 7.5),
    ('COND',      'Conductividad', 'µS/cm',  true,  0,   5000, 200, 500),
    ('AMONIACO',  'Amonio',        'mg/L',   false, 0,   8,    0,   0.25),
    ('NITRITOS',  'Nitritos',      'mg/L',   false, 0,   5,    0,   0.25),
    ('NITRATOS',  'Nitratos',      'mg/L',   false, 0,   200,  0,   40),
    ('DUREZA',    'Dureza',        '°dGH',   false, 0,   30,   4,   12);
