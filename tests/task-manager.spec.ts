import { test, expect, type Page } from "@playwright/test";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(
    pageErrors.get(page),
    "The page must not throw uncaught exceptions"
  ).toEqual([]);
});

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
  const registration = page.waitForResponse(response =>
    response.url().endsWith("/api/auth/register")
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "New task", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("All changes synced", { exact: true })
  ).toBeVisible();
  return (await (await registration).json()) as {
    accessToken: string;
    user: { email: string };
  };
}

test("due dates committed by the date picker persist, display and can be cleared", async ({
  page
}) => {
  await createAccount(page, "Due Date Tester");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.locator("#task-title").fill("Check the due date");

  // Some native date pickers commit a selection with a change event.
  async function commitDate(value: string) {
    await page.locator("#task-date").evaluate((element, date) => {
      (element as HTMLInputElement).value = date;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }
  const row = page
    .locator(".task-row")
    .filter({ hasText: "Check the due date" });
  await commitDate("2027-01-15");
  const created = page.waitForResponse(
    response =>
      response.url().endsWith("/api/tasks") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  expect((await (await created).json()).task.dueDate).toBe("2027-01-15");
  await expect(row.locator(".task-due")).toContainText("2027");
  await expect(row.locator(".task-due")).not.toContainText("No due date");

  await page.reload();
  await expect(row.locator(".task-due")).toContainText("2027");
  await page
    .getByRole("button", { name: "Check the due date", exact: true })
    .click();
  await expect(page.locator("#task-date")).toHaveValue("2027-01-15");
  await commitDate("2027-02-20");
  const updated = page.waitForResponse(
    response =>
      response.url().includes("/api/tasks/") &&
      response.request().method() === "PATCH"
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await (await updated).json()).task.dueDate).toBe("2027-02-20");
  await expect(row.locator(".task-due")).toContainText("20");

  await page
    .getByRole("button", { name: "Check the due date", exact: true })
    .click();
  await expect(page.locator("#task-date")).toHaveValue("2027-02-20");
  await commitDate("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(row.locator(".task-due")).toContainText("No due date");
  await page.reload();
  await expect(row.locator(".task-due")).toContainText("No due date");
});

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
  await expect(
    page.getByText("All changes synced", { exact: true })
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
  await page.setViewportSize({ width: 1280, height: 800 });
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
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    otherTab.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible();
  await otherTab.close();
});

async function seedTasks(
  page: Page,
  accessToken: string,
  tasks: Array<{ title: string; description?: string; dueDate?: string }>
) {
  for (const task of tasks) {
    const response = await page.request.post("/api/tasks", {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: task
    });
    expect(response.status()).toBe(201);
  }
  await page.getByRole("button", { name: "Synchronize tasks" }).click();
  await expect(
    page.getByText("All changes synced", { exact: true })
  ).toBeVisible();
}

test("sorting and pagination recover when completing the last task on a filtered page", async ({
  page
}) => {
  const account = await createAccount(page, "Pagination Tester");
  await seedTasks(
    page,
    account.accessToken,
    Array.from({ length: 21 }, (_, index) => ({
      title: `Task ${String(index + 1).padStart(2, "0")}`,
      dueDate: `2027-01-${String(index + 1).padStart(2, "0")}`
    }))
  );
  await page.locator(".task-sort").click();
  await page.getByRole("option", { name: "Title A–Z", exact: true }).click();
  await expect(page.locator(".task-row").first()).toContainText("Task 01");
  await expect(page.locator(".task-row")).toHaveCount(20);
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.locator(".task-row")).toHaveCount(1);
  await expect(page.locator(".task-row")).toContainText("Task 21");
  await page
    .getByRole("checkbox", { name: "Mark Task 21 as completed" })
    .click();
  await expect(page.locator(".task-row")).toHaveCount(20);
  await expect(page.locator(".task-row").first()).toContainText("Task 01");
  await page.locator(".task-sort").click();
  await page.getByRole("option", { name: "Due date", exact: true }).click();
  await expect(page.locator(".task-row").first()).toContainText("Task 01");
});

test("a statistics outage does not hide successfully loaded tasks", async ({
  page
}) => {
  const account = await createAccount(page, "Statistics Tester");
  await seedTasks(page, account.accessToken, [
    { title: "Keep my task visible" }
  ]);
  await page.route("**/api/tasks/stats**", route =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAVAILABLE", message: "Statistics unavailable" }
      })
    })
  );
  await page.getByRole("textbox", { name: "Search tasks" }).fill("visible");
  await expect(page.locator(".task-alert")).toContainText(/statistics/i);
  await expect(
    page.locator(".task-row:not(.tasks-leave-active)")
  ).toContainText("Keep my task visible");
  await expect(page.locator(".stats-strip")).toContainText("—");
  await expect(
    page.getByText("All changes synced", { exact: true })
  ).toHaveCount(0);
});

