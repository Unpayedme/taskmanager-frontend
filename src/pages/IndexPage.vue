<script setup lang="ts">
import { onMounted } from "vue";
import { authState, bootstrapSession } from "../lib/api";
import AuthPage from "./AuthPage.vue";
import TaskPage from "./TaskPage.vue";
onMounted(() => {
  void bootstrapSession();
});
</script>
<template>
  <div
    v-if="!authState.ready"
    class="session-loading min-h-screen w-full"
    role="status"
    ><span class="brand-mark"><q-icon name="done_all" /></span
    ><q-spinner color="primary" size="24px" /><span
      >Making space for your day…</span
    ></div
  >
  <TaskPage v-else-if="authState.user" :key="authState.user.id" />
  <AuthPage v-else />
</template>
