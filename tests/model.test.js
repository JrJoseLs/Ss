/**
 * Coherencia del modelo: polos y estaciones, eventos astronómicos, reloj de
 * simulación y giro suavizado.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { OrbitalElements } from '../js/core/OrbitalElements.js';
import { poleDirection } from '../js/core/Frames.js';
import { SimulationClock } from '../js/core/SimulationClock.js';
import { stepAngle } from '../js/bodies/CelestialBody.js';
import { PLANETS_DATA, COMET_DATA } from '../js/data/solarSystemData.js';
import { EVENTS, eventTime, nextFullMoon } from '../js/data/events.js';
import { moonEclipticPosition } from '../js/core/LunarEphemeris.js';
import { TIME_STEPS } from '../js/config.js';

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const daysOf = (ms) => (ms - J2000_MS) / 86400000;
const deg = THREE.MathUtils.radToDeg;
const planet = (id) => PLANETS_DATA.find((p) => p.id === id);
const orbitOf = (id) => new OrbitalElements(planet(id).elements, planet(id).periodDays, planet(id).rates);
const longitude = (v) => (deg(Math.atan2(-v.z, v.x)) + 360) % 360;

/** Elevación del Sol (°) sobre el ecuador de un planeta: la "declinación solar". */
function solarDeclination(id, ms) {
    const toSun = orbitOf(id).positionAU(daysOf(ms)).negate().normalize();
    return 90 - deg(toSun.angleTo(poleDirection(...planet(id).pole)));
}

/** Normal del plano orbital (dirección del momento angular). */
function orbitNormal(id) {
    const orbit = orbitOf(id);
    const a = orbit.positionFromE(0);
    const b = orbit.positionFromE(0.1);
    return new THREE.Vector3().crossVectors(a, b).normalize();
}

describe('Polos IAU', () => {
    for (const data of PLANETS_DATA) {
        test(`${data.name}: la inclinación axial coincide con el polo (${data.tilt}°)`, () => {
            const angle = deg(poleDirection(...data.pole).angleTo(orbitNormal(data.id)));
            // Con rotación retrógrada, la IAU toma el polo del otro hemisferio.
            const expected = data.rotationHours < 0 ? 180 - data.tilt : data.tilt;
            assert.ok(Math.abs(angle - expected) < 1, `${angle.toFixed(2)}° frente a ${expected}°`);
        });
    }

    test('Tierra: el Sol está sobre el trópico de Cáncer en el solsticio de junio', () => {
        const d = solarDeclination('tierra', Date.parse('2026-06-21T08:24:00Z'));
        assert.ok(Math.abs(d - 23.44) < 0.05, `${d.toFixed(3)}°`);
    });

    test('Saturno: equinoccio (Sol en el plano de los anillos) en mayo de 2025', () => {
        const before = solarDeclination('saturno', Date.parse('2025-01-01T00:00:00Z'));
        const at = solarDeclination('saturno', Date.parse('2025-05-06T00:00:00Z'));
        const after = solarDeclination('saturno', Date.parse('2025-12-01T00:00:00Z'));
        assert.ok(Math.abs(at) < 0.3, `${at.toFixed(3)}°`);
        assert.ok(Math.sign(before) !== Math.sign(after), 'el Sol cambia de cara de los anillos');
    });

    test('Marte: equinoccio de primavera del norte (Ls = 0) el 12 de noviembre de 2024', () => {
        const d = solarDeclination('marte', Date.parse('2024-11-12T00:00:00Z'));
        assert.ok(Math.abs(d) < 0.5, `${d.toFixed(3)}°`);
    });
});

