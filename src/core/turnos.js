// Lógica de negocio del turnero.
// No conoce HTTP ni la base de datos: recibe un repositorio y devuelve datos.
// Es la pieza que NO cambia entre los cuatro modelos de servicio.

export class ErrorDeValidacion extends Error {
  constructor(mensaje, campo) {
    super(mensaje);
    this.name = 'ErrorDeValidacion';
    this.campo = campo;
  }
}

export class NoEncontrado extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'NoEncontrado';
  }
}

export class Conflicto extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'Conflicto';
  }
}

export const ESTADOS = ['reservado', 'confirmado', 'atendido', 'cancelado'];

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DURACION_MINUTOS = 30;

/** Normaliza una fecha ISO a minutos exactos y valida que sea un horario posible. */
export function normalizarFechaHora(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErrorDeValidacion('La fecha y hora del turno es obligatoria', 'fecha_hora');
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorDeValidacion('La fecha y hora no tiene un formato ISO 8601 válido', 'fecha_hora');
  }
  if (fecha.getUTCSeconds() !== 0 || fecha.getUTCMilliseconds() !== 0) {
    throw new ErrorDeValidacion('El turno debe empezar en un minuto exacto', 'fecha_hora');
  }
  if (fecha.getUTCMinutes() % DURACION_MINUTOS !== 0) {
    throw new ErrorDeValidacion(
      `Los turnos se agendan cada ${DURACION_MINUTOS} minutos`,
      'fecha_hora'
    );
  }
  return fecha.toISOString().replace('.000Z', 'Z');
}

function validarAlta(datos) {
  const errores = [];

  const nombre = typeof datos.paciente_nombre === 'string' ? datos.paciente_nombre.trim() : '';
  if (nombre.length < 3) {
    errores.push({ campo: 'paciente_nombre', mensaje: 'El nombre debe tener al menos 3 caracteres' });
  }
  if (nombre.length > 120) {
    errores.push({ campo: 'paciente_nombre', mensaje: 'El nombre no puede superar los 120 caracteres' });
  }

  const email = typeof datos.paciente_email === 'string' ? datos.paciente_email.trim().toLowerCase() : '';
  if (!RE_EMAIL.test(email)) {
    errores.push({ campo: 'paciente_email', mensaje: 'El correo electrónico no es válido' });
  }

  const profesionalId = Number(datos.profesional_id);
  if (!Number.isInteger(profesionalId) || profesionalId <= 0) {
    errores.push({ campo: 'profesional_id', mensaje: 'Hay que indicar un profesional válido' });
  }

  let fechaHora = null;
  try {
    fechaHora = normalizarFechaHora(datos.fecha_hora);
  } catch (error) {
    errores.push({ campo: error.campo ?? 'fecha_hora', mensaje: error.message });
  }

  const notas = typeof datos.notas === 'string' ? datos.notas.trim().slice(0, 500) : '';

  return { errores, valores: { nombre, email, profesionalId, fechaHora, notas } };
}

export function crearServicio(repo) {
  return {
    async listarProfesionales() {
      return repo.listarProfesionales();
    },

    async listarTurnos(filtros = {}) {
      const limpios = {};
      if (filtros.profesional_id != null && filtros.profesional_id !== '') {
        const id = Number(filtros.profesional_id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new ErrorDeValidacion('El filtro de profesional no es válido', 'profesional_id');
        }
        limpios.profesionalId = id;
      }
      if (filtros.fecha != null && filtros.fecha !== '') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(filtros.fecha)) {
          throw new ErrorDeValidacion('El filtro de fecha debe tener formato AAAA-MM-DD', 'fecha');
        }
        limpios.fecha = filtros.fecha;
      }
      if (filtros.estado != null && filtros.estado !== '') {
        if (!ESTADOS.includes(filtros.estado)) {
          throw new ErrorDeValidacion(`Estado desconocido: ${filtros.estado}`, 'estado');
        }
        limpios.estado = filtros.estado;
      }
      const limite = Number(filtros.limite ?? 100);
      limpios.limite = Number.isInteger(limite) && limite > 0 && limite <= 500 ? limite : 100;
      return repo.listarTurnos(limpios);
    },

    async obtenerTurno(id) {
      const turno = await repo.obtenerTurno(Number(id));
      if (!turno) throw new NoEncontrado(`No existe el turno ${id}`);
      return turno;
    },

    async crearTurno(datos) {
      const { errores, valores } = validarAlta(datos ?? {});
      if (errores.length > 0) {
        const error = new ErrorDeValidacion('Los datos del turno no son válidos');
        error.detalles = errores;
        throw error;
      }

      const profesional = await repo.obtenerProfesional(valores.profesionalId);
      if (!profesional) {
        throw new NoEncontrado(`No existe el profesional ${valores.profesionalId}`);
      }
      if (profesional.activo === false || profesional.activo === 0) {
        throw new Conflicto(`El profesional ${profesional.nombre} no está tomando turnos`);
      }

      const ocupado = await repo.existeTurnoEn(valores.profesionalId, valores.fechaHora);
      if (ocupado) {
        throw new Conflicto('Ese profesional ya tiene un turno reservado en ese horario');
      }

      return repo.crearTurno({
        profesional_id: valores.profesionalId,
        paciente_nombre: valores.nombre,
        paciente_email: valores.email,
        fecha_hora: valores.fechaHora,
        notas: valores.notas,
        estado: 'reservado',
      });
    },

    async cambiarEstado(id, estado) {
      if (!ESTADOS.includes(estado)) {
        throw new ErrorDeValidacion(
          `Estado inválido. Valores admitidos: ${ESTADOS.join(', ')}`,
          'estado'
        );
      }
      const turno = await repo.obtenerTurno(Number(id));
      if (!turno) throw new NoEncontrado(`No existe el turno ${id}`);
      if (turno.estado === 'atendido' && estado !== 'atendido') {
        throw new Conflicto('Un turno ya atendido no puede cambiar de estado');
      }
      return repo.actualizarEstado(Number(id), estado);
    },

    async eliminarTurno(id) {
      const borrado = await repo.eliminarTurno(Number(id));
      if (!borrado) throw new NoEncontrado(`No existe el turno ${id}`);
      return { id: Number(id), eliminado: true };
    },

    async metricas() {
      return repo.metricas();
    },
  };
}
