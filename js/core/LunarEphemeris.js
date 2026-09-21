import * as THREE from 'three';
import { eclipticDirection } from './Frames.js';

const DEG = Math.PI / 180;
const sin = (deg) => Math.sin(deg * DEG);

/**
 * Posición geocéntrica aproximada de la Luna (fórmula de baja precisión del
 * Astronomical Almanac). Incluye las principales perturbaciones: ecuación del
 * centro, evección, variación y ecuación anual. Error típico: 0.3° en
 * longitud y 0.2° en latitud, frente a los ~6° de usar solo la longitud media.
 * El resultado está referido a la eclíptica y el equinoccio de J2000.
 *
 * @param {number} days días desde J2000.0
 * @returns {{ lon: number, lat: number }} longitud y latitud eclípticas (grados)
 */
export function moonEclipticPosition(days) {
    const T = days / 36525;
    const lon = 218.32 + 481267.881 * T
        + 6.29 * sin(135.0 + 477198.87 * T)
        - 1.27 * sin(259.3 - 413335.36 * T)
        + 0.66 * sin(235.7 + 890534.22 * T)
        + 0.21 * sin(269.9 + 954397.74 * T)
        - 0.19 * sin(357.5 + 35999.05 * T)
        - 0.11 * sin(186.5 + 966404.03 * T);
    const lat = 5.13 * sin(93.3 + 483202.02 * T)
        + 0.28 * sin(228.2 + 960400.89 * T)
        - 0.28 * sin(318.3 + 6003.15 * T)
        - 0.17 * sin(217.6 - 407332.21 * T);
    // La fórmula da la longitud respecto al equinoccio de la fecha; se pasa al
    // de J2000, que es el marco del resto de la simulación (precesión ≈ 1.397°/siglo).
    const lonJ2000 = lon - 1.396971 * T;
    return { lon: ((lonJ2000 % 360) + 360) % 360, lat };
}

/** Dirección unitaria Tierra → Luna en coordenadas de la escena. */
export function moonDirection(days, target = new THREE.Vector3()) {
    const { lon, lat } = moonEclipticPosition(days);
    return eclipticDirection(lon, lat, target);
}
