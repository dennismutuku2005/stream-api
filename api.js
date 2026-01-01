// main.js
const express = require("express");
const { RouterOSAPI } = require("node-routeros");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==================== CONSTANTS ====================
const ROUTER_USERNAME = "stream";
const ROUTER_PASSWORD = "stream123";
const PORT = 80;

// ==================== UTILITY FUNCTIONS ====================

/**
 * Connects to MikroTik router
 */
function connectToRouter({ ip, port }) {
  return new RouterOSAPI({
    host: ip,
    port: port,
    user: ROUTER_USERNAME,
    password: ROUTER_PASSWORD,
    timeout: 5,
  });
}

/**
 * Validates required fields in request body
 */
function validateRequiredFields(req, fields) {
  for (const field of fields) {
    if (!req.body[field]) {
      return {
        isValid: false,
        error: `Missing required field: ${field}`,
      };
    }
  }
  return { isValid: true };
}

// ==================== HOTSPOT HOST ROUTE ====================

/**
 * GET /ip/hotspot/host - List all hotspot hosts
 */
app.post("/ip/hotspot/host", async (req, res) => {
  const { ip, port } = req.body;
  
  // Validate required fields
  const validation = validateRequiredFields(req, ["ip", "port"]);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();
    
    // Fetch hotspot hosts
    const hosts = await conn.write("/ip/hotspot/host/print");
    
    // Format response
    const formattedHosts = hosts.map(host => ({
      id: host[".id"],
      macAddress: host["mac-address"] || "N/A",
      address: host.address || "N/A",
      toAddress: host["to-address"] || "N/A",
      server: host.server || "all",
      uptime: host.uptime || "N/A",
      idleTime: host["idle-time"] || "N/A",
      authorized: host.authorized || false,
      bypassed: host.bypassed || false,
      comment: host.comment || "",
      blocked: host.blocked || false,
      disabled: host.disabled || false,
    }));

    res.json({
      success: true,
      totalHosts: formattedHosts.length,
      hosts: formattedHosts,
    });

  } catch (err) {
    console.error("❌ [Hotspot Host Error]:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch hotspot hosts",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

// ==================== HOTSPOT HOST DETAILS ====================

/**
 * GET /ip/hotspot/host/details - Get detailed information about a specific host
 */
app.post("/ip/hotspot/host/details", async (req, res) => {
  const { ip, port, hostId } = req.body;
  
  const validation = validateRequiredFields(req, ["ip", "port", "hostId"]);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();
    
    // Get specific host by ID
    const hosts = await conn.write("/ip/hotspot/host/print", [
      `?.id=${hostId}`
    ]);
    
    if (hosts.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Host with ID ${hostId} not found`,
      });
    }

    const host = hosts[0];
    
    res.json({
      success: true,
      host: {
        id: host[".id"],
        macAddress: host["mac-address"],
        address: host.address,
        toAddress: host["to-address"],
        server: host.server,
        uptime: host.uptime,
        idleTime: host["idle-time"],
        authorized: host.authorized,
        bypassed: host.bypassed,
        comment: host.comment,
        blocked: host.blocked,
        disabled: host.disabled,
        // Additional fields if they exist
        bytesIn: host["bytes-in"],
        bytesOut: host["bytes-out"],
        packetsIn: host["packets-in"],
        packetsOut: host["packets-out"],
        foundBy: host["found-by"],
        lastSeen: host["last-seen"],
      },
    });

  } catch (err) {
    console.error("❌ [Hotspot Host Details Error]:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch host details",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

// ==================== HOTSPOT HOST FILTER ====================

/**
 * POST /ip/hotspot/host/filter - Filter hosts by criteria
 */
app.post("/ip/hotspot/host/filter", async (req, res) => {
  const { ip, port, filterBy, filterValue } = req.body;
  
  const validation = validateRequiredFields(req, ["ip", "port", "filterBy", "filterValue"]);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();
    
    // Build filter query based on filterBy parameter
    let filterQuery = "";
    switch (filterBy) {
      case "mac":
        filterQuery = `?mac-address=${filterValue}`;
        break;
      case "ip":
        filterQuery = `?address=${filterValue}`;
        break;
      case "authorized":
        filterQuery = `?authorized=${filterValue}`;
        break;
      case "server":
        filterQuery = `?server=${filterValue}`;
        break;
      default:
        filterQuery = `?${filterBy}=${filterValue}`;
    }

    const hosts = await conn.write("/ip/hotspot/host/print", [filterQuery]);
    
    const formattedHosts = hosts.map(host => ({
      id: host[".id"],
      macAddress: host["mac-address"] || "N/A",
      address: host.address || "N/A",
      authorized: host.authorized || false,
      uptime: host.uptime || "N/A",
    }));

    res.json({
      success: true,
      filter: { by: filterBy, value: filterValue },
      totalFound: formattedHosts.length,
      hosts: formattedHosts,
    });

  } catch (err) {
    console.error("❌ [Hotspot Host Filter Error]:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to filter hosts",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

// ==================== HOTSPOT HOST MANAGEMENT ====================

/**
 * POST /ip/hotspot/host/remove - Remove a hotspot host
 */
app.post("/ip/hotspot/host/remove", async (req, res) => {
  const { ip, port, hostId } = req.body;
  
  const validation = validateRequiredFields(req, ["ip", "port", "hostId"]);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();
    
    // Remove the host
    await conn.write("/ip/hotspot/host/remove", [`=.id=${hostId}`]);
    
    res.json({
      success: true,
      message: `Host ${hostId} removed successfully`,
    });

  } catch (err) {
    console.error("❌ [Hotspot Host Remove Error]:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to remove host",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

/**
 * POST /ip/hotspot/host/enable - Enable a disabled host
 */
app.post("/ip/hotspot/host/enable", async (req, res) => {
  const { ip, port, hostId } = req.body;
  
  const validation = validateRequiredFields(req, ["ip", "port", "hostId"]);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();
    
    await conn.write("/ip/hotspot/host/enable", [`=.id=${hostId}`]);
    
    res.json({
      success: true,
      message: `Host ${hostId} enabled successfully`,
    });

  } catch (err) {
    console.error("❌ [Hotspot Host Enable Error]:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to enable host",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

/**
 * POST /ip/hotspot/host/disable - Disable a host
 */
app.post("/ip/hotspot/host/disable", async (req, res) => {
  const { ip, port, hostId } = req.body;
  
  const validation = validateRequiredFields(req, ["ip", "port", "hostId"]);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();
    
    await conn.write("/ip/hotspot/host/disable", [`=.id=${hostId}`]);
    
    res.json({
      success: true,
      message: `Host ${hostId} disabled successfully`,
    });

  } catch (err) {
    console.error("❌ [Hotspot Host Disable Error]:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to disable host",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

// ==================== HOTSPOT HOST STATISTICS ====================

/**
 * POST /ip/hotspot/host/statistics - Get hotspot host statistics
 */
app.post("/ip/hotspot/host/statistics", async (req, res) => {
  const { ip, port } = req.body;
  
  const validation = validateRequiredFields(req, ["ip", "port"]);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();
    
    const hosts = await conn.write("/ip/hotspot/host/print");
    
    // Calculate statistics
    const statistics = {
      total: hosts.length,
      authorized: hosts.filter(h => h.authorized === true).length,
      unauthorized: hosts.filter(h => h.authorized === false).length,
      disabled: hosts.filter(h => h.disabled === true).length,
      blocked: hosts.filter(h => h.blocked === true).length,
      bypassed: hosts.filter(h => h.bypassed === true).length,
      byServer: {},
    };

    // Group by server
    hosts.forEach(host => {
      const server = host.server || 'unknown';
      statistics.byServer[server] = (statistics.byServer[server] || 0) + 1;
    });

    res.json({
      success: true,
      statistics,
      summary: {
        activeHosts: statistics.authorized,
        inactiveHosts: statistics.unauthorized,
        blockedHosts: statistics.blocked,
      },
    });

  } catch (err) {
    console.error("❌ [Hotspot Host Statistics Error]:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to get statistics",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

// ==================== HEALTH CHECK ====================

/**
 * GET / - Health check endpoint
 */
app.get("/", (req, res) => {
  res.json({
    message: "MikroTik Hotspot Host API Server is running",
    version: "1.0.0",
    endpoints: {
      hotspotHosts: [
        "POST /ip/hotspot/host - List all hotspot hosts",
        "POST /ip/hotspot/host/details - Get host details by ID",
        "POST /ip/hotspot/host/filter - Filter hosts by criteria",
        "POST /ip/hotspot/host/remove - Remove a host",
        "POST /ip/hotspot/host/enable - Enable a disabled host",
        "POST /ip/hotspot/host/disable - Disable a host",
        "POST /ip/hotspot/host/statistics - Get host statistics",
      ],
    },
  });
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Hotspot Host endpoints available at:`);
  console.log(`   POST /ip/hotspot/host`);
  console.log(`   POST /ip/hotspot/host/details`);
  console.log(`   POST /ip/hotspot/host/filter`);
  console.log(`   POST /ip/hotspot/host/remove`);
  console.log(`   POST /ip/hotspot/host/enable`);
  console.log(`   POST /ip/hotspot/host/disable`);
  console.log(`   POST /ip/hotspot/host/statistics`);
});

// ==================== ERROR HANDLING ====================

// Global error handler
app.use((err, req, res, next) => {
  console.error("💥 Global Error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    availableEndpoints: [
      "POST /ip/hotspot/host",
      "POST /ip/hotspot/host/details",
      "POST /ip/hotspot/host/filter",
      "POST /ip/hotspot/host/remove",
      "POST /ip/hotspot/host/enable",
      "POST /ip/hotspot/host/disable",
      "POST /ip/hotspot/host/statistics",
      "GET / - Health check",
    ],
  });
});