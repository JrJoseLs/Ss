import * as THREE from 'three';

// Colores aproximados de estrellas según su tipo espectral (O/B azules → M rojas).
const STAR_COLORS = [
    [0.62, 0.72, 1.0, 0.06],
    [0.78, 0.85, 1.0, 0.16],
    [1.0, 1.0, 1.0, 0.3],
    [1.0, 0.95, 0.85, 0.2],
    [1.0, 0.85, 0.65, 0.18],
    [1.0, 0.7, 0.5, 0.1],
];

/**
 * Fondo estelar: la Vía Láctea real y miles de estrellas que titilan. Las
 * estrellas acompañan a la cámara, así que están infinitamente lejos y no
 * presentan paralaje.
 */
export class Starfield {
    constructor(assets, pixelRatio, scene) {
        // La Vía Láctea es el fondo nativo de la escena: sin geometría ni escritura de profundidad.
        const sky = assets.texture('milky_way_4k.webp');
        sky.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = sky;
        scene.backgroundIntensity = 0.3;
        // El plano galáctico está inclinado unos 60° respecto a la eclíptica.
        scene.backgroundRotation.set(THREE.MathUtils.degToRad(-60), 0, THREE.MathUtils.degToRad(12));

        this.group = new THREE.Group();
        this.stars = this.createStars(7000, pixelRatio);
        this.group.add(this.stars);
        scene.add(this.group);
    }

    createStars(count, pixelRatio) {
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const phases = new Float32Array(count);
        const v = new THREE.Vector3();
        const weights = STAR_COLORS.map((c) => c[3]);

        for (let k = 0; k < count; k++) {
            v.randomDirection().multiplyScalar(8000);
            positions.set([v.x, v.y, v.z], k * 3);
            let pick = Math.random();
            let index = 0;
            while (pick > weights[index] && index < weights.length - 1) pick -= weights[index++];
            colors.set(STAR_COLORS[index].slice(0, 3), k * 3);
            // Muchas estrellas débiles y pocas brillantes.
            sizes[k] = 0.6 + Math.pow(Math.random(), 9) * 3.2;
            phases[k] = Math.random() * 100;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: pixelRatio },
            },
            vertexShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_vertex>
                attribute vec3 aColor;
                attribute float aSize;
                attribute float aPhase;
                uniform float uTime;
                uniform float uPixelRatio;
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mv;
                    float twinkle = 0.75 + 0.25 * sin(uTime * (1.3 + fract(aPhase) * 2.5) + aPhase);
                    gl_PointSize = max(aSize * uPixelRatio * 1.6, 1.0);
                    vColor = aColor;
                    vAlpha = twinkle * min(aSize, 1.0);
                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: /* glsl */ `
                #include <common>
                #include <logdepthbuf_pars_fragment>
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    #include <logdepthbuf_fragment>
                    float d = length(gl_PointCoord - 0.5);
                    float core = smoothstep(0.5, 0.0, d);
                    float a = core * core * vAlpha;
                    gl_FragColor = vec4(vColor * a * 1.4, a);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        points.renderOrder = -9;
        return points;
    }

    update(camera, elapsed) {
        this.group.position.copy(camera.position);
        this.stars.material.uniforms.uTime.value = elapsed;
    }
}
