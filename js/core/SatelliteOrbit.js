import * as THREE from 'three';
import { eclipticToScene } from './Frames.js';

const TAU = Math.PI * 2;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/**
 * Órbita circular de una luna a partir de un vector de estado real
 * (posición y velocidad respecto al planeta en una fecha dada).
 *
 * El momento angular r × v da la normal del plano orbital, así que el plano
 * y el sentido de giro (incluidas las órbitas retrógradas, como la de Tritón)
 * salen de los datos. El ángulo en esa fecha fija la fase, y a partir de ahí
 * la luna avanza con su periodo.
 */
export class SatelliteOrbit {
    /**
     * @param {{ r: number[], v: number[] }} state  vectores eclípticos J2000
     * @param {string} epochIso  fecha del vector de estado
     * @param {number} periodDays  periodo orbital (positivo)
     */
    constructor(state, epochIso, periodDays) {
        const r = eclipticToScene(...state.r);
        const v = eclipticToScene(...state.v);
        this.normal = new THREE.Vector3().crossVectors(r, v).normalize();
        this.quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.normal);

        // Ángulo en el plano orbital, con la misma convención que rotation.y de three.js.
        const local = r.clone().applyQuaternion(this.quaternion.clone().invert());
        this.angle0 = Math.atan2(-local.z, local.x);
        this.epochDays = (Date.parse(epochIso) - J2000_MS) / 86400000;
        this.rate = TAU / periodDays; // rad/día
    }

    /** Ángulo orbital (rad) en la fecha dada (días desde J2000). */
    angleAt(days) {
        return this.angle0 + this.rate * (days - this.epochDays);
    }

    /** Dirección planeta → luna en coordenadas de la escena. */
    directionAt(days, target = new THREE.Vector3()) {
        const a = this.angleAt(days);
        return target.set(Math.cos(a), 0, -Math.sin(a)).applyQuaternion(this.quaternion);
    }
}
