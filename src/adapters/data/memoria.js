// Adaptador de datos en memoria.
// No persiste nada: sirve para la primera clase, para las pruebas automáticas
// y para demostrar por qué un sistema de archivos efímero no alcanza.

import { PROFESIONALES, turnosDeEjemplo } from '../../core/semilla.js';

export function crearRepositorioMemoria({ conSemilla = true } = {}) {
  const profesionales = PROFESIONALES.map((p) => ({ ...p }));
  let turnos = [];
  let proximoId = 1;

  if (conSemilla) {
    for (const turno of turnosDeEjemplo()) {
      turnos.push({ id: proximoId++, creado_en: new Date().toISOString(), ...turno });
    }
  }

  const conNombre = (turno) => ({
    ...turno,
    profesional_nombre: profesionales.find((p) => p.id === turno.profesional_id)?.nombre ?? null,
  });

  return {
    nombre: 'memoria',

    async ping() {
      return true;
    },

    async listarProfesionales() {
      return profesionales.map((p) => ({ ...p }));
    },

    async obtenerProfesional(id) {
      const encontrado = profesionales.find((p) => p.id === id);
      return encontrado ? { ...encontrado } : null;
    },

    async listarTurnos({ profesionalId, fecha, estado, limite = 100 }) {
      return turnos
        .filter((t) => (profesionalId ? t.profesional_id === profesionalId : true))
        .filter((t) => (estado ? t.estado === estado : true))
        .filter((t) => (fecha ? t.fecha_hora.startsWith(fecha) : true))
        .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
        .slice(0, limite)
        .map(conNombre);
    },

    async obtenerTurno(id) {
      const encontrado = turnos.find((t) => t.id === id);
      return encontrado ? conNombre(encontrado) : null;
    },

    async existeTurnoEn(profesionalId, fechaHora) {
      return turnos.some(
        (t) =>
          t.profesional_id === profesionalId &&
          t.fecha_hora === fechaHora &&
          t.estado !== 'cancelado'
      );
    },

    async crearTurno(datos) {
      const turno = { id: proximoId++, creado_en: new Date().toISOString(), ...datos };
      turnos.push(turno);
      return conNombre(turno);
    },

    async actualizarEstado(id, estado) {
      const turno = turnos.find((t) => t.id === id);
      if (!turno) return null;
      turno.estado = estado;
      return conNombre(turno);
    },

    async eliminarTurno(id) {
      const antes = turnos.length;
      turnos = turnos.filter((t) => t.id !== id);
      return turnos.length < antes;
    },

    async metricas() {
      const porEstado = {};
      for (const turno of turnos) {
        porEstado[turno.estado] = (porEstado[turno.estado] ?? 0) + 1;
      }
      return {
        total_turnos: turnos.length,
        por_estado: porEstado,
        profesionales_activos: profesionales.filter((p) => p.activo).length,
        origen_datos: 'memoria',
      };
    },

    async cerrar() {},
  };
}
