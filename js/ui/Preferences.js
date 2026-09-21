const KEY = 'sistema-solar:preferencias';

const DEFAULTS = {
    orbits: true,
    labels: true,
    bloom: true,
    quality: 'auto',
    hintSeen: false,
};

/**
 * Preferencias del visitante guardadas en el navegador. El almacenamiento
 * puede no estar disponible (modo privado, cookies bloqueadas), así que
 * cualquier fallo se ignora y se usan los valores por defecto.
 */
export class Preferences {
    constructor() {
        this.values = { ...DEFAULTS };
        try {
            Object.assign(this.values, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
        } catch {
            // sin almacenamiento: se quedan los valores por defecto
        }
    }

    get(name) {
        return this.values[name];
    }

    set(name, value) {
        this.values[name] = value;
        try {
            localStorage.setItem(KEY, JSON.stringify(this.values));
        } catch {
            // sin almacenamiento: la preferencia dura solo esta visita
        }
    }
}
