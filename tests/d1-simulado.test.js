// Verifica el adaptador D1 y el punto de entrada del Worker sin necesidad de
// desplegar en Cloudflare: simula el binding D1 sobre SQLite local.
//
// Ejecutar con:  node --experimental-sqlite --test tests/d1-simulado.test.js
//
// No reemplaza al despliegue real (no prueba la red, ni los límites del plan,
// ni el arranque en frío), pero sí verifica que el SQL de schema/d1.sql sea
// SQLite válido y que el adaptador devuelva lo que el núcleo espera.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../src/adapters/http/worker.js';

/** Imita la interfaz de D1 (prepare/bind/all/first/run) sobre SQLite. */
function crearD1Simulado() {
  const db = new DatabaseSync(':memory:');

  const esquema = readFileSync(new URL('../schema/d1.sql', import.meta.url), 'utf8');
  for (const sentencia of esquema.split(';')) {
    const limpia = sentencia.trim();
    if (limpia && !limpia.startsWith('--')) db.exec(limpia + ';');
  }

  return {
    prepare(sql) {
      let parametros = [];
      const api = {
        bind(...valores) {
          parametros = valores;
          return api;
        },
        all() {
          return Promise.resolve({ results: db.prepare(sql).all(...parametros) });
        },
        first() {
          return Promise.resolve(db.prepare(sql).get(...parametros) ?? null);
        },
        run() {
          const salida = db.prepare(sql).run(...parametros);
          return Promise.resolve({
            meta: {
              last_row_id: Number(salida.lastInsertRowid),
              changes: Number(salida.changes),
            },
          });
        },
      };
      return api;
    },
    _sqlite: db,
  };
}

function entornoSimulado() {
  return { DB: crearD1Simulado(), APP_VERSION: '1.0.0', GRUPO: 'grupo-prueba' };
}

const pedir = (env, metodo, ruta, cuerpo) =>
  worker.fetch(
    new Request(`https://turnero.workers.dev${ruta}`, {
      method: metodo,
      headers: cuerpo ? { 'content-type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }),
    env,
    {}
  );

test('el esquema de D1 es SQLite válido y crea las dos tablas', () => {
  const env = entornoSimulado();
  const tablas = env.DB._sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((f) => f.name);
  assert.ok(tablas.includes('profesionales'));
  assert.ok(tablas.includes('turnos'));
});

test('el Worker responde /api/info declarando el modelo faas', async () => {
  const respuesta = await pedir(entornoSimulado(), 'GET', '/api/info');
  const datos = await respuesta.json();
  assert.equal(respuesta.status, 200);
  assert.equal(datos.modelo_de_servicio, 'faas');
  assert.equal(datos.adaptador_http, 'cloudflare-workers');
  assert.equal(datos.adaptador_datos, 'd1');
  assert.equal(datos.grupo, 'grupo-prueba');
});

test('el Worker sirve la interfaz web', async () => {
  const respuesta = await pedir(entornoSimulado(), 'GET', '/');
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type'), /text\/html/);
});

test('el adaptador D1 traduce el booleano de SQLite', async () => {
  const env = entornoSimulado();
  env.DB._sqlite.exec(
    "INSERT INTO profesionales (id,nombre,especialidad,activo) VALUES (1,'Dra. Prueba','Clínica',1),(5,'Dra. Inactiva','Derma',0)"
  );
  const respuesta = await pedir(env, 'GET', '/api/profesionales');
  const lista = await respuesta.json();
  assert.equal(lista.find((p) => p.id === 1).activo, true);
  assert.equal(lista.find((p) => p.id === 5).activo, false);
});

test('el Worker crea un turno y lo recupera', async () => {
  const env = entornoSimulado();
  env.DB._sqlite.exec(
    "INSERT INTO profesionales (id,nombre,especialidad,activo) VALUES (1,'Dra. Prueba','Clínica',1)"
  );

  const creado = await pedir(env, 'POST', '/api/turnos', {
    profesional_id: 1,
    paciente_nombre: 'Ana Gómez',
    paciente_email: 'ana@ejemplo.com',
    fecha_hora: '2026-12-15T13:00:00Z',
  });
  assert.equal(creado.status, 201);
  const turno = await creado.json();
  assert.equal(turno.estado, 'reservado');
  assert.equal(turno.profesional_nombre, 'Dra. Prueba');

  const listado = await (await pedir(env, 'GET', '/api/turnos')).json();
  assert.equal(listado.length, 1);
});

test('el Worker rechaza el horario duplicado con 409', async () => {
  const env = entornoSimulado();
  env.DB._sqlite.exec(
    "INSERT INTO profesionales (id,nombre,especialidad,activo) VALUES (1,'Dra. Prueba','Clínica',1)"
  );
  const cuerpo = {
    profesional_id: 1,
    paciente_nombre: 'Ana Gómez',
    paciente_email: 'ana@ejemplo.com',
    fecha_hora: '2026-12-15T13:00:00Z',
  };
  assert.equal((await pedir(env, 'POST', '/api/turnos', cuerpo)).status, 201);
  assert.equal((await pedir(env, 'POST', '/api/turnos', cuerpo)).status, 409);
});

test('el filtro por fecha funciona con el dialecto de SQLite', async () => {
  const env = entornoSimulado();
  env.DB._sqlite.exec(
    "INSERT INTO profesionales (id,nombre,especialidad,activo) VALUES (1,'Dra. Prueba','Clínica',1)"
  );
  for (const fecha of ['2026-12-15T13:00:00Z', '2026-12-16T13:00:00Z']) {
    await pedir(env, 'POST', '/api/turnos', {
      profesional_id: 1,
      paciente_nombre: 'Ana Gómez',
      paciente_email: 'ana@ejemplo.com',
      fecha_hora: fecha,
    });
  }
  const filtrados = await (await pedir(env, 'GET', '/api/turnos?fecha=2026-12-15')).json();
  assert.equal(filtrados.length, 1);
});

test('el Worker cambia el estado de un turno', async () => {
  const env = entornoSimulado();
  env.DB._sqlite.exec(
    "INSERT INTO profesionales (id,nombre,especialidad,activo) VALUES (1,'Dra. Prueba','Clínica',1)"
  );
  const turno = await (
    await pedir(env, 'POST', '/api/turnos', {
      profesional_id: 1,
      paciente_nombre: 'Ana Gómez',
      paciente_email: 'ana@ejemplo.com',
      fecha_hora: '2026-12-15T13:00:00Z',
    })
  ).json();

  const actualizado = await pedir(env, 'PATCH', `/api/turnos/${turno.id}`, { estado: 'confirmado' });
  assert.equal(actualizado.status, 200);
  assert.equal((await actualizado.json()).estado, 'confirmado');
});

test('el Worker devuelve 404 en una ruta inexistente', async () => {
  const respuesta = await pedir(entornoSimulado(), 'GET', '/api/no-existe');
  assert.equal(respuesta.status, 404);
});
