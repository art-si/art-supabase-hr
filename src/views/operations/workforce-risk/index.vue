<template>
  <ArtPermissionGuard permission="Hr:WorkforceRisk:View">
    <div class="workforce-risk-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="false" />
      <BusinessWorkspaceHeader
        eyebrow="WORKFORCE RISK"
        title="人力风险中心"
        description="把合同、资质、试用期和岗位缺编风险汇聚到同一队列，优先处理已超期和临近到期事项。"
        icon="ri:shield-user-line"
        :tags="[
          { label: '跨模块聚合', type: 'primary' },
          { label: '60 天前瞻', type: 'warning' },
          { label: '只读安全视图', type: 'success' }
        ]"
        :metrics="metrics"
        refreshable
        refresh-label="刷新风险数据"
        :refresh-loading="loading"
        @metric-click="handleMetricClick"
        @refresh="loadOverview"
      />

      <ArtSectionCard
        class="workforce-risk-page__workspace business-workspace-content"
        :loading="loading && !overview"
        :error="errorMessage"
        :empty="Boolean(overview) && !filteredItems.length"
        empty-title="当前筛选范围没有需要处置的人力风险"
        empty-description="可调整筛选范围，继续关注最新风险识别结果。"
        min-height="100%"
        @retry="loadOverview"
      >
        <template #header>
          <header class="workforce-risk-page__toolbar">
            <div>
              <ArtSectionTitle :show-line="false">风险处置队列</ArtSectionTitle>
              <p>按风险紧急程度排序，数据更新时间：{{ generatedAt }}</p>
            </div>
            <ElRadioGroup v-model="activeKind" size="small">
              <ElRadioButton
                v-for="option in riskFilterOptions"
                :key="option.value"
                :value="option.value"
                >{{ option.label }}</ElRadioButton
              >
            </ElRadioGroup>
          </header>
        </template>

        <ol class="workforce-risk-page__list">
          <li v-for="item in filteredItems" :key="item.id" class="workforce-risk-page__item">
            <span class="workforce-risk-page__risk-icon" :class="`is-${item.level}`">
              <ArtSvgIcon :icon="kindMeta[item.kind].icon" />
            </span>
            <div class="workforce-risk-page__item-main">
              <div class="workforce-risk-page__item-title">
                <strong>{{ item.title }}</strong>
                <ElTag :type="levelMeta[item.level].type" effect="light" size="small" round>
                  {{ levelMeta[item.level].label }}
                </ElTag>
                <ElTag type="info" effect="plain" size="small" round>
                  {{ kindMeta[item.kind].label }}
                </ElTag>
              </div>
              <p>{{ item.subject }}</p>
              <small>{{ item.description }}</small>
            </div>
            <div class="workforce-risk-page__item-action">
              <time v-if="item.dueDate">{{ item.dueDate }}</time>
              <ElButton type="primary" plain size="small" @click="openRisk(item)">
                打开处理页
                <ArtSvgIcon icon="ri:arrow-right-line" />
              </ElButton>
            </div>
          </li>
        </ol>
      </ArtSectionCard>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { useAsyncState } from '@vueuse/core'
  import { noop } from 'lodash-es'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useRouter } from 'vue-router'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import { fetchWorkforceRiskOverview } from '@hr/api'

  defineOptions({ name: 'HrWorkforceRisk' })

  type RiskKind = Api.Hr.WorkforceRiskKind
  type RiskLevel = Api.Hr.WorkforceRiskLevel

  const router = useRouter()
  const {
    state: overview,
    isLoading: loading,
    error: overviewError,
    executeImmediate: loadOverview
  } = useAsyncState<Api.Hr.WorkforceRiskOverview | null, []>(fetchWorkforceRiskOverview, null, {
    immediate: false,
    resetOnExecute: false,
    onError: noop
  })
  const errorMessage = computed(() =>
    overviewError.value === undefined
      ? ''
      : getFriendlySupabaseErrorMessage(overviewError.value, '人力风险数据加载失败')
  )
  const activeKind = ref<'all' | RiskKind>('all')
  const configuredRiskFilterOptions = useDictionaryOptions('hrWorkforceRiskFilter')
  const riskFilterOptions = computed(() =>
    configuredRiskFilterOptions.filter((option) =>
      ['all', 'contract', 'qualification', 'probation', 'headcount'].includes(option.value)
    )
  )

  const kindMeta: Record<RiskKind, { label: string; icon: string }> = {
    contract: { label: '劳动合同', icon: 'ri:file-shield-2-line' },
    qualification: { label: '资质证照', icon: 'ri:verified-badge-line' },
    probation: { label: '试用期', icon: 'ri:user-follow-line' },
    headcount: { label: '编制缺口', icon: 'ri:organization-chart' }
  }
  const levelMeta: Record<RiskLevel, { label: string; type: 'danger' | 'warning' | 'info' }> = {
    critical: { label: '紧急', type: 'danger' },
    warning: { label: '预警', type: 'warning' },
    attention: { label: '关注', type: 'info' }
  }

  const generatedAt = computed(() =>
    overview.value ? formatWithDayjs(overview.value.generatedAt) : '--'
  )
  const filteredItems = computed(() =>
    (overview.value?.items ?? []).filter(
      (item) => activeKind.value === 'all' || item.kind === activeKind.value
    )
  )
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      key: 'all',
      label: '风险事项',
      value: overview.value?.items.length ?? 0,
      description: `${overview.value?.criticalCount ?? 0} 项紧急`,
      icon: 'ri:alarm-warning-line',
      tone: overview.value?.criticalCount ? 'danger' : 'primary',
      interactive: true,
      selected: activeKind.value === 'all',
      loading: loading.value
    },
    {
      key: 'contract',
      label: '合同到期',
      value: overview.value?.expiringContractCount ?? 0,
      description: '未来 60 天及已超期',
      icon: kindMeta.contract.icon,
      tone: 'warning',
      interactive: true,
      selected: activeKind.value === 'contract',
      loading: loading.value
    },
    {
      key: 'qualification',
      label: '资质到期',
      value: overview.value?.expiringQualificationCount ?? 0,
      description: '未来 60 天及已失效',
      icon: kindMeta.qualification.icon,
      tone: 'warning',
      interactive: true,
      selected: activeKind.value === 'qualification',
      loading: loading.value
    },
    {
      key: 'headcount',
      label: '编制缺口',
      value: overview.value?.vacancyCount ?? 0,
      description: `${overview.value?.activeEmployeeCount ?? 0} 名在职员工`,
      icon: kindMeta.headcount.icon,
      tone: 'info',
      interactive: true,
      selected: activeKind.value === 'headcount',
      loading: loading.value
    }
  ])

  function handleMetricClick(metric: BusinessWorkspaceMetric): void {
    const kind = metric.key as 'all' | RiskKind
    if (kind === 'all' || kind in kindMeta) activeKind.value = kind
  }

  function openRisk(item: Api.Hr.WorkforceRiskItem): void {
    void router.push(item.routePath)
  }

  onMounted(() => void loadOverview())
