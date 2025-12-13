import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'

import { pipeline } from '@huggingface/transformers'
import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const useMemoryStore = defineStore('memory', () => {
  const db = ref<DuckDBWasmDrizzleDatabase | undefined>()
  const isReady = ref(false)

  const memoriesBackup = useLocalStorage<any[]>('memory/backup/v1', [], {
    deep: true,
    listenToStorageChanges: true,
  })

  const isEnabled = useLocalStorage('memory/enabled', false)
  const minSimilarityScore = useLocalStorage('memory/min-similarity-score', 0.2)
  const embeddingModel = ref('nomic-ai/nomic-embed-text-v1.5')
  const MODEL_CONFIG: Record<string, { dims: number }> = {
    'nomic-ai/nomic-embed-text-v1.5': { dims: 768 },
  }
  const currentDims = computed(() => MODEL_CONFIG[embeddingModel.value]?.dims || 384)

  const extractor = ref<any>(null)
  const isEmbeddingModelLoading = ref(false)

  async function init() {
    try {
      if (!db.value) {
        db.value = drizzle({
          connection: {
            bundles: getImportUrlBundles(),
            path: 'opfs://airi_memory.db',
          },
        })
      }

      const dims = currentDims.value

      try {
        const tableInfo: any = await db.value.execute('PRAGMA table_info(\'memories\')')
        const rows = Array.isArray(tableInfo) ? tableInfo : (tableInfo.toArray ? tableInfo.toArray() : [])
        const embeddingCol = rows.find((c: any) => c.name === 'embedding')

        if (embeddingCol && embeddingCol.type !== `FLOAT[${dims}]`) {
          await db.value.execute('DROP TABLE memories')
        }
      }
      catch {}

      await db.value.execute(`
        CREATE TABLE IF NOT EXISTS memories (
          id UUID DEFAULT uuid(),
          content TEXT,
          embedding FLOAT[${dims}],
          created_at TIMESTAMP DEFAULT current_timestamp
        );
      `)

      let shouldRestore = false
      try {
        const countRes: any = await db.value.execute('SELECT count(*) as c FROM memories')
        const count = Number(Array.isArray(countRes) ? countRes[0].c : countRes.toArray()[0].c)
        if (count === 0 && memoriesBackup.value.length > 0)
          shouldRestore = true
      }
      catch (e) {
        console.warn('Failed to check table count', e)
      }

      if (shouldRestore) {
        try {
          const backupLen = memoriesBackup.value.length
          if (backupLen > 0) {
            const targetDims = currentDims.value
            const validMemories = memoriesBackup.value.filter(m => m.embedding.length === targetDims)

            if (validMemories.length < backupLen)
              memoriesBackup.value = validMemories

            if (validMemories.length > 0) {
              for (const mem of validMemories) {
                const safeContent = mem.content.replace(/'/g, '\'\'')
                const vectorStr = `[${mem.embedding.join(',')}]`
                await db.value.execute(`
                    INSERT INTO memories (content, embedding, created_at)
                    VALUES ('${safeContent}', ${vectorStr}::FLOAT[${targetDims}], '${mem.created_at || new Date().toISOString()}');
                  `)
              }
            }
          }
        }
        catch (err) {
          console.error(err)
        }
      }

      isReady.value = true

      if (isEnabled.value)
        await initEmbedding()
    }
    catch (error) {
      console.error(error)
    }
  }

  async function clearMemory() {
    if (!db.value)
      return
    await db.value.execute('DELETE FROM memories')
    memoriesBackup.value = []
  }

  async function initEmbedding() {
    if (extractor.value)
      return

    try {
      isEmbeddingModelLoading.value = true
      extractor.value = await pipeline('feature-extraction', embeddingModel.value, {
        dtype: 'q8',
      })
      isEmbeddingModelLoading.value = false
    }
    catch (error) {
      console.error(error)
      isEnabled.value = false
      extractor.value = null
    }
    finally {
      isEmbeddingModelLoading.value = false
    }
  }

  async function generateEmbedding(text: string): Promise<number[]> {
    if (!extractor.value)
      await initEmbedding()

    if (!extractor.value)
      throw new Error('Embedding model not initialized')

    const output = await extractor.value(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data)
  }

  async function addMemory(content: string, embedding: number[]) {
    if (!db.value)
      await init()

    if (!db.value)
      throw new Error('Database not initialized')

    try {
      const safeContent = content.replace(/'/g, '\'\'')
      const vectorStr = `[${embedding.join(',')}]`

      await db.value.execute(`
        INSERT INTO memories (content, embedding)
        VALUES ('${safeContent}', ${vectorStr}::FLOAT[${currentDims.value}]);
      `)

      memoriesBackup.value.push({
        content,
        embedding,
        created_at: new Date().toISOString(),
      })
    }
    catch (error) {
      console.error(error)
      throw error
    }
  }

  async function searchMemory(embedding: number[], limit = 5) {
    if (!db.value)
      await init()
    if (!db.value)
      return []

    try {
      const vectorStr = `[${embedding.join(',')}]`
      const result: any = await db.value.execute(`
            SELECT content, array_cosine_similarity(embedding, ${vectorStr}::FLOAT[${currentDims.value}]) as score
            FROM memories
            ORDER BY score DESC
            LIMIT ${limit};
        `)

      if (Array.isArray(result))
        return result
      else if (result && typeof result.toArray === 'function')
        return result.toArray().map((row: any) => ({ ...row }))

      return []
    }
    catch (error) {
      console.error(error)
      return []
    }
  }

  watch(isEnabled, (enabled) => {
    if (enabled)
      initEmbedding()
  })

  return {
    db,
    isReady,
    isEnabled,
    minSimilarityScore,
    embeddingModel,
    isEmbeddingModelLoading,
    init,
    generateEmbedding,
    addMemory,
    searchMemory,
    clearMemory,
  }
})
