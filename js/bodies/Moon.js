import * as THREE from 'three';
import { CelestialBody, stepAngle, TAU, DEG } from './CelestialBody.js';
import { Planet } from './Planet.js';
import { kmToSceneRadius } from '../config.js';
import { PlanetMaterial } from '../materials/PlanetMaterials.js';
import { SatelliteOrbit } from '../core/SatelliteOrbit.js';
import { moonEclipticPosition } from '../core/LunarEphemeris.js';
import { eclipticDirection } from '../core/Frames.js';
import { SATELLITE_STATES, SATELLITE_EPOCH } from '../data/satelliteStates.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);

const PHASES = [
    [10, 'Luna nueva'], [80, 'Creciente'], [100, 'Cuarto creciente'], [170, 'Gibosa creciente'],
    [190, 'Luna llena'], [260, 'Gibosa menguante'], [280, 'Cuarto menguante'], [350, 'Menguante'], [360, 'Luna nueva'],
];

/**
 * Satélite natural acoplado por marea: siempre muestra la misma cara al planeta.
 *
 * - La Luna sigue su efeméride (LunarEphemeris), así que su fase y su
 *   posición corresponden a la fecha simulada.
 * - Las demás lunas usan un vector de estado real (SatelliteOrbit), del que
 *   salen su plano orbital, su sentido de giro y su fase:
 *     plane (plano orbital real) → pivot (ángulo orbital) → root (a la distancia orbital)
 */
export class Moon extends CelestialBody {
    constructor(id, data, planet, assets) {
        super({
            id,
            name: data.name,
            color: '#d8dee9',
            info: data.info,
            radius: data.sceneRadius ?? kmToSceneRadius(data.radiusKm),
            kind: 'moon',
        });
        this.data = data;
        this.planet = planet;
        this.distance = planet.radius * data.distance;
        this.angle = 0;

        this.rate = TAU / data.periodDays; // rad/día
        this.usesEphemeris = data.ephemeris === 'lunar';

        if (this.usesEphemeris) {
            planet.root.add(this.root);
        } else {
            this.orbit = new SatelliteOrbit(SATELLITE_STATES[id], SATELLITE_EPOCH, data.periodDays);
            this.plane = new THREE.Group();
            this.plane.quaternion.copy(this.orbit.quaternion);
            planet.root.add(this.plane);
            this.pivot = new THREE.Group();
            this.plane.add(this.pivot);
            this.pivot.add(this.root);
            this.root.position.set(this.distance, 0, 0);
        }

        const geometry = data.irregular
            ? Moon.createIrregularGeometry(this.radius)
            : new THREE.SphereGeometry(this.radius, 72, 54);
        const atm = data.atmosphere;
        this.surface = new THREE.Mesh(geometry, new PlanetMaterial({
            map: assets.texture(data.texture),
            bump: data.bump ?? 0,
            minnaert: data.minnaert ?? 0.85,
            tint: data.tint ?? [1, 1, 1],
            rimColor: atm ? atm.color : [0, 0, 0],
            rimStrength: atm ? 0.5 : 0,
        }));
        this.surface.rotation.y = Math.PI; // el meridiano 0 mira al planeta
        this.root.add(this.surface);
        this.makePickable(this.surface);

        if (atm) Planet.createAtmosphere(this.radius, atm, this.root);

        if (this.usesEphemeris) {
            // La órbita de la Luna cambia de un mes a otro: se dibuja su trayectoria real.
            this.orbitLine = CelestialBody.createOrbitLine(this.samplePath(0), '#9fb0c8', { opacity: 0.14 });
            this.pathDays = 0;
            planet.root.add(this.orbitLine);
        } else {
            const circle = [];
            for (let k = 0; k < 128; k++) {
                const a = (k / 128) * TAU;
                circle.push(new THREE.Vector3(Math.cos(a) * this.distance, 0, -Math.sin(a) * this.distance));
            }
            this.orbitLine = CelestialBody.createOrbitLine(circle, '#9fb0c8', { opacity: 0.14 });
            this.plane.add(this.orbitLine);
        }

        planet.addSatellite(this);
    }

