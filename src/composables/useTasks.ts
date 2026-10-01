import { reactive } from "vue";
import axios from "axios";
import { api, authState, errorMessage } from "../lib/api";
import {
  readTaskCache,
  writeTaskCache,
  invalidateTaskCache
} from "../lib/cache";
import { localDate } from "../lib/dates";
import type { Task, TaskInput, TaskQuery, TaskPage, TaskStats } from "../types";

export const taskState = reactive({
  tasks: [] as Task[],
  total: 0,
  pages: 0,
  loading: false,
  stale: false,
  lastSync: null as number | null,
  error: "",
  stats: null as TaskStats | null
});
let requestNumber = 0;
let controller: AbortController | null = null;
let lastQuery: TaskQuery | null = null;

export function resetTasks() {
  requestNumber++;
  controller?.abort();
  lastQuery = null;
  Object.assign(taskState, {
    tasks: [],
    total: 0,
    pages: 0,
    loading: false,
    stale: false,
    lastSync: null,
    error: "",
    stats: null
  });
}

export async function loadTasks(query: TaskQuery) {
  const userId = authState.user?.id;
  if (!userId) return;
  lastQuery = { ...query };
  const request = ++requestNumber;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const cached = readTaskCache(userId, query);
  Object.assign(taskState, {
    tasks: cached?.data.tasks ?? [],
    total: cached?.data.total ?? 0,
    pages: cached?.data.pages ?? 0,
    lastSync: cached?.savedAt ?? null,
    stale: Boolean(cached),
    loading: true,
    error: ""
  });
  try {
    const [page, stats] = await Promise.all([
      api.get<TaskPage>("/tasks", { params: query, signal }),
      api.get<TaskStats>("/tasks/stats", {
        params: { today: query.today },
        signal
      })
    ]);
    if (request !== requestNumber || authState.user?.id !== userId) return;
    Object.assign(taskState, {
      tasks: page.data.tasks,
      total: page.data.total,
      pages: page.data.pages,
      stats: stats.data,
      lastSync: Date.now(),
      stale: false
    });
    writeTaskCache(userId, query, page.data);
  } catch (error) {
    if (
      axios.isCancel(error) ||
      request !== requestNumber ||
      authState.user?.id !== userId
    )
      return;
    taskState.error = errorMessage(error);
  } finally {
    if (request === requestNumber) taskState.loading = false;
  }
}

export async function syncTasks() {
  if (lastQuery) await loadTasks({ ...lastQuery, today: localDate() });
}

export async function saveTask(input: TaskInput, id?: string) {
  const userId = authState.user?.id;
  if (!userId) throw new Error("Please sign in.");
  if (id) await api.patch(`/tasks/${id}`, input);
  else await api.post("/tasks", input);
  if (authState.user?.id !== userId) return;
  invalidateTaskCache(userId);
  await syncTasks();
}
export async function toggleTask(task: Task) {
  const userId = authState.user?.id;
  await api.patch(`/tasks/${task.id}`, {
    status: task.status === "PENDING" ? "COMPLETED" : "PENDING"
  });
  if (userId && authState.user?.id === userId) {
    invalidateTaskCache(userId);
    await syncTasks();
  }
}
export async function removeTask(id: string) {
  const userId = authState.user?.id;
  await api.delete(`/tasks/${id}`);
  if (userId && authState.user?.id === userId) {
    invalidateTaskCache(userId);
    await syncTasks();
  }
}
