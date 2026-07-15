import { expect, test } from "@playwright/test";

test("starts a WebGL race and opens the pause menu", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Formula Kart/);
  await expect(page.getByRole("heading", { name: "FORMULA KART" })).toBeVisible();
  await expect(page.locator(".hero-car canvas")).toBeVisible();

  await page.getByRole("button", { name: "開始比賽 →" }).click();
  await expect(page.getByRole("heading", { name: "建立大獎賽" })).toBeVisible();
  await expect(page.locator(".track-map")).toHaveCount(2);
  const fantasiaMap = await page.locator('.track-map[data-track-id="fantasia"] .track-map-road').getAttribute("d");
  const velocityMap = await page.locator('.track-map[data-track-id="velocity"] .track-map-road').getAttribute("d");
  expect(fantasiaMap?.length).toBeGreaterThan(500);
  expect(velocityMap?.length).toBeGreaterThan(500);
  expect(fantasiaMap).not.toBe(velocityMap);
  await page.getByRole("button", { name: "進入發車區 →" }).click();

  await expect(page.locator(".game-canvas canvas")).toBeVisible();
  await expect(page.getByText("POSITION", { exact: true })).toBeVisible();
  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "比賽暫停" })).toBeVisible();
  await page.getByRole("button", { name: "繼續比賽" }).click();
  await expect(page.getByRole("heading", { name: "比賽暫停" })).toBeHidden();

  await expect(page.locator(".race-hud")).toHaveAttribute("data-race-phase", "racing", { timeout: 8_000 });
  await page.keyboard.down("w");
  await expect.poll(async () => Number(await page.locator(".race-hud").getAttribute("data-speed-intensity")), { timeout: 5_500 }).toBeGreaterThan(0.1);
  await expect.poll(async () => Number(await page.locator(".race-hud").getAttribute("data-ai-speed-spread")), { timeout: 5_000 }).toBeGreaterThan(3);
  const speedIntensity = Number(await page.locator(".race-hud").getAttribute("data-speed-intensity"));
  await page.keyboard.down("d");
  await page.waitForTimeout(650);
  await page.keyboard.up("d");
  const rightOffset = Number(await page.locator(".race-hud").getAttribute("data-lateral-offset"));
  await page.keyboard.down("a");
  await page.waitForTimeout(1_300);
  await page.keyboard.up("a");
  await page.keyboard.up("w");
  const leftOffset = Number(await page.locator(".race-hud").getAttribute("data-lateral-offset"));
  expect(speedIntensity).toBeGreaterThan(0.1);
  expect(leftOffset).toBeLessThan(rightOffset - 0.7);
});

test("creates a live WebSocket room", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "多人", exact: true }).click();
  await page.getByLabel("玩家名稱").fill("Playwright Racer");
  await page.getByRole("button", { name: "建立私人房間" }).click();
  await expect(page.getByText("WEBSOCKET ONLINE")).toBeVisible();
  await expect(page.locator(".room-code b")).toHaveText(/[A-Z2-9]{6}/);
  await expect(page.getByText("Playwright Racer ♛")).toBeVisible();
});

test("countersteering triggers mini turbo and energy triggers nitro", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "開始比賽 →" }).click();
  await page.getByRole("button", { name: "進入發車區 →" }).click();
  await expect(page.locator(".game-canvas canvas")).toBeVisible();

  await expect(page.locator(".race-hud")).toHaveAttribute("data-race-phase", "racing", { timeout: 8_000 });
  await page.keyboard.down("w");
  await page.waitForTimeout(2_600);
  await page.keyboard.down("d");
  await page.keyboard.down("Space");
  await expect(page.locator(".race-hud")).toHaveClass(/is-drifting/);
  await page.waitForTimeout(700);
  await page.keyboard.up("Space");
  await page.keyboard.up("d");
  await page.keyboard.down("a");
  await expect(page.locator(".race-hud")).toHaveAttribute("data-mini-boost-active", "true");
  await page.keyboard.up("a");

  await page.keyboard.press("e");
  await expect(page.locator(".race-hud")).toHaveAttribute("data-nitro-active", "true");
  await expect(page.getByText("NITRO", { exact: true })).toBeVisible();
  await page.waitForTimeout(2_000);
  await expect(page.locator(".race-hud")).toHaveAttribute("data-nitro-active", "true");
  await page.keyboard.up("w");
});

test("recovers from a wall contact without getting trapped in repeated impacts", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByRole("button", { name: "開始比賽 →" }).click();
  await page.getByRole("button", { name: /FANTASIA/ }).click();
  await page.getByRole("button", { name: "進入發車區 →" }).click();
  await expect(page.locator(".game-canvas canvas")).toBeVisible();

  await expect(page.locator(".race-hud")).toHaveAttribute("data-race-phase", "racing", { timeout: 8_000 });
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await expect.poll(async () => Math.abs(Number(await page.locator(".race-hud").getAttribute("data-lateral-offset"))), { timeout: 12_000 }).toBeGreaterThan(18.8);
  await page.keyboard.up("d");
  const wallOffset = Math.abs(Number(await page.locator(".race-hud").getAttribute("data-lateral-offset")));

  await page.keyboard.down("a");
  await expect.poll(async () => Math.abs(Number(await page.locator(".race-hud").getAttribute("data-lateral-offset"))), { timeout: 5_000 }).toBeLessThan(wallOffset - 1.1);
  await page.keyboard.up("a");
  await page.keyboard.up("w");

  // The impact pulse must decay; staying near a wall must not retrigger it on
  // every physics step and leave the camera shaking indefinitely.
  await expect(page.locator(".race-hud")).not.toHaveClass(/has-impact/, { timeout: 2_000 });
});
