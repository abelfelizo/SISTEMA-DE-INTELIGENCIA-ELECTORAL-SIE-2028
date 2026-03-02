# SIE 2028 · Sistema Inteligente Electoral

## Versión final (H1→H4)

### Cómo probar local
```bash
cd SIE_2028_FINAL
python3 -m http.server 8080
# Abrir: http://localhost:8080/
```

### GitHub Pages
1. Crear repo `SIE-2028`
2. Subir todo el contenido a la raíz del repo
3. Settings → Pages → Branch: main / (root)

---

## Módulos

| Módulo | Estado | Descripción |
|---|---|---|
| Dashboard | ✅ | KPIs, top partidos, curules base D'Hondt, resumen ejecutivo |
| Mapa | ✅ | SVG choropleth por ganador, zoom/pan, panel por provincia |
| Simulador | ✅ | Δpp + movilización + alianzas + arrastre presidencial → D'Hondt |
| Potencial | ✅ | Score 0-100, 6 categorías, tendencia 2020→2024 |
| Movilización | ✅ | Escenarios ±pp, coef por nivel, techo 60%, link → Simulador |
| Objetivo | ✅ | 4 escenarios (conservador/razonable/optimizado/agresivo) |
| Boleta única | ✅ | Coalición configurable, D'Hondt por demarcación, impacto por circ |
| Auditoría | ✅ | 20+ validaciones de integridad: sumatorias, curules, padrón |

## Motores

| Motor | Archivo | Descripción |
|---|---|---|
| Normalización | `core/data.js` | Maneja 3 formatos raw, filtra exterior, integers |
| D'Hondt | `core/dhondt.js` | Por demarcación + exterior (proxy nac) + nacionales |
| Simulación | `core/simulacion.js` | Δpp, alianzas, movilización, arrastre, distribución territorial |
| Potencial | `core/potencial.js` | Score ponderado 6 factores |
| Objetivo | `core/objetivo.js` | Búsqueda binaria para Δpp mínimo requerido |
| Boleta | `core/boleta.js` | Optimización por coalición demarcación por demarcación |
| Auditoría | `core/auditoria.js` | 20+ validaciones |
| Exportar | `core/exportar.js` | PDF vía window.print() |

## Contrato de datos (congelado)

| Archivo | Descripción |
|---|---|
| `data/results_2024.json` | pres/sen/dip/mun/dm — 3 formatos según nivel |
| `data/results_2020.json` | Misma estructura |
| `data/padron.json` | `mayo2024.nacional.inscritos` = 8,145,548 |
| `data/padron_2024_meta.json` | Totales nacionales validados |
| `data/curules_2024.json` | 178 terr + 7 ext + 5 nac = 190 diputados |
| `data/geography.json` | Jerarquía Prov > Mun > DM |
| `data/polls.json` | Array `[{fecha, encuestadora, nivel, resultados}]` |

**Provincias interiores:** `01`–`32` · **SVG IDs:** `DO-01`–`DO-32`  
**Exterior presidencial ignorado en mapa:** `33`,`61`–`72`
