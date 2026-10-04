// Router independiente del runtime.
// Recibe una petición normalizada y devuelve una respuesta normalizada:
//   { metodo, ruta, query, cuerpo }  ->  { status, cabeceras, cuerpo }
// Tanto el servidor de Node como el Worker de Cloudflare usan este mismo router.

import { crearServicio, ErrorDeValidacion, NoEncontrado, Conflicto } from './turnos.js';
import { PAGINA } from './ui.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

function json(status, datos) {
  return { status, cabeceras: JSON_HEADERS, cuerpo: JSON.stringify(datos) };
}

function mapearError(error) {
  if (error instanceof ErrorDeValidacion) {
    return json(400, { error: error.message, campo: error.campo, detalles: error.detalles });
  }
  if (error instanceof NoEncontrado) {
    return json(404, { error: error.message });
  }
  if (error instanceof Conflicto) {
    return json(409, { error: error.message });
  }
  return json(500, { error: 'Error interno del servidor' });
}

/**
 * @param {object} repo  Repositorio de datos (postgres, d1 o memoria)
 * @param {object} entorno  { modelo, adaptadorDatos, adaptadorHttp, version, instancia, region }
 */
export function crearRouter(repo, entorno) {
  const servicio = crearServicio(repo);
  const arranque = Date.now();

  return async function manejar({ metodo, ruta, query = {}, cuerpo = null }) {
    try {
      // ---------- Interfaz web ----------
      if (metodo === 'GET' && (ruta === '/' || ruta === '/index.html')) {
        return { status: 200, cabeceras: HTML_HEADERS, cuerpo: PAGINA };
      }

      // ---------- Sondas y metadatos ----------
      if (metodo === 'GET' && ruta === '/api/health') {
        const inicio = Date.now();
        const vivo = await repo.ping();
        return json(vivo ? 200 : 503, {
          estado: vivo ? 'ok' : 'sin-base-de-datos',
          latencia_bd_ms: Date.now() - inicio,
        });
      }

      if (metodo === 'GET' && ruta === '/api/info') {
        return json(200, {
          aplicacion: 'turnero',
          version: entorno.version,
          modelo_de_servicio: entorno.modelo,
          adaptador_http: entorno.adaptadorHttp,
          adaptador_datos: entorno.adaptadorDatos,
          instancia: entorno.instancia,
          region: entorno.region ?? null,
          arrancado_hace_ms: Date.now() - arranque,
          hora_servidor: new Date().toISOString(),
          grupo: entorno.grupo ?? null,
        });
      }

      // ---------- Profesionales ----------
      if (metodo === 'GET' && ruta === '/api/profesionales') {
        return json(200, await servicio.listarProfesionales());
      }

      // ---------- Turnos ----------
      if (metodo === 'GET' && ruta === '/api/turnos') {
        return json(200, await servicio.listarTurnos(query));
      }

      if (metodo === 'POST' && ruta === '/api/turnos') {
        const creado = await servicio.crearTurno(cuerpo);
        return {
          status: 201,
          cabeceras: { ...JSON_HEADERS, location: `/api/turnos/${creado.id}` },
          cuerpo: JSON.stringify(creado),
        };
      }

      const coincidencia = ruta.match(/^\/api\/turnos\/(\d+)$/);
      if (coincidencia) {
        const id = Number(coincidencia[1]);
        if (metodo === 'GET') return json(200, await servicio.obtenerTurno(id));
        if (metodo === 'PATCH') {
          return json(200, await servicio.cambiarEstado(id, cuerpo?.estado));
        }
        if (metodo === 'DELETE') return json(200, await servicio.eliminarTurno(id));
        return json(405, { error: `Método ${metodo} no permitido en ${ruta}` });
      }

      if (metodo === 'GET' && ruta === '/api/metricas') {
        return json(200, await servicio.metricas());
      }

      return json(404, { error: `Ruta no encontrada: ${metodo} ${ruta}` });
    } catch (error) {
      if (
        !(error instanceof ErrorDeValidacion) &&
        !(error instanceof NoEncontrado) &&
        !(error instanceof Conflicto)
      ) {
        console.error('[turnero] error no controlado:', error);
      }
      return mapearError(error);
    }
  };
}
