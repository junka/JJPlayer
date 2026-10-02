import { test, expect, _electron as electron } from "@playwright/test";

test("homepage has title and renders the player", async () => {
  const app = await electron.launch({ args: [".", "--no-sandbox"] });
  try {
    const page = await app.firstWindow();
    expect(await page.title()).toBe("JJPlayer");
    await expect(page.locator(".video-js")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/example.png" });
  } finally {
    await app.close();
  }
});
