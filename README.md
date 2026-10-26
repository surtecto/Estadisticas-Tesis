# Estadísticas-Tesis

Generador web de **gráficos y mapas estadísticos para tesis e investigación** a partir de tablas de Excel, OpenDocument, CSV o JSON. Comparte el modo de trabajo de [Mapas-Tesis](https://github.com/surtecto/Mapas-Tesis): proyectos por computadora, asistente de proyecto nuevo, varias figuras por proyecto, destinos de la figura con control de legibilidad, preguntas a la figura y carpeta de proyectos sincronizada entre computadoras.

**Usar en la computadora:** abrir `index.html` con Chrome o Edge (Firefox también, sin la carpeta sincronizada). Los proyectos se guardan en el navegador de cada computadora; para llevarlos a otra, exportar el proyecto (`.estadisticas.json`) o elegir una carpeta dentro de OneDrive o Google Drive.

## Inicio y proyectos
- **Planoteca:** cada proyecto es una lámina con la vista previa de su primera figura y su rótulo (tipo de trabajo, figuras y tablas, autoría, últimos cambios). Abrir, duplicar, exportar o eliminar.
- **Proyecto nuevo en tres pasos:** el trabajo (título, autoría, institución, licencia, separador decimal), los datos (archivo, celdas pegadas o tabla de ejemplo) y la primera figura (destino y estilo).
- **Modelos de ejemplo con datos reales:** lámina de tesis (pingüinos de Palmer), infografía (Gapminder) con versión neón para proyectar, pirámides de población, mapa de partidos bonaerenses y series de clima.
- **Carpeta de proyectos** (Chrome y Edge): la misma lógica de Mapas-Tesis; cada proyecto se guarda como `nombre__id.json`, con conflictos resueltos conservando las dos versiones.

## Datos
- **Importación:** Excel (`.xlsx`, `.xls`, `.xlsm`), `.ods`, CSV y TSV (detecta separador, coma decimal y codificación de Windows), JSON y celdas pegadas desde una planilla. Elección de la hoja, la fila del encabezado (las tablas del INDEC traen títulos arriba), encabezados de dos filas y notas finales a descartar. Las celdas combinadas se repiten.
- **Tipos de variable:** numérica, categórica, ordinal (detecta escalas Likert, meses, días y rangos de edad), fecha, texto e identificador; unidad, orden de las categorías y códigos de «sin dato».
- **Transformaciones:** columnas por fórmula (`[Población] / [Superficie (km²)]`, `si(…)`, `log`, `redondear`…), clases (intervalos iguales, cuantiles, Jenks o cortes propios), recodificación, de ancho a largo (columnas de años a filas), de largo a ancho, trasponer. Descarga en `.xlsx` o CSV.

## Motor estadístico
Programado en la aplicación y verificado contra SciPy y statsmodels (`npm test`: 71 comprobaciones).
- **Describir:** n, media, DE, EE, IC 95 %, mediana, RIC, asimetría y curtosis (ajuste de SPSS), atípicos de Tukey, Shapiro–Wilk; frecuencias con IC de Wilson y bondad de ajuste.
- **Comparar:** t de Student y de Welch, U de Mann–Whitney (exacta o aproximada), muestras pareadas y Wilcoxon, una muestra, ANOVA de un factor y de Welch, Kruskal–Wallis, comparaciones de Tukey, Games–Howell, Dunn (Holm, Bonferroni, Benjamini–Hochberg), ANOVA factorial tipo III, Friedman. Revisa normalidad y homogeneidad (Levene) y **recomienda la prueba con su razón**.
- **Relacionar:** tablas de contingencia (χ², G², Fisher, V de Cramér, residuos ajustados, aviso de frecuencias esperadas bajas), correlaciones de Pearson, Spearman y Kendall con IC.
- **Modelar:** regresión lineal múltiple con predictores categóricos (β, VIF, Durbin–Watson, Cook, normalidad de residuos), regresión logística (OR con IC, razón de verosimilitudes, McFadden, Nagelkerke, clasificación), componentes principales (KMO, Bartlett, cargas), conglomerados k medias.
- **Series:** variación absoluta y relativa, tasa media anual geométrica y tasa de crecimiento exponencial por mil (convención intercensal de INDEC).
- **Salida:** tablas en formato APA, texto de resultados listo para la tesis (coma decimal y sin cero inicial en p y r), preguntas críticas, copia con formato a Word, informe completo en `.docx` y paso directo al gráfico que corresponde.

## Gráficos
44 tipos: barras (agrupadas, apiladas, 100 %, con barras de error), puntos de Cleveland y pesas, medias con IC (gráfico de interacción), cifras destacadas con anillos, histograma (Sturges, Freedman–Diaconis, Scott; curva de densidad o normal), densidades y crestas, cajas y violines con los casos y corchetes de significación, Q-Q normal, dispersión y burbujas con recta, polinomio, logaritmo, exponencial o LOESS e IC, mapa de calor, matriz de correlaciones, biplot, coeficientes de un modelo (bosque), líneas (rótulos finales, índice base 100, banda de IC, serie destacada), áreas apiladas, pendientes, torta y dona, pictograma, mosaico, pirámide de población, radar y **mapa estadístico** (provincias, departamentos o partidos del IGN, o un GeoJSON propio; coroplético por clases o continuo, tasas por habitante o por km², círculos proporcionales).

También: **rangos flotantes** (inicio–fin con extensión, escala logarítmica con unidades, franjas de referencia y notas por barra), línea de tiempo, Gantt, cascada, embudo, Sankey, viñeta (bullet), progreso, barras radiales, velocímetro, tabla, enjambre (beeswarm), distribución acumulada, hexágonos, coordenadas paralelas, ranking (bump), calendario, sol (sunburst), Marimekko, rosa de Nightingale, área en flujo y líneas escalonadas.
- **Edición sobre el gráfico:** se toca un título, una barra, un eje o la leyenda y se edita ahí mismo (color, destacar, ocultar, mínimos y máximos, unidades, escala logarítmica, posición de la leyenda); doble clic agrega una nota con flecha que se arrastra.
- **Láminas:** varios paneles con letras A, B, C, distribución en columnas y paneles que ocupan varias celdas; **paneles múltiples** por una variable con escalas compartidas.
- **Filtros** por panel, colores por categoría (el color sigue a la categoría), categoría destacada.

## Figura
- **Destinos** de Mapas-Tesis: tesis A4, artículo de una o dos columnas, lámina A3, póster, proyector, videollamada, monitor, web y redes, con tamaño, resolución y mínimos de legibilidad.
- **Estilos:** tesis (APA), humanidades (serif), revista científica, mínimo (Tufte), blanco y negro con tramas, pampa, ensayo (papel y serif), periodístico, infografía azul, neón sobre oscuro y proyector.
- **Estilo desde una imagen:** se sube un JPG, PNG o captura de pantalla de un gráfico y la app lee fondo, tinta, rótulos, grilla (horizontal o vertical), paleta por orden de importancia, degradés y brillo; se ajusta con vista previa y queda guardado como estilo del proyecto.
- **Epígrafe:** APA 7, clásico, título afirmativo con bajada o ninguno; notas automáticas sobre lo que muestra cada gráfico.
- **Control:** legibilidad para el destino, distinguibilidad de la paleta con daltonismo y en grises, simulación de fotocopia, proyector y tres tipos de daltonismo, preguntas a la figura y ficha metodológica.
- **Exportación:** SVG vectorial con tipografías incrustadas, PNG, TIFF y PDF sin pérdida a la resolución del destino, JPEG; en color o grises. Paletas tomadas de una imagen.

## Datos incluidos y atribuciones
| Fuente | Uso |
|---|---|
| Instituto Geográfico Nacional, SIG 250, vía [mgaitan/departamentos_argentina](https://github.com/mgaitan/departamentos_argentina) | Departamentos y partidos (geometría simplificada; 134 partidos bonaerenses, sin Lezama) |
| Gorman, Williams y Fraser (2014), paquete palmerpenguins | Tabla de ejemplo |
| Fundación Gapminder; Oficina del Censo de los EE. UU. (IPUMS); NOAA — vía [vega-datasets](https://github.com/vega/vega-datasets) | Tablas de ejemplo |

## Desarrollo
`npm install`, `npm run build` (esbuild: `assets/app.js`), `npm test` (motor estadístico contra `tests/ref.json`, generado con `python3 tests/ref.py`). La geometría se prepara con `node tools/prep_geo.mjs`.
