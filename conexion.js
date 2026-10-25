"use strict";

/*
  Conexión a los datos
  --------------------
  Sin configurar: los precios se guardan en localStorage (solo en este navegador).

  Para guardarlos en una base de datos real con Supabase:
  1) Completá SUPABASE_URL y SUPABASE_KEY (la clave "anon public").
  2) Creá la tabla en el SQL Editor de Supabase:

     create table precios (
       id bigint generated always as identity primary key,
       marca text not null,
       precio numeric not null check (precio > 0),
       fecha date not null
     );
     alter table precios enable row level security;
     create policy "leer"   on precios for select using (true);
     create policy "cargar" on precios for insert with check (true);
     create policy "borrar" on precios for delete using (true);

  Con esas políticas, cualquiera que tenga la clave puede cargar y borrar.
  Para algo más que una prueba, agregá autenticación.
*/

const CONFIG = {
  SUPABASE_URL: "", // ej: "https://xxxx.supabase.co"
  SUPABASE_KEY: "",
  TABLA: "precios",
  // Precios reales: archivo que genera actualizar_precios.py (ej: "precios.json").
  // Si lo completás, la página pasa a solo lectura y muestra esos precios.
  JSON_URL: "",
};

const CLAVE_LOCAL = "yerba_precios_v1";

const MARCAS = [
  { id: "rosamonte", nombre: "Rosamonte", color: "#B5332A" },
  { id: "cbse", nombre: "CBSé", color: "#2B6CB0" },
  { id: "taragui", nombre: "Taragüí", color: "#2F7D3B" },
  { id: "lamerced", nombre: "La Merced", color: "#C77A1B" },
];

const formatoARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

const Conexion = (() => {
  const nube = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
  const archivo = Boolean(CONFIG.JSON_URL) && !nube;
  const soloLectura = () => {
    throw new Error("Los precios vienen de precios.json y se actualizan solos.");
  };
  const base = `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLA}`;
  const cabeceras = {
    apikey: CONFIG.SUPABASE_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };

  async function pedir(url, opciones = {}) {
    const r = await fetch(url, {
      ...opciones,
      headers: { ...cabeceras, ...opciones.headers },
    });
    if (!r.ok) throw new Error(`Error ${r.status} al hablar con la base de datos.`);
    const texto = await r.text();
    return texto ? JSON.parse(texto) : null;
  }

  // ---- localStorage ----
  const leerLocal = () => {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE_LOCAL));
      return Array.isArray(datos) ? datos : [];
    } catch {
      return [];
    }
  };

  const guardarLocal = (lista) => {
    try {
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista));
    } catch {
      throw new Error("El navegador no permite guardar datos locales.");
    }
  };

  const nuevoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ordenar = (lista) =>
    [...lista].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  function validar(r) {
    const marcaOk = MARCAS.some((m) => m.id === r.marca);
    const precio = Number(r.precio);
    const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(r.fecha);
    if (!marcaOk || !(precio > 0) || !fechaOk) {
      throw new Error("Marca, precio o fecha inválidos.");
    }
    return { marca: r.marca, precio, fecha: r.fecha };
  }

  // ---- API pública ----
  async function listar() {
    if (archivo) {
      const r = await fetch(`${CONFIG.JSON_URL}?v=${Date.now()}`);
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`No se pudo leer ${CONFIG.JSON_URL} (error ${r.status}).`);
      const filas = await r.json();
      return ordenar(
        filas.map((f) => ({
          id: `${f.marca}-${f.fecha}`,
          marca: f.marca,
          precio: Number(f.precio),
          fecha: f.fecha,
        }))
      );
    }
    if (nube) {
      const filas = await pedir(`${base}?select=*&order=fecha.asc,id.asc`);
      return filas.map((f) => ({ ...f, precio: Number(f.precio) }));
    }
    return ordenar(leerLocal());
  }

  async function agregarVarios(lista) {
    if (archivo) soloLectura();
    const limpios = lista.map(validar);
    if (nube) {
      await pedir(base, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(limpios),
      });
      return;
    }
    guardarLocal([...leerLocal(), ...limpios.map((r) => ({ id: nuevoId(), ...r }))]);
  }

  const agregar = (registro) => agregarVarios([registro]);

  async function eliminar(id) {
    if (archivo) soloLectura();
    if (nube) {
      await pedir(`${base}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return;
    }
    guardarLocal(leerLocal().filter((r) => String(r.id) !== String(id)));
  }

  async function vaciar() {
    if (archivo) soloLectura();
    if (nube) {
      await pedir(`${base}?id=not.is.null`, { method: "DELETE" });
      return;
    }
    guardarLocal([]);
  }

  return {
    modo: nube ? "nube" : archivo ? "json" : "local",
    listar,
    agregar,
    agregarVarios,
    eliminar,
    vaciar,
  };
})();
