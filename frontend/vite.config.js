import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8081",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (error, _request, response) => {
            console.error("[vite proxy] Peerly API unavailable:", error.message);
            if (!("writeHead" in response) || response.headersSent) return;
            response.writeHead(503, { "Content-Type": "application/json" });
            response.end(JSON.stringify({
              message: "Peerly's backend is not responding. Run `npm run dev:api:node` from the project folder and wait for MongoDB and the Node API to start.",
            }));
          });
        },
      },
    },
  },
});
