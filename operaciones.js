// Operaciones CRUD sobre la tabla "tareas" (requiere conexion.js cargado antes)
const entrada = document.getElementById("entrada");
const lista = document.getElementById("lista");
const estado = document.getElementById("estado");

function mostrarEstado(mensaje, esError = false) {
  estado.textContent = mensaje;
  estado.style.color = esError ? "crimson" : "";
}

// LEER: trae todas las tareas y las dibuja
async function listar() {
  const { data, error } = await db.from("tareas").select("*").order("id", { ascending: true });
  if (error) return mostrarEstado("Error al listar: " + error.message, true);

  lista.innerHTML = "";
  data.forEach((t) => {
    const li = document.createElement("li");

    const texto = document.createElement("span");
    texto.textContent = t.titulo;
    if (t.completada) texto.style.textDecoration = "line-through";

    const btnOk = document.createElement("button");
    btnOk.textContent = t.completada ? "Reabrir" : "Completar";
    btnOk.onclick = () => alternar(t.id, t.completada);

    const btnEditar = document.createElement("button");
    btnEditar.textContent = "Editar";
    btnEditar.onclick = () => editar(t.id, t.titulo);

    const btnBorrar = document.createElement("button");
    btnBorrar.textContent = "Eliminar";
    btnBorrar.onclick = () => eliminar(t.id);

    li.append(texto, btnOk, btnEditar, btnBorrar);
    lista.appendChild(li);
  });
  mostrarEstado(data.length + " tarea(s)");
}

// CREAR: toma el texto escrito por teclado
async function agregar() {
  const titulo = entrada.value.trim();
  if (!titulo) return mostrarEstado("Escribí algo primero", true);

  const { error } = await db.from("tareas").insert({ titulo });
  if (error) return mostrarEstado("Error al agregar: " + error.message, true);

  entrada.value = "";
  listar();
}

// ACTUALIZAR: marcar / desmarcar como completada
async function alternar(id, completada) {
  const { error } = await db.from("tareas").update({ completada: !completada }).eq("id", id);
  if (error) return mostrarEstado("Error al actualizar: " + error.message, true);
  listar();
}

// ACTUALIZAR: cambiar el texto
async function editar(id, tituloActual) {
  const nuevo = prompt("Nuevo texto:", tituloActual);
  if (nuevo === null || !nuevo.trim()) return;

  const { error } = await db.from("tareas").update({ titulo: nuevo.trim() }).eq("id", id);
  if (error) return mostrarEstado("Error al editar: " + error.message, true);
  listar();
}

// BORRAR una tarea
async function eliminar(id) {
  const { error } = await db.from("tareas").delete().eq("id", id);
  if (error) return mostrarEstado("Error al eliminar: " + error.message, true);
  listar();
}

// BORRAR todas
async function eliminarTodas() {
  if (!confirm("¿Borrar todas las tareas?")) return;
  const { error } = await db.from("tareas").delete().neq("id", 0);
  if (error) return mostrarEstado("Error al vaciar: " + error.message, true);
  listar();
}

document.getElementById("btnAgregar").onclick = agregar;
document.getElementById("btnListar").onclick = listar;
document.getElementById("btnVaciar").onclick = eliminarTodas;
entrada.addEventListener("keydown", (e) => { if (e.key === "Enter") agregar(); });

listar();

// ---- Prueba de escritura / lectura (muestra la respuesta cruda de Supabase) ----
const salida = document.getElementById("salida");

// ESCRIBIR: inserta lo que haya en la caja de texto (o una fila de prueba con la hora)
async function escribirPrueba() {
  const titulo = entrada.value.trim() || "Prueba " + new Date().toLocaleString("es-AR");
  const { data, error } = await db.from("tareas").insert({ titulo }).select();

  if (error) {
    salida.textContent = "❌ Error al escribir:\n" + JSON.stringify(error, null, 2);
    return;
  }
  salida.textContent = "✅ Escritura OK. Fila guardada:\n" + JSON.stringify(data, null, 2);
  entrada.value = "";
  listar();
}

// LEER: trae todas las filas y las muestra tal cual
async function leerPrueba() {
  const { data, error } = await db.from("tareas").select("*").order("id", { ascending: true });

  if (error) {
    salida.textContent = "❌ Error al leer:\n" + JSON.stringify(error, null, 2);
    return;
  }
  salida.textContent = "✅ Lectura OK (" + data.length + " fila/s):\n" + JSON.stringify(data, null, 2);
}

document.getElementById("btnEscribir").onclick = escribirPrueba;
document.getElementById("btnLeer").onclick = leerPrueba;
