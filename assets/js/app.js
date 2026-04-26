/**
 * VeVit Earth — Main Application
 *
 * Orchestrates all modules and handles application lifecycle.
 *
 * @module app
 */

(function(global) {
    'use strict';

    // ========================================
    // Application State
    // ========================================

    global.VeVitEarth = {
        viewer: null,
        events: [],
        activeEvent: null,
        lastUpdated: null,
        filters: {
            days: 30,
            categories: [],
            sort: 'newest'
        },
        layers: {
            satellite: true,
            terrain: false,
            borders: false,
            clouds: false,
            nightLights: false,
            populationHeatmap: false,
            oceanCurrents: false,
            shippingRoutes: false
        },
        ui: {
            autoRotate: true,
            panelCollapsed: false,
            detailPanelOpen: false
        }
    };

    // ========================================
    // Loading Progress (works immediately)
    // ========================================

    let loadingProgress = null;
    let loadingText = null;
    let loadingPercent = null;

    function initLoadingElements() {
        loadingProgress = document.getElementById('loading-progress');
        loadingText = document.getElementById('loading-text');
        loadingPercent = document.getElementById('loading-percent');
    }

    function updateLoadingProgress(percent, text) {
        console.log(`[${percent}%] ${text}`);

        if (loadingProgress) {
            loadingProgress.style.width = `${percent}%`;
        }
        if (loadingText) {
            loadingText.textContent = text;
        }
        if (loadingPercent) {
            loadingPercent.textContent = `${percent}%`;
        }
    }

    function hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const app = document.getElementById('app');

        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.transition = 'opacity 200ms ease-out';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 200);
        }
        if (app) {
            app.classList.remove('hidden');
        }
    }

    function showError(message) {
        console.error(message);

        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="text-center">
                    <div class="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 flex items-center justify-center">
                        <svg class="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </div>
                    <h1 class="text-lg font-semibold text-white mb-2">Chyba načítání</h1>
                    <p class="text-sm text-slate-400 mb-4">${message}</p>
                    <button onclick="location.reload()" class="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg hover:bg-brand-600 transition-colors">
                        Zkusit znovu
                    </button>
                </div>
            `;
        }
    }

    // ========================================
    // Initialization Sequence
    // ========================================

    async function init() {
        console.log('🌍 VeVit Earth initializing...');

        // Initialize loading elements first
        initLoadingElements();
        updateLoadingProgress(5, 'Inicializace...');

        try {
            // Phase 1: Wait for DOM and initialize UI
            updateLoadingProgress(10, 'Příprava rozhraní...');
            await delay(100);

            if (global.VeVitEarth.ui && global.VeVitEarth.ui.init) {
                await global.VeVitEarth.ui.init();
            }

            // Phase 2: Initialize geocoding
            updateLoadingProgress(15, 'Nastavení vyhledávání...');
            if (global.VeVitEarth.geocoding && global.VeVitEarth.geocoding.init) {
                await global.VeVitEarth.geocoding.init();
            }

            // Phase 3: Initialize URL state
            updateLoadingProgress(20, 'Obnovování stavu...');
            if (global.VeVitEarth.url && global.VeVitEarth.url.init) {
                global.VeVitEarth.url.init();
            }

            // Phase 4: Initialize Cesium (longest operation)
            updateLoadingProgress(30, 'Načítání 3D enginu...');
            await delay(100);

            if (global.VeVitEarth.globe && global.VeVitEarth.globe.init) {
                updateLoadingProgress(40, 'Inicializace globu...');
                await global.VeVitEarth.globe.init();
                updateLoadingProgress(55, 'Globus načten...');
            }

            // Phase 5: Load EONET data
            updateLoadingProgress(60, 'Připojování k NASA EONET...');
            await loadEonetData();

            // Phase 6: Render events
            updateLoadingProgress(75, 'Zobrazování událostí...');
            await renderEvents();

            // Phase 7: Initialize Lucide icons
            updateLoadingProgress(85, 'Dokončování...');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            // Phase 8: Apply initial state from URL
            updateLoadingProgress(90, 'Aplikování nastavení...');
            if (global.VeVitEarth.url && global.VeVitEarth.url.applyInitialState) {
                await global.VeVitEarth.url.applyInitialState();
            }

            // Phase 9: Setup listeners
            updateLoadingProgress(95, 'Finalizace...');
            setupCameraListener();

            // Complete
            updateLoadingProgress(100, 'Hotovo!');
            await delay(200);
            hideLoadingScreen();

            console.log('✅ VeVit Earth initialized successfully');

        } catch (error) {
            console.error('❌ VeVit Earth initialization failed:', error);
            showError('Nepodařilo se načíst aplikaci. Zkontrolujte připojení k internetu.');
        }
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================
    // Module Initialization
    // ========================================

    async function loadEonetData() {
        if (global.VeVitEarth.eonet && global.VeVitEarth.eonet.fetchEvents) {
            updateLoadingProgress(65, 'Stahování dat...');
            const days = global.VeVitEarth.filters.days;
            const result = await global.VeVitEarth.eonet.fetchEvents({ days });
            updateLoadingProgress(70, `Načteno ${result.events?.length || 0} událostí...`);
            return result;
        }
    }

    async function renderEvents() {
        const events = global.VeVitEarth.events || [];

        // Add markers to globe
        if (global.VeVitEarth.globe && global.VeVitEarth.globe.addEventMarkers) {
            global.VeVitEarth.globe.addEventMarkers(events);
        }

        // Render event list in UI
        if (global.VeVitEarth.ui && global.VeVitEarth.ui.renderEventList) {
            global.VeVitEarth.ui.renderEventList(events);
        }

        // Update statistics
        if (global.VeVitEarth.ui && global.VeVitEarth.ui.updateStats) {
            global.VeVitEarth.ui.updateStats();
        }
    }

    // ========================================
    // Event Listeners
    // ========================================

    function setupCameraListener() {
        // Listen for category filter changes
        document.querySelectorAll('.category-filter').forEach(btn => {
            btn.addEventListener('click', handleCategoryFilter);
        });
    }

    function handleCategoryFilter(e) {
        const category = e.target.dataset.category;
        const isActive = e.target.classList.contains('active');

        e.target.classList.toggle('active');

        if (isActive) {
            global.VeVitEarth.filters.categories = global.VeVitEarth.filters.categories
                .filter(c => c !== category);
        } else {
            global.VeVitEarth.filters.categories.push(category);
        }

        reloadEvents();
    }

    async function reloadEvents() {
        const days = global.VeVitEarth.filters.days;
        const categories = global.VeVitEarth.filters.categories;

        try {
            let events = [];

            if (categories.length === 0) {
                const result = await global.VeVitEarth.eonet.fetchEvents({ days });
                events = result.events;
            } else {
                const promises = categories.map(cat =>
                    global.VeVitEarth.eonet.fetchEvents({ days, category: cat })
                );
                const results = await Promise.all(promises);
                events = results.flatMap(r => r.events);

                const seen = new Set();
                events = events.filter(e => {
                    if (seen.has(e.id)) return false;
                    seen.add(e.id);
                    return true;
                });
            }

            global.VeVitEarth.events = events;
            await renderEvents();

        } catch (error) {
            console.error('Failed to reload events:', error);
        }
    }

    // ========================================
    // Auto Refresh (Optional)
    // ========================================

    let refreshInterval = null;

    function setupAutoRefresh(intervalMs = 300000) {
        refreshInterval = setInterval(async () => {
            console.log('Refreshing EONET data...');
            await reloadEvents();
        }, intervalMs);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // ========================================
    // Public API
    // ========================================

    global.VeVitEarth.app = {
        init,
        reloadEvents,
        setupAutoRefresh,
        stopAutoRefresh
    };

    // ========================================
    // Bootstrap
    // ========================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);