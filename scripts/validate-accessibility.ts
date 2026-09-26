import { existsSync } from "node:fs";
import { chromium, type Page, type Route } from "playwright-core";

const cdpEndpoint = process.env.DIFFGUARD_A11Y_CDP_URL;
const appUrl = process.env.DIFFGUARD_A11Y_APP_URL ?? "http://localhost:5173";
const debuggingPort = Number(process.env.DIFFGUARD_A11Y_DEBUG_PORT ?? "9333");
const holdForAttachedScan = process.argv.includes("--hold");
const holdAtMobileViewport = process.argv.includes("--hold-mobile");

function findChromeExecutable() {
  const configured = process.env.DIFFGUARD_A11Y_CHROME_PATH;
  const candidates = [
    configured,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    process.env.PROGRAMFILES
      ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`
      : undefined,
    process.env["PROGRAMFILES(X86)"]
      ? `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error(
      "Chrome or Chromium was not found. Install it or set DIFFGUARD_A11Y_CHROME_PATH to its executable.",
    );
  }
  return executable;
}

const reviewRun = {
  id: "audit-run",
  pullRequestNumber: 42,
  headSha: "0123456789abcdef",
  state: "SUCCEEDED",
  attemptCount: 1,
  checkRunConclusion: "success",
  checkRunUrl: null,
  llmState: "SKIPPED",
  llmFailureMessage: null,
  analyzedFileCount: 4,
  skippedFileCount: 0,
  findingCount: 1,
  suppressedFindingCount: 0,
  createdAt: "2026-07-30T00:00:00.000Z",
  completedAt: "2026-07-30T00:00:02.000Z",
};

const repository = {
  id: "audit-repository",
  fullName: "example/repository",
  enabled: true,
  draftPullRequestPolicy: "SKIP",
  checkRunMode: "ADVISORY",
  llmReviewEnabled: false,
  llmModel: "test-model",
  retentionDays: 30,
  ruleConfiguration: {},
  _count: { reviewRuns: 1 },
  reviewRuns: [reviewRun],
};

const metrics = {
  totalRuns: 1,
  byState: { SUCCEEDED: 1 },
  retryRate: 0,
  githubFailureCount: 0,
  averageProcessingMilliseconds: 2_000,
  suppressionRate: 0,
  skippedFileCount: 0,
};

const pilot = {
  status: "COLLECTING",
  readyForEnforcement: false,
  canEnableEnforcing: false,
  developmentBypass: { enabled: false, active: false },
  thresholds: {
    minimumReviewedPullRequests: 20,
    minimumReliability: 0.95,
    minimumPrecision: 0.9,
    minimumVerifiedFindings: 5,
  },
  reviewedPullRequestCount: 1,
  completedRunCount: 1,
  successfulRunCount: 1,
  partialRunCount: 0,
  failedRunCount: 0,
  skippedRunCount: 0,
  reliability: 1,
  eligibleRuleIds: [],
  eligibleRules: [],
  effectiveEnforceableRules: [],
  blockers: ["More advisory evidence is required."],
  rules: [],
};

const reviewDetail = {
  ...reviewRun,
  findings: [{
    id: "audit-finding",
    ruleId: "security.example",
    source: "DETERMINISTIC",
    category: "SECURITY",
    severity: "MEDIUM",
    confidence: 0.9,
    filePath: "src/example.ts",
    lineNumber: 12,
    title: "Example deterministic finding",
    evidence: "A bounded example used only by the local accessibility fixture.",
    explanation: "This fixture exposes the complete review-detail interaction.",
    remediation: "Use the safer implementation pattern.",
    suppressed: false,
    suppressionReason: null,
    pilotVerification: null,
    pilotVerifiedAt: null,
    pilotNotes: null,
  }],
};

function fulfillJson(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    body: JSON.stringify(data),
    contentType: "application/json",
    status,
  });
}

async function installApiFixture(page: Page, repositoryDelayMilliseconds = 0) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/auth/session") {
      return fulfillJson(route, { user: { id: "audit-user", role: "ADMIN" } });
    }
    if (path === "/api/repositories") {
      if (repositoryDelayMilliseconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, repositoryDelayMilliseconds));
      }
      return fulfillJson(route, [repository]);
    }
    if (path === "/api/repositories/audit-repository") return fulfillJson(route, repository);
    if (path === "/api/repositories/audit-repository/metrics") return fulfillJson(route, metrics);
    if (path === "/api/repositories/audit-repository/pilot/status") return fulfillJson(route, pilot);
    if (path === "/api/review-runs/audit-run") return fulfillJson(route, reviewDetail);
    if (path.endsWith("/settings")) return fulfillJson(route, repository);

    return fulfillJson(route, { message: `No accessibility fixture for ${request.method()} ${path}` }, 404);
  });
}

async function semanticSummary(page: Page) {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .map((heading) => ({
        level: Number(heading.tagName.slice(1)),
        text: heading.textContent?.trim() ?? "",
      }));
    const headingSkips = headings.flatMap((heading, index) => {
      if (index === 0) return [];
      const previous = headings[index - 1]!;
      return heading.level > previous.level + 1
        ? [`${previous.level}:${previous.text} -> ${heading.level}:${heading.text}`]
        : [];
    });
    const controls = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea, button"));
    const unlabeledControls = controls.flatMap((control) => {
      const labels = "labels" in control
        ? (control as HTMLInputElement).labels?.length ?? 0
        : 0;
      const hasName = labels > 0 ||
        Boolean(control.getAttribute("aria-label")) ||
        Boolean(control.getAttribute("aria-labelledby")) ||
        Boolean(control.textContent?.trim()) ||
        Boolean(control.getAttribute("title"));
      return hasName ? [] : [control.outerHTML.slice(0, 180)];
    });

    return {
      title: document.title,
      mainLandmarks: document.querySelectorAll("main").length,
      h1Count: document.querySelectorAll("h1").length,
      headings,
      headingSkips,
      unlabeledControls,
      tablesWithoutCaptions: Array.from(document.querySelectorAll("table"))
        .filter((table) => !table.querySelector("caption")).length,
      imagesWithoutAlt: Array.from(document.querySelectorAll("img"))
        .filter((image) => !image.hasAttribute("alt")).length,
    };
  });
}

