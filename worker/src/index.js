const RATES_API_URL = 'https://api.exchangerate.host/latest?base=AZN&symbols=AZN,USD,EUR,AED,TRY';
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache with TTL
let ratesCache = null;
let ratesCacheTime = 0;

const DEFAULT_RATES = {
  AZN: 1.0,
  USD: 1.700680,
  EUR: 1.836735,
  AED: 0.463285,
  TRY: 0.091837,
};

function sendJson(code, obj) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fetchRates() {
  try {
    const response = await fetch(RATES_API_URL);
    if (!response.ok) throw new Error('API error');

    const data = await response.json();
    if (!data || !data.rates) throw new Error('Invalid response');

    const apiRates = data.rates;
    const newRates = {};

    Object.keys(apiRates).forEach((sym) => {
      if (sym === 'AZN') {
        newRates[sym] = 1.0;
      } else if (apiRates[sym] && apiRates[sym] !== 0) {
        newRates[sym] = 1 / apiRates[sym];
      }
    });

    // Keep cached rates for any missing symbols
    if (ratesCache) {
      Object.keys(ratesCache).forEach((k) => {
        if (newRates[k] == null) newRates[k] = ratesCache[k];
      });
    }

    ratesCache = newRates;
    ratesCacheTime = Date.now();
    return newRates;
  } catch (err) {
    // Return cached rates or defaults
    if (ratesCache) return ratesCache;
    ratesCache = DEFAULT_RATES;
    return DEFAULT_RATES;
  }
}

function getCurrentRates() {
  // Return cached rates or defaults
  if (ratesCache) return ratesCache;
  ratesCache = DEFAULT_RATES;
  return DEFAULT_RATES;
}

function handleConvert(query) {
  const rates = getCurrentRates();
  const from = (query.get('from') || '').toUpperCase();
  const to = (query.get('to') || '').toUpperCase();
  const amount = Number(query.get('amount') ?? 1);

  if (!from || !to) {
    return sendJson(400, { error: 'Missing `from` or `to` query parameter' });
  }

  if (Number.isNaN(amount) || amount < 0) {
    return sendJson(400, { error: 'Invalid `amount` query parameter' });
  }

  if (!rates[from] || !rates[to]) {
    return sendJson(400, { error: 'Unsupported currency', supported: Object.keys(rates) });
  }

  const converted = amount * (rates[from] / rates[to]);

  return sendJson(200, {
    from,
    to,
    amount,
    result: Number(converted.toFixed(6)),
    rate: Number((rates[from] / rates[to]).toFixed(12)),
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const query = url.searchParams;

    if (pathname === '/convert' && request.method === 'GET') {
      return handleConvert(query);
    }

    if (pathname === '/rates' && request.method === 'GET') {
      const rates = getCurrentRates();
      return sendJson(200, { base: 'AZN', rates });
    }

    if (pathname === '/refresh' && request.method === 'GET') {
      const rates = await fetchRates();
      return sendJson(200, { ok: true, rates });
    }

    return sendJson(404, {
      error: 'Not found',
      routes: ['/convert?from=AZN&to=USD&amount=1', '/rates', '/refresh'],
    });
  },
};
