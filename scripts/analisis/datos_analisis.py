"""ARMA LAS DOS TABLAS DEL ANÁLISIS A PARTIR DE LO QUE SE EXPORTÓ DE FIRESTORE (datos.json).

1) contratos(): UNA FILA POR CONTRATO YA TERMINADO, CON LO QUE LA APP SABÍA DEL TRABAJADOR **ANTES** DE EMPEZAR
   (CALIFICACIÓN, NÚMERO DE RESEÑAS, OBRAS TERMINADAS) Y LA DISTANCIA A LA OBRA, Y SI LA OBRA SALIÓ SIN PROBLEMAS.
2) zonas(): UNA FILA POR MUNICIPIO CON LA DEMANDA (VACANTES) Y LA OFERTA (TRABAJADORES) DE CADA GRUPO DE OFICIOS.
"""
import json, math
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).parent

# LOS OFICIOS SE JUNTAN EN 4 GRUPOS PARA QUE CADA MUNICIPIO TENGA SUFICIENTES DATOS
GRUPOS = {
    'Obra negra': ['Albañil', 'Ayudante general'],
    'Instalaciones': ['Electricista', 'Plomero', 'Técnico en refrigeración y aire acondicionado'],
    'Acabados': ['Pintor', 'Azulejero', 'Yesero', 'Tablaroquero', 'Impermeabilizador'],
    'Carpintería y herrería': ['Carpintero', 'Herrero', 'Jardinero'],
}
GRUPO_DE = {o: g for g, lista in GRUPOS.items() for o in lista}


def cargar(archivo=AQUI / 'datos.json'):
    return json.load(open(archivo, encoding='utf-8'))


def km(a, b):
    if not a or not b or a.get('latitud') is None or b.get('latitud') is None:
        return float('nan')
    r = math.radians
    h = math.sin(r(b['latitud'] - a['latitud']) / 2) ** 2 + math.cos(r(a['latitud'])) * math.cos(r(b['latitud'])) * math.sin(r(b['longitud'] - a['longitud']) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def tuvo_problemas(k, quejas):
    """UN CONTRATO TUVO PROBLEMAS **POR PARTE DEL TRABAJADOR** SI: QUEDÓ CON FALTAS AL CERRAR, LE LEVANTARON UN REPORTE
    A ÉL, O ÉL CANCELÓ TARDE. (ES LA MISMA REGLA QUE USA EL SERVIDOR PARA CALCULAR EL "CUMPLIMIENTO" DEL PERFIL)."""
    tid = k['id_trabajador']
    return (bool(k.get('revision_cierre'))
            or any(q.get('id_acusado') == tid for q in quejas)
            or (k.get('cancelado_por') == tid and bool(k.get('cancelacion_tardia'))))


def contratos(d):
    trabajadores = {u['id']: u for u in d['Usuarios']}
    quejas_por_contrato = {}
    for q in d['Quejas_Soporte']:
        if q.get('id_contrato'):
            quejas_por_contrato.setdefault(q['id_contrato'], []).append(q)
    resenas = [r for r in d['Resenas_Plataforma'] if r.get('evaluado_rol') == 'Trabajador']

    terminados = []
    for k in d['Postulaciones']:
        estado = k.get('estado')
        # SOLO CONTRATOS QUE YA EMPEZARON Y TERMINARON (LAS CANCELADAS A TIEMPO, ANTES DE EMPEZAR, NO CUENTAN)
        if estado == 'Finalizada' and k.get('timestamp_inicio') and k.get('timestamp_fin'):
            fin = k['timestamp_fin']
        elif estado == 'Cancelada' and k.get('cancelacion_tardia') and k.get('timestamp_inicio'):
            fin = k.get('timestamp_cancelacion') or k['timestamp_inicio']
        else:
            continue
        terminados.append({**k, '_fin': fin, '_problemas': tuvo_problemas(k, quejas_por_contrato.get(k['id'], []))})

    filas = []
    for k in terminados:
        t0, tid = k['timestamp_inicio'], k['id_trabajador']
        previos = [x for x in terminados if x['id_trabajador'] == tid and x['_fin'] < t0]
        estrellas = [r['estrellas'] for r in resenas if r['evaluado_id'] == tid and r.get('timestamp', 0) < t0]
        t = trabajadores.get(tid, {})
        filas.append({
            'id': k['id'],
            'oficio': k.get('oficio_trabajador') or (k.get('vacante') or {}).get('oficio'),
            'calificacion_previa': round(sum(estrellas) / len(estrellas), 2) if estrellas else 0.0,
            'resenas_previas': len(estrellas),
            'obras_previas': sum(1 for x in previos if x['estado'] == 'Finalizada'),
            # CUMPLIMIENTO = DE SUS OBRAS ANTERIORES EN LA APP, QUÉ PORCENTAJE TERMINÓ SIN FALTAS, REPORTES NI ABANDONO
            # (-1 = TODAVÍA NO TIENE OBRAS EN LA APP)
            'cumplimiento_previo': round(100 * sum(1 for x in previos if not x['_problemas']) / len(previos)) if previos else -1,
            'distancia_km': round(km(t.get('ubicacion'), (k.get('vacante') or {}).get('coordenadas')), 1),
            'sin_problemas': int(not k['_problemas']),
            'es_prueba': bool(k.get('es_prueba')),
            'fecha': datetime.fromtimestamp(t0 / 1000, tz=timezone.utc).date().isoformat(),
        })
    return pd.DataFrame(filas).dropna(subset=['distancia_km'])


def zonas(d, minimo_vacantes=4):
    filas = {}
    def fila(municipio, estado):
        clave = f'{municipio}, {estado}'
        return filas.setdefault(clave, {'zona': clave, **{f'demanda_{g}': 0 for g in GRUPOS}, **{f'oferta_{g}': 0 for g in GRUPOS}})
    for v in d['Vacantes']:
        g = GRUPO_DE.get(v.get('categoria'))
        if not g or not v.get('ubicacion') or ', ' not in v['ubicacion']:
            continue
        municipio, estado = v['ubicacion'].split(', ', 1)
        fila(municipio, estado)[f'demanda_{g}'] += 1
    for u in d['Usuarios']:
        g = GRUPO_DE.get(u.get('oficio_principal'))
        if not g or not u.get('ubicacion_texto') or u.get('estado_cuenta') == 'Bloqueada':
            continue
        fila(u['ubicacion_texto'], u.get('ubicacion_estado', ''))[f'oferta_{g}'] += 1
    tabla = pd.DataFrame(filas.values())
    tabla['vacantes'] = tabla[[f'demanda_{g}' for g in GRUPOS]].sum(axis=1)
    tabla['trabajadores'] = tabla[[f'oferta_{g}' for g in GRUPOS]].sum(axis=1)
    # PRESIÓN = VACANTES POR CADA TRABAJADOR DEL GRUPO (EL +1 EVITA DIVIDIR ENTRE CERO)
    for g in GRUPOS:
        tabla[f'presion_{g}'] = (tabla[f'demanda_{g}'] / (tabla[f'oferta_{g}'] + 1)).round(2)
    return tabla[tabla['vacantes'] >= minimo_vacantes].reset_index(drop=True)


if __name__ == '__main__':
    d = cargar()
    c = contratos(d)
    print(c.describe(include='all').T[['count', 'mean', 'min', 'max']])
    print('sin problemas:', c['sin_problemas'].mean().round(3), 'de', len(c))
    print(zonas(d).to_string())
