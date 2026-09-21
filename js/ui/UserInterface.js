const DATE_FORMAT = new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const $ = (id) => document.getElementById(id);

/**
 * Capa HTML de la aplicación: barra de tiempo, selector de astros, panel de
 * información, botones de opciones, atajos de teclado y ayuda.
 */
export class UserInterface {
    constructor(app) {
        this.app = app;
        this.current = null;
        this.liveTimer = 0;

        this.hud = $('hud');
        this.dateEl = $('simDate');
        this.speedEl = $('timeSpeed');
        this.panel = $('infoPanel');
        this.helpModal = $('helpModal');

        this.buildDock();
        this.bindTimeControls();
        this.bindToolbar();
        this.bindKeyboard();

        $('infoClose').addEventListener('click', () => app.overview());
        this.helpModal.addEventListener('click', (event) => {
            if (event.target === this.helpModal || event.target.hasAttribute('data-close')) this.toggleHelp(false);
        });

        app.clock.onChange(() => this.refreshSpeed());
        this.refreshSpeed();

        const qualityLabel = $('qualityLabel');
        const qualityButton = document.querySelector('[data-action="quality"]');
        const refreshQuality = (q) => {
            const fps = q.fps ? ` · ${Math.round(q.fps)} fps` : '';
            qualityLabel.textContent = q.label + fps;
            qualityButton.title = `Calidad gráfica: ${q.label}${fps} (Q para cambiar)`;
        };
        app.quality.onChange(refreshQuality);
        refreshQuality(app.quality);

        if (app.quality.software) $('gpuNotice').hidden = false;
        $('gpuNoticeClose').addEventListener('click', () => { $('gpuNotice').hidden = true; });
    }

    show() {
        this.hud.classList.remove('hidden');
    }

    buildDock() {
        const { system } = this.app;
        const dock = $('dock');
        this.dockItems = new Map();
        for (const body of [system.sun, ...system.planets, system.comet]) {
            const item = document.createElement('button');
            item.className = 'dock__item';
            item.style.setProperty('--dot', body.color);
            item.innerHTML = `<span class="dock__dot"></span>${body.id === 'encke' ? 'Cometa' : body.name}`;
            item.addEventListener('click', () => this.app.select(body));
            dock.appendChild(item);
            this.dockItems.set(body, item);
        }
    }

    bindTimeControls() {
        const { clock } = this.app;
        $('timePlay').addEventListener('click', () => clock.togglePause());
        $('timeForward').addEventListener('click', () => clock.faster());
        $('timeReverse').addEventListener('click', () => clock.slower());
        $('timeNow').addEventListener('click', () => clock.resetToNow());
    }

    bindToolbar() {
        document.querySelectorAll('[data-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                const on = !button.classList.contains('active');
                button.classList.toggle('active', on);
                this.app.setOption(button.dataset.toggle, on);
            });
        });
        document.querySelector('[data-action="overview"]').addEventListener('click', () => this.app.overview());
        document.querySelector('[data-action="quality"]').addEventListener('click', () => this.app.quality.cycleMode());
        document.querySelector('[data-action="fullscreen"]').addEventListener('click', () => this.toggleFullscreen());
        document.querySelector('[data-action="help"]').addEventListener('click', () => this.toggleHelp());
    }

    bindKeyboard() {
        const { app } = this;
        const order = [app.system.sun, ...app.system.planets];
        window.addEventListener('keydown', (event) => {
            if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
            const key = event.key.toLowerCase();
            if (/^[0-8]$/.test(key)) app.select(order[Number(key)]);
            else if (key === '9') app.select(app.system.find('luna'));
            else if (key === 'c') app.select(app.system.comet);
            else if (key === ' ') { event.preventDefault(); app.clock.togglePause(); }
            else if (key === '.' || key === 'arrowright') app.clock.faster();
            else if (key === ',' || key === 'arrowleft') app.clock.slower();
            else if (key === 'n') app.clock.resetToNow();
            else if (key === 'o' || key === 'l' || key === 'b') this.clickToggle({ o: 'orbits', l: 'labels', b: 'bloom' }[key]);
            else if (key === 'q') app.quality.cycleMode();
            else if (key === 'f') this.toggleFullscreen();
            else if (key === 'h' || key === '?') this.toggleHelp();
            else if (key === 'escape') {
                if (!this.helpModal.hidden) this.toggleHelp(false);
                else app.overview();
            }
        });
    }

    clickToggle(name) {
        document.querySelector(`[data-toggle="${name}"]`).click();
    }

    toggleHelp(force) {
        this.helpModal.hidden = force === undefined ? !this.helpModal.hidden : !force;
    }

    toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
    }

    refreshSpeed() {
        const { clock } = this.app;
        this.speedEl.textContent = clock.paused ? 'En pausa' : clock.label;
        $('iconPause').hidden = clock.paused;
        $('iconPlay').hidden = !clock.paused;
    }

    /** Muestra el panel de información de un astro. */
    showInfo(body) {
        this.current = body;
        const { info } = body;
        $('infoType').textContent = info.type;
        $('infoName').textContent = body.name;
        $('infoDescription').textContent = info.description;
        $('infoFact').textContent = info.fact;
        $('infoStats').innerHTML = Object.entries(info.stats)
            .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
            .join('');

        const moons = $('infoMoons');
        moons.innerHTML = '';
        const related = body.kind === 'moon' ? [body.planet] : body.satellites;
        for (const other of related) {
            const chip = document.createElement('button');
            chip.className = 'chip';
            chip.textContent = body.kind === 'moon' ? `← ${other.name}` : other.name;
            chip.addEventListener('click', () => this.app.select(other));
            moons.appendChild(chip);
        }

        this.updateLive();
        this.panel.scrollTop = 0;
        this.panel.classList.add('open');
        this.dockItems.forEach((item, b) => item.classList.toggle('active', b === body));
    }

    hideInfo() {
        this.current = null;
        this.panel.classList.remove('open');
        this.dockItems.forEach((item) => item.classList.remove('active'));
    }

    updateLive() {
        if (!this.current) return;
        const stats = this.current.getLiveStats(this.app.system);
        $('infoLive').innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
        $('infoLive').hidden = stats.length === 0;
    }

    /** Refresco periódico de la fecha y los datos en vivo (4 veces por segundo). */
    update(dt) {
        this.liveTimer -= dt;
        if (this.liveTimer > 0) return;
        this.liveTimer = 0.25;
        const date = this.app.clock.date;
        this.dateEl.textContent = Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
        this.updateLive();
    }
}
