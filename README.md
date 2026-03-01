# SIE 2028 (GitHub Pages Ready)

## Cómo probar local
- En Mac: abre Terminal en la carpeta y ejecuta un servidor simple:
  - `python3 -m http.server 8080`
- Abre: `http://localhost:8080/`

## Cómo subir a GitHub Pages
1. Crea un repo (ej: `SIE-2028`).
2. Sube **todo** el contenido de esta carpeta a la raíz del repo (no dentro de otra subcarpeta).
3. Ve a: Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / (root)
4. Espera la publicación y abre el enlace.

## Notas
- Es SPA con `<base href="./">` para funcionar en sub-ruta de GitHub Pages.
- La data vive en `./data/*.json` y se carga por `fetch()` (sin backend).
- Para editar/actualizar encuestas: reemplaza `data/polls.json` o usa `data/encuestas_master.xlsx` como plantilla.
