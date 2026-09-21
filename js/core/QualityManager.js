/**
 * Niveles de calidad gráfica. El antialiasing MSAA sobre el render target de
 * coma flotante es, con diferencia, lo más costoso, seguido de la resolución
 * y del postprocesado.
 */
export const QUALITY_LEVELS = {
    alta: { label: 'Alta', maxPixelRatio: 2, msaa: 4, bloom: true, cinematic: true, particles: 1, blur: true },
    media: { label: 'Media', maxPixelRatio: 1.25, msaa: 0, bloom: true, cinematic: false, particles: 0.6, blur: true },
    baja: { label: 'Baja', maxPixelRatio: 0.85, msaa: 0, bloom: false, cinematic: false, particles: 0.3, blur: false },
};

const ORDER = ['alta', 'media', 'baja'];
const MODES = ['auto', ...ORDER];

/**
 * Ajusta la calidad al equipo. En modo automático mide los fps en ventanas
 * de 2 segundos y baja un nivel si no se alcanzan 40 fps de forma sostenida.
 */
export class QualityManager {
    constructor(app) {
        this.app = app;
        this.mode = 'auto';
        this.software = QualityManager.detectSoftwareRenderer(app.renderer);
        this.level = this.software ? 'baja' : 'alta';
        this.fps = 0;
        this.listeners = new Set();
        this.resetWindow(4);
    }

    /** ¿El navegador renderiza por CPU (sin aceleración por hardware)? */
    static detectSoftwareRenderer(renderer) {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(String(name));
    }

    get settings() {
        return QUALITY_LEVELS[this.level];
    }

    get label() {
        const level = this.settings.label;
        return this.mode === 'auto' ? `Auto · ${level}` : level;
    }

    /** Fija el modo (auto, alta, media o baja) sin aplicarlo todavía. */
    setMode(mode) {
        this.mode = MODES.includes(mode) ? mode : 'auto';
        this.level = this.mode === 'auto' ? (this.software ? 'baja' : 'alta') : this.mode;
    }

    /** Recorre auto → alta → media → baja → auto. */
    cycleMode() {
        this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]);
        this.apply();
    }

    apply() {
        this.app.applyQuality(this.settings);
        this.resetWindow(3);
        this.listeners.forEach((listener) => listener(this));
    }

    onChange(listener) {
        this.listeners.add(listener);
    }

    resetWindow(warmup = 0) {
        this.warmup = warmup;
        this.frames = 0;
        this.time = 0;
    }

    /** Se llama cada fotograma con el tiempo real transcurrido. */
    update(dt) {
        if (this.warmup > 0) {
            this.warmup -= dt;
            return;
        }
        if (document.hidden || dt > 0.25) return; // ignora pestañas ocultas y tirones puntuales
        this.frames++;
        this.time += dt;
        if (this.time < 2) return;

        this.fps = this.frames / this.time;
        this.resetWindow();
        const index = ORDER.indexOf(this.level);
        if (this.mode === 'auto' && this.fps < 40 && index < ORDER.length - 1) {
            this.level = ORDER[index + 1];
            this.apply();
        } else {
            this.listeners.forEach((listener) => listener(this));
        }
    }
}
