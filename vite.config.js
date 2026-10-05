import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Environment variables: REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY (preferred, matches V1)
// or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Both are injected at BUILD time.
//
// GitHub Pages serves a project site from /<repo-name>/. Build with
//   VITE_BASE_PATH=/<repo-name>/ npm run build
// Local dev, `npm run preview`, Vercel and root-domain hosting use the default "./".
// The app uses HashRouter, so refreshing any route works on static hosting.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "./",
  envPrefix: ["VITE_", "REACT_APP_"],
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], charts: ["recharts"], supabase: ["@supabase/supabase-js"] } },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.{js,jsx}"],
    env: { VITE_SUPABASE_URL: "http://localhost:54321", VITE_SUPABASE_ANON_KEY: "test-anon-key" },
  },
});
