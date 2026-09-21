import * as THREE from 'three';
import { auToScene } from '../config.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const JD_J2000 = 2451545.0;

/**
 * Órbita kepleriana definida por sus seis elementos clásicos.
 * Calcula posiciones heliocéntricas reales (en UA) y su equivalente en la
 * escena. El plano de referencia es la eclíptica J2000: X apunta al punto
 * Aries y el eje Y de three.js es el polo norte de la eclíptica.
 *
 * Admite dos formas de fijar la posición en la órbita:
 *  - longitud media `L` y longitud del perihelio `varpi` en J2000 (planetas),
 *    opcionalmente con sus variaciones por siglo (`rates`, de Standish);
 *  - argumento del perihelio `omega` y fecha de paso por el perihelio (cometas).
 */
export class OrbitalElements {
    /**
     * @param {object} el  a, e, i, Omega y además (varpi y L) o (omega y perihelionJD)
     * @param {number} periodDays
     * @param {object} [rates]  variación de a, e, i, L, varpi y Omega por siglo juliano
     */
    constructor(el, periodDays, rates = null) {
        this.base = el;
        this.rates = rates;
        this.periodDays = periodDays;
        this.n = TAU / periodDays; // movimiento medio (rad/día)
        this.usesMeanLongitude = el.L !== undefined;
        this.epochDay = this.usesMeanLongitude ? 0 : el.perihelionJD - JD_J2000;
        this.appliedT = null;
        this.applyCentury(0);
    }

    /** Recalcula los elementos para T siglos julianos desde J2000. */
    applyCentury(T) {
        if (T === this.appliedT) return;
        this.appliedT = T;
        const el = this.base;
        const r = this.rates ?? {};
        const at = (key) => el[key] + (r[key] ?? 0) * T;

        this.a = at('a');
        this.e = at('e');
        const i = at('i') * DEG;
        const Omega = at('Omega') * DEG;
        let omega;
        if (this.usesMeanLongitude) {
            omega = (at('varpi') - at('Omega')) * DEG;
            this.meanAnomalyAtT = (at('L') - at('varpi')) * DEG;
        } else {
            omega = el.omega * DEG;
        }

        // Matriz de rotación del plano orbital a la eclíptica.
        const cO = Math.cos(Omega), sO = Math.sin(Omega);
        const cw = Math.cos(omega), sw = Math.sin(omega);
        const ci = Math.cos(i), si = Math.sin(i);
        this.P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
        this.Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
        this.b = this.a * Math.sqrt(1 - this.e * this.e);
    }

    /** Resuelve la ecuación de Kepler M = E − e·sen(E) por Newton-Raphson. */
    static eccentricAnomaly(M, e) {
        M = ((M % TAU) + TAU) % TAU;
        if (M > Math.PI) M -= TAU;
        let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
        for (let k = 0; k < 12; k++) {
            const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
            E -= dE;
            if (Math.abs(dE) < 1e-10) break;
        }
        return E;
    }

    /** Anomalía media (rad) para una fecha (días desde J2000). */
    meanAnomaly(days) {
        if (!this.usesMeanLongitude) return this.n * (days - this.epochDay);
        if (this.rates) {
            this.applyCentury(days / 36525);
            return this.meanAnomalyAtT;
        }
        return this.meanAnomalyAtT + this.n * days;
    }

    /** Posición heliocéntrica en UA (coordenadas three.js) para una anomalía excéntrica. */
    positionFromE(E, target = new THREE.Vector3()) {
        const xp = this.a * (Math.cos(E) - this.e);
        const yp = this.b * Math.sin(E);
        const x = this.P[0] * xp + this.Q[0] * yp;
        const y = this.P[1] * xp + this.Q[1] * yp;
        const z = this.P[2] * xp + this.Q[2] * yp;
        return target.set(x, z, -y);
    }

    /** Posición heliocéntrica en UA para una fecha (días desde J2000). */
    positionAU(days, target = new THREE.Vector3()) {
        const M = this.meanAnomaly(days);
        return this.positionFromE(OrbitalElements.eccentricAnomaly(M, this.e), target);
    }

    /** Convierte un vector heliocéntrico en UA a la escala comprimida de la escena. */
    static toScene(vAU, target = new THREE.Vector3()) {
        const r = vAU.length();
        if (r === 0) return target.set(0, 0, 0);
        return target.copy(vAU).multiplyScalar(auToScene(r) / r);
    }

    /** Puntos de la órbita completa en la fecha dada, ya en escala de escena. */
    samplePath(segments = 360, days = 0) {
        if (this.rates) this.applyCentury(days / 36525);
        const points = [];
        const v = new THREE.Vector3();
        for (let k = 0; k <= segments; k++) {
            // Muestreo en anomalía excéntrica: más puntos cerca del perihelio.
            this.positionFromE((k / segments) * TAU, v);
            points.push(OrbitalElements.toScene(v, new THREE.Vector3()));
        }
        return points;
    }
}
