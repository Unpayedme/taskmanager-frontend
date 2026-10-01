import { z } from "zod";
import type { TaskPage, TaskQuery } from "../types";

const prefix = "taskmanager:tasks:v1:";
const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200),
  description: z.string().max(5000),
  status: z.enum(["PENDING", "COMPLETED"]),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
const snapshotSchema = z.object({
  query: z.string(),
  savedAt: z.number(),
  data: z.object({
    tasks: z.array(taskSchema).max(100),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pages: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(100)
  })
});
const cacheSchema = z.array(snapshotSchema).max(6);
const key = (userId: string) => `${prefix}${userId}`;
const queryKey = (query: TaskQuery) =>
  JSON.stringify(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  );

function read(userId: string) {
  try {
    return cacheSchema
      .parse(JSON.parse(localStorage.getItem(key(userId)) || "[]"))
      .filter(item => Date.now() - item.savedAt < 86400000);
  } catch {
    return [];
  }
}

export function readTaskCache(userId: string, query: TaskQuery) {
  return read(userId).find(item => item.query === queryKey(query));
}

export function writeTaskCache(
  userId: string,
  query: TaskQuery,
  data: TaskPage
) {
  const snapshot = snapshotSchema.parse({
    query: queryKey(query),
    savedAt: Date.now(),
    data
  });
  const snapshots = [
    snapshot,
    ...read(userId).filter(item => item.query !== snapshot.query)
  ].slice(0, 6);
  try {
    localStorage.setItem(key(userId), JSON.stringify(snapshots));
  } catch {
    /* Caching is optional. */
  }
}

export function clearTaskCaches() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    );
    for (const cacheKey of keys)
      if (cacheKey?.startsWith(prefix)) localStorage.removeItem(cacheKey);
  } catch {
    /* Private browsing can disable localStorage. */
  }
}

export function invalidateTaskCache(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* Optional cache. */
  }
}
