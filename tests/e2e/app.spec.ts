import { expect, test } from "@playwright/test";

test("loads the local-first application shell without third-party requests", async ({ page }) => {
  const thirdPartyRequests: string[] = [];

  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.protocol.startsWith("http") && requestUrl.origin !== "http://127.0.0.1:4173") {
      thirdPartyRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("听见每一次发声的变化");
  await expect(page.getByText("原始音频默认不保存，也不上传。", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /开始练声/ })).toBeDisabled();
  expect(thirdPartyRequests).toEqual([]);
});

test("publishes a valid web app manifest", async ({ page, request }) => {
  await page.goto("/");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();

  const response = await request.get(manifestHref ?? "/manifest.webmanifest");
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as {
    name?: string;
    display?: string;
    icons?: Array<{ src?: string }>;
  };
  expect(manifest.name).toBe("Pitchy 实时练声");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons?.[0]?.src).toBe("/icons/pitchy.svg");
});

test("persists explicit theme and language choices across reloads", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "切换到暗色主题" }).click();
  await page.getByRole("button", { name: "切换到英文" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hear every change in your voice",
  );

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Switch to Simplified Chinese" })).toBeVisible();
});
