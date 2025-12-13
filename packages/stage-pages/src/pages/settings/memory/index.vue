<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { Button, FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'

const memoryStore = useMemoryStore()
const memories = ref<any[]>([])
const loading = ref(false)

async function refreshList() {
  loading.value = true
  try {
    if (!memoryStore.db)
      await memoryStore.init()
    if (memoryStore.db) {
      const res: any = await memoryStore.db.execute('SELECT * FROM memories ORDER BY created_at DESC LIMIT 50')

      if (Array.isArray(res)) {
        memories.value = res
      }
      else if (res && typeof res.toArray === 'function') {
        memories.value = res.toArray().map((row: any) => ({ ...row }))
      }
      else {
        memories.value = []
      }
    }
  }
  catch (err) {
    console.error(err)
  }
  finally {
    loading.value = false
  }
}

async function clearAll() {
  // eslint-disable-next-line no-alert
  if (!window.confirm('Are you sure you want to clear all memories? This cannot be undone.'))
    return

  loading.value = true
  try {
    if (!memoryStore.db)
      await memoryStore.init()
    if (memoryStore.db) {
      await memoryStore.clearMemory()
      await refreshList()
    }
  }
  catch (err) {
    console.error(err)
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshList()
})
</script>

<template>
  <div rounded-xl p-4 flex="~ col gap-4">
    <!-- Header Card -->
    <div
      flex="~ col sm:row"
      items-start justify-between gap-4 rounded-xl p-6 sm:items-center
      bg="white dark:neutral-900"
      border="~ neutral-200 dark:neutral-800"
    >
      <div>
        <h1 text="xl neutral-900 dark:white" flex items-center gap-2 font-bold>
          <div i-solar:brain-bold-duotone text-primary-500 />
          Memory System
        </h1>
        <p text="sm neutral-500" mt-1>
          Manage long-term memory persistence and retrieval.
        </p>
      </div>

      <!-- Status Badge -->
      <div
        flex items-center gap-2 border rounded-full px-3 py-1.5 text-xs font-medium transition-colors
        :class="memoryStore.isReady
          ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20'
          : 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20'"
      >
        <div :class="memoryStore.isReady ? 'i-solar:check-circle-bold' : 'i-solar:close-circle-bold'" />
        {{ memoryStore.isReady ? 'System Online' : 'System Offline' }}
      </div>
    </div>

    <!-- Controls Grid -->
    <div grid="~ cols-1 md:cols-2 gap-4">
      <!-- Active Status Logic -->
      <div
        flex="~ col justify-center" rounded-xl p-6
        bg="white dark:neutral-900"
        border="~ neutral-200 dark:neutral-800"
      >
        <FieldCheckbox
          v-model="memoryStore.isEnabled"
          label="Active Status"
          description="Enable to allow AI to recall past conversations. Requires downloading embedding model."
        />
        <div my-4 h-1px w-full bg="neutral-100 dark:neutral-800" />
        <FieldRange
          v-model="memoryStore.minSimilarityScore"
          :min="0"
          :max="1"
          :step="0.05"
          label="Recall Threshold"
          description="Minimum similarity score for memory retrieval (0.0 = loose, 1.0 = strict)."
        />
      </div>

      <!-- Model Info -->
      <div
        flex="~ col justify-between" rounded-xl p-6
        bg="white dark:neutral-900"
        border="~ neutral-200 dark:neutral-800"
      >
        <span text="neutral-900 dark:neutral-100" mb-4 font-medium>Embedding Model</span>
        <div flex items-center gap-2>
          <div i-solar:database-bold text-neutral-400 />
          <span text="sm neutral-600 dark:neutral-400" font-mono>nomic-embed-text-v1.5</span>
          <span text="xs neutral-500" bg="neutral-100 dark:neutral-800" rounded px-1.5 py-0.5>768d</span>
        </div>
      </div>
    </div>

    <!-- Memory Inspector -->
    <div flex="~ col gap-4" mt-4>
      <div flex items-center justify-between px-1>
        <h2 text="lg neutral-900 dark:neutral-100" flex items-center gap-2 font-semibold>
          <div i-solar:magnifer-bold-duotone text-neutral-400 />
          Stored Memories
        </h2>
        <div flex gap-2>
          <Button size="sm" variant="secondary-muted" icon="i-solar:refresh-linear" :loading="loading" @click="refreshList" />
          <Button size="sm" variant="secondary-muted" class="text-red-500 hover:text-red-600 dark:hover:text-red-400" icon="i-solar:trash-bin-trash-bold" :loading="loading" @click="clearAll" />
        </div>
      </div>

      <div
        overflow-hidden rounded-xl
        bg="white dark:neutral-900"
        border="~ neutral-200 dark:neutral-800"
        shadow-sm
      >
        <!-- Empty State -->
        <div v-if="memories.length === 0" flex="~ col" items-center gap-3 py-12 text-neutral-400>
          <div i-solar:clipboard-list-linear text-4xl opacity-50 />
          <span text-sm>No memories stored yet.</span>
        </div>

        <!-- Data Table -->
        <table v-else w-full text-left text-sm>
          <thead bg="neutral-50 dark:neutral-800/50" border-b="~ neutral-200 dark:neutral-800">
            <tr>
              <th w-40 p-4 text-neutral-500 font-medium>
                Time
              </th>
              <th p-4 text-neutral-500 font-medium>
                Content
              </th>
              <th w-24 p-4 text-right text-neutral-500 font-medium>
                Dim
              </th>
            </tr>
          </thead>
          <tbody divide-y="~ neutral-100 dark:neutral-800">
            <tr
              v-for="row in memories" :key="row.id"
              class="group transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <td text="xs neutral-400" whitespace-nowrap p-4 font-mono>
                {{ new Date(row.created_at).toLocaleTimeString() }}
              </td>
              <td p-4 text="neutral-700 dark:neutral-300">
                {{ row.content }}
              </td>
              <td text="xs neutral-400" p-4 text-right font-mono>
                [768]
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Background Decoration -->
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed bottom-0 right--5 top="[calc(100dvh-15rem)]" z--1
    size-60 flex items-center justify-center
    :initial="{ scale: 0.9, opacity: 0, y: 15 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
  >
    <div text="60" i-solar:leaf-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
