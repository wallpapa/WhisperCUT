import { runMemoryUpdate } from './memory-updater.js'

async function main() {
  console.error('[memory-cron] Starting weekly memory update...')
  const result = await runMemoryUpdate()
  console.error(`[memory-cron] Done: ${result.confirmed} confirmed, ${result.decayed} decayed, ${result.pruned} pruned, ${result.total_active} active`)
}

main().catch(err => { console.error('[memory-cron] FATAL:', err); process.exit(1) })
