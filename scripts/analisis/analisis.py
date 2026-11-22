"""ANÁLISIS DE DATOS DE PALANTEMX (APRENDIZAJE AUTOMÁTICO).

  1) ÁRBOL DE DECISIÓN: CON LO QUE LA APP SABE DE UN TRABAJADOR ANTES DE UNA OBRA (CUMPLIMIENTO EN OBRAS ANTERIORES,
     CALIFICACIÓN, OBRAS TERMINADAS Y DISTANCIA A LA OBRA) PREDICE SI LA OBRA TERMINARÁ SIN PROBLEMAS.
     -> "RECOMENDAR PERFILES CONFIABLES Y REDUCIR EL RIESGO".
  2) AGRUPAMIENTO JERÁRQUICO (MÉTODO DE WARD): JUNTA LOS MUNICIPIOS QUE SE PARECEN EN CUÁNTAS VACANTES HAY POR CADA
     TRABAJADOR DE CADA GRUPO DE OFICIOS. -> "IDENTIFICAR LAS ZONAS CON MAYOR NECESIDAD DE CIERTOS OFICIOS".

USO:  node ../semilla/exportar-analisis.mjs datos.json   y luego   python analisis.py
      (O EN LA NUBE: GOOGLE COLAB CON PalanteMX_analisis.ipynb, QUE GENERA crear_colab.py)
SALIDA: figuras/*.png (PARA EL DOCUMENTO), resultados.json Y src/lib/modelo-confianza.ts (EL ÁRBOL QUE USA LA APP).
"""
import json
import warnings
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import dendrogram, fcluster, linkage
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, silhouette_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.tree import DecisionTreeClassifier

from datos_analisis import GRUPOS, cargar, contratos, zonas

warnings.filterwarnings('ignore')
AQUI = Path(__file__).parent
FIG = AQUI / 'figuras'
FIG.mkdir(exist_ok=True)

# ------------------------------------------------------------------ ESTILO (PALETA VALIDADA, TINTA Y CUADRÍCULA SOBRIAS)
AZUL, NARANJA, AQUA, AMARILLO = '#2a78d6', '#eb6834', '#1baf7a', '#eda100'
CATEGORICOS = [AZUL, NARANJA, AQUA, AMARILLO]
SECUENCIAL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
TINTA, TINTA2, TENUE, REJILLA, FONDO = '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#fcfcfb'
plt.rcParams.update({
    'font.family': 'Arial', 'font.size': 10, 'axes.edgecolor': REJILLA, 'axes.labelcolor': TINTA2, 'xtick.color': TENUE,
    'ytick.color': TENUE, 'axes.titlesize': 12, 'axes.titleweight': 'bold', 'axes.titlecolor': TINTA, 'figure.facecolor': FONDO,
    'axes.facecolor': FONDO, 'savefig.facecolor': FONDO, 'axes.spines.top': False, 'axes.spines.right': False,
})


def guardar(fig, nombre):
    fig.savefig(FIG / f'{nombre}.png', dpi=220, bbox_inches='tight')
    plt.close(fig)


def barras(ax, etiquetas, valores, textos, color=AZUL, maximo=None):
    pos = np.arange(len(valores))
    ax.bar(pos, valores, width=0.55, color=color, edgecolor=FONDO, linewidth=2, zorder=3)
    for x, v, t in zip(pos, valores, textos):
        ax.text(x, v + (maximo or max(valores)) * 0.02, t, ha='center', va='bottom', color=TINTA, fontsize=10, fontweight='bold')
    ax.set_xticks(pos, etiquetas)
    ax.yaxis.grid(True, color=REJILLA, linewidth=0.8, zorder=0)
    ax.set_ylim(0, (maximo or max(valores)) * 1.15)


