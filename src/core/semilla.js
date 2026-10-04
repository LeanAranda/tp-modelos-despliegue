// Datos iniciales comunes a los tres adaptadores.
// Todos los grupos arrancan con exactamente el mismo estado.

export const PROFESIONALES = [
  { id: 1, nombre: 'Dra. Adriana Ferreyra', especialidad: 'Clínica médica', activo: true },
  { id: 2, nombre: 'Dr. Martín Quiroga', especialidad: 'Traumatología', activo: true },
  { id: 3, nombre: 'Lic. Paula Benítez', especialidad: 'Nutrición', activo: true },
  { id: 4, nombre: 'Dr. Esteban Roldán', especialidad: 'Cardiología', activo: true },
  { id: 5, nombre: 'Dra. Inés Colombo', especialidad: 'Dermatología', activo: false },
];

/** Turnos de ejemplo, anclados al lunes siguiente para que siempre sean futuros. */
export function turnosDeEjemplo(referencia = new Date()) {
  const base = new Date(Date.UTC(
    referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate(), 9, 0, 0, 0
  ));
  base.setUTCDate(base.getUTCDate() + ((8 - base.getUTCDay()) % 7 || 7));

  const en = (dias, horas, minutos) => {
    const f = new Date(base);
    f.setUTCDate(f.getUTCDate() + dias);
    f.setUTCHours(9 + horas, minutos, 0, 0);
    return f.toISOString().replace('.000Z', 'Z');
  };

  return [
    { profesional_id: 1, paciente_nombre: 'Rocío Almada',      paciente_email: 'rocio.almada@ejemplo.com',   fecha_hora: en(0, 0, 0),  estado: 'confirmado', notas: 'Control anual' },
    { profesional_id: 1, paciente_nombre: 'Julián Costa',      paciente_email: 'julian.costa@ejemplo.com',   fecha_hora: en(0, 0, 30), estado: 'reservado',  notas: '' },
    { profesional_id: 2, paciente_nombre: 'Mariana Tévez',     paciente_email: 'mariana.tevez@ejemplo.com',  fecha_hora: en(0, 1, 0),  estado: 'reservado',  notas: 'Dolor lumbar' },
    { profesional_id: 3, paciente_nombre: 'Federico Ledesma',  paciente_email: 'f.ledesma@ejemplo.com',      fecha_hora: en(1, 0, 0),  estado: 'confirmado', notas: '' },
    { profesional_id: 4, paciente_nombre: 'Sofía Barrionuevo', paciente_email: 'sofia.b@ejemplo.com',        fecha_hora: en(1, 2, 30), estado: 'reservado',  notas: 'Trae electrocardiograma' },
    { profesional_id: 2, paciente_nombre: 'Gonzalo Iturbe',    paciente_email: 'gonzalo.iturbe@ejemplo.com', fecha_hora: en(2, 1, 30), estado: 'cancelado',  notas: 'Reprograma' },
    { profesional_id: 1, paciente_nombre: 'Lucía Maidana',     paciente_email: 'lucia.maidana@ejemplo.com',  fecha_hora: en(2, 3, 0),  estado: 'atendido',   notas: '' },
    { profesional_id: 3, paciente_nombre: 'Ramiro Pérez',      paciente_email: 'ramiro.perez@ejemplo.com',   fecha_hora: en(3, 0, 30), estado: 'reservado',  notas: 'Primera consulta' },
  ];
}
