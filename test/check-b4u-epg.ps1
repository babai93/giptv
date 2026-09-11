$ProgressPreference = 'SilentlyContinue'
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$ist = [System.TimeZoneInfo]::FindSystemTimeZoneById('India Standard Time')
function ToIst([long]$ms) { [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTimeOffset]::FromUnixTimeMilliseconds($ms).UtcDateTime, $ist).ToString('dd-MM-yyyy HH:mm:ss') }
$hdr = @{ 'User-Agent' = 'okhttp/4.2.2' }

Write-Output ("NOW-IST : " + (ToIst $now))

# 1) Live channel list: confirm B4U channels and id 183
$channels = (Invoke-RestMethod -Uri 'https://jiotv.data.cdn.jio.com/apis/v3.0/getMobileChannelList/get/?os=android&devicetype=phone&usertype=tvYR7NSNn7rymo3F' -Headers $hdr).result |
    Where-Object { $_.channel_id -and $_.channel_name }
Write-Output "--- B4U channels in live Jio list ---"
$channels | Where-Object { $_.channel_name -match 'b4u' } | ForEach-Object { Write-Output ("  id={0}  name=`"{1}`"" -f $_.channel_id, $_.channel_name) }
$c183 = $channels | Where-Object { [string]$_.channel_id -eq '183' }
Write-Output ("  channel_id 183 => " + $(if ($c183) { "`"$($c183.channel_name)`"" } else { 'NOT FOUND' }))

# 2) Live EPG for channel 183 (offset 0 = today, 1 = tomorrow)
foreach ($offset in 0, 1) {
    $epgUrl = ('https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get?offset={0}&channel_id=183' -f $offset)
    $items = (Invoke-RestMethod -Uri $epgUrl -Headers $hdr).epg |
        ForEach-Object { [pscustomobject]@{ show = ([string]$_.showname).Trim(); start = [long]$_.startEpoch; end = [long]$_.endEpoch } } |
        Where-Object { $_.show -and $_.start -and $_.end } |
        Sort-Object start
    Write-Output ("--- Live Jio EPG (offset {0}) for channel 183 (B4U Music) ---" -f $offset)
    foreach ($it in $items) {
        $cur = ''
        if ($it.start -le $now -and $it.end -gt $now) { $cur = '  <== CURRENT' }
        Write-Output ("  {0} -> {1}  | {2}{3}" -f (ToIst $it.start), (ToIst $it.end), $it.show, $cur)
    }
    $current = $items | Where-Object { $_.start -le $now -and $_.end -gt $now } | Select-Object -First 1
    Write-Output ("  JIO-SAYS-NOW: " + $(if ($current) { $current.show } else { 'NONE' }))
}

# 3) Cached jiotv-epg.json comparison
$cacheFile = 'd:/Automation/giptv/.cache/jiotv-epg.json'
try {
    $cached = Get-Content $cacheFile -Raw | ConvertFrom-Json
    Write-Output "--- Cached jiotv-epg.json ---"
    Write-Output ("  programs[`"183`"] = " + $cached.programs.'183')
    Write-Output ("  byName[`"b4umusic`"] = " + $cached.byName.b4umusic)
    $stat = Get-Item $cacheFile
    $ageH = [math]::Round(($now - $stat.LastWriteTimeUtc.Ticks / 10000) / 3600000, 2)
    Write-Output ("  cache LastWriteTime(UTC): " + $stat.LastWriteTimeUtc.ToString('dd-MM-yyyy HH:mm:ss') + "  (" + $ageH + " hours old)")
} catch {
    Write-Output ("  cache read error: " + $_.Exception.Message)
}
