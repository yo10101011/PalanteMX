"""GENERA EL CUADERNO DE GOOGLE COLAB (PalanteMX_analisis.ipynb) Y SUS DATOS (datos_colab.json).

GOOGLE COLAB ES UN SERVICIO GRATUITO DE GOOGLE QUE EJECUTA PYTHON EN LA NUBE DESDE EL NAVEGADOR: ASÍ EL ENTRENAMIENTO
DEL ÁRBOL DE DECISIÓN Y EL AGRUPAMIENTO TAMBIÉN CORREN EN LA NUBE, SIN INSTALAR NADA.

EL CUADERNO LLEVA ADENTRO EL CÓDIGO ACTUAL DE datos_analisis.py Y analisis.py (VUELVE A CORRER ESTE PROGRAMA SI LOS
CAMBIAS). datos_colab.json ES datos.json SIN LOS NOMBRES DE USUARIO (EL ANÁLISIS NO LOS NECESITA).

USO:  python crear_colab.py      (DESPUÉS DE  node ../semilla/exportar-analisis.mjs datos.json)
"""
import json
from pathlib import Path

AQUI = Path(__file__).parent


def md(texto):
    return {'cell_type': 'markdown', 'metadata': {}, 'source': texto.strip().splitlines(keepends=True)}


def codigo(texto):
    return {'cell_type': 'code', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': texto.strip().splitlines(keepends=True)}


def escribir_archivo(nombre):
    return codigo(f'%%writefile {nombre}\n' + (AQUI / nombre).read_text(encoding='utf-8'))


celdas = [
    md("""
# PalanteMX: análisis de datos en la nube

Este cuaderno corre en **Google Colab**, es decir, en servidores de Google y no en una computadora personal.
Entrena los dos modelos de aprendizaje automático de PalanteMX:

1. **Árbol de decisión**: con lo que la app sabe de un trabajador antes de una obra (su cumplimiento en obras anteriores,
   su calificación, cuántas obras ha terminado y la distancia a la obra), aprende a predecir si la obra terminará sin problemas.
   Sirve para **recomendar perfiles confiables** y **reducir el riesgo de fraude**.
2. **Agrupamiento jerárquico (método de Ward)**: junta los municipios que se parecen en cuántas vacantes hay por cada
   trabajador de cada grupo de oficios. Sirve para **identificar las zonas con mayor necesidad de ciertos oficios**.

**Cómo usarlo:** ejecuta las celdas en orden con el botón ▶ de cada una (o *Entorno de ejecución → Ejecutar todas*).
"""),
    md("""
## Paso 1. Subir los datos

Al ejecutar la celda aparece el botón **Elegir archivos**: selecciona `datos_colab.json` (está en `scripts/analisis` del proyecto).
Son los datos exportados de Cloud Firestore: trabajadores, vacantes, contratos, reportes y reseñas, sin correos, teléfonos,
nombres de usuario ni fotografías.
"""),
    codigo("""
from google.colab import files
subidos = files.upload()
nombre = next(iter(subidos))
open('datos.json', 'wb').write(subidos[nombre])
print('Datos listos:', nombre, '-', round(len(subidos[nombre]) / 1024), 'KB')
"""),
    md("""
## Paso 2. Los dos programas del análisis

- `datos_analisis.py` **prepara los datos**: arma una tabla con una fila por contrato terminado (lo que se sabía del trabajador
  antes de empezar y si la obra salió bien) y otra con una fila por municipio (vacantes y trabajadores de cada grupo de oficios).
- `analisis.py` **entrena y evalúa los modelos** con scikit-learn y SciPy, dibuja las gráficas y genera el archivo
  `modelo-confianza.ts`, que es el árbol en el formato que usan la aplicación y el servidor.

Ejecuta las dos celdas: solo guardan los programas.
"""),
    escribir_archivo('datos_analisis.py'),
    escribir_archivo('analisis.py'),
    md("""
## Paso 3. Entrenar los modelos

Aquí ocurre el aprendizaje: `DecisionTreeClassifier(...).fit(X, y)` encuentra solo las preguntas del árbol, la validación
cruzada lo evalúa con obras que no vio, y `linkage(..., method='ward')` agrupa los municipios.
"""),
    codigo("""
import sklearn, scipy, pandas
print('scikit-learn', sklearn.__version__, '| SciPy', scipy.__version__, '| pandas', pandas.__version__)
!python analisis.py
"""),
    md("""
## Paso 4. Ver las gráficas
"""),
    codigo("""
from pathlib import Path
from IPython.display import Image, display
for figura in sorted(Path('figuras').glob('*.png')):
    print(figura.name)
    display(Image(filename=str(figura), width=750))
"""),
    md("""
## Paso 5. Descargar el modelo

`modelo-confianza.ts` se copia en `src/lib/` del proyecto. Después, al publicar el servidor (`npm run deploy`), el servidor
aplica el árbol nuevo a todos los trabajadores cada día a las 9:00 h.
"""),
    codigo("""
files.download('modelo-confianza.ts')
files.download('resultados.json')
"""),
]

cuaderno = {
    'cells': celdas,
    'metadata': {'colab': {'name': 'PalanteMX_analisis.ipynb', 'provenance': []},
                 'kernelspec': {'name': 'python3', 'display_name': 'Python 3'}, 'language_info': {'name': 'python'}},
    'nbformat': 4, 'nbformat_minor': 0,
}
(AQUI / 'PalanteMX_analisis.ipynb').write_text(json.dumps(cuaderno, ensure_ascii=False, indent=1), encoding='utf-8')

# LOS DATOS PARA COLAB: SIN NOMBRES DE USUARIO
datos = json.loads((AQUI / 'datos.json').read_text(encoding='utf-8'))
for coleccion in ('Usuarios', 'Contratistas'):
    for fila in datos.get(coleccion, []):
        fila.pop('nombre_usuario', None)
(AQUI / 'datos_colab.json').write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')
print('Listo: PalanteMX_analisis.ipynb y datos_colab.json')
