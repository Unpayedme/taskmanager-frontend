<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useQuasar } from "quasar";
import { authState, errorMessage, signOut } from "../lib/api";
import {
  taskState,
  loadTasks,
  syncTasks,
  toggleTask,
  removeTask,
  resetTasks
} from "../composables/useTasks";
import { dueLabel, localDate } from "../lib/dates";
import TaskEditor from "../components/TaskEditor.vue";
import type { Task, TaskQuery } from "../types";

const $q = useQuasar();
const view = ref("all");
const status = ref("all");
const search = ref("");
const debouncedSearch = ref("");
const sort = ref<TaskQuery["sort"]>("created");
const page = ref(1);
const editorOpen = ref(false);
const editingTask = ref<Task | null>(null);
const busyTask = ref("");
const loggingOut = ref(false);
const mobileNav = ref(false);
const today = ref(localDate());
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let dateTimer: ReturnType<typeof setInterval> | undefined;
const menu = [
  { value: "all", label: "All tasks", icon: "grid_view" },
  { value: "today", label: "Today", icon: "today" },
  { value: "upcoming", label: "Upcoming", icon: "event_note" },
  { value: "completed", label: "Completed", icon: "task_alt" }
];
const titles: Record<string, string> = {
  all: "A little focus. A lot of progress.",
  today: "Make today a good day.",
  upcoming: "Good things are on the horizon.",
  completed: "Look how far you’ve come."
};
const heading = computed(
  () => menu.find(item => item.value === view.value)?.label ?? "All tasks"
);
const initials = computed(() =>
  authState.user?.name
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0])
    .join("")
    .toUpperCase()
);
const greeting = computed(
  () => `Hello, ${authState.user?.name.split(" ")[0] || "there"}.`
);
const completion = computed(() =>
  taskState.stats?.total
    ? Math.round((taskState.stats.completed / taskState.stats.total) * 100)
    : 0
);
const query = computed<TaskQuery>(() => ({
  ...(debouncedSearch.value ? { search: debouncedSearch.value } : {}),
  today: today.value,
  sort: sort.value,
  page: page.value,
  limit: 20,
  ...(view.value === "completed"
    ? { status: "COMPLETED" as const }
    : status.value !== "all"
      ? { status: status.value as "PENDING" | "COMPLETED" }
      : {}),
  ...(view.value === "today" || view.value === "upcoming"
    ? { due: view.value as "today" | "upcoming" }
    : {})
}));
watch(
  query,
  value => {
    void loadTasks(value);
  },
  { immediate: true }
);
watch(search, value => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    debouncedSearch.value = value.trim();
  }, 300);
});
watch([view, status, sort], () => {
  page.value = 1;
});
function chooseView(value: string) {
  view.value = value;
  status.value = "all";
  mobileNav.value = false;
}
function create() {
  editingTask.value = null;
  editorOpen.value = true;
}
function edit(task: Task) {
  editingTask.value = task;
  editorOpen.value = true;
}
async function toggle(task: Task) {
  busyTask.value = task.id;
  try {
    await toggleTask(task);
  } catch (error) {
    $q.notify({ type: "negative", message: errorMessage(error) });
  } finally {
    busyTask.value = "";
  }
}
function confirmDelete(task: Task) {
  $q.dialog({
    title: "Delete this task?",
    message: `“${task.title}” will be permanently deleted.`,
    cancel: { flat: true, label: "Keep task", noCaps: true },
    ok: { color: "negative", label: "Delete task", noCaps: true },
    persistent: true
  }).onOk(() => {
    void (async () => {
      busyTask.value = task.id;
      try {
        await removeTask(task.id);
        if (page.value > 1 && taskState.tasks.length === 0) page.value--;
        $q.notify({ message: "Task deleted.", color: "primary" });
      } catch (error) {
        $q.notify({ type: "negative", message: errorMessage(error) });
      } finally {
        busyTask.value = "";
      }
    })();
  });
}
async function logout() {
  loggingOut.value = true;
  try {
    await signOut();
  } catch (error) {
    $q.notify({
      type: "negative",
      message: `${errorMessage(error)} Your session has not been logged out. Please retry.`
    });
  } finally {
    loggingOut.value = false;
  }
}
function syncIfVisible() {
  if (document.visibilityState === "visible") {
    today.value = localDate();
    void syncTasks();
  }
}
onMounted(() => {
  window.addEventListener("online", syncIfVisible);
  document.addEventListener("visibilitychange", syncIfVisible);
  dateTimer = setInterval(() => {
    today.value = localDate();
  }, 60000);
});
onUnmounted(() => {
  clearTimeout(searchTimer);
  clearInterval(dateTimer);
  window.removeEventListener("online", syncIfVisible);
  document.removeEventListener("visibilitychange", syncIfVisible);
  resetTasks();
});
</script>

