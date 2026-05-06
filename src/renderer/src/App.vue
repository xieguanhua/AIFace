<template>
  <a-config-provider :locale="settings.antdLocale">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'

const settings = useSettingsStore()
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
</style>