# =================================================================================================== 1) ÁRBOL DE DECISIÓN
d = cargar()
c = contratos(d)
VARIABLES = ['cumplimiento_previo', 'calificacion_previa', 'obras_previas', 'distancia_km']
NOMBRES = {'cumplimiento_previo': 'Cumplimiento en obras anteriores (%)', 'calificacion_previa': 'Calificación previa (estrellas)',
           'obras_previas': 'Obras terminadas antes', 'distancia_km': 'Distancia a la obra (km)'}
X, y = c[VARIABLES], c['sin_problemas']
# RESTRICCIÓN LÓGICA (monotonic_cst): MÁS CALIFICACIÓN U OBRAS NUNCA BAJAN LA CONFIANZA Y MÁS DISTANCIA NUNCA LA SUBE
# (EL CUMPLIMIENTO VA LIBRE PORQUE -1 SIGNIFICA "SIN OBRAS ANTERIORES"). EVITA REGLAS QUE SOLO SON RUIDO DE LOS DATOS.
PARAMS = dict(max_depth=3, min_samples_leaf=20, class_weight='balanced', random_state=0, monotonic_cst=[0, 1, 1, -1])

# --- DESCRIPTIVO: CÓMO TERMINARON LOS CONTRATOS Y QUÉ TANTO SE RELACIONA CADA VARIABLE CON EL RESULTADO
grupos_cumpl = pd.cut(c['cumplimiento_previo'], [-2, -0.5, 50, 75, 101], labels=['Sin obras\nanteriores', '50 % o menos', '51 a 75 %', 'Más de 75 %'])
por_cumpl = c.groupby(grupos_cumpl, observed=False)['sin_problemas'].agg(['mean', 'count'])
grupos_dist = pd.cut(c['distancia_km'], [0, 10, 20, 35, 500], labels=['Hasta 10 km', '10 a 20 km', '20 a 35 km', 'Más de 35 km'])
por_dist = c.groupby(grupos_dist, observed=False)['sin_problemas'].agg(['mean', 'count'])

fig, ax = plt.subplots(figsize=(7, 3.6))
barras(ax, por_cumpl.index, por_cumpl['mean'] * 100, [f"{m:.0%}\n({n} obras)" for m, n in zip(por_cumpl['mean'], por_cumpl['count'])], maximo=100)
ax.set_ylabel('% de obras sin problemas'); ax.set_title('Obras sin problemas según el cumplimiento previo del trabajador', loc='left')
guardar(fig, 'g1_cumplimiento')

fig, ax = plt.subplots(figsize=(7, 3.6))
barras(ax, por_dist.index, por_dist['mean'] * 100, [f"{m:.0%}\n({n} obras)" for m, n in zip(por_dist['mean'], por_dist['count'])], maximo=100)
ax.set_ylabel('% de obras sin problemas'); ax.set_title('Obras sin problemas según la distancia a la obra', loc='left')
guardar(fig, 'g2_distancia')

# --- EVALUACIÓN 1: VALIDACIÓN CRUZADA DE 5 PARTES. SE ENTRENA CON 4/5 DE LAS OBRAS Y SE PREDICE LA QUINTA PARTE QUE EL
# ÁRBOL NO VIO; SE REPITE CON CADA PARTE, ASÍ CADA OBRA SE PREDICE UNA VEZ "A CIEGAS"
pred = cross_val_predict(DecisionTreeClassifier(**PARAMS), X, y, cv=StratifiedKFold(5, shuffle=True, random_state=0))
mc = confusion_matrix(y, pred, labels=[0, 1])
eval_prueba = {
    'obras': int(len(y)), 'exactitud': round(accuracy_score(y, pred), 3), 'exactitud_balanceada': round(balanced_accuracy_score(y, pred), 3),
    'problemas_detectados': f'{mc[0, 0]} de {mc[0].sum()}', 'buenas_reconocidas': f'{mc[1, 1]} de {mc[1].sum()}',
    'matriz': mc.tolist(), 'base_siempre_sin_problemas': round(float(y.mean()), 3),
}

