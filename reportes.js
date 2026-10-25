"use strict";

const $ = (s) => document.querySelector(s);

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

let registros = [];
let grafico = null;
let ultimoReporte = null;

// ---------- Utilidades ----------
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

function aniosDisponibles() {
  const anios = new Set(registros.map((r) => r.fecha.slice(0, 4)));
  anios.add(String(new Date().getFullYear()));
  return [...anios].sort().reverse();
}

// ---------- Cálculo ----------
function calcular(anio) {
  const delAnio = registros.filter((r) => r.fecha.startsWith(`${anio}-`));

  const meses = MESES.map((_, i) => {
    const prefijo = `${anio}-${String(i + 1).padStart(2, "0")}`;
    const delMes = delAnio.filter((r) => r.fecha.startsWith(prefijo));
    return {
      porMarca: Object.fromEntries(
        MARCAS.map((m) => [
          m.id,
          promedio(delMes.filter((r) => r.marca === m.id).map((r) => r.precio)),
        ])
      ),
      general: promedio(delMes.map((r) => r.precio)),
    };
  });

  const anual = Object.fromEntries(
    MARCAS.map((m) => [
      m.id,
      promedio(delAnio.filter((r) => r.marca === m.id).map((r) => r.precio)),
    ])
  );

  return {
    anio,
    meses,
    anual,
    generalAnual: promedio(delAnio.map((r) => r.precio)),
    cantidad: delAnio.length,
  };
}

// ---------- Render ----------
function renderCifras(reporte) {
  const conDatos = MARCAS.filter((m) => reporte.anual[m.id] !== null);
  const ordenadas = [...conDatos].sort((a, b) => reporte.anual[a.id] - reporte.anual[b.id]);
  const barata = ordenadas[0];
  const cara = ordenadas.at(-1);

  const items = [
    ["Promedio anual de las 4 marcas", mostrar(reporte.generalAnual), ""],
    [
      "Marca más barata del año",
      barata ? mostrar(reporte.anual[barata.id]) : "—",
      barata ? barata.nombre : "",
    ],
    [
      "Marca más cara del año",
      cara ? mostrar(reporte.anual[cara.id]) : "—",
      cara ? cara.nombre : "",
    ],
  ];

  $("#cifras").replaceChildren(
    ...items.map(([titulo, valor, detalle]) => {
      const div = document.createElement("div");
      const dd = crear("dd", valor);
      if (detalle) dd.append(crear("small", detalle));
      div.append(crear("dt", titulo), dd);
      return div;
    })
  );
}

function renderTabla(reporte) {
  const encabezado = document.createElement("tr");
  const thMes = crear("th", "Mes");
  thMes.scope = "col";
  encabezado.append(thMes);
  for (const m of MARCAS) {
    const th = crear("th", m.nombre, "num");
    th.scope = "col";
    encabezado.append(th);
  }
  const thGeneral = crear("th", "Promedio general", "num");
  thGeneral.scope = "col";
  encabezado.append(thGeneral);
  $("#thead-reporte").replaceChildren(encabezado);

  $("#tbody-reporte").replaceChildren(
    ...reporte.meses.map((mes, i) => {
      const tr = document.createElement("tr");
      const th = crear("th", MESES[i]);
      th.scope = "row";
      th.style.setProperty("--c", "transparent");
      tr.append(th);
      for (const m of MARCAS) tr.append(crear("td", mostrar(mes.porMarca[m.id]), "num"));
      tr.append(crear("td", mostrar(mes.general), "num"));
      return tr;
    })
  );

  const pie = document.createElement("tr");
  const thAnual = crear("th", "Promedio anual");
  thAnual.scope = "row";
  pie.append(thAnual);
  for (const m of MARCAS) pie.append(crear("td", mostrar(reporte.anual[m.id]), "num"));
  pie.append(crear("td", mostrar(reporte.generalAnual), "num"));
  $("#tfoot-reporte").replaceChildren(pie);
}

function renderGrafico(reporte) {
  if (typeof Chart === "undefined") {
    estado("No se pudo cargar el gráfico (Chart.js). La tabla sigue funcionando.", true);
    return;
  }
  if (grafico) grafico.destroy();

  grafico = new Chart($("#grafico"), {
    type: "line",
    data: {
      labels: MESES.map((m) => m.slice(0, 3)),
      datasets: MARCAS.map((m) => ({
        label: m.nombre,
        data: reporte.meses.map((mes) => mes.porMarca[m.id]),
        borderColor: m.color,
        backgroundColor: m.color,
        borderWidth: 2.5,
        pointRadius: 3,
        tension: 0.25,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: { label: (c) => `${c.dataset.label}: ${mostrar(c.parsed.y)}` },
        },
      },
      scales: {
        y: { ticks: { callback: (v) => formatoARS(v) } },
      },
    },
  });
}

function render() {
  const anio = $("#anio").value;
  const reporte = calcular(anio);
  ultimoReporte = reporte;

  const vacio = $("#vacio");
  vacio.hidden = reporte.cantidad > 0;
  if (reporte.cantidad === 0) {
    vacio.textContent = `No hay precios cargados en ${anio}. Cargalos desde Inicio.`;
  }

  renderCifras(reporte);
  renderTabla(reporte);
  renderGrafico(reporte);
}

// ---------- CSV ----------
function descargarCSV() {
  if (!ultimoReporte) return;
  const num = (n) => (n === null ? "" : n.toFixed(2).replace(".", ","));
  const filas = [["Mes", ...MARCAS.map((m) => m.nombre), "Promedio general"]];

  ultimoReporte.meses.forEach((mes, i) => {
    filas.push([
      MESES[i],
      ...MARCAS.map((m) => num(mes.porMarca[m.id])),
      num(mes.general),
    ]);
  });
  filas.push([
    "Promedio anual",
    ...MARCAS.map((m) => num(ultimoReporte.anual[m.id])),
    num(ultimoReporte.generalAnual),
  ]);

  const texto = "\uFEFF" + filas.map((f) => f.join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `precios-yerba-${ultimoReporte.anio}.csv`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

// ---------- Inicio ----------
async function iniciar() {
  const textosModo = {
    nube: "Los precios se leen de la base de datos de Supabase.",
    json: "Los precios se leen de precios.json, que actualiza el script de Python en GitHub Actions.",
    local: "Los precios se leen del navegador (localStorage), los mismos que cargaste en Inicio.",
  };
  $("#pie-modo").textContent = textosModo[Conexion.modo];

  try {
    registros = await Conexion.listar();
  } catch (e) {
    estado(e.message, true);
  }

  const anios = aniosDisponibles();
  $("#anio").replaceChildren(
    ...anios.map((a) => {
      const op = crear("option", a);
      op.value = a;
      return op;
    })
  );
  $("#anio").addEventListener("change", render);
  $("#btn-csv").addEventListener("click", descargarCSV);
  render();
}

iniciar();
