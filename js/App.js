import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { AssetLoader } from './core/AssetLoader.js';
import { SimulationClock } from './core/SimulationClock.js';
import { CameraDirector } from './core/CameraDirector.js';
import { SolarSystem } from './SolarSystem.js';
import { Starfield } from './effects/Starfield.js';
import { LensFlare } from './effects/LensFlare.js';
import { UserInterface } from './ui/UserInterface.js';
import { QualityManager } from './core/QualityManager.js';

/** Viñeta y grano de película sutiles, para un acabado cinematográfico. */
const CinematicShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        varying vec2 vUv;
        float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float vignette = smoothstep(0.95, 0.25, length(vUv - 0.5) * 1.15);
            color.rgb *= mix(0.5, 1.0, vignette);
            color.rgb += (rand(vUv * 1.7 + fract(uTime)) - 0.5) * 0.016;
            gl_FragColor = color;
        }
    `,
};

/**
 * Aplicación principal: crea el renderizador, la escena, la cámara y el
 * postprocesado, conecta el modelo con la interfaz y ejecuta el bucle de
 * animación.
 */
export class App {
    constructor(container) {
        this.container = container;
        this.options = { orbits: true, labels: true, bloom: true };
        this.selected = null;
        this.elapsed = 0;
        this.pixelRatio = Math.min(window.devicePixelRatio, 2);
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.createRenderer();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.01, 30000);
        this.camera.position.set(-1500, 1100, 3400);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        Object.assign(this.controls, {
            enableDamping: true,
            dampingFactor: 0.06,
            rotateSpeed: 0.5,
            zoomSpeed: 0.9,
            panSpeed: 0.6,
            minDistance: 5,
            maxDistance: 4000,
        });

        this.assets = new AssetLoader(this.renderer);
        this.clock = new SimulationClock();
        this.system = new SolarSystem(this.scene, this.assets, {
            pixelRatio: this.pixelRatio,
            onSelect: (body) => this.select(body),
        });
        this.starfield = new Starfield(this.assets, this.pixelRatio, this.scene);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.05));

        this.director = new CameraDirector(this.camera, this.controls);
        this.director.durationScale = this.reducedMotion ? 0.35 : 1;
        this.flare = new LensFlare();
        this.createPostprocessing();
        this.quality = new QualityManager(this);
        this.ui = new UserInterface(this);

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.bindPointer();
        this.resize();
        this.quality.apply();
        window.addEventListener('resize', () => this.resize());

        this.viewOffset = new THREE.Vector2();
        this.timer = new THREE.Clock();
    }

    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false, // el antialiasing lo hace el render target con MSAA
            logarithmicDepthBuffer: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.container.appendChild(this.renderer.domElement);

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.domElement.className = 'labels-layer';
        Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0' });
        this.container.appendChild(this.labelRenderer.domElement);
    }

    createPostprocessing() {
        const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
        this.composer = new EffectComposer(this.renderer, target);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const flarePass = new RenderPass(this.flare.scene, this.flare.camera);
        flarePass.clear = false;
        this.composer.addPass(flarePass);

        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.55, 1.4);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

        this.cinematic = new ShaderPass(CinematicShader);
        this.composer.addPass(this.cinematic);
    }

    /** Aplica un nivel de calidad (ver QualityManager). */
    applyQuality(settings) {
        this.pixelRatio = Math.min(window.devicePixelRatio, settings.maxPixelRatio);
        this.renderer.setPixelRatio(this.pixelRatio);
        for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
            if (target.samples !== settings.msaa) {
                target.samples = settings.msaa;
                target.dispose(); // se recrea con el nuevo MSAA en el siguiente render
            }
        }
        this.bloom.enabled = settings.bloom && this.options.bloom;
        this.cinematic.enabled = settings.cinematic;
        this.system.setDensity(settings.particles);
        this.scene.traverse((object) => {
            const uniform = object.material?.uniforms?.uPixelRatio;
            if (uniform) uniform.value = this.pixelRatio;
        });
        document.body.classList.toggle('no-blur', !settings.blur);
        this.resize();
    }

    /** Sube texturas y compila shaders antes de empezar, para evitar tirones. */
    async prepare() {
        try {
            await this.renderer.compileAsync(this.scene, this.camera);
        } catch (error) {
            console.warn('No se pudieron precompilar los shaders', error);
        }
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setPixelRatio(this.pixelRatio);
        this.composer.setSize(w, h);
        this.labelRenderer.setSize(w, h);
        this.flare.resize(w / h);
    }

    bindPointer() {
        const el = this.renderer.domElement;
        let down = null;
        el.addEventListener('pointerdown', (e) => {
            down = { x: e.clientX, y: e.clientY, t: performance.now() };
        });
        el.addEventListener('pointerup', (e) => {
            if (!down) return;
            const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
            const quick = performance.now() - down.t < 450;
            down = null;
            if (moved < 6 && quick) {
                const body = this.pick(e.clientX, e.clientY);
                if (body) this.select(body);
                else if (this.ui.immersive) this.ui.setImmersive(false); // tocar el vacío devuelve la interfaz
            }
        });
        el.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse' || e.buttons) return;
            this.hoverAt = { x: e.clientX, y: e.clientY };
        });
    }

    pick(x, y) {
        this.pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hit = this.raycaster.intersectObjects(this.system.pickables, false)[0];
        return hit ? hit.object.userData.body : null;
    }

    /** Selecciona un astro: vuela hacia él, lo sigue y muestra su información. */
    select(body) {
        if (!body) return;
        this.selected?.setSelected(false);
        this.selected = body;
        body.setSelected(true);
        this.director.flyTo(body);
        this.ui.showInfo(body);
    }

    /** Salta a una fecha (en pausa, para poder observarla) y enfoca un astro o la vista general. */
    travelTo(ms, focusId) {
        this.clock.setDate(ms);
        if (!this.clock.paused) this.clock.togglePause();
        const body = focusId && this.system.find(focusId);
        if (body) this.select(body);
        else this.overview();
    }

    overview() {
        this.selected?.setSelected(false);
        this.selected = null;
        this.ui.hideInfo();
        this.director.flyToOverview();
    }

    setOption(name, on) {
        this.options[name] = on;
        if (name === 'orbits') this.system.setOrbitsVisible(on);
        if (name === 'bloom') {
            this.bloom.enabled = on && this.quality.settings.bloom;
            this.flare.enabled = on;
        }
    }

    /** Arranca la secuencia de entrada: la cámara llega desde el espacio profundo. */
    begin(focusId = '') {
        const target = focusId && this.system.find(focusId);
        if (target) this.select(target);
        else this.director.flyToOverview(7.5);
        setTimeout(() => this.ui.show(), target ? 1500 : 3800);
    }

    /**
     * Desplaza el encuadre para que el astro seleccionado quede centrado en la
     * zona que no tapa el panel de información (a su izquierda en escritorio,
     * encima en móvil).
     */
    updateViewOffset(dt) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        let tx = 0;
        let ty = 0;
        if (this.ui.current && !this.ui.immersive) {
            const panel = this.ui.panel;
            if (!this.ui.isCompact) {
                // Ficha a la derecha: centra el astro en el espacio libre de la izquierda.
                if (this.ui.infoOpenAndExpanded) tx = (panel.offsetWidth + 24) / 2;
            } else {
                // Hoja inferior: centra el astro en el espacio libre de encima.
                ty = Math.max(0, (h - panel.offsetTop) / 2 - 24);
            }
        }
        this.viewOffset.x = THREE.MathUtils.damp(this.viewOffset.x, tx, 3, dt);
        this.viewOffset.y = THREE.MathUtils.damp(this.viewOffset.y, ty, 3, dt);
        if (Math.abs(this.viewOffset.x) + Math.abs(this.viewOffset.y) > 0.5) {
            this.camera.setViewOffset(w, h, this.viewOffset.x, this.viewOffset.y, w, h);
        } else if (this.camera.view) {
            this.camera.clearViewOffset();
        }
    }

    start() {
        this.renderer.setAnimationLoop(() => this.frame());
    }

    frame() {
        const dt = Math.min(this.timer.getDelta(), 0.1);
        this.elapsed += dt;

        this.clock.update(dt);
        const ctx = {
            days: this.clock.days,
            deltaDays: this.clock.deltaDays,
            elapsed: this.elapsed,
            camera: this.camera,
        };
        this.system.update(ctx);
        this.director.update(dt);
        this.updateViewOffset(dt);
        this.starfield.update(this.camera, this.elapsed);
        this.system.updateLabels(this.camera, this.options.labels && !this.ui.immersive, this.selected, window.innerWidth, window.innerHeight, this.ui.isCompact);
        this.flare.update(this.camera, this.system.sun.radius, this.system.occluders, dt);
        this.cinematic.uniforms.uTime.value = this.elapsed;
        // Bloom adaptativo: si el Sol llena la pantalla, se suaviza para no deslumbrar.
        const near = THREE.MathUtils.smoothstep(this.system.sun.apparentSize(this.camera), 0.03, 0.2);
        this.bloom.strength = 0.9 - near * 0.62;
        this.ui.update(dt);
        this.quality.update(dt);

        if (this.hoverAt) {
            const body = this.director.isFlying ? null : this.pick(this.hoverAt.x, this.hoverAt.y);
            this.renderer.domElement.style.cursor = body ? 'pointer' : '';
            this.hoverAt = null;
        }

        this.composer.render(dt);
        this.labelRenderer.render(this.scene, this.camera);
    }
}