fig, ax = plt.subplots(figsize=(4.6, 3.8))
ax.imshow(mc, cmap=matplotlib.colors.LinearSegmentedColormap.from_list('azul', SECUENCIAL[:5]), vmin=0)
for i in range(2):
    for j in range(2):
        ax.text(j, i, mc[i, j], ha='center', va='center', fontsize=20, fontweight='bold', color='white' if mc[i, j] > mc.max() * 0.55 else TINTA)
ax.set_xticks([0, 1], ['Con problemas', 'Sin problemas']); ax.set_yticks([0, 1], ['Con problemas', 'Sin problemas'])
ax.set_xlabel('Lo que predijo el árbol'); ax.set_ylabel('Lo que pasó en realidad')
ax.spines[:].set_visible(False); ax.tick_params(length=0)
ax.set_title(f'Matriz de confusión ({len(y)} obras, validación cruzada)', loc='left')
guardar(fig, 'g4_matriz_confusion')

# --- EVALUACIÓN 2: VALIDACIÓN CRUZADA (5 PARTES, REPETIDA 30 VECES) PARA QUE EL RESULTADO NO DEPENDA DE LA SUERTE
reps = []
for r in range(30):
    pr = cross_val_predict(DecisionTreeClassifier(**PARAMS), X, y, cv=StratifiedKFold(5, shuffle=True, random_state=r))
    reps.append((accuracy_score(y, pr), balanced_accuracy_score(y, pr), y[pr == 1].mean(), y[pr == 0].mean()))
reps = np.array(reps)
eval_cv = {
    'exactitud': round(reps[:, 0].mean(), 3), 'exactitud_balanceada': round(reps[:, 1].mean(), 3), 'desviacion_balanceada': round(reps[:, 1].std(), 3),
    'exito_si_predice_confiable': round(reps[:, 2].mean(), 3), 'exito_si_predice_riesgo': round(reps[:, 3].mean(), 3),
}

# --- EL ÁRBOL FINAL (CON TODOS LOS DATOS) ES EL QUE USA LA APP
arbol = DecisionTreeClassifier(**PARAMS).fit(X, y)
hoja_de = arbol.apply(X)
t = arbol.tree_


def nivel(p, sin_historial=False):
    # LOS QUE NO TIENEN OBRAS ANTERIORES NO SON "MEDIA": SON NUEVOS EN LA APP (ASÍ LO MUESTRA LA APP)
    return 'Nuevo' if sin_historial else 'Alta' if p >= 0.8 else 'Media' if p >= 0.6 else 'Baja'


def nodo(i):
    if t.children_left[i] == -1:  # HOJA: PROPORCIÓN REAL DE OBRAS SIN PROBLEMAS (SIN EL PESO DE class_weight)
        en_hoja = y[hoja_de == i]
        p = float(en_hoja.mean())
        nuevo = bool((X[hoja_de == i]['cumplimiento_previo'] < 0).all())
        return {'hoja': True, 'probabilidad': round(p, 3), 'nivel': nivel(p, nuevo), 'obras': int(len(en_hoja))}
    return {'hoja': False, 'variable': VARIABLES[t.feature[i]], 'umbral': round(float(t.threshold[i]), 2), 'si': nodo(t.children_left[i]), 'no': nodo(t.children_right[i])}


MODELO = nodo(0)
importancia = dict(zip(VARIABLES, np.round(arbol.feature_importances_, 3)))

# --- NIVELES DEL ÁRBOL EN VALIDACIÓN CRUZADA: ¿DE VERDAD LAS OBRAS "ALTA" SALEN MEJOR QUE LAS "BAJA"?
niveles_cv = {'Alta': [], 'Media': [], 'Baja': [], 'Nuevo': []}
for r in range(30):
    for ent, pru in StratifiedKFold(5, shuffle=True, random_state=r).split(X, y):
        m = DecisionTreeClassifier(**PARAMS).fit(X.iloc[ent], y.iloc[ent])
        hojas_e = m.apply(X.iloc[ent])
        prob_hoja = {h: y.iloc[ent][hojas_e == h].mean() for h in np.unique(hojas_e)}
        for h, real, cum in zip(m.apply(X.iloc[pru]), y.iloc[pru], X.iloc[pru]['cumplimiento_previo']):
            niveles_cv[nivel(prob_hoja[h], cum < 0)].append(real)
