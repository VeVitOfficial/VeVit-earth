/**
 * VeVit Earth — Geocoding Module
 *
 * Handles location search using Nominatim (OpenStreetMap) API
 * with debounce and autocomplete functionality.
 *
 * @module geocoding
 */

(function(global) {
    'use strict';

    // ========================================
    // Configuration
    // ========================================

    const CONFIG = {
        apiUrl: 'https://nominatim.openstreetmap.org/search',
        debounceMs: 400,
        limit: 5,
        minChars: 2
    };

    // ========================================
    // State
    // ========================================

    let debounceTimer = null;
    let currentResults = [];
    let selectedIndex = -1;

    // ========================================
    // DOM Elements
    // ========================================

    let searchInput = null;
    let searchResults = null;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize geocoding
     */
    function init() {
        searchInput = document.getElementById('search-input');
        searchResults = document.getElementById('search-results');

        if (!searchInput || !searchResults) {
            return Promise.resolve();
        }

        // Setup input event listener with debounce
        searchInput.addEventListener('input', handleInput);
        searchInput.addEventListener('keydown', handleKeydown);
        searchInput.addEventListener('focus', handleFocus);
        searchInput.addEventListener('blur', handleBlur);

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                hideResults();
            }
        });

        return Promise.resolve();
    }

    // ========================================
    // Event Handlers
    // ========================================

    /**
     * Handle input change
     */
    function handleInput(e) {
        const query = e.target.value.trim();

        // Clear previous timer
        clearTimeout(debounceTimer);

        // Hide results if too short
        if (query.length < CONFIG.minChars) {
            hideResults();
            currentResults = [];
            return;
        }

        // Debounce search
        debounceTimer = setTimeout(() => {
            searchLocation(query);
        }, CONFIG.debounceMs);
    }

    /**
     * Handle keyboard navigation
     */
    function handleKeydown(e) {
        if (!searchResults.classList.contains('hidden')) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    navigateResults(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    navigateResults(-1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    selectResult();
                    break;
                case 'Escape':
                    hideResults();
                    break;
            }
        }
    }

    /**
     * Handle focus on input
     */
    function handleFocus() {
        if (currentResults.length > 0) {
            showResults();
        }
    }

    /**
     * Handle blur from input
     */
    function handleBlur(e) {
        // Delay to allow click on results
        setTimeout(() => {
            if (!searchResults.contains(document.activeElement)) {
                hideResults();
            }
        }, 200);
    }

    /**
     * Navigate through results
     */
    function navigateResults(direction) {
        const items = searchResults.querySelectorAll('.search-result');
        if (items.length === 0) return;

        // Update selected index
        selectedIndex += direction;
        if (selectedIndex < 0) selectedIndex = items.length - 1;
        if (selectedIndex >= items.length) selectedIndex = 0;

        // Update UI
        items.forEach((item, index) => {
            item.classList.toggle('bg-brand-500/20', index === selectedIndex);
        });
    }

    /**
     * Select current result
     */
    function selectResult() {
        if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
            const result = currentResults[selectedIndex];
            selectLocation(result);
        }
    }

    // ========================================
    // API Functions
    // ========================================

    /**
     * Search for location
     */
    async function searchLocation(query) {
        try {
            const params = new URLSearchParams({
                q: query,
                format: 'json',
                limit: CONFIG.limit,
                addressdetails: 1
            });

            // Add language preference
            params.set('accept-language', 'cs,en');

            const response = await fetch(`${CONFIG.apiUrl}?${params.toString()}`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const results = await response.json();
            currentResults = normalizeResults(results);
            selectedIndex = -1;

            renderResults();

        } catch (error) {
            console.error('Geocoding error:', error);
            currentResults = [];
            hideResults();
        }
    }

    /**
     * Normalize Nominatim results
     */
    function normalizeResults(results) {
        return results.map(result => {
            // Extract display name parts
            const parts = result.display_name.split(', ');
            const name = parts[0];
            const region = parts.slice(1, 3).join(', ');

            return {
                name: name,
                region: region,
                fullName: result.display_name,
                lat: parseFloat(result.lat),
                lon: parseFloat(result.lon),
                type: result.type,
                category: result.class,
                osmId: result.osm_id
            };
        });
    }

    /**
     * Render search results dropdown
     */
    function renderResults() {
        if (currentResults.length === 0) {
            hideResults();
            return;
        }

        searchResults.innerHTML = currentResults.map((result, index) => `
            <div class="search-result ${index === selectedIndex ? 'bg-brand-500/20' : ''}"
                 data-index="${index}"
                 onclick="VeVitEarth.geocoding.selectLocation(VeVitEarth.geocoding.getCurrentResults()[${index}])">
                <div class="font-medium text-white">${escapeHtml(result.name)}</div>
                <div class="text-xs text-slate-400">${escapeHtml(result.region)}</div>
            </div>
        `).join('');

        showResults();
    }

    /**
     * Show results dropdown
     */
    function showResults() {
        searchResults.classList.remove('hidden');
    }

    /**
     * Hide results dropdown
     */
    function hideResults() {
        searchResults.classList.add('hidden');
    }

    /**
     * Select location and fly to it
     */
    function selectLocation(result) {
        // Update input
        if (searchInput) {
            searchInput.value = result.name;
        }

        // Hide results
        hideResults();

        // Fly to location
        if (window.VeVitEarth.globe) {
            // Determine altitude based on type
            let altitude = 50000; // Default 50km

            if (result.type === 'city' || result.type === 'town') {
                altitude = 50000;
            } else if (result.type === 'village') {
                altitude = 20000;
            } else if (result.category === 'boundary' && result.type === 'administrative') {
                altitude = 200000;
            } else if (result.category === 'place') {
                altitude = 100000;
            }

            window.VeVitEarth.globe.flyToCoordinates(result.lon, result.lat, altitude, 2);
        }

        // Add temporary marker (optional enhancement)
        // Could add a marker that disappears after a few seconds
    }

    /**
     * Get current results (for onclick handler)
     */
    function getCurrentResults() {
        return currentResults;
    }

    // ========================================
    // Utility Functions
    // ========================================

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Clear search input
     */
    function clearSearch() {
        if (searchInput) {
            searchInput.value = '';
        }
        currentResults = [];
        hideResults();
    }

    // ========================================
    // Export
    // ========================================

    global.VeVitEarth = global.VeVitEarth || {};
    global.VeVitEarth.geocoding = {
        init,
        searchLocation,
        selectLocation,
        getCurrentResults,
        clearSearch
    };

})(window);