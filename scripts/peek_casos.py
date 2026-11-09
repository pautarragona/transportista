#!/usr/bin/env python3
"""Descarga (si existe) el ZIP de casos prácticos de mercancías y deja una muestra en el log (diagnóstico)."""
import io, pathlib, re, urllib.request, zipfile
PAGE = "https://www.transportes.gob.es/transporte-terrestre/examenes-y-formacion/competencia-profesional/casos-practicos-mercancias"
UA = {"User-Agent": "Mozilla/5.0 (transportista-study-site build)"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
html = get(PAGE).decode("utf-8", "replace")
zips = sorted(set(re.findall(r"""["']([^"']+?\.zip)["']""", html)))
print("::notice::ZIPs en la página de casos:", zips)
if zips:
    u = zips[-1] if zips[-1].startswith("http") else "https://www.transportes.gob.es" + zips[-1]
    z = zipfile.ZipFile(io.BytesIO(get(u)))
    print("::notice::Contenido:", [(i.filename, i.file_size) for i in z.infolist()][:40])
    out = pathlib.Path("casos"); out.mkdir(exist_ok=True); z.extractall(out)
    for f in sorted(out.rglob("*.txt")):
        raw = f.read_bytes()
        try: t = raw.decode("utf-8")
        except UnicodeDecodeError: t = raw.decode("cp1252", "replace")
        n = t.count("COD:")
        heads = sorted(set(re.findall(r"^([A-ZÁÉÍÓÚ ]{3,25}):", t, re.M)))
        i = t.find("SOLUCION")
        ctx = t[max(0, i - 700): i + 400] if i >= 0 else t[-1200:]
        print(f"::notice::{f.name}: {n} casos; cabeceras {heads}; ZONA SOLUCION: " + ctx.replace("\n", " ⏎ ").replace("\r", ""))
