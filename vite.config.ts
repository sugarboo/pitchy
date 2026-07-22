import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/pitchy.svg"],
      manifest: {
        name: "Pitchy 实时练声",
        short_name: "Pitchy",
        description: "隐私优先、完全本地运行的实时练声反馈工具。",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#08111f",
        theme_color: "#08111f",
        categories: ["music", "education", "utilities"],
        icons: [
          {
            src: "/icons/pitchy.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        globPatterns: ["**/*.{html,js,css,svg,webmanifest}"],
        navigateFallback: "index.html",
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: "es2022",
  },
});
