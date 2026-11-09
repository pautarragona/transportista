#!/usr/bin/env python3
"""Enlaza cada norma citada en el banco con su texto oficial (BOE consolidado / EUR-Lex).

build_links(normas) -> {base_tal_cual_aparece: url}
Los identificadores BOE se comprueban descargando la ficha y verificando que el título
contiene el número de la norma; si no coincide (o no hay conexión) esa norma no se enlaza.
"""
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (transportista-study-site build)"}

# clave canónica -> (id BOE, texto que debe aparecer en el título)
BOE = {
    "ley 16/1987": ("BOE-A-1987-17803", "16/1987"),
    "rd 1211/1990": ("BOE-A-1990-24442", "1211/1990"),
    "ley 15/2009": ("BOE-A-2009-18004", "15/2009"),
    "om fom/1882/2012": ("BOE-A-2012-11324", "1882/2012"),
    "om fom/2861/2012": ("BOE-A-2013-154", "2861/2012"),
    "om trm/59/2025": ("BOE-A-2025-1478", "59/2025"),
    "rd 97/2014": ("BOE-A-2014-2110", "97/2014"),
    "rd 920/2017": ("BOE-A-2017-12841", "920/2017"),
    "rd 284/2021": ("BOE-A-2021-6624", "284/2021"),
    "rd 2064/1995": ("BOE-A-1996-1579", "2064/1995"),
    "rdley 19/2018": ("BOE-A-2018-16036", "19/2018"),
    "ley 7/2022": ("BOE-A-2022-5809", "7/2022"),
    "rd 990/2022": ("BOE-A-2022-19912", "990/2022"),
    "cc": ("BOE-A-1889-4763", "Código Civil"),
    "ccom": ("BOE-A-1885-6627", "Código de Comercio"),
    "rdleg 1/2020": ("BOE-A-2020-4859", "1/2020"),
    "rdleg 1/2010": ("BOE-A-2010-10544", "1/2010"),
    "ley 27/1999": ("BOE-A-1999-15681", "27/1999"),
    "rdleg 2/2015": ("BOE-A-2015-11430", "2/2015"),
    "lo 11/1985": ("BOE-A-1985-16660", "11/1985"),
    "rdleg 8/2015": ("BOE-A-2015-11724", "8/2015"),
    "rdley 17/1977": ("BOE-A-1977-6061", "17/1977"),
    "ley 37/1992": ("BOE-A-1992-28740", "37/1992"),
    "rd 1624/1992": ("BOE-A-1992-28925", "1624/1992"),
    "rdleg 2/2004": ("BOE-A-2004-4214", "2/2004"),
    "ley 38/1992": ("BOE-A-1992-28741", "38/1992"),
    "ley 27/2014": ("BOE-A-2014-12328", "27/2014"),
    "ley 35/2006": ("BOE-A-2006-20764", "35/2006"),
    "ley 19/1985": ("BOE-A-1985-14036", "19/1985"),
    "pgc": ("BOE-A-2007-19884", "1514/2007"),
    "ley 50/1980": ("BOE-A-1980-22501", "50/1980"),
    "rdleg 8/2004": ("BOE-A-2004-18911", "8/2004"),
    "rd 1619/2012": ("BOE-A-2012-14696", "1619/2012"),
    "rd 2822/1998": ("BOE-A-1999-1826", "2822/1998"),
    "rd 1428/2003": ("BOE-A-2003-23514", "1428/2003"),
    "rd 818/2009": ("BOE-A-2009-9481", "818/2009"),
    "lo 10/1995": ("BOE-A-1995-25444", "10/1995"),
    "rdleg 6/2015": ("BOE-A-2015-11722", "6/2015"),
    "rd 84/1996": ("BOE-A-1996-1983", "84/1996"),
}

TYPES = [
    (r"real decreto legislativo|rd legislativo|rdleg|rdl(?!ey)", "rdleg"),
    (r"real decreto[- ]ley|rd[- ]ley|rdley", "rdley"),
    (r"real decreto|rd", "rd"),
    (r"ley org[áa]nica|lo", "lo"),
    (r"orden ministerial|orden|om", "om"),
    (r"ley", "ley"),
]


def canon(base: str):
    b = base.strip().lower()
    if b.startswith("código civil") or b.startswith("codigo civil"):
        return "cc"
    if "código de comercio" in b or "codigo de comercio" in b:
        return "ccom"
    if "plan general de contabilidad" in b:
        return "pgc"
    m = re.match(r"(?:reglamento(?: comunitario)?|reglamento delegado|reglamento de ejecuci[óo]n)\s*\((?:ce|ue|cee)\)\s*(?:n[º°o]\.?\s*)?(\d+)/(\d{4})", b)
    if m:
        return f"eu-r {m.group(2)} {int(m.group(1)):04d}"
    m = re.match(r"(?:reglamento(?: comunitario)?)\s*\((?:ce|ue|cee)\)\s*(?:n[º°o]\.?\s*)?(\d{4})/(\d+)", b)
    if m:
        return f"eu-r {m.group(1)} {int(m.group(2)):04d}"
    m = re.match(r"directiva\s*(?:\((?:ce|ue)\)\s*)?(\d{4})/(\d+)", b)
    if m:
        return f"eu-l {m.group(1)} {int(m.group(2)):04d}"
    for pat, t in TYPES:
        m = re.match(rf"(?:{pat})\.?\s+((?:[a-z]+/)?\d+/\d{{4}})\b", b)
        if m:
            return f"{t} {m.group(1)}"
    return None


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def verify(boe_id, needle):
    for page in ("act", "doc"):
        try:
            html = get(f"https://www.boe.es/buscar/{page}.php?id={boe_id}")
            t = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
            title = t.group(1) if t else html[:3000]
            if needle.lower() in title.lower():
                return page
        except Exception:  # noqa: BLE001
            pass
    return None


def build_links(normas):
    """normas: iterable de cadenas NORMA. Devuelve ({base: url}, resumen)."""
    bases = {}
    for n in normas:
        n = n.split("REFERENCIA DOCTRINAL")[0]
        for part in n.split(";"):
            part = part.strip()
            if not part:
                continue
            base = re.split(r",\s*(?:art|anexo|anejo|disp|tercera|primera|segunda|cuarta|quinta|pre[áa]mbulo)", part, flags=re.I)[0].strip(" .,")
            bases[base] = bases.get(base, 0) + 1
    verified, links, missing = {}, {}, {}
    for base, count in bases.items():
        k = canon(base)
        url = None
        if k and k.startswith("eu-"):
            kind, year, num = k.split()
            url = f"https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX:3{year}{'R' if kind == 'eu-r' else 'L'}{num}"
        elif k in BOE:
            if k not in verified:
                verified[k] = verify(*BOE[k])
            if verified[k]:
                url = f"https://www.boe.es/buscar/{verified[k]}.php?id={BOE[k][0]}"
        if url:
            links[base] = url
        else:
            missing[base] = count
    top_missing = sorted(missing.items(), key=lambda x: -x[1])[:25]
    bad = [k for k, v in verified.items() if not v]
    return links, f"normas enlazadas={len(links)}/{len(bases)} ids BOE no verificados={bad} sin enlace (top)={top_missing}"
