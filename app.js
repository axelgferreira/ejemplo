"use strict";

const $ = (s) => document.querySelector(s);
let registros = [];

// ---------- Utilidades ----------
const dosDigitos = (n) => String(n).padStart(2, "0");

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
};

const fechaCorta = (iso) => iso.split("-").reverse().join("/");

const promedio = (lista) =>
  lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : null;

const mostrar = (n) => (n === null ? "—" : formatoARS(n));

function estado(texto, esError = false) {
  const el = $("#estado");
  el.textContent = texto;
  el.classList.toggle("error", esError);
}

function crear(tag, texto, clase) {
  const el = document.createElement(tag);
  if (texto !== undefined) el.textContent = texto;
  if (clase) el.className = clase;
  return el;
}

// ---------- Cálculos ----------
function resumenMarca(marca, mes, anio) {
  const regs = registros.filter((r) => r.marca === marca.id);
  const actual = regs.at(-1) || null;
  const anterior = regs.length > 1 ? regs.at(-2) : null;
  const cambio =
    actual && anterior ? ((actual.precio - anterior.precio) / anterior.precio) * 100 : null;

  return {
    marca,
    actual: actual ? actual.precio : null,
    cambio,
    delMes: promedio(regs.filter((r) => r.fecha.startsWith(mes)).map((r) => r.precio)),
    delAnio: promedio(regs.filter((r) => r.fecha.startsWith(anio)).map((r) => r.precio)),
  };
}

function textoCambio(cambio) {
  if (cambio === null) return { texto: "—", clase: "" };
  const simbolo = cambio > 0 ? "▲" : cambio < 0 ? "▼" : "=";
  const valor = Math.abs(cambio).toFixed(1).replace(".", ",");
  return {
    texto: `${simbolo} ${valor}%`,
    clase: cambio > 0 ? "sube" : cambio < 0 ? "baja" : "",
  };
}

// ---------- Render ----------
function renderTablero() {
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const anio = hoy.slice(0, 4);
  const filas = MARCAS.map((m) => resumenMarca(m, mes, anio));

  const tbody = $("#tbody-marcas");
  tbody.replaceChildren(
    ...filas.map((f) => {
      const tr = document.createElement("tr");
      const th = crear("th", f.marca.nombre);
      th.scope = "row";
      th.style.setProperty("--c", f.marca.color);
      const cambio = textoCambio(f.cambio);

      tr.append(
        th,
        crear("td", mostrar(f.actual), "num precio-actual"),
        crear("td", cambio.texto, `num ${cambio.clase}`),
        crear("td", mostrar(f.delMes), "num"),
        crear("td", mostrar(f.delAnio), "num")
      );
      return tr;
    })
  );

  // Hero: promedio entre marcas (último precio) y promedios de mes y año
  const ultimos = filas.filter((f) => f.actual !== null).map((f) => f.actual);
  $("#promedio-actual").textContent = mostrar(promedio(ultimos));
  $("#promedio-mes").textContent = mostrar(
    promedio(registros.filter((r) => r.fecha.startsWith(mes)).map((r) => r.precio))
  );
  $("#promedio-anio").textContent = mostrar(
    promedio(registros.filter((r) => r.fecha.startsWith(anio)).map((r) => r.precio))
  );

  $("#hero-nota").textContent = ultimos.length
    ? `Promedio del último precio de venta de ${ultimos.length} ${ultimos.length === 1 ? "marca" : "marcas"} (paquete de 1 kg).`
    : "Todavía no hay precios cargados. Guardá el primero más abajo o cargá un año de ejemplo.";
}