test("cached tasks survive a real connection loss and failed edits do not change saved data", async ({
  page,
  context
}) => {
  const account = await createAccount(page, "Offline Tester");
  await seedTasks(page, account.accessToken, [{ title: "Saved online" }]);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Synchronize tasks" }).click();
  await expect(page.locator(".task-alert")).toContainText(
    "Showing your cached tasks"
  );
  await expect(page.locator(".task-row")).toContainText("Saved online");
  await page.getByRole("button", { name: "Saved online", exact: true }).click();
  await page.locator("#task-title").fill("Unsaved offline edit");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Could not reach the server"
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator(".task-row")).toContainText("Saved online");
  await expect(page.locator(".task-row")).not.toContainText(
    "Unsaved offline edit"
  );
});

test("task content is rendered as text and untrusted cached dates are ignored", async ({
  page
}) => {
  const account = await createAccount(page, "Cache Tester");
  const title = '<img src=x onerror="window.taskXss=true">';
  await seedTasks(page, account.accessToken, [{ title }]);
  await expect(page.locator(".task-row")).toContainText(title);
  await expect(page.locator(".task-row img")).toHaveCount(0);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(item =>
      item.startsWith("taskmanager:tasks:")
    )!;
    const data = JSON.parse(localStorage.getItem(key)!);
    data[0].data.tasks[0].dueDate = "2026-99-99";
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.route("**/api/tasks**", route => route.abort("failed"));
  await page.getByRole("button", { name: "Synchronize tasks" }).click();
  await expect(page.locator(".task-alert")).toBeVisible();
  await expect(page.locator(".task-row .task-due")).not.toContainText(
    "Invalid"
  );
  await expect(
    page.getByRole("button", { name: "New task", exact: true })
  ).toBeVisible();
});

test("a late refresh rejection cannot cancel a newer sign-in", async ({
  page
}) => {
  const account = await createAccount(page, "Account Race Tester");
  let releaseRefresh!: () => void;
  let refreshStarted!: () => void;
  const pending = new Promise<void>(resolve => {
    releaseRefresh = resolve;
  });
  const started = new Promise<void>(resolve => {
    refreshStarted = resolve;
  });
  await page.route("**/api/auth/refresh", async route => {
    refreshStarted();
    await pending;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAUTHENTICATED", message: "Old session ended" }
      })
    });
  });
  await page.route("**/api/tasks**", route =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "TOKEN_EXPIRED", message: "Expired" }
      })
    })
  );
  await page.getByRole("button", { name: "Synchronize tasks" }).click();
  await started;
  await page.evaluate(() => {
    const channel = new BroadcastChannel("taskmanager-session");
    channel.postMessage({ type: "logout" });
    channel.close();
  });
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible();
  await page.locator("#auth-email").fill(account.user.email);
  await page.locator("#auth-password").fill("A secure browser test password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#auth-email")).toBeDisabled();
  await page.unroute("**/api/tasks**");
  releaseRefresh();
  await expect(
    page.getByRole("button", { name: "New task", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("All changes synced", { exact: true })
  ).toBeVisible();
});
