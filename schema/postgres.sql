-- Esquema para PostgreSQL. Lo usan IaaS, PaaS y contenedores.
-- Ejecutar con:  psql "$DATABASE_URL" -f schema/postgres.sql

DROP TABLE IF EXISTS turnos;
DROP TABLE IF EXISTS profesionales;

CREATE TABLE profesionales (
  id           serial PRIMARY KEY,
  nombre       varchar(120) NOT NULL,
  especialidad varchar(80)  NOT NULL,
  activo       boolean      NOT NULL DEFAULT true
);

CREATE TABLE turnos (
  id              serial PRIMARY KEY,
  profesional_id  integer      NOT NULL REFERENCES profesionales(id),
  paciente_nombre varchar(120) NOT NULL,
  paciente_email  varchar(160) NOT NULL,
  fecha_hora      timestamptz  NOT NULL,
  estado          varchar(20)  NOT NULL DEFAULT 'reservado',
  notas           varchar(500) NOT NULL DEFAULT '',
  creado_en       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT estado_valido CHECK (estado IN ('reservado','confirmado','atendido','cancelado'))
);

-- Sin este índice, el listado filtrado hace un recorrido completo de la tabla.
-- Es uno de los puntos a medir en el informe.
CREATE INDEX idx_turnos_fecha       ON turnos (fecha_hora);
CREATE INDEX idx_turnos_profesional ON turnos (profesional_id, fecha_hora);

-- La regla "un profesional no puede tener dos turnos vigentes en el mismo horario"
-- está en la lógica de negocio Y en la base. Las dos capas, a propósito.
CREATE UNIQUE INDEX idx_turnos_sin_superposicion
  ON turnos (profesional_id, fecha_hora)
  WHERE estado <> 'cancelado';
