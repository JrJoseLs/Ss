import * as THREE from 'three';
import { TEXTURE_PATH } from '../config.js';

/**
 * Carga y cachea texturas, e informa del progreso global de la carga.
 */
export class AssetLoader {
    constructor(renderer) {
        this.manager = new THREE.LoadingManager();
        this.loader = new THREE.TextureLoader(this.manager);
        this.cache = new Map();
        this.renderer = renderer;
        this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
        this.errors = [];

        this.manager.onError = (url) => this.errors.push(url);
    }

    /**
     * @param {string} file   nombre dentro de assets/textures
     * @param {object} opts   { color: bool } si la textura contiene color (sRGB)
     */
    texture(file, { color = true } = {}) {
        const key = `${file}|${color}`;
        if (this.cache.has(key)) return this.cache.get(key);

        // Se sube a la GPU en cuanto llega, durante la pantalla de carga, y no la
        // primera vez que aparece en cámara (evita tirones al viajar a un planeta).
        const texture = this.loader.load(TEXTURE_PATH + file, (t) => this.renderer.initTexture(t));
        texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = Math.min(8, this.maxAnisotropy);
        this.cache.set(key, texture);
        return texture;
    }

    /** Ejecuta callbacks de progreso y de fin de carga. */
    track({ onProgress, onLoad }) {
        this.manager.onProgress = (url, loaded, total) => onProgress(loaded / total);
        this.manager.onLoad = () => onLoad(this.errors);
    }
}
