import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "/tmp/package/lib/puppeteer/puppeteer-core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, "assets/demo");
const FRAMES_DIR = "/tmp/demo-frames";
const TIMELINE = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, "demo-timeline.json"), "utf8"));
const TOTAL_MS = 125000;
const FPS = 10;
const W = 720;
const H = 1280;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  if (rel === "/") rel = "/index.html";
  const fp = path.join(ROOT, rel);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("x");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(8795, "127.0.0.1", r));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function injectCaption(page, text) {
  await page.evaluate((caption) => {
    if (!document.getElementById("demo-caption-style")) {
      const style = document.createElement("style");
      style.id = "demo-caption-style";
      style.textContent = `
        .view[data-view="booking"].is-active #wizardActions {
          margin-bottom: 118px !important;
        }
      `;
      document.head.appendChild(style);
    }

    let wrap = document.getElementById("demo-caption-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "demo-caption-wrap";
      wrap.style.cssText = [
        "position:fixed",
        "left:0",
        "right:0",
        "bottom:0",
        "z-index:2147483647",
        "pointer-events:none",
        "padding:0 14px 16px",
        "display:flex",
        "justify-content:center",
        "background:linear-gradient(0deg,rgba(26,18,12,0.55) 0%,rgba(26,18,12,0) 100%)",
      ].join(";");

      const card = document.createElement("div");
      card.id = "demo-caption-card";
      card.style.cssText = [
        "width:100%",
        "max-width:692px",
        "background:#fffdf9",
        "border-radius:16px",
        "border:2px solid #8b6914",
        "border-top:5px solid #c4a35a",
        "padding:12px 16px 14px",
        "box-shadow:0 10px 32px rgba(0,0,0,0.38)",
        "direction:rtl",
        "text-align:center",
      ].join(";");

      const badge = document.createElement("div");
      badge.id = "demo-caption-badge";
      badge.textContent = "● شاي بكر";
      badge.style.cssText = [
        "font-family:Tajawal,Segoe UI,sans-serif",
        "font-size:13px",
        "font-weight:800",
        "color:#8b6914",
        "margin-bottom:4px",
      ].join(";");

      const line = document.createElement("div");
      line.id = "demo-caption-text";
      line.style.cssText = [
        "font-family:Tajawal,Segoe UI,sans-serif",
        "font-size:22px",
        "font-weight:800",
        "line-height:1.5",
        "color:#2a1810",
        "letter-spacing:0.01em",
      ].join(";");

      card.appendChild(badge);
      card.appendChild(line);
      wrap.appendChild(card);
      document.body.appendChild(wrap);
    }

    const line = document.getElementById("demo-caption-text");
    if (line) {
      line.textContent = caption;
      const len = caption.length;
      line.style.fontSize = len > 72 ? "17px" : len > 52 ? "19px" : "21px";
    }

    const card = document.getElementById("demo-caption-card");
    if (card) {
      card.style.padding = caption.length > 72 ? "10px 14px 12px" : "12px 16px 14px";
    }
  }, text);
}

async function polishDemoUi(page) {
  await page.evaluate(() => {
    const h2 = document.querySelector("#packages h2");
    if (h2) h2.textContent = "باقات الضيافة";
    const p = document.querySelector("#packages .section-head p");
    if (p) p.textContent = "اختر الباقة المناسبة لمناسبتك — التفاصيل والأسعار واضحة من أول نظرة.";
  });
}

