<?php
/**
 * VeVit Earth — NASA EONET API Proxy
 *
 * Proxies requests to NASA EONET API with 15-minute caching
 * to reduce server load and improve response times.
 *
 * @package VeVit Earth
 * @author VeVit Team
 */

// Set headers FIRST before any output
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Max-Age: 86400');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Error handling - return JSON, not HTML errors
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Configuration
define('EONET_BASE_URL', 'https://eonet.gsfc.nasa.gov/api/v3/');
define('CACHE_DIR', __DIR__ . '/cache/');
define('CACHE_TTL', 900); // 15 minutes in seconds
define('USER_AGENT', 'VeVit Earth/1.0 (https://vevit.fun)');

// Check cURL availability
if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'cURL extension not available',
        'data' => null
    ]);
    exit;
}

// Ensure cache directory exists with proper permissions
if (!is_dir(CACHE_DIR)) {
    @mkdir(CACHE_DIR, 0755, true);
}

// Create .htaccess to deny direct access
$htaccessPath = CACHE_DIR . '.htaccess';
if (!file_exists($htaccessPath)) {
    @file_put_contents($htaccessPath, "Deny from all\n");
}

/**
 * Build EONET API URL from request parameters
 */
function buildEonetUrl(): string {
    $endpoint = isset($_GET['endpoint']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['endpoint']) : 'events';

    // Allowed endpoints
    $allowedEndpoints = ['events', 'categories', 'layers', 'sources'];
    if (!in_array($endpoint, $allowedEndpoints)) {
        $endpoint = 'events';
    }

    $url = EONET_BASE_URL . $endpoint;

    // Build query parameters
    $params = [];

    // Days filter
    if (isset($_GET['days']) && is_numeric($_GET['days'])) {
        $days = (int)$_GET['days'];
        if ($days > 0 && $days <= 365) {
            $params['days'] = $days;
        }
    }

    // Category filter
    if (isset($_GET['category'])) {
        $category = preg_replace('/[^a-zA-Z]/', '', $_GET['category']);
        if (!empty($category)) {
            $params['category'] = $category;
        }
    }

    // Status filter
    if (isset($_GET['status'])) {
        $status = preg_replace('/[^a-zA-Z]/', '', $_GET['status']);
        if (in_array($status, ['open', 'closed', 'all'])) {
            $params['status'] = $status;
        }
    }

    // Limit
    if (isset($_GET['limit']) && is_numeric($_GET['limit'])) {
        $limit = (int)$_GET['limit'];
        if ($limit > 0 && $limit <= 500) {
            $params['limit'] = $limit;
        }
    }

    if (!empty($params)) {
        $url .= '?' . http_build_query($params);
    }

    return $url;
}

/**
 * Generate cache key from URL
 */
function getCacheKey(string $url): string {
    return md5($url);
}

/**
 * Get cached response if valid
 */
function getCached(string $key): ?array {
    $cacheFile = CACHE_DIR . $key . '.json';

    if (!file_exists($cacheFile)) {
        return null;
    }

    $fileTime = @filemtime($cacheFile);
    if (!$fileTime || (time() - $fileTime) > CACHE_TTL) {
        return null;
    }

    $content = @file_get_contents($cacheFile);
    if ($content === false) {
        return null;
    }

    $data = json_decode($content, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return null;
    }

    return [
        'data' => $content,
        'cached' => true,
        'age' => time() - $fileTime
    ];
}

/**
 * Find most recent cached file by modification time
 */
function getLatestCache(): ?string {
    $files = @glob(CACHE_DIR . '*.json');

    if (empty($files)) {
        return null;
    }

    // Sort by modification time (most recent first)
    usort($files, function($a, $b) {
        return @filemtime($b) - @filemtime($a);
    });

    return @file_get_contents($files[0]);
}

/**
 * Fetch data from EONET API
 */
function fetchFromEonet(string $url): array {
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_USERAGENT => USER_AGENT,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_ENCODING => 'gzip, deflate',
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Cache-Control: no-cache'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    curl_close($ch);

    if ($error) {
        return [
            'success' => false,
            'error' => $error,
            'httpCode' => $httpCode
        ];
    }

    if ($httpCode !== 200) {
        return [
            'success' => false,
            'error' => "HTTP error: $httpCode",
            'httpCode' => $httpCode
        ];
    }

    return [
        'success' => true,
        'data' => $response,
        'httpCode' => $httpCode
    ];
}

/**
 * Save response to cache
 */
function saveToCache(string $key, string $data): bool {
    $cacheFile = CACHE_DIR . $key . '.json';
    return @file_put_contents($cacheFile, $data) !== false;
}

/**
 * Clean old cache files (older than 24 hours)
 */
function cleanOldCache(): void {
    $files = @glob(CACHE_DIR . '*.json');
    if ($files === false) return;

    $threshold = time() - 86400; // 24 hours

    foreach ($files as $file) {
        if (@filemtime($file) < $threshold) {
            @unlink($file);
        }
    }
}

// Main execution
try {
    // Clean old cache files occasionally (1% chance)
    if (rand(1, 100) === 1) {
        cleanOldCache();
    }

    $url = buildEonetUrl();
    $cacheKey = getCacheKey($url);

    // Try cache first
    $cached = getCached($cacheKey);
    if ($cached) {
        echo json_encode([
            'success' => true,
            'data' => json_decode($cached['data'], true),
            'meta' => [
                'cached' => true,
                'age' => $cached['age'] . ' seconds',
                'source' => 'cache'
            ]
        ]);
        exit;
    }

    // Fetch from EONET API
    $result = fetchFromEonet($url);

    if (!$result['success']) {
        // Try to return latest cached data as fallback
        $fallbackData = getLatestCache();

        if ($fallbackData) {
            echo json_encode([
                'success' => true,
                'data' => json_decode($fallbackData, true),
                'meta' => [
                    'cached' => true,
                    'stale' => true,
                    'source' => 'fallback_cache',
                    'error' => $result['error'] ?? 'EONET API unavailable'
                ]
            ]);
            exit;
        }

        // No fallback available
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'error' => 'EONET API unavailable and no cached data',
            'details' => $result['error'] ?? 'Unknown error',
            'data' => null
        ]);
        exit;
    }

    // Save to cache
    saveToCache($cacheKey, $result['data']);

    // Return response
    echo json_encode([
        'success' => true,
        'data' => json_decode($result['data'], true),
        'meta' => [
            'cached' => false,
            'source' => 'eonet_api',
            'fetched_at' => date('c')
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error',
        'details' => $e->getMessage(),
        'data' => null
    ]);
}