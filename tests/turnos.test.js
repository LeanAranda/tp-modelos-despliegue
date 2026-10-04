import test from 'node:test';
import assert from 'node:assert/strict';

import { crearRepositorioMemoria } from '../src/adapters/data/memoria.js';
import { crearServicio, normalizarFechaHora } from '../src/core/turnos.js';
import { crearRouter } from '../src/core/router.js';

const ENTORNO = {
  version: 'test',
  modelo: 'test',
  adaptadorHttp: 'test',
  adaptadorDatos: 'memoria',
  instancia: 'test',
};

function nuevoServicio() {
  return crearServicio(crearRepositorioMemoria({ conSemilla: false }));
}

function turnoValido(extras = {}) {
  return {
    profesional_id: 1,
    paciente_nombre: 'Ana Gómez',
    paciente_email: 'ana.gomez@ejemplo.com',
    fecha_hora: '2026-12-15T13:00:00Z',
    notas: 'Control',
    ...extras,
  };
}

test('normaliza una fecha ISO válida', () => {
  assert.equal(normalizarFechaHora('2026-12-15T13:00:00.000Z'), '2026-12-15T13:00:00Z');
});

test('rechaza horarios que no caen en la grilla de 30 minutos', () => {
  assert.throws(() => normalizarFechaHora('2026-12-15T13:17:00Z'), /30 minutos/);
});

test('crea un turno con datos válidos', async () => {
  const servicio = nuevoServicio();
  const creado = await servicio.crearTurno(turnoValido());
  assert.equal(creado.estado, 'reservado');
  assert.equal(creado.paciente_email, 'ana.gomez@ejemplo.com');
  assert.equal(creado.profesional_nombre, 'Dra. Adriana Ferreyra');
});

test('normaliza el correo a minúsculas', async () => {
  const servicio = nuevoServicio();
  const creado = await servicio.crearTurno(turnoValido({ paciente_email: 'ANA@Ejemplo.COM' }));
  assert.equal(creado.paciente_email, 'ana@ejemplo.com');
});

test('rechaza un correo inválido y detalla el campo', async () => {
  const servicio = nuevoServicio();
  await assert.rejects(
    () => servicio.crearTurno(turnoValido({ paciente_email: 'no-es-un-correo' })),
    (error) => {
      assert.equal(error.name, 'ErrorDeValidacion');
      assert.ok(error.detalles.some((d) => d.campo === 'paciente_email'));
      return true;
    }
  );
});

test('rechaza un nombre demasiado corto', async () => {
  const servicio = nuevoServicio();
  await assert.rejects(() => servicio.crearTurno(turnoValido({ paciente_nombre: 'Al' })), /no son válidos/);
});

test('no permite dos turnos del mismo profesional en el mismo horario', async () => {
  const servicio = nuevoServicio();
  await servicio.crearTurno(turnoValido());
  await assert.rejects(() => servicio.crearTurno(turnoValido()), /ya tiene un turno/);
});

test('sí permite el mismo horario con otro profesional', async () => {
  const servicio = nuevoServicio();
  await servicio.crearTurno(turnoValido());
  const otro = await servicio.crearTurno(turnoValido({ profesional_id: 2 }));
  assert.equal(otro.profesional_id, 2);
});

test('rechaza turnos con un profesional inactivo', async () => {
  const servicio = nuevoServicio();
  await assert.rejects(() => servicio.crearTurno(turnoValido({ profesional_id: 5 })), /no está tomando turnos/);
});

test('rechaza turnos con un profesional inexistente', async () => {
  const servicio = nuevoServicio();
  await assert.rejects(() => servicio.crearTurno(turnoValido({ profesional_id: 99 })), /No existe el profesional/);
});

test('cambia el estado de un turno', async () => {
  const servicio = nuevoServicio();
  const creado = await servicio.crearTurno(turnoValido());
  const actualizado = await servicio.cambiarEstado(creado.id, 'confirmado');
  assert.equal(actualizado.estado, 'confirmado');
});

test('un turno atendido no vuelve atrás', async () => {
  const servicio = nuevoServicio();
  const creado = await servicio.crearTurno(turnoValido());
  await servicio.cambiarEstado(creado.id, 'atendido');
  await assert.rejects(() => servicio.cambiarEstado(creado.id, 'cancelado'), /ya atendido/);
});

test('un horario liberado por cancelación se puede volver a reservar', async () => {
  const servicio = nuevoServicio();
  const creado = await servicio.crearTurno(turnoValido());
  await servicio.cambiarEstado(creado.id, 'cancelado');
  const nuevo = await servicio.crearTurno(turnoValido({ paciente_nombre: 'Otro Paciente' }));
  assert.equal(nuevo.estado, 'reservado');
});

test('filtra turnos por estado y por fecha', async () => {
  const servicio = nuevoServicio();
  await servicio.crearTurno(turnoValido());
  await servicio.crearTurno(turnoValido({ profesional_id: 2, fecha_hora: '2026-12-16T13:00:00Z' }));

  assert.equal((await servicio.listarTurnos({ fecha: '2026-12-15' })).length, 1);
  assert.equal((await servicio.listarTurnos({ estado: 'reservado' })).length, 2);
  assert.equal((await servicio.listarTurnos({ profesional_id: 2 })).length, 1);
});

test('rechaza un filtro de fecha mal formado', async () => {
  const servicio = nuevoServicio();
  await assert.rejects(() => servicio.listarTurnos({ fecha: '15/12/2026' }), /AAAA-MM-DD/);
});

test('el router devuelve 201 al crear y 409 si el horario está ocupado', async () => {
  const router = crearRouter(crearRepositorioMemoria({ conSemilla: false }), ENTORNO);

  const primera = await router({ metodo: 'POST', ruta: '/api/turnos', cuerpo: turnoValido() });
  assert.equal(primera.status, 201);

  const segunda = await router({ metodo: 'POST', ruta: '/api/turnos', cuerpo: turnoValido() });
  assert.equal(segunda.status, 409);
});

test('el router devuelve 404 en una ruta inexistente', async () => {
  const router = crearRouter(crearRepositorioMemoria(), ENTORNO);
  const salida = await router({ metodo: 'GET', ruta: '/api/no-existe' });
  assert.equal(salida.status, 404);
});

test('el router informa el modelo de servicio en /api/info', async () => {
  const router = crearRouter(crearRepositorioMemoria(), { ...ENTORNO, modelo: 'faas' });
  const salida = await router({ metodo: 'GET', ruta: '/api/info' });
  const datos = JSON.parse(salida.cuerpo);
  assert.equal(salida.status, 200);
  assert.equal(datos.modelo_de_servicio, 'faas');
  assert.equal(datos.adaptador_datos, 'memoria');
});

test('el router sirve la interfaz web en la raíz', async () => {
  const router = crearRouter(crearRepositorioMemoria(), ENTORNO);
  const salida = await router({ metodo: 'GET', ruta: '/' });
  assert.equal(salida.status, 200);
  assert.match(salida.cabeceras['content-type'], /text\/html/);
  assert.match(salida.cuerpo, /Turnero/);
});

test('la semilla carga ocho turnos y cinco profesionales', async () => {
  const servicio = crearServicio(crearRepositorioMemoria());
  assert.equal((await servicio.listarProfesionales()).length, 5);
  assert.equal((await servicio.listarTurnos({})).length, 8);
  const metricas = await servicio.metricas();
  assert.equal(metricas.total_turnos, 8);
  assert.equal(metricas.profesionales_activos, 4);
});