por_nivel = {k: (round(float(np.mean(v)), 3), len(v) // 30) for k, v in niveles_cv.items() if v}

fig, ax = plt.subplots(figsize=(7, 3.6))
orden = [k for k in ['Alta', 'Media', 'Baja', 'Nuevo'] if k in por_nivel]
barras(ax, [('Nuevo (sin obras)' if k == 'Nuevo' else f'Confianza {k.lower()}') + f'\n{por_nivel[k][1]} obras' for k in orden], [por_nivel[k][0] * 100 for k in orden], [f'{por_nivel[k][0]:.0%}' for k in orden], maximo=100)
ax.axhline(y.mean() * 100, color=TENUE, linewidth=1.2, linestyle='--', zorder=4)
ax.text(-0.45, y.mean() * 100 + 2, f'promedio general {y.mean():.0%}', color=TINTA2, fontsize=9, ha='left', bbox=dict(facecolor=FONDO, edgecolor='none', pad=1), zorder=6)
ax.set_ylabel('% de obras sin problemas'); ax.set_title('Obras sin problemas según el nivel que dio el árbol (validación cruzada)', loc='left')
guardar(fig, 'g5_niveles')

fig, ax = plt.subplots(figsize=(6.4, 2.8))
orden_imp = sorted(importancia, key=importancia.get)
ax.barh([NOMBRES[v] for v in orden_imp], [importancia[v] * 100 for v in orden_imp], color=AZUL, height=0.5, edgecolor=FONDO, linewidth=2, zorder=3)
for i, v in enumerate(orden_imp):
    ax.text(importancia[v] * 100 + 1, i, f'{importancia[v]:.0%}', va='center', color=TINTA, fontweight='bold')
ax.xaxis.grid(True, color=REJILLA, zorder=0); ax.set_xlim(0, 100); ax.set_xlabel('Importancia en las decisiones del árbol (%)')
ax.set_title('¿Qué variables usó más el árbol?', loc='left')
guardar(fig, 'g6_importancia')


# --- DIBUJO DEL ÁRBOL EN ESPAÑOL (CAJAS CON LA PREGUNTA Y HOJAS CON EL NIVEL DE CONFIANZA)
def texto_pregunta(n):
    u = n['umbral']
    return {'cumplimiento_previo': ('¿Sin obras anteriores?' if u < 0 else f'¿Cumplimiento previo\n≤ {u:.0f} %?'),
            'calificacion_previa': f'¿Calificación previa\n≤ {u:.1f} estrellas?', 'obras_previas': f'¿Obras anteriores\n≤ {int(u)}?',
            'distancia_km': f'¿Distancia a la obra\n≤ {u:.0f} km?'}[n['variable']]


hojas = []
def contar(n):
    if n['hoja']:
        hojas.append(n); return
    contar(n['si']); contar(n['no'])
contar(MODELO)
COLOR_NIVEL = {'Alta': AQUA, 'Media': AMARILLO, 'Baja': NARANJA, 'Nuevo': AZUL}
fig, ax = plt.subplots(figsize=(11, 5.6)); ax.axis('off')
ancho = len(hojas); prof = arbol.get_depth()
pos_hoja = iter(range(ancho))


def dibujar(n, nivel_y):
    if n['hoja']:
        x = next(pos_hoja)
        ax.add_patch(matplotlib.patches.FancyBboxPatch((x - 0.42, -prof - 0.42), 0.84, 0.84, boxstyle='round,pad=0.02', facecolor='white', edgecolor=COLOR_NIVEL[n['nivel']], linewidth=2.5))
        ax.text(x, -prof + 0.18, 'NUEVO\n(sin obras)' if n['nivel'] == 'Nuevo' else f"Confianza\n{n['nivel'].upper()}", ha='center', va='center', fontsize=9.5, fontweight='bold', color=TINTA)
        ax.text(x, -prof - 0.2, f"{n['probabilidad']:.0%} sin problemas\n{n['obras']} obras", ha='center', va='center', fontsize=8, color=TINTA2)
        return x
    xs = dibujar(n['si'], nivel_y - 1); xn = dibujar(n['no'], nivel_y - 1)
    x = (xs + xn) / 2
    for hijo_x, hijo, etiqueta in [(xs, n['si'], 'Sí'), (xn, n['no'], 'No')]:
        hijo_y = -prof if hijo['hoja'] else nivel_y - 1
        ax.plot([x, hijo_x], [nivel_y - 0.32, hijo_y + 0.42], color=TENUE, linewidth=1.2, zorder=0)
        ax.text((x + hijo_x) / 2 + (-0.12 if etiqueta == 'Sí' else 0.12), (nivel_y - 0.32 + hijo_y + 0.42) / 2, etiqueta, ha='center', fontsize=9, color=TINTA2, fontweight='bold', bbox=dict(facecolor=FONDO, edgecolor='none', pad=1))
    ax.add_patch(matplotlib.patches.FancyBboxPatch((x - 0.62, nivel_y - 0.32), 1.24, 0.64, boxstyle='round,pad=0.02', facecolor='#eef4fd', edgecolor=AZUL, linewidth=1.5))
    ax.text(x, nivel_y, texto_pregunta(n), ha='center', va='center', fontsize=9, color=TINTA)
    return x


dibujar(MODELO, 0)
ax.set_xlim(-0.7, ancho - 0.3); ax.set_ylim(-prof - 0.6, 0.5)
ax.set_title('Árbol de decisión: nivel de confianza de un trabajador para una obra', loc='left')
guardar(fig, 'g3_arbol')

# =================================================================================================== 2) ZONAS (WARD)
z = zonas(d)
COLS = [f'presion_{g}' for g in GRUPOS]
Z = (z[COLS] - z[COLS].mean()) / z[COLS].std(ddof=0)  # ESTANDARIZAR: CADA GRUPO PESA IGUAL
enlaces = linkage(Z.values, method='ward')
siluetas = {k: round(float(silhouette_score(Z.values, fcluster(enlaces, k, 'maxclust'))), 3) for k in range(2, 7)}
K = 4
z['grupo'] = fcluster(enlaces, K, 'maxclust')


def nombre_grupo(fila_media):
    faltan = [g for g in GRUPOS if fila_media[f'presion_{g}'] >= 2.5]
    if not faltan:
        return 'Oferta suficiente'
    return 'Faltan: ' + ', '.join(g.lower() for g in sorted(faltan, key=lambda g: -fila_media[f'presion_{g}']))


medias = z.groupby('grupo')[COLS].mean()
# EL GRUPO CON MÁS PRESIÓN TOTAL SE NUMERA PRIMERO (PARA QUE LOS COLORES SIGAN SIEMPRE EL MISMO ORDEN)
orden_g = medias.sum(axis=1).sort_values(ascending=False).index.tolist()
renum = {g: i + 1 for i, g in enumerate(orden_g)}
z['grupo'] = z['grupo'].map(renum); medias.index = medias.index.map(renum); medias = medias.sort_index()
NOMBRE_G = {g: nombre_grupo(medias.loc[g]) for g in medias.index}

etiquetas = [zz.split(',')[0] for zz in z['zona']]
fig, ax = plt.subplots(figsize=(10, 4.8))
color_de = {i: CATEGORICOS[z['grupo'][i] - 1] for i in range(len(z))}
dn = dendrogram(enlaces, labels=etiquetas, ax=ax, color_threshold=0, above_threshold_color=TENUE, leaf_rotation=90, leaf_font_size=9.5)
# EL GRUPO SE MARCA CON UN PUNTO DE COLOR AL PIE DE CADA MUNICIPIO (EL TEXTO SE QUEDA EN TINTA NORMAL)
for x, lbl in zip(ax.get_xticks(), ax.get_xmajorticklabels()):
    i = etiquetas.index(lbl.get_text()); lbl.set_color(TINTA)
    ax.scatter(x, 0, s=90, color=CATEGORICOS[z['grupo'][i] - 1], edgecolor=FONDO, linewidth=2, zorder=5, clip_on=False)
corte = (enlaces[-K, 2] + enlaces[-K + 1, 2]) / 2
ax.axhline(corte, color=TINTA2, linestyle='--', linewidth=1)
ax.text(ax.get_xlim()[1], corte, f'  corte en {K} grupos', va='center', color=TINTA2, fontsize=9)
ax.set_ylabel('Distancia de Ward (qué tan diferentes son)'); ax.yaxis.grid(True, color=REJILLA)
ax.set_title('Dendrograma: municipios agrupados por la presión de demanda de cada grupo de oficios', loc='left')
manejadores = [matplotlib.lines.Line2D([], [], marker='o', linestyle='', markersize=9, color=CATEGORICOS[g - 1], label=f'Grupo {g}: {NOMBRE_G[g]}') for g in medias.index]
ax.legend(handles=manejadores, loc='upper center', bbox_to_anchor=(0.5, -0.42), ncol=2, frameon=False, fontsize=9)
guardar(fig, 'g7_dendrograma')

orden_z = z.sort_values(['grupo', 'vacantes'], ascending=[True, False])
fig, ax = plt.subplots(figsize=(8.2, 0.42 * len(orden_z) + 1.4))
vals = orden_z[COLS].values
im = ax.imshow(vals, cmap=matplotlib.colors.LinearSegmentedColormap.from_list('azul', SECUENCIAL), aspect='auto', vmin=0, vmax=max(6, vals.max()))
for i in range(vals.shape[0]):
    for j in range(vals.shape[1]):
        ax.text(j, i, f'{vals[i, j]:.1f}', ha='center', va='center', fontsize=8.5, color='white' if vals[i, j] > 3.5 else TINTA)
ax.set_xticks(range(len(GRUPOS)), list(GRUPOS)); ax.xaxis.tick_top()
ax.set_yticks(range(len(orden_z)), [f"{zz.split(',')[0]}  (G{g})" for zz, g in zip(orden_z['zona'], orden_z['grupo'])])
for lbl, g in zip(ax.get_yticklabels(), orden_z['grupo']):
    lbl.set_color(TINTA)
    lbl.set_bbox(dict(facecolor='white', edgecolor=CATEGORICOS[g - 1], linewidth=1.4, boxstyle='round,pad=0.2'))
ax.spines[:].set_visible(False); ax.tick_params(length=0)
cb = fig.colorbar(im, ax=ax, fraction=0.04, pad=0.02); cb.set_label('Vacantes por cada trabajador'); cb.outline.set_visible(False)
ax.set_title('Presión de demanda por municipio y grupo de oficios (G = grupo)', loc='left', pad=28)
guardar(fig, 'g8_presion_zonas')

# =================================================================================================== RESULTADOS
resumen = {
    'contratos': int(len(c)), 'sin_problemas': int(y.sum()), 'pct_sin_problemas': round(float(y.mean()), 3),
    'contratos_prueba': int(c['es_prueba'].sum()),
    'por_cumplimiento': {str(k).replace('\n', ' '): [round(float(m), 3), int(n)] for k, (m, n) in por_cumpl.iterrows()},
    'por_distancia': {str(k): [round(float(m), 3), int(n)] for k, (m, n) in por_dist.iterrows()},
    'parametros': {k: (str(v) if isinstance(v, list) else v) for k, v in PARAMS.items()}, 'evaluacion_prueba': eval_prueba, 'validacion_cruzada': eval_cv,
    'por_nivel_cv': por_nivel, 'importancia': {k: float(v) for k, v in importancia.items()}, 'arbol': MODELO,
    'zonas': {'n': int(len(z)), 'siluetas': siluetas, 'k': K, 'nombres': NOMBRE_G,
              'medias': {int(g): {c_.replace('presion_', ''): round(float(v), 2) for c_, v in fila.items()} for g, fila in medias.iterrows()},
              'tabla': z[['zona', 'grupo', 'vacantes', 'trabajadores'] + COLS].to_dict('records')},
}
json.dump(resumen, open(AQUI / 'resultados.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))

# EL ÁRBOL PARA LA APP Y EL SERVIDOR (src/lib/modelo-confianza.ts): SOLO DATOS; LO RECORRE src/lib/arbol-confianza.ts
# (EL SERVIDOR CADA DÍA A LAS 9 AM, Y LA APP SI EL PERFIL AÚN NO TRAE EL RESULTADO)
ts = f"""// ARCHIVO GENERADO POR scripts/analisis/analisis.py — NO EDITAR A MANO (VUELVE A CORRER EL ANÁLISIS).
// ÁRBOL DE DECISIÓN ENTRENADO CON {len(c)} OBRAS TERMINADAS ({int(y.sum())} SIN PROBLEMAS). VALIDACIÓN CRUZADA:
// EXACTITUD BALANCEADA {eval_cv['exactitud_balanceada']:.0%}; OBRAS QUE MARCA COMO CONFIABLES: {eval_cv['exito_si_predice_confiable']:.0%} SIN PROBLEMAS,
// COMO RIESGO: {eval_cv['exito_si_predice_riesgo']:.0%}. VARIABLES: {', '.join(VARIABLES)}.
// 'si' = LA VARIABLE ES MENOR O IGUAL AL UMBRAL. cumplimiento_previo = -1 CUANDO NO TIENE OBRAS EN LA APP.
export type NodoConfianza =
  | {{ hoja: true; probabilidad: number; nivel: 'Alta' | 'Media' | 'Baja' | 'Nuevo'; obras: number }}
  | {{ hoja: false; variable: 'cumplimiento_previo' | 'calificacion_previa' | 'obras_previas' | 'distancia_km'; umbral: number; si: NodoConfianza; no: NodoConfianza }};

export const ARBOL_CONFIANZA: NodoConfianza = {json.dumps(MODELO, ensure_ascii=False, indent=2)};

export const ENTRENADO = {{ obras: {len(c)}, fecha: '{pd.Timestamp.now().date()}', exactitud_balanceada: {eval_cv['exactitud_balanceada']} }};
"""
# EN LA COMPUTADORA SE ESCRIBE DIRECTO EN LA APP; EN GOOGLE COLAB (NO ESTÁ LA CARPETA DE LA APP) SE DEJA AQUÍ PARA DESCARGARLO
destino = AQUI.parent.parent / 'src' / 'lib'
destino = destino if destino.is_dir() else AQUI
(destino / 'modelo-confianza.ts').write_text(ts, encoding='utf-8')
print('Árbol guardado en', destino / 'modelo-confianza.ts')

print(json.dumps({k: resumen[k] for k in ['contratos', 'pct_sin_problemas', 'por_cumplimiento', 'por_distancia', 'evaluacion_prueba', 'validacion_cruzada', 'por_nivel_cv', 'importancia']}, ensure_ascii=False, indent=1, default=str))
print('ARBOL', json.dumps(MODELO, ensure_ascii=False))
print('ZONAS', siluetas, NOMBRE_G)
print(z[['zona', 'grupo', 'vacantes', 'trabajadores'] + COLS].sort_values('grupo').to_string())