async function runActions(page, action) {
  if (!action) return;
  const clickNext = async () => {
    const btn = await page.$("#btnNext:not([disabled])");
    if (btn) await btn.click();
    await sleep(350);
  };

  switch (action) {
    case "home":
      await page.goto("http://127.0.0.1:8795/", { waitUntil: "networkidle0", timeout: 60000 });
      await polishDemoUi(page);
      break;
    case "scroll_packages":
      await page.evaluate(() => document.querySelector("#packages")?.scrollIntoView({ behavior: "instant", block: "start" }));
      await sleep(400);
      break;
    case "open_details":
      await page.evaluate(() => {
        const d = document.querySelector("#marketPackages details.pkg-details");
        if (d) d.open = true;
      });
      await sleep(600);
      break;
    case "start_booking":
      await page.click("#heroOrderBtn");
      await sleep(500);
      break;
    case "pick_city":
      await page.click('.choice-card[data-id="jeddah"]');
      await sleep(200);
      await clickNext();
      break;
    case "pick_event":
      await page.waitForSelector('.choice-card[data-id="wedding"]');
      await page.click('.choice-card[data-id="wedding"]');
      await sleep(200);
      await clickNext();
      break;
    case "pick_package":
      await page.waitForSelector(".pkg-pick");
      await page.click('.pkg-pick[data-pick-pkg="gold"]');
      await sleep(400);
      await clickNext();
      break;
    case "addons_next":
      await clickNext();
      break;
    case "pick_date": {
      await page.waitForSelector(".day-btn.available");
      await page.click(".day-btn.available");
      await sleep(300);
      await clickNext();
      break;
    }
    case "fill_name":
      await page.waitForSelector("#inputName");
      await page.type("#inputName", "مازن الذبياني", { delay: 40 });
      await clickNext();
      break;
    case "fill_phone":
      await page.waitForSelector("#inputPhone");
      await page.type("#inputPhone", "0536786288", { delay: 40 });
      await clickNext();
      break;
    case "fill_location":
      await page.waitForSelector("#inputHallName");
      await page.type("#inputHallName", "قاعة السفير", { delay: 40 });
      await clickNext();
      await clickNext();
      break;
    case "success":
      await page.evaluate(() => {
        document.querySelector(".view[data-view='booking'] .wizard-body").innerHTML = `
          <div class="success-wrap">
            <div class="success-card">
              <div class="success-mark">✓</div>
              <h2>تم استلام طلبك</h2>
              <p class="success-lead">سيصلك التأكيد عبر الواتساب في أسرع وقت.</p>
            </div>
          </div>`;
      });
      await sleep(600);
      break;
    case "contact":
      await page.evaluate(() => {
        document.querySelector('.view[data-view="booking"]')?.classList.remove("is-active");
        document.querySelector('.view[data-view="home"]')?.classList.add("is-active");
        document.querySelector("#contact")?.scrollIntoView({ behavior: "instant", block: "start" });
      });
      await sleep(500);
      break;
    default:
      break;
  }
}

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
});

const page = await browser.newPage();
await page.setViewport({ width: W, height: H, isMobile: true, deviceScaleFactor: 2, hasTouch: true });

let actionIndex = 0;

await runActions(page, TIMELINE[0].action);
await injectCaption(page, TIMELINE[0].text);

async function applyStep(page, step) {
  if (step.action) await runActions(page, step.action);
  await injectCaption(page, step.text);
  await sleep(120);
}

const frameInterval = 1000 / FPS;
const totalFrames = Math.ceil(TOTAL_MS / frameInterval);

for (let i = 0; i < totalFrames; i++) {
  const nextElapsed = i * frameInterval;
  while (actionIndex + 1 < TIMELINE.length && TIMELINE[actionIndex + 1].t * 1000 <= nextElapsed) {
    actionIndex += 1;
    await applyStep(page, TIMELINE[actionIndex]);
  }
  const framePath = path.join(FRAMES_DIR, `frame_${String(i).padStart(5, "0")}.png`);
  await page.screenshot({ path: framePath, type: "png" });
}

await browser.close();
server.close();

const mp4Path = path.join(OUT_DIR, "shai-bakr-client-demo.mp4");
const srtPath = path.join(OUT_DIR, "shai-bakr-captions.srt");
const scriptPath = path.join(OUT_DIR, "voiceover-script.txt");

function srtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

let srt = "";
TIMELINE.forEach((step, idx) => {
  const start = step.t;
  const end = TIMELINE[idx + 1]?.t ?? 125;
  srt += `${idx + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${step.text}\n\n`;
});
fs.writeFileSync(srtPath, srt, "utf8");
fs.writeFileSync(
  scriptPath,
  TIMELINE.map((s) => `[${String(s.t).padStart(3, "0")}s] ${s.text}`).join("\n"),
  "utf8"
);

await new Promise((resolve, reject) => {
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      path.join(FRAMES_DIR, "frame_%05d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4Path,
    ],
    { stdio: "inherit" }
  );
  ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
});

const size = fs.statSync(mp4Path).size;
console.log(JSON.stringify({ mp4Path, srtPath, scriptPath, size, durationSec: TOTAL_MS / 1000 }, null, 2));
