/**
 * VeVit Earth — EONET API Client
 *
 * Handles fetching and normalizing NASA EONET events data
 * with localStorage fallback for offline support.
 *
 * @module eonet-api
 */

(function(global) {
    'use strict';

    // ========================================
    // Configuration
    // ========================================

    const CONFIG = {
        proxyUrl: 'api/eonet-proxy.php', // Relative path - works with http://localhost or production
        cacheKey: 'vevit_eonet_cache',
        maxCacheSize: 200000, // 200KB limit for localStorage
        maxCacheEvents: 50
    };

    // ========================================
    // Event Categories
    // ========================================

    // Lucide icon names for each category
    const CATEGORIES = {
        wildfires: { id: 'wildfires', label: 'Požáry', icon: 'flame', color: '#ef4444' },
        severeStorms: { id: 'severeStorms', label: 'Bouře', icon: 'cloud-lightning', color: '#a855f7' },
        volcanoes: { id: 'volcanoes', label: 'Sopky', icon: 'mountain', color: '#f97316' },
        earthquakes: { id: 'earthquakes', label: 'Zemětřesení', icon: 'activity', color: '#eab308' },
        floods: { id: 'floods', label: 'Záplavy', icon: 'droplets', color: '#06b6d4' },
        seaLakeIce: { id: 'seaLakeIce', label: 'Ledovce', icon: 'snowflake', color: '#7dd3fc' },
        landslides: { id: 'landslides', label: 'Sesuvy', icon: 'mountain-snow', color: '#d97706' },
        snow: { id: 'snow', label: 'Sníh', icon: 'cloud-snow', color: '#cbd5e1' },
        dustHaze: { id: 'dustHaze', label: 'Prach', icon: 'wind', color: '#f59e0b' },
        drought: { id: 'drought', label: 'Sucho', icon: 'sun', color: '#84cc16' },
        manOfOrigin: { id: 'manOfOrigin', label: 'Antropogenní', icon: 'factory', color: '#ec4899' }
    };

    // ========================================
    // Utility Functions
    // ========================================

    /**
     * Calculate age in days from date string
     */
    function calculateAgeDays(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    /**
     * Format relative time (e.g., "před 2 dny")
     */
    function formatRelativeTime(dateStr) {
        const days = calculateAgeDays(dateStr);
        if (days === 0) return 'Dnes';
        if (days === 1) return 'Včera';
        if (days < 7) return `před ${days} dny`;
        if (days < 30) return `před ${Math.floor(days / 7)} týdny`;
        if (days < 365) return `před ${Math.floor(days / 30)} měsíci`;
        return `před ${Math.floor(days / 365)} roky`;
    }

    /**
     * Get primary coordinate from geometry
     */
    function getPrimaryCoordinate(geometry) {
        if (!geometry || !geometry.coordinates) return null;

        // Point
        if (geometry.type === 'Point') {
            return {
                lon: geometry.coordinates[0],
                lat: geometry.coordinates[1]
            };
        }

        // Polygon - use first point of outer ring
        if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
            const coords = geometry.coordinates[0][0];
            return { lon: coords[0], lat: coords[1] };
        }

        // LineString or MultiPoint - use first point
        if ((geometry.type === 'LineString' || geometry.type === 'MultiPoint') && geometry.coordinates[0]) {
            const coords = geometry.coordinates[0];
            return { lon: coords[0], lat: coords[1] };
        }

        // MultiPolygon - use first polygon
        if (geometry.type === 'MultiPolygon' && geometry.coordinates[0]) {
            const coords = geometry.coordinates[0][0][0];
            return { lon: coords[0], lat: coords[1] };
        }

        return null;
    }

    /**
     * Format coordinates for display
     */
    function formatCoordinates(lat, lon) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
    }

    // ========================================
    // Cache Management
    // ========================================

    /**
     * Save events to localStorage (with size limit)
     */
    function saveToLocalStorage(events) {
        try {
            const data = JSON.stringify({
                events: events,
                timestamp: Date.now()
            });

            // Check size
            if (data.length > CONFIG.maxCacheSize) {
                // Reduce to most recent events
                const reduced = events.slice(0, CONFIG.maxCacheEvents);
                const reducedData = JSON.stringify({
                    events: reduced,
                    timestamp: Date.now()
                });
                localStorage.setItem(CONFIG.cacheKey, reducedData);
            } else {
                localStorage.setItem(CONFIG.cacheKey, data);
            }
        } catch (e) {
            // QuotaExceededError - try with even fewer events
            try {
                const minimal = events.slice(0, 25);
                localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
                    events: minimal,
                    timestamp: Date.now()
                }));
            } catch (e2) {
                console.warn('localStorage quota exceeded, skipping cache');
            }
        }
    }

    /**
     * Get cached events from localStorage
     */
    function getFromLocalStorage() {
        try {
            const cached = localStorage.getItem(CONFIG.cacheKey);
            if (!cached) return null;

            const data = JSON.parse(cached);
            return data;
        } catch (e) {
            return null;
        }
    }

    // ========================================
    // API Functions
    // ========================================

    /**
     * Fetch events from EONET API
     */
    async function fetchEvents(options = {}) {
        const { days = 30, category = null, status = 'open' } = options;

        // Build query parameters
        const params = new URLSearchParams();
        params.set('endpoint', 'events');
        if (days && days !== 'all') params.set('days', days);
        if (category) params.set('category', category);
        if (status) params.set('status', status);

        console.log('Fetching EONET events:', params.toString());

        try {
            // Try PHP proxy first
            const response = await fetch(`${CONFIG.proxyUrl}?${params.toString()}`);

            if (!response.ok) {
                // If proxy returns 404 or 500, try direct API (for local dev)
                if (response.status === 404 || response.status >= 500) {
                    console.warn('Proxy unavailable, trying direct EONET API (may have CORS issues)');
                    return await fetchDirectFromEonet(params);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'API error');
            }

            console.log('EONET response:', result);

            // Update lastUpdated timestamp
            if (result.meta?.fetched_at) {
                window.VeVitEarth.lastUpdated = new Date(result.meta.fetched_at).getTime();
            } else {
                window.VeVitEarth.lastUpdated = Date.now();
            }

            // Normalize and cache
            const events = normalizeEvents(result.data?.events || []);
            window.VeVitEarth.events = events;

            // Save to localStorage
            saveToLocalStorage(events);

            return { events, meta: result.meta };

        } catch (error) {
            console.error('EONET API error:', error);

            // Try localStorage fallback
            const cached = getFromLocalStorage();
            if (cached && cached.events) {
                console.warn('Using cached EONET data');
                window.VeVitEarth.events = cached.events;
                window.VeVitEarth.lastUpdated = cached.timestamp;
                return { events: cached.events, meta: { cached: true, stale: true } };
            }

            // No fallback available - return empty array instead of throwing
            console.warn('No cached data available, returning empty array');
            window.VeVitEarth.events = [];
            return { events: [], meta: { cached: false, error: error.message } };
        }
    }

    /**
     * Fallback: Fetch directly from EONET API (may have CORS issues)
     */
    async function fetchDirectFromEonet(params) {
        const url = `https://eonet.gsfc.nasa.gov/api/v3/events?${params.toString()}`;
        console.log('Fetching directly from EONET:', url);

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`EONET API error: ${response.status}`);
        }

        const data = await response.json();

        window.VeVitEarth.lastUpdated = Date.now();
        const events = normalizeEvents(data.events || []);
        window.VeVitEarth.events = events;
        saveToLocalStorage(events);

        return { events, meta: { source: 'eonet_direct', cached: false } };
    }

    /**
     * Fetch categories from EONET API
     */
    async function fetchCategories() {
        const params = new URLSearchParams();
        params.set('endpoint', 'categories');

        try {
            const response = await fetch(`${CONFIG.proxyUrl}?${params.toString()}`);
            const result = await response.json();
            return result.data || [];
        } catch (error) {
            console.error('EONET categories error:', error);
            return Object.values(CATEGORIES);
        }
    }

    /**
     * Normalize raw EONET event to our format
     */
    function normalizeEvents(rawEvents) {
        return rawEvents.map(event => {
            // Get primary category
            const categoryId = event.categories?.[0]?.id || 'unknown';
            const category = CATEGORIES[categoryId] || {
                id: categoryId,
                label: categoryId,
                icon: '📍',
                color: '#64748b'
            };

            // Get primary geometry
            const geometry = event.geometry?.[0];
            const coord = getPrimaryCoordinate(geometry);

            // Calculate age
            const dateStart = event.geometry?.[0]?.date || event.closed || event.id;
            const ageDays = dateStart ? calculateAgeDays(dateStart) : null;

            return {
                id: event.id,
                title: event.title,
                description: event.description || '',
                category: category.id,
                categoryLabel: category.label,
                categoryIcon: category.icon,
                categoryColor: category.color,
                coordinates: coord ? [coord.lon, coord.lat] : null,
                geometryType: geometry?.type || 'Point',
                allCoordinates: geometry?.coordinates || [],
                dateStart: dateStart || null,
                dateEnd: event.closed || null,
                source: event.sources?.[0]?.url || null,
                sourceName: event.sources?.[0]?.id || 'NASA EONET',
                ageDays: ageDays,
                relativeTime: dateStart ? formatRelativeTime(dateStart) : 'Neznámé',
                status: event.closed ? 'closed' : 'open'
            };
        }).filter(event => event.coordinates); // Filter out events without coordinates
    }

    /**
     * Find similar events within radius
     */
    function findSimilarEvents(event, radiusKm = 500) {
        const allEvents = window.VeVitEarth.events || [];
        const [eventLon, eventLat] = event.coordinates;

        return allEvents
            .filter(e => e.id !== event.id && e.category === event.category)
            .map(e => {
                const distance = calculateDistance(
                    eventLat, eventLon,
                    e.coordinates[1], e.coordinates[0]
                );
                return { ...e, distance };
            })
            .filter(e => e.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5);
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Get event statistics
     */
    function getStatistics() {
        const events = window.VeVitEarth.events || [];

        // Count by category
        const categoryCounts = {};
        events.forEach(event => {
            categoryCounts[event.category] = (categoryCounts[event.category] || 0) + 1;
        });

        // Sort by count
        const topCategories = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id, count]) => ({
                ...CATEGORIES[id],
                count
            }));

        return {
            total: events.length,
            active: events.filter(e => e.status === 'open').length,
            topCategories,
            categoryCounts
        };
    }

    // ========================================
    // Export
    // ========================================

    global.VeVitEarth = global.VeVitEarth || {};
    global.VeVitEarth.eonet = {
        CATEGORIES,
        fetchEvents,
        fetchCategories,
        normalizeEvents,
        findSimilarEvents,
        getStatistics,
        calculateDistance,
        formatCoordinates,
        formatRelativeTime,
        calculateAgeDays
    };

})(window);