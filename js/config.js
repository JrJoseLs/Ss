/**
 * Escalas de la escena.
 *
 * El sistema solar real es imposible de ver completo: Neptuno está 30 veces
 * más lejos que la Tierra y el Sol es 109 veces más grande que ella. Por eso
 * se comprimen distancias y radios con una ley de potencia: se conservan el
 * orden, la forma de las órbitas y las proporciones relativas, pero todo cabe
 * en pantalla.
 */
export const SCALE = {
    DIST_K: 55,          // unidades de escena para 1 UA
    DIST_P: 0.62,        // exponente de compresión de distancias
    EARTH_RADIUS: 1.2,   // radio de la Tierra en unidades de escena
    RADIUS_P: 0.55,      // exponente de compresión de radios
    SUN_RADIUS: 9,
};

export const TEXTURE_PATH = 'assets/textures/';

/** Intensidad de la luz solar en los shaders propios. */
export const SUN_INTENSITY = 1.35;

/** Convierte una distancia heliocéntrica en UA a unidades de escena. */
export function auToScene(au) {
    return SCALE.DIST_K * Math.pow(Math.max(au, 0), SCALE.DIST_P);
}

/** Convierte un radio real en km a unidades de escena. */
export function kmToSceneRadius(km) {
    return SCALE.EARTH_RADIUS * Math.pow(km / 6371, SCALE.RADIUS_P);
}

/** Pasos de velocidad del tiempo (segundos simulados por segundo real). */
export const TIME_STEPS = [
    { value: 1, label: 'Tiempo real' },
    { value: 60, label: '1 min / s' },
    { value: 3600, label: '1 hora / s' },
    { value: 21600, label: '6 horas / s' },
    { value: 86400, label: '1 día / s' },
    { value: 604800, label: '1 semana / s' },
    { value: 2629800, label: '1 mes / s' },
    { value: 15778800, label: '6 meses / s' },
    { value: 31557600, label: '1 año / s' },
];

export const DEFAULT_TIME_STEP = 4; // 1 día / s
