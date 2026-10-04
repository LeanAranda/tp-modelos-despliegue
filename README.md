# Turnero — aplicación de referencia

Trabajo práctico integrador · **Tecnologías Cloud y Seguridad** · Licenciatura en Sistemas, UNLa · 2.º cuatrimestre de 2026

Un sistema de turnos para un centro médico. Es deliberadamente chico: el trabajo no consiste en programar, sino en **desplegar esta misma aplicación de cuatro maneras distintas** y medir en qué se diferencian.

---

## Por qué está organizada así

La aplicación está partida en tres capas, y esa división es el argumento central del trabajo práctico:

```
src/core/          ← lógica de negocio y router. NO CAMBIA entre modelos.
src/adapters/http/ ← cómo llegan las peticiones (servidor de Node | Cloudflare Workers)
src/adapters/data/ ← dónde viven los datos (memoria | PostgreSQL | D1)
```

Cuando un grupo despliega en IaaS y después en FaaS, `src/core/` es byte por byte el mismo código. Lo único que cambia son los adaptadores y la operación. Poner un número a *cuánto* cambia la operación es el entregable principal.

| Modelo | Adaptador HTTP | Adaptador de datos | Dónde corre |
|---|---|---|---|
| IaaS | `node:http` | PostgreSQL | Máquina virtual propia |
| PaaS | `node:http` | PostgreSQL (Neon) | Render |
| Contenedores | `node:http` | PostgreSQL (contenedor) | Docker / k3s |
| FaaS | Cloudflare Workers | D1 | Red de Cloudflare |

---

## Arranque rápido (sin base de datos)

Sirve para la primera clase y para desarrollar. Los datos viven en memoria y se pierden al reiniciar.

```bash
npm install
npm run dev
# http://localhost:3000
```

```bash
npm test          # 20 pruebas, sin base de datos
```

---

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/` | Interfaz web |
| `GET` | `/api/health` | Sonda de salud; mide la latencia contra la base |
| `GET` | `/api/info` | **Metadatos del despliegue.** Dice en qué modelo está corriendo |
| `GET` | `/api/profesionales` | Lista de profesionales |
| `GET` | `/api/turnos` | Lista de turnos. Filtros: `profesional_id`, `fecha`, `estado`, `limite` |
| `POST` | `/api/turnos` | Reserva un turno |
| `GET` | `/api/turnos/:id` | Un turno |
| `PATCH` | `/api/turnos/:id` | Cambia el estado. Cuerpo: `{"estado":"confirmado"}` |
| `DELETE` | `/api/turnos/:id` | Elimina un turno |
| `GET` | `/api/metricas` | Conteos agregados |

`/api/info` es la prueba de dónde está corriendo lo que se muestra en el informe. **Toda captura de pantalla del trabajo tiene que incluir esa salida.**

Todas las respuestas llevan la cabecera `x-tiempo-ms` con el tiempo de proceso del servidor, y `x-instancia` con el identificador de quien atendió.

---

## Modelo 1 — IaaS

Una máquina virtual creada por el grupo (VirtualBox, Multipass, UTM o un Codespace de GitHub). Hay que instalar todo a mano: eso es el punto.

```bash
sudo apt update && sudo apt install -y postgresql nginx
sudo -u postgres psql -c "CREATE USER turnero WITH PASSWORD 'la-que-elijan';"
sudo -u postgres psql -c "CREATE DATABASE turnero OWNER turnero;"

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

git clone <el-repositorio-del-grupo> && cd turnero
npm ci --omit=dev
export DATABASE_URL="postgresql://turnero:la-que-elijan@localhost:5432/turnero"
node scripts/migrar.mjs

