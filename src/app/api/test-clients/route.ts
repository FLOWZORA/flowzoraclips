import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const videoId = 'YMPiKthmtRU';
  const results: any[] = [];

  const testClients = [
    {
      name: 'IOS',
      client: {
        clientName: 'IOS',
        clientVersion: '19.45.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iOS',
        osVersion: '18.1.0.22B83',
        hl: 'en',
        gl: 'US',
      },
      headers: {
        'User-Agent': 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU OS 18_1_0 like Mac OS X; en_US)',
        'X-YouTube-Client-Name': '5',
        'X-YouTube-Client-Version': '19.45.4',
      },
    },
    {
      name: 'ANDROID_CREATOR',
      client: {
        clientName: 'ANDROID_CREATOR',
        clientVersion: '23.49.100',
        androidSdkVersion: 34,
        hl: 'en',
        gl: 'US',
      },
      headers: {
        'User-Agent': 'com.google.android.apps.youtube.creator/23.49.100 (Linux; U; Android 14; en_US; Pixel 8 Pro)',
        'X-YouTube-Client-Name': '62',
        'X-YouTube-Client-Version': '23.49.100',
      },
    },
    {
      name: 'WEB_EMBEDDED',
      client: {
        clientName: 'WEB_EMBEDDED_PLAYER',
        clientVersion: '1.20240401.01.00',
        originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        hl: 'en',
        gl: 'US',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
      },
    },
    {
      name: 'TVHTML5_CAST',
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        hl: 'en',
        gl: 'US',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 Safari/537.36',
      },
    },
    {
      name: 'MEDIA_CONNECT',
      client: {
        clientName: 'MEDIA_CONNECT',
        clientVersion: '1.0',
        hl: 'en',
        gl: 'US',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    },
  ];

  for (const tc of testClients) {
    try {
      const pRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...tc.headers,
        },
        body: JSON.stringify({
          context: {
            client: tc.client,
            thirdParty: {
              embedUrl: 'https://www.google.com',
            },
          },
          videoId,
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: 'HTML5_PREF_WANTS',
              signatureTimestamp: 20711,
            },
          },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });

      const data = await pRes.json();
      const adaptive = data.streamingData?.adaptiveFormats || [];
      const audioFormats = adaptive.filter((f: any) => f.mimeType?.includes('audio') && f.url);
      results.push({
        name: tc.name,
        http: pRes.status,
        status: data.playabilityStatus?.status,
        reason: data.playabilityStatus?.reason,
        audioWithUrl: audioFormats.length,
      });
    } catch (e: any) {
      results.push({ name: tc.name, error: e.message });
    }
  }

  // Also test Invidious/Piped public fallback
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://pipedapi.tokhmi.xyz',
  ];
  for (const inst of pipedInstances) {
    try {
      const res = await fetch(`${inst}/streams/${videoId}`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const pData = await res.json();
        const audioStreams = (pData.audioStreams || []).filter((s: any) => s.url);
        results.push({
          name: `Piped_${inst}`,
          status: 'OK',
          audioStreams: audioStreams.length,
          title: pData.title,
        });
        break;
      }
    } catch (e: any) {
      results.push({ name: `Piped_${inst}`, error: e.message });
    }
  }

  // Also test Cobalt API
  try {
    const cobRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'FlowzoraClips/1.0',
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isAudioOnly: true,
        aFormat: 'mp3',
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (cobRes.ok) {
      const cobData = await cobRes.json();
      results.push({
        name: 'Cobalt',
        status: cobData.status,
        url: cobData.url ? 'Has URL' : 'No URL',
      });
    } else {
      results.push({ name: 'Cobalt', status: cobRes.status });
    }
  } catch (e: any) {
    results.push({ name: 'Cobalt', error: e.message });
  }

  return NextResponse.json({ results });
}
