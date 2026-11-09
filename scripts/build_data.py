#!/usr/bin/env python3
"""Convierte el banco oficial del Ministerio (pm1A.txt ... pm1H.txt) a data/questions.json.

Uso:  python3 scripts/build_data.py <carpeta_con_txt> [version]
Ej.:  python3 scripts/build_data.py pm_260326 260326

Formato de salida (compacto):
{
  "version": "260326",
  "materias": {"A": "Elementos de Derecho civil", ...},
  "temas": {"A01": "Código Civil", ...},          # etiqueta orientativa (norma más citada)
  "q": [[cod, pregunta, [opA, opB, ...], indiceCorrecta, norma], ...]
}
"""
import collections
import json
import pathlib
import re
import sys

MATERIAS = {
    "A": "Elementos de Derecho civil",
    "B": "Elementos de Derecho mercantil",
    "C": "Elementos de Derecho laboral",
    "D": "Elementos de Derecho fiscal",
    "E": "Gestión comercial y financiera",
    "F": "Acceso a los mercados",
    "G": "Normas y explotación técnicas",
    "H": "Seguridad vial",
}

FIELD = re.compile(r"^(COD|PREGUNTA|SOLUCION|NORMA|[A-H]):\s?(.*)$")


def read_text(path: pathlib.Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode("utf-8", "replace")


def parse_file(path: pathlib.Path):
    text = read_text(path).replace("\r\n", "\n")
    out = []
    for chunk in re.split(r"\n(?=COD:)", text.strip()):
        rec, last = {}, None
        for line in chunk.split("\n"):
            m = FIELD.match(line)
            if m:
                last = m.group(1)
                rec[last] = m.group(2).strip()
            elif line.strip() and last:  # continuación de línea
                rec[last] += " " + line.strip()
        if "COD" not in rec:
            continue
        letters = [l for l in "ABCDEFGH" if l in rec]
        sol = rec.get("SOLUCION", "").strip().upper()
        if sol not in letters:
            print(f"  ! {rec['COD']}: solución '{sol}' no válida, se omite", file=sys.stderr)
            continue
        out.append([
            rec["COD"],
            rec["PREGUNTA"],
            [rec[l] for l in letters],
            letters.index(sol),
            rec.get("NORMA", ""),
        ])
    return out


LEGAL = re.compile(r"^(Ley|RD|Real|Reglamento|C[óo]digo|Convenio|Directiva|OM|Orden|Acuerdo|Decreto|INCOTERMS)", re.I)


def tema_label(normas):
    """Fuente más citada del tema (orientativo: el Ministerio no publica títulos de tema)."""
    c = collections.Counter()
    for n in normas:
        n = n.split("REFERENCIA DOCTRINAL")[0]
        for part in n.split(";"):
            part = part.strip()
            if not part:
                continue
            if LEGAL.match(part):
                base = re.split(r",\s*(art|anexo|anejo|disp|tercera|primera|segunda|cuarta|quinta|pre[áa]mbulo)", part, flags=re.I)[0]
            else:
                base = part.split(",")[0]
            base = base.strip(" .,")
            if base:
                c[base] += 1
    return " · ".join(b for b, _ in c.most_common(2)) if c else ""


CASO_HEAD = re.compile(r"^(COD|PREGUNTA|RESPUESTA [A-H]|SOLUCION|NORMA|REFERENCIA DOCTRINAL|NOTA):[ \t]*(.*)$")


def clean_block(lines):
    """Une líneas conservando saltos de párrafo, sin líneas vacías repetidas."""
    out, blank = [], False
    for l in lines:
        l = l.rstrip()
        if not l.strip():
            blank = bool(out)
            continue
        if blank and out:
            out.append("")
        out.append(re.sub(r"\s+", " ", l.strip()))
        blank = False
    return "\n".join(out).strip()


SKIPPED = []


def parse_casos(path: pathlib.Path):
    text = read_text(path).replace("\r\n", "\n").replace("\r", "\n")
    out = []
    for chunk in re.split(r"\n(?=COD:)", text.strip()):
        sec, cur = {}, None
        for line in chunk.split("\n"):
            m = CASO_HEAD.match(line.strip())
            if m:
                cur = m.group(1)
                sec[cur] = [m.group(2)] if m.group(2) else []
            elif cur:
                sec[cur].append(line)
        if "COD" not in sec:
            continue
        cod = clean_block(sec["COD"])
        letters = [l for l in "ABCDEFGH" if f"RESPUESTA {l}" in sec]
        sol = re.sub(r"^RESPUESTA\s*", "", clean_block(sec.get("SOLUCION", [])).upper()).strip(" .")
        if len(letters) < 2 or sol not in letters:
            print(f"caso {cod}: respuestas {letters} / solución '{sol}' no válidas, se omite")
            SKIPPED.append(cod)
            continue
        # cada sub-respuesta (A), B), C)...) en su propia línea, sin párrafos vacíos
        opts = [re.sub(r"\n\n+", "\n", clean_block(sec[f"RESPUESTA {l}"])) for l in letters]
        norma = clean_block(sec.get("NORMA", [])).replace("\n", " ")
        nota = clean_block(sec.get("NOTA", [])).replace("\n", " ")
        item = [cod, clean_block(sec.get("PREGUNTA", [])), opts, letters.index(sol), norma]
        if nota:
            item.append(nota)
        out.append(item)
    return out


def find_files(src, pattern):
    files = {}
    for f in src.rglob("*"):
        if f.is_file() and re.fullmatch(pattern, f.name, re.I):
            files.setdefault(f.name.upper(), f)  # evita duplicados si el ZIP trae copias
    return [f for _, f in sorted(files.items())]


def main():
    try:
        _main()
    except Exception as e:  # noqa: BLE001
        print(f"::error::{type(e).__name__}: {e}")
        raise


def _main():
    src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "pm_260326")
    version = sys.argv[2] if len(sys.argv) > 2 else re.sub(r"\D", "", src.name) or "?"
    qs = []
    files = {}
    for f in src.rglob("*"):
        if f.is_file() and re.fullmatch(r"pm1[a-h]\.txt", f.name, re.I):
            files.setdefault(f.name.upper(), f)  # evita duplicados si el ZIP trae copias
    if not files:
        print("::error::No se encontraron pm1A..H.txt. Ficheros:", [str(x) for x in src.rglob("*")][:40])
    for _, f in sorted(files.items()):
        got = parse_file(f)
        print(f"{f.name}: {len(got)} preguntas")
        qs += got
    assert len(qs) > 1000, f"solo {len(qs)} preguntas: algo ha ido mal"
    seen, uniq = set(), []
    for q in qs:
        if q[0] in seen:
            print(f"::warning::código duplicado {q[0]}, se queda el primero")
            continue
        seen.add(q[0]); uniq.append(q)
    qs = uniq
    by_tema = collections.defaultdict(list)
    for q in qs:
        by_tema[q[0][1:4]].append(q[4])
    temas = {t: tema_label(n) for t, n in sorted(by_tema.items())}
    out = {"version": version, "materias": MATERIAS, "temas": temas, "q": qs}
    dst = pathlib.Path(__file__).resolve().parent.parent / "data" / "questions.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"TOTAL {len(qs)} preguntas, {len(temas)} temas -> {dst} ({dst.stat().st_size/1e6:.2f} MB)")

    casos = []
    for f in find_files(src, r"cm1[a-h]\.txt"):
        got = parse_casos(f)
        print(f"{f.name}: {len(got)} casos")
        casos += got
    if casos:
        dst2 = dst.parent / "casos.json"
        dst2.write_text(json.dumps({"version": version, "q": casos}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        per = collections.Counter(c[0][1] for c in casos)
        print(f"::notice::RESUMEN test={len(qs)} casos={len(casos)} por materia={dict(sorted(per.items()))} omitidos={SKIPPED[:20]} ({len(SKIPPED)}) opciones={collections.Counter(len(c[2]) for c in casos)}")
    else:
        print("::warning::Sin casos prácticos")


if __name__ == "__main__":
    main()