    /** Trayectoria de la Luna durante un mes sidéreo a partir de `days`. */
    samplePath(days) {
        const points = [];
        for (let k = 0; k < 128; k++) {
            const { lon, lat } = moonEclipticPosition(days + (k / 128) * this.data.periodDays);
            points.push(eclipticDirection(lon, lat).multiplyScalar(this.distance));
        }
        return points;
    }

    /** Esfera deformada con ruido de baja frecuencia: forma de patata para Fobos y Deimos. */
    static createIrregularGeometry(radius) {
        const geometry = new THREE.SphereGeometry(1, 64, 48);
        const pos = geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let k = 0; k < pos.count; k++) {
            v.fromBufferAttribute(pos, k);
            const d = 1
                + 0.16 * Math.sin(3.1 * v.x + 1.3) * Math.sin(2.7 * v.y + 0.4) * Math.sin(3.3 * v.z + 2.1)
                + 0.06 * Math.sin(7.3 * v.x + 0.5) * Math.sin(6.1 * v.z + 1.7)
                - 0.05 * Math.pow(Math.max(0, Math.sin(9 * v.y + 3 * v.x)), 4);
            v.multiplyScalar(d * radius);
            pos.setXYZ(k, v.x * 1.3, v.y * 0.85, v.z);
        }
        geometry.computeVertexNormals();
        return geometry;
    }

    get viewDistance() {
        return Math.max(this.radius * 5, 0.9);
    }

    get minDistance() {
        return this.radius * 1.5;
    }

    update(ctx) {
        const delta = this.rate * ctx.deltaDays;
        if (!this.usesEphemeris) {
            this.angle = stepAngle(this.angle, this.orbit.angleAt(ctx.days), delta, 0.05);
            this.pivot.rotation.y = this.angle;
            return;
        }

        // Longitud suavizada (para que no parpadee con el tiempo muy acelerado) y latitud real.
        const { lon, lat } = moonEclipticPosition(ctx.days);
        this.angle = stepAngle(this.angle, lon * DEG, delta, 0.05);
        const dir = eclipticDirection(this.angle / DEG, lat, this.tmpDir ??= new THREE.Vector3());
        this.root.position.copy(dir).multiplyScalar(this.distance);
        // El eje X local apunta hacia fuera, así que la cara visible (−X) mira a la Tierra.
        this.root.quaternion.setFromUnitVectors(X_AXIS, dir);

        if (Math.abs(ctx.days - this.pathDays) > 3) {
            this.pathDays = ctx.days;
            // Se reescribe el mismo buffer (setFromPoints crearía uno nuevo cada vez).
            const attribute = this.orbitLine.geometry.attributes.position;
            this.samplePath(ctx.days - this.data.periodDays / 2).forEach((p, k) => attribute.setXYZ(k, p.x, p.y, p.z));
            attribute.needsUpdate = true;
            this.orbitLine.geometry.computeBoundingSphere();
        }
    }

    getLiveStats() {
        const stats = [['Orbita a', this.planet.name]];
        if (this.id !== 'luna') return stats;

        // Fase lunar a partir de las posiciones reales del Sol, la Tierra y la Luna.
        const earthPos = this.planet.getWorldPosition(new THREE.Vector3());
        const moonPos = this.getWorldPosition(new THREE.Vector3());
        const toSun = moonPos.clone().negate().normalize();
        const toEarth = earthPos.clone().sub(moonPos).normalize();
        const illuminated = (1 + toSun.dot(toEarth)) / 2;

        const lon = (v) => Math.atan2(-v.z, v.x) / DEG;
        const elongation = (((lon(moonPos.clone().sub(earthPos)) - lon(earthPos.clone().negate())) % 360) + 360) % 360;
        const phase = PHASES.find(([limit]) => elongation < limit)[1];
        stats.push(['Fase', phase], ['Iluminación', `${Math.round(illuminated * 100)} %`]);
        return stats;
    }
}
