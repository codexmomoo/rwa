// Vercel Serverless Function - HLS Video Proxy
// Path: /api/proxy?url=<encoded_m3u8_url>

export default async function handler(req, res) {
  // CORS headers - sabhi domains allow
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Sirf allowed domains proxy karo
  const allowedDomains = [
    'transcoded-videos.classx.co.in',
    'appx-play.akamai.net.in',
    'classx.co.in',
    'studyuk.site',
    'rozgarapinew.teachx.in',
  ];

  const urlObj = new URL(targetUrl);
  const isAllowed = allowedDomains.some(d => urlObj.hostname.includes(d));

  if (!isAllowed) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://appx-play.akamai.net.in/',
        'Origin': 'https://appx-play.akamai.net.in',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream error: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // M3U8 file hai toh segment URLs bhi proxy karo
    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL')) {
      let text = await response.text();

      // Base URL nikalo
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      const proxyBase = '/api/proxy?url=';

      // Relative .ts aur .m3u8 URLs ko proxy URL mein convert karo
      text = text.replace(/^(?!#)([^\r\n]+)$/gm, (line) => {
        line = line.trim();
        if (!line) return line;
        if (line.startsWith('http://') || line.startsWith('https://')) {
          return proxyBase + encodeURIComponent(line);
        } else {
          return proxyBase + encodeURIComponent(baseUrl + line);
        }
      });

      return res.status(200).send(text);
    }

    // Binary content (video segments) seedha stream karo
    const buffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
