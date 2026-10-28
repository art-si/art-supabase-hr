<template>
  <ArtPermissionGuard permission="Hr:Performance:View">
    <div class="performance-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="PERFORMANCE MANAGEMENT"
        title="绩效管理"
        description="统一管理目标对齐、持续沟通、员工自评、主管评价与组织校准，让绩效结果来自可追溯的业务过程。"
        icon="ri:line-chart-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="performance-page__control-deck" aria-labelledby="performance-rail-title">
        <header class="performance-page__control-heading">
          <div>
            <span class="performance-page__section-icon"
              ><ArtSvgIcon icon="ri:git-commit-line"
            /></span>
            <span>
              <strong id="performance-rail-title">绩效闭环轨道</strong>
              <small>目标权重达标后开启评价，最终结果经组织校准或授权确认后定案</small>
            </span>
          </div>
          <span class="performance-page__governance-badge">
            <ArtSvgIcon icon="ri:shield-check-line" />过程留痕 · 结果受控
          </span>
        </header>

        <ElAlert
          v-if="overviewError || referenceError"
          type="error"
          show-icon
          :closable="false"
          title="绩效数据加载失败"
        >
          <template #default>
            <span>{{ [overviewError, referenceError].filter(Boolean).join('；') }}</span>
            <ElButton type="primary" link @click="retryPageData">重新加载</ElButton>
          </template>
        </ElAlert>
        <ElSkeleton v-if="overviewLoading" :rows="3" animated />
        <div v-else-if="overview.featuredCycle" class="performance-page__featured-cycle">
          <div class="performance-page__cycle-identity">
            <span>当前主周期</span>
            <strong>{{ overview.featuredCycle.cycleName }}</strong>
            <small>
              {{ overview.featuredCycle.cycleCode || '--' }} ·
              {{ formatDate(overview.featuredCycle.startDate) }} →
              {{ formatDate(overview.featuredCycle.endDate) }}
            </small>
          </div>
          <ol class="performance-page__rail" aria-label="绩效周期进度">
            <li
              v-for="(stage, index) in performanceStages"
              :key="stage.label"
              :class="stageState(index)"
            >
              <span class="performance-page__rail-marker">0{{ index + 1 }}</span>
              <div
                ><strong>{{ stage.label }}</strong
                ><small>{{ stage.description }}</small></div
              >
              <b>{{ stage.value }}</b>
            </li>
          </ol>
        </div>
        <ArtEmptyState
          v-else-if="!overviewError"
          class="performance-page__empty-cycle"
          title="先建立考核周期与员工考核范围"
          description="配置员工目标且权重合计达到 100% 后，周期才能启动并开放员工自评。"
          size="compact"
          :visual-size="64"
        >
          <ElButton
            v-if="hasAuth('Hr:Performance:Add')"
            type="primary"
            @click="openDialog('cycle')"
          >
            新建绩效周期
          </ElButton>
        </ArtEmptyState>

        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="绩效管理分类"
          compact
          @change="handleTabChange"
        />

        <footer class="performance-page__control-note">
          <ArtSvgIcon icon="ri:information-line" />
          主管评分按目标权重自动汇总，最终分数不允许直接录入；校准调整必须说明比较依据，并同时保留主管原始结果。
        </footer>
      </section>

      <ArtTableQuery
        :key="activeEntity"
        ref="tableQueryRef"
        v-model="tableState.searchQuery"
        :search-items="searchItems"
        :api-fn="fetchTableData"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 72, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        focusable
      />

      <PerformanceDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { toNameCodeOption } from '@/utils/form/option'

  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import { ElButton, ElProgress, ElSkeleton, ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import {
    DeleteReferenceBlockedError,
    getDeleteReferenceContext
  } from '@/utils/supabase/delete-reference'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import type { ColumnOption, DialogType } from '@/types'
  import type { ApiRequestOptions } from '@/types/api/request'
  import {
    deletePerformanceRecord,
    getPerformanceDeleteTable,
    fetchPerformanceOptions,
    fetchPerformanceOverview,
    fetchPerformanceRecords,
    transitionPerformanceCalibration,
    transitionPerformanceCycle,
    transitionPerformanceReview
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import PerformanceDialog from './modules/performance-dialog.vue'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'HrPerformance' })
  type Entity = Api.Hr.PerformanceEntity
  type RecordItem = Api.Hr.PerformanceRecord
  type TableParams = Api.Hr.PerformanceSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>
  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyDescription: string
    statusDict?: string
  }
  interface DialogExpose {
    handleOpen: (payload: {
      entity: Entity
      type: DialogType
      editData?: RecordItem
      preset?: Record<string, unknown>
    }) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'cycle',
      label: '考核周期',
      description: '节奏、范围与里程碑',
      emptyDescription: '先建立考核周期，明确评价节奏、负责人和各阶段截止日期。',
      statusDict: 'hrPerformanceCycleStatus',
      icon: 'ri:calendar-check-line'
    },
    {
      value: 'review',
      label: '员工考核',
      description: '自评、主管评价与结果',
      emptyDescription: '将员工纳入绩效周期，并明确对应的评价主管。',
      statusDict: 'hrPerformanceReviewStatus',
      icon: 'ri:user-star-line'
    },
    {
      value: 'goal',
      label: '绩效目标',
      description: '权重、进度与评分证据',
      emptyDescription: '为员工考核配置可衡量目标，启动周期前权重合计必须为 100%。',
      statusDict: 'hrPerformanceGoalStatus',
      icon: 'ri:focus-2-line'
    },
    {
      value: 'check_in',
      label: '持续沟通',
      description: '进展、风险与下一行动',
      emptyDescription: '按周期节奏记录阶段成果、阻碍、反馈和下一步行动。',
      statusDict: 'hrPerformanceCheckInRisk',
      icon: 'ri:chat-check-line'
    },
    {
      value: 'calibration',
      label: '校准会议',
      description: '统一尺度与组织定案',
      emptyDescription: '创建校准会议，统一载入待校准结果并完成组织定案。',
      statusDict: 'hrPerformanceCalibrationStatus',
      icon: 'ri:scales-3-line'
    },
    {
      value: 'calibration_item',
      label: '校准明细',
      description: '原始结果与调整依据',
      emptyDescription: '会议开始后，系统将自动载入当前范围内待校准的员工结果。',
      icon: 'ri:equalizer-2-line'
    }
  ]

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const { hasAuth } = useAuth()
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('cycle')
  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD', invalidText: '--' })
  const deleteContext = ref<{ entity: Entity; table: string; label: string }>()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    () => deleteContext.value?.table ?? '',
    () => deleteContext.value?.label ?? '绩效记录'
  )
  const activeTab = computed<Tab>(
    () => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const cycleOptions = shallowRef<Api.Hr.PerformanceReference[]>([])
  const calibrationOptions = shallowRef<Api.Hr.PerformanceReference[]>([])
  const overviewLoading = ref(false)
  const overviewError = ref('')
  const referenceError = ref('')
  const tableState = reactive<{ searchQuery: Api.Hr.PerformanceSearchParams }>({
    searchQuery: { status: '', keyword: '', cycleId: '', sessionId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_performance_cycle: 'cycle',
      hr_performance_review: 'review',
      hr_performance_goal: 'goal',
      hr_performance_check_in: 'check_in',
      hr_performance_calibration_session: 'calibration'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => Object.assign(tableState.searchQuery, { cycleId: '', sessionId: '' })
  )
  const overview = reactive<Api.Hr.PerformanceOverview>({
    activeCycleCount: 0,
    inScopeEmployeeCount: 0,
    completionRate: 0,
    atRiskCheckInCount: 0,
    pendingCalibrationCount: 0,
    featuredCycle: null
  })

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '目标对齐', type: 'primary', effect: 'plain' },
    { label: '持续反馈', type: 'success', effect: 'light' },
    { label: '校准定案', type: 'warning', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '执行中周期',
      value: overview.activeCycleCount,
      description: `${overview.inScopeEmployeeCount} 名员工在考核范围`,
      icon: 'ri:calendar-event-line',
      tone: 'primary'
    },
    {
      label: '结果完成率',
      value: `${overview.completionRate}%`,
      description: '已完成 / 当前范围员工',
      icon: 'ri:verified-badge-line',
      tone: overview.completionRate >= 80 ? 'success' : 'info'
    },
    {
      label: '沟通风险',
      value: overview.atRiskCheckInCount,
      description: '最近一次沟通需关注或已偏离',
      icon: 'ri:alarm-warning-line',
      tone: overview.atRiskCheckInCount ? 'warning' : 'success'
    },
    {
      label: '待校准结果',
      value: overview.pendingCalibrationCount,
      description: '主管评价完成，等待组织定案',
      icon: 'ri:scales-3-line',
      tone: overview.pendingCalibrationCount ? 'warning' : 'info'
    }
  ])
  const performanceStages = computed(() => {
    const cycle = overview.featuredCycle
    return [
      {
        label: '目标与自评',
        description: '目标对齐并提交员工总结',
        value: cycle?.goalSettingCount ?? 0
      },
      {
        label: '主管评价',
        description: '按目标权重形成主管结果',
        value: cycle?.managerReviewCount ?? 0
      },
      {
        label: '组织校准',
        description: '统一评分尺度并记录依据',
        value: cycle?.calibrationCount ?? 0
      },
      {
        label: '结果完成',
        description: '最终评分定案并可供后续应用',
        value: cycle?.completedCount ?? 0
      }
    ]
  })
  const stageState = (index: number): string => {
    const cycle = overview.featuredCycle
    if (!cycle) return ''
    const current =
      cycle.status === 'completed'
        ? 4
        : cycle.status === 'reviewing'
          ? cycle.calibrationCount > 0
            ? 2
            : 1
          : 0
    return index < current ? 'is-complete' : index === current ? 'is-current' : ''
  }

  const keywordPlaceholder = computed(
    () =>
      ({
        cycle: '周期名称、编码或负责人',
        review: '员工、工号、组织或主管',
        goal: '员工、目标或周期',
        check_in: '员工、行动或阻碍',
        calibration: '会议、周期、组织或主持人',
        calibration_item: '员工、会议或调整依据'
      })[activeEntity.value]
  )

  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (activeEntity.value !== 'cycle')
      items.push({
        label: '绩效周期',
        key: 'cycleId',
        type: 'select',
        options: cycleOptions.value.map(toNameCodeOption),
        props: { clearable: true, filterable: true, placeholder: '全部周期' }
      })
    if (activeEntity.value === 'calibration_item')
      items.push({
        label: '校准会议',
        key: 'sessionId',
        type: 'select',
        options: calibrationOptions.value.map(toNameCodeOption),
        props: { clearable: true, filterable: true, placeholder: '全部会议' }
      })
    if (activeTab.value.statusDict)
      items.push({
        label: activeEntity.value === 'check_in' ? '风险' : '状态',
        key: 'status',
        type: 'select',
        options: getDictMap.value[activeTab.value.statusDict] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      })
    items.push({
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: keywordPlaceholder.value }
    })
    return items
  })

  const statusTone = (
    value?: string | null
  ): 'success' | 'warning' | 'danger' | 'info' | 'primary' =>
    ['completed', 'approved', 'on_track'].includes(value ?? '')
      ? 'success'
      : ['active', 'self_review', 'manager_review', 'in_progress'].includes(value ?? '')
        ? 'primary'
        : ['at_risk', 'attention', 'confirmed', 'reviewing', 'setup'].includes(value ?? '')
          ? 'warning'
          : ['off_track', 'cancelled', 'deactivated'].includes(value ?? '')
            ? 'danger'
            : 'info'
  const statusTag = (dictionary: string, value?: string | null) => (
    <ElTag type={statusTone(value)} effect="light" round>
      {userStore.getDictLabelByValue(dictionary, value, value ?? '--')}
    </ElTag>
  )

  const score = (value?: number | null, level?: string | null) => (
    <div class="performance-page__score">
      <strong>{value == null ? '--' : Number(value).toFixed(1)}</strong>
      <small>{level ? `${String(level).toUpperCase()} 级` : '尚未评分'}</small>
    </div>
  )
  const progress = (value?: number | null, caption?: string) => (
    <div class="performance-page__progress">
      <span>
        <strong>{value ?? 0}%</strong>
        <small>{caption}</small>
      </span>
      <ElProgress
        percentage={Math.min(Number(value ?? 0), 100)}
        stroke-width={6}
        show-text={false}
      />
    </div>
  )

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'cycle') return cycleColumns()
    if (activeEntity.value === 'review') return reviewColumns()
    if (activeEntity.value === 'goal') return goalColumns()
    if (activeEntity.value === 'check_in') return checkInColumns()
    if (activeEntity.value === 'calibration') return calibrationColumns()
    return calibrationItemColumns()
  }
  const cycleColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'cycleName',
      label: '考核周期',
      minWidth: 230,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCycle
        return <BusinessTableIdentityCell primary={item.cycleName} secondary={item.cycleCode} />
      }
    },
    {
      prop: 'period',
      label: '周期 / 里程碑',
      minWidth: 225,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCycle
        return (
          <BusinessTableIdentityCell
            primary={`${formatDate(item.startDate)} → ${formatDate(item.endDate)}`}
            secondary={`自评 ${formatDate(item.selfReviewDueDate)} · 校准 ${formatDate(item.calibrationDueDate)}`}
          />
        )
      }
    },
    {
      prop: 'owner',
      label: '负责人 / 沟通节奏',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCycle
        return (
          <BusinessTableIdentityCell
            primary={item.owner?.name ?? '未指定负责人'}
            secondary={
              Number.isFinite(item.checkInFrequencyDays) && item.checkInFrequencyDays > 0
                ? `每 ${item.checkInFrequencyDays} 天沟通`
                : '未设置沟通节奏'
            }
          />
        )
      }
    },
    {
      prop: 'coverage',
      label: '范围 / 完成',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCycle
        const rate = Math.round(
          ((item.completedCount ?? 0) / Math.max(item.reviewCount ?? 0, 1)) * 100
        )
        return progress(rate, `${item.completedCount ?? 0} / ${item.reviewCount ?? 0} 人`)
      }
    },
    {
      prop: 'pendingCalibrationCount',
      label: '待校准',
      width: 100,
      formatter: (row) => (row as Api.Hr.PerformanceCycle).pendingCalibrationCount ?? 0
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) =>
        statusTag('hrPerformanceCycleStatus', (row as Api.Hr.PerformanceCycle).status)
    },
    actionColumn()
  ]
  const reviewColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '被考核员工',
      minWidth: 210,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceReview
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={`${item.employee?.code ?? '--'} · ${item.organization?.name ?? '未归属组织'}`}
          />
        )
      }
    },
    {
      prop: 'cycle',
      label: '周期 / 主管',
      minWidth: 210,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceReview
        return (
          <BusinessTableIdentityCell
            primary={item.cycle?.name}
            secondary={`评价主管：${item.reviewer?.name ?? '未指定'}`}
          />
        )
      }
    },
    {
      prop: 'goals',
      label: '目标配置',
      minWidth: 170,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceReview
        return progress(item.goalWeight, `${item.goalCount ?? 0} 项目标`)
      }
    },
    {
      prop: 'checkIn',
      label: '最近沟通',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceReview
        return item.lastCheckInDate ? (
          <BusinessTableIdentityCell
            primary={item.lastCheckInDate}
            secondary={userStore.getDictLabelByValue(
              'hrPerformanceCheckInRisk',
              item.latestRiskStatus,
              item.latestRiskStatus ?? '--'
            )}
          />
        ) : (
          '暂无沟通记录'
        )
      }
    },
    {
      prop: 'score',
      label: '最终结果',
      width: 110,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceReview
        return score(
          item.calibratedScore ?? item.totalScore,
          item.calibratedLevel ?? item.performanceLevel
        )
      }
    },
    {
      prop: 'status',
      label: '阶段',
      width: 105,
      formatter: (row) =>
        statusTag('hrPerformanceReviewStatus', (row as Api.Hr.PerformanceReview).status)
    },
    actionColumn()
  ]
  const goalColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'goalName',
      label: '绩效目标',
      minWidth: 240,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceGoal
        return (
          <BusinessTableIdentityCell
            primary={item.goalName}
            secondary={`${userStore.getDictLabelByValue('hrPerformanceGoalType', item.goalType, item.goalType ?? '--')} · ${item.employee?.name ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'cycle',
      label: '周期',
      minWidth: 170,
      formatter: (row) => (row as Api.Hr.PerformanceGoal).cycle?.name ?? '--'
    },
    {
      prop: 'weight',
      label: '权重',
      width: 90,
      formatter: (row) => `${(row as Api.Hr.PerformanceGoal).weight}%`
    },
    {
      prop: 'progressPercent',
      label: '目标进度',
      minWidth: 170,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceGoal
        return progress(
          item.progressPercent,
          item.dueDate ? `截止 ${item.dueDate}` : '未设截止日期'
        )
      }
    },
    {
      prop: 'scores',
      label: '自评 / 主管',
      width: 125,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceGoal
        return `${item.employeeScore ?? '--'} / ${item.managerScore ?? '--'}`
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) =>
        statusTag('hrPerformanceGoalStatus', (row as Api.Hr.PerformanceGoal).status)
    },
    actionColumn()
  ]
  const checkInColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '沟通对象',
      minWidth: 200,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCheckIn
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={`${item.employee?.code ?? '--'} · ${item.cycle?.name ?? '--'}`}
          />
        )
      }
    },
    { prop: 'checkInDate', label: '沟通日期', width: 120 },
    {
      prop: 'progressPercent',
      label: '整体进度',
      minWidth: 165,
      formatter: (row) => progress((row as Api.Hr.PerformanceCheckIn).progressPercent)
    },
    {
      prop: 'riskStatus',
      label: '风险',
      width: 105,
      formatter: (row) =>
        statusTag('hrPerformanceCheckInRisk', (row as Api.Hr.PerformanceCheckIn).riskStatus)
    },
    { prop: 'nextAction', label: '下一步行动', minWidth: 240, showOverflowTooltip: true },
    {
      prop: 'facilitator',
      label: '沟通负责人',
      minWidth: 145,
      formatter: (row) => (row as Api.Hr.PerformanceCheckIn).facilitator?.name ?? '--'
    },
    actionColumn()
  ]
  const calibrationColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'sessionName',
      label: '校准会议',
      minWidth: 230,
      fixed: 'left',
      link: {
        permission: 'Hr:Performance:View',
        onClick: (row) => openCalibrationItems(row as Api.Hr.PerformanceCalibrationSession)
      },
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationSession
        return <BusinessTableIdentityCell primary={item.sessionName} secondary={item.sessionNo} />
      }
    },
    {
      prop: 'scope',
      label: '周期 / 范围',
      minWidth: 205,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationSession
        return (
          <BusinessTableIdentityCell
            primary={item.cycle?.name}
            secondary={item.organization?.name ?? '整个周期'}
          />
        )
      }
    },
    {
      prop: 'scheduledAt',
      label: '时间 / 主持人',
      minWidth: 185,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationSession
        return (
          <BusinessTableIdentityCell
            primary={formatTableDateTime(item.scheduledAt)}
            secondary={item.facilitator?.name ?? '未指定主持人'}
          />
        )
      }
    },
    {
      prop: 'items',
      label: '校准范围',
      width: 145,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationSession
        return `${item.itemCount ?? 0} 人 · ${item.adjustedCount ?? 0} 人调整`
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) =>
        statusTag(
          'hrPerformanceCalibrationStatus',
          (row as Api.Hr.PerformanceCalibrationSession).status
        )
    },
    actionColumn()
  ]
  const calibrationItemColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '校准员工',
      minWidth: 210,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationItem
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={`${item.employee?.code ?? '--'} · ${item.cycle?.name ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'session',
      label: '校准会议',
      minWidth: 200,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationItem
        return (
          <BusinessTableIdentityCell primary={item.session?.name} secondary={item.session?.code} />
        )
      }
    },
    {
      prop: 'original',
      label: '主管原始结果',
      width: 135,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationItem
        return score(item.originalScore, item.originalLevel)
      }
    },
    {
      prop: 'calibrated',
      label: '校准后结果',
      width: 135,
      formatter: (row) => {
        const item = row as Api.Hr.PerformanceCalibrationItem
        return score(item.calibratedScore, item.calibratedLevel)
      }
    },
    {
      prop: 'adjustmentReason',
      label: '调整依据',
      minWidth: 260,
      showOverflowTooltip: true,
      formatter: (row) =>
        (row as Api.Hr.PerformanceCalibrationItem).adjustmentReason ?? '评分未调整'
    },
    actionColumn()
  ]

  const permissionFor = (action: 'add' | 'edit' | 'delete'): string =>
    `Hr:Performance:${action[0]!.toUpperCase()}${action.slice(1)}`
  const statusOf = (row: RecordItem): string => ('status' in row ? String(row.status) : '')
  const canEdit = (row: RecordItem): boolean => {
    const status = statusOf(row)
    if (activeEntity.value === 'cycle' || activeEntity.value === 'review') return status === 'draft'
    if (activeEntity.value === 'goal')
      return ['draft', 'self_review', 'manager_review'].includes(
        (row as Api.Hr.PerformanceGoal).reviewStatus ?? ''
      )
    if (activeEntity.value === 'calibration') return status === 'setup'
    return activeEntity.value === 'check_in'
  }
  const canDelete = (row: RecordItem): boolean => {
    const status = statusOf(row)
    if (activeEntity.value === 'cycle' || activeEntity.value === 'review') return status === 'draft'
    if (activeEntity.value === 'goal')
      return (row as Api.Hr.PerformanceGoal).reviewStatus === 'draft'
    if (activeEntity.value === 'calibration') return status === 'setup'
    return activeEntity.value === 'check_in'
  }
  const transitionActions = (row: RecordItem): ButtonMoreItem[] => {
    if (!row.id) return []
    const actions: ButtonMoreItem[] = []
    const status = statusOf(row)
    if (activeEntity.value === 'cycle') {
      if (status === 'draft')
        actions.push({
          key: 'activate_cycle',
          label: '启动绩效周期',
          icon: 'ri:play-circle-line',
          auth: 'Hr:Performance:Activate'
        })
      if (status === 'active')
        actions.push(
          {
            key: 'review_cycle',
            label: '进入绩效评议',
            icon: 'ri:group-line',
            auth: 'Hr:Performance:Review'
          },
          {
            key: 'cancel_cycle',
            label: '取消绩效周期',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Performance:Activate'
          }
        )
      if (status === 'reviewing')
        actions.push({
          key: 'complete_cycle',
          label: '完成绩效周期',
          icon: 'ri:checkbox-circle-line',
          auth: 'Hr:Performance:Complete'
        })
    }
    if (activeEntity.value === 'review') {
      if (status === 'self_review')
        actions.push({
          key: 'submit_self',
          label: '提交员工自评',
          icon: 'ri:send-plane-line',
          auth: 'Hr:Performance:Review'
        })
      if (status === 'manager_review')
        actions.push({
          key: 'submit_manager',
          label: '提交主管评价',
          icon: 'ri:send-plane-line',
          auth: 'Hr:Performance:Review'
        })
      if (status === 'confirmed')
        actions.push({
          key: 'complete_review',
          label: '确认绩效定案',
          icon: 'ri:checkbox-circle-line',
          auth: 'Hr:Performance:Complete'
        })
    }
    if (activeEntity.value === 'calibration') {
      actions.push({
        key: 'view_calibration',
        label: '查看校准明细',
        icon: 'ri:eye-line',
        auth: 'Hr:Performance:View'
      })
      if (status === 'setup')
        actions.unshift({
          key: 'start_calibration',
          label: '开始绩效校准',
          icon: 'ri:play-circle-line',
          auth: 'Hr:Performance:Calibrate'
        })
      if (status === 'in_progress')
        actions.unshift({
          key: 'approve_calibration',
          label: '批准校准定案',
          icon: 'ri:checkbox-circle-line',
          auth: 'Hr:Performance:Complete'
        })
    }
    return actions
  }
  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'action',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => (
      <BusinessTableRowActions>
        {activeEntity.value === 'calibration_item' && row.id ? (
          <ArtButtonTable
            type="edit"
            permission="Hr:Performance:Calibrate"
            onClick={() => openDialog('calibration_item', row)}
          />
        ) : canEdit(row) ? (
          <ArtButtonTable
            type="edit"
            permission={permissionFor('edit')}
            onClick={() => openDialog(activeEntity.value, row)}
          />
        ) : null}
        <ArtButtonMore
          list={() => [
            ...transitionActions(row),
            ...(canDelete(row)
              ? [
                  {
                    key: 'delete',
                    label: '删除当前记录',
                    icon: 'ri:delete-bin-5-line',
                    color: 'var(--el-color-danger)',
                    auth: permissionFor('delete')
                  }
                ]
              : [])
          ]}
          onClick={(item: ButtonMoreItem) => void handleMoreAction(item, row)}
        />
      </BusinessTableRowActions>
    )
  })
  const handleMoreAction = async (item: ButtonMoreItem, row: RecordItem): Promise<void> => {
    if (item.key === 'delete') return await handleDelete(row)
    if (activeEntity.value === 'cycle') {
      const cycle = row as Api.Hr.PerformanceCycle
      if (item.key === 'activate_cycle') return await handleCycleTransition(cycle, 'activate')
      if (item.key === 'review_cycle') return await handleCycleTransition(cycle, 'begin_review')
      if (item.key === 'cancel_cycle') return await handleCycleTransition(cycle, 'cancel')
      if (item.key === 'complete_cycle') return await handleCycleTransition(cycle, 'complete')
    }
    if (activeEntity.value === 'review') {
      const review = row as Api.Hr.PerformanceReview
      if (item.key === 'submit_self') return await handleReviewTransition(review, 'submit_self')
      if (item.key === 'submit_manager')
        return await handleReviewTransition(review, 'submit_manager')
      if (item.key === 'complete_review') return await handleReviewTransition(review, 'complete')
    }
    if (activeEntity.value === 'calibration') {
      const session = row as Api.Hr.PerformanceCalibrationSession
      if (item.key === 'view_calibration') return openCalibrationItems(session)
      if (item.key === 'start_calibration')
        return await handleCalibrationTransition(session, 'start')
      if (item.key === 'approve_calibration')
        return await handleCalibrationTransition(session, 'approve')
    }
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() =>
    activeEntity.value === 'calibration_item'
      ? []
      : [
          {
            type: 'add',
            label: {
              cycle: '新增绩效周期',
              review: '纳入员工考核',
              goal: '新增绩效目标',
              check_in: '记录绩效沟通',
              calibration: '新增校准会议',
              calibration_item: ''
            }[activeEntity.value],
            permission: permissionFor('add'),
            onClick: () => openDialog(activeEntity.value)
          }
        ]
  )
  const fetchTableData = async (params: TableParams, options?: ApiRequestOptions) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const response = await fetchPerformanceRecords(
      activeEntity.value,
      { ...params, tenantId: effectiveTenantId.value ?? '', from, to },
      { signal: options?.signal, showErrorMessage: false }
    )
    if (response.error && !options?.signal?.aborted)
      throw new Error('绩效列表加载失败，请重试', { cause: response.error })
    return response
  }
  let overviewRequest = 0
  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = effectiveTenantId.value ?? ''
    referenceError.value = ''
    try {
      const [cycles, sessions] = await Promise.all([
        fetchPerformanceOptions('cycle', tenantId, { showErrorMessage: false }),
        fetchPerformanceOptions('calibration', tenantId, { showErrorMessage: false })
      ])
      if (request !== referenceRequest) return
      if (cycles.error || sessions.error || !cycles.data || !sessions.data) {
        referenceError.value = '绩效周期和校准会议筛选项暂时无法加载，请重试'
        return
      }
      cycleOptions.value = cycles.data
      calibrationOptions.value = sessions.data
    } catch {
      if (request === referenceRequest)
        referenceError.value = '绩效周期和校准会议筛选项暂时无法加载，请重试'
    }
  }
  const refreshOverview = async (): Promise<void> => {
    const request = ++overviewRequest
    const tenantId = effectiveTenantId.value ?? ''
    overviewLoading.value = true
    overviewError.value = ''
    try {
      const response = await fetchPerformanceOverview(tenantId, { showErrorMessage: false })
      if (request !== overviewRequest) return
      if (response.error || !response.data) {
        overviewError.value = '绩效总览暂时无法加载，请重试'
        return
      }
      Object.assign(overview, response.data)
    } catch {
      if (request === overviewRequest) overviewError.value = '绩效总览暂时无法加载，请重试'
    } finally {
      if (request === overviewRequest) overviewLoading.value = false
    }
  }
  const retryPageData = (): void => {
    void Promise.all([refreshOverview(), loadReferences()])
  }
  const openDialog = (entity: Entity, row?: RecordItem, preset?: Record<string, unknown>): void => {
    void dialogRef.value?.handleOpen({
      entity,
      type: row ? 'edit' : 'add',
      editData: row,
      preset: { tenantId: effectiveTenantId.value ?? undefined, ...preset }
    })
  }
  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void Promise.all([refreshOverview(), loadReferences()])
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '', sessionId: '' })
  }
  const openCalibrationItems = (row: Api.Hr.PerformanceCalibrationSession): void => {
    activeEntity.value = 'calibration_item'
    Object.assign(tableState.searchQuery, {
      keyword: '',
      status: '',
      cycleId: row.cycleId,
      sessionId: row.id ?? ''
    })
  }
  const handleDelete = async (row: RecordItem): Promise<void> => {
    if (!row.id || deleteContext.value) return
    const entity = activeEntity.value
    const table = getPerformanceDeleteTable(entity)
    if (!table || !canDelete(row) || !hasAuth('Hr:Performance:Delete')) {
      notifyFriendlyError(new Error('当前账号或记录阶段不允许删除'), '当前账号或记录阶段不允许删除')
      return
    }
    const label = activeTab.value.label
    const name = 'cycleName' in row ? row.cycleName : label
    const resources = [{ id: row.id, label: name || label }]
    deleteContext.value = { entity, table, label }
    try {
      if (await inspectDeleteReferences(resources)) return
      await confirmAction(`确定删除“${resources[0]!.label}”吗？`, '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonType: 'danger'
      })
      try {
        await deletePerformanceRecord(entity, row.id)
      } catch (error) {
        if (await inspectDeleteReferences(resources, getDeleteReferenceContext(error)?.constraint))
          return
        if (error instanceof DeleteReferenceBlockedError) return
        throw error
      }
      await tableQueryRef.value?.refreshRemove()
      await Promise.all([refreshOverview(), loadReferences()])
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '绩效记录删除失败，请刷新后重试')
    } finally {
      deleteContext.value = undefined
    }
  }
  const handleCycleTransition = async (
    row: Api.Hr.PerformanceCycle,
    action: Api.Hr.PerformanceCycleAction
  ): Promise<void> => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'cancel')
        comment = await promptText('请输入取消周期的业务原因。', '取消绩效周期', {
          minLength: 2,
          maxLength: 300,
          placeholder: '请输入具体原因',
          type: 'warning'
        })
      else
        await confirmAction(
          action === 'activate'
            ? '启动前将校验每名员工的目标权重是否达到 100%，确认启动？'
            : action === 'complete'
              ? '完成后周期与员工绩效结果将锁定，确认完成？'
              : '确认进入主管评价与组织评议阶段？',
          '推进绩效周期',
          { confirmButtonText: '确认推进', cancelButtonText: '返回', type: 'info' }
        )
      await transitionPerformanceCycle(row.id, action, comment)
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '绩效周期处理失败，请刷新状态后重试')
    }
  }
  const handleReviewTransition = async (
    row: Api.Hr.PerformanceReview,
    action: Api.Hr.PerformanceReviewAction
  ): Promise<void> => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'submit_self')
        comment = await promptText('请总结本周期关键成果、证据与未达成事项。', '提交员工自评', {
          minLength: 5,
          maxLength: 1000,
          placeholder: '请输入员工自评总结',
          type: 'info'
        })
      else if (action === 'submit_manager')
        comment = await promptText(
          '请填写主管综合评价。各目标评分须先在目标页完成。',
          '提交主管评价',
          { minLength: 5, maxLength: 1000, placeholder: '请输入主管评价与反馈', type: 'info' }
        )
      else
        await confirmAction('该结果将不经过校准会议直接定案，确认继续？', '直接完成绩效结果', {
          confirmButtonText: '确认定案',
          cancelButtonText: '返回',
          type: 'warning'
        })
      await transitionPerformanceReview(row.id, action, comment)
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '绩效评估处理失败，请刷新记录后重试')
    }
  }
  const handleCalibrationTransition = async (
    row: Api.Hr.PerformanceCalibrationSession,
    action: Api.Hr.PerformanceCalibrationAction
  ): Promise<void> => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'approve')
        comment = await promptText('请输入本次校准的结论、评分尺度和例外说明。', '批准校准结果', {
          minLength: 5,
          maxLength: 1000,
          placeholder: '请输入组织校准结论',
          type: 'warning'
        })
      else
        await confirmAction(
          '开始后将自动载入当前范围内已完成主管评价的结果，确认开始？',
          '开始绩效校准',
          { confirmButtonText: '开始校准', cancelButtonText: '返回', type: 'info' }
        )
      await transitionPerformanceCalibration(row.id, action, comment)
      await tableQueryRef.value?.refreshUpdate()
      await Promise.all([refreshOverview(), loadReferences()])
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '绩效校准处理失败，请刷新记录后重试')
    }
  }

  onMounted(async () => {
    await Promise.all(
      [
        'hrPerformanceCycleStatus',
        'hrPerformanceReviewStatus',
        'hrPerformanceGoalType',
        'hrPerformanceGoalStatus',
        'hrPerformanceCheckInRisk',
        'hrPerformanceCalibrationStatus',
        'hrPerformanceLevel'
      ].map((code) => userStore.ensureDictLoaded(code))
    )
    retryPageData()
  })
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .performance-page {
    @include hr-table-workspace-layout(360px);

    &__control-deck {
      display: grid;
      gap: 14px;
      padding: 18px;
      overflow: hidden;
      background:
        radial-gradient(
          circle at 93% 0%,
          color-mix(in srgb, var(--theme-color) 9%, transparent),
          transparent 27%
        ),
        var(--default-box-color);
      border: 1px solid var(--art-surface-border);
      border-radius: var(--art-surface-radius);
      box-shadow: var(--art-surface-shadow);
    }

    &__control-heading,
    &__control-heading > div {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    &__control-heading {
      justify-content: space-between;

      > div > span:last-child {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      strong {
        font-size: 16px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--art-surface-radius);
    }

    &__governance-badge {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 6px;
      align-items: center;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--el-color-success-dark-2);
      background: color-mix(in srgb, var(--el-color-success) 9%, transparent);
      border: 1px solid color-mix(in srgb, var(--el-color-success) 22%, transparent);
      border-radius: 999px;
    }

    &__featured-cycle {
      display: grid;
      grid-template-columns: minmax(190px, 0.7fr) minmax(0, 3.3fr);
      gap: 18px;
      align-items: center;
      padding: 16px;
      background: color-mix(in srgb, var(--theme-color) 3%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 15%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
    }

    &__cycle-identity {
      display: grid;
      gap: 4px;
      min-width: 0;

      span {
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.12em;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 15px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        position: relative;
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        min-width: 0;
        padding: 6px 14px;

        &::after {
          position: absolute;
          top: 50%;
          right: -5px;
          width: 10px;
          height: 10px;
          content: '';
          border-top: 1px solid var(--art-card-border);
          border-right: 1px solid var(--art-card-border);
          transform: rotate(45deg) translateY(-50%);
        }

        &:last-child::after {
          display: none;
        }

        > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 12px;
          color: var(--el-text-color-primary);
        }

        small {
          font-size: 10px;
          color: var(--el-text-color-secondary);
        }

        b {
          font-size: 16px;
          color: var(--el-text-color-secondary);
        }

        &.is-current {
          background: color-mix(in srgb, var(--theme-color) 7%, transparent);
          border-radius: var(--art-surface-radius);

          .performance-page__rail-marker,
          b {
            color: var(--theme-color);
          }
        }

        &.is-complete .performance-page__rail-marker {
          color: var(--el-color-success-dark-2);
          background: color-mix(in srgb, var(--el-color-success) 12%, transparent);
        }
      }
    }

    &__rail-marker {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      font-size: 11px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: 50%;
    }

    &__empty-cycle {
      background: color-mix(in srgb, var(--theme-color) 3%, var(--default-box-color));
      border: 1px dashed color-mix(in srgb, var(--theme-color) 24%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
    }

    &__control-note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding-top: 12px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--art-card-border);

      :deep(.art-svg-icon) {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--theme-color);
      }
    }

    &__score {
      display: grid;
      gap: 3px;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-weight: 650;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__score strong {
      font-size: 15px;
    }

    &__progress {
      display: grid;
      gap: 7px;

      span {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        color: var(--el-text-color-primary);
      }
    }

    &__actions {
      display: flex;
      gap: 3px;
      align-items: center;
      white-space: nowrap;
    }

    :deep(.art-table-query) {
      min-width: 0;
    }
  }

  @media only screen and (width <= 1199px) {
    .performance-page {
      &__featured-cycle {
        grid-template-columns: 1fr;
      }

      &__rail {
        grid-template-columns: repeat(2, minmax(0, 1fr));

        li:nth-child(2)::after {
          display: none;
        }
      }
    }
  }

  @media only screen and (width <= 767px) {
    .performance-page {
      &__control-deck {
        padding: 14px;
      }

      &__control-heading {
        grid-template-columns: 1fr;
      }

      &__control-heading {
        display: grid;
      }

      &__governance-badge {
        justify-self: start;
      }

      &__rail {
        grid-template-columns: 1fr;

        li::after {
          display: none;
        }
      }
    }
  }
</style>
