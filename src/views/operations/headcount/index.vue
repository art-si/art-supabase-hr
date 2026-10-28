<template>
  <ArtPermissionGuard permission="Hr:Headcount:View">
    <div class="workforce-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="WORKFORCE CAPACITY"
        title="人力规划与编制"
        description="把年度人力规划、岗位增减员、预算预测与实时岗位容量连接为可审批、可执行、可追溯的管理闭环。"
        icon="ri:organization-chart"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableQueryRef" />
        </template>
      </BusinessWorkspaceHeader>

      <section class="workforce-page__capacity-deck" aria-labelledby="capacity-bridge-title">
        <header class="workforce-page__capacity-heading">
          <span class="workforce-page__capacity-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:scales-3-line" />
          </span>
          <span>
            <strong id="capacity-bridge-title">编制容量桥</strong>
            <small>规划建议先审批，启用后才成为岗位实时容量权威</small>
          </span>
          <span class="workforce-page__authority-badge">
            <ArtSvgIcon icon="ri:shield-check-line" /> 分层数据权威
          </span>
        </header>

        <ElAlert
          v-if="overviewError || planFilterError"
          type="error"
          show-icon
          :closable="false"
          title="编制规划数据加载失败"
          class="mb-4"
        >
          <template #default>
            <span>{{ [overviewError, planFilterError].filter(Boolean).join('；') }}</span>
            <ElButton type="primary" link @click="retryPageData">重新加载</ElButton>
          </template>
        </ElAlert>

        <ElSkeleton v-if="overviewLoading" :rows="3" animated />
        <div
          v-else-if="featuredPlan"
          class="workforce-page__bridge"
          aria-label="当前重点规划容量变化"
        >
          <div class="workforce-page__bridge-identity">
            <span>{{ featuredPlan.planNo }}</span>
            <strong>{{ featuredPlan.planName }}</strong>
            <ArtDictDisplay
              dict-code="hrWorkforcePlanStatus"
              :value="featuredPlan.status"
              display="auto"
            />
          </div>
          <div class="workforce-page__bridge-flow">
            <article
              ><small>基线人数</small><strong>{{ featuredPlan.baselineCount }}</strong
              ><span>当前快照</span></article
            >
            <span class="workforce-page__bridge-operator is-positive">+</span>
            <article class="is-positive"
              ><small>计划增员</small><strong>{{ featuredPlan.plannedHires }}</strong
              ><span>招聘与补充</span></article
            >
            <span class="workforce-page__bridge-operator is-negative">−</span>
            <article class="is-negative"
              ><small>计划减员</small><strong>{{ featuredPlan.plannedExits }}</strong
              ><span>流失与优化</span></article
            >
            <span class="workforce-page__bridge-operator">=</span>
            <article class="is-target"
              ><small>目标编制</small><strong>{{ featuredPlan.targetCount }}</strong
              ><span>批准后待启用</span></article
            >
          </div>
          <div class="workforce-page__budget-signal">
            <small>年度成本预测</small>
            <strong>{{
              formatSensitiveCurrencyValue(
                featuredPlan.plannedPayroll,
                featuredPlan.currencyCode,
                'zh-CN',
                0
              )
            }}</strong>
            <span :class="{ 'is-over': Number(featuredPlan.budgetVariance ?? 0) < 0 }">{{
              budgetVarianceText
            }}</span>
          </div>
        </div>
        <ArtEmptyState
          v-else-if="!overviewError"
          title="尚未建立人力规划"
          description="先创建规划周期，再按岗位维护增减员和成本假设。"
          size="compact"
          :visual-size="64"
        />

        <HrEntityNavigation
          :model-value="activeEntity"
          :items="navigationItems"
          navigation-label="人力规划分类"
          compact
          @update:model-value="selectEntity"
        />
      </section>

      <ArtTableQuery
        :key="`${activeEntity}:${effectiveTenantId ?? 'all-tenants'}`"
        ref="tableQueryRef"
        v-model="tableState.searchQuery"
        :search-items="searchItems"
        :api-fn="fetchTableData"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 80, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <WorkforcePlanningDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatSensitiveCurrencyValue } from '@/utils/ui/format'
  import { toNameCodeOption } from '@/utils/form/option'

  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { ElButton, ElProgress, ElSkeleton, ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '../../shared/hr-entity-navigation.vue'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ApiRequestOptions } from '@/types/api/request'
  import type { ColumnOption, DialogType } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    deleteWorkforcePlanningRecord,
    fetchWorkforcePlanningOptions,
    fetchWorkforcePlanningOverview,
    fetchWorkforcePlanningRecords,
    transitionWorkforcePlan
  } from '@hr/api'
  import WorkforcePlanningDialog from './modules/workforce-planning-dialog.vue'

  defineOptions({ name: 'HrHeadcount' })

  type Entity = Api.Hr.WorkforcePlanningEntity
  type RecordItem = Api.Hr.WorkforcePlanningRecord
  type TableParams = Api.Hr.WorkforcePlanningSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface WorkforceTab {
    entity: Entity
    label: string
    description: string
    emptyDescription: string
    icon: string
    statusDict?: string
  }
  interface DialogExpose {
    handleOpen: (entity: Entity, row?: RecordItem) => Promise<void>
  }

  const tabs: WorkforceTab[] = [
    {
      entity: 'cycle',
      label: '规划周期',
      description: '场景、预算与审批生命周期',
      emptyDescription: '创建年度或专项规划周期，再按岗位维护目标编制。',
      icon: 'ri:calendar-schedule-line',
      statusDict: 'hrWorkforcePlanStatus'
    },
    {
      entity: 'line',
      label: '岗位需求',
      description: '基线、增减员、目标与成本预测',
      emptyDescription: '在草稿规划中添加岗位需求，系统会自动快照当前在岗人数。',
      icon: 'ri:git-merge-line',
      statusDict: 'hrWorkforcePlanPriority'
    },
    {
      entity: 'effective',
      label: '有效编制',
      description: '岗位实时容量与在岗缺口',
      emptyDescription: '启用已批准规划，或手工核定未来生效的岗位编制。',
      icon: 'ri:shield-check-line'
    }
  ]

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const { confirmAction, promptReason } = useArtFeedback()
  const activeEntity = ref<Entity>('cycle')
  const activeTab = computed(() => tabs.find((tab) => tab.entity === activeEntity.value) ?? tabs[0])
  const deleteTables: Record<Entity, string> = {
    cycle: 'hr_workforce_plan_cycle',
    line: 'hr_workforce_plan_line',
    effective: 'hr_position_headcount'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const navigationItems = computed<HrEntityNavigationItem[]>(() =>
    tabs.map((tab) => ({ ...tab, value: tab.entity }))
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const planFilterOptions = shallowRef<Api.Hr.WorkforcePlanningReference[]>([])
  const overviewLoading = ref(false)
  const overviewError = ref('')
  const planFilterError = ref('')
  const tableState = reactive<{ searchQuery: Api.Hr.WorkforcePlanningSearchParams }>({
    searchQuery: { status: '', keyword: '', planId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_workforce_plan_cycle: 'cycle',
      hr_position_headcount: 'effective',
      hr_workforce_plan_line: 'line'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const emptyOverview: Api.Hr.WorkforcePlanningOverview = {
    activePlanCount: 0,
    pendingApprovalCount: 0,
    operationalCapacity: 0,
    currentIncumbentCount: 0,
    vacancyCount: 0,
    overCapacityCount: 0,
    featuredPlan: null
  }
  const overview = reactive<Api.Hr.WorkforcePlanningOverview>({ ...emptyOverview })
  const tableOverview = reactive({ total: 0 })

  const featuredPlan = computed(() => overview.featuredPlan ?? null)

  const budgetVarianceText = computed(() => {
    if (featuredPlan.value?.budgetAmount == null) return '未设置预算上限'
    const variance = Number(featuredPlan.value.budgetVariance ?? 0)
    return variance >= 0
      ? `预算余量 ${formatSensitiveCurrencyValue(variance, featuredPlan.value.currencyCode, 'zh-CN', 0)}`
      : `超预算 ${formatSensitiveCurrencyValue(Math.abs(variance), featuredPlan.value.currencyCode, 'zh-CN', 0)}`
  })
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '基线与场景规划', type: 'primary', effect: 'plain' },
    { label: '审批后启用', type: 'warning', effect: 'light' },
    { label: '岗位容量联动', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前在岗',
      value: overview.currentIncumbentCount,
      description: `岗位容量 ${overview.operationalCapacity} 人`,
      icon: 'ri:team-line'
    },
    {
      label: '可用缺口',
      value: overview.vacancyCount,
      description: overview.overCapacityCount
        ? `${overview.overCapacityCount} 人超编需处理`
        : '按实时岗位容量计算',
      icon: 'ri:user-add-line',
      tone: overview.overCapacityCount ? 'danger' : 'success'
    },
    {
      label: '待审批规划',
      value: overview.pendingApprovalCount,
      description: `${overview.activePlanCount} 个规划执行中`,
      icon: 'ri:task-line',
      tone: overview.pendingApprovalCount ? 'warning' : 'info'
    },
    {
      label: '当前视图',
      value: tableOverview.total,
      description: activeTab.value.label,
      icon: activeTab.value.icon,
      tone: 'info'
    }
  ])

  const effectiveStatusOptions = useDictionaryOptions('hrHeadcountFulfillmentStatus')
  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (activeEntity.value === 'line')
      items.push({
        label: '规划周期',
        key: 'planId',
        type: 'select',
        props: {
          options: planFilterOptions.value.map(toNameCodeOption),
          clearable: true,
          filterable: true
        }
      })
    items.push({
      label: activeEntity.value === 'line' ? '优先级' : '状态',
      key: 'status',
      type: 'select',
      props: {
        options:
          activeEntity.value === 'effective'
            ? effectiveStatusOptions
            : (getDictMap.value[activeTab.value.statusDict ?? ''] ?? []),
        clearable: true
      }
    })
    items.push({
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder:
          activeEntity.value === 'cycle' ? '规划编号、名称或负责人' : '组织、岗位编码或名称'
      }
    })
    return items
  })

  const capacityCell = (baseline: number, hires: number, exits: number, target: number) => (
    <div class="workforce-page__capacity-cell">
      <span>{baseline}</span>
      <small>+</small>
      <span class="is-positive">{hires}</span>
      <small>−</small>
      <span class="is-negative">{exits}</span>
      <small>=</small>
      <strong>{target}</strong>
    </div>
  )
  const cycleAction = (row: Api.Hr.WorkforcePlanCycle) => {
    if (row.status === 'draft')
      return (
        <>
          <ArtButtonTable
            type="edit"
            permission="Hr:Headcount:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonTable
            type="sign"
            icon="ri:send-plane-line"
            label="提交审批"
            permission="Hr:Headcount:Submit"
            onClick={() => actCycle(row, 'submit')}
          />
          <ArtButtonTable
            type="delete"
            permission="Hr:Headcount:Delete"
            onClick={() => handleDelete(row)}
          />
        </>
      )
    if (row.status === 'submitted')
      return (
        <>
          <ArtButtonTable
            type="sign"
            icon="ri:check-double-line"
            label="批准规划"
            permission="Hr:Headcount:Approve"
            onClick={() => actCycle(row, 'approve')}
          />
          <ArtButtonTable
            type="more"
            icon="ri:arrow-go-back-line"
            label="退回修订"
            permission="Hr:Headcount:Approve"
            onClick={() => actCycle(row, 'return')}
          />
          <ArtButtonTable
            type="delete"
            icon="ri:close-circle-line"
            label="取消规划"
            permission="Hr:Headcount:Submit"
            onClick={() => actCycle(row, 'cancel')}
          />
        </>
      )
    if (row.status === 'approved')
      return (
        <ArtButtonTable
          type="sign"
          icon="ri:play-circle-line"
          label="启用规划"
          permission="Hr:Headcount:Activate"
          onClick={() => actCycle(row, 'activate')}
        />
      )
    if (row.status === 'active')
      return (
        <ArtButtonTable
          type="sign"
          icon="ri:stop-circle-line"
          label="关闭规划"
          permission="Hr:Headcount:Close"
          onClick={() => actCycle(row, 'close')}
        />
      )
    return null
  }
  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'operation',
    label: '操作',
    width: activeEntity.value === 'cycle' ? 150 : 115,
    fixed: 'right',
    formatter: (row) => {
      if (activeEntity.value === 'cycle')
        return (
          <BusinessTableRowActions>
            {cycleAction(row as Api.Hr.WorkforcePlanCycle)}
          </BusinessTableRowActions>
        )
      if (activeEntity.value === 'line') {
        const line = row as Api.Hr.WorkforcePlanLine
        return line.planStatus === 'draft' ? (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="edit"
              permission="Hr:Headcount:Edit"
              onClick={() => openDialog(row)}
            />
            <ArtButtonTable
              type="delete"
              permission="Hr:Headcount:Delete"
              onClick={() => handleDelete(row)}
            />
          </BusinessTableRowActions>
        ) : null
      }
      const item = row as Api.Hr.WorkforceEffectiveHeadcount
      if (item.sourcePlanLineId)
        return (
          <ElTag type="success" effect="plain">
            规划同步
          </ElTag>
        )
      return (
        <BusinessTableRowActions>
          <ArtButtonTable
            type={item.effectiveFrom ? 'edit' : 'add'}
            label={item.effectiveFrom ? '编辑有效编制' : '核定有效编制'}
            permission={item.effectiveFrom ? 'Hr:Headcount:Edit' : 'Hr:Headcount:Add'}
            onClick={() => openEffective(item)}
          />
          {item.id && item.effectiveFrom && dayjs(item.effectiveFrom).isAfter(dayjs(), 'day') ? (
            <ArtButtonTable
              type="delete"
              permission="Hr:Headcount:Delete"
              onClick={() => handleDelete(row)}
            />
          ) : null}
        </BusinessTableRowActions>
      )
    }
  })

  const cycleColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'planName',
      label: '规划周期',
      minWidth: 240,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanCycle
        return (
          <BusinessTableIdentityCell
            primary={item.planName}
            secondary={`${item.planNo} · ${item.periodStart} → ${item.periodEnd}`}
          />
        )
      }
    },
    {
      prop: 'scenario',
      label: '规划场景',
      width: 115,
      dict: { code: 'hrWorkforcePlanScenario', display: 'auto' }
    },
    {
      prop: 'capacity',
      label: '基线 + 增员 − 减员 = 目标',
      minWidth: 245,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanCycle
        return capacityCell(
          item.baselineCount ?? 0,
          item.plannedHires ?? 0,
          item.plannedExits ?? 0,
          item.targetCount ?? 0
        )
      }
    },
    {
      prop: 'budgetAmount',
      label: '预算 / 预测',
      minWidth: 185,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanCycle
        return (
          <BusinessTableIdentityCell
            primary={formatSensitiveCurrencyValue(item.budgetAmount, item.currencyCode, 'zh-CN', 0)}
            secondary={`预测 ${formatSensitiveCurrencyValue(item.plannedPayroll, item.currencyCode, 'zh-CN', 0)}`}
          />
        )
      }
    },
    {
      prop: 'owner',
      label: '负责人 / 岗位数',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanCycle
        return (
          <BusinessTableIdentityCell
            primary={item.owner?.name ?? '未指定负责人'}
            secondary={`${item.lineCount ?? 0} 个岗位需求`}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      dict: { code: 'hrWorkforcePlanStatus', display: 'auto' }
    },
    actionColumn()
  ]
  const lineColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'position',
      label: '组织 / 岗位',
      minWidth: 230,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanLine
        return (
          <BusinessTableIdentityCell
            primary={item.position?.name}
            secondary={`${item.organization?.name ?? '--'} · ${item.position?.code ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'plan',
      label: '所属规划',
      minWidth: 190,
      formatter: (row) => (
        <BusinessTableIdentityCell
          primary={(row as Api.Hr.WorkforcePlanLine).plan?.name}
          secondary={(row as Api.Hr.WorkforcePlanLine).plan?.code}
        />
      )
    },
    {
      prop: 'targetCount',
      label: '容量变化',
      minWidth: 225,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanLine
        return capacityCell(
          item.baselineCount,
          item.plannedHires,
          item.plannedExits,
          item.targetCount
        )
      }
    },
    {
      prop: 'forecastGap',
      label: '实际 / 预测缺口',
      width: 145,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanLine
        const gap = Number(item.forecastGap ?? 0)
        return (
          <BusinessTableIdentityCell
            primary={`${item.currentCount ?? 0} / ${item.targetCount} 人`}
            secondary={
              gap > 0 ? `缺口 ${gap} 人` : gap < 0 ? `超目标 ${Math.abs(gap)} 人` : '目标已覆盖'
            }
          />
        )
      }
    },
    {
      prop: 'recruitingCount',
      label: '招聘联动',
      width: 135,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforcePlanLine
        return (
          <BusinessTableIdentityCell
            primary={`${item.recruitingCount ?? 0} 人在招`}
            secondary={`${item.requisitionCount ?? 0} 个有效需求`}
          />
        )
      }
    },
    {
      prop: 'priority',
      label: '优先级',
      width: 95,
      dict: { code: 'hrWorkforcePlanPriority', display: 'auto' }
    },
    {
      prop: 'demandDate',
      label: '到位日期',
      width: 115,
      formatter: (row) => (row as Api.Hr.WorkforcePlanLine).demandDate ?? '--'
    },
    actionColumn()
  ]
  const effectiveColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'position',
      label: '组织 / 岗位',
      minWidth: 240,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.WorkforceEffectiveHeadcount
        return (
          <BusinessTableIdentityCell
            primary={item.position?.name}
            secondary={`${item.organization?.name ?? '--'} · ${item.position?.code ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'occupancy',
      label: '在岗容量',
      minWidth: 230,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforceEffectiveHeadcount
        const current = Number(item.currentCount ?? 0)
        const approved = Math.max(Number(item.approvedCount ?? 0), 1)
        return (
          <div class="workforce-page__occupancy">
            <span>
              <strong>{current}</strong> / {item.approvedCount} 人
            </span>
            <ElProgress
              percentage={Math.min(100, Math.round((current / approved) * 100))}
              stroke-width={6}
              show-text={false}
              status={current > Number(item.approvedCount) ? 'exception' : undefined}
            />
          </div>
        )
      }
    },
    {
      prop: 'vacancyCount',
      label: '可用缺口',
      width: 115,
      formatter: (row) => {
        const gap = Number((row as Api.Hr.WorkforceEffectiveHeadcount).vacancyCount ?? 0)
        return (
          <ElTag type={gap < 0 ? 'danger' : gap > 0 ? 'success' : 'info'} effect="light">
            {gap < 0 ? `超编 ${Math.abs(gap)}` : gap > 0 ? `空缺 ${gap}` : '已满编'}
          </ElTag>
        )
      }
    },
    {
      prop: 'effectiveFrom',
      label: '有效期间',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.WorkforceEffectiveHeadcount
        return item.effectiveFrom
          ? `${item.effectiveFrom} → ${item.effectiveTo ?? '持续有效'}`
          : '岗位当前硬上限'
      }
    },
    {
      prop: 'sourcePlanLineId',
      label: '数据来源',
      width: 125,
      formatter: (row) =>
        (row as Api.Hr.WorkforceEffectiveHeadcount).sourcePlanLineId
          ? '规划启用同步'
          : (row as Api.Hr.WorkforceEffectiveHeadcount).effectiveFrom
            ? '手工核定'
            : '岗位容量基线'
    },
    actionColumn()
  ]
  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'cycle'
      ? cycleColumns()
      : activeEntity.value === 'line'
        ? lineColumns()
        : effectiveColumns()

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label:
        activeEntity.value === 'cycle'
          ? '新增规划周期'
          : activeEntity.value === 'line'
            ? '新增岗位需求'
            : '核定有效编制',
      permission: 'Hr:Headcount:Add',
      onClick: () => openDialog()
    }
  ])
  const fetchTableData = async (params: TableParams, options?: ApiRequestOptions) => {
    const page = buildSupabasePageRange(params)
    const tenantId = effectiveTenantId.value ?? ''
    const response = await fetchWorkforcePlanningRecords(
      activeEntity.value,
      {
        ...tableState.searchQuery,
        tenantId,
        from: page.from,
        to: page.to
      },
      { signal: options?.signal, showErrorMessage: false }
    )
    if (response.error && !options?.signal?.aborted)
      throw new Error('编制规划列表加载失败，请重试', { cause: response.error })
    return response
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (_data, response) => {
    tableOverview.total = Number(response.total ?? 0)
  }
  let overviewRequest = 0
  let planFilterRequest = 0
  const loadOverview = async (): Promise<void> => {
    const request = ++overviewRequest
    const tenantId = effectiveTenantId.value ?? ''
    overviewLoading.value = true
    overviewError.value = ''
    try {
      const result = await fetchWorkforcePlanningOverview(tenantId, { showErrorMessage: false })
      if (request !== overviewRequest || tenantId !== (effectiveTenantId.value ?? '')) return
      if (result.error || !result.data) {
        overviewError.value = '容量总览暂时无法加载，请重试'
        return
      }
      Object.assign(overview, result.data)
    } catch {
      if (request === overviewRequest && tenantId === (effectiveTenantId.value ?? ''))
        overviewError.value = '容量总览暂时无法加载，请重试'
    } finally {
      if (request === overviewRequest) overviewLoading.value = false
    }
  }
  const loadPlanFilters = async (): Promise<void> => {
    const request = ++planFilterRequest
    const tenantId = effectiveTenantId.value ?? ''
    planFilterError.value = ''
    try {
      const result = await fetchWorkforcePlanningOptions('plan', tenantId, {
        showErrorMessage: false
      })
      if (request !== planFilterRequest || tenantId !== (effectiveTenantId.value ?? '')) return
      if (result.error || !result.data) {
        planFilterError.value = '规划周期筛选项暂时无法加载，请重试'
        return
      }
      planFilterOptions.value = result.data
    } catch {
      if (request === planFilterRequest && tenantId === (effectiveTenantId.value ?? ''))
        planFilterError.value = '规划周期筛选项暂时无法加载，请重试'
    }
  }
  const retryPageData = (): void => {
    void Promise.all([loadOverview(), loadPlanFilters()])
  }
  watch(
    effectiveTenantId,
    () => {
      tableState.searchQuery.planId = ''
      Object.assign(overview, emptyOverview)
      tableOverview.total = 0
      planFilterOptions.value = []
      retryPageData()
    },
    { flush: 'sync' }
  )
  const selectEntity = (value: string): void => {
    activeEntity.value = value as Entity
    Object.assign(tableState.searchQuery, { status: '', keyword: '', planId: '' })
  }
  const openDialog = (row?: RecordItem): void => {
    void dialogRef.value?.handleOpen(activeEntity.value, row)
  }
  const openEffective = (row: Api.Hr.WorkforceEffectiveHeadcount): void => {
    const editable = row.effectiveFrom
      ? row
      : { ...row, id: undefined, effectiveFrom: dayjs().format('YYYY-MM-DD') }
    void dialogRef.value?.handleOpen('effective', editable)
  }
  const handleSaveSuccess = (type: DialogType): void => {
    void Promise.all([
      type === 'add' ? tableQueryRef.value?.refreshCreate() : tableQueryRef.value?.refreshUpdate(),
      loadOverview(),
      loadPlanFilters()
    ])
  }
  const handleDelete = async (row: RecordItem): Promise<void> => {
    if (!row.id) return
    const entity = activeEntity.value
    const label =
      entity === 'cycle'
        ? `${(row as Api.Hr.WorkforcePlanCycle).planName}（${(row as Api.Hr.WorkforcePlanCycle).planNo}）`
        : entity === 'line'
          ? `${(row as Api.Hr.WorkforcePlanLine).position?.name ?? '岗位'} · ${(row as Api.Hr.WorkforcePlanLine).plan?.name ?? '规划周期'}`
          : `${(row as Api.Hr.WorkforceEffectiveHeadcount).position?.name ?? '岗位'} · ${(row as Api.Hr.WorkforceEffectiveHeadcount).effectiveFrom ?? '编制记录'}`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: 'Hr:Headcount:Delete',
      remove: () => deleteWorkforcePlanningRecord(entity, row.id!),
      onDeleted: async () => {
        await Promise.all([tableQueryRef.value?.refreshRemove(), loadOverview(), loadPlanFilters()])
      }
    })
  }
  const actCycle = async (
    row: Api.Hr.WorkforcePlanCycle,
    action: Api.Hr.WorkforcePlanAction
  ): Promise<void> => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (['return', 'cancel', 'close'].includes(action))
        comment = await promptReason(
          '请填写本次状态变更原因，内容将保留在规划审计记录中。',
          action === 'return' ? '退回修订' : action === 'cancel' ? '取消规划' : '关闭规划',
          { confirmButtonText: action === 'close' ? '关闭规划' : '提交原因', maxLength: 200 }
        )
      else {
        const copyMap: Partial<Record<Api.Hr.WorkforcePlanAction, string>> = {
          submit: '提交后岗位需求将锁定，等待具备审批权限的人员审核。',
          approve: '批准只确认规划建议，不会立即改变岗位容量。',
          activate: '启用会生成有效编制并同步岗位硬上限；低于当前在岗人数的目标将被阻止。'
        }
        const copy = copyMap[action]
        await confirmAction(copy ?? '确认执行该操作？', '状态确认', {
          confirmButtonText:
            action === 'activate' ? '启用并同步' : action === 'approve' ? '批准规划' : '提交审批'
        })
      }
      await transitionWorkforcePlan(row.id, action, comment)
      await Promise.all([tableQueryRef.value?.refreshUpdate(), loadOverview(), loadPlanFilters()])
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '编制规划状态更新失败，请刷新规划后重试')
    }
  }

  onMounted(retryPageData)
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .workforce-page {
    @include hr-table-workspace-layout(360px);

    &__capacity-deck {
      display: grid;
      grid-template-columns: minmax(300px, 0.72fr) minmax(0, 2fr);
      gap: 14px;
      padding: 16px 18px 12px;
      background: var(--default-box-color);
      border: 1px solid var(--art-surface-border);
      border-radius: var(--art-surface-radius);
      box-shadow: var(--art-surface-shadow);

      :deep(.hr-entity-navigation) {
        grid-column: 1 / -1;
      }
    }

    &__capacity-heading {
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr);
      gap: 11px;
      align-items: center;
      min-width: 0;

      > span:nth-child(2) {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__capacity-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 19px;
      color: var(--el-color-primary);
      background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
      border-radius: var(--el-border-radius-base);
    }

    &__authority-badge {
      display: inline-flex !important;
      flex: 0 0 auto;
      grid-column: 2;
      gap: 5px !important;
      align-items: center;
      justify-self: start;
      padding: 5px 9px;
      margin-top: -4px;
      font-size: 12px;
      color: var(--el-color-success);
      background: color-mix(in srgb, var(--el-color-success) 9%, transparent);
      border-radius: 999px;
    }

    &__bridge {
      display: grid;
      grid-template-columns: minmax(170px, 0.72fr) minmax(500px, 2fr) minmax(170px, 0.72fr);
      gap: 18px;
      align-items: stretch;
      min-width: 0;
      padding: 14px 16px;
      background: color-mix(in srgb, var(--el-color-primary) 4%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--el-color-primary) 13%, var(--art-card-border));
      border-radius: var(--el-border-radius-base);
    }

    &__bridge-identity,
    &__budget-signal {
      display: flex;
      flex-direction: column;
      gap: 5px;
      justify-content: center;
      min-width: 0;

      > span:first-child,
      > small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      > strong {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__bridge-flow {
      display: grid;
      grid-template-columns: repeat(7, auto);
      gap: 10px;
      align-items: center;
      justify-content: center;
      min-width: 0;

      article {
        display: grid;
        gap: 2px;
        min-width: 76px;
        text-align: center;
      }

      small,
      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 24px;
        font-variant-numeric: tabular-nums;
        line-height: 1.05;
        color: var(--el-text-color-primary);
      }

      .is-positive strong {
        color: var(--el-color-success);
      }

      .is-negative strong {
        color: var(--el-color-warning);
      }

      .is-target strong {
        color: var(--el-color-primary);
      }
    }

    &__bridge-operator {
      font-size: 18px !important;
      font-weight: 700;
      color: var(--el-text-color-secondary) !important;
    }

    &__budget-signal {
      padding-left: 18px;
      border-left: 1px solid var(--art-card-border);

      > span:last-child {
        font-size: 12px;
        color: var(--el-color-success);

        &.is-over {
          color: var(--el-color-danger);
        }
      }
    }

    &__capacity-cell {
      display: flex;
      gap: 7px;
      align-items: baseline;
      font-variant-numeric: tabular-nums;

      span {
        color: var(--el-text-color-regular);
      }

      small {
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 16px;
        color: var(--el-color-primary);
      }

      .is-positive {
        color: var(--el-color-success);
      }

      .is-negative {
        color: var(--el-color-warning);
      }
    }

    &__occupancy {
      display: grid;
      gap: 7px;
      max-width: 190px;

      span {
        font-size: 12px;
        color: var(--el-text-color-regular);
      }

      strong {
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
      }
    }

    &__actions {
      display: flex;
      align-items: center;
      min-height: 32px;
    }

    @media (width <= 1440px) {
      &__bridge {
        grid-template-columns: minmax(150px, 0.6fr) minmax(430px, 1.7fr);
      }

      &__budget-signal {
        flex-direction: row;
        grid-column: 1 / -1;
        align-items: baseline;
        padding: 10px 0 0;
        border-top: 1px solid var(--art-card-border);
        border-left: 0;
      }
    }

    @media (width <= 980px) {
      &__capacity-deck {
        grid-template-columns: 1fr;
      }

      &__bridge {
        grid-template-columns: 1fr;
      }

      &__bridge-flow {
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 4px;
        justify-content: start;

        article {
          min-width: 0;
        }

        strong {
          font-size: 20px;
        }
      }

      &__budget-signal {
        grid-column: auto;
      }

      &__authority-badge {
        display: none !important;
      }
    }
  }
</style>
