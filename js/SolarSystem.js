import * as THREE from 'three';
import { Sun } from './bodies/Sun.js';
import { Planet, Earth } from './bodies/Planet.js';
import { Moon } from './bodies/Moon.js';
import { Comet } from './bodies/Comet.js';
import { ParticleBelt, AsteroidField } from './effects/Belts.js';
import { PLANETS_DATA, MOONS_DATA, COMET_DATA } from './data/solarSystemData.js';

/**
 * Modelo del sistema solar: crea todos los astros y cinturones, los añade a
 * la escena y los actualiza en cada fotograma.
 */
export class SolarSystem {
    constructor(scene, assets, { pixelRatio, onSelect }) {
        this.scene = scene;
        this.orbitLines = new THREE.Group();
        scene.add(this.orbitLines);

        this.sun = new Sun(assets);
        this.sun.createLabel(onSelect);
        scene.add(this.sun.root);

        this.planets = PLANETS_DATA.map((data) => {
            const planet = data.isEarth ? new Earth(data, assets) : new Planet(data, assets);
            planet.createLabel(onSelect, planet.radius < 1 ? 'label--small' : '');
            scene.add(planet.root);
            this.orbitLines.add(planet.orbitLine);
            return planet;
        });
        this.earth = this.planets.find((p) => p.data.isEarth);

        this.moons = [];
        for (const planet of this.planets) {
            for (const id of planet.data.moons ?? []) {
                const moon = new Moon(id, MOONS_DATA[id], planet, assets);
                moon.createLabel(onSelect, 'label--moon');
                this.moons.push(moon);
            }
        }

        this.comet = new Comet(COMET_DATA, pixelRatio);
        this.comet.createLabel(onSelect, 'label--small');
        scene.add(this.comet.root);
        this.orbitLines.add(this.comet.orbitLine);

        this.belts = [
            new ParticleBelt({
                count: 14000, innerAU: 2.1, outerAU: 3.35, maxE: 0.2, maxIncl: 16,
                gaps: [[2.5, 0.03], [2.82, 0.03], [2.95, 0.02]],
                color: '#b8a998', size: 0.9, opacity: 0.55, pixelRatio,
            }),
            new ParticleBelt({
                count: 16000, innerAU: 30, outerAU: 50, maxE: 0.12, maxIncl: 20,
                color: '#9fb3cc', size: 2.2, opacity: 0.35, pixelRatio,
            }),
            new AsteroidField({ count: 900 }),
        ];
        this.belts.forEach((belt) => scene.add(belt.object));

        this.bodies = [this.sun, ...this.planets, ...this.moons, this.comet];
        this.pickables = this.bodies.flatMap((body) => body.pickables);
        this.occluders = [...this.planets, ...this.moons];
        this.tmp = new THREE.Vector3();
    }

    find(id) {
        return this.bodies.find((body) => body.id === id);
    }

    update(ctx) {
        this.sun.update(ctx);
        this.planets.forEach((planet) => planet.update(ctx)); // también actualiza sus lunas
        this.comet.update(ctx);
        this.belts.forEach((belt) => belt.update(ctx));
    }

    setDensity(fraction) {
        this.belts.forEach((belt) => belt.setDensity(fraction));
        this.comet.setDensity(fraction);
    }

    setOrbitsVisible(visible) {
        this.orbitLines.visible = visible;
        this.moons.forEach((moon) => { moon.orbitLine.visible = visible; });
    }

    /** Oculta las etiquetas que estorban: la del astro que tenemos delante y las lunas lejanas. */
    updateLabels(camera, showLabels) {
        const cam = camera.position;
        for (const body of this.bodies) {
            let visible = showLabels;
            if (visible) {
                const distance = body.getWorldPosition(this.tmp).distanceTo(cam);
                if (distance < body.radius * 3.2) visible = false;
                if (body.kind === 'moon') {
                    const parentDistance = body.planet.getWorldPosition(this.tmp).distanceTo(cam);
                    visible = visible && parentDistance < body.planet.radius * 40;
                }
            }
            body.setLabelVisible(visible);
        }
    }
}
