#!/usr/bin/env node
// Carga el esquema y los datos iniciales.
//
//   node scripts/migrar.mjs                 -> PostgreSQL, usando DATABASE_URL
//   node scripts/migrar.mjs --d1 > sem.sql  -> genera el SQL de semilla para D1
//
// El segundo modo existe porque D1 no acepta conexiones desde Node: sólo se
// carga con wrangler. Así que el script emite el SQL y wrangler lo ejecuta.

import { readFile } from 'node:fs/promises';
import { PROFESIONALES, turnosDeEjemplo } from '../src/core/semilla.js';

const modoD1 = process.argv.includes('--d1');
const sinSemilla = process.argv.includes('--sin-semilla');

const escapar = (texto) => String(texto).replace(/'/g, "''");

function sqlSemillaD1() {
  const lineas = ['-- Generado por scripts/migrar.mjs --d1', ''];

  for (const p of PROFESIONALES) {
    lineas.push(
      `INSERT INTO profesionales (id, nombre, especialidad, activo) VALUES ` +
        `(${p.id}, '${escapar(p.nombre)}', '${escapar(p.especialidad)}', ${p.activo ? 1 : 0});`
    );
  }
  lineas.push('');

  const ahora = new Date().toISOString();
  for (const t of turnosDeEjemplo()) {
    lineas.push(
      `INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas, creado_en) VALUES ` +
        `(${t.profesional_id}, '${escapar(t.paciente_nombre)}', '${escapar(t.paciente_email)}', ` +
        `'${t.fecha_hora}', '${t.estado}', '${escapar(t.notas)}', '${ahora}');`
    );
  }
  return lineas.join('\n');
}

async function migrarPostgres() {
  const { default: pg } = await import('pg');

  const urlConexion = process.env.DATABASE_URL;
  if (!urlConexion) {
    console.error('Falta DATABASE_URL. Ejemplo:');
    console.error('  DATABASE_URL=postgresql://turnero:clave@localhost:5432/turnero node scripts/migrar.mjs');
    process.exit(1);
  }

  const cliente = new pg.Client({
    connectionString: urlConexion,
    ssl: (process.env.PGSSL ?? 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
  });

  await cliente.connect();
  console.log('[migrar] conectado');

  const esquema = await readFile(new URL('../schema/postgres.sql', import.meta.url), 'utf8');
  await cliente.query(esquema);
  console.log('[migrar] esquema aplicado');

  if (!sinSemilla) {
    for (const p of PROFESIONALES) {
      await cliente.query(
        'INSERT INTO profesionales (id, nombre, especialidad, activo) VALUES ($1,$2,$3,$4)',
        [p.id, p.nombre, p.especialidad, p.activo]
      );
    }
    // Reajusta la secuencia: si no, el primer INSERT automático choca con los ids fijos.
    await cliente.query(
      "SELECT setval('profesionales_id_seq', (SELECT max(id) FROM profesionales))"
    );

    for (const t of turnosDeEjemplo()) {
      await cliente.query(
        `INSERT INTO turnos (profesional_id, paciente_nombre, paciente_email, fecha_hora, estado, notas)
         VALUES ($1,$2,$3,$4::timestamptz,$5,$6)`,
        [t.profesional_id, t.paciente_nombre, t.paciente_email, t.fecha_hora, t.estado, t.notas]
      );
    }
    console.log(
      `[migrar] semilla cargada: ${PROFESIONALES.length} profesionales, ${turnosDeEjemplo().length} turnos`
    );
  }

  await cliente.end();
  console.log('[migrar] listo');
}

if (modoD1) {
  console.log(sqlSemillaD1());
} else {
  migrarPostgres().catch((error) => {
    console.error('[migrar] falló:', error.message);
    process.exit(1);
  });
}