DATA_SOURCE=postgres SERVICE_MODEL=iaas node src/adapters/http/servidor.js
```

Para que sea IaaS de verdad y no "un proceso en una terminal", falta lo que se evalúa: unidad de systemd para que arranque solo, Nginx como proxy inverso, TLS, y un plan de respaldo de la base. **Cronometren cada paso**: ese número va al informe.

---

## Modelo 2 — PaaS

Base de datos en **Neon** (plan gratuito permanente, sin tarjeta) y aplicación en **Render** (plan gratuito, sin tarjeta).

1. Crear un proyecto en Neon y copiar la cadena de conexión.
2. Cargar el esquema desde la máquina local:
   ```bash
   DATABASE_URL="<cadena-de-neon>" PGSSL=true node scripts/migrar.mjs
   ```
3. En Render: **New → Blueprint**, apuntar al repositorio. Lee `render.yaml`.
4. Cargar `DATABASE_URL` y `GRUPO` como variables de entorno **en el panel de Render**, nunca en el repositorio.

> **La base NO va en Render.** La PostgreSQL gratuita de Render expira a los 30 días y borra los datos 14 días después. El cuatrimestre dura cuatro meses.

> El servicio gratuito de Render **se duerme a los 15 minutos** sin tráfico y tarda cerca de un minuto en despertar. No es una falla: es el dato que hay que medir y explicar.

---

## Modelo 3 — Contenedores

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env
echo "GRUPO=grupo-NN" >> .env

docker compose up --build -d
docker compose exec app node scripts/migrar.mjs
# http://localhost:3000
```

Para la parte de orquestación, con k3s o kind:

```bash
docker build -t turnero:local .
# k3s:  sudo k3s ctr images import <(docker save turnero:local)
# kind: kind load docker-image turnero:local
```

A revisar en el informe: qué pasa con los datos cuando se hace `docker compose down` con y sin `-v`, cuánto tarda el contenedor en morir con y sin `dumb-init`, y qué informa Trivy sobre la imagen.

---

## Modelo 4 — FaaS

```bash
npx wrangler login
npx wrangler d1 create turnero-grupo-NN          # copiar el database_id a wrangler.toml
npx wrangler d1 execute turnero-grupo-NN --remote --file=schema/d1.sql
node scripts/migrar.mjs --d1 > /tmp/semilla.sql
npx wrangler d1 execute turnero-grupo-NN --remote --file=/tmp/semilla.sql
npx wrangler deploy
```

Comparar `src/adapters/data/d1.js` con `src/adapters/data/postgres.js`. La lógica de negocio no cambió; el dialecto SQL, el manejo de fechas y los booleanos, sí. Ese delta es un punto del informe.

---

## Medición

Todos los grupos miden con la misma herramienta para que los números sean comparables.

```bash
node bench/carga.mjs --url https://turnero-grupo-nn.onrender.com \
                     --modelo paas --peticiones 200 --concurrencia 8 \
                     --salida resultados/paas.json
```

Hay que correrla contra los cuatro despliegues y guardar los cuatro archivos JSON. El **arranque en frío** solo significa algo si el servicio estuvo sin tráfico antes: en Render, al menos 15 minutos.

---

## Variables de entorno

| Variable | Valores | Para qué |
|---|---|---|
| `DATA_SOURCE` | `memoria` \| `postgres` | Qué adaptador de datos usar |
| `DATABASE_URL` | cadena PostgreSQL | Sólo si `DATA_SOURCE=postgres` |
| `PGSSL` | `true` \| `false` | `true` para Neon; `false` para PostgreSQL local o en contenedor |
| `SERVICE_MODEL` | `iaas` \| `paas` \| `contenedores` \| `faas` | Se muestra en `/api/info` |
| `INSTANCE_NAME` | texto | Identifica la instancia; por defecto, el nombre del equipo |
| `REGION` | texto | Región declarada |
| `GRUPO` | texto | Número de grupo; se muestra en `/api/info` |
| `PORT` / `HOST` | número / dirección | Escucha |

Copiar `.env.example` a `.env`. **`.env` está en `.gitignore` y tiene que seguir estando ahí.**

---

## Reglas que hacen a la nota

1. **Ningún secreto en el repositorio.** Ni en el historial. Un secreto expuesto se considera comprometido para siempre: hay que rotarlo, no borrarlo.
2. `src/core/` **no se modifica**, salvo que el grupo justifique el cambio en el informe. Si cambia el núcleo, la comparación entre modelos deja de ser válida.
3. Los cuatro despliegues tienen que estar **vivos el día de la defensa**.
4. Las capturas deben mostrar la salida de `/api/info`.
