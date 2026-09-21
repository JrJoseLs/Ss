import * as THREE from 'three';
import { SCALE, auToScene } from '../config.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Genera los elementos orbitales de un cuerpo menor dentro de un cinturón. */
function randomOrbit({ innerAU, outerAU, maxE, maxIncl, gaps = [] }) {
    let a;
    do {
        a = innerAU + Math.random() * (outerAU - innerAU);
    } while (gaps.some(([center, width]) => Math.abs(a - center) < width && Math.random() < 0.85));
    return {
        a,
        e: Math.random() * maxE,
        M0: Math.random() * TAU,
        n: TAU / (365.25 * Math.pow(a, 1.5)), // tercera ley de Kepler
        incl: Math.pow(Math.random(), 2) * maxIncl * DEG * (Math.random() < 0.5 ? -1 : 1),
        node: Math.random() * TAU,
    };
}

/** Posición aproximada (ecuación del centro a 2º orden) ya en escala de escena. */
function orbitPosition(o, days, target) {
    const M = o.M0 + o.n * days;
    const E = M + o.e * Math.sin(M) + 0.5 * o.e * o.e * Math.sin(2 * M);
    const xp = o.a * (Math.cos(E) - o.e);
    const yp = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
    const r = Math.hypot(xp, yp);
    const s = auToScene(r) / r;
    const cn = Math.cos(o.node), sn = Math.sin(o.node);
    const ci = Math.cos(o.incl), si = Math.sin(o.incl);
    const x = cn * xp - sn * ci * yp;
    const y = sn * xp + cn * ci * yp;
    const z = si * yp;
    return target.set(x * s, z * s, -y * s);
}

/**
 * Cinturón de miles de partículas. Cada una sigue su propia órbita
 * kepleriana, calculada en la GPU: no cuesta nada a la CPU.
 */
export class ParticleBelt {
    constructor({ count, color, size = 1, opacity = 0.6, pixelRatio = 1, ...orbitCfg }) {
        const orbitAttr = new Float32Array(count * 4);
        const planeAttr = new Float32Array(count * 3);
        const shade = new Float32Array(count);
        for (let k = 0; k < count; k++) {
            const o = randomOrbit(orbitCfg);
            orbitAttr.set([o.a, o.e, o.M0, o.n], k * 4);
            planeAttr.set([o.incl, o.node, 0.4 + Math.random() * 1.2], k * 3);
            shade[k] = 0.6 + Math.random() * 0.6;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute('aOrbit', new THREE.BufferAttribute(orbitAttr, 4));
        geometry.setAttribute('aPlane', new THREE.BufferAttribute(planeAttr, 3));
        geometry.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uDays: { value: 0 },
                uK: { value: SCALE.DIST_K },
                uP: { value: SCALE.DIST_P },
                uSize: { value: size },
                uOpacity: { value: opacity },
                uColor: { value: new THREE.Color(color) },
                uPixelRatio: { value: pixelRatio },
            },
            vertexShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_vertex>
                attribute vec4 aOrbit;
                attribute vec3 aPlane;
                attribute float aShade;
                uniform float uDays;
                uniform float uK;
                uniform float uP;
                uniform float uSize;
                uniform float uPixelRatio;
                varying float vAlpha;
                varying float vShade;

                void main() {
                    float e = aOrbit.y;
                    float M = aOrbit.z + mod(aOrbit.w * uDays, 6.28318530718);
                    float E = M + e * sin(M) + 0.5 * e * e * sin(2.0 * M);
                    float xp = aOrbit.x * (cos(E) - e);
                    float yp = aOrbit.x * sqrt(1.0 - e * e) * sin(E);
                    float r = length(vec2(xp, yp));
                    float s = uK * pow(r, uP) / r;
                    float cn = cos(aPlane.y), sn = sin(aPlane.y);
                    float ci = cos(aPlane.x), si = sin(aPlane.x);
                    vec3 pos = vec3(cn * xp - sn * ci * yp, si * yp, -(sn * xp + cn * ci * yp)) * s;

                    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mv;
                    float size = aPlane.z * uSize * uPixelRatio * (70.0 / -mv.z);
                    gl_PointSize = clamp(size, 1.0, 3.5);
                    vAlpha = clamp(size, 0.15, 1.0);
                    vShade = aShade;
                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_fragment>
                uniform vec3 uColor;
                uniform float uOpacity;
                varying float vAlpha;
                varying float vShade;
                void main() {
                    #include <logdepthbuf_fragment>
                    float d = length(gl_PointCoord - 0.5);
                    float a = smoothstep(0.5, 0.15, d) * vAlpha * uOpacity;
                    gl_FragColor = vec4(uColor * vShade, a);
                    #include <colorspace_fragment>
                }
            `,
            transparent: true,
            depthWrite: false,
        });

        this.count = count;
        this.points = new THREE.Points(geometry, this.material);
        this.points.frustumCulled = false;
    }

    /** Dibuja solo una fracción de las partículas (calidad gráfica). */
    setDensity(fraction) {
        this.points.geometry.setDrawRange(0, Math.floor(this.count * fraction));
    }

    get object() {
        return this.points;
    }

    update(ctx) {
        this.material.uniforms.uDays.value = ctx.days;
    }
}

/**
 * Rocas 3D del cinturón principal: una sola malla instanciada con cientos
 * de asteroides irregulares que giran sobre sí mismos.
 */
export class AsteroidField {
    constructor({ count = 900, innerAU = 2.15, outerAU = 3.3 } = {}) {
        const geometry = new THREE.IcosahedronGeometry(1, 2);
        const pos = geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let k = 0; k < pos.count; k++) {
            v.fromBufferAttribute(pos, k);
            const d = 1 + 0.25 * Math.sin(v.x * 4.1 + 1.1) * Math.sin(v.y * 3.7) * Math.sin(v.z * 4.9 + 0.3);
            v.multiplyScalar(d);
            pos.setXYZ(k, v.x, v.y, v.z);
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ color: 0x8d8378, roughness: 0.95, metalness: 0, flatShading: true });
        this.mesh = new THREE.InstancedMesh(geometry, material, count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;

        const gaps = [[2.5, 0.03], [2.82, 0.03], [2.95, 0.02]];
        this.rocks = Array.from({ length: count }, () => ({
            orbit: randomOrbit({ innerAU, outerAU, maxE: 0.18, maxIncl: 14, gaps }),
            scale: new THREE.Vector3(1 + Math.random() * 0.6, 0.7 + Math.random() * 0.4, 0.8 + Math.random() * 0.5)
                .multiplyScalar(0.05 + Math.pow(Math.random(), 4) * 0.28),
            axis: new THREE.Vector3().randomDirection(),
            spin: (Math.random() - 0.5) * 6,
        }));

        const shade = new THREE.Color();
        this.rocks.forEach((_, k) => {
            shade.setHSL(0.07 + Math.random() * 0.05, 0.12, 0.35 + Math.random() * 0.3);
            this.mesh.setColorAt(k, shade);
        });

        this.dummy = new THREE.Object3D();
        this.position = new THREE.Vector3();
    }

    get object() {
        return this.mesh;
    }

    setDensity(fraction) {
        this.mesh.count = Math.max(1, Math.floor(this.rocks.length * fraction));
    }

    update(ctx) {
        const { dummy } = this;
        for (let k = 0; k < this.mesh.count; k++) {
            const rock = this.rocks[k];
            orbitPosition(rock.orbit, ctx.days, dummy.position);
            dummy.quaternion.setFromAxisAngle(rock.axis, rock.spin * ctx.elapsed * 0.3);
            dummy.scale.copy(rock.scale);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(k, dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
