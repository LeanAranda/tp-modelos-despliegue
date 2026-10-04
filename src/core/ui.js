// La interfaz va embebida como texto a propósito: así el mismo módulo se sirve
// desde el servidor de Node y desde el Worker, sin depender del sistema de archivos
// (que en FaaS no existe).

export const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Turnero &mdash; Centro Médico Lanús</title>
<style>
  :root {
    --tinta: #1a1a1a; --suave: #626262; --linea: #dcdcdc; --fondo: #f7f7f5;
    --panel: #ffffff; --acento: #790024; --ok: #1a7f37; --alerta: #b42318;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--tinta); background: var(--fondo);
  }
  header {
    background: var(--acento); color: #fff; padding: 18px 20px;
  }
  header h1 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: .2px; }
  header p { margin: 4px 0 0; font-size: 13px; opacity: .85; }
  main { max-width: 1040px; margin: 0 auto; padding: 20px; }
  .rejilla { display: grid; grid-template-columns: 340px 1fr; gap: 20px; }
  @media (max-width: 860px) { .rejilla { grid-template-columns: 1fr; } }
  section {
    background: var(--panel); border: 1px solid var(--linea);
    border-radius: 8px; padding: 16px;
  }
  h2 { margin: 0 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: .6px; color: var(--suave); }
  label { display: block; font-size: 13px; margin: 10px 0 4px; color: var(--suave); }
  input, select, textarea, button {
    width: 100%; font: inherit; padding: 8px 10px;
    border: 1px solid var(--linea); border-radius: 6px; background: #fff; color: inherit;
  }
  textarea { resize: vertical; min-height: 58px; }
  button {
    background: var(--acento); color: #fff; border-color: var(--acento);
    cursor: pointer; font-weight: 600; margin-top: 14px;
  }
  button:hover { filter: brightness(1.1); }
  button.chico {
    width: auto; margin: 0 4px 0 0; padding: 4px 9px; font-size: 12px; font-weight: 500;
    background: #fff; color: var(--suave); border-color: var(--linea);
  }
  button.chico:hover { border-color: var(--acento); color: var(--acento); filter: none; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; color: var(--suave);
       border-bottom: 2px solid var(--linea); padding: 6px 8px; white-space: nowrap; }
  td { border-bottom: 1px solid var(--linea); padding: 8px; vertical-align: top; }
  .estado { font-size: 12px; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--linea); }
  .estado.reservado  { background: #fff7e6; border-color: #f0c36d; }
  .estado.confirmado { background: #e8f3ff; border-color: #8ec0f5; }
  .estado.atendido   { background: #e9f7ee; border-color: #86c79a; }
  .estado.cancelado  { background: #f4f4f4; color: var(--suave); }
  .filtros { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .filtros > * { flex: 1 1 140px; width: auto; }
  #aviso { padding: 9px 12px; border-radius: 6px; margin-bottom: 12px; display: none; font-size: 14px; }
  #aviso.ok    { display: block; background: #e9f7ee; border: 1px solid #86c79a; color: var(--ok); }
  #aviso.error { display: block; background: #fdeceb; border: 1px solid #f1a9a4; color: var(--alerta); }
  footer { max-width: 1040px; margin: 0 auto; padding: 0 20px 28px; }
  #info {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
    color: var(--suave); background: var(--panel); border: 1px solid var(--linea);
    border-radius: 8px; padding: 12px; white-space: pre-wrap; word-break: break-all;
  }
  .vacio { color: var(--suave); font-style: italic; padding: 14px 8px; }
</style>
</head>
<body>
<header>
  <h1>Turnero &mdash; Centro Médico Lanús</h1>
  <p>Aplicación de referencia &mdash; Tecnologías Cloud y Seguridad, UNLa</p>
</header>

<main>
  <div id="aviso"></div>
  <div class="rejilla">
    <section>
      <h2>Nuevo turno</h2>
      <label for="profesional">Profesional</label>
      <select id="profesional"></select>

      <label for="nombre">Nombre del paciente</label>
      <input id="nombre" placeholder="Apellido y nombre" autocomplete="off">

      <label for="email">Correo electrónico</label>
      <input id="email" type="email" placeholder="paciente@ejemplo.com" autocomplete="off">

      <label for="fecha">Fecha y hora (cada 30 minutos)</label>
      <input id="fecha" type="datetime-local" step="1800">

      <label for="notas">Notas</label>
      <textarea id="notas" placeholder="Opcional"></textarea>

      <button id="reservar">Reservar turno</button>
    </section>

    <section>
      <h2>Turnos agendados</h2>
      <div class="filtros">
        <select id="f-profesional"><option value="">Todos los profesionales</option></select>
        <select id="f-estado">
          <option value="">Todos los estados</option>
          <option value="reservado">Reservado</option>
          <option value="confirmado">Confirmado</option>
          <option value="atendido">Atendido</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <input id="f-fecha" type="date">
      </div>
      <table>
        <thead>
          <tr><th>Fecha y hora</th><th>Paciente</th><th>Profesional</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody id="tabla"></tbody>
      </table>
    </section>
  </div>
</main>

<footer>
  <div id="info">consultando /api/info&hellip;</div>
</footer>

<script>
const $ = (id) => document.getElementById(id);
let profesionales = [];

function avisar(texto, tipo) {
  const caja = $('aviso');
  caja.textContent = texto;
  caja.className = tipo;
  if (tipo === 'ok') setTimeout(() => { caja.className = ''; }, 3500);
}

async function pedir(url, opciones) {
  const respuesta = await fetch(url, opciones);
  const texto = await respuesta.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { error: texto }; }
  if (!respuesta.ok) {
    const detalle = datos?.detalles?.map((d) => d.mensaje).join('. ');
    throw new Error(detalle || datos?.error || ('HTTP ' + respuesta.status));
  }
  return datos;
}

function formatear(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

async function cargarProfesionales() {
  profesionales = await pedir('/api/profesionales');
  const opciones = profesionales
    .map((p) => '<option value="' + p.id + '">' + p.nombre + ' \\u2014 ' + p.especialidad + '</option>')
    .join('');
  $('profesional').innerHTML = opciones;
  $('f-profesional').innerHTML = '<option value="">Todos los profesionales</option>' + opciones;
}

async function cargarTurnos() {
  const parametros = new URLSearchParams();
  if ($('f-profesional').value) parametros.set('profesional_id', $('f-profesional').value);
  if ($('f-estado').value) parametros.set('estado', $('f-estado').value);
  if ($('f-fecha').value) parametros.set('fecha', $('f-fecha').value);

  const turnos = await pedir('/api/turnos?' + parametros.toString());
  if (turnos.length === 0) {
    $('tabla').innerHTML = '<tr><td colspan="5" class="vacio">No hay turnos que coincidan con el filtro.</td></tr>';
    return;
  }
  $('tabla').innerHTML = turnos.map((t) =>
    '<tr>' +
      '<td>' + formatear(t.fecha_hora) + '</td>' +
      '<td>' + t.paciente_nombre + '<br><small style="color:#626262">' + t.paciente_email + '</small></td>' +
      '<td>' + (t.profesional_nombre || '') + '</td>' +
      '<td><span class="estado ' + t.estado + '">' + t.estado + '</span></td>' +
      '<td style="white-space:nowrap">' +
        '<button class="chico" data-id="' + t.id + '" data-estado="confirmado">Confirmar</button>' +
        '<button class="chico" data-id="' + t.id + '" data-estado="atendido">Atendido</button>' +
        '<button class="chico" data-id="' + t.id + '" data-estado="cancelado">Cancelar</button>' +
      '</td>' +
    '</tr>'
  ).join('');
}

async function reservar() {
  const local = $('fecha').value;
  if (!local) { avisar('Elegí una fecha y hora.', 'error'); return; }
  try {
    await pedir('/api/turnos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profesional_id: Number($('profesional').value),
        paciente_nombre: $('nombre').value,
        paciente_email: $('email').value,
        fecha_hora: new Date(local + ':00Z').toISOString(),
        notas: $('notas').value,
      }),
    });
    avisar('Turno reservado.', 'ok');
    $('nombre').value = ''; $('email').value = ''; $('notas').value = '';
    await cargarTurnos();
  } catch (error) {
    avisar(error.message, 'error');
  }
}

async function cargarInfo() {
  try {
    const info = await pedir('/api/info');
    $('info').textContent =
      'modelo de servicio : ' + info.modelo_de_servicio + '\\n' +
      'adaptador HTTP     : ' + info.adaptador_http + '\\n' +
      'adaptador de datos : ' + info.adaptador_datos + '\\n' +
      'instancia          : ' + info.instancia + '\\n' +
      'region             : ' + (info.region || 'no informada') + '\\n' +
      'grupo              : ' + (info.grupo || 'sin configurar') + '\\n' +
      'version            : ' + info.version + '\\n' +
      'hora del servidor  : ' + info.hora_servidor;
  } catch (error) {
    $('info').textContent = 'no se pudo leer /api/info: ' + error.message;
  }
}

$('reservar').addEventListener('click', reservar);
$('tabla').addEventListener('click', async (evento) => {
  const boton = evento.target.closest('button[data-id]');
  if (!boton) return;
  try {
    await pedir('/api/turnos/' + boton.dataset.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ estado: boton.dataset.estado }),
    });
    await cargarTurnos();
  } catch (error) { avisar(error.message, 'error'); }
});
['f-profesional', 'f-estado', 'f-fecha'].forEach((id) =>
  $(id).addEventListener('change', () => cargarTurnos().catch((e) => avisar(e.message, 'error')))
);

(async function iniciar() {
  try {
    await cargarProfesionales();
    await cargarTurnos();
  } catch (error) {
    avisar('No se pudo cargar la información: ' + error.message, 'error');
  }
  cargarInfo();
})();
</script>
</body>
</html>`;
