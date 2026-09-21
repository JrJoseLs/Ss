import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/**
 * Avanza un ángulo de rotación hacia su valor exacto sin superar `maxStep`
 * radianes por fotograma. Con el tiempo muy acelerado, un giro real de cientos
 * de vueltas por segundo produciría un efecto estroboscópico; así el giro se
 * mantiene fluido y, al frenar, converge suavemente al ángulo correcto.
 */
export function stepAngle(current, exact, exactDelta, maxStep = 0.12) {
    let next;
    if (Math.abs(exactDelta) > maxStep) {
        next = current + Math.sign(exactDelta) * maxStep;
    } else {
        let diff = (exact - current) % TAU;
        if (diff > Math.PI) diff -= TAU;
        if (diff < -Math.PI) diff += TAU;
        next = current + THREE.MathUtils.clamp(diff, -maxStep, maxStep);
    }
    return next % TAU;
}

/**
 * Clase base de todo astro de la escena: Sol, planetas, lunas y cometas.
 * Define la jerarquía de nodos, la etiqueta en pantalla y la interfaz común
 * que usan la cámara y el panel de información (polimorfismo).
 */
export class CelestialBody {
    /**
     * @param {object} p
     * @param {string} p.id
     * @param {string} p.name
     * @param {string} p.color   color de la etiqueta y de la órbita
     * @param {object} p.info    textos del panel de información
     * @param {number} p.radius  radio en unidades de escena
     * @param {'star'|'planet'|'dwarf'|'moon'|'comet'} p.kind
     */
    constructor({ id, name, color = '#ffffff', info, radius, kind }) {
        if (new.target === CelestialBody) {
            throw new TypeError('CelestialBody es abstracta: instancia Sun, Planet, Moon o Comet.');
        }
        this.id = id;
        this.name = name;
        this.color = color;
        this.info = info;
        this.radius = radius;
        this.kind = kind;

        this.root = new THREE.Group();
        this.root.name = name;
        this.pickables = [];
        this.satellites = [];
        this.orbitLine = null;
        this.label = null;
    }

    /** Crea la etiqueta HTML que sigue al astro por la pantalla. */
    createLabel(onSelect, variant = '') {
        const element = document.createElement('div');
        element.className = `label ${variant}`.trim();
        element.textContent = this.name;
        element.style.setProperty('--dot', this.color);
        element.addEventListener('pointerdown', (event) => event.stopPropagation());
        element.addEventListener('click', (event) => {
            event.stopPropagation();
            onSelect(this);
        });

        this.label = new CSS2DObject(element);
        this.label.position.set(0, this.radius, 0);
        this.label.center.set(0.5, 1);
        this.root.add(this.label);
        return this.label;
    }

    setLabelVisible(visible) {
        this.label?.element.classList.toggle('is-hidden', !visible);
    }

    setSelected(selected) {
        this.label?.element.classList.toggle('active', selected);
        if (this.orbitLine) {
            this.orbitLine.material.opacity = selected ? this.orbitLine.userData.selectedOpacity : this.orbitLine.userData.baseOpacity;
        }
    }

    /** Registra una malla como seleccionable con el ratón. */
    makePickable(mesh) {
        mesh.userData.body = this;
        this.pickables.push(mesh);
    }

    getWorldPosition(target = new THREE.Vector3()) {
        return this.root.getWorldPosition(target);
    }

    /** Distancia a la que se sitúa la cámara al viajar a este astro. */
    get viewDistance() {
        return this.radius * 4.5;
    }

    /** Distancia mínima de zoom. */
    get minDistance() {
        return this.radius * 1.35;
    }

    /** Datos que cambian con el tiempo, para el panel de información. */
    getLiveStats() {
        return [];
    }

    /** Se llama en cada fotograma. `ctx` contiene tiempo, cámara, etc. */
    update(ctx) {} // eslint-disable-line no-unused-vars

    /** Crea una línea de órbita semitransparente. */
    static createOrbitLine(points, color, { closed = true, opacity = 0.22 } = {}) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
        });
        const line = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
        line.userData.baseOpacity = opacity;
        line.userData.selectedOpacity = Math.min(1, opacity * 3);
        line.renderOrder = -1;
        return line;
    }
}
