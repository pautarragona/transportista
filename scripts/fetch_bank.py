#!/usr/bin/env python3
"""Descarga los bancos oficiales (mercancías) de la web del Ministerio y los descomprime en ./bank/

- Preguntas test:   pm_XXXXXX.zip -> bank/test/   (+ bank/VERSION)
- Casos prácticos:  cm_XXXXXX.zip -> bank/casos/
Busca en cada página el ZIP más reciente; si no lo encuentra usa el último conocido.
"""
import io
import pathlib
import re
import sys
import urllib.request
import zipfile

BASE = "https://www.transportes.gob.es/transporte-terrestre/examenes-y-formacion/competencia-profesional/"
CDN = "https://cdn.transportes.gob.es/portal-web-transportes/transporte-terrestre/examenes-competencia/"
SOURCES = [
    ("test", BASE + "preguntas-mercancias", "pm", CDN + "pm_260326.zip"),
    ("casos", BASE + "casos-practicos-mercancias", "cm", CDN + "cm_260326.zip"),
]
UA = {"User-Agent": "Mozilla/5.0 (transportista-study-site build)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return r.read()


def find_zip(page, prefix, fallback):
    try:
        html = get(page).decode("utf-8", "replace")
        found = re.findall(r"""["']([^"']*?/%s_(\d{6})\.zip)["']""" % prefix, html)
        if found:
            # ddmmyy -> yymmdd para quedarnos con el más reciente
            href, _ = max(found, key=lambda f: f[1][4:6] + f[1][2:4] + f[1][0:2])
            return href if href.startswith("http") else "https://www.transportes.gob.es" + href
    except Exception as e:  # noqa: BLE001
        print(f"::warning::No se pudo leer {page}: {e}")
    return fallback


def main():
    out = pathlib.Path("bank")
    out.mkdir(exist_ok=True)
    for name, page, prefix, fallback in SOURCES:
        url = find_zip(page, prefix, fallback)
        try:
            data = get(url)
        except Exception as e:  # noqa: BLE001
            if name == "test":
                raise
            print(f"::warning::No se pudieron descargar los casos ({url}): {e}")
            continue
        z = zipfile.ZipFile(io.BytesIO(data))
        print(f"::notice::{name}: {url} ({len(data)} bytes) {z.namelist()}")
        z.extractall(out / name)
        if name == "test":
            (out / "VERSION").write_text(re.search(r"_(\d{6})\.zip", url).group(1))


if __name__ == "__main__":
    sys.exit(main())
