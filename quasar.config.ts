import { defineConfig } from "#q-app";

export default defineConfig(() => ({
  boot: [],
  css: ["tailwind.css", "app.scss"],
  extras: ["material-icons"],
  build: {
    typescript: { strict: true, vueShim: true },
    vueRouterMode: "hash"
  },
  devServer: {
    port: 5173,
    open: false,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } }
  },
  framework: {
    config: { notify: { position: "bottom-right", timeout: 3500 } },
    plugins: ["Notify", "Dialog"]
  },
  animations: []
}));
