import { App } from './App.js';

const loader = document.getElementById('loader');
const progress = document.getElementById('loaderProgress');
const startButton = document.getElementById('startButton');
const errorBox = document.getElementById('loaderError');
const params = new URLSearchParams(location.search);

function showError(message) {
    startButton.hidden = true;
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
                // La compilación de shaders ocupa el último 10 % del anillo.
                progress.style.strokeDashoffset = String(100 - ratio * 90);
            },
            onLoad: async (errors) => {
                await app.prepare();
                progress.style.strokeDashoffset = '0';
                if (errors.length) console.warn('Texturas que no se pudieron cargar:', errors);
                startButton.disabled = false;
                startButton.removeAttribute('aria-busy');
                startButton.setAttribute('aria-label', 'Iniciar');
                loader.classList.add('ready');
                startButton.focus({ preventScroll: true });
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
