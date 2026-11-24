import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: "node_modules/cesium/Build/Cesium/Workers", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/ThirdParty", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Assets", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Widgets", dest: "cesium" },
      ],
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8050",
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/cesium")) return "vendor-cesium";
          if (
            id.includes("node_modules/@deck.gl") ||
            id.includes("node_modules/@luma.gl") ||
            id.includes("node_modules/@loaders.gl") ||
            id.includes("node_modules/@math.gl")
          ) {
            return "vendor-deckgl";
          }
          if (id.includes("node_modules/maplibre-gl")) return "vendor-maplibre";
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/victory-vendor") ||
            id.includes("node_modules/d3-")
          ) {
            return "vendor-charts";
          }
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "vendor-react";
          }
        },
      },
    },
  },
});
