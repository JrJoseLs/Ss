import { App } from './App.js';

const loader = document.getElementById('loader');
const progress = document.getElementById('loaderProgress');
const status = document.getElementById('loaderStatus');
const startButton = document.getElementById('startButton');
const errorBox = document.getElementById('loaderError');
const params = new URLSearchParams(location.search);

function showError(message) {
    status.hidden = true;
    errorBox.hidden = false;
    errorBox.textContent = message;
}

function supportsWebGL2() {
    try {
        return !!document.createElement('canvas').getContext('webgl2');
    } catch {
        return false;
    }
}

if (!supportsWebGL2()) {
    showError('Tu navegador o tu tarjeta gráfica no admiten WebGL 2. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.');
} else {
    try {
        const app = new App(document.getElementById('scene'));
        window.solarSystem = app; // útil para depurar desde la consola

        app.assets.track({
            onProgress: (ratio) => {
                const pct = Math.round(ratio * 100);
                progress.style.width = `${pct}%`;
                status.textContent = `Cargando texturas… ${pct}%`;
            },
            onLoad: async (errors) => {
                progress.style.width = '100%';
                status.textContent = 'Preparando shaders…';
                await app.prepare();
                status.textContent = errors.length
                    ? `Listo (no se pudieron cargar ${errors.length} texturas)`
                    : 'Todo listo';
                startButton.hidden = false;
                startButton.focus();
                if (params.has('autostart')) startButton.click();
            },
        });

        startButton.addEventListener('click', () => {
            loader.classList.add('done');
            // Enlace directo a un astro: index.html#saturno
            app.begin(decodeURIComponent(location.hash.slice(1)));
            setTimeout(() => loader.remove(), 1400);
        }, { once: true });

        app.start();
    } catch (error) {
        console.error(error);
        showError(`No se pudo iniciar la simulación: ${error.message}`);
    }
}