function renderHistorial() {
  const lista = $("#historial");
  const ultimas = registros.slice(-10).reverse();

  if (!ultimas.length) {
    const li = crear("li", "No hay cargas todavía.");
    lista.replaceChildren(li);
    return;
  }

  lista.replaceChildren(
    ...ultimas.map((r) => {
      const marca = MARCAS.find((m) => m.id === r.marca);
      const li = document.createElement("li");
      const boton = crear("button", "Eliminar");
      boton.type = "button";
      boton.dataset.id = r.id;
      boton.setAttribute(
        "aria-label",
        `Eliminar precio de ${marca ? marca.nombre : r.marca} del ${fechaCorta(r.fecha)}`
      );
      li.append(
        crear("span", fechaCorta(r.fecha), "h-fecha"),
        crear("span", marca ? marca.nombre : r.marca, "h-marca"),
        crear("span", formatoARS(r.precio)),
        boton
      );
      return li;
    })
  );
}

function render() {
  renderTablero();
  renderHistorial();
}

async function recargar() {
  registros = await Conexion.listar();
  render();
}

// ---------- Acciones ----------
async function guardarPrecio(evento) {
  evento.preventDefault();
  const marca = $("#marca").value;
  const precio = Number($("#precio").value);
  const fecha = $("#fecha").value;

  if (!(precio > 0) || !fecha) {
    estado("Completá un precio mayor a 0 y una fecha.", true);
    return;
  }

  try {
    await Conexion.agregar({ marca, precio, fecha });
    await recargar();
    $("#precio").value = "";
    const nombre = MARCAS.find((m) => m.id === marca).nombre;
    estado(`Guardado: ${nombre} a ${formatoARS(precio)}.`);
  } catch (e) {
    estado(e.message, true);
  }
}

async function eliminarPrecio(evento) {
  const boton = evento.target.closest("button[data-id]");
  if (!boton) return;
  try {
    await Conexion.eliminar(boton.dataset.id);
    await recargar();
    estado("Precio eliminado.");
  } catch (e) {
    estado(e.message, true);
  }
}

async function cargarEjemplo() {
  const base = { rosamonte: 6200, cbse: 5900, taragui: 5600, lamerced: 6400 };
  const hoy = hoyISO();
  const ahora = new Date();
  const nuevos = [];

  for (let i = 11; i >= 0; i--) {
    const f = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    for (const dia of [1, 15]) {
      const iso = `${f.getFullYear()}-${dosDigitos(f.getMonth() + 1)}-${dosDigitos(dia)}`;
      if (iso > hoy) continue;
      for (const m of MARCAS) {
        base[m.id] *= 1 + (Math.random() * 0.025 - 0.005);
        nuevos.push({ marca: m.id, precio: Math.round(base[m.id]), fecha: iso });
      }
    }
  }

  try {
    await Conexion.agregarVarios(nuevos);
    await recargar();
    estado(`Se cargaron ${nuevos.length} precios de ejemplo.`);
  } catch (e) {
    estado(e.message, true);
  }
}

async function vaciarTodo() {
  if (!window.confirm("¿Borrar todos los precios cargados? No se puede deshacer.")) return;
  try {
    await Conexion.vaciar();
    await recargar();
    estado("Se borraron todos los precios.");
  } catch (e) {
    estado(e.message, true);
  }
}

// ---------- Inicio ----------
async function iniciar() {
  $("#marca").replaceChildren(
    ...MARCAS.map((m) => {
      const op = crear("option", m.nombre);
      op.value = m.id;
      return op;
    })
  );
  $("#fecha").value = hoyISO();

  $("#form-precio").addEventListener("submit", guardarPrecio);
  $("#historial").addEventListener("click", eliminarPrecio);
  $("#btn-ejemplo").addEventListener("click", cargarEjemplo);
  $("#btn-vaciar").addEventListener("click", vaciarTodo);

  $("#pie-modo").textContent =
    Conexion.modo === "nube"
      ? "Los precios se guardan en la base de datos de Supabase."
      : "Los precios se guardan solo en este navegador (localStorage).";

  try {
    await recargar();
  } catch (e) {
    render();
    estado(e.message, true);
  }
}

iniciar();
