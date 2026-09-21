import * as THREE from 'three';
import { CelestialBody, stepAngle, TAU, DEG } from './CelestialBody.js';

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
import { OrbitalElements } from '../core/OrbitalElements.js';
import { poleDirection, poleQuaternion } from '../core/Frames.js';
import { kmToSceneRadius } from '../config.js';
import { PlanetMaterial, EarthMaterial, CloudMaterial, AtmosphereMaterial, RingMaterial } from '../materials/PlanetMaterials.js';

const AU_KM = 149597870.7;
const GM_SUN = 1.32712440018e11; // km³/s²

/**
 * Planeta en órbita kepleriana alrededor del Sol.
 *
 * Jerarquía de nodos:
 *   root        → posición orbital
 *   └ tiltGroup → orientación real del eje (el ecuador y los anillos viven aquí)
 *     ├ surface → gira sobre su eje
 *     ├ atmosphere
 *     └ rings
 *
 * Se crea con `Planet.create(data, assets)`: el constructor solo guarda el
 * estado y `build()` crea las mallas. Así las subclases (como Earth) pueden
 * sobrescribir los pasos de construcción cuando ya están inicializadas del
 * todo (patrón Template Method), en lugar de llamar a métodos sobrescritos
 * desde el constructor de la clase base.
 */
export class Planet extends CelestialBody {
    /** Fábrica: construye el planeta (o la subclase) y crea sus mallas. */
    static create(data, assets) {
        const planet = new this(data);
        planet.build(assets);
        return planet;
    }

    constructor(data) {
        super({
            id: data.id,
            name: data.name,
            color: data.color,
            info: data.info,
            radius: kmToSceneRadius(data.radiusKm),
            kind: data.dwarf ? 'dwarf' : 'planet',
        });
        this.data = data;
        this.orbit = new OrbitalElements(data.elements, data.periodDays, data.rates);
        this.positionAU = new THREE.Vector3();
        this.spin = 0;
        this.pole = poleDirection(...data.pole);
    }

    /** Crea las mallas. Las subclases lo amplían llamando a super.build(). */
    build(assets) {
        const { data } = this;
        // Eje de rotación orientado hacia el polo real publicado por la IAU.
        this.tiltGroup = new THREE.Group();
        poleQuaternion(this.pole, this.tiltGroup.quaternion);
        this.root.add(this.tiltGroup);

        const segments = data.isEarth ? 160 : 112;
        this.surface = new THREE.Mesh(
            new THREE.SphereGeometry(this.radius, segments, segments * 0.75),
            this.createSurfaceMaterial(assets),
        );
        this.tiltGroup.add(this.surface);
        this.makePickable(this.surface);

        if (data.atmosphere) this.atmosphere = Planet.createAtmosphere(this.radius, data.atmosphere, this.tiltGroup);
        if (data.rings) this.createRings(assets);

        const today = (Date.now() - J2000_MS) / 86400000;
        this.orbitLine = CelestialBody.createOrbitLine(this.orbit.samplePath(720, today), data.color);
        this.ringNormal = this.pole.clone();
    }

    createSurfaceMaterial(assets) {
        const { data } = this;
        const atm = data.atmosphere;
        return new PlanetMaterial({
            map: assets.texture(data.texture),
            bump: data.bump ?? 0,
            minnaert: data.minnaert ?? 1,
            rimColor: atm ? atm.color : [0, 0, 0],
            rimStrength: atm ? 0.25 * atm.intensity : 0,
            texel: data.texture.includes('4k') ? 1 / 4096 : 1 / 2048,
        });
    }