async function layoutSummary(page: Page, width: number, height: number, textScale = 1) {
  await page.setViewportSize({ width, height });
  await page.evaluate((scale) => {
    document.documentElement.style.fontSize = scale === 1 ? "" : `${scale * 100}%`;
  }, textScale);
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    return {
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > clientWidth + 1,
      uncontainedOverflowingElements: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .flatMap((element) => {
          const rectangle = element.getBoundingClientRect();
          if (rectangle.right <= clientWidth + 1 && rectangle.left >= -1) return [];
          let ancestor = element.parentElement;
          while (ancestor && ancestor !== document.body) {
            if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(ancestor).overflowX)) {
              return [];
            }
            ancestor = ancestor.parentElement;
          }
          return [{
            element: element.tagName.toLowerCase(),
            className: element.className.toString().slice(0, 160),
            text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80),
            left: Math.round(rectangle.left),
            right: Math.round(rectangle.right),
          }];
        })
        .slice(0, 20),
    };
  });
}

async function keyboardSummary(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    (document.activeElement as HTMLElement | null)?.blur();
  });

  const focusableCount = await page.evaluate(() => {
    const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => {
        const rectangle = element.getBoundingClientRect();
        return !element.matches(":disabled") &&
          rectangle.width > 0 &&
          rectangle.height > 0 &&
          getComputedStyle(element).visibility !== "hidden";
      });
    elements.forEach((element, index) => {
      element.dataset.accessibilityFocusIndex = String(index);
    });
    return elements.length;
  });
  const visited = new Set<string>();
  const missingIndicators: string[] = [];

  for (let index = 0; index < focusableCount + 1; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        index: element.dataset.accessibilityFocusIndex,
        identity: [
          element.tagName.toLowerCase(),
          element.getAttribute("name"),
          element.getAttribute("aria-label"),
          element.textContent?.trim().slice(0, 40),
        ].filter(Boolean).join(":"),
        visibleIndicator:
          (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
          style.boxShadow !== "none",
      };
    });
    if (!focused?.index) continue;
    visited.add(focused.index);
    if (!focused.visibleIndicator) missingIndicators.push(focused.identity);
  }

  return {
    focusableCount,
    visitedCount: visited.size,
    missingIndicators: [...new Set(missingIndicators)],
    keyboardTrapDetected: visited.size < Math.max(1, focusableCount - 1),
  };
}

const browser = cdpEndpoint
  ? await chromium.connectOverCDP(cdpEndpoint)
  : await chromium.launch({
    args: [`--remote-debugging-port=${debuggingPort}`],
    executablePath: findChromeExecutable(),
    headless: true,
  });
const context = browser.contexts()[0] ?? await browser.newContext();
const page = await context.newPage();
await installApiFixture(page);
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Review Operations" }).waitFor();
await page.getByRole("heading", { name: "Review Runs" }).waitFor();

const desktopLayout = await layoutSummary(page, 1440, 900);
const mobileLayout = await layoutSummary(page, 320, 800);
const resizedTextLayout = await layoutSummary(page, 1440, 900, 2);
const semantics = await semanticSummary(page);
const keyboard = await keyboardSummary(page);

const inspectButton = page.getByRole("button", { name: "Inspect" });
await inspectButton.click();
const detailHeading = page.getByRole("heading", { name: "Pilot Finding Verification" });
await detailHeading.waitFor();
const detailFocusEntered = await detailHeading.evaluate((element) => element === document.activeElement);
await page.getByRole("button", { name: "Close" }).click();
await page.waitForTimeout(50);
const detailFocusRestored = await inspectButton.evaluate((element) => element === document.activeElement);

const primaryButtonStyles = await page.evaluate(() => {
  const darkButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .filter((button) => button.className.includes("bg-[#0f172a]"));
  return darkButtons.map((button) => {
    const style = getComputedStyle(button);
    return {
      name: button.textContent?.trim(),
      color: style.color,
      backgroundColor: style.backgroundColor,
      opacity: style.opacity,
    };
  });
});

const slowPage = await context.newPage();
await installApiFixture(slowPage, 1_000);
await slowPage.goto(appUrl, { waitUntil: "domcontentloaded" });
const loadingStatus = slowPage.getByRole("status").filter({ hasText: "Loading repositories" });
const slowLoadingStatusAnnounced = await loadingStatus
  .waitFor({ state: "visible", timeout: 750 })
  .then(() => true)
  .catch(() => false);
await slowPage.getByRole("heading", { name: "Review Runs" }).waitFor();
await slowPage.close();

if (holdAtMobileViewport) {
  await page.setViewportSize({ width: 320, height: 800 });
}

const report = {
  url: page.url(),
  timestamp: new Date().toISOString(),
  desktopLayout,
  mobileLayout,
  resizedTextLayout,
  semantics,
  keyboard,
  detailFocusEntered,
  detailFocusRestored,
  slowLoadingStatusAnnounced,
  primaryButtonStyles,
};

console.log(JSON.stringify(report, null, 2));
console.log(`ACCESSIBILITY_FIXTURE_READY port=${debuggingPort}`);

if (holdForAttachedScan) {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

await page.close();
await browser.close();
