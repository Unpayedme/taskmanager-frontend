import { test, expect, type Page } from "@playwright/test";

async function createAccount(page: Page, label: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.locator("#auth-name").fill(label);
  await page
    .locator("#auth-email")
    .fill(
      `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
    );
  await page.locator("#auth-password").fill("A secure browser test password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "New task", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("All changes synced", { exact: true })
  ).toBeVisible();
}

test("task CRUD, search, cached reload and logout work together", async ({
  page
}, testInfo) => {
  await createAccount(page, "Browser Tester");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.locator("#task-title").fill("Plan the next small step");
  await page
    .locator("#task-description")
    .fill("Write a clear project outline.");
  await page.locator("#task-date").fill("2026-10-02");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Plan the next small step/ })
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith("taskmanager:tasks:")
    )
  );
  expect(stored.length).toBe(1);
  expect(stored[0]![1]).not.toMatch(/accessToken|refreshToken|password|userId/);

  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Plan the next small step/ })
  ).toBeVisible();
  await page.route("**/api/tasks**", route => route.abort("failed"));
  await page.getByRole("button", { name: "Synchronize tasks" }).click();
  await expect(page.getByText(/Showing your cached tasks/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Plan the next small step/ })
  ).toBeVisible();
  await page.unroute("**/api/tasks**");
  await page.getByRole("button", { name: "Synchronize tasks" }).click();
  await expect(
    page.getByText("All changes synced", { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: /^Plan the next small step/ }).click();
  await page.locator("#task-title").fill("Finish the outline");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Finish the outline/ })
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Mark Finish the outline as completed" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Mark Finish the outline as pending" })
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Completed", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: /^Finish the outline/ })
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search tasks" })
    .fill("does-not-match");
  await expect(page.getByText("A little too quiet here.")).toBeVisible();
  await page.getByRole("textbox", { name: "Search tasks" }).fill("outline");
  await expect(
    page.getByRole("button", { name: /^Finish the outline/ })
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("dashboard-desktop.png"),
    fullPage: true,
    animations: "disabled"
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("dashboard-mobile.png"),
    fullPage: true,
    animations: "disabled"
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  await page
    .getByRole("button", { name: "Actions for Finish the outline" })
    .click();
  await page.getByText("Delete task", { exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete task", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Finish the outline/ })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter(key =>
          key.startsWith("taskmanager:tasks:")
        ).length
    )
  ).toBe(0);
});

test("simultaneous expired requests share one refresh and logout reaches other tabs", async ({
  page,
  context
}) => {
  await createAccount(page, "Session Tester");
  const expiredPaths = new Set<string>();
  let refreshes = 0;
  await page.route("**/api/auth/refresh", async route => {
    refreshes++;
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.route("**/api/tasks**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (!expiredPaths.has(path)) {
      expiredPaths.add(path);
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TOKEN_EXPIRED", message: "Expired" }
        })
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Synchronize tasks" }).click();
  await expect.poll(() => expiredPaths.size).toBe(2);
  await expect(
    page.getByText("All changes synced", { exact: true })
  ).toBeVisible();
  expect(refreshes).toBe(1);
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  await expect(
    otherTab.getByRole("button", { name: "New task", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    otherTab.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible();
  await otherTab.close();
});
