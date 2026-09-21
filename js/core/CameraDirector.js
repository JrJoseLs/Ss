import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Dirige la cámara: vuelos suaves en arco hacia cualquier astro, seguimiento
 * del astro seleccionado mientras orbita y regreso a la vista general.
 */
export class CameraDirector {
    constructor(camera, controls) {
        this.camera = camera;
        this.controls = controls;
        this.focus = null;
        this.flight = null;
        this.lastFocusPos = new THREE.Vector3();
        this.tmp = new THREE.Vector3();
        this.overviewPosition = new THREE.Vector3(-70, 290, 560);
    }

    get isFlying() {
        return this.flight !== null;
    }

    /** Vuela hacia un astro y lo encuadra con su cara iluminada en tres cuartos. */
    flyTo(body, duration = 3.2) {
        const bodyPos = body.getWorldPosition(new THREE.Vector3());
        let dir;
        if (bodyPos.lengthSq() < 1e-6) {
            dir = this.camera.position.clone().normalize();
            dir.y = Math.max(dir.y, 0.25);
            dir.normalize();
        } else {
            const toSun = bodyPos.clone().negate().normalize();
            const side = new THREE.Vector3().crossVectors(toSun, UP).normalize();
            dir = toSun.multiplyScalar(0.55).add(side.multiplyScalar(0.8)).add(new THREE.Vector3(0, 0.3, 0)).normalize();
        }
        // En pantallas verticales el campo de visión horizontal es estrecho: alejarse más.
        const aspectFactor = Math.max(1, 0.85 / this.camera.aspect);
        this.start({
            body,
            duration,
            offset: dir.multiplyScalar(body.viewDistance * aspectFactor),
            minDistance: body.minDistance,
        });
    }

    flyToOverview(duration = 3.5, from = null) {
        if (from) this.camera.position.copy(from);
        this.start({ body: null, duration, endPosition: this.overviewPosition.clone(), minDistance: 5 });
    }

    start({ body, duration, offset = null, endPosition = null, minDistance }) {
        const fromPos = this.camera.position.clone();
        const endGuess = body ? body.getWorldPosition(new THREE.Vector3()).add(offset) : endPosition;
        this.flight = {
            body,
            duration,
            t: 0,
            offset,
            endPosition,
            fromPos,
            fromTarget: this.controls.target.clone(),
            arc: Math.min(fromPos.distanceTo(endGuess) * 0.18, 120),
        };
        this.focus = null;
        this.controls.enabled = false;
        this.controls.minDistance = Math.min(minDistance, this.controls.minDistance);
        this.pendingMinDistance = minDistance;
    }

    update(dt) {
        const { camera, controls } = this;

        if (this.flight) {
            const f = this.flight;
            f.t = Math.min(f.t + dt / f.duration, 1);
            const e = easeInOutCubic(f.t);
            const targetPos = f.body ? f.body.getWorldPosition(this.tmp) : this.tmp.set(0, 0, 0);
            const endPos = f.body ? targetPos.clone().add(f.offset) : f.endPosition;

            camera.position.lerpVectors(f.fromPos, endPos, e).addScaledVector(UP, Math.sin(Math.PI * e) * f.arc);
            controls.target.lerpVectors(f.fromTarget, targetPos, easeOutCubic(Math.min(f.t * 1.5, 1)));
            camera.lookAt(controls.target);

            if (f.t >= 1) {
                this.flight = null;
                this.focus = f.body;
                this.lastFocusPos.copy(targetPos);
                controls.minDistance = this.pendingMinDistance;
                controls.enabled = true;
            }
            return;
        }

        if (this.focus) {
            // Arrastra cámara y objetivo con el astro para seguirlo en su órbita.
            const pos = this.focus.getWorldPosition(this.tmp);
            camera.position.add(pos.clone().sub(this.lastFocusPos));
            controls.target.copy(pos);
            this.lastFocusPos.copy(pos);
        }
        controls.update();
    }
}
