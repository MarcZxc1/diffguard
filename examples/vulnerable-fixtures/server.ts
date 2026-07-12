// intentionally vulnerable teaching fixture

import express from "express";

export function createInsecureServer() {
  const app = express();
  
  app.use(express.json());

  // Permissive CORS/security config
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "*");
    next();
  });

  const dataStore: Record<string, any> = {};

  // Unvalidated request body write
  app.post("/data/:id", (req, res) => {
    const id = req.params.id;
    // Writing user-provided body directly to the datastore without validation
    dataStore[id] = req.body;
    res.json({ success: true });
  });

  return app;
}
