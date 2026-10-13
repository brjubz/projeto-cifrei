const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// GET /get?url=<encoded_url>  →  { contents: "<html>..." }
app.get('/get', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const url = new URL(target);
    if (!url.hostname.includes('cifraclub.com.br')) {
      return res.status(403).json({ error: 'Host not allowed' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const upstream = await fetch(target, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.cifraclub.com.br/',
      },
    });
    clearTimeout(timeout);

    const html = await upstream.text();
    res.json({ contents: html, status: { http_code: upstream.status } });
  } catch (err) {
    const status = err.name === 'AbortError' ? 504 : 502;
    res.status(status).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Proxy CifraClub rodando na porta ${PORT}`));
