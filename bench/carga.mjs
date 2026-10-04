#!/usr/bin/env node
// Instrumento de medición del trabajo práctico.
//
// Todos los grupos miden con esta misma herramienta, de modo que los números
// del informe sean comparables entre despliegues y entre grupos.
//
//   node bench/carga.mjs --url https://... --modelo paas
//   node bench/carga.mjs --url http://localhost:3000 --modelo iaas --peticiones 300 --concurrencia 10
//   node bench/carga.mjs --url https://... --modelo faas --salida resultados/faas.json
//
// Mide tres cosas distintas y no hay que confundirlas:
//   1. Arranque en frío: cuánto tarda la PRIMERA petición tras un período de inactividad.
//   2. Latencia en caliente: distribución de tiempos con el servicio ya despierto.
//   3. Comportamiento bajo concurrencia: qué pasa con N peticiones simultáneas.

const argumentos = process.argv.slice(2);

function opcion(nombre, valorPorDefecto = null) {
  const indice = argumentos.indexOf(`--${nombre}`);
  if (indice === -1) return valorPorDefecto;
  const valor = argumentos[indice + 1];
  return valor && !valor.startsWith('--') ? valor : true;
}

const URL_BASE = String(opcion('url', 'http://localhost:3000')).replace(/\/$/, '');
const MODELO = String(opcion('modelo', 'sin-declarar'));
const PETICIONES = Number(opcion('peticiones', 200));
const CONCURRENCIA = Number(opcion('concurrencia', 8));
const RUTA = String(opcion('ruta', '/api/turnos'));
const SALIDA = opcion('salida', null);
const TIEMPO_LIMITE = Number(opcion('timeout', 60_000));

function percentil(ordenados, p) {
  if (ordenados.length === 0) return null;
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return Number(ordenados[Math.max(0, indice)].toFixed(1));
}

async function medirUna(url) {
  const comienzo = performance.now();
  try {
    const respuesta = await fetch(url, {
      signal: AbortSignal.timeout(TIEMPO_LIMITE),
      headers: { 'user-agent': 'turnero-bench/1.0 (UNLa)' },
    });
    await respuesta.arrayBuffer();
    return {
      ms: performance.now() - comienzo,
      status: respuesta.status,
      ok: respuesta.ok,
      instancia: respuesta.headers.get('x-instancia'),
    };
  } catch (error) {
    return { ms: performance.now() - comienzo, status: 0, ok: false, error: error.message };
  }
}

