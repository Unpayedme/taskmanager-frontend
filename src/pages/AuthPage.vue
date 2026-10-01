<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  apiBase,
  authState,
  bootstrapSession,
  errorMessage,
  signIn
} from "../lib/api";

const mode = ref<"login" | "register">("login");
const form = reactive({ name: "", email: "", password: "" });
const busy = ref(false);
const showPassword = ref(false);
const error = ref("");
const oauthResult = new URLSearchParams(window.location.search).get("auth");
const oauthError = computed(() =>
  oauthResult === "account_exists"
    ? "This email already has an account. Please sign in with your password."
    : oauthResult === "google_failed"
      ? "Google sign-in could not be completed. Please try again."
      : ""
);
if (oauthResult)
  window.history.replaceState(
    {},
    "",
    window.location.pathname + window.location.hash
  );

async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await signIn(
      mode.value,
      mode.value === "register"
        ? { ...form }
        : { email: form.email, password: form.password }
    );
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
function switchMode() {
  mode.value = mode.value === "login" ? "register" : "login";
  error.value = "";
}
</script>

<template>
  <main class="auth-page min-h-screen w-full overflow-x-hidden">
    <section class="auth-story">
      <a href="#/" class="brand"
        ><span class="brand-mark"><q-icon name="done_all" /></span
        >taskmanager<span class="brand-period">.</span></a
      >
      <div class="story-copy"
        ><span class="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span
        ><h1>Less on your mind.<br />More in your day.</h1
        ><p
          >A calm place for everything you need to do.<br />Make a plan. Take a
          breath. Move forward.</p
        >
        <div class="story-note"
          ><div class="note-top"
            ><span>One thing at a time</span><q-icon name="north_east" /></div
          ><div class="note-line"
            ><span class="note-check"><q-icon name="check" /></span> Make room
            for a new idea</div
          ><div class="note-line"
            ><span class="note-check"><q-icon name="check" /></span> Finish what
            matters</div
          ><div class="note-line"
            ><span class="note-circle" /> Enjoy the progress</div
          ><div class="note-footer"
            ><span class="note-dot" /> A little progress, every day.</div
          ></div
        >
      </div>
      <div class="story-footer"
        >Your day, a little more intentional.<span
          >Made for everyday life</span
        ></div
      >
    </section>
    <section class="auth-form-panel">
      <div class="auth-form-wrap"
        ><span class="eyebrow">YOUR PERSONAL WORKSPACE</span
        ><h2>{{
          mode === "login" ? "Welcome back." : "Start with a clean slate."
        }}</h2
        ><p class="auth-subtitle">{{
          mode === "login"
            ? "Sign in and pick up where you left off."
            : "A little organization makes a big difference."
        }}</p>
        <div v-if="authState.error" role="alert" class="connection-alert"
          >{{ authState.error
          }}<q-btn
            flat
            dense
            no-caps
            label="Retry connection"
            @click="bootstrapSession"
        /></div>
        <p v-if="oauthError" role="alert" class="form-error">{{
          oauthError
        }}</p>
        <q-form class="auth-form" @submit="submit">
          <template v-if="mode === 'register'"
            ><label for="auth-name">Your name</label
            ><q-input
              for="auth-name"
              v-model="form.name"
              outlined
              placeholder="Alex Morgan"
              autocomplete="name"
              maxlength="80"
              :rules="[value => Boolean(value?.trim()) || 'Enter your name']"
              :disable="busy"
          /></template>
          <label for="auth-email">Email address</label
          ><q-input
            for="auth-email"
            v-model="form.email"
            outlined
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            maxlength="254"
            :rules="[value => Boolean(value) || 'Enter your email']"
            :disable="busy"
          />
          <label for="auth-password">Password</label
          ><q-input
            for="auth-password"
            v-model="form.password"
            outlined
            :type="showPassword ? 'text' : 'password'"
            :placeholder="
              mode === 'register'
                ? 'At least 10 characters'
                : 'Enter your password'
            "
            :autocomplete="
              mode === 'register' ? 'new-password' : 'current-password'
            "
            maxlength="128"
            :rules="[
              value =>
                value?.length >= (mode === 'register' ? 10 : 1) ||
                (mode === 'register'
                  ? 'Use at least 10 characters'
                  : 'Enter your password')
            ]"
            :disable="busy"
            ><template #append
              ><q-btn
                flat
                round
                dense
                :icon="showPassword ? 'visibility_off' : 'visibility'"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                @click="showPassword = !showPassword" /></template
          ></q-input>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <q-btn
            unelevated
            no-caps
            color="primary"
            class="auth-submit"
            type="submit"
            :label="mode === 'login' ? 'Sign in' : 'Create account'"
            :loading="busy"
            icon-right="arrow_forward"
          />
        </q-form>
        <template v-if="authState.googleEnabled"
          ><div class="auth-divider"><span>or keep it simple</span></div
          ><q-btn
            outline
            no-caps
            class="google-button"
            :href="`${apiBase}/auth/google`"
            :disable="busy"
            ><svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 1-3.4 1a6 6 0 0 1-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9.2l3.4-2.7Z"
              />
              <path
                fill="#EA4335"
                d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.5 9.5 0 0 0 12 2a10 10 0 0 0-9 5.4l3.4 2.7A6 6 0 0 1 12 6Z"
              /></svg
            ><span>Continue with Google</span></q-btn
          ></template
        >
        <p class="auth-switch"
          >{{
            mode === "login" ? "New around here?" : "Already have an account?"
          }}
          <button type="button" :disabled="busy" @click="switchMode">{{
            mode === "login" ? "Create an account" : "Sign in"
          }}</button></p
        >
        <div class="auth-security"
          ><q-icon name="lock_outline" /> A private space, just for your
          tasks.</div
        >
      </div>
    </section>
  </main>
</template>
