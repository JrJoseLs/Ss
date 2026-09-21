# Sistema Solar 3D

Simulación interactiva del sistema solar hecha con [Three.js](https://threejs.org), sin compilación ni dependencias locales.

- **Posiciones reales, verificadas.** Los planetas y Plutón siguen órbitas keplerianas con los elementos orbitales del JPL y sus variaciones seculares. La Luna usa una teoría con sus principales perturbaciones, y las demás lunas parten de vectores de estado reales. Las pruebas automáticas comparan todo con las efemérides de la NASA (JPL Horizons).
- **Ejes reales.** Cada planeta apunta su polo según la IAU, así que las estaciones son correctas: el solsticio terrestre, el equinoccio de Marte o el de Saturno, con sus anillos de canto, ocurren en la fecha real.
- **Viaje en el tiempo.** Al pulsar la fecha se puede saltar a cualquier momento o a eventos como oposiciones, solsticios, la próxima luna llena o el perihelio de un cometa.
- **Texturas reales** basadas en datos de la NASA. La Tierra tiene luces nocturnas, nubes con sombra, reflejos del Sol en los océanos y atmósfera.
- **Shaders propios:** superficie solar animada con corona, oscurecimiento del limbo en los gigantes gaseosos, sombras entre Saturno y sus anillos, halos atmosféricos y colas de cometa hechas con partículas.
- **Tiempo controlable:** desde tiempo real hasta 1 año por segundo, también hacia atrás.
- **Cinematografía:** vuelos de cámara en arco, seguimiento del astro seleccionado, bloom adaptativo, destellos de lente, viñeta y grano.

## Ejecutar en local

Los módulos ES no funcionan si se abre `index.html` con doble clic. Hay que servir la carpeta con un servidor web:

```bash
python -m http.server 8000
# y abrir http://localhost:8000
```

También se puede usar la extensión *Live Server* de VS Code. Cada push a `main` publica el sitio en GitHub Pages ([.github/workflows/static.yml](.github/workflows/static.yml)).

Enlaces directos: `index.html#saturno` abre la simulación centrada en Saturno. `?autostart` omite la pantalla de inicio.

## Pruebas

```bash
npm install   # solo instala three.js para Node
npm test
```

Las pruebas ([tests/](tests/)) validan la mecánica orbital contra JPL Horizons ([tests/fixtures/horizons.json](tests/fixtures/horizons.json)) y la coherencia del modelo: que las inclinaciones axiales cuadren con los polos IAU, las fechas de solsticios, equinoccios y oposiciones, el reloj de simulación, etc. También se ejecutan en GitHub Actions en cada push ([.github/workflows/tests.yml](.github/workflows/tests.yml)).

| Qué se valida | Referencia | Tolerancia |
|---|---|---|
| Posición de los planetas (2000, 2026, 2045) | JPL Horizons | 0.1°–0.5° |
| Dirección de la Luna | JPL Horizons | 0.5° |
| Lunas de Júpiter, Saturno, Neptuno, Marte y Plutón | JPL Horizons | 8° a los dos meses |
| Solsticio 2026, equinoccio de Saturno 2025, equinoccio de Marte 2024 | fechas publicadas | < 0.5° |

## Interfaz

- **Escritorio:** barra de herramientas arriba, ficha del astro a la derecha (plegable) y controles de tiempo y selector de astros abajo. Al abrir o plegar la ficha, el encuadre se desplaza para que el astro quede centrado en el espacio libre.
- **Móvil:** la barra superior solo muestra la fecha, *Trayectorias*, *Ocultar* y un menú `⋯` con el resto. La ficha es una hoja inferior que empieza plegada (nombre y un dato en vivo) y se despliega al tocarla. Las etiquetas de las lunas solo aparecen al visitar su planeta.
- **Modo sin interfaz:** oculta todo menos el modelo 3D.
- Las preferencias (trayectorias, etiquetas, resplandor y calidad) se recuerdan entre visitas. Con *reducir movimiento* activado en el sistema, los vuelos de cámara son más cortos y sin animaciones decorativas.

## Rendimiento

La simulación ajusta la calidad automáticamente. En modo **Auto** mide los fps y, si baja de 40, pasa a un nivel inferior. El botón de calidad de la barra superior (o la tecla `Q`) muestra los fps en vivo y permite fijar un nivel:

| Nivel | Resolución | Antialiasing | Resplandor y efectos | Partículas |
|---|---|---|---|---|
| Alta | hasta 2× | MSAA 4× | sí | 100 % |
| Media | hasta 1.25× | — | resplandor | 60 % |
| Baja | 0.85× | — | — | 30 % |

**Si va lento en un PC con tarjeta gráfica,** lo más probable es que el navegador no la esté usando. Activa *Configuración › Sistema › Usar aceleración gráfica* en Chrome o Edge y reinicia el navegador. Puedes comprobarlo en `chrome://gpu`. Si la simulación detecta renderizado por software, muestra un aviso y usa la calidad baja.

Las texturas están en WebP (unos 5 MB en total) y se suben a la GPU durante la pantalla de carga, así que no hay tirones la primera vez que se visita un planeta.

## Controles

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Orbitar / acercar / desplazar | arrastrar / rueda / clic derecho | — |
| Viajar a un astro | clic en él, en su etiqueta o en la barra inferior | `0`–`8`, `9` Luna, `P` Plutón, `C` cometa |
| Viajar a una fecha o evento | clic en la fecha | `D` |
| Pausar el tiempo | botón ⏯ | `Espacio` |
| Cambiar la velocidad del tiempo | ⏪ ⏩ | `,` `.` |
| Volver a la fecha actual | «Ahora» | `N` |
| Trayectorias / etiquetas / resplandor | barra superior (en móvil, menú `⋯`) | `O` / `L` / `B` |
| Ocultar la interfaz (solo el modelo) | botón «Ocultar»; tocar el vacío para volver | `I` |
| Plegar la ficha de información | tocar su cabecera | — |
| Calidad gráfica | barra superior | `Q` |
| Vista general | barra superior | `Esc` |

## Arquitectura (POO)

```
js/
├── main.js                  Arranque, pantalla de carga
├── App.js                   Renderizador, cámara, postprocesado y bucle principal
├── SolarSystem.js           Modelo: crea y actualiza todos los astros
├── config.js                Escalas y pasos de tiempo
├── data/
│   ├── solarSystemData.js   Datos astronómicos y textos
│   ├── satelliteStates.js   Vectores de estado de las lunas (JPL Horizons)
│   └── events.js            Eventos para viajar en el tiempo
├── core/
│   ├── OrbitalElements.js   Mecánica kepleriana (ecuación de Kepler, variaciones seculares)
│   ├── LunarEphemeris.js    Posición de la Luna con sus perturbaciones
│   ├── SatelliteOrbit.js    Órbita de una luna a partir de un vector de estado
│   ├── Frames.js            Cambios de sistema de referencia y polos IAU
│   ├── SimulationClock.js   Fecha simulada y velocidad del tiempo
│   ├── CameraDirector.js    Vuelos y seguimiento de cámara
│   ├── QualityManager.js    Calidad gráfica adaptativa
│   └── AssetLoader.js       Carga de texturas con progreso
├── bodies/                  Jerarquía de clases de astros
│   ├── CelestialBody.js     Clase base abstracta
│   ├── Sun.js               extends CelestialBody
│   ├── Planet.js            extends CelestialBody  (y Earth extends Planet)
│   ├── Moon.js              extends CelestialBody
│   └── Comet.js             extends CelestialBody
├── materials/PlanetMaterials.js  Materiales GLSL (planeta, Tierra, nubes, atmósfera, anillos)
├── effects/                 Fondo estelar, cinturones de asteroides, destello de lente
├── shaders/chunks.js        Código GLSL reutilizable
└── ui/UserInterface.js      Panel de información, barra de tiempo, atajos
```

`CelestialBody` es una clase **abstracta**: no se puede instanciar directamente. Define la interfaz común: `update(ctx)`, `getLiveStats()`, `viewDistance`, la etiqueta y la selección. Cada subclase la especializa (**polimorfismo**).

Los planetas se crean con la fábrica `Planet.create(data, assets)`. El constructor solo inicializa el estado y `build()` crea las mallas (patrón **Template Method**). `Earth` sobrescribe `build()`, `createSurfaceMaterial()` y `rotationAngle()` para añadir nubes y girar según el tiempo sidéreo real. Como `build()` se llama cuando el objeto ya está construido del todo, la subclase nunca trabaja a medio inicializar, que es lo que ocurre si un constructor llama a métodos sobrescritos.

### Escala

El sistema solar real no cabe en una pantalla: Neptuno está 30 veces más lejos que la Tierra. Por eso las distancias se comprimen con `d = 55 · r^0.62` y los radios con `R = 1.2 · (r/r⊕)^0.55`. Se conservan el orden, la forma de las órbitas y las proporciones relativas.

## Créditos

- Texturas planetarias y de la Vía Láctea: [Solar System Scope](https://www.solarsystemscope.com/textures/), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), basadas en datos de la NASA.
- Mapas normal y especular de la Tierra: ejemplos de [three.js](https://github.com/mrdoob/three.js) (MIT).
- Plutón y Caronte: mapas de New Horizons, NASA / JHUAPL / SwRI (dominio público). El hemisferio sur, que nunca se fotografió, está rellenado con un tono neutro.
- Polos de rotación: IAU Working Group on Cartographic Coordinates and Rotational Elements. Efemérides de referencia: [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/).
- Elementos orbitales: E. M. Standish, *Keplerian Elements for Approximate Positions of the Major Planets* (JPL/NASA). Posición de la Luna: fórmula de baja precisión del *Astronomical Almanac*.
- Ruido simplex GLSL: Ashima Arts / Stefan Gustavson (MIT).
