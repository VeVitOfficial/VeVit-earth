/**
 * VeVit Earth — CesiumJS Globe Module
 *
 * Handles 3D globe initialization, event markers, camera control,
 * and day/night visualization using CesiumJS.
 *
 * @module cesium-globe
 */

(function(global) {
    'use strict';

    // ========================================
    // Configuration
    // ========================================

    const CONFIG = {
        // Initial camera position (view from space)
        initialView: {
            lon: 15,
            lat: 48,
            altitude: 20000000 // 20,000 km
        },
        // Auto-rotate settings
        autoRotate: {
            enabled: true,
            speed: 0.02 // degrees per frame
        },
        // Marker settings
        marker: {
            baseRadius: 50000, // 50 km base radius
            maxRadius: 500000, // 500 km max radius
            pulseScale: 1.5
        },
        // Camera throttle for minimap sync
        cameraThrottle: 100 // ms
    };

    // ========================================
    // State
    // ========================================

    let viewer = null;
    let autoRotateEnabled = true;
    let lastCameraUpdate = 0;
    let eventEntities = {};

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize CesiumJS viewer
     */
    async function init() {
        // Check if Cesium is loaded
        if (typeof Cesium === 'undefined') {
            throw new Error('CesiumJS library not loaded. Check internet connection.');
        }

        // DO NOT set Cesium.Ion.defaultAccessToken - ESRI imagery doesn't need it
        // Setting empty string causes errors

        try {
            // Create viewer with ESRI imagery (no token needed)
            viewer = new Cesium.Viewer('cesium-container', {
                // Terrain (flat - no elevation data)
                terrainProvider: new Cesium.EllipsoidTerrainProvider(),

                // Imagery - ESRI World Imagery (no token needed)
                imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
                    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
                }),

                // Disable default UI
                baseLayerPicker: false,
                geocoder: false,
                homeButton: false,
                sceneModePicker: false,
                navigationHelpButton: false,
                animation: false,
                timeline: false,
                fullscreenButton: false,
                infoBox: false,
                selectionIndicator: false,

                // Scene settings
                shadows: false,
                shouldAnimate: true
            });
        } catch (error) {
            console.error('Cesium viewer creation failed:', error);
            throw new Error('Failed to create 3D globe: ' + error.message);
        }

        // Remove default credit container
        viewer.cesiumWidget.creditContainer.style.display = 'none';

        // Enable lighting for day/night terminator
        viewer.scene.globe.enableLighting = true;

        // Enable fog for atmosphere
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.0001;

        // Set initial view
        await setInitialView();

        // Setup auto-rotate
        setupAutoRotate();

        // Setup camera movement handler
        setupCameraHandler();

        // Setup click handler
        setupClickHandler();

        // Store reference
        window.VeVitEarth.viewer = viewer;

        return viewer;
    }

    /**
     * Set initial camera view
     */
    async function setInitialView() {
        const { lon, lat, altitude } = CONFIG.initialView;

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-90),
                roll: 0
            },
            duration: 2
        });
    }

    /**
     * Setup auto-rotate functionality
     */
    function setupAutoRotate() {
        viewer.clock.onTick.addEventListener(() => {
            if (autoRotateEnabled && window.VeVitEarth.ui.autoRotate) {
                viewer.scene.camera.rotate(
                    Cesium.Cartesian3.UNIT_Z,
                    Cesium.Math.toRadians(CONFIG.autoRotate.speed)
                );
            }
        });

        // Stop auto-rotate on user interaction
        const stopAutoRotate = () => {
            autoRotateEnabled = false;
        };

        viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
        viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;
        viewer.scene.screenSpaceCameraController.inertiaZoom = 0.9;

        // Re-enable auto-rotate after inactivity
        let inactivityTimer = null;
        const restartAutoRotate = () => {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                if (window.VeVitEarth.ui.autoRotate !== false) {
                    autoRotateEnabled = true;
                }
            }, 5000); // 5 seconds of inactivity
        };

        viewer.canvas.addEventListener('mousedown', stopAutoRotate);
        viewer.canvas.addEventListener('touchstart', stopAutoRotate);
        viewer.canvas.addEventListener('mouseup', restartAutoRotate);
        viewer.canvas.addEventListener('touchend', restartAutoRotate);
    }

    /**
     * Setup camera movement handler for HUD and minimap updates
     */
    function setupCameraHandler() {
        viewer.camera.changed.addEventListener(() => {
            const now = Date.now();

            // Throttle updates
            if (now - lastCameraUpdate < CONFIG.cameraThrottle) {
                return;
            }
            lastCameraUpdate = now;

            // Get camera position
            const cartographic = viewer.camera.positionCartographic;
            const lon = Cesium.Math.toDegrees(cartographic.longitude);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            const altitude = cartographic.height;

            // Update HUD
            if (window.VeVitEarth.ui.updateHUD) {
                window.VeVitEarth.ui.updateHUD(lat, lon, altitude);
            }

            // Update minimap
            if (window.VeVitEarth.ui.updateMinimap) {
                window.VeVitEarth.ui.updateMinimap(lat, lon, altitude, viewer.camera.heading);
            }

            // Update compass
            updateCompass(viewer.camera.heading);
        });
    }

    /**
     * Update compass rotation
     */
    function updateCompass(heading) {
        const compass = document.getElementById('compass-needle');
        if (compass) {
            const degrees = Cesium.Math.toDegrees(heading);
            compass.style.transform = `rotate(${-degrees}deg)`;
            compass.style.transformOrigin = '32px 32px';
        }
    }

    /**
     * Setup click handler for event markers
     */
    function setupClickHandler() {
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

        handler.setInputAction((movement) => {
            const pickedObject = viewer.scene.pick(movement.position);

            if (Cesium.defined(pickedObject) && pickedObject.id) {
                const entityId = pickedObject.id.id;
                const event = eventEntities[entityId];

                if (event) {
                    // Stop auto-rotate
                    autoRotateEnabled = false;

                    // Show detail panel
                    if (window.VeVitEarth.ui.showDetail) {
                        window.VeVitEarth.ui.showDetail(event);
                    }
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Hover tooltip
        handler.setInputAction((movement) => {
            const pickedObject = viewer.scene.pick(movement.endPosition);

            if (Cesium.defined(pickedObject) && pickedObject.id) {
                const entityId = pickedObject.id.id;
                const event = eventEntities[entityId];

                if (event) {
                    document.body.style.cursor = 'pointer';
                    // Tooltip is handled by Cesium's built-in label
                } else {
                    document.body.style.cursor = 'default';
                }
            } else {
                document.body.style.cursor = 'default';
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    // ========================================
    // Event Markers
    // ========================================

    /**
     * Get marker radius based on event age
     */
    function getMarkerRadius(event) {
        const ageDays = event.ageDays || 0;
        // Newer events have larger markers
        const ageFactor = Math.max(0.5, 1 - (ageDays / 90)); // Decay over 90 days
        const categoryFactor = event.status === 'open' ? 1 : 0.7; // Closed events smaller

        const radius = CONFIG.marker.baseRadius * ageFactor * categoryFactor;
        return Math.min(Math.max(radius, CONFIG.marker.baseRadius * 0.5), CONFIG.marker.maxRadius);
    }

    /**
     * Get marker color for category
     */
    function getMarkerColor(event) {
        const color = Cesium.Color.fromCssColorString(event.categoryColor);
        return color;
    }

    /**
     * Add event marker to globe
     */
    function addEventMarker(event) {
        if (!event.coordinates || event.coordinates.length < 2) return;

        const [lon, lat] = event.coordinates;
        const position = Cesium.Cartesian3.fromDegrees(lon, lat);
        const color = getMarkerColor(event);
        const radius = getMarkerRadius(event);

        const entity = viewer.entities.add({
            id: event.id,
            position: position,

            // Pulsing ellipse
            ellipse: {
                semiMinorAxis: radius,
                semiMajorAxis: radius,
                material: color.withAlpha(0.3),
                outline: true,
                outlineColor: color,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
            },

            // Center point
            point: {
                pixelSize: 8,
                color: color,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.5, 1.5e7, 0.3)
            },

            // Label (only visible at certain distances) - using first letter as fallback
            label: {
                text: event.categoryLabel.charAt(0).toUpperCase(),
                font: '14px Inter, sans-serif',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 2,
                outlineColor: Cesium.Color.BLACK,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
                scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.2, 1.5e7, 0.5)
            }
        });

        // Store reference
        eventEntities[event.id] = event;

        return entity;
    }

    /**
     * Add all event markers
     */
    function addEventMarkers(events) {
        // Clear existing markers
        clearEventMarkers();

        // Add new markers
        events.forEach(event => {
            addEventMarker(event);
        });

        // Store events
        window.VeVitEarth.events = events;
    }

    /**
     * Clear all event markers
     */
    function clearEventMarkers() {
        Object.keys(eventEntities).forEach(id => {
            viewer.entities.removeById(id);
        });
        eventEntities = {};
    }

    /**
     * Fly to event location
     */
    function flyToEvent(event, duration = 2) {
        if (!event.coordinates) return;

        const [lon, lat] = event.coordinates;
        const altitude = 500000; // 500 km for good view

        autoRotateEnabled = false;

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0
            },
            duration: duration
        });
    }

    /**
     * Fly to coordinates
     */
    function flyToCoordinates(lon, lat, altitude = 1000000, duration = 2) {
        autoRotateEnabled = false;

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0
            },
            duration: duration
        });
    }

    /**
     * Toggle auto-rotate
     */
    function toggleAutoRotate(enabled) {
        autoRotateEnabled = enabled;
        window.VeVitEarth.ui.autoRotate = enabled;
    }

    /**
     * Switch between 3D and 2D
     */
    function setSceneMode(mode3D) {
        if (mode3D) {
            viewer.scene.mode = Cesium.SceneMode.SCENE3D;
        } else {
            viewer.scene.mode = Cesium.SceneMode.SCENE2D;
        }
    }

    // ========================================
    // Layers
    // ========================================

    /**
     * Add imagery layer
     */
    function addImageryLayer(url, options = {}) {
        const provider = new Cesium.UrlTemplateImageryProvider({
            url: url,
            ...options
        });

        return viewer.imageryLayers.addImageryProvider(provider);
    }

    /**
     * Remove all imagery layers except base
     */
    function clearImageryLayers() {
        const layers = viewer.imageryLayers;
        while (layers.length > 1) {
            layers.remove(layers.get(1));
        }
    }

    // ========================================
    // Export
    // ========================================

    global.VeVitEarth = global.VeVitEarth || {};
    global.VeVitEarth.globe = {
        init,
        setInitialView,
        flyToEvent,
        flyToCoordinates,
        toggleAutoRotate,
        setSceneMode,
        addEventMarkers,
        clearEventMarkers,
        addEventMarker,
        addImageryLayer,
        clearImageryLayers,
        getViewer: () => viewer
    };

})(window);