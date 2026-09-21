/**
 * Valida la mecánica orbital contra efemérides de la NASA (JPL Horizons).
 * Los valores de referencia están en fixtures/horizons.json.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { OrbitalElements } from '../js/core/OrbitalElements.js';
import { eclipticToScene, poleDirection } from '../js/core/Frames.js';
import { moonDirection } from '../js/core/LunarEphemeris.js';
import { SatelliteOrbit } from '../js/core/SatelliteOrbit.js';
import { PLANETS_DATA, MOONS_DATA, COMET_DATA } from '../js/data/solarSystemData.js';
import { SATELLITE_STATES, SATELLITE_EPOCH } from '../js/data/satelliteStates.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/horizons.json', import.meta.url)));
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const daysOf = (iso) => (Date.parse(iso) - J2000_MS) / 86400000;
const angleDeg = (a, b) => THREE.MathUtils.radToDeg(a.angleTo(b));
const fromHorizons = (v) => eclipticToScene(...v);

describe('Ecuación de Kepler', () => {
    test('resuelve M = E − e·sen(E) para excentricidades de 0 a 0.97', () => {
        for (const e of [0, 0.0167, 0.2056, 0.2488, 0.8471, 0.97]) {
            for (let M = -Math.PI; M <= Math.PI; M += 0.1) {
                const E = OrbitalElements.eccentricAnomaly(M, e);
                // La solución es válida módulo 2π (M = −π y M = π son el mismo punto).
                const residual = Math.abs(Math.sin((E - e * Math.sin(E) - M) / 2));
                assert.ok(residual < 1e-9, `e=${e}, M=${M}`);
            }
        }
    });
});

describe('Posiciones heliocéntricas frente a JPL Horizons', () => {
    // Tolerancias de la aproximación de Standish (1800–2050) con margen.
    const maxAngle = { mercurio: 0.1, venus: 0.1, tierra: 0.1, marte: 0.1, jupiter: 0.3, saturno: 0.3, urano: 0.3, neptuno: 0.3, pluton: 0.5 };

    for (const [date, bodies] of Object.entries(fixtures.planets)) {
        for (const data of PLANETS_DATA) {
            test(`${data.name} el ${date.slice(0, 10)}`, () => {
                const model = new OrbitalElements(data.elements, data.periodDays, data.rates).positionAU(daysOf(date));
                const ref = fromHorizons(bodies[data.id]);
                const error = angleDeg(model, ref);
                const distanceError = Math.abs(model.length() - ref.length()) / ref.length();
                assert.ok(error < maxAngle[data.id], `error angular ${error.toFixed(3)}°`);
                assert.ok(distanceError < 0.01, `error de distancia ${(distanceError * 100).toFixed(2)} %`);
            });
        }
    }
});

describe('Luna', () => {
    for (const [date, vector] of Object.entries(fixtures.moon)) {
        test(`dirección geocéntrica el ${date.slice(0, 10)} (error < 0.5°)`, () => {
            const error = angleDeg(moonDirection(daysOf(date)), fromHorizons(vector));
            assert.ok(error < 0.5, `error ${error.toFixed(3)}°`);
        });
    }
});

describe('Lunas de los demás planetas', () => {
    const check = fixtures.satellites.check;
    for (const [id, state] of Object.entries(SATELLITE_STATES)) {
        const moon = MOONS_DATA[id];
        test(`${moon.name}: plano real y posición dos meses después`, () => {
            const orbit = new SatelliteOrbit(state, SATELLITE_EPOCH, moon.periodDays);
            // En la época, la dirección reproduce exactamente el vector de estado.
            const atEpoch = angleDeg(orbit.directionAt(orbit.epochDays), fromHorizons(state.r));
            assert.ok(atEpoch < 1e-4, `época ${atEpoch}°`);
            // Dos meses después, la órbita circular sigue cerca de la posición real.
            // Fobos y Deimos precesan rápido y tienen más tolerancia.
            const tolerance = id === 'fobos' || id === 'deimos' ? 20 : 8;
            const later = angleDeg(orbit.directionAt(daysOf(check.date)), fromHorizons(check.states[id].r));
            assert.ok(later < tolerance, `error ${later.toFixed(2)}°`);
        });
    }

    test('Tritón gira en sentido retrógrado respecto a la rotación de Neptuno', () => {
        const triton = new SatelliteOrbit(SATELLITE_STATES.triton, SATELLITE_EPOCH, MOONS_DATA.triton.periodDays);
        const neptune = PLANETS_DATA.find((p) => p.id === 'neptuno');
        assert.ok(triton.normal.dot(poleDirection(...neptune.pole)) < 0);
    });
});

describe('Cometa Encke', () => {
    test('pasa por el perihelio (0.336 UA) en la fecha de referencia', () => {
        const orbit = new OrbitalElements(COMET_DATA.elements, COMET_DATA.periodDays);
        const r = orbit.positionAU(orbit.epochDay).length();
        assert.ok(Math.abs(r - 0.336) < 0.005, `r = ${r}`);
    });
});
