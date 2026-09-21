import { EVENTS, eventTime } from '../data/events.js';
import { Preferences } from './Preferences.js';

// Los eventos astronómicos se publican en tiempo universal.
const EVENT_DATE_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const DATE_FORMAT = new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const TOGGLE_MESSAGES = {
    orbits: ['Trayectorias visibles', 'Trayectorias ocultas'],
    labels: ['Etiquetas visibles', 'Etiquetas ocultas'],
    bloom: ['Resplandor activado', 'Resplandor desactivado'],
};

const $ = (id) => document.getElementById(id);
const compactQuery = window.matchMedia('(max-width: 760px)');
const touchQuery = window.matchMedia('(pointer: coarse)');

/**
 * Capa HTML de la aplicación: barra de herramientas, viaje en el tiempo,
 * panel de información, barra de tiempo, selector de astros, modo sin
 * interfaz, avisos, atajos de teclado y preferencias guardadas.
 */
export class UserInterface {
    constructor(app) {
        this.app = app;
        this.prefs = new Preferences();
        this.current = null;
        this.liveTimer = 0;
        this.immersive = false;
        this.infoCollapsed = false; // preferencia en escritorio

        this.hud = $('hud');
        this.dateEl = $('simDate');
        this.speedEl = $('timeSpeed');
        this.panel = $('infoPanel');
        this.helpModal = $('helpModal');
        this.datePanel = $('datePanel');
        this.toolbar = $('toolbar');
        this.menuButton = $('menuButton');
        this.toastEl = $('toast');

        this.buildDock();
        this.bindDatePanel();
        this.bindTimeControls();
        this.bindToolbar();
        this.bindInfoPanel();
        this.bindKeyboard();
        this.bindQuality();
        this.restorePreferences();

        this.helpModal.addEventListener('click', (event) => {
            if (event.target === this.helpModal || event.target.hasAttribute('data-close')) this.toggleHelp(false);
        });
        $('showUi').addEventListener('click', () => this.setImmersive(false));
        $('gpuNoticeClose').addEventListener('click', () => { $('gpuNotice').hidden = true; });
        if (app.quality.software) $('gpuNotice').hidden = false;

        app.clock.onChange(() => this.refreshSpeed());
        this.refreshSpeed();
    }

    get isCompact() {
        return compactQuery.matches;
    }

    /** Muestra la interfaz tras la intro y, la primera vez, una guía de gestos. */
    show() {
        this.hud.classList.remove('hidden');
        if (this.prefs.get('hintSeen')) return;
        const hint = $('hint');
        hint.textContent = touchQuery.matches
            ? 'Desliza para girar · Pellizca para acercar · Toca un planeta para viajar'
            : 'Arrastra para girar · Rueda para acercar · Haz clic en un planeta para viajar';
        hint.hidden = false;
        setTimeout(() => { hint.hidden = true; }, 7500);
        this.prefs.set('hintSeen', true);
    }

    /** Aviso breve en pantalla. */
    toast(message) {
        this.toastEl.textContent = message;
        this.toastEl.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
    }

    // ---------- Barra de herramientas ----------