</script>

<style scoped lang="scss">
  .workforce-risk-page {
    &__workspace {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;

      :deep(.art-section-card__header) {
        flex: 0 0 auto;
      }
    }

    &__toolbar {
      display: flex;
      gap: 16px;
      align-items: flex-end;
      justify-content: space-between;
      padding: var(--art-section-padding);

      p {
        margin: 5px 0 0;
        font-size: 12px;
        color: var(--art-gray-500);
      }
    }

    &__list {
      display: grid;
      gap: 10px;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    &__item {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 14px 16px;
      background: var(--default-box-color);
      border: 1px solid var(--art-border-color);
      border-radius: var(--art-surface-radius);
    }

    &__risk-icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      font-size: 19px;
      color: var(--el-color-info);
      background: var(--el-color-info-light-9);
      border-radius: var(--art-surface-radius);

      &.is-critical {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }

      &.is-warning {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }
    }

    &__item-main {
      min-width: 0;

      p,
      small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      p {
        margin: 6px 0 3px;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      small {
        color: var(--art-gray-500);
      }
    }

    &__item-title {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      align-items: center;
    }

    &__item-action {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;

      time {
        font-size: 12px;
        color: var(--art-gray-500);
      }
    }
  }

  @media only screen and (width <= 767px) {
    .workforce-risk-page {
      &__toolbar {
        align-items: stretch;
      }

      &__toolbar,
      &__item-action {
        flex-direction: column;
      }

      &__toolbar :deep(.el-radio-group) {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__item {
        grid-template-columns: auto minmax(0, 1fr);
      }

      &__item-action {
        grid-column: 1 / -1;
        align-items: stretch;
      }
    }
  }
</style>
