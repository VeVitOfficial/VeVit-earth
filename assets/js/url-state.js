/**
 * VeVit Earth — URL State Module
 *
 * Handles URL parameter synchronization for shareable links
 * and state restoration on page load.
 *
 * @module url-state
 */

(function(global) {
    'use strict';

    // ========================================
    // Configuration
    // ========================================

    const CONFIG = {
        // URL parameter names
        params: {
            lat: 'lat',
            lon: 'lon',
            alt: 'alt',
            event: 'event',
            days: 'days',
            categories: 'categories',
            view: 'view'
        },
        // Throttle for updates
        throttleMs: 500
    };

    // ========================================
    // State
    // ========================================

    let currentState = {};
    let updateScheduled = false;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize URL state management
     */
    function init() {
        // Read current URL state on load
        const params = readUrlState();

        // Apply to application state
        if (params.lat && params.lon) {
            currentState.lat = parseFloat(params.lat);
            currentState.lon = parseFloat(params.lon);
            currentState.alt = params.alt ? parseFloat(params.alt) : 1000000;
        }

        if (params.event) {
            currentState.event = params.event;
        }

        if (params.days) {
            currentState.days = params.days;
        }

        if (params.categories) {
            currentState.categories = params.categories.split(',');
        }

        if (params.view) {
            currentState.view = params.view;
        }

        // Setup history state listener
        window.addEventListener('popstate', handlePopState);

        return currentState;
    }

    /**
     * Handle browser back/forward
     */
    function handlePopState(e) {
        if (e.state && e.state.vevitEarth) {
            const state = e.state.vevitEarth;

            // Apply state without pushing to history
            if (state.lat && state.lon && window.VeVitEarth.globe) {
                window.VeVitEarth.globe.flyToCoordinates(
                    state.lon,
                    state.lat,
                    state.alt || 1000000,
                    1
                );
            }

            if (state.event) {
                const event = window.VeVitEarth.events.find(e => e.id === state.event);
                if (event && window.VeVitEarth.ui) {
                    window.VeVitEarth.ui.showDetail(event);
                }
            }
        }
    }

    // ========================================
    // Reading State
    // ========================================

    /**
     * Read URL parameters
     */
    function readUrlState() {
        const params = new URLSearchParams(window.location.search);
        const state = {};

        const lat = params.get(CONFIG.params.lat);
        const lon = params.get(CONFIG.params.lon);

        if (lat && lon) {
            state.lat = lat;
            state.lon = lon;

            const alt = params.get(CONFIG.params.alt);
            if (alt) {
                state.alt = alt;
            }
        }

        const event = params.get(CONFIG.params.event);
        if (event) {
            state.event = event;
        }

        const days = params.get(CONFIG.params.days);
        if (days) {
            state.days = days;
        }

        const categories = params.get(CONFIG.params.categories);
        if (categories) {
            state.categories = categories;
        }

        const view = params.get(CONFIG.params.view);
        if (view) {
            state.view = view;
        }

        return state;
    }

    // ========================================
    // Writing State
    // ========================================

    /**
     * Update URL state (throttled)
     */
    function updateUrlState(updates) {
        // Merge updates
        currentState = { ...currentState, ...updates };

        // Schedule update
        if (!updateScheduled) {
            updateScheduled = true;
            setTimeout(() => {
                pushToHistory();
                updateScheduled = false;
            }, CONFIG.throttleMs);
        }
    }

    /**
     * Push current state to browser history
     */
    function pushToHistory() {
        const params = new URLSearchParams();

        // Camera position
        if (currentState.lat && currentState.lon) {
            params.set(CONFIG.params.lat, currentState.lat.toFixed(4));
            params.set(CONFIG.params.lon, currentState.lon.toFixed(4));

            if (currentState.alt) {
                params.set(CONFIG.params.alt, Math.round(currentState.alt).toString());
            }
        }

        // Active event
        if (currentState.event) {
            params.set(CONFIG.params.event, currentState.event);
        }

        // Time filter
        if (currentState.days) {
            params.set(CONFIG.params.days, currentState.days.toString());
        }

        // Category filters
        if (currentState.categories && currentState.categories.length > 0) {
            params.set(CONFIG.params.categories, currentState.categories.join(','));
        }

        // View mode
        if (currentState.view) {
            params.set(CONFIG.params.view, currentState.view);
        }

        // Build URL
        const queryString = params.toString();
        const newUrl = queryString
            ? `${window.location.pathname}?${queryString}`
            : window.location.pathname;

        // Push to history
        window.history.pushState(
            { vevitEarth: { ...currentState } },
            '',
            newUrl
        );
    }

    /**
     * Replace URL without adding history entry
     */
    function replaceUrl(updates) {
        currentState = { ...currentState, ...updates };

        const params = new URLSearchParams();

        if (currentState.lat && currentState.lon) {
            params.set(CONFIG.params.lat, currentState.lat.toFixed(4));
            params.set(CONFIG.params.lon, currentState.lon.toFixed(4));
            if (currentState.alt) {
                params.set(CONFIG.params.alt, Math.round(currentState.alt).toString());
            }
        }

        if (currentState.event) {
            params.set(CONFIG.params.event, currentState.event);
        }

        if (currentState.days) {
            params.set(CONFIG.params.days, currentState.days.toString());
        }

        if (currentState.categories && currentState.categories.length > 0) {
            params.set(CONFIG.params.categories, currentState.categories.join(','));
        }

        if (currentState.view) {
            params.set(CONFIG.params.view, currentState.view);
        }

        const queryString = params.toString();
        const newUrl = queryString
            ? `${window.location.pathname}?${queryString}`
            : window.location.pathname;

        window.history.replaceState(
            { vevitEarth: { ...currentState } },
            '',
            newUrl
        );
    }

    // ========================================
    // Share Link
    // ========================================

    /**
     * Generate shareable link for current state
     */
    function getShareUrl() {
        const params = new URLSearchParams();

        if (currentState.lat && currentState.lon) {
            params.set(CONFIG.params.lat, currentState.lat.toFixed(4));
            params.set(CONFIG.params.lon, currentState.lon.toFixed(4));
            if (currentState.alt) {
                params.set(CONFIG.params.alt, Math.round(currentState.alt).toString());
            }
        }

        if (currentState.event) {
            params.set(CONFIG.params.event, currentState.event);
        }

        const queryString = params.toString();
        return queryString
            ? `${window.location.origin}${window.location.pathname}?${queryString}`
            : window.location.href;
    }

    /**
     * Generate shareable link for specific event
     */
    function getEventUrl(eventId) {
        const event = window.VeVitEarth.events.find(e => e.id === eventId);
        const params = new URLSearchParams();

        params.set(CONFIG.params.event, eventId);

        if (event && event.coordinates) {
            params.set(CONFIG.params.lat, event.coordinates[1].toFixed(4));
            params.set(CONFIG.params.lon, event.coordinates[0].toFixed(4));
            params.set(CONFIG.params.alt, '500000');
        }

        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }

    /**
     * Copy share link to clipboard
     */
    function copyShareLink(eventId = null) {
        const url = eventId ? getEventUrl(eventId) : getShareUrl();

        return navigator.clipboard.writeText(url).then(() => {
            return url;
        });
    }

    // ========================================
    // State Application
    // ========================================

    /**
     * Apply initial state from URL
     */
    async function applyInitialState() {
        const state = currentState;

        // Apply time filter
        if (state.days) {
            const days = parseInt(state.days);
            if (window.VeVitEarth.ui) {
                window.VeVitEarth.ui.updateTimeFilterUI(days);
            }
        }

        // Apply category filters
        if (state.categories && state.categories.length > 0) {
            state.categories.forEach(cat => {
                const btn = document.querySelector(`[data-category="${cat}"]`);
                if (btn) {
                    btn.classList.add('active');
                }
            });
        }

        // Apply view mode
        if (state.view) {
            const is3D = state.view === '3d';
            const viewModeEl = document.getElementById('view-mode');
            if (viewModeEl) {
                viewModeEl.textContent = is3D ? '3D' : '2D';
            }
        }

        // Fly to position
        if (state.lat && state.lon && window.VeVitEarth.globe) {
            // Wait for globe to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            window.VeVitEarth.globe.flyToCoordinates(
                state.lon,
                state.lat,
                state.alt || 1000000,
                0 // Instant
            );
        }

        // Open event detail
        if (state.event) {
            // Wait for events to load
            const checkEvents = setInterval(() => {
                const event = window.VeVitEarth.events.find(e => e.id === state.event);
                if (event) {
                    clearInterval(checkEvents);

                    if (window.VeVitEarth.ui) {
                        window.VeVitEarth.ui.showDetail(event);
                    }

                    if (window.VeVitEarth.globe) {
                        window.VeVitEarth.globe.flyToEvent(event);
                    }
                }
            }, 500);

            // Timeout after 10 seconds
            setTimeout(() => clearInterval(checkEvents), 10000);
        }
    }

    /**
     * Update camera position in state
     */
    function updateCameraPosition(lat, lon, alt) {
        updateUrlState({
            lat: lat,
            lon: lon,
            alt: alt
        });
    }

    /**
     * Update active event in state
     */
    function updateActiveEvent(eventId) {
        if (eventId) {
            updateUrlState({ event: eventId });
        } else {
            delete currentState.event;
            pushToHistory();
        }
    }

    /**
     * Update time filter in state
     */
    function updateTimeFilter(days) {
        updateUrlState({ days: days });
    }

    /**
     * Update category filters in state
     */
    function updateCategories(categories) {
        if (categories && categories.length > 0) {
            updateUrlState({ categories: categories });
        } else {
            delete currentState.categories;
            pushToHistory();
        }
    }

    // ========================================
    // Export
    // ========================================

    global.VeVitEarth = global.VeVitEarth || {};
    global.VeVitEarth.url = {
        init,
        readUrlState,
        updateUrlState,
        replaceUrl,
        getShareUrl,
        getEventUrl,
        copyShareLink,
        applyInitialState,
        updateCameraPosition,
        updateActiveEvent,
        updateTimeFilter,
        updateCategories,
        getState: () => ({ ...currentState })
    };

})(window);