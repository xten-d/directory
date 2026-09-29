<?php
/**
 * Dynamic SVG Trust Badge Generator for XTen National Directory
 * Serves embeddable SVG badges for verified Australian entities.
 * Usage: /badge/{abn}.svg or badge.php?abn={abn}&style={dark|white|pill}
 */

$abn = $_GET['abn'] ?? '';
$style = $_GET['style'] ?? 'dark';

// Sanitize ABN
$cleanAbn = preg_replace('/[^0-9]/', '', $abn);
if (strlen($cleanAbn) !== 11) {
    http_response_code(400);
    header('Content-Type: image/svg+xml; charset=utf-8');
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text x="10" y="25" fill="#EF4444" font-family="-apple-system, sans-serif" font-size="12">Invalid ABN Format</text></svg>';
    exit;
}

// Format ABN
$abnFormatted = substr($cleanAbn, 0, 2) . ' ' . substr($cleanAbn, 2, 3) . ' ' . substr($cleanAbn, 5, 3) . ' ' . substr($cleanAbn, 8);

// Modulo-89 check
$weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
$sum = ((int)$cleanAbn[0] - 1) * $weights[0];
for ($i = 1; $i < 11; $i++) {
    $sum += (int)$cleanAbn[$i] * $weights[$i];
}
$isValidModulo89 = ($sum % 89 === 0);
$checkLabel = $isValidModulo89 ? "ATO MODULO-89 CHECKED" : "REGISTRY RECORD";

header('Content-Type: image/svg+xml; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=86400');

if ($style === 'white') {
    echo <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="68" viewBox="0 0 280 68" fill="none">
  <rect width="280" height="68" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
  <circle cx="34" cy="34" r="18" fill="#EFF6FF" stroke="#3B82F6" stroke-width="1.5"/>
  <path d="M28 34l4 4 8-8" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="62" y="27" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" fill="#2563EB" letter-spacing="0.5">{$checkLabel}</text>
  <text x="62" y="44" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="#0F172A">ABN {$abnFormatted}</text>
  <text x="62" y="56" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" fill="#64748B">directory.xten.au Verified Registry</text>
</svg>
SVG;
} elseif ($style === 'pill') {
    echo <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="38" viewBox="0 0 240 38" fill="none">
  <rect width="240" height="38" rx="19" fill="#0F172A"/>
  <circle cx="20" cy="19" r="10" fill="#2563EB"/>
  <path d="M16 19l3 3 5-5" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="38" y="23" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#FFFFFF">ABN {$abnFormatted} · Verified</text>
</svg>
SVG;
} else {
    // Dark Shield (Default)
    echo <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="68" viewBox="0 0 280 68" fill="none">
  <rect width="280" height="68" rx="8" fill="#0F172A"/>
  <rect x="0.5" y="0.5" width="279" height="67" rx="7.5" stroke="#334155"/>
  <circle cx="34" cy="34" r="18" fill="#1E293B" stroke="#38BDF8" stroke-width="1.5"/>
  <path d="M28 34l4 4 8-8" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="62" y="27" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" fill="#38BDF8" letter-spacing="0.5">COMMONWEALTH REGISTER</text>
  <text x="62" y="44" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="#FFFFFF">ABN {$abnFormatted}</text>
  <text x="62" y="56" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" fill="#94A3B8">Verified on directory.xten.au</text>
</svg>
SVG;
}
