// Punto de entrada para Cloudflare Workers (modelo FaaS).
//
// Diferencias con servidor.js que conviene mirar de cerca:
//   - No hay proceso de larga vida: no existe "arrancar el servidor".
//   - No hay process.env: la configuración llega como argumento en cada invocación.
//   - No hay node:os, node:http ni sistema de archivos.
//   - El repositorio se construye en CADA petición, no una vez al inicio.
// La lógica de negocio y el router, en cambio, son exactamente los mismos módulos.

import { crearRouter } from '../../core/router.js';
import { crearRepositorioD1 } from '../data/d1.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    let cuerpo = null;
    if (['POST', 'PATCH', 'PUT'].includes(request.method)) {
      const texto = await request.text();
      if (texto) {
        try {
          cuerpo = JSON.parse(texto);
        } catch {
          return new Response(JSON.stringify({ error: 'El cuerpo no es JSON válido' }), {
            status: 400,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }
      }
    }

    const repo = crearRepositorioD1(env.DB);
    const router = crearRouter(repo, {
      version: env.APP_VERSION ?? '1.0.0',
      modelo: 'faas',
      adaptadorHttp: 'cloudflare-workers',
      adaptadorDatos: 'd1',
      // En FaaS no hay "instancia": hay una invocación en un centro de datos.
      instancia: `worker@${request.cf?.colo ?? 'desconocido'}`,
      region: request.cf?.colo ?? null,
      grupo: env.GRUPO ?? null,
    });

    const comienzo = Date.now();
    const salida = await router({
      metodo: request.method,
      ruta: url.pathname,
      query: Object.fromEntries(url.searchParams),
      cuerpo,
    });

    return new Response(salida.cuerpo, {
      status: salida.status,
      headers: {
        ...salida.cabeceras,
        'x-tiempo-ms': String(Date.now() - comienzo),
        'x-instancia': `worker@${request.cf?.colo ?? 'desconocido'}`,
      },
    });
  },
};
