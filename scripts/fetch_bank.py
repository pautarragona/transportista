#!/usr/bin/env python3
"""Descarga el banco oficial de preguntas (mercancías) de la web del Ministerio y lo descomprime.

Busca en la página oficial el enlace pm_XXXXXX.zip más reciente; si no lo encuentra usa el conocido.
Salida: carpeta ./bank/ con los .txt y fichero ./bank/VERSION
"""
import io
import pathlib
import re
import sys
import urllib.request
import zipfile

PAGE = "https://www.transportes.gob.es/transporte-terrestre/examenes-y-formacion/competencia-profesional/preguntas-mercancias"
FALLBACK = "https://cdn.transportes.gob.es/portal-web-transportes/transporte-terrestre/examenes-competencia/pm_260326.zip"
UA = {"User-Agent": "Mozilla/5.0 (transportista-study-site build)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main():
    url = FALLBACK
    try:
        html = get(PAGE).decode("utf-8", "replace")
        links = re.findall(r"""["'](https?://[^"']*?/pm_(\d{6})\.zip|/[^"']*?/pm_(\d{6})\.zip)["']""", html)
        if links:
            best = max(links, key=lambda l: (l[1] or l[2])[4:6] + (l[1] or l[2])[2:4] + (l[1] or l[2])[0:2])
            url = best[0] if best[0].startswith("http") else "https://www.transportes.gob.es" + best[0]
    except Exception as e:  # noqa: BLE001
        print("No se pudo leer la página, uso el enlace conocido:", e, file=sys.stderr)
    print("Descargando", url)
    data = get(url)
    out = pathlib.Path("bank")
    out.mkdir(exist_ok=True)
    z = zipfile.ZipFile(io.BytesIO(data))
    names = z.namelist()
    print(f"::notice::ZIP {url} ({len(data)} bytes): {names[:30]}")
    z.extractall(out)
    version = re.search(r"pm_(\d{6})", url).group(1)
    (out / "VERSION").write_text(version)
    print("OK versión", version, "->", sorted(p.name for p in out.rglob("*.txt")))


if __name__ == "__main__":
    main()
