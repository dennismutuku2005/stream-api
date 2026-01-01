// main.js
const express = require("express");
const { RouterOSAPI } = require("node-routeros");
const axios = require("axios");

const app = express();
app.use(express.json());

// For proxying requests to another local service
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({ 
        error: "Missing required fields", 
        required: ["number", "message"] 
      });
    }

    // Forward to localhost:4050/sendagain

    
    const response = await axios.post('http://localhost:4050/send', {
      number,
      message
    });

    // Return exactly what we get from the target
    res.json(response.data);

  } catch (error) {
    console.error("❌ Error:", error.message);
    
    if (error.response) {
      // Target server responded with error status
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      // Target server not reachable
      res.status(503).json({ 
        error: "Target server unavailable", 
        details: "Cannot connect to localhost:4050" 
      });
    } else {
      // Other errors
      res.status(500).json({ 
        error: "Internal server error", 
        details: error.message 
      });
    }
  }
});







// Import the PPPoE routes
const pppoeRoutes = require("./pppoe.js");

// Use PPPoE routes under /pppoe path
app.use("/pppoe", pppoeRoutes);

// Use stats routes under /stats path
const statsRoutes = require("./stats.js");

app.use("/stats", statsRoutes);

// MikroTik credentials (always same)
const ROUTER_USERNAME = "testapi";
const ROUTER_PASSWORD = "testapi123";

// Utility function to connect to MikroTik
function connectToRouter({ ip, port }) {
  return new RouterOSAPI({
    host: ip,
    port: port,
    user: ROUTER_USERNAME,
    password: ROUTER_PASSWORD,
    timeout: 5, // seconds
  });
}

// ==================== ADD HOTSPOT USER ====================
app.post("/add-user", async (req, res) => {
  // Extract required fields from request body
  const { ip, port, username, password, profile, comment } = req.body;

  // Validate that all required fields are present
  if (!ip || !port || !username || !password || !profile) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Establish connection to the router
  const conn = connectToRouter({ ip, port });

  try {
    // Connect to the router
    await conn.connect();

    // Prepare MikroTik command parameters
    const params = [
      `=name=${username}`,
      `=password=${password}`, 
      `=profile=${profile}`,
    ];

    // Add comment if provided
    if (comment) {
      params.push(`=comment=${comment}`);
    }

    // Add new hotspot user with provided credentials
    await conn.write("/ip/hotspot/user/add", params);

    // Return success response
    res.json({
      success: true,
      message: `✅ Hotspot user '${username}' created successfully`,
    });
  } catch (err) {
    // Log and handle any errors that occur during the process
    console.error("❌ [Add User Error]:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Unknown error",
    });
  } finally {
    // Ensure connection is closed even if errors occur
    conn.close().catch(() => {});
  }
});

