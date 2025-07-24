// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const dns = require('dns').promises;
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

// Cache configuration
const CACHE_FILE = path.join(__dirname, 'nodes_cache.json');
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
let isRefreshing = false;

if (!IPINFO_TOKEN) {
    console.warn('Warning: IPINFO_TOKEN is not set in environment variables. Geolocation features will be limited.');
} else {
    console.log('IPINFO_TOKEN configured: true');
}

// Cache helper functions
async function readCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

async function writeCache(data) {
    try {
        const cacheData = {
            lastUpdated: new Date().toISOString(),
            data: data
        };
        await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing cache:', error);
        return false;
    }
}

function isCacheValid(cache) {
    if (!cache || !cache.lastUpdated) return false;
    const lastUpdated = new Date(cache.lastUpdated);
    const now = new Date();
    return (now - lastUpdated) < CACHE_DURATION;
}

// Utility functions
function parseWalrusData(jsonData) {
    const nodes = [];

    if (!jsonData.healthInfo || !Array.isArray(jsonData.healthInfo)) {
        throw new Error('Invalid data structure: expected healthInfo array');
    }

    jsonData.healthInfo.forEach((nodeInfo) => {
        let nodeStatus = 'Error';

        if (nodeInfo.healthInfo && nodeInfo.healthInfo.Ok) {
            nodeStatus = nodeInfo.healthInfo.Ok.nodeStatus || 'Unknown';
        } else if (nodeInfo.healthInfo && nodeInfo.healthInfo.Err) {
            nodeStatus = 'Error';
        }

        nodes.push({
            nodeId: nodeInfo.nodeId || 'Unknown',
            nodeUrl: nodeInfo.nodeUrl || 'Unknown',
            nodeName: nodeInfo.nodeName || 'Unknown',
            nodeStatus: nodeStatus,
            walruscanUrl: `https://walruscan.com/mainnet/operator/${nodeInfo.nodeId || 'Unknown'}`
        });
    });

    return nodes;
}

async function getGeolocation(hostname) {
    try {
        if (!IPINFO_TOKEN) {
            console.warn('IPINFO_TOKEN not available, skipping geolocation lookup');
            return {
                country: 'Unknown',
                region: 'Unknown',
                city: 'Unknown'
            };
        }

        // First try to resolve hostname to IP using DNS lookup
        let ip;
        try {
            const { promisify } = require('util');
            const dnsLookup = promisify(require('dns').lookup);
            const result = await dnsLookup(hostname);
            ip = result.address;
            console.log(`Resolved ${hostname} to IP: ${ip}`);
        } catch (dnsError) {
            console.log(`DNS lookup failed for ${hostname}, trying direct hostname lookup`);
            // If DNS lookup fails, try using hostname directly
            ip = hostname;
        }

        // Try to get geolocation data using the resolved IP or hostname
        const response = await fetch(`https://ipinfo.io/${ip}/json?token=${IPINFO_TOKEN}`);
        if (!response.ok) {
            console.log(`Failed to fetch geo data for ${ip} (from ${hostname}), status: ${response.status}`);
            if (response.status === 401) {
                console.error('Authentication failed - check IPINFO_TOKEN');
            }
            return {
                country: 'Unknown',
                region: 'Unknown',
                city: 'Unknown'
            };
        }
        
        const data = await response.json();
        
        // Check if we got valid geolocation data
        if (data.country && data.region && data.city) {
            console.log(`Successfully got geolocation for ${hostname} (${ip}): ${data.country}, ${data.region}, ${data.city}`);
            return {
                country: data.country,
                region: data.region,
                city: data.city,
            };
        } else {
            console.log(`Incomplete geolocation data for ${hostname} (${ip}):`, data);
            return {
                country: data.country || 'Unknown',
                region: data.region || 'Unknown',
                city: data.city || 'Unknown',
            };
        }
    } catch (err) {
        console.error(`Geolocation lookup failed for hostname ${hostname}:`, err.message);
        return {
            country: 'Unknown',
            region: 'Unknown',
            city: 'Unknown'
        };
    }
}

// Function to refresh node data (background process)
async function refreshNodeData() {
    if (isRefreshing) return;
    isRefreshing = true;
    
    try {
        console.log('Refreshing node data...');
        const freshData = await getWalrusNodesWithLocation();
        await writeCache(freshData);
        console.log('Node data refreshed and cached successfully');
    } catch (error) {
        console.error('Error refreshing node data:', error);
    } finally {
        isRefreshing = false;
    }
}