async function enLotes(total, concurrencia, tarea) {
  const resultados = [];
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(concurrencia, total) }, async () => {
    while (siguiente < total) {
      const indice = siguiente++;
      resultados[indice] = await tarea(indice);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

function resumir(muestras) {
  const exitosas = muestras.filter((m) => m.ok);
  const tiempos = exitosas.map((m) => m.ms).sort((a, b) => a - b);
  const suma = tiempos.reduce((a, b) => a + b, 0);
  return {
    peticiones: muestras.length,
    exitosas: exitosas.length,
    fallidas: muestras.length - exitosas.length,
    tasa_error_pct: Number(((1 - exitosas.length / muestras.length) * 100).toFixed(2)),
    min_ms: tiempos.length ? Number(tiempos[0].toFixed(1)) : null,
    p50_ms: percentil(tiempos, 50),
    p95_ms: percentil(tiempos, 95),
    p99_ms: percentil(tiempos, 99),
    max_ms: tiempos.length ? Number(tiempos[tiempos.length - 1].toFixed(1)) : null,
    promedio_ms: tiempos.length ? Number((suma / tiempos.length).toFixed(1)) : null,
    codigos: muestras.reduce((acumulado, m) => {
      const clave = m.status === 0 ? 'error-de-red' : String(m.status);
      acumulado[clave] = (acumulado[clave] ?? 0) + 1;
      return acumulado;
    }, {}),
    instancias: [...new Set(muestras.map((m) => m.instancia).filter(Boolean))],
  };
}

async function ejecutar() {
  console.log('='.repeat(64));
  console.log(`  Prueba de carga  ·  modelo: ${MODELO}`);
  console.log(`  Destino: ${URL_BASE}${RUTA}`);
  console.log(`  ${PETICIONES} peticiones · concurrencia ${CONCURRENCIA}`);
  console.log('='.repeat(64));

  // --- 1. Metadatos del despliegue -------------------------------------
  let info = null;
  try {
    const respuesta = await fetch(`${URL_BASE}/api/info`, {
      signal: AbortSignal.timeout(TIEMPO_LIMITE),
    });
    info = await respuesta.json();
    console.log(`\n[info] adaptador HTTP  : ${info.adaptador_http}`);
    console.log(`[info] adaptador datos : ${info.adaptador_datos}`);
    console.log(`[info] instancia       : ${info.instancia}`);
    console.log(`[info] región          : ${info.region ?? 'no informada'}`);
  } catch (error) {
    console.log(`\n[info] no se pudo leer /api/info: ${error.message}`);
  }

  // --- 2. Arranque en frío ---------------------------------------------
  // Para que esta medición signifique algo, el servicio tiene que haber estado
  // sin tráfico. En Render eso son 15 minutos; en Workers no aplica del mismo modo.
  console.log('\n[frío] primera petición (puede tardar si el servicio estaba dormido)...');
  const frio = await medirUna(`${URL_BASE}${RUTA}`);
  console.log(
    `[frío] ${frio.ms.toFixed(0)} ms · HTTP ${frio.status}${frio.error ? ' · ' + frio.error : ''}`
  );

  // --- 3. Calentamiento -------------------------------------------------
  console.log('[calentamiento] 10 peticiones secuenciales...');
  for (let i = 0; i < 10; i++) await medirUna(`${URL_BASE}${RUTA}`);

  // --- 4. Carga ---------------------------------------------------------
  console.log(`[carga] ejecutando...`);
  const comienzo = performance.now();
  const muestras = await enLotes(PETICIONES, CONCURRENCIA, () => medirUna(`${URL_BASE}${RUTA}`));
  const duracionSegundos = (performance.now() - comienzo) / 1000;

  const resumen = resumir(muestras);
  resumen.duracion_s = Number(duracionSegundos.toFixed(2));
  resumen.peticiones_por_segundo = Number((resumen.exitosas / duracionSegundos).toFixed(1));

  // --- 5. Informe -------------------------------------------------------
  console.log('\n' + '-'.repeat(64));
  console.log(`  arranque en frío       ${frio.ms.toFixed(0).padStart(8)} ms`);
  console.log(`  latencia mínima        ${String(resumen.min_ms).padStart(8)} ms`);
  console.log(`  latencia p50           ${String(resumen.p50_ms).padStart(8)} ms`);
  console.log(`  latencia p95           ${String(resumen.p95_ms).padStart(8)} ms`);
  console.log(`  latencia p99           ${String(resumen.p99_ms).padStart(8)} ms`);
  console.log(`  latencia máxima        ${String(resumen.max_ms).padStart(8)} ms`);
  console.log(`  peticiones por segundo ${String(resumen.peticiones_por_segundo).padStart(8)}`);
  console.log(`  tasa de error          ${String(resumen.tasa_error_pct).padStart(8)} %`);
  console.log(`  códigos HTTP           ${JSON.stringify(resumen.codigos)}`);
  if (resumen.instancias.length > 0) {
    console.log(`  instancias distintas   ${resumen.instancias.length} (${resumen.instancias.join(', ')})`);
  }
  console.log('-'.repeat(64));

  const reporte = {
    medido_en: new Date().toISOString(),
    modelo: MODELO,
    url: `${URL_BASE}${RUTA}`,
    configuracion: { peticiones: PETICIONES, concurrencia: CONCURRENCIA },
    arranque_en_frio_ms: Number(frio.ms.toFixed(1)),
    info_despliegue: info,
    resumen,
  };

  if (SALIDA && SALIDA !== true) {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(SALIDA), { recursive: true });
    await writeFile(SALIDA, JSON.stringify(reporte, null, 2));
    console.log(`\n[salida] resultados guardados en ${SALIDA}`);
  }

  if (resumen.tasa_error_pct > 0) {
    console.log('\nATENCIÓN: hubo peticiones fallidas. Antes de informar el número,');
    console.log('averiguá si fue el servicio, la base de datos o un límite del plan gratuito.');
  }
}

ejecutar().catch((error) => {
  console.error('La prueba de carga falló:', error);
  process.exit(1);
});
