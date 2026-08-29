import { defineConfig } from "vite";

export default defineConfig({
  base: "/amazon-quarterly-tool-web/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
