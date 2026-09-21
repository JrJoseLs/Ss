import * as THREE from 'three';
import { CelestialBody } from './CelestialBody.js';
import { Moon } from './Moon.js';
import { OrbitalElements } from '../core/OrbitalElements.js';
import { formatMillions, formatLightTime } from './Planet.js';

const AU_KM = 149597870.7;
const GM_SUN = 1.32712440018e11;

function createGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(210,235,255,0.6)');
    g.addColorStop(0.45, 'rgba(140,190,255,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Cometa en una órbita muy excéntrica. Cerca del Sol se activa: crece la
 * coma y aparecen dos colas de partículas animadas en la GPU. La de iones es
 * azul, recta y apunta siempre en dirección contraria al Sol; la de polvo es
 * más ancha, amarillenta y se curva a lo largo de la órbita.
 */
export class Comet extends CelestialBody {
    constructor(data, pixelRatio) {
        super({ id: data.id, name: data.name, color: data.color, info: data.info, radius: 0.07, kind: 'comet' });
        this.orbit = new OrbitalElements(data.elements, data.periodDays);
        this.positionAU = new THREE.Vector3();
        this.activity = 0;
        this.tmp = new THREE.Vector3();

        this.nucleus = new THREE.Mesh(
            Moon.createIrregularGeometry(this.radius),
            new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 1, metalness: 0 }),
        );
        this.root.add(this.nucleus);

        // Esfera invisible más grande para poder seleccionarlo con el ratón.
        const picker = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial());
        picker.visible = false;
        this.root.add(picker);
        this.makePickable(picker);

        this.coma = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createGlowTexture(),
            color: 0xcfe6ff,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
        }));
        this.root.add(this.coma);

        this.tails = this.createTails(pixelRatio);
        this.root.add(this.tails);

        this.orbitLine = CelestialBody.createOrbitLine(this.orbit.samplePath(720), data.color, { opacity: 0.16 });
    }

    createTails(pixelRatio) {
        const ion = 7000;
        const dust = 11000;
        const count = ion + dust;
        const seeds = new Float32Array(count);
        const kinds = new Float32Array(count);
        const jitter = new Float32Array(count * 3);
        const v = new THREE.Vector3();
        for (let k = 0; k < count; k++) {
            seeds[k] = Math.random();
            kinds[k] = Math.random() < ion / count ? 0 : 1; // mezclados, para poder recortar el total
            v.randomDirection().multiplyScalar(Math.pow(Math.random(), 0.6));
            jitter.set([v.x, v.y, v.z], k * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
        geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
        geometry.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uLength: { value: 0 },
                uActivity: { value: 0 },
                uAnti: { value: new THREE.Vector3(1, 0, 0) },
                uBack: { value: new THREE.Vector3(0, 0, 1) },
                uPixelRatio: { value: pixelRatio },
            },
            vertexShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_vertex>
                attribute float aSeed;
                attribute float aKind;
                attribute vec3 aJitter;
                uniform float uTime;
                uniform float uLength;
                uniform float uActivity;
                uniform vec3 uAnti;
                uniform vec3 uBack;
                uniform float uPixelRatio;
                varying float vAlpha;
                varying float vKind;

                void main() {
                    bool isIon = aKind < 0.5;
                    float t = fract(aSeed + uTime * (isIon ? 0.22 : 0.07));
                    vec3 pos;
                    if (isIon) {
                        pos = uAnti * t * uLength * 1.35 + aJitter * (0.03 + t * 0.22) * uLength * 0.08;
                    } else {
                        vec3 dir = normalize(uAnti + uBack * t * 1.1);
                        pos = dir * t * uLength + aJitter * (0.06 + t * 0.9) * uLength * 0.07;
                    }
                    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mv;
                    float size = (isIon ? 0.9 : 1.5) * uPixelRatio * (40.0 / -mv.z) * (1.0 + t * 1.5);
                    gl_PointSize = clamp(size, 1.0, 24.0);
                    vAlpha = uActivity * pow(1.0 - t, 1.4) * (isIon ? 0.22 : 0.12) * clamp(size, 0.25, 1.0);
                    vKind = aKind;
                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_fragment>
                varying float vAlpha;
                varying float vKind;
                void main() {
                    #include <logdepthbuf_fragment>
                    float d = length(gl_PointCoord - 0.5);
                    float a = smoothstep(0.5, 0.0, d) * vAlpha;
                    vec3 color = vKind < 0.5 ? vec3(0.45, 0.72, 1.0) : vec3(1.0, 0.9, 0.74);
                    gl_FragColor = vec4(color * a * 1.6, a);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        return points;
    }

    setDensity(fraction) {
        const geometry = this.tails.geometry;
        geometry.setDrawRange(0, Math.floor(geometry.attributes.aSeed.count * fraction));
    }

    get viewDistance() {
        return 6 + 20 * this.activity;
    }

    get minDistance() {
        return 0.5;
    }

    update(ctx) {
        this.orbit.positionAU(ctx.days, this.positionAU);
        OrbitalElements.toScene(this.positionAU, this.root.position);

        // Dirección del movimiento (para curvar la cola de polvo).
        this.orbit.positionAU(ctx.days + 1, this.tmp);
        OrbitalElements.toScene(this.tmp, this.tmp);
        const back = this.root.position.clone().sub(this.tmp).normalize();
        const anti = this.root.position.clone().normalize();

        const r = this.positionAU.length();
        this.activity = THREE.MathUtils.clamp(Math.pow(1.7 / r, 2) - 0.2, 0, 1);

        const u = this.tails.material.uniforms;
        u.uTime.value = ctx.elapsed;
        u.uLength.value = 26 * this.activity;
        u.uActivity.value = this.activity;
        u.uAnti.value.copy(anti);
        u.uBack.value.copy(back);
        this.tails.visible = this.activity > 0.01;

        const comaSize = 0.5 + this.activity * 3.5;
        this.coma.scale.setScalar(comaSize);
        this.coma.material.opacity = 0.35 + this.activity * 0.65;
        this.nucleus.rotation.y += 0.01;
    }

    getLiveStats({ earth }) {
        const r = this.positionAU.length();
        const speed = Math.sqrt(GM_SUN * (2 / (r * AU_KM) - 1 / (this.orbit.a * AU_KM)));
        const d = this.positionAU.distanceTo(earth.positionAU);
        return [
            ['Distancia al Sol', `${r.toFixed(3)} UA · ${formatMillions(r * AU_KM)}`],
            ['Velocidad', `${speed.toFixed(1)} km/s`],
            ['Distancia a la Tierra', `${d.toFixed(3)} UA · luz: ${formatLightTime(d)}`],
            ['Actividad', `${Math.round(this.activity * 100)} %`],
        ];
    }
}
