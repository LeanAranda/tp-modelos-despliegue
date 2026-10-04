-- Esquema para Cloudflare D1 (SQLite). Lo usa el modelo FaaS.
-- Ejecutar con:  npx wrangler d1 execute turnero --remote --file=schema/d1.sql
--
-- Comparar con schema/postgres.sql: no hay serial, no hay timestamptz,
-- no hay boolean y el índice parcial tiene otra sintaxis. Esas diferencias
-- son parte de lo que hay que documentar en el informe.

DROP TABLE IF EXISTS turnos;
DROP TABLE IF EXISTS profesionales;

CREATE TABLE profesionales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT NOT NULL,
  especialidad TEXT NOT NULL,
  activo       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE turnos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  profesional_id  INTEGER NOT NULL REFERENCES profesionales(id),
  paciente_nombre TEXT NOT NULL,
  paciente_email  TEXT NOT NULL,
  fecha_hora      TEXT NOT NULL,           -- ISO 8601 en UTC, como texto
  estado          TEXT NOT NULL DEFAULT 'reservado',
  notas           TEXT NOT NULL DEFAULT '',
  creado_en       TEXT NOT NULL,
  CHECK (estado IN ('reservado','confirmado','atendido','cancelado'))
);

CREATE INDEX idx_turnos_fecha       ON turnos (fecha_hora);
CREATE INDEX idx_turnos_profesional ON turnos (profesional_id, fecha_hora);
CREATE UNIQUE INDEX idx_turnos_sin_superposicion
  ON turnos (profesional_id, fecha_hora)
  WHERE estado <> 'cancelado';
