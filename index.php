<?php
/**
 * XTen National Directory & People Portal - Dynamic Pre-Rendering Engine
 * 
 * Provides server-side metadata injection for search crawlers (Googlebot, Bingbot, social media scrapers)
 * while maintaining 100% compatibility with the vanilla client-side SPA.
 */

$requestUri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$abn = $_GET['abn'] ?? null;
$state = $_GET['state'] ?? null;
$suburb = $_GET['suburb'] ?? null;
$category = $_GET['category'] ?? null;
$host = $_SERVER['HTTP_HOST'] ?? 'directory.xten.au';
$isPeoplePortal = (strpos($host, 'people') !== false) || (($_GET['portal'] ?? '') === 'people');

// If ABN not in $_GET, try matching path regex /abn/{11} or /entity/{11} or /verify/{11}
if (!$abn && preg_match('#^/(?:abn|entity|verify)/([0-9]{11})/?$#', $requestUri, $m)) {
    $abn = $m[1];
}

// Read index.html template
$htmlFile = __DIR__ . '/index.html';
if (!file_exists($htmlFile)) {
    http_response_code(500);
    echo "index.html template not found";
    exit;
}
$html = file_get_contents($htmlFile);

function formatAbn($abn) {
    $clean = preg_replace('/[^0-9]/', '', (string)$abn);
    if (strlen($clean) === 11) {
        return substr($clean, 0, 2) . ' ' . substr($clean, 2, 3) . ' ' . substr($clean, 5, 3) . ' ' . substr($clean, 8);
    }
    return $abn;
}

