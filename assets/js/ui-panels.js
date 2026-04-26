/**
 * VeVit Earth — UI Panels Module
 *
 * Handles left panel, detail panel, HUD overlay, minimap,
 * toast notifications, and empty states.
 *
 * @module ui-panels
 */

(function(global) {
    'use strict';

    // ========================================
    // DOM Elements Cache
    // ========================================

    const DOM = {};

    // ========================================
    // State
    // ========================================

    let minimap = null;
    let minimapMarker = null;
    let activeEventId = null;

    // ========================================
    // Toast Notification System
    // ========================================

    const toasts = {
        container: null,
        counter: 0,

        init() {
            this.container = document.getElementById('toast-container');
        },

        show(options) {
            const { type = 'info', title, message, duration = 4000 } = options;
            if (!this.container) return;

            const id = `toast-${++this.counter}`;
            const icons = {
                success: 'check-circle',
                error: 'alert-circle',
                info: 'info',
                warning: 'alert-triangle'
            };

            const toast = document.createElement('div');
            toast.id = id;
            toast.className = `toast toast-${type} animate-toast-in`;
            toast.innerHTML = `
                <i data-lucide="${icons[type]}" class="toast-icon"></i>
                <div class="toast-content">
                    <div class="toast-title">${escapeHtml(title)}</div>
                    ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
                </div>
                <button class="toast-close" onclick="VeVitEarth.ui.toast.dismiss('${id}')">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
            `;

            this.container.appendChild(toast);

            // Initialize Lucide icons in toast
            if (typeof lucide !== 'undefined') {
                lucide.createIcons({ nodes: [toast] });
            }

            // Auto-dismiss
            if (duration > 0) {
                setTimeout(() => this.dismiss(id), duration);
            }

            return id;
        },

        dismiss(id) {
            const toast = document.getElementById(id);
            if (toast) {
                toast.classList.remove('animate-toast-in');
                toast.classList.add('animate-toast-out');
                setTimeout(() => toast.remove(), 200);
            }
        },

        success(title, message) { return this.show({ type: 'success', title, message }); },
        error(title, message) { return this.show({ type: 'error', title, message }); },
        info(title, message) { return this.show({ type: 'info', title, message }); },
        warning(title, message) { return this.show({ type: 'warning', title, message }); }
    };

    // ========================================
    // Utility Functions
    // ========================================

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function initLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========================================
    // Initialization
    // ========================================

    function cacheDOM() {
        DOM.leftPanel = document.getElementById('left-panel');
        DOM.detailPanel = document.getElementById('detail-panel');
        DOM.panelToggle = document.getElementById('panel-toggle');
        DOM.eventList = document.getElementById('event-list');
        DOM.eventCount = document.getElementById('event-count');
        DOM.statActive = document.getElementById('stat-active');
        DOM.statMonth = document.getElementById('stat-month');
        DOM.statCategories = document.getElementById('stat-categories');
        DOM.statTop = document.getElementById('stat-top');
        DOM.lastUpdated = document.getElementById('last-updated');
        DOM.hudCoords = document.getElementById('hud-coords');
        DOM.hudAltitude = document.getElementById('hud-altitude');
        DOM.hudTime = document.getElementById('hud-time');
        DOM.searchInput = document.getElementById('search-input');
        DOM.searchResults = document.getElementById('search-results');
        DOM.viewToggle = document.getElementById('view-toggle');
        DOM.viewMode = document.getElementById('view-mode');
        DOM.loadingScreen = document.getElementById('loading-screen');
        DOM.loadingProgress = document.getElementById('loading-progress');
        DOM.loadingText = document.getElementById('loading-text');
        DOM.app = document.getElementById('app');
    }

    function init() {
        cacheDOM();
        toasts.init();
        setupEventListeners();
        initMinimap();

        window.VeVitEarth.ui = window.VeVitEarth.ui || {};
        window.VeVitEarth.ui.autoRotate = true;
        window.VeVitEarth.ui.toast = toasts;

        return Promise.resolve();
    }

    function setupEventListeners() {
        // Panel toggle (mobile)
        if (DOM.panelToggle) {
            DOM.panelToggle.addEventListener('click', toggleLeftPanel);
        }

        // Detail panel close
        const detailClose = document.getElementById('detail-close');
        if (detailClose) {
            detailClose.addEventListener('click', hideDetail);
        }

        // View toggle (3D/2D)
        if (DOM.viewToggle) {
            DOM.viewToggle.addEventListener('click', toggleViewMode);
        }

        // Time filter buttons
        document.querySelectorAll('.time-filter').forEach(btn => {
            btn.addEventListener('click', (e) => handleTimeFilter(e.target.dataset.days));
        });

        // Layer toggles
        document.querySelectorAll('#layer-controls input').forEach(input => {
            input.addEventListener('change', handleLayerToggle);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideDetail();
                closeLeftPanel();
            }
            // Ctrl/Cmd + F to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                if (DOM.searchInput) DOM.searchInput.focus();
            }
            // R to reset view
            if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
                if (window.VeVitEarth.globe) {
                    window.VeVitEarth.globe.setInitialView();
                }
            }
        });
    }

    // ========================================
    // Loading Screen
    // ========================================

    function updateLoading(percent, text) {
        if (DOM.loadingProgress) {
            DOM.loadingProgress.style.width = `${percent}%`;
        }
        if (DOM.loadingText) {
            DOM.loadingText.textContent = text;
        }
    }

    function hideLoading() {
        if (DOM.loadingScreen) {
            DOM.loadingScreen.style.opacity = '0';
            DOM.loadingScreen.style.transition = 'opacity 200ms ease-out';
            setTimeout(() => {
                DOM.loadingScreen.style.display = 'none';
            }, 200);
        }
        if (DOM.app) {
            DOM.app.classList.remove('hidden');
        }
    }

    // ========================================
    // Left Panel
    // ========================================

    function toggleLeftPanel() {
        if (DOM.leftPanel) {
            const isOpen = !DOM.leftPanel.classList.contains('-translate-x-full');
            if (isOpen) {
                closeLeftPanel();
            } else {
                openLeftPanel();
            }
        }
    }

    function openLeftPanel() {
        if (DOM.leftPanel) {
            DOM.leftPanel.classList.remove('-translate-x-full');
        }
    }

    function closeLeftPanel() {
        if (DOM.leftPanel) {
            DOM.leftPanel.classList.add('-translate-x-full');
        }
    }

    // ========================================
    // Event List
    // ========================================

    function renderEventList(events) {
        if (!DOM.eventList) return;

        if (events.length === 0) {
            DOM.eventList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i data-lucide="map-pin-off" class="w-6 h-6 text-slate-500"></i>
                    </div>
                    <div class="empty-state-title">Žádné události</div>
                    <div class="empty-state-description">Pro vybrané filtry nebyly nalezeny žádné události</div>
                </div>
            `;
            initLucideIcons();
            return;
        }

        const sortedEvents = [...events].sort((a, b) => (a.ageDays ?? 999) - (b.ageDays ?? 999));

        DOM.eventList.innerHTML = sortedEvents.map(event => `
            <div class="event-card ${activeEventId === event.id ? 'active' : ''}"
                 data-event-id="${event.id}"
                 onclick="VeVitEarth.ui.handleEventClick('${event.id}')">
                <div class="flex items-start gap-3">
                    <div class="event-card-icon" style="background: ${event.categoryColor}15; color: ${event.categoryColor}">
                        <i data-lucide="${event.categoryIcon}" class="w-4 h-4"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="event-card-title truncate">${escapeHtml(event.title)}</div>
                        <div class="event-card-meta">
                            <span class="inline-flex items-center gap-1">
                                <i data-lucide="clock" class="w-3 h-3"></i>
                                ${event.relativeTime}
                            </span>
                            <span class="mx-1">·</span>
                            ${event.categoryLabel}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        initLucideIcons();

        if (DOM.eventCount) {
            DOM.eventCount.textContent = events.length;
        }
    }

    function handleEventClick(eventId) {
        const event = window.VeVitEarth.events.find(e => e.id === eventId);
        if (event) {
            activeEventId = eventId;
            document.querySelectorAll('.event-card').forEach(card => {
                card.classList.toggle('active', card.dataset.eventId === eventId);
            });

            if (window.VeVitEarth.globe) {
                window.VeVitEarth.globe.flyToEvent(event);
            }

            showDetail(event);

            if (window.innerWidth < 1024) {
                closeLeftPanel();
            }
        }
    }

    function updateTimeFilterUI(days) {
        document.querySelectorAll('.time-filter').forEach(btn => {
            const btnDays = btn.dataset.days;
            const isActive = btnDays === String(days) || (days === null && btnDays === 'all');
            btn.classList.toggle('bg-brand-500/10', isActive);
            btn.classList.toggle('border-brand-500/30', isActive);
            btn.classList.toggle('text-brand-400', isActive);
            btn.classList.toggle('bg-surface-elevated', !isActive);
            btn.classList.toggle('border-white/5', !isActive);
            btn.classList.toggle('text-slate-400', !isActive);
        });
    }

    function handleTimeFilter(days) {
        updateTimeFilterUI(days);

        if (window.VeVitEarth.eonet) {
            window.VeVitEarth.eonet.fetchEvents({
                days: days === 'all' ? null : parseInt(days)
            }).then(result => {
                renderEventList(result.events);
                updateStats();
            }).catch(err => {
                console.error('Failed to fetch events:', err);
                toasts.error('Chyba načítání', 'Nepodařilo se načíst události');
            });
        }
    }

    function handleLayerToggle(e) {
        const layerId = e.target.id.replace('layer-', '');
        const enabled = e.target.checked;
        window.VeVitEarth.layers[layerId] = enabled;
    }

    // ========================================
    // Detail Panel
    // ========================================

    function showDetail(event) {
        if (!DOM.detailPanel) return;

        activeEventId = event.id;

        let similarEvents = [];
        if (window.VeVitEarth.eonet) {
            similarEvents = window.VeVitEarth.eonet.findSimilarEvents(event, 500);
        }

        const coords = event.coordinates ?
            window.VeVitEarth.eonet.formatCoordinates(event.coordinates[1], event.coordinates[0]) :
            'Neznámé';

        const mapUrl = event.coordinates ?
            `https://staticmap.openstreetmap.de/staticmap.php?center=${event.coordinates[1]},${event.coordinates[0]}&zoom=8&size=380x200&markers=${event.coordinates[1]},${event.coordinates[0]},red-pushpin` :
            '';

        const content = `
            <div class="detail-header">
                <div class="detail-icon" style="background: ${event.categoryColor}15; color: ${event.categoryColor}">
                    <i data-lucide="${event.categoryIcon}" class="w-5 h-5"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="detail-title">${escapeHtml(event.title)}</div>
                    <div class="detail-category">${event.categoryLabel}</div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-label">Datum</div>
                <div class="detail-value flex items-center gap-2">
                    <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-500"></i>
                    ${event.dateStart ? new Date(event.dateStart).toLocaleDateString('cs-CZ') : 'Neznámé'}
                    ${event.status === 'open' ? '<span class="text-xs text-emerald-400">Probíhá</span>' : event.dateEnd ? '<span class="text-xs text-slate-500">Ukončeno</span>' : ''}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-label">Souřadnice</div>
                <div class="flex items-center justify-between">
                    <div class="detail-value flex items-center gap-2">
                        <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-500"></i>
                        ${coords}
                    </div>
                    <button onclick="VeVitEarth.ui.copyCoordinates('${coords}')" class="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
                        <i data-lucide="copy" class="w-3 h-3"></i>
                    </button>
                </div>
            </div>

            ${mapUrl ? `
            <div class="detail-section">
                <div class="detail-label">Lokalita</div>
                <img src="${mapUrl}" alt="Mapa lokality" class="static-map mt-2" loading="lazy">
            </div>
            ` : ''}

            <div class="detail-actions">
                <button onclick="VeVitEarth.ui.flyToEvent('${event.id}')" class="detail-btn primary">
                    <i data-lucide="plane" class="w-3.5 h-3.5"></i>
                    Fly to
                </button>
                <button onclick="VeVitEarth.ui.shareEvent('${event.id}')" class="detail-btn">
                    <i data-lucide="share" class="w-3.5 h-3.5"></i>
                    Sdílet
                </button>
                ${event.source ? `
                <a href="${event.source}" target="_blank" rel="noopener" class="detail-btn">
                    <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    Zdroj
                </a>
                ` : ''}
            </div>

            ${similarEvents.length > 0 ? `
            <div class="detail-section mt-4">
                <div class="detail-label flex items-center gap-1.5">
                    <i data-lucide="radar" class="w-3 h-3"></i>
                    Podobné události v okolí
                </div>
                ${similarEvents.map(se => `
                    <div class="similar-event" onclick="VeVitEarth.ui.handleEventClick('${se.id}')">
                        <i data-lucide="${se.categoryIcon}" class="w-3.5 h-3.5" style="color: ${se.categoryColor}"></i>
                        <span class="text-sm truncate">${escapeHtml(se.title)}</span>
                        <span class="text-xs text-slate-500 ml-auto tabular-nums">${Math.round(se.distance)} km</span>
                    </div>
                `).join('')}
            </div>
            ` : ''}
        `;

        document.getElementById('detail-content').innerHTML = content;
        DOM.detailPanel.classList.remove('translate-x-full');
        initLucideIcons();
    }

    function hideDetail() {
        if (DOM.detailPanel) {
            DOM.detailPanel.classList.add('translate-x-full');
            activeEventId = null;
        }
    }

    // ========================================
    // Statistics
    // ========================================

    function updateStats() {
        if (!window.VeVitEarth.eonet) return;

        const stats = window.VeVitEarth.eonet.getStatistics();

        if (DOM.statActive) DOM.statActive.textContent = stats.active;
        if (DOM.statMonth) DOM.statMonth.textContent = stats.total;

        // Count unique categories
        const categories = new Set(window.VeVitEarth.events.map(e => e.category));
        if (DOM.statCategories) DOM.statCategories.textContent = categories.size;

        if (DOM.statTop) {
            DOM.statTop.innerHTML = stats.topCategories.slice(0, 3).map(c =>
                `<span class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-base text-slate-300">
                    <i data-lucide="${c.icon}" class="w-3 h-3" style="color: ${c.color}"></i>
                    ${c.count}
                </span>`
            ).join('') || '<span class="text-xs text-slate-500">-</span>';
        }

        if (DOM.lastUpdated && window.VeVitEarth.lastUpdated) {
            const age = Math.floor((Date.now() - window.VeVitEarth.lastUpdated) / 1000);
            let text;
            if (age < 60) text = 'Před chvílí';
            else if (age < 3600) text = `před ${Math.floor(age / 60)} min`;
            else text = `před ${Math.floor(age / 3600)} h`;
            DOM.lastUpdated.textContent = `Aktualizováno: ${text}`;
        }

        initLucideIcons();
    }

    // ========================================
    // HUD
    // ========================================

    function updateHUD(lat, lon, altitude) {
        if (DOM.hudCoords) {
            const latDir = lat >= 0 ? 'N' : 'S';
            const lonDir = lon >= 0 ? 'E' : 'W';
            DOM.hudCoords.textContent = `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
        }

        if (DOM.hudAltitude) {
            let altText;
            if (altitude < 1000) altText = `${Math.round(altitude)} m`;
            else if (altitude < 1000000) altText = `${(altitude / 1000).toFixed(1)} km`;
            else altText = `${(altitude / 1000000).toFixed(0)} tis. km`;
            DOM.hudAltitude.textContent = altText;
        }

        if (DOM.hudTime) {
            const tzOffset = Math.round(lon / 15);
            const utc = new Date();
            const local = new Date(utc.getTime() + tzOffset * 3600000);
            const hours = local.getHours().toString().padStart(2, '0');
            const mins = local.getMinutes().toString().padStart(2, '0');
            const offsetStr = tzOffset >= 0 ? `+${tzOffset}` : tzOffset;
            DOM.hudTime.textContent = `UTC${offsetStr} ${hours}:${mins}`;
        }
    }

    // ========================================
    // Minimap
    // ========================================

    function initMinimap() {
        const minimapContainer = document.getElementById('minimap');
        if (!minimapContainer || typeof L === 'undefined') return;

        minimap = L.map('minimap', {
            center: [20, 0],
            zoom: 1,
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18
        }).addTo(minimap);

        minimapMarker = L.rectangle([[0, 0], [0, 0]], {
            fill: true,
            fillColor: 'rgba(59, 130, 246, 0.2)',
            stroke: true,
            color: '#3b82f6',
            weight: 2
        }).addTo(minimap);

        minimap.on('click', (e) => {
            if (window.VeVitEarth.globe) {
                window.VeVitEarth.globe.flyToCoordinates(e.latlng.lng, e.latlng.lat, 5000000);
            }
        });
    }

    function updateMinimap(lat, lon, altitude, heading) {
        if (!minimap || !minimapMarker) return;

        const viewAngle = 30;
        const scale = Math.sqrt(altitude) / 100;
        const latSpan = Math.min(90, viewAngle * scale / 100);
        const lonSpan = Math.min(180, viewAngle * scale / 50);

        const south = Math.max(-90, lat - latSpan);
        const north = Math.min(90, lat + latSpan);
        const west = Math.max(-180, lon - lonSpan);
        const east = Math.min(180, lon + lonSpan);

        minimapMarker.setBounds([[south, west], [north, east]]);
        minimap.setView([lat, lon], minimap.getZoom(), { animate: false });
    }

    // ========================================
    // View Toggle
    // ========================================

    function toggleViewMode() {
        const is3D = DOM.viewMode.textContent === '3D';
        DOM.viewMode.textContent = is3D ? '2D' : '3D';

        if (window.VeVitEarth.globe) {
            window.VeVitEarth.globe.setSceneMode(!is3D);
        }
    }

    // ========================================
    // Utility Functions
    // ========================================

    function copyCoordinates(coords) {
        navigator.clipboard.writeText(coords).then(() => {
            toasts.success('Zkopírováno', 'Souřadnice byly zkopírovány');
        });
    }

    function flyToEvent(eventId) {
        const event = window.VeVitEarth.events.find(e => e.id === eventId);
        if (event && window.VeVitEarth.globe) {
            window.VeVitEarth.globe.flyToEvent(event);
        }
    }

    function shareEvent(eventId) {
        const url = window.VeVitEarth.url ?
            window.VeVitEarth.url.getEventUrl(eventId) :
            `${window.location.origin}${window.location.pathname}?event=${eventId}`;

        navigator.clipboard.writeText(url).then(() => {
            toasts.success('Odkaz zkopírován', 'Odkaz pro sdílení je ve schránce');
        });
    }

    // ========================================
    // Export - merge with existing VeVitEarth.ui
    // ========================================

    global.VeVitEarth = global.VeVitEarth || {};
    global.VeVitEarth.ui = Object.assign(global.VeVitEarth.ui || {}, {
        init,
        toast: toasts,
        updateLoading,
        hideLoading,
        toggleLeftPanel,
        openLeftPanel,
        closeLeftPanel,
        renderEventList,
        handleEventClick,
        updateTimeFilterUI,
        showDetail,
        hideDetail,
        updateStats,
        updateHUD,
        updateMinimap,
        toggleViewMode,
        copyCoordinates,
        flyToEvent,
        shareEvent
    });

})(window);