    static createAtmosphere(radius, config, parent) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius * config.scale, 96, 64),
            new AtmosphereMaterial(config),
        );
        mesh.renderOrder = 1;
        parent.add(mesh);
        return mesh;
    }

    createRings(assets) {
        const cfg = this.data.rings;
        const inner = this.radius * cfg.inner;
        const outer = this.radius * cfg.outer;
        const geometry = new THREE.RingGeometry(inner, outer, 256, 8);

        // UV radial: u = 0 en el borde interior y 1 en el exterior.
        const pos = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        for (let k = 0; k < pos.count; k++) {
            const r = Math.hypot(pos.getX(k), pos.getY(k));
            uv.setXY(k, (r - inner) / (outer - inner), 0.5);
        }

        const map = assets.texture('saturn_ring_alpha.webp');
        this.rings = new THREE.Mesh(geometry, new RingMaterial({ map, tint: cfg.tint, opacity: cfg.opacity, brightness: cfg.brightness }));
        this.rings.rotation.x = -Math.PI / 2;
        this.rings.renderOrder = 2;
        this.tiltGroup.add(this.rings);

        // La superficie recibe la sombra de los anillos.
        const u = this.surface.material.uniforms;
        u.uHasRings.value = true;
        u.uRingMap.value = map;
        u.uRingInner.value = inner;
        u.uRingOuter.value = outer;
        u.uRingOpacity.value = cfg.opacity;
        this.rings.material.uniforms.uPlanetRadius.value = this.radius;
    }

    addSatellite(moon) {
        this.satellites.push(moon);
    }

    get viewDistance() {
        return this.radius * (this.rings ? 7 : 4.5);
    }

    /** Velocidad de rotación (radianes por día). */
    get rotationRate() {
        return (TAU * 24) / this.data.rotationHours;
    }

    /** Rotación exacta (radianes) para la fecha dada. */
    rotationAngle(days) {
        return this.rotationRate * days;
    }

    update(ctx) {
        this.orbit.positionAU(ctx.days, this.positionAU);
        OrbitalElements.toScene(this.positionAU, this.root.position);

        const exact = this.rotationAngle(ctx.days);
        this.spin = stepAngle(this.spin, exact, this.rotationRate * ctx.deltaDays);
        this.surface.rotation.y = this.spin;

        const center = this.root.position;
        if (this.rings) {
            this.rings.material.uniforms.uPlanetCenter.value.copy(center);
            this.rings.material.uniforms.uRingNormal.value.copy(this.ringNormal);
            this.surface.material.uniforms.uPlanetCenter.value.copy(center);
            this.surface.material.uniforms.uRingNormal.value.copy(this.ringNormal);
        }

        for (const moon of this.satellites) moon.update(ctx);
    }

    getLiveStats({ earth }) {
        const r = this.positionAU.length();
        const speed = Math.sqrt(GM_SUN * (2 / (r * AU_KM) - 1 / (this.orbit.a * AU_KM)));
        const stats = [
            ['Distancia al Sol', `${r.toFixed(3)} UA · ${formatMillions(r * AU_KM)}`],
            ['Velocidad orbital', `${speed.toFixed(1)} km/s`],
        ];
        if (this !== earth) {
            const d = this.positionAU.distanceTo(earth.positionAU);
            stats.push(['Distancia a la Tierra', `${d.toFixed(3)} UA · luz: ${formatLightTime(d)}`]);
        }
        return stats;
    }
}

/** La Tierra: rotación sincronizada con el tiempo sidéreo real, luces nocturnas y nubes. */
export class Earth extends Planet {
    constructor(data) {
        super(data);
        this.cloudDrift = 0;
    }

    build(assets) {
        super.build(assets);
        this.clouds = new THREE.Mesh(
            new THREE.SphereGeometry(this.radius * 1.012, 128, 96),
            new CloudMaterial({ map: this.cloudTexture }),
        );
        this.clouds.renderOrder = 1;
        this.surface.add(this.clouds);
    }

    createSurfaceMaterial(assets) {
        this.cloudTexture = assets.texture('earth_clouds_4k.webp', { color: false });
        return new EarthMaterial({
            day: assets.texture('earth_day_4k.webp'),
            night: assets.texture('earth_night_4k.webp'),
            specular: assets.texture('earth_specular.webp', { color: false }),
            normal: assets.texture('earth_normal.webp', { color: false }),
            clouds: this.cloudTexture,
        });
    }

    /** Tiempo sidéreo medio de Greenwich: orienta el meridiano 0 respecto al punto Aries. */
    rotationAngle(days) {
        return (280.46061837 + 360.98564736629 * days) * DEG;
    }

    get rotationRate() {
        return 360.98564736629 * DEG;
    }

    update(ctx) {
        super.update(ctx);
        // Las nubes derivan lentamente respecto a la superficie.
        this.cloudDrift += THREE.MathUtils.clamp(ctx.deltaDays * 0.05, -0.003, 0.003);
        this.clouds.rotation.y = this.cloudDrift;
        this.surface.material.uniforms.uCloudOffset.value = this.cloudDrift / TAU;
    }
}

export function formatMillions(km) {
    return km >= 1e9
        ? `${(km / 1e9).toLocaleString('es', { maximumFractionDigits: 2 })} mil M km`
        : `${(km / 1e6).toLocaleString('es', { maximumFractionDigits: 1 })} M km`;
}

export function formatLightTime(au) {
    const minutes = (au * 499.005) / 60;
    if (minutes < 60) return `${minutes.toFixed(1)} min`;
    return `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;
}
