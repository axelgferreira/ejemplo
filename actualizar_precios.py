"""Actualiza precios.json con el precio de venta de cada yerba en Carrefour Argentina.

Carrefour no acepta búsquedas por texto en su API, pero sí filtros por categoría.
Por eso el script pide toda la categoría "Desayuno y merienda / Yerba" (id /222/232/),
elige de ahí la yerba de cada marca y guarda el precio por kilo.

    pip install requests
    python actualizar_precios.py
"""

import json
import re
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ARCHIVO = Path("precios.json")
URL = "https://www.carrefour.com.ar/api/catalog_system/pub/products/search"
CATEGORIA = "C:/222/232/"  # Desayuno y merienda / Yerba
POR_PAGINA = 50
MAX_PAGINAS = 8
CABECERAS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
}

# Palabras que tienen que aparecer en la marca o el nombre del producto.
MARCAS = {
    "rosamonte": ["rosamonte"],
    "cbse": ["cbse"],
    "taragui": ["taragui"],
    "lamerced": ["la merced"],
}
# Productos que no son la yerba común. Sumá palabras si el script elige uno equivocado.
EXCLUIR = ["cocido", "saquito", "bolsita", "lata", "pack", "combo", "bombilla", "terere", "aniversario"]


def normalizar(texto: str) -> str:
    """Minúsculas y sin tildes, para comparar nombres de forma pareja."""
    sin_tildes = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def gramos_de(producto: dict):
    """Peso del paquete en gramos, o None si no se puede saber."""
    especificado = producto.get("Gramaje de unidad de consumo")
    if especificado:
        try:
            return float(str(especificado[0]).replace(",", "."))
        except ValueError:
            pass
    coincidencia = re.search(r"(\d+(?:[.,]\d+)?)\s?(kg|k|g|gr|grs)\b", normalizar(producto.get("productName", "")))
    if coincidencia:
        valor = float(coincidencia.group(1).replace(",", "."))
        return valor * 1000 if coincidencia.group(2) in ("kg", "k") else valor
    return None


def oferta_de(producto: dict):
    """Devuelve (precio, disponible) de la primera oferta con precio, o None."""
    for item in producto.get("items", []):
        for vendedor in item.get("sellers", []):
            oferta = vendedor.get("commertialOffer", {})  # así se escribe en VTEX
            if oferta.get("Price", 0) > 0:
                return float(oferta["Price"]), oferta.get("AvailableQuantity", 0) > 0
    return None


def traer_categoria() -> list:
    """Descarga todos los productos de la categoría Yerba, de a 50."""
    productos = []
    for pagina in range(MAX_PAGINAS):
        desde = pagina * POR_PAGINA
        respuesta = requests.get(
            URL,
            params={"fq": CATEGORIA, "_from": desde, "_to": desde + POR_PAGINA - 1},
            headers=CABECERAS,
            timeout=30,
        )
        if respuesta.status_code == 404:
            break
        respuesta.raise_for_status()
        lote = respuesta.json()
        if not lote:
            break
        productos.extend(lote)
        if len(lote) < POR_PAGINA:
            break
        time.sleep(1)
    return productos


def elegir(marca: str, productos: list):
    """Elige la yerba de la marca. Devuelve (nombre, gramos, precio por kilo)."""
    candidatos = []
    for producto in productos:
        nombre = producto.get("productName", "")
        texto = normalizar(f"{producto.get('brand', '')} {nombre}")
        if not any(p in texto for p in MARCAS[marca]):
            continue
        if any(x in texto for x in EXCLUIR):
            continue
        oferta = oferta_de(producto)
        gramos = gramos_de(producto)
        if oferta is None or not gramos:
            continue
        precio, disponible = oferta
        precio_kilo = precio / (gramos / 1000)
        # Prioridad: paquete de 1 kg, con stock, nombre más corto (versión tradicional).
        orden = (gramos != 1000, not disponible, len(nombre))
        candidatos.append((orden, nombre, gramos, precio_kilo))

    if not candidatos:
        raise ValueError("no se encontró una yerba de esa marca con precio")
    _, nombre, gramos, precio_kilo = min(candidatos)
    return nombre, gramos, round(precio_kilo, 2)


def main():
    datos = json.loads(ARCHIVO.read_text(encoding="utf-8")) if ARCHIVO.exists() else []
    hoy = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date().isoformat()

    try:
        productos = traer_categoria()
    except Exception as error:
        print(f"No se pudo leer la categoría de Carrefour ({error})")
        raise SystemExit(1)
    print(f"Productos leídos de la categoría Yerba: {len(productos)}")

    actualizadas = 0
    for marca in MARCAS:
        try:
            nombre, gramos, precio = elegir(marca, productos)
        except Exception as error:
            print(f"{marca}: no se pudo obtener el precio ({error})")
            continue

        # Si ya había un precio de hoy para esta marca, se reemplaza.
        datos = [d for d in datos if not (d["marca"] == marca and d["fecha"] == hoy)]
        datos.append({"marca": marca, "precio": precio, "fecha": hoy, "producto": nombre})
        actualizadas += 1
        aviso = "" if gramos == 1000 else f" (paquete de {gramos:.0f} g, convertido a precio por kilo)"
        print(f"{marca}: {nombre} -> ${precio:,.0f} por kilo{aviso}")

    datos.sort(key=lambda d: (d["fecha"], d["marca"]))
    ARCHIVO.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Listo: {actualizadas} de {len(MARCAS)} marcas actualizadas.")
    if actualizadas == 0:
        raise SystemExit(1)  # que GitHub Actions marque la ejecución como fallida


if __name__ == "__main__":
    main()
