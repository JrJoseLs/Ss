import { TIME_STEPS, DEFAULT_TIME_STEP } from '../config.js';

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DAY_MS = 86400000;

/**
 * Reloj de la simulación: lleva la fecha simulada y la velocidad a la que
 * avanza respecto al tiempo real.
 */
export class SimulationClock {
    constructor() {
        this.timeMs = Date.now();
        this.stepIndex = DEFAULT_TIME_STEP;
        this.direction = 1;
        this.paused = false;
        this.deltaDays = 0;
        this.listeners = new Set();
    }

    /** Días transcurridos desde la época J2000.0. */
    get days() {
        return (this.timeMs - J2000_MS) / DAY_MS;
    }

    get date() {
        return new Date(this.timeMs);
    }

    /** Segundos simulados por segundo real, con signo. */
    get rate() {
        return this.paused ? 0 : TIME_STEPS[this.stepIndex].value * this.direction;
    }

    get label() {
        const base = TIME_STEPS[this.stepIndex].label;
        return this.direction < 0 ? `−${base}` : base;
    }

    update(realDeltaSeconds) {
        const deltaMs = this.rate * realDeltaSeconds * 1000;
        this.timeMs += deltaMs;
        this.deltaDays = deltaMs / DAY_MS;
    }

    /** Acelera; si el tiempo va hacia atrás, primero lo frena. */
    faster() {
        if (this.direction < 0) {
            if (this.stepIndex === 0) this.direction = 1;
            else this.stepIndex--;
        } else {
            this.stepIndex = Math.min(this.stepIndex + 1, TIME_STEPS.length - 1);
        }
        this.paused = false;
        this.emit();
    }

    /** Frena; por debajo del tiempo real invierte el sentido. */
    slower() {
        if (this.direction > 0) {
            if (this.stepIndex === 0) this.direction = -1;
            else this.stepIndex--;
        } else {
            this.stepIndex = Math.min(this.stepIndex + 1, TIME_STEPS.length - 1);
        }
        this.paused = false;
        this.emit();
    }

    togglePause() {
        this.paused = !this.paused;
        this.emit();
    }

    resetToNow() {
        this.timeMs = Date.now();
        this.emit();
    }

    /** Salta a una fecha concreta (ms desde 1970). */
    setDate(ms) {
        if (!Number.isFinite(ms)) return;
        this.timeMs = ms;
        this.emit();
    }

    onChange(listener) {
        this.listeners.add(listener);
    }

    emit() {
        this.listeners.forEach((listener) => listener(this));
    }
}