    bindToolbar() {
        document.querySelectorAll('[data-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                const name = button.dataset.toggle;
                const on = !button.classList.contains('active');
                this.setToggle(name, on);
                this.toast(TOGGLE_MESSAGES[name][on ? 0 : 1]);
                this.closeMenu();
            });
        });
        const action = (name, fn) => document.querySelector(`[data-action="${name}"]`).addEventListener('click', () => {
            fn();
            if (name !== 'quality') this.closeMenu();
        });
        action('overview', () => this.app.overview());
        action('quality', () => this.app.quality.cycleMode());
        action('fullscreen', () => this.toggleFullscreen());
        action('help', () => this.toggleHelp());
        action('immersive', () => this.setImmersive(true));

        // En móvil, las opciones secundarias van en un menú desplegable.
        this.menuButton.addEventListener('click', () => this.setMenuOpen(!this.toolbar.classList.contains('open')));
        document.addEventListener('pointerdown', (event) => {
            if (this.toolbar.classList.contains('open') && !this.toolbar.contains(event.target)) this.closeMenu();
        });
    }

    /** Aplica un interruptor (trayectorias, etiquetas, resplandor) y lo recuerda. */
    setToggle(name, on) {
        const button = document.querySelector(`[data-toggle="${name}"]`);
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
        this.app.setOption(name, on);
        this.prefs.set(name, on);
    }

    clickToggle(name) {
        document.querySelector(`[data-toggle="${name}"]`).click();
    }

    setMenuOpen(open) {
        this.toolbar.classList.toggle('open', open);
        this.menuButton.setAttribute('aria-expanded', String(open));
    }

    closeMenu() {
        if (this.toolbar.classList.contains('open')) this.setMenuOpen(false);
    }

    /** Oculta toda la interfaz para disfrutar solo del modelo. */
    setImmersive(on) {
        if (this.immersive === on) return;
        this.immersive = on;
        document.body.classList.toggle('immersive', on);
        $('showUi').hidden = !on;
        this.closeMenu();
        if (on) {
            this.toggleDatePanel(false);
            this.toast(touchQuery.matches ? 'Toca el espacio vacío para volver' : 'Pulsa I o haz clic en el espacio vacío para volver');
        }
    }

    bindQuality() {
        const { quality } = this.app;
        const label = $('qualityLabel');
        const button = document.querySelector('[data-action="quality"]');
        quality.onChange((q) => {
            const fps = q.fps ? ` · ${Math.round(q.fps)} fps` : '';
            label.textContent = q.label + fps;
            button.title = `Calidad gráfica: ${q.label}${fps} (Q para cambiar)`;
            if (this.prefs.get('quality') !== q.mode) this.prefs.set('quality', q.mode);
        });
    }

    restorePreferences() {
        for (const name of ['orbits', 'labels', 'bloom']) {
            if (this.prefs.get(name) === false) this.setToggle(name, false);
        }
        this.app.quality.setMode(this.prefs.get('quality'));
    }

    // ---------- Viaje en el tiempo ----------

    /** Panel para saltar a una fecha concreta o a un evento astronómico. */
    bindDatePanel() {
        this.dateEl.addEventListener('click', () => this.toggleDatePanel());
        $('dateForm').addEventListener('submit', (event) => {
            event.preventDefault();
            const ms = new Date($('dateInput').value).getTime(); // hora local del navegador
            if (Number.isFinite(ms)) {
                this.app.travelTo(ms, this.current?.id ?? null);
                this.toggleDatePanel(false);
            }
        });
    }

    /** Rellena la lista de eventos (algunos se calculan a partir de la fecha simulada). */
    renderEvents() {
        const list = $('eventList');
        list.replaceChildren();
        for (const event of EVENTS) {
            const ms = eventTime(event, this.app.system, this.app.clock.timeMs);
            const button = document.createElement('button');
            button.className = 'event';
            const title = document.createElement('b');
            title.textContent = event.title;
            const time = document.createElement('time');
            time.dateTime = new Date(ms).toISOString();
            time.textContent = EVENT_DATE_FORMAT.format(ms);
            const text = document.createElement('span');
            text.textContent = event.description;
            button.append(title, time, text);
            button.addEventListener('click', () => {
                this.app.travelTo(ms, event.focus);
                this.toggleDatePanel(false);
            });
            list.appendChild(button);
        }
    }

    toggleDatePanel(force) {
        const open = force ?? this.datePanel.hidden;
        this.datePanel.hidden = !open;
        this.dateEl.setAttribute('aria-expanded', String(open));
        if (!open) return;
        this.closeMenu();
        const date = this.app.clock.date;
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        $('dateInput').value = local.toISOString().slice(0, 16);
        this.renderEvents();
    }

    // ---------- Tiempo ----------

    bindTimeControls() {
        const { clock } = this.app;
        $('timePlay').addEventListener('click', () => clock.togglePause());
        $('timeForward').addEventListener('click', () => clock.faster());
        $('timeReverse').addEventListener('click', () => clock.slower());
        $('timeNow').addEventListener('click', () => {
            clock.resetToNow();
            this.toast('De vuelta al presente');
        });
    }

    refreshSpeed() {
        const { clock } = this.app;
        this.speedEl.textContent = clock.paused ? 'En pausa' : clock.label;
        $('iconPause').hidden = clock.paused;
        $('iconPlay').hidden = !clock.paused;
    }

    // ---------- Selector de astros ----------

    buildDock() {
        const { system } = this.app;
        const dock = $('dock');
        this.dockItems = new Map();
        for (const body of [system.sun, ...system.planets, system.comet]) {
            const item = document.createElement('button');
            item.className = 'dock__item';
            item.style.setProperty('--dot', body.color);
            const dot = document.createElement('span');
            dot.className = 'dock__dot';
            item.append(dot, body.id === 'encke' ? 'Cometa' : body.name);
            item.addEventListener('click', () => this.app.select(body));
            dock.appendChild(item);
            this.dockItems.set(body, item);
        }
    }

    // ---------- Panel de información ----------

    bindInfoPanel() {
        $('infoClose').addEventListener('click', () => this.app.overview());
        $('infoToggle').addEventListener('click', () => {
            const collapsed = !this.panel.classList.contains('collapsed');
            this.setInfoCollapsed(collapsed);
            if (!this.isCompact) this.infoCollapsed = collapsed;
        });
    }

    setInfoCollapsed(collapsed) {
        this.panel.classList.toggle('collapsed', collapsed);
        $('infoToggle').setAttribute('aria-expanded', String(!collapsed));
    }

    get infoOpenAndExpanded() {
        return !!this.current && !this.panel.classList.contains('collapsed');
    }

    /** Muestra la ficha de un astro. En móvil empieza plegada para no tapar el modelo. */
    showInfo(body) {
        this.current = body;
        const { info } = body;
        $('infoType').textContent = info.type;
        $('infoName').textContent = body.name;
        $('infoDescription').textContent = info.description;
        $('infoFact').textContent = info.fact;
        $('infoStats').replaceChildren(...Object.entries(info.stats).map(([k, v]) => UserInterface.statRow(k, v)));

        const moons = $('infoMoons');
        moons.replaceChildren();
        const related = body.kind === 'moon' ? [body.planet] : body.satellites;
        for (const other of related) {
            const chip = document.createElement('button');
            chip.className = 'chip';
            chip.textContent = body.kind === 'moon' ? `← ${other.name}` : other.name;
            chip.addEventListener('click', () => this.app.select(other));
            moons.appendChild(chip);
        }

        this.setInfoCollapsed(this.isCompact ? true : this.infoCollapsed);
        this.updateLive();
        $('infoBody').scrollTop = 0;
        this.panel.classList.add('open');
        this.dockItems.forEach((item, b) => {
            item.classList.toggle('active', b === body);
            if (b === body) item.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        });
    }

    hideInfo() {
        this.current = null;
        this.panel.classList.remove('open');
        this.dockItems.forEach((item) => item.classList.remove('active'));
    }

    static statRow(label, value) {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        row.append(dt, dd);
        return row;
    }

    updateLive() {
        if (!this.current) return;
        const stats = this.current.getLiveStats(this.app.system);
        $('infoLive').replaceChildren(...stats.map(([k, v]) => UserInterface.statRow(k, v)));
        $('infoLive').hidden = stats.length === 0;
        // Con la ficha plegada se ve el primer dato en vivo.
        $('infoPeek').textContent = stats[0] ? `${stats[0][0]} · ${stats[0][1]}` : this.current.info.type;
    }

    // ---------- Teclado y otros ----------

    bindKeyboard() {
        const { app } = this;
        const order = [app.system.sun, ...app.system.planets];
        window.addEventListener('keydown', (event) => {
            if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
            const key = event.key.toLowerCase();
            if (/^[0-8]$/.test(key)) app.select(order[Number(key)]);
            else if (key === '9') app.select(app.system.find('luna'));
            else if (key === 'c') app.select(app.system.comet);
            else if (key === 'p') app.select(app.system.find('pluton'));
            else if (key === 'd') this.toggleDatePanel();
            else if (key === 'i') this.setImmersive(!this.immersive);
            else if (key === ' ') { event.preventDefault(); app.clock.togglePause(); }
            else if (key === '.' || key === 'arrowright') app.clock.faster();
            else if (key === ',' || key === 'arrowleft') app.clock.slower();
            else if (key === 'n') app.clock.resetToNow();
            else if (key === 'o' || key === 'l' || key === 'b') this.clickToggle({ o: 'orbits', l: 'labels', b: 'bloom' }[key]);
            else if (key === 'q') app.quality.cycleMode();
            else if (key === 'f') this.toggleFullscreen();
            else if (key === 'h' || key === '?') this.toggleHelp();
            else if (key === 'escape') {
                if (this.immersive) this.setImmersive(false);
                else if (!this.helpModal.hidden) this.toggleHelp(false);
                else if (!this.datePanel.hidden) this.toggleDatePanel(false);
                else if (this.toolbar.classList.contains('open')) this.closeMenu();
                else app.overview();
            }
        });
    }

    toggleHelp(force) {
        this.helpModal.hidden = force === undefined ? !this.helpModal.hidden : !force;
    }

    toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
    }

    /** Refresco periódico de la fecha y los datos en vivo (4 veces por segundo). */
    update(dt) {
        this.liveTimer -= dt;
        if (this.liveTimer > 0) return;
        this.liveTimer = 0.25;
        const date = this.app.clock.date;
        this.dateEl.textContent = Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
        // Los elementos orbitales de Standish solo son precisos entre 1800 y 2050.
        const year = date.getUTCFullYear();
        this.dateEl.classList.toggle('is-approx', year < 1800 || year > 2050);
        this.updateLive();
    }
}
