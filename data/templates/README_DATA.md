# Paquete de datos (JSON local) — SIE 2028

Fecha de generación: 2026-03-01

Este paquete define **estructura de datos oficial** para trabajar con archivos JSON locales.
La idea es: **primero el sistema**, luego completamos la data real.

## Reglas de llaves
- Provincia: `prov_code` en formato `DO-01` ... `DO-32` (llave maestra)
- Nivel electoral: `level` ∈ `pres`, `sen`, `dip`, `alc`

## Archivos
- `data/meta.json` — versión del dataset y fechas
- `data/parties.json` — catálogo de partidos (incluye FP)
- `data/geography_prov.json` — catálogo de provincias (código + nombre)
- `data/results_2020.json` y `data/results_2024.json` — resultados por provincia y nivel
- `data/padron_2024.json` — padrón y participación (2024)
- `data/curules.json` — curules por demarcación (dip total = 190)
- `data/polls.json` — encuestas (se registran con el tiempo)
- `data/mappings_svg.json` — mapa de IDs del SVG a `prov_code`

## Nota sobre encuestas
Las encuestas se podrán:
1) Importar pegando JSON en la herramienta, o
2) Editar desde UI y guardar en `localStorage` (sin tocar el archivo).
