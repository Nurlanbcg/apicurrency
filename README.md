# currencyapi

Simple Node HTTP currency conversion microservice.

Available endpoints:

- `GET /convert?from=AZN&to=USD&amount=100` — convert `amount` from `from` to `to` (default amount = 1)
- `GET /rates` — returns the internal rates (USD per unit)


Supported currencies (preloaded): `AZN` (base), `USD`, `EUR`, `AED`, `TRY`.

Auto-update:

- The service periodically fetches live rates from exchangerate.host (default 1 hour).
- You can override the source with `RATES_API_URL` and the interval with `UPDATE_INTERVAL_MS` (milliseconds).
- Manual refresh is available at `GET /refresh`.

Run:

```sh
cd currencyapi
node index.js
# or
npm start
```

Examples:

```sh
curl "http://localhost:3000/convert?from=AZN&to=USD&amount=10"
curl "http://localhost:3000/convert?from=USD&to=AZN&amount=5"
curl "http://localhost:3000/refresh"
```

Cloudflare Worker deployment

1. Install Wrangler and login:

```sh
npm install -g wrangler
wrangler login
```

2. Deploy the Worker (set `account_id` in `currencyapi/worker/wrangler.toml`):

```sh
cd currencyapi/worker
wrangler publish --env production
```

The Worker exposes the same endpoints: `/convert`, `/rates`, `/refresh`. The service uses AZN as the base currency (rates are returned as AZN per unit).

