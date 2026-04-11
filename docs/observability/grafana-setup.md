# Grafana Cloud Setup

## 1. Create Grafana Cloud Stack

1. Go to [grafana.com/auth/sign-up](https://grafana.com/auth/sign-up)
2. Create a new stack (free tier: 14-day retention, 10k series)
3. Note your **Stack ID** and **Region**

## 2. Generate Prometheus Remote Write Token

1. In your Grafana Cloud stack → **Connections** → **Add new connection**
2. Select **Prometheus**
3. Generate an API key with **MetricsPublisher** role
4. Note:
   - `PROMETHEUS_REMOTE_WRITE_URL` (e.g., `https://prometheus-prod-XX.grafana.net/api/prom/push`)
   - `GRAFANA_METRICS_USER` (numeric user ID)
   - `GRAFANA_METRICS_API_KEY` (the generated key)

## 3. Configure Prometheus Remote Write per Service

Each service exposes `/metrics` at its health port. To scrape and forward:

### Option A: Grafana Agent (recommended for Railway)

Install [Grafana Agent](https://grafana.com/docs/agent/latest/) as a Railway service:

```yaml
# grafana-agent.yml
metrics:
  global:
    scrape_interval: 30s
  configs:
    - name: railbird
      scrape_configs:
        - job_name: ownerview
          static_configs:
            - targets: ['ownerview:3001']
          metrics_path: /metrics
        - job_name: indexer
          static_configs:
            - targets: ['indexer:3002']
          metrics_path: /metrics
        - job_name: keeper
          static_configs:
            - targets: ['keeper:3004']
          metrics_path: /metrics
        - job_name: agent
          static_configs:
            - targets: ['agent:3005']
          metrics_path: /metrics
      remote_write:
        - url: ${PROMETHEUS_REMOTE_WRITE_URL}
          basic_auth:
            username: ${GRAFANA_METRICS_USER}
            password: ${GRAFANA_METRICS_API_KEY}
```

### Option B: Prometheus with remote_write

```yaml
# prometheus.yml
global:
  scrape_interval: 30s
remote_write:
  - url: ${PROMETHEUS_REMOTE_WRITE_URL}
    basic_auth:
      username: ${GRAFANA_METRICS_USER}
      password: ${GRAFANA_METRICS_API_KEY}
scrape_configs:
  - job_name: railbird-services
    static_configs:
      - targets:
          - ownerview:3001
          - indexer:3002
    metrics_path: /metrics
```

## 4. Import Dashboards

In Grafana Cloud → **Dashboards** → **Import**:

1. Import `infra/grafana/dashboards/bots.json` — Bot health, actions, circuit state
2. Import `infra/grafana/dashboards/indexer.json` — Block lag, WS subscribers, API latency
3. Import `infra/grafana/dashboards/ownerview.json` — Auth attempts, rate limits, JWT sessions

## 5. Security: Protect /metrics

The `/metrics` endpoint should not be publicly accessible. Options:

- **Railway private networking**: Only allow Grafana Agent to access `/metrics` via internal hostname
- **IP allowlist**: Add `METRICS_AUTH_TOKEN` env and require `Authorization: Bearer` on `/metrics`
- **Basic auth on Prometheus scrape**: Use `metrics_basic_auth` in scrape config

## 6. Alerts

After dashboards are set up, create alerts:
- `railbird_indexer_block_lag > 30` → page on-call
- `rate(railbird_bot_errors_total[5m]) > 0.1` → notify team
- `railbird_bot_circuit_state == 2` → page on-call (circuit open)