// Function to get cached or fresh node data
async function getCachedNodeData() {
    const cache = await readCache();
    
    if (cache && isCacheValid(cache)) {
        // Cache is valid, return cached data
        return {
            data: cache.data,
            lastUpdated: cache.lastUpdated,
            fromCache: true
        };
    }
    
    // Cache is invalid or doesn't exist
    if (cache && cache.data) {
        // Return stale data and refresh in background
        refreshNodeData(); // Don't await - run in background
        return {
            data: cache.data,
            lastUpdated: cache.lastUpdated,
            fromCache: true,
            stale: true
        };
    }
    
    // No cache exists, fetch fresh data
    try {
        const freshData = await getWalrusNodesWithLocation();
        await writeCache(freshData);
        return {
            data: freshData,
            lastUpdated: new Date().toISOString(),
            fromCache: false
        };
    } catch (error) {
        throw new Error('Failed to fetch node data and no cache available');
    }
}

async function getNodeLocations(nodes) {
    const nodesWithLocation = [];

    for (const node of nodes) {
        try {
            // Extract hostname from nodeUrl (handle URLs without protocol)
            let hostname;
            try {
                // Try with protocol first
                const url = new URL(`http://${node.nodeUrl}`);
                hostname = url.hostname;
            } catch {
                // If that fails, extract hostname manually
                hostname = node.nodeUrl.split(':')[0];
            }
            
            console.log(`Processing node ${node.nodeName} with hostname: ${hostname}`);
            
            // Get geolocation data
            const geo = await getGeolocation(hostname);
            
            nodesWithLocation.push({
                nodeUrl: node.nodeUrl,
                nodeName: node.nodeName,
                nodeStatus: node.nodeStatus,
                walruscanUrl: `https://walruscan.com/mainnet/operator/${node.nodeId}`,
                geo: geo
            });
        } catch (error) {
            console.error(`Error processing node ${node.nodeId}:`, error);
            // Add node without geolocation data if there's an error
            nodesWithLocation.push({
                nodeUrl: node.nodeUrl,
                nodeName: node.nodeName,
                nodeStatus: node.nodeStatus,
                walruscanUrl: `https://walruscan.com/mainnet/operator/${node.nodeId}`,
                geo: {
                    country: 'Unknown',
                    region: 'Unknown',
                    city: 'Unknown'
                }
            });
        }
    }
    
    return nodesWithLocation;
}

async function getWalrusNodesWithLocation() {
    const nodes = await executeWalrusHealth();
    return await getNodeLocations(nodes);
}

async function executeWalrusHealth() {
    try {
        const { stdout, stderr } = await execAsync('walrus health --committee --json');

        if (stderr) {
            console.warn('Command stderr:', stderr);
        }

        let jsonOutput;
        try {
            const trimmedOutput = stdout.trim();
            jsonOutput = JSON.parse(trimmedOutput);
        } catch {
            const lines = stdout.split('\n');
            let jsonLines = [];
            let inJson = false;
            let braceCount = 0;

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (!inJson && (trimmedLine.startsWith('{') || trimmedLine.startsWith('['))) {
                    inJson = true;
                    jsonLines = [line];
                    for (const char of line) {
                        if (char === '{' || char === '[') braceCount++;
                        if (char === '}' || char === ']') braceCount--;
                    }
                } else if (inJson) {
                    jsonLines.push(line);
                    for (const char of line) {
                        if (char === '{' || char === '[') braceCount++;
                        if (char === '}' || char === ']') braceCount--;
                    }
                }

                if (inJson && braceCount === 0) {
                    break;
                }
            }

            if (jsonLines.length > 0) {
                const jsonString = jsonLines.join('\n');
                jsonOutput = JSON.parse(jsonString);
            } else {
                throw new Error('No JSON found in output');
            }
        }

        return parseWalrusData(jsonOutput);
    } catch (error) {
        if (error instanceof Error) {
            console.error('Error executing command:', error.message);
        } else {
            console.error('Unknown error:', error);
        }
        throw error;
    }
}

// API Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Walrus Container API',
        version: '1.0.0',
        endpoints: {
            '/health': 'GET - Get Walrus node health and location data',
            '/nodes': 'GET - Get Walrus nodes with location data'
        }
    });
});

app.get('/health', async (req, res) => {
    try {
        const result = await getCachedNodeData();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            nodeCount: result.data.length,
            nodes: result.data,
            lastUpdated: result.lastUpdated,
            fromCache: result.fromCache,
            stale: result.stale || false
        });
    } catch (error) {
        console.error('Error in /health endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/nodes', async (req, res) => {
    try {
        const result = await getCachedNodeData();
        
        const formattedNodes = result.data.map(node => ({
            ...node,
            location: `${node.geo?.city || 'Unknown'}, ${node.geo?.region || 'Unknown'}, ${node.geo?.country || 'Unknown'}`
        }));
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            nodes: formattedNodes,
            lastUpdated: result.lastUpdated,
            fromCache: result.fromCache,
            stale: result.stale || false
        });
    } catch (error) {
        console.error('Error in /nodes endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Walrus Container API server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`IPINFO_TOKEN configured: ${!!IPINFO_TOKEN}`);
});

module.exports = app;