describe('Eventos', () => {
    const system = {
        earth: { orbit: orbitOf('tierra') },
        comet: { orbit: new OrbitalElements(COMET_DATA.elements, COMET_DATA.periodDays) },
    };

    for (const id of ['oposicion-jupiter-2026', 'oposicion-marte-2027']) {
        test(`${id}: el Sol, la Tierra y el planeta están alineados`, () => {
            const event = EVENTS.find((e) => e.id === id);
            const days = daysOf(eventTime(event, system));
            const target = id.includes('jupiter') ? 'jupiter' : 'marte';
            const diff = Math.abs(longitude(orbitOf('tierra').positionAU(days)) - longitude(orbitOf(target).positionAU(days)));
            assert.ok(Math.min(diff, 360 - diff) < 1.5, `${diff.toFixed(2)}°`);
        });
    }

    test('perihelio de Plutón en 1989', () => {
        const orbit = orbitOf('pluton');
        const t = daysOf(Date.parse('1989-09-05T00:00:00Z'));
        const r = orbit.positionAU(t).length();
        assert.ok(r < orbit.positionAU(t - 400).length() && r < orbit.positionAU(t + 400).length());
        assert.ok(Math.abs(r - 29.66) < 0.1, `r = ${r.toFixed(2)} UA`);
    });

    test('próxima luna llena: la Luna queda a 180° del Sol', () => {
        const ms = nextFullMoon(system.earth.orbit, Date.parse('2026-09-21T00:00:00Z'));
        // La luna llena real fue el 26 de septiembre de 2026 a las 16:49 UT.
        const errorHours = Math.abs(ms - Date.parse('2026-09-26T16:49:00Z')) / 3600000;
        assert.ok(errorHours < 3, `${errorHours.toFixed(1)} h de diferencia`);
        const sunLon = (longitude(system.earth.orbit.positionAU(daysOf(ms))) + 180) % 360;
        const elong = (moonEclipticPosition(daysOf(ms)).lon - sunLon + 360) % 360;
        assert.ok(Math.abs(elong - 180) < 0.01);
    });

    test('todos los eventos tienen fecha válida', () => {
        for (const event of EVENTS) assert.ok(Number.isFinite(eventTime(event, system)), event.id);
    });
});

describe('Reloj de simulación', () => {
    test('avanza según la velocidad elegida', () => {
        const clock = new SimulationClock();
        const start = clock.timeMs;
        clock.update(2);
        assert.equal(clock.timeMs - start, 2 * TIME_STEPS[clock.stepIndex].value * 1000);
    });

    test('al frenar por debajo del tiempo real invierte el sentido, y al acelerar vuelve', () => {
        const clock = new SimulationClock();
        for (let k = 0; k < TIME_STEPS.length + 1; k++) clock.slower();
        assert.equal(clock.direction, -1);
        assert.ok(clock.label.startsWith('−'));
        for (let k = 0; k < TIME_STEPS.length * 2; k++) clock.faster();
        assert.equal(clock.direction, 1);
        assert.equal(clock.stepIndex, TIME_STEPS.length - 1);
    });

    test('en pausa no avanza', () => {
        const clock = new SimulationClock();
        clock.togglePause();
        const start = clock.timeMs;
        clock.update(5);
        assert.equal(clock.timeMs, start);
    });

    test('setDate salta a una fecha y avisa a los oyentes', () => {
        const clock = new SimulationClock();
        let calls = 0;
        clock.onChange(() => calls++);
        clock.setDate(Date.parse('1989-09-05T00:00:00Z'));
        assert.equal(clock.date.toISOString(), '1989-09-05T00:00:00.000Z');
        assert.equal(calls, 1);
    });
});

describe('Giro suavizado (stepAngle)', () => {
    test('sigue el ángulo exacto cuando el giro es lento', () => {
        assert.ok(Math.abs(stepAngle(1.0, 1.05, 0.05) - 1.05) < 1e-12);
    });

    test('limita el paso cuando el giro es demasiado rápido', () => {
        assert.ok(Math.abs(stepAngle(0, 50, 30, 0.12) - 0.12) < 1e-12);
        assert.ok(Math.abs(stepAngle(0, -50, -30, 0.12) + 0.12) < 1e-12);
    });

    test('toma el camino corto al converger', () => {
        const next = stepAngle(0.1, 2 * Math.PI - 0.1, 0, 0.5);
        assert.ok(Math.abs(next + 0.1) < 1e-12, `${next}`);
    });
});
