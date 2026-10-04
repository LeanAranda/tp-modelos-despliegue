// Adaptador Cloudflare D1 (SQLite) para el modelo FaaS.
//
// Comparar este archivo con postgres.js es uno de los entregables del trabajo:
// la lógica de negocio no cambió una línea, pero el dialecto SQL, el manejo de
// fechas y la forma de abrir la conexión sí. Ese delta es el costo real de la
// portabilidad entre modelos de servicio.

const SELECT_TURNO = `
  SELECT t.id, t.profesional_id, p.nombre AS profesional_nombre,
         t.paciente_nombre, t.paciente_email, t.fecha_hora,
         t.estado, t.notas, t.creado_en
  FROM turnos t
  JOIN profesionales p ON p.id = t.profesional_id`;

export function crearRepositorioD1(db) {
  if (!db) {
    throw new Error('Falta el binding DB de D1 (revisar wrangler.toml)');
  }

  return {
    nombre: 'd1',

    async ping() {
      try {
        await db.prepare('SELECT 1').first();
        return true;
      } catch (error) {
        console.error('[d1] ping falló:', error.message);
        return false;
      }
    },

    async listarProfesionales() {
      const { results } = await db
        .prepare('SELECT id, nombre, especialidad, activo FROM profesionales ORDER BY nombre')
        .all();
      // SQLite no tiene booleanos: guarda 0 y 1. La traducción va acá y no en la lógica.
      return results.map((p) => ({ ...p, activo: p.activo === 1 }));
    },

    async obtenerProfesional(id) {
      const fila = await db
        .prepare('SELECT id, nombre, especialidad, activo FROM profesionales WHERE id = ?')
        .bind(id)
        .first();
      return fila ? { ...fila, activo: fila.activo === 1 } : null;
    },

    async listarTurnos({ profesionalId, fecha, estado, limite = 100 }) {
      const condiciones = [];
      const valores = [];

      if (profesionalId) {
        condiciones.push('t.profesional_id = ?');
        valores.push(profesionalId);
      }
      if (estado) {
        condiciones.push('t.estado = ?');
        valores.push(estado);
      }
      if (fecha) {
        condiciones.push('substr(t.fecha_hora, 1, 10) = ?');
        valores.push(fecha);
      }
      valores.push(limite);

      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
      const { results } = await db
        .prepare(`${SELECT_TURNO} ${where} ORDER BY t.fecha_hora LIMIT ?`)
        .bind(...valores)
        .all();
      return results;
    },

    async obtenerTurno(id) {
      return db.prepare(`${SELECT_TURNO} WHERE t.id = ?`).bind(id).first();
    },

    async existeTurnoEn(profesionalId, fechaHora) {
      const fila = await db
        .prepare(
          `SELECT 1 AS existe FROM turnos
            WHERE profesional_id = ? AND fecha_hora = ? AND estado <> 'cancelado' LIMIT 1`
        )
        .bind(profesionalId, fechaHora)
        .first();
      return fila != null;
    },

    async crearTurno(datos) {
      const resultado = await db
        .prepare(
          `INSERT INTO turnos
             (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          datos.profesional_id,
          datos.paciente_nombre,
          datos.paciente_email,
          datos.fecha_hora,
          datos.estado,
          datos.notas,
          new Date().toISOString()
        )
        .run();

      const id = resultado.meta?.last_row_id;
      return this.obtenerTurno(id);
    },

    async actualizarEstado(id, estado) {
      const resultado = await db
        .prepare('UPDATE turnos SET estado = ? WHERE id = ?')
        .bind(estado, id)
        .run();
      if ((resultado.meta?.changes ?? 0) === 0) return null;
      return this.obtenerTurno(id);
    },

    async eliminarTurno(id) {
      const resultado = await db.prepare('DELETE FROM turnos WHERE id = ?').bind(id).run();
      return (resultado.meta?.changes ?? 0) > 0;
    },

    async metricas() {
      const { results } = await db
        .prepare('SELECT estado, count(*) AS cantidad FROM turnos GROUP BY estado')
        .all();
      const activos = await db
        .prepare('SELECT count(*) AS cantidad FROM profesionales WHERE activo = 1')
        .first();

      const porEstado = {};
      let total = 0;
      for (const fila of results) {
        porEstado[fila.estado] = fila.cantidad;
        total += fila.cantidad;
      }
      return {
        total_turnos: total,
        por_estado: porEstado,
        profesionales_activos: activos.cantidad,
        origen_datos: 'd1',
      };
    },

    async cerrar() {},
  };
}