<template>
  <div class="workspace">
    <div v-if="mobileNav" class="nav-scrim" @click="mobileNav = false" />
    <aside
      class="sidebar"
      :class="{ 'sidebar-open': mobileNav }"
      aria-label="Main navigation"
    >
      <a href="#/" class="brand"
        ><span class="brand-mark"><q-icon name="done_all" /></span
        >taskmanager<span class="brand-period">.</span></a
      >
      <span class="sidebar-label">YOUR WORKSPACE</span>
      <nav class="side-navigation"
        ><button
          v-for="item in menu"
          :key="item.value"
          :class="{ active: view === item.value }"
          :aria-current="view === item.value ? 'page' : undefined"
          @click="chooseView(item.value)"
          ><q-icon :name="item.icon" /><span>{{ item.label }}</span
          ><span
            v-if="
              taskState.stats &&
              (item.value === 'all' ||
                item.value === 'today' ||
                item.value === 'completed')
            "
            class="nav-count"
            >{{
              item.value === "all"
                ? taskState.stats.total
                : item.value === "today"
                  ? taskState.stats.dueToday
                  : taskState.stats.completed
            }}</span
          ></button
        ></nav
      >
      <div class="sidebar-note"
        ><span class="small-sun"><q-icon name="wb_sunny" /></span
        ><h3>Progress, at your pace.</h3
        ><p>Small steps count.<br />Keep showing up.</p
        ><div class="note-rule" /><span
          >Your own little corner of calm.</span
        ></div
      >
      <div class="sidebar-account"
        ><div class="avatar">{{ initials }}</div
        ><div class="account-text"
          ><strong>{{ authState.user?.name }}</strong
          ><span>{{ authState.user?.email }}</span></div
        ><q-btn
          flat
          round
          dense
          icon="logout"
          aria-label="Sign out"
          :loading="loggingOut"
          @click="logout"
          ><q-tooltip>Sign out</q-tooltip></q-btn
        ></div
      >
    </aside>

    <main class="workspace-main">
      <header class="workspace-header"
        ><div class="header-location"
          ><q-btn
            flat
            round
            dense
            icon="menu"
            class="mobile-menu"
            aria-label="Open navigation"
            @click="mobileNav = true"
          /><span>Workspace</span><q-icon name="chevron_right" /><strong>{{
            heading
          }}</strong></div
        ><div class="header-date"
          ><q-icon name="calendar_today" />{{
            new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric"
            }).format(new Date(`${today}T12:00:00`))
          }}</div
        ></header
      >
      <div class="workspace-content">
        <section class="workspace-intro"
          ><div
            ><span class="eyebrow">{{ greeting }}</span
            ><h1>{{ titles[view] }}</h1
            ><p
              >Everything you need to do, with a little room to breathe.</p
            ></div
          ><q-btn
            unelevated
            no-caps
            color="primary"
            icon="add"
            label="New task"
            class="new-task-button"
            @click="create"
        /></section>
        <section class="stats-strip" aria-label="Task overview"
          ><div
            ><span class="stat-icon"
              ><q-icon name="format_list_bulleted" /></span
            ><div
              ><span class="stat-label">Total tasks</span
              ><strong>{{ taskState.stats?.total ?? "—" }}</strong></div
            ></div
          ><div
            ><span class="stat-icon amber"><q-icon name="schedule" /></span
            ><div
              ><span class="stat-label">In progress</span
              ><strong>{{ taskState.stats?.pending ?? "—" }}</strong></div
            ></div
          ><div
            ><span class="stat-icon sage"><q-icon name="task_alt" /></span
            ><div
              ><span class="stat-label">Completed</span
              ><strong>{{ taskState.stats?.completed ?? "—" }}</strong></div
            ></div
          ><div class="progress-stat"
            ><div
              ><span class="stat-label">Your momentum</span
              ><strong>{{ completion }}<span>%</span></strong></div
            ><q-linear-progress
              :value="completion / 100"
              color="primary"
              track-color="grey-3"
              rounded
              size="5px" /></div
        ></section>

        <section class="task-section" aria-label="Your tasks">
          <div class="task-section-heading"
            ><div
              ><h2
                >{{ heading }}<span>{{ taskState.total }}</span></h2
              ><p>{{
                view === "completed"
                  ? "A well-earned collection of done."
                  : "One thing at a time. You’ve got this."
              }}</p></div
            ><q-btn
              flat
              round
              icon="sync"
              aria-label="Synchronize tasks"
              :loading="taskState.loading"
              @click="syncTasks"
              ><q-tooltip>Sync with server</q-tooltip></q-btn
            ></div
          >
          <div class="task-toolbar"
            ><div class="status-tabs" v-if="view !== 'completed'"
              ><button
                v-for="tab in [
                  { value: 'all', label: 'All' },
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'COMPLETED', label: 'Completed' }
                ]"
                :key="tab.value"
                :class="{ selected: status === tab.value }"
                :aria-pressed="status === tab.value"
                @click="status = tab.value"
                >{{ tab.label }}</button
              ></div
            ><span v-else class="completed-label"
              ><q-icon name="check_circle_outline" /> Good work,
              collected.</span
            ><div class="toolbar-controls"
              ><q-input
                v-model="search"
                outlined
                dense
                clearable
                placeholder="Search tasks…"
                aria-label="Search tasks"
                class="task-search"
                @clear="search = ''"
                ><template #prepend><q-icon name="search" /></template></q-input
              ><q-select
                v-model="sort"
                outlined
                dense
                emit-value
                map-options
                aria-label="Sort tasks"
                class="task-sort"
                :options="[
                  { label: 'Newest first', value: 'created' },
                  { label: 'Due date', value: 'due' },
                  { label: 'Title A–Z', value: 'title' }
                ]" /></div
          ></div>
          <div
            v-if="taskState.error"
            class="connection-alert task-alert"
            role="alert"
            ><q-icon name="cloud_off" /><span
              >{{ taskState.error }}
              {{ taskState.stale ? "Showing your cached tasks." : "" }}</span
            ><q-btn flat dense no-caps label="Try again" @click="syncTasks"
          /></div>
          <q-linear-progress
            v-if="taskState.loading"
            indeterminate
            color="primary"
            size="2px"
          />
          <div class="task-table-labels"
            ><span>Task</span><span>Due date</span><span>Status</span><span
          /></div>
          <TransitionGroup name="tasks" tag="div" class="task-list">
            <article
              v-for="task in taskState.tasks"
              :key="task.id"
              class="task-row"
              :class="{ 'task-complete': task.status === 'COMPLETED' }"
            >
              <div class="task-main-cell"
                ><q-checkbox
                  :model-value="task.status === 'COMPLETED'"
                  color="primary"
                  :disable="Boolean(busyTask)"
                  :aria-label="`Mark ${task.title} as ${task.status === 'PENDING' ? 'completed' : 'pending'}`"
                  @update:model-value="toggle(task)"
                /><button
                  class="task-title-button"
                  :disabled="Boolean(busyTask)"
                  @click="edit(task)"
                  ><strong>{{ task.title }}</strong
                  ><span v-if="task.description">{{
                    task.description
                  }}</span></button
                ></div
              >
              <span
                class="task-due"
                :class="{
                  overdue:
                    task.status === 'PENDING' &&
                    task.dueDate &&
                    task.dueDate < today,
                  'due-today': task.dueDate === today
                }"
                ><q-icon :name="task.dueDate ? 'event' : 'remove'" />{{
                  dueLabel(task.dueDate)
                }}</span
              >
              <span
                class="status-badge"
                :class="
                  task.status === 'COMPLETED'
                    ? 'badge-completed'
                    : 'badge-pending'
                "
                ><span />{{
                  task.status === "COMPLETED" ? "Completed" : "Pending"
                }}</span
              >
              <q-btn
                flat
                round
                dense
                icon="more_horiz"
                :aria-label="`Actions for ${task.title}`"
                :disable="Boolean(busyTask)"
                ><q-menu
                  ><q-list style="min-width: 150px"
                    ><q-item v-close-popup clickable @click="edit(task)"
                      ><q-item-section avatar
                        ><q-icon name="edit" /></q-item-section
                      ><q-item-section>Edit task</q-item-section></q-item
                    ><q-item
                      v-close-popup
                      clickable
                      class="text-negative"
                      @click="confirmDelete(task)"
                      ><q-item-section avatar
                        ><q-icon name="delete_outline" /></q-item-section
                      ><q-item-section>Delete task</q-item-section></q-item
                    ></q-list
                  ></q-menu
                ></q-btn
              >
            </article>
          </TransitionGroup>
          <div
            v-if="!taskState.tasks.length && !taskState.loading"
            class="empty-tasks"
            ><div class="empty-icon"
              ><q-icon
                :name="
                  search || status !== 'all'
                    ? 'search_off'
                    : view === 'completed'
                      ? 'task_alt'
                      : 'edit_note'
                " /></div
            ><h3>{{
              search || status !== "all"
                ? "A little too quiet here."
                : view === "completed"
                  ? "Your wins will live here."
                  : "Room for something new."
            }}</h3
            ><p>{{
              search || status !== "all"
                ? "Try another search or a different filter."
                : view === "completed"
                  ? "Complete a task to see your progress."
                  : "Add a task and take the first small step."
            }}</p
            ><q-btn
              v-if="!search && status === 'all' && view !== 'completed'"
              unelevated
              no-caps
              color="primary"
              label="Create a task"
              icon="add"
              @click="create"
          /></div>
          <div class="task-list-footer"
            ><span
              ><span
                class="sync-dot"
                :class="{ stale: taskState.stale || taskState.error }"
              />{{
                taskState.loading
                  ? "Syncing your tasks…"
                  : taskState.stale
                    ? "Cached view"
                    : taskState.lastSync
                      ? "All changes synced"
                      : "Ready when you are"
              }}</span
            ><q-pagination
              v-if="taskState.pages > 1"
              v-model="page"
              :max="taskState.pages"
              :max-pages="5"
              direction-links
              flat
              color="primary"
              :disable="taskState.loading"
              aria-label="Task pages"
            /><span v-else
              >{{ taskState.total }}
              {{ taskState.total === 1 ? "task" : "tasks" }}</span
            ></div
          >
        </section>
        <footer class="workspace-footer"
          ><span>A little less chaos. A little more clarity.</span
          ><span>Made for your everyday.</span></footer
        >
      </div>
    </main>
    <TaskEditor
      v-model="editorOpen"
      :task="editingTask"
      @saved="
        $q.notify({
          message: editingTask ? 'Task updated.' : 'A new task, a fresh start.',
          color: 'primary'
        })
      "
    />
  </div>
</template>
