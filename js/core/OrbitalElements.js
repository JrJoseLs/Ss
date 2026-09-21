import * as THREE from 'three';
import { auToScene } from '../config.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const JD_J2000 = 2451545.0;

/**
 * Órbita kepleriana definida por sus seis elementos clásicos.
 * Calcula posiciones heliocéntricas reales (en UA) y su equivalente en la
 * escena. El plano de referencia es la eclíptica: X apunta al punto Aries y
 * el eje Y de three.js es el polo norte de la eclíptica.
 */
export class OrbitalElements {
    /**
     * @param {object} el  a, e, i, Omega y además (varpi y L) o (omega y perihelionJD)
     * @param {number} periodDays
     */
    constructor(el, periodDays) {
        this.a = el.a;
        this.e = el.e;
        this.periodDays = periodDays;
        this.n = TAU / periodDays; // movimiento medio (rad/día)

        const i = el.i * DEG;
        const Omega = el.Omega * DEG;
        let omega;
        if (el.L !== undefined) {
            omega = (el.varpi - el.Omega) * DEG;
            this.M0 = (el.L - el.varpi) * DEG;
            this.epochDay = 0;
        } else {
            omega = el.omega * DEG;
            this.M0 = 0;
            this.epochDay = el.perihelionJD - JD_J2000;
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
        const M = this.M0 + this.n * (days - this.epochDay);
        return this.positionFromE(OrbitalElements.eccentricAnomaly(M, this.e), target);
    }

    /** Convierte un vector heliocéntrico en UA a la escala comprimida de la escena. */
    static toScene(vAU, target = new THREE.Vector3()) {
        const r = vAU.length();
        if (r === 0) return target.set(0, 0, 0);
        return target.copy(vAU).multiplyScalar(auToScene(r) / r);
    }

    /** Puntos de la órbita completa, ya en escala de escena. */
    samplePath(segments = 360) {
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
