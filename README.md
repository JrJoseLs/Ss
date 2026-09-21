# Sistema Solar 3D

Simulación interactiva del sistema solar hecha con [Three.js](https://threejs.org), sin compilación ni dependencias locales.

- **Posiciones reales.** Cada planeta sigue su órbita kepleriana calculada con los elementos orbitales del JPL. La fecha que se muestra es la fecha simulada: la fase de la Luna, el día y la noche de la Tierra y la posición del cometa Encke corresponden a ese momento.
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
| Viajar a un astro | clic en él, en su etiqueta o en la barra inferior | `0`–`8`, `9` Luna, `C` cometa |
| Pausar el tiempo | botón ⏯ | `Espacio` |
| Cambiar la velocidad del tiempo | ⏪ ⏩ | `,` `.` |
| Volver a la fecha actual | «Ahora» | `N` |
| Órbitas / etiquetas / resplandor | barra superior | `O` / `L` / `B` |
| Calidad gráfica | barra superior | `Q` |
| Vista general | barra superior | `Esc` |

## Arquitectura (POO)

```
js/
├── main.js                  Arranque, pantalla de carga
├── App.js                   Renderizador, cámara, postprocesado y bucle principal
├── SolarSystem.js           Modelo: crea y actualiza todos los astros
├── config.js                Escalas y pasos de tiempo
├── data/solarSystemData.js  Datos astronómicos y textos
├── core/
│   ├── OrbitalElements.js   Mecánica kepleriana (ecuación de Kepler)
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

`CelestialBody` define la interfaz común: `update(ctx)`, `getLiveStats()`, `viewDistance`, la etiqueta y la selección. Cada subclase la especializa (**polimorfismo**). Por ejemplo, `Earth` hereda de `Planet` y sobrescribe `createSurfaceMaterial()` y `rotationAngle()` para girar según el tiempo sidéreo real.

### Escala

El sistema solar real no cabe en una pantalla: Neptuno está 30 veces más lejos que la Tierra. Por eso las distancias se comprimen con `d = 55 · r^0.62` y los radios con `R = 1.2 · (r/r⊕)^0.55`. Se conservan el orden, la forma de las órbitas y las proporciones relativas.

## Créditos

- Texturas planetarias y de la Vía Láctea: [Solar System Scope](https://www.solarsystemscope.com/textures/), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), basadas en datos de la NASA.
- Mapas normal y especular de la Tierra: ejemplos de [three.js](https://github.com/mrdoob/three.js) (MIT).
- Elementos orbitales: E. M. Standish, *Keplerian Elements for Approximate Positions of the Major Planets* (JPL/NASA).
- Ruido simplex GLSL: Ashima Arts / Stefan Gustavson (MIT).
