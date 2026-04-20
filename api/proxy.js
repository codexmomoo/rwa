// Vercel Serverless Function - HLS Video Proxy
export default async function handler(req, res) {
  // CORS headers
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

  // Allowed domains
  const allowedDomains = [
    'transcoded-videos.classx.co.in',
    'appx-play.akamai.net.in',
    'classx.co.in',
    'studyuk.site',
    'rozgarapinew.teachx.in',
    'liveclasses.cloud-front.in',
  ];

  const urlObj = new URL(targetUrl);
  const isAllowed = allowedDomains.some(d => urlObj.hostname.includes(d));

  if (!isAllowed) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        'Referer': 'https://appx-play.akamai.net.in/',
        'Origin': 'https://appx-play.akamai.net.in',
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream error: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // M3U8 file - segment URLs ko proxy karo
    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
      let text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      const proxyBase = '/api/proxy?url=';
      const cleanBaseUrl = baseUrl.split('?')[0];

      // Rewrite segment URLs
      text = text.replace(/^(?!#)([^\r\n]+)$/gm, (line) => {
        line = line.trim();
        if (!line) return line;
        
        let segmentUrl;
        if (line.startsWith('http://') || line.startsWith('https://')) {
          segmentUrl = line;
        } else {
          segmentUrl = cleanBaseUrl + line;
        }
        
        // Add cache buster
        const separator = segmentUrl.includes('?') ? '&' : '?';
        return proxyBase + encodeURIComponent(segmentUrl + separator + '_cb=' + Date.now());
      });

      // Rewrite key URIs
      text = text.replace(/URI="([^"]+)"/g, (match, uri) => {
        let keyUrl;
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
          keyUrl = uri;
        } else {
          keyUrl = cleanBaseUrl + uri;
        }
        return `URI="${proxyBase + encodeURIComponent(keyUrl)}"`;
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      return res.status(200).send(text);
    }

    // Video segments (.ts files)
    let finalContentType = contentType;
    if (targetUrl.includes('.ts')) {
      finalContentType = 'video/mp2t';
    }
    
    res.setHeader('Content-Type', finalContentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    
    const buffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}