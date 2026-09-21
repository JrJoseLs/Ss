/**
 * Fragmentos GLSL compartidos por los materiales propios.
 */

/** Vértice estándar: pasa UV, posición y normal en espacio mundo. */
export const standardVertex = /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_vertex>

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec3 vObjNormal;

    void main() {
        vUv = uv;
        vObjNormal = normal;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
        #include <logdepthbuf_vertex>
    }
`;

/**
 * Relieve a partir de la propia textura de color (luminancia como altura),
 * usando la base tangente analítica de una esfera.
 */
export const bumpFromMap = /* glsl */ `
    uniform mat4 modelMatrix;

    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    vec3 bumpNormal(sampler2D tex, vec2 uv, vec2 texel, vec3 objN, float strength) {
        vec3 t = cross(vec3(0.0, 1.0, 0.0), objN);
        t = length(t) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(t);
        vec3 b = cross(objN, t);
        float h0 = lum(texture2D(tex, uv).rgb);
        float hu = lum(texture2D(tex, uv + vec2(texel.x, 0.0)).rgb);
        float hv = lum(texture2D(tex, uv + vec2(0.0, texel.y)).rgb);
        vec3 n = normalize(objN - strength * ((hu - h0) * t + (hv - h0) * b));
        return normalize(mat3(modelMatrix) * n);
    }
`;

/** Sombra que proyectan los anillos sobre el planeta. */
export const ringShadow = /* glsl */ `
    uniform bool uHasRings;
    uniform sampler2D uRingMap;
    uniform vec3 uRingNormal;
    uniform vec3 uPlanetCenter;
    uniform float uRingInner;
    uniform float uRingOuter;
    uniform float uRingOpacity;

    float ringShadowFactor(vec3 worldPos) {
        if (!uHasRings) return 1.0;
        vec3 L = normalize(-worldPos);
        float denom = dot(L, uRingNormal);
        if (abs(denom) < 1e-4) return 1.0;
        float t = dot(uPlanetCenter - worldPos, uRingNormal) / denom;
        if (t <= 0.0) return 1.0;
        float r = length(worldPos + L * t - uPlanetCenter);
        if (r < uRingInner || r > uRingOuter) return 1.0;
        float a = texture2D(uRingMap, vec2((r - uRingInner) / (uRingOuter - uRingInner), 0.5)).a;
        return 1.0 - a * uRingOpacity * 0.9;
    }
`;

/** Ruido simplex 3D (Ashima Arts / Stefan Gustavson, licencia MIT) y fbm. */
export const noise3D = /* glsl */ `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    float fbm(vec3 p) {
        float sum = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 5; i++) {
            sum += amp * snoise(p);
            p *= 2.03;
            amp *= 0.5;
        }
        return sum;
    }
`;