// 1. If ABN is present, fetch entity details and inject metadata
if ($abn && preg_match('/^[0-9]{11}$/', $abn)) {
    $cacheDir = sys_get_temp_dir() . '/xten_dir_cache';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
    }
    $cacheFile = $cacheDir . '/abn_' . $abn . '.json';
    $item = null;
    $portalType = 'entity';

    // Check disk cache (valid for 24 hours)
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 86400)) {
        $cachedData = json_decode(file_get_contents($cacheFile), true);
        if ($cachedData && isset($cachedData['item'])) {
            $item = $cachedData['item'];
            $portalType = $cachedData['portalType'] ?? 'entity';
        }
    }

    if (!$item) {
        $apiBase = 'https://stack-internal.xten.au/api/v1/directory';
        $endpoints = $isPeoplePortal ? ['person', 'entity'] : ['entity', 'person'];
        
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 1.8,
                'ignore_errors' => true,
                'header' => "User-Agent: XTenDirectoryPreRenderer/1.0\r\n"
            ]
        ]);

        foreach ($endpoints as $ep) {
            $resp = @file_get_contents("{$apiBase}/{$ep}/{$abn}", false, $ctx);
            if ($resp) {
                $json = json_decode($resp, true);
                if (isset($json[$ep])) {
                    $item = $json[$ep];
                    $portalType = $ep;
                    @file_put_contents($cacheFile, json_encode([
                        'item' => $item,
                        'portalType' => $portalType,
                        'cached_at' => time()
                    ]));
                    break;
                }
            }
        }
    }

    if ($item) {
        $name = trim($item['name'] ?? ($isPeoplePortal ? 'Registered Professional' : 'Australian Commercial Entity'));
        $tradingNames = $item['trading_names'] ?? [];
        $displayName = !empty($tradingNames) ? $tradingNames[0] : $name;
        $abnFormatted = formatAbn($abn);
        $acn = $item['acn'] ?? null;
        $stateCode = $item['state'] ?? '';
        $postcode = $item['postcode'] ?? '';
        $entityType = $item['entity_type'] ?? 'Australian Entity';
        $locationStr = trim("{$stateCode} {$postcode}");

        // Build Custom SEO Title & Description
        $seoTitle = "{$displayName} (ABN {$abnFormatted}) — Australian Entity Profile | XTen National Register";
        $seoDesc = "Verified business records and statutory compliance for {$displayName} (ABN {$abnFormatted}" . ($acn ? ", ACN {$acn}" : "") . ", {$entityType})" . ($locationStr ? " in {$locationStr}" : "") . ". XTen National Register official Australian listing.";
        $canonicalUrl = "https://{$host}/abn/{$abn}";

        // Replace Title
        $html = preg_replace('#<title>.*?</title>#i', '<title>' . htmlspecialchars($seoTitle, ENT_QUOTES, 'UTF-8') . '</title>', $html, 1);

        // Replace Meta Description
        $html = preg_replace('#<meta\s+name="description"\s+content=".*?"\s*/?>#i', '<meta name="description" content="' . htmlspecialchars($seoDesc, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);

        // Replace Canonical
        $html = preg_replace('#<link\s+rel="canonical".*?href=".*?"\s*/?>#i', '<link rel="canonical" id="canonicalTag" href="' . htmlspecialchars($canonicalUrl, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);

        // Replace OG Tags
        $html = preg_replace('#<meta\s+property="og:title".*?content=".*?"\s*/?>#i', '<meta property="og:title" id="ogTitle" content="' . htmlspecialchars($seoTitle, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);
        $html = preg_replace('#<meta\s+property="og:description".*?content=".*?"\s*/?>#i', '<meta property="og:description" id="ogDesc" content="' . htmlspecialchars($seoDesc, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);
        $html = preg_replace('#<meta\s+property="og:url".*?content=".*?"\s*/?>#i', '<meta property="og:url" id="ogUrl" content="' . htmlspecialchars($canonicalUrl, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);

        // Replace Twitter Tags
        $html = preg_replace('#<meta\s+name="twitter:title".*?content=".*?"\s*/?>#i', '<meta name="twitter:title" id="twTitle" content="' . htmlspecialchars($seoTitle, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);
        $html = preg_replace('#<meta\s+name="twitter:description".*?content=".*?"\s*/?>#i', '<meta name="twitter:description" id="twDesc" content="' . htmlspecialchars($seoDesc, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);

        // Build Schema.org JSON-LD
        $schemaType = ($portalType === 'person') ? 'Person' : ((stripos($entityType, 'Company') !== false) ? 'Corporation' : 'LocalBusiness');
        $schema = [
            '@context' => 'https://schema.org',
            '@type' => $schemaType,
            '@id' => "{$canonicalUrl}#entity",
            'name' => $displayName,
            'legalName' => $name,
            'taxID' => $abn,
            'identifier' => [
                '@type' => 'PropertyValue',
                'name' => 'ABN',
                'value' => $abn
            ],
            'url' => $canonicalUrl
        ];
        if ($acn) $schema['vatID'] = $acn;
        if (!empty($tradingNames)) $schema['alternateName'] = array_values(array_unique($tradingNames));
        if ($stateCode || $postcode) {
            $schema['address'] = [
                '@type' => 'PostalAddress',
                'addressRegion' => $stateCode,
                'postalCode' => $postcode,
                'addressCountry' => 'AU'
            ];
        }
        $schemaScript = '<script type="application/ld+json" id="entity-pre-rendered-ld">' . json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>';

        // Inject Schema into <head>
        $html = str_replace('</head>', "  " . $schemaScript . "\n</head>", $html);

        // Inject <noscript> crawler block right inside <body>
        $noscriptBlock = '<noscript>' .
            '<div style="max-width:800px;margin:20px auto;padding:24px;border:1px solid #334155;border-radius:8px;font-family:sans-serif;background:#0f172a;color:#f8fafc;">' .
            '<h1 style="color:#38bdf8;font-size:24px;margin-bottom:8px;">' . htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8') . '</h1>' .
            '<p style="color:#94a3b8;font-size:14px;margin-bottom:16px;">Legal Entity: <strong>' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . '</strong> · Type: ' . htmlspecialchars($entityType, ENT_QUOTES, 'UTF-8') . '</p>' .
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;background:#1e293b;padding:16px;border-radius:6px;">' .
            '<div><strong>ABN:</strong> ' . htmlspecialchars($abnFormatted, ENT_QUOTES, 'UTF-8') . ' (' . htmlspecialchars($item['abn_status'] ?? 'Active', ENT_QUOTES, 'UTF-8') . ')</div>' .
            ($acn ? '<div><strong>ACN:</strong> ' . htmlspecialchars($acn, ENT_QUOTES, 'UTF-8') . '</div>' : '') .
            '<div><strong>Location:</strong> ' . htmlspecialchars($locationStr ?: 'Australia', ENT_QUOTES, 'UTF-8') . '</div>' .
            '<div><strong>GST Registered:</strong> ' . (($item['gst_status'] ?? '') === 'ACT' ? 'Yes' : 'No') . '</div>' .
            '</div>' .
            '<p style="font-size:13px;color:#94a3b8;">XTen National Registry statutory verification record. For full interactive verification, contact actions, and anti-scam checks, enable JavaScript in your browser.</p>' .
            '</div></noscript>';

        $html = preg_replace('#<body(.*?)>#i', '<body$1>' . "\n" . $noscriptBlock, $html, 1);
    }
} elseif ($state || $category) {
    // 2. Category / Location SEO Title & Meta
    $parts = [];
    if ($category) $parts[] = ucwords(str_replace(['-', '_'], ' ', $category));
    if ($suburb) $parts[] = ucwords(str_replace(['-', '_'], ' ', $suburb));
    if ($state) $parts[] = strtoupper($state);

    $label = implode(' in ', array_filter([$category ? ucwords(str_replace(['-', '_'], ' ', $category)) : null, $suburb ? ucwords(str_replace(['-', '_'], ' ', $suburb)) : null]));
    if ($state && !$suburb) $label .= ($label ? " in " : "") . strtoupper($state);

    $seoTitle = ($label ? "{$label} — " : "") . "Verified Australian Business Directory | XTen National Register";
    $seoDesc = "Browse verified Australian businesses, contractors, companies, and licensed professionals" . ($label ? " in {$label}" : "") . " on the official XTen National Register.";
    $canonicalUrl = "https://{$host}" . htmlspecialchars($requestUri, ENT_QUOTES, 'UTF-8');

    $html = preg_replace('#<title>.*?</title>#i', '<title>' . htmlspecialchars($seoTitle, ENT_QUOTES, 'UTF-8') . '</title>', $html, 1);
    $html = preg_replace('#<meta\s+name="description"\s+content=".*?"\s*/?>#i', '<meta name="description" content="' . htmlspecialchars($seoDesc, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);
    $html = preg_replace('#<link\s+rel="canonical".*?href=".*?"\s*/?>#i', '<link rel="canonical" id="canonicalTag" href="' . htmlspecialchars($canonicalUrl, ENT_QUOTES, 'UTF-8') . '" />', $html, 1);
}

// Output HTML
header('Content-Type: text/html; charset=UTF-8');
echo $html;
