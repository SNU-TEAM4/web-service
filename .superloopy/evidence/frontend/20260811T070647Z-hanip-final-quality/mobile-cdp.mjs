import { writeFile } from "node:fs/promises";

const pageUrl = "http://127.0.0.1:3100/?mobileqa=1";
const create = await fetch(`http://127.0.0.1:9224/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" });
const target = await create.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
});
await send("Page.navigate", { url: pageUrl });
await new Promise((resolve) => setTimeout(resolve, 1800));
const dimensions = await send("Runtime.evaluate", {
  expression: "JSON.stringify({innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,devicePixelRatio})",
  returnByValue: true,
});
const shot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
await writeFile(new URL("mobile-cdp-390x844.png", import.meta.url), Buffer.from(shot.data, "base64"));
await writeFile(new URL("mobile-cdp-metrics.json", import.meta.url), `${dimensions.result.value}\n`);
console.log(dimensions.result.value);
socket.close();
