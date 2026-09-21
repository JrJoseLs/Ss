import * as THREE from 'three';
import { SUN_INTENSITY } from '../config.js';
import { standardVertex, bumpFromMap, ringShadow } from '../shaders/chunks.js';

const fragmentHeader = /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec3 vObjNormal;
`;

const fragmentFooter = /* glsl */ `
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
`;

/**
 * Material de superficie para planetas y lunas.
 * El Sol está en el origen, así que la dirección de la luz sale de la
 * posición del fragmento. Usa el modelo de Minnaert para oscurecer el limbo
 * de los gigantes gaseosos, relieve a partir de la textura y, si hay anillos,
 * calcula la sombra que proyectan sobre el planeta.
 */
export class PlanetMaterial extends THREE.ShaderMaterial {
    constructor({ map, bump = 0, minnaert = 1, tint = [1, 1, 1], rimColor = [0, 0, 0], rimStrength = 0, texel = 1 / 2048 }) {
        super({
            uniforms: {
                uMap: { value: map },
                uTexel: { value: new THREE.Vector2(texel, texel * 2) },
                uBump: { value: bump },
                uMinnaert: { value: minnaert },
                uTint: { value: new THREE.Color(...tint) },
                uSunIntensity: { value: SUN_INTENSITY },
                uAmbient: { value: 0.012 },
                uRimColor: { value: new THREE.Color(...rimColor) },
                uRimStrength: { value: rimStrength },
                uHasRings: { value: false },
                uRingMap: { value: null },
                uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
                uPlanetCenter: { value: new THREE.Vector3() },
                uRingInner: { value: 0 },
                uRingOuter: { value: 0 },
                uRingOpacity: { value: 1 },
            },
            vertexShader: standardVertex,
            fragmentShader: /* glsl */ `
                ${fragmentHeader}
                uniform sampler2D uMap;
                uniform vec2 uTexel;
                uniform float uBump;
                uniform float uMinnaert;
                uniform vec3 uTint;
                uniform float uSunIntensity;
                uniform float uAmbient;
                uniform vec3 uRimColor;
                uniform float uRimStrength;
                ${bumpFromMap}
                ${ringShadow}

                void main() {
                    #include <logdepthbuf_fragment>
                    vec3 albedo = texture2D(uMap, vUv).rgb * uTint;
                    vec3 geoN = normalize(vWorldNormal);
                    vec3 N = uBump > 0.0 ? bumpNormal(uMap, vUv, uTexel, normalize(vObjNormal), uBump) : geoN;
                    vec3 L = normalize(-vWorldPos);
                    vec3 V = normalize(cameraPosition - vWorldPos);

                    float geoNL = dot(geoN, L);
                    float NdL = max(dot(N, L), 0.0) * smoothstep(-0.08, 0.12, geoNL);
                    float NdV = clamp(dot(geoN, V), 0.08, 1.0);
                    float light = min(pow(NdL, uMinnaert) * pow(NdV, uMinnaert - 1.0), 1.6);

                    vec3 color = albedo * (light * uSunIntensity * ringShadowFactor(vWorldPos) + uAmbient);

                    float rim = pow(1.0 - max(dot(geoN, V), 0.0), 3.0) * smoothstep(-0.25, 0.6, geoNL);
                    color += uRimColor * rim * uRimStrength;

                    gl_FragColor = vec4(color, 1.0);
                    ${fragmentFooter}
                }
            `,
        });
    }
}

/**
 * Superficie terrestre: mapa diurno, luces nocturnas en el lado oscuro,
 * brillo especular sobre los océanos, sombra de las nubes y dispersión
 * atmosférica en el borde y en el terminador.
 */
export class EarthMaterial extends THREE.ShaderMaterial {
    constructor({ day, night, specular, normal, clouds }) {
        super({
            uniforms: {
                uDay: { value: day },
                uNight: { value: night },
                uSpecular: { value: specular },
                uNormal: { value: normal },
                uClouds: { value: clouds },
                uCloudOffset: { value: 0 },
                uSunIntensity: { value: SUN_INTENSITY },
            },
            vertexShader: standardVertex,
            fragmentShader: /* glsl */ `
                ${fragmentHeader}
                uniform mat4 modelMatrix;
                uniform sampler2D uDay;
                uniform sampler2D uNight;
                uniform sampler2D uSpecular;
                uniform sampler2D uNormal;
                uniform sampler2D uClouds;
                uniform float uCloudOffset;
                uniform float uSunIntensity;

                void main() {
                    #include <logdepthbuf_fragment>
                    vec3 objN = normalize(vObjNormal);
                    vec3 t = cross(vec3(0.0, 1.0, 0.0), objN);
                    t = length(t) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(t);
                    vec3 b = cross(objN, t);
                    vec3 nm = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
                    vec3 N = normalize(mat3(modelMatrix) * normalize(t * nm.x * 0.8 + b * nm.y * 0.8 + objN * max(nm.z, 0.2)));
                    vec3 geoN = normalize(vWorldNormal);

                    vec3 L = normalize(-vWorldPos);
                    vec3 V = normalize(cameraPosition - vWorldPos);
                    vec3 H = normalize(L + V);
                    float geoNL = dot(geoN, L);
                    float dayMix = smoothstep(-0.12, 0.22, geoNL);

                    vec3 day = texture2D(uDay, vUv).rgb;
                    float ocean = texture2D(uSpecular, vUv).r;
                    float clouds = texture2D(uClouds, vUv - vec2(uCloudOffset, 0.0)).r;
                    float cloudShadow = 1.0 - smoothstep(0.1, 0.9, clouds) * 0.6;

                    float diffuse = max(dot(N, L), 0.0) * smoothstep(-0.1, 0.15, geoNL);
                    vec3 color = day * diffuse * uSunIntensity * cloudShadow;

                    // Reflejo del Sol en el mar: un núcleo nítido y un halo amplio.
                    float NdH = max(dot(geoN, H), 0.0);
                    float spec = (pow(NdH, 90.0) * 1.4 + pow(NdH, 10.0) * 0.07) * ocean * (1.0 - clouds * 0.8);
                    color += vec3(1.0, 0.93, 0.8) * spec * smoothstep(0.0, 0.2, geoNL) * uSunIntensity;

                    // Ciudades iluminadas en el lado nocturno.
                    vec3 night = texture2D(uNight, vUv).rgb;
                    night = pow(night, vec3(1.6)) * vec3(1.0, 0.78, 0.48) * 3.2;
                    color += night * (1.0 - dayMix) * (1.0 - clouds * 0.75);

                    // Luz rojiza del crepúsculo junto al terminador.
                    float twilight = smoothstep(-0.2, 0.0, geoNL) * (1.0 - smoothstep(0.0, 0.25, geoNL));
                    color += vec3(1.0, 0.42, 0.16) * twilight * 0.05;

                    // Neblina azul de la atmósfera, más densa cerca del borde.
                    float fres = pow(1.0 - max(dot(geoN, V), 0.0), 2.4);
                    color = mix(color, vec3(0.32, 0.6, 1.0) * uSunIntensity * 0.9, fres * smoothstep(-0.2, 0.6, geoNL) * 0.7);
                    color += vec3(0.004, 0.006, 0.01);

                    gl_FragColor = vec4(color, 1.0);
                    ${fragmentFooter}
                }
            `,
        });
    }
}

/** Capa de nubes semitransparente, iluminada con un terminador suave. */
export class CloudMaterial extends THREE.ShaderMaterial {
    constructor({ map }) {
        super({
            uniforms: {
                uMap: { value: map },
                uSunIntensity: { value: SUN_INTENSITY },
            },
            vertexShader: standardVertex,
            fragmentShader: /* glsl */ `
                ${fragmentHeader}
                uniform sampler2D uMap;
                uniform float uSunIntensity;

                void main() {
                    #include <logdepthbuf_fragment>
                    float a = smoothstep(0.08, 0.95, texture2D(uMap, vUv).r);
                    vec3 N = normalize(vWorldNormal);
                    vec3 L = normalize(-vWorldPos);
                    float NdL = dot(N, L);
                    float lit = smoothstep(-0.12, 0.35, NdL);
                    vec3 color = mix(vec3(1.0, 0.55, 0.35), vec3(1.0), smoothstep(0.0, 0.3, NdL));
                    color *= lit * uSunIntensity * 0.95;
                    gl_FragColor = vec4(color, a * mix(0.35, 0.95, lit));
                    ${fragmentFooter}
                }
            `,
            transparent: true,
            depthWrite: false,
        });
    }
}

/**
 * Halo atmosférico. Se dibuja la cara interior de una esfera algo mayor que
 * el planeta: el brillo crece hacia el limbo, solo en el lado iluminado, con
 * tonos anaranjados en el terminador y dispersión hacia delante a contraluz.
 */
export class AtmosphereMaterial extends THREE.ShaderMaterial {
    constructor({ color = [0.3, 0.6, 1], scale = 1.04, intensity = 1 }) {
        super({
            uniforms: {
                uColor: { value: new THREE.Color(...color) },
                uIntensity: { value: intensity },
                uEdge: { value: Math.sqrt(1 - 1 / (scale * scale)) },
            },
            vertexShader: standardVertex,
            fragmentShader: /* glsl */ `
                ${fragmentHeader}
                uniform vec3 uColor;
                uniform float uIntensity;
                uniform float uEdge;

                void main() {
                    #include <logdepthbuf_fragment>
                    vec3 N = normalize(vWorldNormal);
                    vec3 V = normalize(cameraPosition - vWorldPos);
                    vec3 L = normalize(-vWorldPos);

                    float t = clamp(-dot(N, V) / uEdge, 0.0, 1.0);
                    float glow = pow(t, 2.4);
                    float sun = dot(N, L);
                    float lit = smoothstep(-0.35, 0.45, sun);
                    float dusk = smoothstep(-0.4, -0.02, sun) * (1.0 - smoothstep(-0.02, 0.35, sun));
                    float forward = pow(max(dot(-V, L), 0.0), 8.0);

                    vec3 color = uColor * glow * lit;
                    color += vec3(1.0, 0.38, 0.12) * glow * dusk * 0.6;
                    color += uColor * glow * forward * 1.5;
                    gl_FragColor = vec4(color * uIntensity, 1.0);
                    ${fragmentFooter}
                }
            `,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
        });
    }
}

/**
 * Anillos planetarios: color y opacidad desde una textura radial, sombra
 * del planeta sobre ellos, cara no iluminada más oscura (luz transmitida) y
 * dispersión hacia delante cuando se miran a contraluz.
 */
export class RingMaterial extends THREE.ShaderMaterial {
    constructor({ map, tint = [1, 1, 1], opacity = 1, brightness = 1 }) {
        super({
            uniforms: {
                uMap: { value: map },
                uTint: { value: new THREE.Color(...tint) },
                uOpacity: { value: opacity },
                uBrightness: { value: brightness },
                uPlanetCenter: { value: new THREE.Vector3() },
                uPlanetRadius: { value: 1 },
                uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
                uSunIntensity: { value: SUN_INTENSITY },
            },
            vertexShader: standardVertex,
            fragmentShader: /* glsl */ `
                ${fragmentHeader}
                uniform sampler2D uMap;
                uniform vec3 uTint;
                uniform float uOpacity;
                uniform float uBrightness;
                uniform vec3 uPlanetCenter;
                uniform float uPlanetRadius;
                uniform vec3 uRingNormal;
                uniform float uSunIntensity;

                void main() {
                    #include <logdepthbuf_fragment>
                    vec4 tex = texture2D(uMap, vec2(vUv.x, 0.5));
                    vec3 L = normalize(-vWorldPos);
                    vec3 V = normalize(cameraPosition - vWorldPos);

                    vec3 oc = vWorldPos - uPlanetCenter;
                    float along = dot(oc, L);
                    float shadow = 1.0;
                    if (along < 0.0) {
                        float d = length(oc - L * along);
                        shadow = smoothstep(uPlanetRadius * 0.97, uPlanetRadius * 1.03, d);
                    }

                    float sunSide = dot(uRingNormal, L);
                    float viewSide = dot(uRingNormal, V);
                    float lit = sunSide * viewSide > 0.0 ? 1.0 : 0.45 * (1.0 - tex.a * 0.6);
                    float elevation = 0.5 + 0.5 * pow(abs(sunSide), 0.35);
                    float forward = pow(max(dot(-V, L), 0.0), 10.0) * 0.8;

                    vec3 color = tex.rgb * uTint * uBrightness * uSunIntensity * (lit * elevation + forward) * shadow;
                    color += tex.rgb * 0.01;
                    gl_FragColor = vec4(color, tex.a * uOpacity);
                    ${fragmentFooter}
                }
            `,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
        });
    }
}
