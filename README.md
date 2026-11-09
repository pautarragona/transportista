# Transportista 🚚

Web gratuita para estudiar el examen de **competencia profesional para el transporte de mercancías por carretera** (el "título de transportista") con el banco oficial de preguntas del Ministerio de Transportes.

**→ https://pautarragona.github.io/transportista/**

## Qué tiene
- **Repaso espaciado** tipo Anki: cada pregunta vuelve cuando toca según lo bien que la sabes.
- **Por materias y temas** (A–H), con progreso de cada uno.
- **Mis fallos**, **marcadas** y **recap semanal**.
- **Simulacro** como el real: 200 preguntas, 2 h, +1 acierto / −1/3 fallo (también 100, 50 y por materia).
- **Lo que más falla la gente**: estadísticas anónimas de todos los usuarios.
- **Buscador** por texto, norma o código.
- Cuenta opcional (email) para guardar el progreso en la nube y sincronizar entre dispositivos; sin cuenta se guarda en el navegador.

## Cómo funciona
- Web estática (HTML + JS, sin build) publicada en GitHub Pages.
- En cada despliegue (y cada lunes) GitHub Actions descarga el banco oficial de la web del Ministerio (`scripts/fetch_bank.py`) y lo convierte a `data/questions.json` (`scripts/build_data.py`). Si el Ministerio publica una versión nueva, la web se actualiza sola.
- Usuarios, progreso y estadísticas en Supabase (`supabase/schema.sql`), con Row Level Security: cada usuario solo puede leer y escribir lo suyo; las estadísticas globales solo exponen agregados.

## Desarrollo local
```bash
python3 scripts/fetch_bank.py                 # o descarga el ZIP a mano y descomprímelo en bank/
python3 scripts/build_data.py bank 260326
python3 -m http.server 8000                   # http://localhost:8000
```

## Aviso
Web **no oficial**. Las preguntas proceden del banco público del Ministerio de Transportes y Movilidad Sostenible, que las publica «con efectos exclusivamente informativos» y puede revisarlas o ampliarlas en cualquier momento. Comprueba siempre la convocatoria oficial de tu comunidad autónoma.
