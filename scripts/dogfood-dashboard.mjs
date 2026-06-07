#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const url = process.env.DASHBOARD_URL ?? "http://127.0.0.1:4791";
const outDir = process.env.DOGFOOD_OUT ?? join(process.cwd(), ".review-shots", "grok-dogfood");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const findings = [];

function note(id, severity, title, detail) {
  findings.push({ id, severity, title, detail });
}

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

await page.screenshot({ path: join(outDir, "01-initial.png"), fullPage: false });

// Layout: page should not scroll; feed and side panel scroll internally
const pageScroll = await page.evaluate(() => ({
  bodyOverflow: getComputedStyle(document.body).overflow,
  bodyScrollHeight: document.body.scrollHeight,
  bodyClientHeight: document.body.clientHeight,
  htmlOverflow: getComputedStyle(document.documentElement).overflow
}));
if (pageScroll.bodyOverflow !== "hidden") {
  note("L1", "P1", "Body not overflow:hidden", JSON.stringify(pageScroll));
}
if (pageScroll.bodyScrollHeight > pageScroll.bodyClientHeight + 2) {
  note("L2", "P2", "Page taller than viewport", JSON.stringify(pageScroll));
}

const composer = page.locator("#message-form");
const composerBox = await composer.boundingBox();
const viewport = page.viewportSize();
if (!composerBox || composerBox.y + composerBox.height > viewport.height + 2) {
  note("L3", "P1", "Composer not visible without page scroll", JSON.stringify({ composerBox, viewport }));
}

const feedScroll = page.locator("#feed.feed");
const sidePanel = page.locator(".side-panel, aside.panel").first();
if (await feedScroll.count()) {
  const feedOverflow = await feedScroll.evaluate((el) => getComputedStyle(el).overflowY);
  if (!feedOverflow.includes("auto") && feedOverflow !== "scroll") {
    note("L4", "P2", "Feed panel may not scroll internally", feedOverflow);
  }
}

// Feed must scroll when content overflows
if (await feedScroll.count()) {
  const feedMetrics = await feedScroll.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
    minHeight: getComputedStyle(el).minHeight
  }));
  if (feedMetrics.scrollHeight > feedMetrics.clientHeight + 2) {
    await feedScroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const scrollTop = await feedScroll.evaluate((el) => el.scrollTop);
    if (scrollTop < 10) {
      note("L4b", "P0", "Feed cannot scroll despite overflow", JSON.stringify({ feedMetrics, scrollTop }));
    }
  } else if (feedMetrics.overflowY !== "auto" && feedMetrics.overflowY !== "scroll") {
    note("L4", "P2", "Feed panel may not scroll internally", feedMetrics.overflowY);
  }
}

// Composer identity field
const postingAs = page.locator("#composer-user");
if ((await postingAs.count()) === 0) {
  note("L5", "P1", "Missing Posting as field", "composer-user not found");
} else {
  await postingAs.fill("GrokTest");
}

// Instant clear on Enter
const bodyInput = page.locator("#message");
const testMsg = `grok dogfood probe ${Date.now()}`;
await bodyInput.fill(testMsg);
const beforeEnter = await bodyInput.inputValue();
await bodyInput.press("Enter");
await page.waitForTimeout(300);
const afterEnter = await bodyInput.inputValue();
if (afterEnter === beforeEnter) {
  note("L6", "P1", "Enter did not clear composer instantly", { beforeEnter, afterEnter });
}

await page.waitForTimeout(1500);
await page.screenshot({ path: join(outDir, "02-after-post.png"), fullPage: false });

// Check newest message appears at top of feed
const firstCard = page.locator("#feed .card").first();
const firstText = (await firstCard.textContent().catch(() => "")) ?? "";
if (!firstText.includes("grok dogfood probe")) {
  note("L7", "P2", "New message not at top of feed", firstText.slice(0, 120));
}

// Side panel independence: scroll feed, side panel should stay in view
if (await feedScroll.count()) {
  await feedScroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const sideBoxAfter = await sidePanel.boundingBox().catch(() => null);
  if (sideBoxAfter && sideBoxAfter.y < 0) {
    note("L8", "P1", "Side panel scrolled off-screen with feed", JSON.stringify(sideBoxAfter));
  }
}

await page.screenshot({ path: join(outDir, "03-scrolled-feed.png"), fullPage: false });

// Mobile-ish half-screen dock
await page.setViewportSize({ width: 720, height: 900 });
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, "04-half-screen.png"), fullPage: false });
const composerHalf = await composer.boundingBox();
if (!composerHalf || composerHalf.y + composerHalf.height > 900) {
  note("L9", "P1", "Composer clipped at half-screen width", JSON.stringify(composerHalf));
}

await browser.close();

console.log(JSON.stringify({ url, outDir, findings }, null, 2));
process.exit(findings.some((f) => f.severity === "P1") ? 1 : 0);