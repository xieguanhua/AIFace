<template>
  <a-card :title="t('train.title')">
    <a-typography-paragraph>{{ t('train.placeholder') }}</a-typography-paragraph>
    <a-space style="margin-bottom: 12px">
      <a-tag :color="statusColor">{{ t('train.status') }}: {{ t(`train.statusMap.${train.trainStatus}`) }}</a-tag>
      <a-tag>{{ t('train.currentStep') }}: {{ train.currentStep }}</a-tag>
      <a-tag>{{ t('train.lastLoss') }}: {{ train.lastLoss == null ? '—' : train.lastLoss.toFixed(4) }}</a-tag>
      <a-tag>{{ t('train.trainingFaces') }}: {{ train.trainingFaceCount }}</a-tag>
      <a-tag>{{ t('train.maxSteps') }}: {{ train.maxTrainSteps }}</a-tag>
    </a-space>
    <a-alert
      v-if="train.trainingFaceCount === 0"
      style="margin-bottom: 12px"
      type="warning"
      show-icon
      :message="t('train.noTrainingFaces')"
      :description="t('train.noTrainingFacesHint')"
    />
    <a-button v-if="train.trainingFaceCount === 0" size="small" style="margin-bottom: 12px" @click="goFaces">
      {{ t('train.goFaces') }}
    </a-button>
    <a-space wrap style="margin-bottom: 12px">
      <a-input v-model:value="cudaFraction" style="width: 120px" :placeholder="t('train.cudaFraction')" />
      <a-input-number
        :value="train.autoLoopIntervalMs"
        :min="100"
        :max="5000"
        :step="50"
        style="width: 160px"
        :addon-before="t('train.loopInterval')"
        @update:value="onAutoLoopIntervalChange"
      />
      <a-input-number
        :value="train.maxTrainSteps"
        :min="1"
        :max="100000"
        :step="10"
        style="width: 160px"
        :addon-before="t('train.maxSteps')"
        @update:value="onMaxStepsChange"
      />
      <a-button type="primary" :disabled="train.trainRunning || train.trainingFaceCount === 0" @click="onStartTrain">
        {{ t('train.startWorker') }}
      </a-button>
      <a-button :disabled="!train.trainRunning" @click="onPauseTrain">{{ t('train.pauseWorker') }}</a-button>
      <a-button :disabled="train.trainStatus !== 'paused'" @click="onResumeTrain">{{ t('train.resumeWorker') }}</a-button>
      <a-button :disabled="!train.trainRunning" @click="onStopTrain">{{ t('train.stopWorker') }}</a-button>
      <a-button :disabled="!train.trainRunning" @click="onStep">{{ t('train.step') }}</a-button>
      <a-button :disabled="!train.trainRunning || train.autoLoopRunning" @click="onStartLoop">
        {{ t('train.startLoop') }}
      </a-button>
      <a-button :disabled="!train.autoLoopRunning" @click="onStopLoop">{{ t('train.stopLoop') }}</a-button>
      <a-button @click="train.seedMock">{{ t('train.seedMock') }}</a-button>
    </a-space>
    <v-chart class="chart" :option="option" autoresize />
    <a-divider>{{ t('train.recentRuns') }}</a-divider>
    <a-list size="small" :data-source="train.recentRuns">
      <template #renderItem="{ item }">
        <a-list-item>
          <a-space>
            <a-typography-text code>{{ item.id }}</a-typography-text>
            <a-tag>{{ t(`train.statusMap.${item.status}`) }}</a-tag>
            <span>{{ t('train.currentStep') }}: {{ item.step }}</span>
            <span>{{ t('train.lastLoss') }}: {{ item.lastLoss == null ? '—' : item.lastLoss.toFixed(4) }}</span>
            <a-button size="small" @click="onOpenRunDetail(item.id)">{{ t('train.viewDetail') }}</a-button>
          </a-space>
        </a-list-item>
      </template>
    </a-list>
    <a-drawer :open="runDrawerOpen" :title="t('train.runDetailTitle')" width="480" @close="onCloseRunDetail">
      <a-descriptions v-if="train.selectedRunDetail" bordered :column="1" size="small">
        <a-descriptions-item :label="t('train.runId')">
          <a-typography-text code>{{ train.selectedRunDetail.id }}</a-typography-text>
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.status')">
          {{ t(`train.statusMap.${train.selectedRunDetail.status}`) }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.currentStep')">
          {{ train.selectedRunDetail.step }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.maxSteps')">
          {{ train.selectedRunDetail.targetSteps ?? '—' }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.lastLoss')">
          {{ train.selectedRunDetail.lastLoss == null ? '—' : train.selectedRunDetail.lastLoss.toFixed(4) }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.cudaFraction')">
          {{ train.selectedRunDetail.cudaFraction }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.runCreatedAt')">
          {{ formatTs(train.selectedRunDetail.createdAt) }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.runUpdatedAt')">
          {{ formatTs(train.selectedRunDetail.updatedAt) }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('train.runNote')">
          {{ train.selectedRunDetail.note || '—' }}
        </a-descriptions-item>
      </a-descriptions>
      <a-space style="margin-top: 12px">
        <a-button size="small" @click="copyRunId">{{ t('train.copyRunId') }}</a-button>
        <a-button size="small" @click="copyRunDetail">{{ t('train.copyRunDetail') }}</a-button>
      </a-space>
    </a-drawer>
  </a-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { useTrainStore } from '@renderer/stores/train'
import { useSettingsStore } from '@renderer/stores/settings'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const { t } = useI18n()
const router = useRouter()
const train = useTrainStore()
const settings = useSettingsStore()
const cudaFraction = ref(settings.trainCudaFraction || '0.35')
const runDrawerOpen = ref(false)

async function onStartTrain(): Promise<void> {
  settings.setTrainCudaFraction(cudaFraction.value)
  await train.startTrain(cudaFraction.value || '0.35')
}

async function onPauseTrain(): Promise<void> {
  await train.pauseTrain()
}

async function onResumeTrain(): Promise<void> {
  await train.resumeTrain()
}

async function onStopTrain(): Promise<void> {
  await train.stopTrain()
}

async function onStep(): Promise<void> {
  await train.sendTrainStep()
}

function onAutoLoopIntervalChange(v: number | null): void {
  if (typeof v === 'number') train.setAutoLoopInterval(v)
}

function onMaxStepsChange(v: number | null): void {
  if (typeof v === 'number') train.setMaxTrainSteps(v)
}

function onStartLoop(): void {
  train.startAutoLoop()
}

function onStopLoop(): void {
  train.stopAutoLoop()
}

function goFaces(): void {
  void router.push('/assets/faces')
}

async function onOpenRunDetail(id: string): Promise<void> {
  await train.loadRunDetail(id)
  runDrawerOpen.value = true
}

function onCloseRunDetail(): void {
  runDrawerOpen.value = false
  train.clearRunDetail()
}

function formatTs(ts: number): string {
  if (!Number.isFinite(ts)) return '—'
  return new Date(ts).toLocaleString()
}

async function copyRunId(): Promise<void> {
  const id = train.selectedRunDetail?.id
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    message.success(t('train.copySuccess'))
  } catch {
    message.error(t('train.copyFailed'))
  }
}

async function copyRunDetail(): Promise<void> {
  const detail = train.selectedRunDetail
  if (!detail) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(detail, null, 2))
    message.success(t('train.copySuccess'))
  } catch {
    message.error(t('train.copyFailed'))
  }
}

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: [t('train.loss')] },
  grid: { left: 48, right: 24, top: 40, bottom: 32 },
  xAxis: { type: 'category', data: train.lossPoints.map((p: { step: number }) => String(p.step)) },
  yAxis: { type: 'value' },
  series: [
    {
      name: t('train.loss'),
      type: 'line',
      smooth: true,
      data: train.lossPoints.map((p: { value: number }) => p.value)
    }
  ]
}))

const statusColor = computed(() => {
  if (train.trainStatus === 'running') return 'green'
  if (train.trainStatus === 'paused') return 'orange'
  if (train.trainStatus === 'failed') return 'red'
  if (train.trainStatus === 'starting' || train.trainStatus === 'stopping') return 'blue'
  return 'default'
})

onMounted(() => {
  void train.refreshTrainingFaceCount()
})
</script>

<style scoped>
.chart {
  height: 360px;
  width: 100%;
}
</style>
