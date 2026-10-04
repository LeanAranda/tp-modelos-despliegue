// Adaptador PostgreSQL. Lo usan tres de los cuatro modelos:
//   IaaS          -> PostgreSQL instalado a mano dentro de la máquina virtual
//   PaaS          -> PostgreSQL administrado (Neon)
//   Contenedores  -> PostgreSQL como contenedor del mismo compose
// El código es idéntico en los tres: lo único que cambia es DATABASE_URL.

import pg from 'pg';

const { Pool } = pg;

export function crearRepositorioPostgres({ urlConexion, ssl }) {
  if (!urlConexion) {
    throw new Error('Falta la variable de entorno DATABASE_URL');
  }

  const pool = new Pool({
    connectionString: urlConexion,
    // Los servicios administrados exigen TLS; PostgreSQL local normalmente no lo tiene.
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PGPOOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (error) => {
    console.error('[postgres] error en el pool de conexiones:', error.message);
  });

  const SELECT_TURNO = `
    SELECT t.id, t.profesional_id, p.nombre AS profesional_nombre,
           t.paciente_nombre, t.paciente_email,
           to_char(t.fecha_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha_hora,
           t.estado, t.notas,
           to_char(t.creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS creado_en
    FROM turnos t
    JOIN profesionales p ON p.id = t.profesional_id`;

  return {
    nombre: 'postgres',

    async ping() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch (error) {
        console.error('[postgres] ping falló:', error.message);
        return false;
      }
    },

    async listarProfesionales() {
      const { rows } = await pool.query(
        'SELECT id, nombre, especialidad, activo FROM profesionales ORDER BY nombre'
      );
      return rows;
    },

    async obtenerProfesional(id) {
      const { rows } = await pool.query(
        'SELECT id, nombre, especialidad, activo FROM profesionales WHERE id = $1',
        [id]
      );
      return rows[0] ?? null;
    },

    async listarTurnos({ profesionalId, fecha, estado, limite = 100 }) {
      const condiciones = [];
      const valores = [];

      if (profesionalId) {
        valores.push(profesionalId);
        condiciones.push(`t.profesional_id = $${valores.length}`);
      }
      if (estado) {
        valores.push(estado);
        condiciones.push(`t.estado = $${valores.length}`);
      }
      if (fecha) {
        valores.push(fecha);
        condiciones.push(`(t.fecha_hora AT TIME ZONE 'UTC')::date = $${valores.length}::date`);
      }
      valores.push(limite);

      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `${SELECT_TURNO} ${where} ORDER BY t.fecha_hora LIMIT $${valores.length}`,
        valores
      );
      return rows;
    },

    async obtenerTurno(id) {
      const { rows } = await pool.query(`${SELECT_TURNO} WHERE t.id = $1`, [id]);
      return rows[0] ?? null;
    },

    async existeTurnoEn(profesionalId, fechaHora) {
      const { rows } = await pool.query(
        `SELECT 1 FROM turnos
          WHERE profesional_id = $1 AND fecha_hora = $2::timestamptz AND estado <> 'cancelado'
          LIMIT 1`,
        [profesionalId, fechaHora]
      );
      return rows.length > 0;
    },

    async crearTurno(datos) {
      const { rows } = await pool.query(
        `INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas)
         VALUES ($1, $2, $3, $4::timestamptz, $5, $6)
         RETURNING id`,
        [
          datos.profesional_id,
          datos.paciente_nombre,
          datos.paciente_email,
          datos.fecha_hora,
          datos.estado,
          datos.notas,
        ]
      );
      return this.obtenerTurno(rows[0].id);
    },

    async actualizarEstado(id, estado) {
      const { rowCount } = await pool.query('UPDATE turnos SET estado = $1 WHERE id = $2', [
        estado,
        id,
      ]);
      return rowCount === 0 ? null : this.obtenerTurno(id);
    },

    async eliminarTurno(id) {
      const { rowCount } = await pool.query('DELETE FROM turnos WHERE id = $1', [id]);
      return rowCount > 0;
    },

    async metricas() {
      const { rows } = await pool.query(
        `SELECT estado, count(*)::int AS cantidad FROM turnos GROUP BY estado`
      );
      const activos = await pool.query(
        'SELECT count(*)::int AS cantidad FROM profesionales WHERE activo'
      );
      const porEstado = {};
      let total = 0;
      for (const fila of rows) {
        porEstado[fila.estado] = fila.cantidad;
        total += fila.cantidad;
      }
      return {
        total_turnos: total,
        por_estado: porEstado,
        profesionales_activos: activos.rows[0].cantidad,
        origen_datos: 'postgres',
      };
    },

    async cerrar() {
      await pool.end();
    },
  };
}
