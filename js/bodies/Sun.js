import * as THREE from 'three';
import { CelestialBody, stepAngle, TAU } from './CelestialBody.js';
import { SUN_DATA } from '../data/solarSystemData.js';
import { SCALE } from '../config.js';
import { standardVertex, noise3D } from '../shaders/chunks.js';
import { poleDirection, poleQuaternion } from '../core/Frames.js';

/** Superficie solar: textura real deformada por turbulencia, granulación y oscurecimiento del limbo. */
class SunSurfaceMaterial extends THREE.ShaderMaterial {
    constructor(map) {
        super({
            uniforms: {
                uMap: { value: map },
                uTime: { value: 0 },
                uIntensity: { value: 1.9 },
            },
            vertexShader: standardVertex,
            fragmentShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_fragment>
                varying vec2 vUv;
                varying vec3 vWorldPos;
                varying vec3 vWorldNormal;
                varying vec3 vObjNormal;
                uniform sampler2D uMap;
                uniform float uTime;
                uniform float uIntensity;
                ${noise3D}

                void main() {
                    #include <logdepthbuf_fragment>
                    vec3 p = normalize(vObjNormal);
                    float n1 = fbm(p * 3.0 + vec3(0.0, uTime * 0.02, uTime * 0.015));
                    float n2 = fbm(p * 9.0 + n1 * 1.5 + vec3(uTime * 0.035));
                    vec3 tex = texture2D(uMap, vUv + vec2(n1, n2) * 0.01).rgb;
                    float granules = snoise(p * 70.0 + vec3(uTime * 0.12)) * 0.5 + 0.5;

                    float heat = dot(tex, vec3(0.55, 0.4, 0.05)) * 1.5 + n2 * 0.3 + granules * 0.18;
                    vec3 color = mix(vec3(0.9, 0.22, 0.02), vec3(1.0, 0.62, 0.18), smoothstep(0.15, 0.7, heat));
                    color = mix(color, vec3(1.0, 0.93, 0.75), smoothstep(0.75, 1.25, heat));

                    vec3 V = normalize(cameraPosition - vWorldPos);
                    float mu = max(dot(normalize(vWorldNormal), V), 0.0);
                    float limb = 1.0 - 0.55 * (1.0 - mu);
                    color *= limb * vec3(1.0, 0.92 + 0.08 * mu, 0.78 + 0.22 * mu);

                    gl_FragColor = vec4(color * uIntensity, 1.0);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `,
        });
    }
}

/** Corona: un plano orientado a la cámara con resplandor y rayos animados. */
class CoronaMaterial extends THREE.ShaderMaterial {
    constructor(extent) {
        super({
            uniforms: {
                uTime: { value: 0 },
                uExtent: { value: extent },
                uIntensity: { value: 1 },
            },
            vertexShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_vertex>
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_fragment>
                varying vec2 vUv;
                uniform float uTime;
                uniform float uExtent;
                uniform float uIntensity;
                ${noise3D}

                void main() {
                    #include <logdepthbuf_fragment>
                    vec2 c = vUv * 2.0 - 1.0;
                    float r = length(c) * uExtent;          // en radios solares
                    if (r < 0.95) discard;
                    vec2 dir = c / max(length(c), 1e-4);
                    float h = max(r - 1.0, 0.0);

                    float glow = exp(-h * 3.2) * 1.1 + exp(-h * 1.1) * 0.14;
                    float rays = fbm(vec3(dir * 3.2, uTime * 0.04 - h * 0.12)) * 0.5 + 0.5;
                    rays = pow(rays, 3.0) * exp(-h * 0.8) * 1.3;
                    float edge = 1.0 - smoothstep(uExtent * 0.55, uExtent * 0.98, r);

                    vec3 color = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.82, 0.55), exp(-h * 2.0));
                    gl_FragColor = vec4(color * (glow + rays) * edge * uIntensity, 1.0);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    }
}

export class Sun extends CelestialBody {
    constructor(assets) {
        super({ ...SUN_DATA, radius: SCALE.SUN_RADIUS, kind: 'star' });
        this.rotationPeriodDays = SUN_DATA.rotationPeriodDays;
        this.spin = 0;

        this.surface = new THREE.Mesh(
            new THREE.SphereGeometry(this.radius, 128, 64),
            new SunSurfaceMaterial(assets.texture('sun.webp')),
        );
        // El ecuador solar está inclinado 7.25° respecto a la eclíptica.
        this.axis = new THREE.Group();
        poleQuaternion(poleDirection(...SUN_DATA.pole), this.axis.quaternion);
        this.axis.add(this.surface);
        this.root.add(this.axis);
        this.makePickable(this.surface);

        const extent = 5;
        this.corona = new THREE.Mesh(
            new THREE.PlaneGeometry(this.radius * extent * 2, this.radius * extent * 2),
            new CoronaMaterial(extent),
        );
        this.corona.renderOrder = 2;
        this.root.add(this.corona);

        // Luz para los objetos que usan materiales estándar (asteroides, núcleo del cometa).
        this.light = new THREE.PointLight(0xfff1dc, 3.2, 0, 0);
        this.root.add(this.light);
    }

    get viewDistance() {
        return this.radius * 6;
    }

    /** Tamaño aparente (radio / distancia a la cámara). */
    apparentSize(camera) {
        return this.radius / Math.max(camera.position.length(), 1e-3);
    }

    getLiveStats({ earth }) {
        const au = earth.positionAU.length();
        return [
            ['Distancia a la Tierra', `${au.toFixed(4)} UA`],
            ['Luz hasta la Tierra', `${(au * 499.005 / 60).toFixed(2)} min`],
        ];
    }

    update(ctx) {
        const exact = (TAU * ctx.days) / this.rotationPeriodDays;
        this.spin = stepAngle(this.spin, exact, (TAU * ctx.deltaDays) / this.rotationPeriodDays, 0.02);
        this.surface.rotation.y = this.spin;
        this.surface.material.uniforms.uTime.value = ctx.elapsed;
        this.corona.material.uniforms.uTime.value = ctx.elapsed;
        this.corona.quaternion.copy(ctx.camera.quaternion);
        // De cerca, la corona se atenúa para que se aprecie la superficie.
        const near = THREE.MathUtils.smoothstep(this.apparentSize(ctx.camera), 0.04, 0.2);
        this.corona.material.uniforms.uIntensity.value = 1 - near * 0.55;
    }
}
