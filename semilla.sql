-- Generado por scripts/migrar.mjs --d1

INSERT INTO profesionales (id, nombre, especialidad, activo) VALUES (1, 'Dra. Adriana Ferreyra', 'Clínica médica', 1);
INSERT INTO profesionales (id, nombre, especialidad, activo) VALUES (2, 'Dr. Martín Quiroga', 'Traumatología', 1);
INSERT INTO profesionales (id, nombre, especialidad, activo) VALUES (3, 'Lic. Paula Benítez', 'Nutrición', 1);
INSERT INTO profesionales (id, nombre, especialidad, activo) VALUES (4, 'Dr. Esteban Roldán', 'Cardiología', 1);
INSERT INTO profesionales (id, nombre, especialidad, activo) VALUES (5, 'Dra. Inés Colombo', 'Dermatología', 0);

INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (1, 'Rocío Almada', 'rocio.almada@ejemplo.com', '2026-10-26T09:00:00Z', 'confirmado', 'Control anual', '2026-10-24T22:21:52.577Z');
INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (1, 'Julián Costa', 'julian.costa@ejemplo.com', '2026-10-26T09:30:00Z', 'reservado', '', '2026-10-24T22:21:52.577Z');
INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (2, 'Mariana Tévez', 'mariana.tevez@ejemplo.com', '2026-10-26T10:00:00Z', 'reservado', 'Dolor lumbar', '2026-10-24T22:21:52.577Z');
INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (3, 'Federico Ledesma', 'f.ledesma@ejemplo.com', '2026-10-27T09:00:00Z', 'confirmado', '', '2026-10-24T22:21:52.577Z');
INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (4, 'Sofía Barrionuevo', 'sofia.b@ejemplo.com', '2026-10-27T11:30:00Z', 'reservado', 'Trae electrocardiograma', '2026-10-24T22:21:52.577Z');
INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (2, 'Gonzalo Iturbe', 'gonzalo.iturbe@ejemplo.com', '2026-10-28T10:30:00Z', 'cancelado', 'Reprograma', '2026-10-24T22:21:52.577Z');
INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (1, 'Lucía Maidana', 'lucia.maidana@ejemplo.com', '2026-10-28T12:00:00Z', 'atendido', '', '2026-10-24T22:21:52.577Z');
INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES (3, 'Ramiro Pérez', 'ramiro.perez@ejemplo.com', '2026-10-29T09:30:00Z', 'reservado', 'Primera consulta', '2026-10-24T22:21:52.577Z');
