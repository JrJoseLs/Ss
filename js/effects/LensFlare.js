import * as THREE from 'three';

function canvasTexture(size, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const textures = {
    glow: () => canvasTexture(256, (ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.2, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
    }),
    ring: () => canvasTexture(256, (ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.75, 'rgba(255,255,255,0.5)');
        g.addColorStop(0.85, 'rgba(255,255,255,0.15)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
    }),
    hex: () => canvasTexture(128, (ctx, s) => {
        ctx.filter = 'blur(3px)';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
            ctx.lineTo(s / 2 + Math.cos(a) * s * 0.42, s / 2 + Math.sin(a) * s * 0.42);
        }
        ctx.closePath();
        ctx.fill();
    }),
    streak: () => canvasTexture(256, (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, s * 0.47, s, s * 0.06);
    }),
};

/**
 * Destello de lente cinematográfico. Se dibuja en una escena 2D aparte,
 * alineado en la recta que une el Sol en pantalla con el centro, y se apaga
 * suavemente cuando un planeta o una luna tapa el Sol.
 */
export class LensFlare {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
        this.visibility = 0;
        this.enabled = true;

        const t = Object.fromEntries(Object.entries(textures).map(([k, make]) => [k, make()]));
        const spec = [
            { tex: t.glow, size: [0.55, 0.55], at: 0, color: 0xffd9a0, opacity: 0.14 },
            { tex: t.streak, size: [1.6, 0.16], at: 0, color: 0xffc98a, opacity: 0.12 },
            { tex: t.hex, size: [0.05, 0.05], at: 0.3, color: 0x7fb8ff, opacity: 0.25 },
            { tex: t.hex, size: [0.09, 0.09], at: 0.5, color: 0xa0ffb0, opacity: 0.18 },
            { tex: t.glow, size: [0.05, 0.05], at: 0.7, color: 0xffb070, opacity: 0.4 },
            { tex: t.ring, size: [0.22, 0.22], at: 0.9, color: 0x9fc8ff, opacity: 0.18 },
            { tex: t.hex, size: [0.16, 0.16], at: 1.25, color: 0xff9f8f, opacity: 0.14 },
            { tex: t.ring, size: [0.5, 0.5], at: 1.6, color: 0xffe0a0, opacity: 0.1 },
        ];

        this.elements = spec.map((s) => {
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial({
                    map: s.tex,
                    color: s.color,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthTest: false,
                    depthWrite: false,
                    toneMapped: false,
                }),
            );
            mesh.scale.set(s.size[0], s.size[1], 1);
            this.scene.add(mesh);
            return { mesh, ...s };
        });

        this.ndc = new THREE.Vector3();
        this.toSun = new THREE.Vector3();
        this.forward = new THREE.Vector3();
        this.center = new THREE.Vector3();
    }

    resize(aspect) {
        this.aspect = aspect;
        this.camera.left = -aspect;
        this.camera.right = aspect;
        this.camera.updateProjectionMatrix();
    }

    /** ¿Algún cuerpo se interpone entre la cámara y el centro del Sol? */
    isOccluded(camera, sunRadius, occluders) {
        const origin = camera.position;
        this.toSun.copy(origin).negate();
        const distance = this.toSun.length();
        if (distance < sunRadius) return true;
        this.toSun.divideScalar(distance);
        for (const body of occluders) {
            body.getWorldPosition(this.center).sub(origin);
            const along = this.center.dot(this.toSun);
            if (along <= 0 || along >= distance) continue;
            const perp = this.center.addScaledVector(this.toSun, -along).length();
            if (perp < body.radius) return true;
        }
        return false;
    }

    update(camera, sunRadius, occluders, dt) {
        this.ndc.set(0, 0, 0).project(camera);
        camera.getWorldDirection(this.forward);
        const inFront = this.forward.dot(this.toSun.copy(camera.position).negate()) > 0;

        const edge = Math.max(Math.abs(this.ndc.x), Math.abs(this.ndc.y));
        let target = 0;
        if (this.enabled && inFront && edge < 1.3 && !this.isOccluded(camera, sunRadius, occluders)) {
            target = 1 - THREE.MathUtils.smoothstep(edge, 0.85, 1.3);
            // Discreto si el Sol se ve diminuto (muy lejos) o si llena la pantalla (muy cerca).
            const apparent = sunRadius / camera.position.length();
            target *= THREE.MathUtils.smoothstep(apparent, 0.005, 0.03);
            target *= 1 - THREE.MathUtils.smoothstep(apparent, 0.12, 0.45);
        }
        this.visibility = THREE.MathUtils.damp(this.visibility, target, 8, dt);
        this.scene.visible = this.visibility > 0.002;
        if (!this.scene.visible) return;

        const sx = this.ndc.x * this.aspect;
        const sy = this.ndc.y;
        for (const el of this.elements) {
            const k = 1 - el.at;
            el.mesh.position.set(sx * k, sy * k, 0);
            el.mesh.material.opacity = el.opacity * this.visibility;
        }
    }
}
