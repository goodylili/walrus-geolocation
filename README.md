# Walrus Container API

A containerized Node.js API server that executes Walrus CLI commands and provides node health and location data.

## Features

- **REST API**: Exposes endpoints to get Walrus node health and location data
- **Geolocation**: Resolves node IP addresses and fetches geographic information
- **Containerized**: Fully dockerized with Walrus CLI pre-installed
- **CORS Enabled**: Ready for frontend integration

## API Endpoints

### `GET /`
Returns API information and available endpoints.

### `GET /health`
Executes `walrus health --committee --json` and returns node data with geolocation information.

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "nodeCount": 5,
  "nodes": [
    {
      "nodeId": "node-123",
      "nodeUrl": "https://node1.example.com:8080",
      "nodeName": "Node 1",
      "nodeStatus": "Healthy",
      "networkPublicKey": "0x...",
      "ipAddress": "192.168.1.1",
      "geo": {
        "country": "US",
        "region": "California",
        "city": "San Francisco"
      }
    }
  ]
}
```

### `GET /nodes`
Same as `/health` but includes a formatted location string for each node.

## Environment Variables

- `IPINFO_TOKEN`: (Optional) IPInfo.io API token for geolocation services
- `PORT`: (Optional) Server port, defaults to 3000
- `NODE_ENV`: (Optional) Node.js environment, defaults to development

## Quick Start

### Using Docker

1. **Build the container:**
   ```bash
   docker build -t walrus-container .
   ```

2. **Run the container:**
   ```bash
   # Without geolocation (basic functionality)
   docker run -p 3000:3000 walrus-container
   
   # With geolocation (requires IPInfo token)
   docker run -p 3000:3000 -e IPINFO_TOKEN=your_token_here walrus-container
   ```

3. **Test the API:**
   ```bash
   curl http://localhost:3000/health
   ```

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Walrus CLI** (if not already installed):
   ```bash
   curl -sSf https://install.wal.app | sh
   ```

3. **Set environment variables** (optional):
   ```bash
   export IPINFO_TOKEN=your_token_here
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

## Docker Compose (Optional)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  walrus-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - IPINFO_TOKEN=${IPINFO_TOKEN}
      - NODE_ENV=production
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

## Frontend Integration

Example JavaScript code to fetch node data:

```javascript
// Fetch Walrus node health data
async function getWalrusNodes() {
  try {
    const response = await fetch('http://localhost:3000/nodes');
    const data = await response.json();
    
    if (data.success) {
      console.log(`Found ${data.nodes.length} nodes`);
      data.nodes.forEach(node => {
        console.log(`${node.nodeName}: ${node.location} (${node.nodeStatus})`);
      });
    }
  } catch (error) {
    console.error('Error fetching nodes:', error);
  }
}

getWalrusNodes();
```

## Production Deployment

### Security Considerations
- Use environment variables for sensitive data (API tokens)
- Consider running the container with a non-root user
- Implement rate limiting if exposing publicly
- Use HTTPS in production

### Scaling
- The API is stateless and can be horizontally scaled
- Consider using a load balancer for multiple instances
- Monitor resource usage as Walrus CLI commands may be resource-intensive

## Troubleshooting

### Common Issues

1. **Walrus CLI not found:**
   - Ensure the Walrus CLI is properly installed in the container
   - Check that `/root/.local/bin` is in the PATH

2. **Geolocation not working:**
   - Verify `IPINFO_TOKEN` is set correctly
   - Check IPInfo.io API limits and usage

3. **DNS resolution failures:**
   - Some node URLs may not resolve properly
   - This is handled gracefully with fallback values

### Logs

View container logs:
```bash
docker logs <container_id>
```

## License

ISC License