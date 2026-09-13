import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const readAsset = (source) => fs.readFile(path.join(distRoot, source.replace(/^\.\//, "").replace(/^\//, "")), "utf8");

let html = await fs.readFile(path.join(distRoot, "index.html"), "utf8");
html = html.replace(/\r\n?/g, "\n");
const stylesheet = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/i);
if (stylesheet) {
  const css = await readAsset(stylesheet[1]);
  html = html.replace(stylesheet[0], () => `<style>${css.replaceAll("</style", "<\\/style")}</style>`);
}
const moduleScript = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["'][^>]*><\/script>/i);
if (!moduleScript) throw new Error("构建产物中没有找到入口脚本");
const javascript = await readAsset(moduleScript[1]);
html = html.replace(moduleScript[0], () => `<script type="module">${javascript.replaceAll("</script", "<\\/script")}</script>`);
const faviconPath = path.join(projectRoot, "public", "favicon.svg");
try {
  const favicon = await fs.readFile(faviconPath);
  html = html.replace(/href=["']\.\/?favicon\.svg["']/i, `href="data:image/svg+xml;base64,${favicon.toString("base64")}"`);
} catch {
  html = html.replace(/<link[^>]+rel=["']icon["'][^>]*>/i, "");
}
html = html.replace("</head>", "    <!-- 可直接双击打开；所有程序与样式已包含在本文件中。 -->\n  </head>");
await fs.writeFile(path.join(projectRoot, "local.html"), html);
await fs.writeFile(path.join(distRoot, "local.html"), html);
console.log(`已生成离线单文件：${path.join(projectRoot, "local.html")}`);
