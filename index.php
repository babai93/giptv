<?php
 /**
 * IPTV Web Player using iptv-org/api
 * Single-file PHP application
 */

 // 1. Helper function to fetch and cache API data
 function getApiData($url, $filename)
 {
 $cache_file = __DIR__ . '/' . $filename;
 $cache_time = 3600 * 24; // Cache for 24 hours to prevent rate-limiting

 // Return cached data if valid
 if (file_exists($cache_file) && (time() - filemtime($cache_file)) < $cache_time) {
  $data = file_get_contents($cache_file);
  return json_decode($data, true) ?: [];
 }

 // Fetch new data from the API
 $context = stream_context_create([
  'http' => [
   'header' => "User-Agent: PHP-IPTV-App/1.0\r\n",
  ],
 ]);

 $data = @file_get_contents($url, false, $context);
 if ($data) {
  file_put_contents($cache_file, $data);
  return json_decode($data, true) ?: [];
 }
 return [];
 }

 function getCountryFlag($country_code)
 {
 $country_code = strtoupper($country_code);
 if (strlen($country_code) !== 2 || ! ctype_alpha($country_code)) {
  return '';
 }

 return html_entity_decode(
  '&#' . (ord($country_code[0]) + 127397) . ';' .
  '&#' . (ord($country_code[1]) + 127397) . ';',
  ENT_COMPAT,
  'UTF-8'
 );
 }

 function getEpgPrograms($url, $filename)
 {
 $cache_file = __DIR__ . '/' . $filename;
 $cache_time = 3600 * 6;

 if (file_exists($cache_file) && (time() - filemtime($cache_file)) < $cache_time) {
  $xml_data = file_get_contents($cache_file);
 } else {
  $context = stream_context_create([
   'http' => [
    'header' => "User-Agent: PHP-IPTV-App/1.0\r\n",
   ],
  ]);
  $xml_data = @file_get_contents($url, false, $context);
  if ($xml_data) {
   $xml_data = gzdecode($xml_data) ?: $xml_data;
   file_put_contents($cache_file, $xml_data);
  }
 }

 if (empty($xml_data)) {
  return [];
 }

 $xml = @simplexml_load_string($xml_data);
 if (! $xml) {
  return [];
 }

 $now      = time();
 $programs = [];
 foreach ($xml->programme as $programme) {
  $start = strtotime((string)$programme['start']);
  $stop  = strtotime((string)$programme['stop']);
  $title = trim((string)$programme->title);
  if ($start !== false && $stop !== false && $start <= $now && $stop > $now && $title !== '') {
   $programs[(string)$programme['channel']] = $title;
  }
 }

 return $programs;
 }

 // 2. Fetch Channels and Streams
 $channels      = getApiData('https://iptv-org.github.io/api/channels.json', 'channels.json');
 $streams       = getApiData('https://iptv-org.github.io/api/streams.json', 'streams.json');
 $logos         = getApiData('https://iptv-org.github.io/api/logos.json', 'logos.json');
 $country_data  = getApiData('https://iptv-org.github.io/api/countries.json', 'countries.json');
 $category_data = getApiData('https://iptv-org.github.io/api/categories.json', 'categories.json');
 $epg_programs  = getEpgPrograms('https://avkb.short.gy/epg.xml.gz', 'epg.xml');

 $country_names = [];
 foreach ($country_data as $country_record) {
 if (! empty($country_record['code']) && ! empty($country_record['name'])) {
  $country_names[strtoupper($country_record['code'])] = $country_record['name'];
 }
 }

 $category_names = [];
 foreach ($category_data as $category_record) {
 if (! empty($category_record['id']) && ! empty($category_record['name'])) {
  $category_names[$category_record['id']] = $category_record['name'];
 }
 }

 // Map each channel to its preferred logo URL.
 $logo_map = [];
 if (! empty($logos)) {
 foreach ($logos as $logo) {
  if (! empty($logo['channel']) && ! empty($logo['url'])) {
   if (! isset($logo_map[$logo['channel']]) || ! empty($logo['in_use'])) {
    $logo_map[$logo['channel']] = $logo['url'];
   }
  }
 }
 }

 $epg_programs_by_name = [];
 $epg_latest_programs  = [];
 if (! empty($epg_programs)) {
 $epg_data = @simplexml_load_file(__DIR__ . '/epg.xml');
 if ($epg_data) {
  foreach ($epg_data->programme as $programme) {
   $epg_channel_id = (string)$programme['channel'];
   $title          = trim((string)$programme->title);
   $stop           = strtotime((string)$programme['stop']);
   if ($epg_channel_id && $title && $stop !== false &&
    (! isset($epg_latest_programs[$epg_channel_id]) || $stop > $epg_latest_programs[$epg_channel_id]['stop'])) {
    $epg_latest_programs[$epg_channel_id] = [
     'title' => $title,
     'stop'  => $stop,
    ];
   }
  }

  foreach ($epg_data->channel as $epg_channel) {
   $epg_channel_name = trim((string)$epg_channel->{'display-name'}[0]);
   $epg_channel_id   = (string)$epg_channel['id'];
   $epg_channel_key  = preg_replace('/[^a-z0-9]/', '', strtolower($epg_channel_name));
   if ($epg_channel_name && isset($epg_programs[$epg_channel_id])) {
    $epg_programs_by_name[$epg_channel_key] = $epg_programs[$epg_channel_id];
   } elseif ($epg_channel_name && isset($epg_latest_programs[$epg_channel_id])) {
    $epg_programs_by_name[$epg_channel_key] = $epg_latest_programs[$epg_channel_id]['title'];
   }
  }
 }
 }

 // 3. Map streams by channel ID for fast lookup
 $stream_map = [];
 if (! empty($streams)) {
 foreach ($streams as $stream) {
  // Take the first available stream URL for the channel
  if (isset($stream['channel']) && isset($stream['url']) && ! isset($stream_map[$stream['channel']])) {
   $stream_map[$stream['channel']] = $stream['url'];
  }
 }
 }

 // 4. Merge channels with their corresponding stream URLs
 $playable_channels = [];
 if (! empty($channels)) {
 foreach ($channels as $c) {
  if (isset($c['id']) && isset($stream_map[$c['id']])) {
   $c['stream_url'] = $stream_map[$c['id']];
   if (isset($logo_map[$c['id']])) {
    $c['logo'] = $logo_map[$c['id']];
   }
   $channel_name_key    = preg_replace('/[^a-z0-9]/', '', strtolower($c['name'] ?? ''));
   $c['program_name']   = $epg_programs[$c['id']] ?? ($epg_programs_by_name[$channel_name_key] ?? '');
   $playable_channels[] = $c;
  }
 }
 }

 // 5. Handle Search, Country, and Category Filters
 $search     = $_GET['search'] ?? '';
 $country    = strtoupper($_GET['country'] ?? '');
 $category   = $_GET['category'] ?? '';
 $countries  = [];
 $categories = [];
 foreach ($playable_channels as $channel) {
 if (! empty($channel['country'])) {
  $country_code             = strtoupper($channel['country']);
  $countries[$country_code] = $country_names[$country_code] ?? $country_code;
 }
 if (! empty($channel['categories'])) {
  $channel_categories = is_array($channel['categories']) ? $channel['categories'] : [$channel['categories']];
  foreach ($channel_categories as $channel_category) {
   if ($channel_category !== '') {
    $categories[$channel_category] = $category_names[$channel_category] ?? $channel_category;
   }
  }
 }
 }
 asort($countries, SORT_NATURAL | SORT_FLAG_CASE);
 asort($categories, SORT_NATURAL | SORT_FLAG_CASE);

 if ($search) {
 $playable_channels = array_filter($playable_channels, function ($c) use ($search) {
  return stripos($c['name'], $search) !== false;
 });
 }
 if ($country) {
 $playable_channels = array_filter($playable_channels, function ($c) use ($country) {
  return ($c['country'] ?? '') === $country;
 });
 }
 if ($category) {
 $playable_channels = array_filter($playable_channels, function ($c) use ($category) {
  $channel_categories = $c['categories'] ?? [];
  $channel_categories = is_array($channel_categories) ? $channel_categories : [$channel_categories];
  return in_array($category, $channel_categories, true);
 });
 }

 // 6. Handle Pagination
 $page           = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
 $per_page       = 48; // Channels per page
 $total          = count($playable_channels);
 $total_pages    = ceil($total / $per_page);
 $offset         = ($page - 1) * $per_page;
 $paged_channels = array_slice($playable_channels, $offset, $per_page);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Global IPTV</title>
    <!-- Bootstrap CSS for styling -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Shaka Player UI for HLS and DASH playback -->
    <link rel="stylesheet" href="https://unpkg.com/shaka-player@4.15.5/dist/controls.css">
    <script src="https://unpkg.com/shaka-player@4.15.5/dist/shaka-player.ui.js"></script>
    <style>
        :root { --glass-surface: #ffffff05; --glass-strong: rgba(18, 25, 32, 0.72); --glass-border: rgba(255, 255, 255, 0.2); --glass-highlight: rgba(255, 255, 255, 0.34); }
        body { position: relative; min-height: 100vh; overflow-x: hidden; background: #1a1e23; color: #ffffff; }
        .background-animation { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
        .bubble { position: absolute; bottom: -10rem; display: block; width: var(--bubble-size); height: var(--bubble-size); left: var(--bubble-left); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 50%; background: rgba(92, 161, 190, 0.08); box-shadow: inset 0 0 1.5rem rgba(255, 255, 255, 0.08), 0 0 1rem rgba(92, 161, 190, 0.12); animation: bubble-float var(--bubble-duration) linear infinite; animation-delay: var(--bubble-delay); }
        @keyframes bubble-float { 0% { transform: translate3d(0, 0, 0) scale(0.75); opacity: 0; } 10% { opacity: 0.8; } 50% { transform: translate3d(var(--bubble-drift), -55vh, 0) scale(1); } 100% { transform: translate3d(calc(var(--bubble-drift) * -0.6), -125vh, 0) scale(1.15); opacity: 0; } }
        .container { position: relative; z-index: 1; }
        .glass-panel { background: var(--glass-strong); border: 1px solid var(--glass-border); border-radius: 1.25rem; box-shadow: 0 1.5rem 3rem rgba(0, 0, 0, 0.22), inset 0 1px 0 var(--glass-highlight); backdrop-filter: blur(1.25rem) saturate(140%); -webkit-backdrop-filter: blur(1.25rem) saturate(140%); }
        .header-panel { padding: 1.25rem; }
        .filter-panel { padding: 0.35rem; }
        .glass-control { background: rgba(255, 255, 255, 0.09) !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; color: #f8fafc !important; }
        .glass-control::placeholder { color: rgba(255, 255, 255, 0.62); }
        .glass-control:focus { background: rgba(255, 255, 255, 0.15) !important; border-color: rgba(255, 255, 255, 0.5) !important; box-shadow: 0 0 0 0.2rem rgba(125, 211, 252, 0.18); }
        .glass-control option { background: #202b34; color: #f8fafc; }
        .col-md-7 h2 { display: flex; align-items: center; gap: 0.6rem; flex-wrap: nowrap; }
        .col-md-7 h2 svg { flex: 0 0 30px; width: 30px; height: 30px; }
        .col-md-7 h2 span { display: none; }
        @media (max-width: 767.98px) {
            .container { padding-left: 1rem; padding-right: 1rem; }
            .header-panel { border-radius: 1rem; }
            .col-md-7 h2 { font-size: 1.35rem; gap: 0.45rem; }
            .col-md-7 h2 svg { flex-basis: 26px; width: 26px; height: 26px; }
            .input-group { flex-wrap: wrap; gap: 0.5rem; }
            .input-group > .form-control,
            .input-group > .form-select { flex: 1 1 100%; width: 100%; border-radius: 0.375rem !important; }
            .input-group > .btn { flex: 1 1 auto; border-radius: 0.375rem !important; }
        }
        .bubble:nth-child(1) { --bubble-size: 4rem; --bubble-left: 5%; --bubble-duration: 18s; --bubble-delay: -4s; --bubble-drift: 2rem; }
        .bubble:nth-child(2) { --bubble-size: 7rem; --bubble-left: 16%; --bubble-duration: 25s; --bubble-delay: -14s; --bubble-drift: -3rem; }
        .bubble:nth-child(3) { --bubble-size: 2.5rem; --bubble-left: 28%; --bubble-duration: 16s; --bubble-delay: -9s; --bubble-drift: 4rem; }
        .bubble:nth-child(4) { --bubble-size: 5rem; --bubble-left: 42%; --bubble-duration: 22s; --bubble-delay: -18s; --bubble-drift: -2rem; }
        .bubble:nth-child(5) { --bubble-size: 9rem; --bubble-left: 57%; --bubble-duration: 29s; --bubble-delay: -6s; --bubble-drift: 3rem; }
        .bubble:nth-child(6) { --bubble-size: 3rem; --bubble-left: 72%; --bubble-duration: 17s; --bubble-delay: -12s; --bubble-drift: -4rem; }
        .bubble:nth-child(7) { --bubble-size: 6rem; --bubble-left: 86%; --bubble-duration: 24s; --bubble-delay: -20s; --bubble-drift: 2rem; }
        .bubble:nth-child(8) { --bubble-size: 2rem; --bubble-left: 94%; --bubble-duration: 15s; --bubble-delay: -2s; --bubble-drift: -3rem; }
        @media (prefers-reduced-motion: reduce) { .bubble { animation: none; opacity: 0.15; } }
        .channel-card { cursor: pointer; transition: transform 0.25s ease, border-color 0.25s ease, background 0.25s ease; background: var(--glass-surface); border: 1px solid var(--glass-border); border-radius: 1rem; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 0.75rem 1.5rem rgba(0, 0, 0, 0.14); backdrop-filter: blur(0.8rem); -webkit-backdrop-filter: blur(0.8rem); }
        .channel-card:hover { background: rgba(255, 255, 255, 0.17); border-color: rgba(125, 211, 252, 0.72); transform: translateY(-0.25rem); }
        .logo-container { height: 80px; display: flex; align-items: center; justify-content: center; background: #030000; padding: 5px; border-radius: 12px; }
        .channel-logo { max-height: 100%; max-width: 100%; object-fit: contain; }

        /* Keep player visible while scrolling channels */
        #player-wrapper { position: sticky; top: 20px; z-index: 1000; background: var(--glass-strong); border: 1px solid var(--glass-border); border-radius: 1.25rem; overflow: hidden; box-shadow: 0 1.5rem 3rem rgba(0,0,0,0.35), inset 0 1px 0 var(--glass-highlight); backdrop-filter: blur(1.25rem) saturate(140%); -webkit-backdrop-filter: blur(1.25rem) saturate(140%); }
        video { width: 100%; aspect-ratio: 16/9; background: #000; }

        .pagination { justify-content: center; flex-wrap: wrap; }
        .page-link { background: var(--glass-surface); border-color: var(--glass-border); color: #fff; }
        .page-link:hover { background: rgba(255, 255, 255, 0.2); border-color: var(--glass-highlight); color: #fff; }
        .page-item.active .page-link { background: rgba(56, 189, 248, 0.5); border-color: rgba(125, 211, 252, 0.75); }
        .card { color: #dce7ef; background: transparent; border-color: transparent; }
        .card.channel-card { background: var(--glass-surface); border-color: var(--glass-border); }
        .text-muted { color: #888 !important; }
        #now-playing-title { font-weight: bold; color: #bcb4b4 !important;}
        .live-status::before { content: ''; display: inline-block; width: 0.5rem; height: 0.5rem; margin-right: 0.35rem; border-radius: 50%; background: #21c55d; box-shadow: 0 0 0.4rem rgba(33, 197, 93, 0.8); vertical-align: middle; }
        .btn.clear:hover { background-color: #d6080856; }
        .btn-primary { background: rgba(14, 165, 233, 0.72); border-color: rgba(125, 211, 252, 0.75); }
        .btn-primary:hover { background: rgba(2, 132, 199, 0.9); border-color: #bae6fd; }
        .player-meta { background: rgba(0, 0, 0, 0.24) !important; }
    </style>
</head>
<body>
    <!-- Background Animation categories -->
<div class="background-animation" aria-hidden="true">
    <?php for ($bubble = 0; $bubble < 8; $bubble++): ?>
        <span class="bubble"></span>
    <?php endfor; ?>
</div>
<div class="container py-4">
    <!-- Header & Search Bar -->
    <div class="row mb-4 align-items-center glass-panel header-panel">
        <div class="col-md-7">
            <h2 class="flex items-center w-37 space-x-2 text-[#1f2328] dark:text-[#f8fafc]"><svg height="30" width="30" viewBox="0 0 154 170" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M51.6521 96.4471C51.6521 99.8751 53.4771 103.042 56.4389 104.755L88.3825 123.224V107.814L69.8302 97.0868C66.8684 95.3743 65.0434 92.207 65.0434 88.779V62.7986L51.6521 55.0541V96.4471Z" fill="currentColor"></path><path d="M26.7826 110.35C26.7826 113.782 28.5944 116.953 31.5347 118.667L86.6946 150.822C86.6946 150.822 87.3194 150.2 87.8086 147.123C88.4782 142.911 88.3826 136.377 88.3826 136.377L44.8325 110.99C41.8922 109.276 40.0804 106.105 40.0804 102.673V48.8864L26.7826 41.358V110.35Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M141.575 34.125C149.264 38.5854 154 46.8231 154 55.7372V118.63C154 131.227 145.093 140.728 134.287 143.071C134.101 143.111 133.98 142.883 134.114 142.747C138.425 138.356 141.186 132.306 141.186 125.297V62.431C141.186 53.5206 136.449 45.2865 128.759 40.8281L75.7646 10.1031C70.4494 7.02147 64.7072 6.16126 59.3581 7.0478C59.1709 7.07883 59.0535 6.84947 59.1927 6.72037C66.746 -0.285697 78.4446 -2.49751 88.5882 3.38684L141.575 34.125Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M116.274 47.5295C123.993 51.9903 128.748 60.2288 128.748 69.1439V132.043C128.748 144.613 119.847 154.1 109.031 156.47C108.846 156.511 108.725 156.283 108.857 156.147C113.142 151.76 115.881 145.737 115.881 138.764V75.8652C115.881 66.9501 111.126 58.7116 103.407 54.2508L50.2105 23.5094C44.8696 20.423 39.0993 19.5637 33.7251 20.4552C33.5377 20.4863 33.4204 20.2566 33.5599 20.1276C41.1429 13.1164 52.8912 10.9016 63.0776 16.7881L116.274 47.5295Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M102.73 82.3719C102.73 73.4844 97.9943 65.2715 90.3048 60.8245L37.3135 30.1785C20.7338 20.5901 0 32.5632 0 51.7259V114.479C0 123.373 4.74263 131.59 12.4406 136.035L65.4319 166.632C82.0116 176.205 102.73 164.231 102.73 145.076V82.3719ZM14.3478 51.7259C14.3478 44.8767 20.6094 40.1979 26.7826 41.358L83.1257 73.256C86.3789 75.1374 88.3826 78.612 88.3826 82.3719V136.377C88.3826 136.377 88.4782 142.911 87.8086 147.123C87.3194 150.2 86.6946 150.822 86.6946 150.822C83.8078 155.241 77.7363 157.16 72.6023 154.196L19.611 123.599C16.3542 121.718 14.3478 118.242 14.3478 114.479V51.7259Z" fill="currentColor"></path></svg><span class="font-bold font-mono text-[16px] dark:text-[#f8fafc] antialiased"></span> Global IPTV Player</h2>
            <p class="text-muted small mb-0">Powered by iptv-org API | Found <?php echo number_format($total) ?> playable channels</p>
        </div>
        <div class="col-md-5 mt-3 mt-md-0">
            <form id="filter-form" method="GET" action="" class="filter-panel">
                <div class="input-group">
                    <input type="text" name="search" class="form-control glass-control" placeholder="Search for a channel..." value="<?php echo htmlspecialchars($search) ?>">
                    <select name="country" class="form-select glass-control" aria-label="Filter by country">
                        <option value="">All countries</option>
                        <?php foreach ($countries as $country_code => $country_name): ?>
                            <option value="<?php echo htmlspecialchars($country_code, ENT_QUOTES) ?>" <?php echo strtoupper($country) === $country_code ? 'selected' : '' ?>><?php echo htmlspecialchars(getCountryFlag($country_code) . ' ' . $country_name) ?></option>
                        <?php endforeach; ?>
                    </select>
                    <select name="category" class="form-select glass-control" aria-label="Filter by category">
                        <option value="">All categories</option>
                        <?php foreach ($categories as $category_id => $category_name): ?>
                            <option value="<?php echo htmlspecialchars($category_id, ENT_QUOTES) ?>" <?php echo $category === $category_id ? 'selected' : '' ?>><?php echo htmlspecialchars($category_name) ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button class="btn btn-primary" type="submit">Search</button>
                    <?php if ($search || $country || $category): ?>
                        <a href="?" class="btn btn-outline-secondary clear">Clear</a>
                    <?php endif; ?>
                </div>
            </form>
        </div>
    </div>

    <div class="row">
        <!-- Left Column: Video Player -->
        <div class="col-lg-5 mb-4">
            <div id="player-wrapper">
                <div data-shaka-player-container>
                    <video data-shaka-player id="video-player" autoplay></video>
                </div>
                <div class="p-3 player-meta">
                    <div class="d-flex align-items-center justify-content-between gap-2">
                        <h5 id="now-playing-title" class="m-0 text-truncate text-warning">Select a channel to play</h5>
                        <small id="now-playing-status" class="text-muted text-end flex-shrink-0">Waiting...</small>
                    </div>
                    <div id="now-playing-program" class="small text-light text-truncate mt-1" aria-live="polite"></div>
                </div>
            </div>
        </div>

        <!-- Right Column: Channel Grid -->
        <div class="col-lg-7">
            <div id="channel-list" class="row g-3">
                <?php if (empty($paged_channels)): ?>
                    <div class="col-12 text-center text-muted p-5">
                        <h5>No channels found.</h5>
                    </div>
                <?php else: ?>
                    <?php foreach ($paged_channels as $channel): ?>
                        <div class="col-6 col-sm-4 col-md-3">
                            <div class="card channel-card h-100 p-2" onclick="playStream('<?php echo htmlspecialchars($channel['stream_url'], ENT_QUOTES) ?>', '<?php echo htmlspecialchars($channel['name'], ENT_QUOTES) ?>', '<?php echo htmlspecialchars($channel['id'], ENT_QUOTES) ?>', '<?php echo htmlspecialchars($channel['program_name'] ?? '', ENT_QUOTES) ?>')">
                                <div class="logo-container mb-2">
                                    <?php if (! empty($channel['logo'])): ?>
                                        <img src="<?php echo htmlspecialchars($channel['logo']) ?>" class="channel-logo" alt="Logo" loading="lazy" onerror="this.src='https://via.placeholder.com/150?text=No+Logo'">
                                    <?php else: ?>
                                        <img src="https://via.placeholder.com/150?text=<?php echo urlencode($channel['name']) ?>" class="channel-logo" alt="Logo">
                                    <?php endif; ?>
                                </div>
                                <div class="text-center text-truncate fw-bold" style="font-size: 0.85rem;" title="<?php echo htmlspecialchars($channel['name']) ?>">
                                    <?php echo htmlspecialchars($channel['name']) ?>
                                </div>
                                <div class="text-center text-muted" style="font-size: 0.7rem;">
                                    <?php $channel_country = strtoupper($channel['country'] ?? ''); ?>
                                    <?php if ($channel_country): ?>
                                        <img src="https://flagcdn.com/20x15/<?php echo htmlspecialchars(strtolower($channel_country), ENT_QUOTES) ?>.png" alt="<?php echo htmlspecialchars(getCountryFlag($channel_country) . ' flag', ENT_QUOTES) ?>" width="20" height="15" loading="lazy">
                                        <?php echo htmlspecialchars($country_names[$channel_country] ?? $channel_country) ?>
                                    <?php else: ?>
                                        Unknown
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>

            <!-- Pagination -->
            <div id="pagination-container">
                <?php if ($total_pages > 1): ?>
                    <nav class="mt-4">
                    <ul class="pagination">
                        <?php
                         $start_page = max(1, $page - 2);
                         $end_page   = min($total_pages, $page + 2);

                        if ($page > 1): ?>
                            <li class="page-item"><a class="page-link" href="?page=1&search=<?php echo urlencode($search) ?>&country=<?php echo urlencode($country) ?>&category=<?php echo urlencode($category) ?>">&laquo;</a></li>
                            <li class="page-item"><a class="page-link" href="?page=<?php echo $page - 1 ?>&search=<?php echo urlencode($search) ?>&country=<?php echo urlencode($country) ?>&category=<?php echo urlencode($category) ?>">Prev</a></li>
                        <?php endif; ?>

                        <?php for ($i = $start_page; $i <= $end_page; $i++): ?>
                            <li class="page-item <?php echo $i === $page ? 'active' : '' ?>">
                                <a class="page-link" href="?page=<?php echo $i ?>&search=<?php echo urlencode($search) ?>&country=<?php echo urlencode($country) ?>&category=<?php echo urlencode($category) ?>"><?php echo $i ?></a>
                            </li>
                        <?php endfor; ?>

                        <?php if ($page < $total_pages): ?>
                            <li class="page-item"><a class="page-link" href="?page=<?php echo $page + 1 ?>&search=<?php echo urlencode($search) ?>&country=<?php echo urlencode($country) ?>&category=<?php echo urlencode($category) ?>">Next</a></li>
                            <li class="page-item"><a class="page-link" href="?page=<?php echo $total_pages ?>&search=<?php echo urlencode($search) ?>&country=<?php echo urlencode($country) ?>&category=<?php echo urlencode($category) ?>">&raquo;</a></li>
                        <?php endif; ?>
                    </ul>
                    </nav>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<script>
    const video = document.getElementById('video-player');
    const titleEl = document.getElementById('now-playing-title');
    const statusEl = document.getElementById('now-playing-status');
    const programEl = document.getElementById('now-playing-program');
    let shakaPlayer;
    let pendingStream;
    function updateProgram(programName) {
        programEl.textContent = programName ? `Now playing: ${programName}` : '';
    }

    async function loadStream(url, name) {
        if (!shakaPlayer) {
            pendingStream = { url, name };
            return;
        }

        try {
            await shakaPlayer.load(url);
            statusEl.textContent = "Live";
            statusEl.className = "text-success live-status";
        } catch (error) {
            console.error('Shaka Player error:', error);
            statusEl.textContent = "Stream unavailable";
            statusEl.className = "text-danger";
        }
    }

    async function initShakaPlayer() {
        const ui = video.ui;
        if (!ui) {
            statusEl.textContent = "Player unavailable";
            statusEl.className = "text-danger";
            return;
        }

        shakaPlayer = ui.getControls().getPlayer();
        shakaPlayer.addEventListener('error', function(event) {
            console.error('Shaka Player error:', event.detail);
            statusEl.textContent = "Stream unavailable";
            statusEl.className = "text-danger";
        });

        if (pendingStream) {
            const stream = pendingStream;
            pendingStream = null;
            await loadStream(stream.url, stream.name);
        }
    }

    document.addEventListener('shaka-ui-loaded', initShakaPlayer);

    function playStream(url, name, channelId, programName, shouldScroll = true) {
        // Reset player UI
        titleEl.textContent = name;
        statusEl.textContent = "Connecting to stream...";
        statusEl.className = "text-info";
        sessionStorage.setItem('iptv-current-stream', JSON.stringify({ url, name, channelId, programName }));
        updateProgram(programName);
        if (shouldScroll) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        loadStream(url, name);
    }

    async function loadPage(url, updateHistory = true) {
        const channelList = document.getElementById('channel-list');
        const paginationContainer = document.getElementById('pagination-container');
        channelList.setAttribute('aria-busy', 'true');

        try {
            const response = await fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (!response.ok) {
                throw new Error(`Pagination request failed: ${response.status}`);
            }

            const pageDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
            const nextChannelList = pageDocument.getElementById('channel-list');
            const nextPaginationContainer = pageDocument.getElementById('pagination-container');
            if (!nextChannelList || !nextPaginationContainer) {
                throw new Error('Pagination response is missing channel content.');
            }

            channelList.innerHTML = nextChannelList.innerHTML;
            paginationContainer.replaceWith(nextPaginationContainer);
            const currentForm = document.getElementById('filter-form');
            const nextForm = pageDocument.getElementById('filter-form');
            if (currentForm && nextForm) {
                currentForm.querySelectorAll('[name]').forEach(function(control) {
                    const nextControl = nextForm.querySelector(`[name="${CSS.escape(control.name)}"]`);
                    if (nextControl) {
                        control.value = nextControl.value;
                    }
                });
            }
            if (updateHistory) {
                history.pushState({}, '', url);
            }
        } catch (error) {
            window.location.href = url;
        } finally {
            const currentChannelList = document.getElementById('channel-list');
            if (currentChannelList) {
                currentChannelList.removeAttribute('aria-busy');
            }
        }
    }

    document.addEventListener('click', function(event) {
        const clearLink = event.target.closest('#filter-form a.clear');
        if (clearLink) {
            event.preventDefault();
            loadPage(clearLink.href);
            return;
        }

        const paginationLink = event.target.closest('#pagination-container a.page-link');
        if (!paginationLink) {
            return;
        }

        event.preventDefault();
        loadPage(paginationLink.href);
    });

    document.getElementById('filter-form').addEventListener('submit', function(event) {
        event.preventDefault();
        const url = new URL(this.action || window.location.href, window.location.href);
        url.search = new URLSearchParams(new FormData(this)).toString();
        url.searchParams.set('page', '1');
        loadPage(url.toString());
    });

    window.addEventListener('popstate', function() {
        loadPage(window.location.href, false);
    });

    const savedStream = sessionStorage.getItem('iptv-current-stream');
    if (savedStream) {
        try {
            const stream = JSON.parse(savedStream);
            if (stream.url && stream.name && stream.channelId) {
                playStream(stream.url, stream.name, stream.channelId, stream.programName || '', false);
            }
        } catch (error) {
            sessionStorage.removeItem('iptv-current-stream');
        }
    }
</script>
</body>
</html>