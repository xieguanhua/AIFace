import Dexie, { type Table } from 'dexie'

export type TaskStatus = 'queued' | 'running' | 'paused' | 'failed' | 'done'

export interface TaskRow {
  id: string
  config: Record<string, unknown>
  status: TaskStatus
  lossSummary?: string
  createdAt: number
  updatedAt: number
}

export interface FaceMetadataRow {
  id?: number
  path: string
  qualityScore?: number
  yaw?: number
  pitch?: number
  inTraining?: boolean
}

export interface PresetRow {
  id?: number
  name: string
  params: Record<string, unknown>
}

export type TrainRunStatus = 'starting' | 'running' | 'paused' | 'stopping' | 'stopped' | 'failed' | 'done'

export interface TrainRunRow {
  id: string
  status: TrainRunStatus
  step: number
  lastLoss?: number
  cudaFraction: string
  note?: string
  createdAt: number
  updatedAt: number
}

export class AifaceDB extends Dexie {
  table_tasks!: Table<TaskRow, string>
  table_face_metadata!: Table<FaceMetadataRow, number>
  table_presets!: Table<PresetRow, number>
  table_train_runs!: Table<TrainRunRow, string>

  constructor() {
    super('aiface_db')
    this.version(1).stores({
      table_tasks: 'id, status, createdAt',
      table_face_metadata: '++id, path, qualityScore',
      table_presets: '++id, name'
    })
    this.version(2).stores({
      table_tasks: 'id, status, createdAt',
      table_face_metadata: '++id, path, qualityScore',
      table_presets: '++id, name',
      table_train_runs: 'id, status, updatedAt'
    })
  }
}

export const db = new AifaceDB()

export async function seedDefaultPreset(): Promise<void> {
  const n = await db.table_presets.count()
  if (n > 0) return
  await db.table_presets.add({
    name: '1080p 标准',
    params: {
      resolution: '1920x1080',
      codeFormer: 0.5,
      trtPrecision: 'fp16'
    }
  })
}