// ==================== DELETE HOTSPOT USER ====================
app.post("/delete-user", async (req, res) => {
  const { ip, port, username } = req.body;

  if (!ip || !port || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();

    // 1️⃣ Find and remove any active sessions
    const activeSessions = await conn.write("/ip/hotspot/active/print", [
      `?user=${username}`,
    ]);

    let sessionsTerminated = 0;
    for (const session of activeSessions) {
      if (session[".id"]) {
        await conn.write("/ip/hotspot/active/remove", [`.id=${session[".id"]}`]);
        sessionsTerminated++;
      }
    }

    console.log(`🔌 Terminated ${sessionsTerminated} active sessions for '${username}'`);

    // 2️⃣ Find the user entry
    const users = await conn.write("/ip/hotspot/user/print", [
      `?name=${username}`,
    ]);

    if (users.length === 0) {
      return res.json({
        success: true,
        message: `User '${username}' not found, but terminated ${sessionsTerminated} active sessions`,
        sessionsTerminated,
      });
    }

    // 3️⃣ Remove user by ID
    const userId = users[0][".id"];
    if (userId) {
      await conn.write("/ip/hotspot/user/remove", [`.id=${userId}`]);
      console.log(`🗑️ Removed user '${username}' from hotspot list`);
    }

    res.json({
      success: true,
      message: `✅ User '${username}' deleted and ${sessionsTerminated} sessions terminated`,
      sessionsTerminated,
    });

  } catch (err) {
    console.error("❌ [Delete User Error]:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Unknown error",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

app.post("/delete-userv7", async (req, res) => {
  const { ip, port, username } = req.body;

  if (!ip || !port || !username) {
    return res.status(400).json({ error: "Missing required fields (ip, port, username)" });
  }

  const api = connectToRouter({ ip, port });
  console.log(`🚀 Connecting to RouterOS at ${ip}:${port}...`);

  try {
    await api.connect();
    console.log("✅ Connected to RouterOS v7");

    // Step 1️⃣: Find the user
    const users = await api.write("/ip/hotspot/user/print");
    const target = users.find((u) => u.name === username);

    if (!target) {
      console.log(`⚠️ User '${username}' not found.`);
      await api.close();
      return res.json({
        success: true,
        message: `User '${username}' not found.`,
        sessionsTerminated: 0,
      });
    }

    console.log(`📋 Found user '${username}' with ID ${target[".id"]}`);

    // Step 2️⃣: Remove the user first
    console.log(`🗑️ Removing user '${username}' (${target[".id"]})...`);
    await api.write("/ip/hotspot/user/remove", [`=.id=${target[".id"]}`]);
    console.log("✅ User removed successfully!");

    // Step 3️⃣: Now remove any active sessions
    console.log("🔍 Checking for active sessions...");
    const activeSessions = await api.write("/ip/hotspot/active/print");
    const userSessions = activeSessions.filter((a) => a.user === username);

    let sessionsTerminated = 0;
    for (const session of userSessions) {
      if (session[".id"]) {
        console.log(`🔌 Removing active session (${session[".id"]}) for '${username}'...`);
        await api.write("/ip/hotspot/active/remove", [`=.id=${session[".id"]}`]);
        sessionsTerminated++;
      }
    }

    if (sessionsTerminated > 0) {
      console.log(`✅ Removed ${sessionsTerminated} active session(s) for '${username}'.`);
    } else {
      console.log("ℹ️ No active sessions found for this user.");
    }

    // Step 4️⃣: Respond to client
    res.json({
      success: true,
      message: `✅ User '${username}' deleted first, then ${sessionsTerminated} active session(s) removed.`,
      sessionsTerminated,
    });

  } catch (err) {
    console.error("❌ [Delete User v7 Error]:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Unknown error occurred",
    });
  } finally {
    await api.close().catch(() => {});
    console.log("🔒 Connection closed");
  }
});


// ==================== GET HOTSPOT STATS ====================
app.post("/hotspot-stats", async (req, res) => {
  const { ip, port } = req.body;

  if (!ip || !port) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const conn = connectToRouter({ ip, port });

  try {
    await conn.connect();

    // 1. Get all hotspot users
    const users = await conn.write("/ip/hotspot/user/print");

    // 2. Get all active sessions
    const active = await conn.write("/ip/hotspot/active/print");

    res.json({
      success: true,
      stats: {
        totalUsers: users.length,
        activeUsers: active.length,
      },
      details: {
        users: users.map(u => ({
          id: u[".id"],
          name: u.name,
          profile: u.profile,
        })),
        active: active.map(a => ({
          id: a[".id"],
          user: a.user,
          address: a.address,
          mac: a["mac-address"],
          uptime: a.uptime,
        })),
      },
    });
  } catch (err) {
    console.error("❌ [Hotspot Stats Error]:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Unknown error",
    });
  } finally {
    conn.close().catch(() => {});
  }
});

// ==================== HEALTH CHECK ====================
app.get("/", (req, res) => {
  res.json({
    message: "MikroTik API Server is running",
    endpoints: {
      hotspot: [
        "POST /add-user",
        "POST /delete-user", 
        "POST /hotspot-stats"
      ],
      pppoe: [
        "POST /pppoe/secrets",
        "POST /pppoe/add-secret",
        "POST /pppoe/delete-secret",
        "POST /pppoe/active",
        "POST /pppoe/profiles"
      ],
      stats: [
        "POST /router/hotspot/active",
        "POST /router/hotspot/users",
        "POST /router/hotspot/users",
        "POST /router/interfaces"

      ]
    }
  });
});

// ==================== START SERVER ====================
const PORT = 80;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Hotspot endpoints available at: /add-user, /delete-user, /hotspot-stats`);
  console.log(`stats endpoints available at: /stats/*`);
  console.log(`🔗 PPPoE endpoints available at: /pppoe/*`);
});



// ==================== GLOBAL ERROR HANDLERS ====================

// Keep track of pending responses
const activeResponses = new Set();

app.use((req, res, next) => {
  activeResponses.add(res);
  res.on("finish", () => activeResponses.delete(res));
  next();
});

// Prevent the app from crashing on unhandled rejections or exceptions
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);

  // Try to send error response to any active requests
  for (const res of activeResponses) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Server crashed unexpectedly. Please try again.",
        details: err.message || "Unknown error",
      });
    }
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection:", reason);

  for (const res of activeResponses) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Unhandled promise rejection occurred.",
        details: reason?.message || reason || "Unknown reason",
      });
    }
  }
});