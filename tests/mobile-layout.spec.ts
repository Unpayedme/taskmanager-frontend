import { test, expect, type Page } from "@playwright/test";

async function mockApi(page: Page, signedIn: boolean) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith("/auth/config")
      ? {
          googleEnabled: true,
          googleClientId: "layout-client.apps.googleusercontent.com"
        }
      : path.endsWith("/auth/refresh")
        ? signedIn
          ? {
              accessToken: "layout-token",
              user: {
                id: "00000000-0000-4000-8000-000000000001",
                name: "A very long account name that should stay inside the drawer",
                email: "long-account@example.com"
              }
            }
          : { error: { code: "UNAUTHENTICATED" } }
        : path.endsWith("/tasks/stats")
          ? { total: 1, pending: 1, completed: 0, overdue: 0, dueToday: 0 }
          : {
              tasks: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  title: "LongTitle".repeat(20),
                  description: "LongDescription".repeat(100),
                  status: "PENDING",
                  dueDate: "2026-12-10",
                  createdAt: "2026-11-09T00:00:00.000Z",
                  updatedAt: "2026-11-09T00:00:00.000Z"
                }
              ],
              total: 1,
              page: 1,
              pages: 1,
              limit: 20
            };
    return route.fulfill({
      status: path.endsWith("/auth/refresh") && !signedIn ? 401 : 200,
      contentType: "application/json",
      body: JSON.stringify(json)
    });
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
}

for (const width of [320, 360, 375, 390, 414]) {
  test(`phone ${width}px: login, Google button, registration and short windows fit`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await mockApi(page, false);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Continue with Google" })
    ).toBeVisible({ timeout: 20000 });
    if (width === 320)
      await page.screenshot({
        path: `.validation/auth-320-${test.info().project.name}.png`,
        fullPage: true
      });
    await noOverflow(page);
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await expect(page.locator("#auth-name")).toBeVisible();
    await page.setViewportSize({ width, height: 340 });
    await page.locator("#auth-password").focus();
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .scrollIntoViewIfNeeded();
    await noOverflow(page);
  });
  test(`phone ${width}px: dashboard, long tasks, navigation and editor fit`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await mockApi(page, true);
    await page.goto("/");
    await expect(page.locator(".task-title-button")).toBeVisible();
    await expect(page.locator(".task-alert")).not.toBeVisible();
    await noOverflow(page);
    const header = (await page.locator(".workspace-header").boundingBox())!;
    const menu = (await page
      .getByRole("button", { name: "Open navigation" })
      .boundingBox())!;
    expect(menu.width).toBeGreaterThanOrEqual(44);
    expect(menu.height).toBeGreaterThanOrEqual(44);
    expect(menu.y).toBeGreaterThanOrEqual(header.y);
    expect(menu.y + menu.height).toBeLessThanOrEqual(header.y + header.height);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("button", { name: "Close navigation" })
    ).toBeFocused();
    await page
      .locator(".side-navigation button")
      .filter({ hasText: "Today" })
      .click();
    await expect(
      page.getByRole("button", { name: "Open navigation" })
    ).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const editor = page.locator(".task-editor");
    await expect(editor).toBeVisible();
    expect((await editor.boundingBox())!.width).toBeLessThanOrEqual(width);
    await page.setViewportSize({ width, height: 340 });
    await editor
      .getByRole("button", { name: "Cancel", exact: true })
      .scrollIntoViewIfNeeded();
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await noOverflow(page);
    if (width === 320)
      await page.screenshot({
        path: `.validation/tasks-320-${test.info().project.name}.png`,
        fullPage: true
      });
  });
}

test("phone header keeps a full toolbar below the status-bar safe area", async ({
  page
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const device = await page.context().newCDPSession(page);
  await device.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 32, bottom: 24, left: 0, right: 0 }
  });
  await mockApi(page, true);
  await page.goto("/");
  const toolbar = page.locator(".workspace-header");
  await expect(toolbar.getByText("All tasks", { exact: true })).toBeVisible();
  const header = (await toolbar.boundingBox())!;
  const menu = (await page
    .getByRole("button", { name: "Open navigation" })
    .boundingBox())!;
  const date = (await page.locator(".header-date").boundingBox())!;
  expect(header.y).toBe(0);
  expect(header.height).toBeGreaterThanOrEqual(96);
  expect(menu.y).toBeGreaterThanOrEqual(32);
  expect(date.y).toBeGreaterThanOrEqual(32);
  expect(menu.y + menu.height).toBeLessThanOrEqual(header.y + header.height);
  await noOverflow(page);
  await page.screenshot({
    path: `.validation/header-insets-${test.info().project.name}.png`
  });
});

test("wide desktop keeps the sidebar while phone orientation changes close the drawer", async ({
  page
}) => {
  await mockApi(page, true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open navigation" })
  ).not.toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `.validation/desktop-${test.info().project.name}.png`,
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.getByRole("button", { name: "Close navigation" })
  ).not.toBeVisible();
  await noOverflow(page);
});
