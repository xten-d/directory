<?php
/**
 * Embeddable SVG badge for a directory listing (MAA-20260929-003).
 * Usage: /badge/{abn}.svg, /badge/{abn}-{style}.svg or badge.php?abn={abn}&style={dark|white|pill}
 *
 * Wording (Travis, 29 Sep): "Listed on XTen National Register" for any live
 * listing; "Verified" only when the listing has been claimed and verified
 * (the directory API's is_claimed). Nothing claims government or ATO
 * standing. An ABN the directory doesn't serve (invalid, opted out under the
 * Privacy Act, not found) gets a neutral "not listed" badge and a 404.
 */

$abn = preg_replace('/[^0-9]/', '', (string) ($_GET['abn'] ?? ''));
$style = in_array($_GET['style'] ?? 'dark', ['dark', 'white', 'pill'], true) ? $_GET['style'] ?? 'dark' : 'dark';

function badge_lookup(string $abn): ?array
{
    // Same cache as index.php's pre-renderer (24 h), so a listing is looked
    // up once for both the profile page and its badge.
    $cacheDir = sys_get_temp_dir() . '/xten_dir_cache';
    $cacheFile = $cacheDir . '/abn_' . $abn . '.json';
    if (is_file($cacheFile) && (time() - filemtime($cacheFile) < 86400)) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (isset($cached['item'])) {
            return $cached['item'];
        }
    }

    $ctx = stream_context_create(['http' => [
        'timeout' => 1.8,
        'ignore_errors' => true,
        'header' => "User-Agent: XTenDirectoryBadge/1.0\r\n",
    ]]);
    foreach (['entity', 'person'] as $ep) {
        $resp = @file_get_contents("https://stack-internal.xten.au/api/v1/directory/{$ep}/{$abn}", false, $ctx);
        $json = $resp ? json_decode($resp, true) : null;
        if (isset($json[$ep])) {
            if (!is_dir($cacheDir)) {
                @mkdir($cacheDir, 0775, true);
            }
            @file_put_contents($cacheFile, json_encode(['item' => $json[$ep], 'portalType' => $ep, 'cached_at' => time()]));
            return $json[$ep];
        }
    }
    return null;
}

$item = strlen($abn) === 11 ? badge_lookup($abn) : null;

header('Content-Type: image/svg+xml; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($item === null) {
    http_response_code(404);
    header('Cache-Control: public, max-age=3600');
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="38" viewBox="0 0 240 38"><rect width="240" height="38" rx="6" fill="#F1F5F9" stroke="#CBD5E1"/><text x="12" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" fill="#64748B">Not listed on XTen National Register</text></svg>';
    exit;
}

header('Cache-Control: public, max-age=86400');

$abnFormatted = substr($abn, 0, 2) . ' ' . substr($abn, 2, 3) . ' ' . substr($abn, 5, 3) . ' ' . substr($abn, 8);
$verified = !empty($item['is_claimed']);
$active = ($item['abn_status'] ?? 'ACT') === 'ACT';
$topLine = $verified ? 'VERIFIED ON XTEN NATIONAL REGISTER' : 'LISTED ON XTEN NATIONAL REGISTER';
$bottomLine = !$active ? 'ABN not currently active' : ($verified ? 'Claimed and verified listing' : 'directory.xten.au');
$pillText = 'ABN ' . $abnFormatted . ' · ' . ($verified ? 'Verified listing' : 'Listed');
$mark = $verified ? '<path d="M28 34l4 4 8-8" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="34" cy="34" r="4" fill="%s"/>';
$pillMark = $verified ? '<path d="M16 19l3 3 5-5" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="20" cy="19" r="3" fill="#FFFFFF"/>';
$font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

if ($style === 'white') {
    $m = sprintf($mark, '#2563EB');
    echo <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="68" viewBox="0 0 280 68" fill="none">
  <rect width="280" height="68" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
  <circle cx="34" cy="34" r="18" fill="#EFF6FF" stroke="#3B82F6" stroke-width="1.5"/>
  {$m}
  <text x="62" y="27" font-family="{$font}" font-size="9" font-weight="700" fill="#2563EB" letter-spacing="0.3">{$topLine}</text>
  <text x="62" y="44" font-family="{$font}" font-size="12" font-weight="800" fill="#0F172A">ABN {$abnFormatted}</text>
  <text x="62" y="56" font-family="{$font}" font-size="9" fill="#64748B">{$bottomLine}</text>
</svg>
SVG;
} elseif ($style === 'pill') {
    echo <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="38" viewBox="0 0 240 38" fill="none">
  <rect width="240" height="38" rx="19" fill="#0F172A"/>
  <circle cx="20" cy="19" r="10" fill="#2563EB"/>
  {$pillMark}
  <text x="38" y="23" font-family="{$font}" font-size="11" font-weight="700" fill="#FFFFFF">{$pillText}</text>
</svg>
SVG;
} else {
    $m = sprintf($mark, '#38BDF8');
    echo <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="68" viewBox="0 0 280 68" fill="none">
  <rect width="280" height="68" rx="8" fill="#0F172A"/>
  <rect x="0.5" y="0.5" width="279" height="67" rx="7.5" stroke="#334155"/>
  <circle cx="34" cy="34" r="18" fill="#1E293B" stroke="#38BDF8" stroke-width="1.5"/>
  {$m}
  <text x="62" y="27" font-family="{$font}" font-size="9" font-weight="700" fill="#38BDF8" letter-spacing="0.3">{$topLine}</text>
  <text x="62" y="44" font-family="{$font}" font-size="12" font-weight="800" fill="#FFFFFF">ABN {$abnFormatted}</text>
  <text x="62" y="56" font-family="{$font}" font-size="9" fill="#94A3B8">{$bottomLine}</text>
</svg>
SVG;
}
