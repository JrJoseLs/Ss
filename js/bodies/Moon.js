import * as THREE from 'three';
import { CelestialBody, stepAngle, TAU, DEG } from './CelestialBody.js';
import { Planet } from './Planet.js';
import { kmToSceneRadius } from '../config.js';
import { PlanetMaterial } from '../materials/PlanetMaterials.js';

const PHASES = [
    [10, 'Luna nueva'], [80, 'Creciente'], [100, 'Cuarto creciente'], [170, 'Gibosa creciente'],
    [190, 'Luna llena'], [260, 'Gibosa menguante'], [280, 'Cuarto menguante'], [350, 'Menguante'], [360, 'Luna nueva'],
];

/**
 * Satélite natural. Orbita en el plano ecuatorial de su planeta (o en el de
 * la eclíptica, como la Luna) y está acoplado por marea: siempre muestra la
 * misma cara al planeta.
 *
 *   plane (inclinación orbital) → pivot (ángulo orbital) → root (a la distancia orbital)
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

        this.plane = new THREE.Group();
        this.plane.rotation.x = (data.inclination ?? 0) * DEG;
        (data.plane === 'ecliptic' ? planet.root : planet.tiltGroup).add(this.plane);

        this.pivot = new THREE.Group();
        this.plane.add(this.pivot);
        this.pivot.add(this.root);
        this.root.position.set(this.distance, 0, 0);

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

        const circle = [];
        for (let k = 0; k < 128; k++) {
            const a = (k / 128) * TAU;
            circle.push(new THREE.Vector3(Math.cos(a) * this.distance, 0, -Math.sin(a) * this.distance));
        }
        this.orbitLine = CelestialBody.createOrbitLine(circle, '#9fb0c8', { opacity: 0.14 });
        this.plane.add(this.orbitLine);

        planet.addSatellite(this);
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
        const rate = TAU / this.data.periodDays;
        const exact = (this.data.longitudeAtEpoch ?? 0) * DEG + rate * ctx.days;
        this.angle = stepAngle(this.angle, exact, rate * ctx.deltaDays, 0.05);
        this.pivot.rotation.y = this.angle;
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
