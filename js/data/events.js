import { moonEclipticPosition } from '../core/LunarEphemeris.js';

const DAY_MS = 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const toDays = (ms) => (ms - J2000_MS) / DAY_MS;
const toMs = (days) => J2000_MS + days * DAY_MS;

/** Longitud eclíptica heliocéntrica (grados) de un vector de la escena. */
const longitude = (v) => ((Math.atan2(-v.z, v.x) * 180) / Math.PI + 360) % 360;

/** Próxima luna llena: la Luna a 180° del Sol visto desde la Tierra. */
export function nextFullMoon(earthOrbit, fromMs) {
    const elongation = (days) => {
        const sunLon = (longitude(earthOrbit.positionAU(days)) + 180) % 360;
        return (((moonEclipticPosition(days).lon - sunLon) % 360) + 360) % 360;
    };
    let days = toDays(fromMs) + 0.5;
    while (elongation(days) >= 180 || elongation(days + 0.25) < 180) days += 0.25;
    // Bisección fina entre days y days + 0.25.
    let lo = days;
    let hi = days + 0.25;
    for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if (elongation(mid) < 180) lo = mid;
        else hi = mid;
    }
    return toMs(lo);
}

/** Próximo paso por el perihelio de un cuerpo con órbita kepleriana. */
export function nextPerihelion(orbit, fromMs) {
    const days = toDays(fromMs);
    const k = Math.ceil((days - orbit.epochDay) / orbit.periodDays);
    return toMs(orbit.epochDay + k * orbit.periodDays);
}

/**
 * Eventos astronómicos para saltar en el tiempo. `focus` es el astro al que
 * viaja la cámara; null muestra la vista general (útil para alineaciones).
 */
export const EVENTS = [
    {
        id: 'luna-llena',
        title: 'Próxima luna llena',
        description: 'La Tierra queda entre el Sol y la Luna, que se ve completamente iluminada.',
        focus: 'luna',
        date: (system, nowMs) => nextFullMoon(system.earth.orbit, nowMs),
    },
    {
        id: 'perihelio-encke',
        title: 'Perihelio del cometa Encke',
        description: 'El cometa pasa a 0.34 UA del Sol y despliega sus dos colas.',
        focus: 'encke',
        date: (system, nowMs) => nextPerihelion(system.comet.orbit, nowMs),
    },
    {
        id: 'solsticio-2026',
        title: 'Solsticio de junio de 2026',
        description: 'El polo norte terrestre está inclinado al máximo hacia el Sol: el día más largo del hemisferio norte.',
        focus: 'tierra',
        date: '2026-06-21T08:24:00Z',
    },
    {
        id: 'oposicion-jupiter-2026',
        title: 'Oposición de Júpiter 2026',
        description: 'La Tierra pasa entre el Sol y Júpiter: el Sol, la Tierra y Júpiter quedan alineados.',
        focus: null,
        date: '2026-01-10T00:00:00Z',
    },
    {
        id: 'oposicion-marte-2027',
        title: 'Oposición de Marte 2027',
        description: 'Marte queda al otro lado de la Tierra respecto al Sol y alcanza su máximo brillo.',
        focus: null,
        date: '2027-02-19T00:00:00Z',
    },
    {
        id: 'equinoccio-saturno-2025',
        title: 'Equinoccio de Saturno 2025',
        description: 'El Sol cruza el plano de los anillos, que quedan iluminados de canto. Ocurre cada unos 15 años.',
        focus: 'saturno',
        date: '2025-05-06T00:00:00Z',
    },
    {
        id: 'perihelio-pluton-1989',
        title: 'Perihelio de Plutón 1989',
        description: 'Plutón en su punto más cercano al Sol (29.7 UA). Entre 1979 y 1999 estuvo más cerca del Sol que Neptuno.',
        focus: 'pluton',
        date: '1989-09-05T00:00:00Z',
    },
];

/** Fecha (ms) de un evento, resolviendo los que se calculan. */
export function eventTime(event, system, nowMs = Date.now()) {
    return typeof event.date === 'function' ? event.date(system, nowMs) : Date.parse(event.date);
}
