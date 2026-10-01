export type TaskStatus = "PENDING" | "COMPLETED";
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TaskInput {
  title: string;
  description: string;
  dueDate: string | null;
  status: TaskStatus;
}
export interface TaskQuery {
  search?: string;
  status?: TaskStatus;
  due?: "today" | "upcoming" | "overdue" | "none";
  today: string;
  sort: "created" | "due" | "title";
  page: number;
  limit: number;
}
export interface TaskPage {
  tasks: Task[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
export interface TaskStats {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  dueToday: number;
}
