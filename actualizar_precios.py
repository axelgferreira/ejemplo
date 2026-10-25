"""Actualiza precios.json con el precio de venta de cada yerba en Carrefour Argentina.

Usa el buscador de catálogo de la tienda online (plataforma VTEX). Corré este script
en tu compu antes de subirlo a GitHub: si Carrefour cambia el sitio o bloquea las
consultas, el script avisa qué marca falló y deja el resto como estaba.

    pip install requests
    python actualizar_precios.py
"""

import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ARCHIVO = Path("precios.json")
URL = "https://www.carrefour.com.ar/api/catalog_system/pub/products/search"
CABECERAS = {"User-Agent": "Mozilla/5.0 (compatible; yerba-precios/1.0)"}

# Para cada marca: qué buscar, qué palabras debe tener el nombre y cuáles descartar.
# Ajustá "incluir" / "excluir" si el script elige un producto que no es el que querés.
MARCAS = {
    "rosamonte": {"busqueda": "yerba mate rosamonte 1 kg", "incluir": ["rosamonte"]},
    "cbse": {"busqueda": "yerba mate cbse 1 kg", "incluir": ["cbse"]},
    "taragui": {"busqueda": "yerba mate taragui 1 kg", "incluir": ["taragui"]},
    "lamerced": {"busqueda": "yerba mate la merced 1 kg", "incluir": ["la merced"]},
}
EXCLUIR = ["cocido", "saquito", "bolsita", "lata", "pack", "combo", "bombilla", "tereré", "terere"]


def normalizar(texto: str) -> str:
    """Minúsculas y sin tildes, para comparar nombres de forma pareja."""
    sin_tildes = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def es_un_kilo(nombre: str) -> bool:
    return re.search(r"\b1\s?kg\b", nombre) is not None


def precio_de(producto: dict):
    """Devuelve el precio de venta si el producto tiene stock, o None."""
    for item in producto.get("items", []):
        for vendedor in item.get("sellers", []):
            oferta = vendedor.get("commertialOffer", {})  # así se escribe en VTEX
            if oferta.get("AvailableQuantity", 0) > 0 and oferta.get("Price", 0) > 0:
                return float(oferta["Price"])
    return None


def obtener_precio(marca: str):
    """Busca la yerba de la marca y devuelve (nombre del producto, precio)."""
    config = MARCAS[marca]
    respuesta = requests.get(
        URL, params={"ft": config["busqueda"]}, headers=CABECERAS, timeout=20
    )
    respuesta.raise_for_status()

    candidatos = []
    for producto in respuesta.json():
        nombre = normalizar(producto.get("productName", ""))
        if not all(p in nombre for p in config["incluir"]):
            continue
        if not es_un_kilo(nombre):
            continue
        if any(normalizar(x) in nombre for x in EXCLUIR):
            continue
        precio = precio_de(producto)
        if precio is not None:
            candidatos.append((producto["productName"], precio))

    if not candidatos:
        raise ValueError("no se encontró un producto de 1 kg con stock")

    # El nombre más corto suele ser la versión tradicional, sin variantes.
    return min(candidatos, key=lambda c: len(c[0]))


def main():
    datos = json.loads(ARCHIVO.read_text(encoding="utf-8")) if ARCHIVO.exists() else []
    hoy = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date().isoformat()
    actualizadas = 0

    for marca in MARCAS:
        try:
            producto, precio = obtener_precio(marca)
        except Exception as error:
            print(f"{marca}: no se pudo obtener el precio ({error})")
            continue

        # Si ya había un precio de hoy para esta marca, se reemplaza.
        datos = [d for d in datos if not (d["marca"] == marca and d["fecha"] == hoy)]
        datos.append({"marca": marca, "precio": precio, "fecha": hoy, "producto": producto})
        actualizadas += 1
        print(f"{marca}: {producto} -> ${precio:,.0f}")

    datos.sort(key=lambda d: (d["fecha"], d["marca"]))
    ARCHIVO.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Listo: {actualizadas} de {len(MARCAS)} marcas actualizadas.")
    if actualizadas == 0:
        raise SystemExit(1)  # que GitHub Actions marque la ejecución como fallida


if __name__ == "__main__":
    main()
