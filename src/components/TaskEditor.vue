<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type { Task, TaskInput } from "../types";
import { saveTask } from "../composables/useTasks";
import { errorMessage } from "../lib/api";

const props = defineProps<{ modelValue: boolean; task: Task | null }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; saved: [] }>();
const form = reactive<TaskInput>({
  title: "",
  description: "",
  dueDate: null,
  status: "PENDING"
});
const saving = ref(false);
const error = ref("");
watch(
  () => props.modelValue,
  open => {
    if (open) {
      Object.assign(
        form,
        props.task
          ? {
              title: props.task.title,
              description: props.task.description,
              dueDate: props.task.dueDate,
              status: props.task.status
            }
          : { title: "", description: "", dueDate: null, status: "PENDING" }
      );
      error.value = "";
    }
  }
);
async function submit() {
  saving.value = true;
  error.value = "";
  try {
    await saveTask(
      { ...form, title: form.title.trim(), dueDate: form.dueDate || null },
      props.task?.id
    );
    emit("update:modelValue", false);
    emit("saved");
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    :persistent="saving"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="task-editor">
      <div class="editor-heading"
        ><div
          ><span class="eyebrow">MAKE SPACE FOR WHAT MATTERS</span
          ><h2>{{ task ? "Edit task" : "A fresh task." }}</h2></div
        ><q-btn
          flat
          round
          icon="close"
          aria-label="Close task editor"
          :disable="saving"
          @click="emit('update:modelValue', false)"
      /></div>
      <q-form class="editor-form" @submit="submit">
        <label for="task-title">Task title</label>
        <q-input
          for="task-title"
          v-model="form.title"
          outlined
          autofocus
          placeholder="What would you like to get done?"
          maxlength="200"
          :rules="[value => Boolean(value?.trim()) || 'Add a task title']"
          :disable="saving"
        />
        <label for="task-description"
          >Description <span class="optional">optional</span></label
        >
        <q-input
          for="task-description"
          v-model="form.description"
          outlined
          type="textarea"
          placeholder="A little context, a few details…"
          maxlength="5000"
          :disable="saving"
        />
        <div class="editor-columns"
          ><div
            ><label for="task-date"
              >Due date <span class="optional">optional</span></label
            ><q-input
              for="task-date"
              v-model="form.dueDate"
              outlined
              type="date"
              clearable
              :disable="saving" /></div
          ><div
            ><label for="task-status">Status</label
            ><q-select
              for="task-status"
              v-model="form.status"
              outlined
              emit-value
              map-options
              :options="[
                { label: 'Pending', value: 'PENDING' },
                { label: 'Completed', value: 'COMPLETED' }
              ]"
              :disable="saving" /></div
        ></div>
        <p v-if="error" role="alert" class="form-error">{{ error }}</p>
        <div class="editor-actions"
          ><q-btn
            flat
            no-caps
            label="Cancel"
            :disable="saving"
            @click="emit('update:modelValue', false)" /><q-btn
            unelevated
            no-caps
            color="primary"
            type="submit"
            :label="task ? 'Save changes' : 'Create task'"
            :loading="saving"
        /></div>
      </q-form>
    </q-card>
  </q-dialog>
</template>
