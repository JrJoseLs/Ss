import * as THREE from 'three';

const DEG = Math.PI / 180;

/** Oblicuidad de la eclíptica en J2000 (ángulo entre el ecuador terrestre y la eclíptica). */
export const OBLIQUITY = 23.4392911 * DEG;

/**
 * Pasa un vector eclíptico J2000 (X hacia el punto Aries, Z hacia el polo
 * norte de la eclíptica) a las coordenadas de la escena, donde Y es "arriba".
 */
export function eclipticToScene(x, y, z, target = new THREE.Vector3()) {
    return target.set(x, z, -y);
}

/** Dirección de la escena para una longitud y una latitud eclípticas (grados). */
export function eclipticDirection(lonDeg, latDeg, target = new THREE.Vector3()) {
    const lon = lonDeg * DEG;
    const lat = latDeg * DEG;
    return eclipticToScene(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), target);
}

/**
 * Dirección del polo norte de un astro a partir de la ascensión recta y la
 * declinación publicadas por la IAU (marco ecuatorial J2000).
 */
export function poleDirection(raDeg, decDeg, target = new THREE.Vector3()) {
    const ra = raDeg * DEG;
    const dec = decDeg * DEG;
    const xe = Math.cos(dec) * Math.cos(ra);
    const ye = Math.cos(dec) * Math.sin(ra);
    const ze = Math.sin(dec);
    // Giro alrededor del eje X (punto Aries) del ecuador a la eclíptica.
    const y = ye * Math.cos(OBLIQUITY) + ze * Math.sin(OBLIQUITY);
    const z = -ye * Math.sin(OBLIQUITY) + ze * Math.cos(OBLIQUITY);
    return eclipticToScene(xe, y, z, target).normalize();
}

/**
 * Rotación que lleva el eje Y local de un astro hasta su polo. Es la rotación
 * mínima, así que para la Tierra conserva el eje X apuntando al punto Aries,
 * que es la referencia del tiempo sidéreo.
 */
export function poleQuaternion(pole, target = new THREE.Quaternion()) {
    return target.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
}
