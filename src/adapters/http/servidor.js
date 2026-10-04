// Servidor HTTP sobre el módulo node:http.
// Lo usan tres modelos: IaaS (systemd en la máquina virtual), PaaS (Render)
// y contenedores (Docker / Kubernetes). El mismo binario, tres formas de operarlo.

import { createServer } from 'node:http';
import { hostname } from 'node:os';

import { crearRouter } from '../../core/router.js';
import { crearRepositorioMemoria } from '../data/memoria.js';
import { crearRepositorioPostgres } from '../data/postgres.js';

const VERSION = process.env.APP_VERSION ?? '1.0.0';
const PUERTO = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const LIMITE_CUERPO = 64 * 1024;

function elegirRepositorio() {
  const origen = (process.env.DATA_SOURCE ?? 'memoria').toLowerCase();
  if (origen === 'postgres') {
    return crearRepositorioPostgres({
      urlConexion: process.env.DATABASE_URL,
      // Neon y cualquier PostgreSQL administrado exigen TLS. El de la VM o el
      // del contenedor, no. Por eso es una variable y no una constante.
      ssl: (process.env.PGSSL ?? 'false').toLowerCase() === 'true',
    });
  }
  if (origen === 'memoria') return crearRepositorioMemoria();
  throw new Error(`DATA_SOURCE desconocido: ${origen} (usar "memoria" o "postgres")`);
}

function leerCuerpo(peticion) {
  return new Promise((resolver, rechazar) => {
    const partes = [];
    let tamano = 0;
    peticion.on('data', (parte) => {
      tamano += parte.length;
      if (tamano > LIMITE_CUERPO) {
        rechazar(new Error('Cuerpo de la petición demasiado grande'));
        peticion.destroy();
        return;
      }
      partes.push(parte);
    });
    peticion.on('end', () => resolver(Buffer.concat(partes).toString('utf8')));
    peticion.on('error', rechazar);
  });
}

export async function iniciar() {
  const repo = elegirRepositorio();

  const router = crearRouter(repo, {
    version: VERSION,
    modelo: process.env.SERVICE_MODEL ?? 'sin-declarar',
    adaptadorHttp: 'node:http',
    adaptadorDatos: repo.nombre,
    instancia: process.env.INSTANCE_NAME ?? hostname(),
    region: process.env.REGION ?? null,
    grupo: process.env.GRUPO ?? null,
  });

  const servidor = createServer(async (peticion, respuesta) => {
    const comienzo = process.hrtime.bigint();
    let salida;

    try {
      const url = new URL(peticion.url, `http://${peticion.headers.host ?? 'localhost'}`);
      const texto = ['POST', 'PATCH', 'PUT'].includes(peticion.method)
        ? await leerCuerpo(peticion)
        : null;

      let cuerpo = null;
      if (texto) {
        try {
          cuerpo = JSON.parse(texto);
        } catch {
          salida = {
            status: 400,
            cabeceras: { 'content-type': 'application/json; charset=utf-8' },
            cuerpo: JSON.stringify({ error: 'El cuerpo no es JSON válido' }),
          };
        }
      }

      if (!salida) {
        salida = await router({
          metodo: peticion.method,
          ruta: url.pathname,
          query: Object.fromEntries(url.searchParams),
          cuerpo,
        });
      }
    } catch (error) {
      salida = {
        status: 400,
        cabeceras: { 'content-type': 'application/json; charset=utf-8' },
        cuerpo: JSON.stringify({ error: error.message }),
      };
    }

    const milisegundos = Number(process.hrtime.bigint() - comienzo) / 1e6;
    respuesta.writeHead(salida.status, {
      ...salida.cabeceras,
      'x-tiempo-ms': milisegundos.toFixed(2),
      'x-instancia': process.env.INSTANCE_NAME ?? hostname(),
    });
    respuesta.end(salida.cuerpo);

    if (process.env.LOG_PETICIONES !== 'false') {
      console.log(
        `${peticion.method} ${peticion.url} -> ${salida.status} (${milisegundos.toFixed(1)} ms)`
      );
    }
  });

  servidor.listen(PUERTO, HOST, () => {
    console.log(`[turnero] escuchando en http://${HOST}:${PUERTO}`);
    console.log(`[turnero] modelo=${process.env.SERVICE_MODEL ?? 'sin-declarar'} datos=${repo.nombre}`);
  });

  // Apagado ordenado: sin esto, un contenedor tarda 10 segundos en morir
  // y Kubernetes lo mata a la fuerza. Es uno de los puntos del informe.
  const apagar = async (senal) => {
    console.log(`[turnero] recibida ${senal}, cerrando...`);
    servidor.close(async () => {
      await repo.cerrar();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));

  return servidor;
}

// Arranca sólo si se ejecuta directamente, no si se importa desde las pruebas.
if (import.meta.url === `file://${process.argv[1]}`) {
  iniciar().catch((error) => {
    console.error('[turnero] no se pudo iniciar:', error);
    process.exit(1);
  });
}
