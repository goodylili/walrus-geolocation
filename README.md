# Walrus Container API

Containerized API for Walrus network monitoring with geolocation data and smart caching.

## Quick Start

```bash
# Setup environment
echo "IPINFO_TOKEN=your_token_here" > .env

# Build and run
docker build -t walrus-container .
docker run -d --name walrus-api -p 3000:3000 walrus-container
```

API available at `http://localhost:3000`

## API Endpoints

- `GET /health` - Network health with node geolocation data
- `GET /nodes` - Detailed node information

```bash
# Make requests
curl -s http://localhost:3000/health | jq .
```

## Response Format

```json
{
  "status": "success",
  "totalNodes": 45,
  "activeNodes": 32,
  "errorNodes": 13,
  "nodes": [
    {
      "nodeUrl": "walrus.chainbase.online:9185",
      "nodeName": "ChainBase",
      "nodeStatus": "Active",
      "walruscanUrl": "https://walruscan.com/mainnet/operator/0x...",
      "geo": {
        "country": "US",
        "region": "Virginia",
        "city": "Leesburg"
      }
    }
  ],
  "lastUpdated": "2025-07-24T20:25:20.858Z",
  "fromCache": true,
  "stale": false
}

## Docker Management

```bash
# Stop/restart
docker stop walrus-api
docker rm walrus-api
docker run -d --name walrus-api -p 3000:3000 walrus-container

# Logs
docker logs -f walrus-api
```
