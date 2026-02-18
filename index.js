const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS) || 60 * 60 * 1000; // default 1 hour
const API_URL = process.env.RATES_API_URL || 'https://api.exchangerate.host/latest?base=AZN&symbols=AZN,USD,EUR,AED,TRY';

const ratesPath = path.join(__dirname, 'rates.json');
let rates = {};
let isFetching = false;

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

function loadLocalRates() {
  try {
    const data = fs.readFileSync(ratesPath, 'utf8');
    rates = JSON.parse(data);
  } catch (err) {
    // fallback defaults if file is missing or invalid
    rates = { USD: 1.0, AZN: 0.588, EUR: 1.08, AED: 0.2723, TRY: 0.054 };
  }
}

function saveLocalRates(obj) {
  try {
    fs.writeFileSync(ratesPath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    // ignore write failures for now
  }
}

function fetchRatesOnce() {
  if (isFetching) return Promise.resolve();
  isFetching = true;
  return new Promise((resolve) => {
    https
      .get(API_URL, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.rates) throw new Error('Invalid response');

            // API returns values as target currency per 1 AZN (since base=AZN)
            // We want AZN per unit of currency => invert non-AZN rates
            const apiRates = parsed.rates;
            const newRates = {};
            Object.keys(apiRates).forEach((sym) => {
              if (sym === 'AZN') newRates[sym] = 1.0;
              else if (apiRates[sym] && apiRates[sym] !== 0) newRates[sym] = 1 / apiRates[sym];
            });

            // keep current rates for any missing symbols
            Object.keys(rates).forEach((k) => {
              if (newRates[k] == null) newRates[k] = rates[k];
            });

            rates = newRates;
            saveLocalRates(rates);
          } catch (err) {
            // ignore parse errors, keep existing rates
          } finally {
            isFetching = false;
            resolve();
          }
        });
      })
      .on('error', () => {
        isFetching = false;
        resolve();
      });
  });
}

function scheduleUpdates() {
  // initial fetch
  fetchRatesOnce();
  // periodic
  setInterval(() => fetchRatesOnce(), UPDATE_INTERVAL_MS);
}

function handleConvert(query, res) {
  const from = (query.from || '').toUpperCase();
  const to = (query.to || '').toUpperCase();
  const amount = Number(query.amount ?? 1);

  if (!from || !to) {
    return sendJson(res, 400, { error: 'Missing `from` or `to` query parameter' });
  }

  if (Number.isNaN(amount) || amount < 0) {
    return sendJson(res, 400, { error: 'Invalid `amount` query parameter' });
  }

  if (!rates[from] || !rates[to]) {
    return sendJson(res, 400, { error: 'Unsupported currency', supported: Object.keys(rates) });
  }

  // rates are defined as USD per unit of currency
  const converted = amount * (rates[from] / rates[to]);

  sendJson(res, 200, {
    from,
    to,
    amount,
    result: Number(converted.toFixed(6)),
    rate: Number((rates[from] / rates[to]).toFixed(12)),
  });
}

loadLocalRates();
scheduleUpdates();

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/convert' && req.method === 'GET') {
    return handleConvert(parsed.query, res);
  }

  if ((parsed.pathname === '/' || parsed.pathname === '/rates') && req.method === 'GET') {
    return sendJson(res, 200, { base: 'AZN', rates });
  }

  if (parsed.pathname === '/refresh' && req.method === 'GET') {
    // manual refresh
    fetchRatesOnce().then(() => sendJson(res, 200, { ok: true, rates }));
    return;
  }

  sendJson(res, 404, { error: 'Not found', routes: ['/', '/convert?from=AZN&to=USD&amount=1', '/refresh'] });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Currency API listening on http://localhost:${PORT}`);
});
