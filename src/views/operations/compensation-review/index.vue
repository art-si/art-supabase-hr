<template>
  <ArtPermissionGuard permission="Hr:CompensationReview:View">
    <div class="review-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="COMPENSATION REVIEW & MERIT GOVERNANCE"
        title="调薪复核"
        description="把年度调薪从线下表格升级为可审计的预算、经理建议、组织校准、审批与生效闭环；最终结果写入员工有效期薪酬历史。"
        icon="ri:funds-box-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="review-page__command" aria-labelledby="review-command-title">
        <header class="review-page__command-header">
          <div>
            <span class="review-page__command-icon" aria-hidden="true"
              ><ArtSvgIcon icon="ri:route-line"
            /></span>
            <span>
              <small>ACTIVE REVIEW CONTEXT</small>
              <strong id="review-command-title">{{
                selectedCycle?.cycleName || '建立首个调薪复核周期'
              }}</strong>
              <em v-if="selectedCycle">
                {{ selectedCycle.cycleCode }} · {{ selectedCycle.reviewYear }} 年 ·
                {{ selectedCycle.scopeOrganizationName || '全部组织' }}
              </em>
              <em v-else>先定义统一的时间、预算与调薪指引，再开放经理建议</em>
            </span>
          </div>

          <div class="review-page__cycle-picker">
            <label for="review-cycle-selector">复核周期</label>
            <ElSelect
              id="review-cycle-selector"
              v-model="selectedCycleId"
              filterable
              clearable
              placeholder="选择调薪周期"
              @change="handleCycleChange"
            >
              <ElOption
                v-for="option in cycleOptions"
                :key="option.id"
                :label="`${option.name} · ${statusLabel(option.status)}`"
                :value="option.id"
              />
            </ElSelect>
            <ElTag
              v-if="selectedCycle"
              :type="cycleStatusTone(selectedCycle.status)"
              effect="light"
              round
            >
              {{ statusLabel(selectedCycle.status) }}
            </ElTag>
          </div>
        </header>

        <ElScrollbar class="review-page__lifecycle-scroll">
          <ol class="review-page__lifecycle" aria-label="调薪复核状态流转">
            <li v-for="(stage, index) in lifecycleStages" :key="stage.key" :class="stage.state">
              <span class="review-page__stage-index">0{{ index + 1 }}</span>
              <span class="review-page__stage-icon"><ArtSvgIcon :icon="stage.icon" /></span>
              <div
                ><strong>{{ stage.label }}</strong
                ><small>{{ stage.description }}</small></div
              >
              <b>{{ stage.value }}</b>
            </li>
          </ol>
        </ElScrollbar>

        <div v-if="selectedCycle" class="review-page__guardrails">
          <article>
            <span><ArtSvgIcon icon="ri:calendar-check-line" /></span>
            <div
              ><small>决策节奏</small
              ><strong
                >{{ selectedCycle.recommendationDueDate }} →
                {{ selectedCycle.calibrationDueDate }}</strong
              ><em>生效 {{ selectedCycle.effectiveDate }}</em></div
            >
          </article>
          <article>
            <span><ArtSvgIcon icon="ri:percent-line" /></span>
            <div
              ><small>调薪建议区间</small
              ><strong
                >{{
                  formatNumberValue(selectedCycle.guidelineMinPercent ?? 0, 'zh-CN', {
                    maximumFractionDigits: 2
                  })
                }}% ～
                {{
                  formatNumberValue(selectedCycle.guidelineMaxPercent ?? 0, 'zh-CN', {
                    maximumFractionDigits: 2
                  })
                }}%</strong
              ><em
                >默认预算率
                {{
                  formatNumberValue(selectedCycle.defaultBudgetPercent ?? 0, 'zh-CN', {
                    maximumFractionDigits: 2
                  })
                }}%</em
              ></div
            >
          </article>
          <article :class="budgetToneClass">
            <span
              ><ArtSvgIcon :icon="overview.amountAccess ? 'ri:wallet-3-line' : 'ri:lock-2-line'"
            /></span>
            <div
              ><small>预算占用</small
              ><strong>{{
                overview.amountAccess
                  ? `${formatNumberValue(overview.budgetUtilization ?? 0, 'zh-CN', { maximumFractionDigits: 2 })}%`
                  : '金额受控'
              }}</strong
              ><em>{{
                overview.amountAccess
                  ? `${formatCurrencyCodeValue(overview.proposedIncreaseAmount, selectedCycle?.currencyCode ?? 'CNY')} / ${formatCurrencyCodeValue(overview.budgetAmount, selectedCycle?.currencyCode ?? 'CNY')}`
                  : '当前权限仅展示流程状态'
              }}</em></div
            >
          </article>
          <article :class="overview.outOfGuidelineCount ? 'is-warning' : 'is-success'">
            <span
              ><ArtSvgIcon
                :icon="
                  overview.outOfGuidelineCount ? 'ri:alarm-warning-line' : 'ri:shield-check-line'
                "
            /></span>
            <div
              ><small>治理例外</small><strong>{{ overview.outOfGuidelineCount }} 项超出指引</strong
              ><em>{{ overview.excludedCount }} 人已说明排除原因</em></div
            >
          </article>
        </div>

        <div v-else class="review-page__starter">
          <span><ArtSvgIcon icon="ri:calendar-schedule-line" /></span>
          <div>
            <strong>从统一规则开始，而不是先发 Excel</strong>
            <p
              >创建周期后，系统会在开放时锁定员工当前薪酬、职级、组织和最近绩效结果，并按组织自动生成预算。</p
            >
          </div>
          <ElButton
            v-auth="'Hr:CompensationReview:Cycle:Manage'"
            type="primary"
            @click="openDialog('cycle')"
          >
            <ArtSvgIcon icon="ri:add-line" />新增调薪周期
          </ElButton>
        </div>

        <footer class="review-page__boundary">
          <ArtSvgIcon icon="ri:information-line" />
          当前工作台只管理调薪决策；到达生效日并获得独立权限后，系统才会关闭旧薪酬版本、创建新版本并保留周期来源，薪资与财务继续读取批准后的有效薪酬。
        </footer>
      </section>

      <section class="review-page__workspace" aria-labelledby="review-workspace-title">
        <header>
          <div
            ><small>DECISION WORKSPACE</small
            ><strong id="review-workspace-title">{{ activeTab.label }}</strong
            ><span>{{ activeTab.description }}</span></div
          >
          <span class="review-page__result"
            ><ArtSvgIcon :icon="activeTab.icon" />{{ tableTotal }} 条当前结果</span
          >
        </header>
        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="调薪复核工作视图"
          compact
          @change="handleTabChange"
        />
      </section>

      <ArtTableQuery
        :key="`${activeEntity}-${selectedCycleId || 'all'}`"
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
          emptyText: activeTab.emptyTitle,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <CompensationReviewDialog ref="dialogRef" @success="handleDialogSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatCurrencyCodeValue, formatNumberValue } from '@/utils/ui/format'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import { ElButton, ElOption, ElProgress, ElSelect, ElTag, type TagProps } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import {
    deleteCompensationReviewRecord,
    fetchCompensationReviewOptions,
    fetchCompensationReviewOverview,
    fetchCompensationReviewRecords,
    transitionCompensationReviewCycle
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import CompensationReviewDialog from './modules/compensation-review-dialog.vue'

  defineOptions({ name: 'HrCompensationReview' })

  type Entity = Api.Hr.CompensationReviewEntity
  type RecordItem = Api.Hr.CompensationReviewRecord
  type TableParams = Api.Hr.CompensationReviewSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyTitle: string
    emptyDescription: string
  }
  interface DialogExpose {
    handleOpen: (payload: {
      entity: Entity
      type: DialogType
      editData?: RecordItem
      cycle?: Api.Hr.CompensationReviewCycle | null
    }) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'cycle',
      label: '调薪周期',
      description: '规则、组织范围与状态治理',
      emptyTitle: '暂无调薪复核周期',
      emptyDescription: '建立首个周期，统一预算、建议区间、截止日期与生效日。',
      icon: 'ri:calendar-schedule-line'
    },
    {
      value: 'item',
      label: '员工工作表',
      description: '经理建议、例外与组织校准',
      emptyTitle: '暂无员工调薪工作表',
      emptyDescription: '选择并开放一个调薪周期后，系统将自动锁定符合条件的员工薪酬快照。',
      icon: 'ri:user-star-line'
    },
    {
      value: 'budget',
      label: '组织预算',
      description: '分配、占用与超支控制',
      emptyTitle: '暂无组织调薪预算',
      emptyDescription: '开放周期时，系统会按组织当前基本工资和默认预算率自动生成预算。',
      icon: 'ri:funds-line'
    }
  ]

  const { hasAuth } = useAuth()
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('cycle')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const deleteTables: Record<Entity, string> = {
    cycle: 'hr_compensation_review_cycle',
    item: 'hr_compensation_review_item',
    budget: 'hr_compensation_review_budget'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const cycleOptions = ref<Api.Hr.CompensationReviewReference[]>([])
  const selectedCycleId = ref('')
  const tableTotal = ref(0)
  const tableAmountAccess = ref(false)
  const tableState = reactive<{ searchQuery: Api.Hr.CompensationReviewSearchParams }>({
    searchQuery: { keyword: '', status: '', tenantId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_compensation_review_cycle: 'cycle',
      hr_compensation_review_item: 'item',
      hr_compensation_review_budget: 'budget'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      selectedCycleId.value = ''
    }
  )
  const overview = reactive<Api.Hr.CompensationReviewOverview>({
    cycleCount: 0,
    amountAccess: false,
    selectedCycle: null,
    eligibleCount: 0,
    pendingCount: 0,
    recommendedCount: 0,
    calibratedCount: 0,
    approvedCount: 0,
    effectedCount: 0,
    excludedCount: 0,
    outOfGuidelineCount: 0,
    budgetAmount: null,
    proposedIncreaseAmount: null,
    budgetUtilization: null
  })

  const selectedCycle = computed(() => overview.selectedCycle)
  const statusOrder: Api.Hr.CompensationReviewCycleStatus[] = [
    'draft',
    'open',
    'calibrating',
    'approved',
    'effected',
    'cancelled'
  ]
  const statusMap: Record<
    Api.Hr.CompensationReviewCycleStatus | Api.Hr.CompensationReviewItemStatus,
    string
  > = {
    draft: '草稿',
    open: '建议开放',
    calibrating: '组织校准',
    approved: '已批准',
    effected: '已生效',
    cancelled: '已取消',
    pending: '待建议',
    recommended: '已建议',
    calibrated: '已校准',
    excluded: '已排除'
  }
  const statusLabel = (status?: string | null): string =>
    statusMap[status as keyof typeof statusMap] ?? status ?? '--'
  const cycleStatusTone = (status?: Api.Hr.CompensationReviewCycleStatus): TagProps['type'] =>
    status === 'effected' || status === 'approved'
      ? 'success'
      : status === 'open' || status === 'calibrating'
        ? 'warning'
        : status === 'cancelled'
          ? 'info'
          : 'primary'
  const itemStatusTone = (status?: Api.Hr.CompensationReviewItemStatus): TagProps['type'] =>
    status === 'effected' || status === 'approved' || status === 'calibrated'
      ? 'success'
      : status === 'pending'
        ? 'warning'
        : status === 'excluded'
          ? 'info'
          : 'primary'

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '薪酬快照锁定', type: 'primary', effect: 'plain' },
    { label: '组织预算硬约束', type: 'warning', effect: 'light' },
    { label: '审批后到期生效', type: 'success', effect: 'light' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前阶段',
      value: selectedCycle.value ? statusLabel(selectedCycle.value.status) : '未建周期',
      description: selectedCycle.value
        ? `${selectedCycle.value.effectiveDate} 生效`
        : '先定义复核规则与范围',
      icon: 'ri:git-commit-line',
      tone: selectedCycle.value
        ? selectedCycle.value.status === 'effected'
          ? 'success'
          : 'primary'
        : 'warning'
    },
    {
      label: '复核员工',
      value: overview.eligibleCount,
      description: `${overview.pendingCount} 人待提交建议`,
      icon: 'ri:team-line',
      tone: overview.pendingCount ? 'warning' : overview.eligibleCount ? 'success' : 'info'
    },
    {
      label: '预算占用率',
      value: overview.amountAccess
        ? `${formatNumberValue(overview.budgetUtilization ?? 0, 'zh-CN', { maximumFractionDigits: 2 })}%`
        : '--',
      description: overview.amountAccess
        ? `${overview.outOfGuidelineCount} 项超出建议区间`
        : '当前权限不展示薪酬金额',
      icon: overview.amountAccess ? 'ri:pie-chart-2-line' : 'ri:lock-2-line',
      tone:
        (overview.budgetUtilization ?? 0) > 100
          ? 'danger'
          : (overview.budgetUtilization ?? 0) > 85
            ? 'warning'
            : 'success'
    },
    {
      label: '已批准 / 生效',
      value: `${overview.approvedCount} / ${overview.effectedCount}`,
      description: '批准结果到期后写入薪酬历史',
      icon: 'ri:verified-badge-line',
      tone:
        overview.approvedCount && overview.approvedCount === overview.effectedCount
          ? 'success'
          : 'info'
    }
  ])

  const lifecycleStages = computed(() => {
    const current = selectedCycle.value?.status
    const currentIndex = current ? statusOrder.indexOf(current) : -1
    const definitions = [
      {
        key: 'draft',
        label: '定义周期',
        description: '范围、预算率与指引',
        value: selectedCycle.value ? '规则已建立' : '待创建',
        icon: 'ri:file-settings-line'
      },
      {
        key: 'open',
        label: '经理建议',
        description: '逐人建议或说明排除',
        value: `${overview.pendingCount} 人待提交`,
        icon: 'ri:user-voice-line'
      },
      {
        key: 'calibrating',
        label: '组织校准',
        description: '统一尺度与例外依据',
        value: `${overview.calibratedCount} 人已校准`,
        icon: 'ri:equalizer-2-line'
      },
      {
        key: 'approved',
        label: '薪酬批准',
        description: '预算内独立定案',
        value: `${overview.approvedCount} 人已批准`,
        icon: 'ri:shield-check-line'
      },
      {
        key: 'effected',
        label: '到期生效',
        description: '写入员工薪酬版本',
        value: `${overview.effectedCount} 人已生效`,
        icon: 'ri:exchange-funds-line'
      }
    ]
    return definitions.map((stage, index) => ({
      ...stage,
      state: !selectedCycle.value
        ? index === 0
          ? 'is-current'
          : ''
        : current === 'cancelled'
          ? index === 0
            ? 'is-risk'
            : ''
          : index < currentIndex
            ? 'is-complete'
            : index === currentIndex
              ? 'is-current'
              : ''
    }))
  })

  const budgetToneClass = computed(() =>
    !overview.amountAccess
      ? 'is-restricted'
      : (overview.budgetUtilization ?? 0) > 100
        ? 'is-danger'
        : (overview.budgetUtilization ?? 0) > 85
          ? 'is-warning'
          : 'is-success'
  )

  const searchItems = computed<SearchFormItem[]>(() => {
    const statusOptions =
      activeEntity.value === 'cycle'
        ? [
            { label: '草稿', value: 'draft' },
            { label: '建议开放', value: 'open' },
            { label: '组织校准', value: 'calibrating' },
            { label: '已批准', value: 'approved' },
            { label: '已生效', value: 'effected' },
            { label: '已取消', value: 'cancelled' }
          ]
        : activeEntity.value === 'item'
          ? [
              { label: '待建议', value: 'pending' },
              { label: '已建议', value: 'recommended' },
              { label: '已校准', value: 'calibrated' },
              { label: '已批准', value: 'approved' },
              { label: '已生效', value: 'effected' },
              { label: '已排除', value: 'excluded' }
            ]
          : []
    const items: SearchFormItem[] = []
    if (statusOptions.length) {
      items.push({
        label: '状态',
        key: 'status',
        type: 'select',
        options: statusOptions,
        props: { clearable: true, placeholder: '全部状态' }
      })
    }
    items.push({
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder:
          activeEntity.value === 'cycle'
            ? '周期编码、名称或组织'
            : activeEntity.value === 'item'
              ? '员工、工号或组织'
              : '组织或周期名称'
      }
    })
    return items
  })

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => {
    if (activeEntity.value === 'item') return []
    if (
      activeEntity.value === 'budget' &&
      (!selectedCycle.value || !['draft', 'open'].includes(selectedCycle.value.status))
    )
      return []
    return [
      {
        type: 'add',
        label: activeEntity.value === 'cycle' ? '新增调薪周期' : '新增组织预算',
        permission:
          activeEntity.value === 'cycle'
            ? 'Hr:CompensationReview:Cycle:Manage'
            : 'Hr:CompensationReview:Budget:Manage',
        onClick: () => openDialog(activeEntity.value)
      }
    ]
  })

  const statusTag = (status?: string) => (
    <ElTag
      type={
        activeEntity.value === 'item'
          ? itemStatusTone(status as Api.Hr.CompensationReviewItemStatus)
          : cycleStatusTone(status as Api.Hr.CompensationReviewCycleStatus)
      }
      effect="light"
      round
    >
      {statusLabel(status)}
    </ElTag>
  )

  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'cycle'
      ? cycleColumns()
      : activeEntity.value === 'item'
        ? itemColumns()
        : budgetColumns()

  const cycleColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'cycleName',
      label: '调薪周期 / 编码',
      minWidth: 230,
      fixed: 'left',
      link: {
        permission: 'Hr:CompensationReview:View',
        onClick: (row) => selectCycle(row as Api.Hr.CompensationReviewCycle)
      },
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewCycle
        return (
          <BusinessTableIdentityCell
            primary={item.cycleName}
            secondary={item.cycleCode}
            tertiary={`${item.reviewYear} 年`}
          />
        )
      }
    },
    {
      prop: 'scopeOrganizationName',
      label: '组织范围',
      minWidth: 150,
      showOverflowTooltip: true,
      formatter: (row) =>
        (row as Api.Hr.CompensationReviewCycle).scopeOrganizationName || '全部组织'
    },
    {
      prop: 'effectiveDate',
      label: '复核节奏',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewCycle
        return (
          <BusinessTableIdentityCell
            primary={`生效 ${item.effectiveDate}`}
            secondary={`建议 ${item.recommendationDueDate}`}
            tertiary={`校准 ${item.calibrationDueDate}`}
          />
        )
      }
    },
    {
      prop: 'guidelineMaxPercent',
      label: '预算 / 指引',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewCycle
        return (
          <BusinessTableIdentityCell
            primary={`预算率 ${formatNumberValue(item.defaultBudgetPercent ?? 0, 'zh-CN', { maximumFractionDigits: 2 })}%`}
            secondary={`${formatNumberValue(item.guidelineMinPercent ?? 0, 'zh-CN', { maximumFractionDigits: 2 })}% ～ ${formatNumberValue(item.guidelineMaxPercent ?? 0, 'zh-CN', { maximumFractionDigits: 2 })}%`}
          />
        )
      }
    },
    {
      prop: 'employeeCount',
      label: '员工',
      width: 92,
      align: 'right',
      formatter: (row) => `${(row as Api.Hr.CompensationReviewCycle).employeeCount ?? 0} 人`
    },
    {
      prop: 'budgetAmount',
      label: '批准预算',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyCodeValue(
          (row as Api.Hr.CompensationReviewCycle).budgetAmount,
          (row as Api.Hr.CompensationReviewCycle).currencyCode
        )
    },
    {
      prop: 'proposedIncreaseAmount',
      label: '建议增资',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyCodeValue(
          (row as Api.Hr.CompensationReviewCycle).proposedIncreaseAmount,
          (row as Api.Hr.CompensationReviewCycle).currencyCode
        )
    },
    {
      prop: 'status',
      label: '状态',
      width: 112,
      formatter: (row) => statusTag((row as Api.Hr.CompensationReviewCycle).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => cycleActions(row as Api.Hr.CompensationReviewCycle)
    }
  ]

  const itemColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employeeName',
      label: '员工 / 工号',
      minWidth: 180,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewItem
        return (
          <BusinessTableIdentityCell
            primary={item.employeeName}
            secondary={item.employeeNo}
            tertiary={item.organizationName}
          />
        )
      }
    },
    {
      prop: 'gradeName',
      label: '职级',
      minWidth: 110,
      showOverflowTooltip: true,
      formatter: (row) => (row as Api.Hr.CompensationReviewItem).gradeName || '--'
    },
    {
      prop: 'performanceLevel',
      label: '绩效结果',
      width: 110,
      formatter: (row) => (row as Api.Hr.CompensationReviewItem).performanceLevel || '--'
    },
    {
      prop: 'currentBaseAmount',
      label: '当前基本工资',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyCodeValue(
          (row as Api.Hr.CompensationReviewItem).currentBaseAmount,
          selectedCycle.value?.currencyCode ?? 'CNY'
        )
    },
    {
      prop: 'proposedBaseAmount',
      label: '建议基本工资',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyCodeValue(
          (row as Api.Hr.CompensationReviewItem).proposedBaseAmount,
          selectedCycle.value?.currencyCode ?? 'CNY'
        )
    },
    {
      prop: 'increasePercent',
      label: '调薪幅度',
      width: 118,
      align: 'right',
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewItem
        return item.status === 'excluded' ? (
          '--'
        ) : item.increasePercent == null ? (
          '--'
        ) : (
          <span
            class={item.outOfGuideline ? 'review-page__variance is-risk' : 'review-page__variance'}
          >
            {item.increasePercent > 0 ? '+' : ''}
            {formatNumberValue(item.increasePercent ?? 0, 'zh-CN', { maximumFractionDigits: 2 })}%
          </span>
        )
      }
    },
    {
      prop: 'outOfGuideline',
      label: '指引校验',
      width: 110,
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewItem
        return item.status === 'excluded' ? (
          <ElTag type="info" effect="plain">
            已排除
          </ElTag>
        ) : item.outOfGuideline ? (
          <ElTag type="warning" effect="light">
            需要依据
          </ElTag>
        ) : (
          <ElTag type="success" effect="light">
            区间内
          </ElTag>
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      formatter: (row) => statusTag((row as Api.Hr.CompensationReviewItem).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => itemActions(row as Api.Hr.CompensationReviewItem)
    }
  ]

  const budgetColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'organizationName',
      label: '预算组织',
      minWidth: 210,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewBudget
        return (
          <BusinessTableIdentityCell
            primary={item.organizationName}
            secondary={`${item.employeeCount ?? 0} 名复核员工`}
            tertiary={item.source === 'auto' ? '按默认预算率生成' : '人工批准预算'}
          />
        )
      }
    },
    {
      prop: 'budgetAmount',
      label: '批准预算',
      minWidth: 160,
      align: 'right',
      formatter: (row) =>
        formatCurrencyCodeValue(
          (row as Api.Hr.CompensationReviewBudget).budgetAmount,
          selectedCycle.value?.currencyCode ?? 'CNY'
        )
    },
    {
      prop: 'usedAmount',
      label: '已占用',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyCodeValue(
          (row as Api.Hr.CompensationReviewBudget).usedAmount,
          selectedCycle.value?.currencyCode ?? 'CNY'
        )
    },
    {
      prop: 'remainingAmount',
      label: '剩余预算',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyCodeValue(
          (row as Api.Hr.CompensationReviewBudget).remainingAmount,
          selectedCycle.value?.currencyCode ?? 'CNY'
        )
    },
    {
      prop: 'utilizationPercent',
      label: '预算健康度',
      minWidth: 210,
      formatter: (row) => {
        const item = row as Api.Hr.CompensationReviewBudget
        return item.utilizationPercent == null ? (
          <span class="review-page__masked">
            <ArtSvgIcon icon="ri:lock-2-line" />
            金额受控
          </span>
        ) : (
          <div class="review-page__progress">
            <ElProgress
              percentage={Math.min(item.utilizationPercent, 100)}
              status={
                item.utilizationPercent > 100
                  ? 'exception'
                  : item.utilizationPercent >= 85
                    ? 'warning'
                    : 'success'
              }
              strokeWidth={7}
            />
            <small>
              {formatNumberValue(item.utilizationPercent ?? 0, 'zh-CN', {
                maximumFractionDigits: 2
              })}
              %
            </small>
          </div>
        )
      }
    },
    {
      prop: 'note',
      label: '预算说明',
      minWidth: 200,
      showOverflowTooltip: true,
      formatter: (row) => (row as Api.Hr.CompensationReviewBudget).note || '--'
    },
    {
      prop: 'action',
      label: '操作',
      width: 110,
      fixed: 'right',
      formatter: (row) => budgetActions(row as Api.Hr.CompensationReviewBudget)
    }
  ]

  const cycleActions = (row: Api.Hr.CompensationReviewCycle) => {
    const actions: ButtonMoreItem[] = []
    if (row.status === 'draft') {
      actions.push({
        key: 'edit',
        label: '编辑规则',
        icon: 'ri:edit-line',
        auth: 'Hr:CompensationReview:Cycle:Manage'
      })
      actions.push({
        key: 'open',
        label: '开放经理建议',
        icon: 'ri:play-circle-line',
        auth: 'Hr:CompensationReview:Cycle:Manage'
      })
      actions.push({
        key: 'delete',
        label: '删除草稿',
        icon: 'ri:delete-bin-6-line',
        auth: 'Hr:CompensationReview:Cycle:Manage',
        color: 'var(--el-color-danger)'
      })
    }
    if (row.status === 'open')
      actions.push({
        key: 'calibrate',
        label: '进入组织校准',
        icon: 'ri:equalizer-2-line',
        auth: 'Hr:CompensationReview:Calibrate'
      })
    if (row.status === 'calibrating')
      actions.push({
        key: 'approve',
        label: '批准调薪结果',
        icon: 'ri:verified-badge-line',
        auth: 'Hr:CompensationReview:Approve'
      })
    if (row.status === 'approved')
      actions.push({
        key: 'effect',
        label: '批量生效',
        icon: 'ri:exchange-funds-line',
        auth: 'Hr:CompensationReview:Effect'
      })
    if (['draft', 'open'].includes(row.status))
      actions.push({
        key: 'cancel',
        label: '取消周期',
        icon: 'ri:close-circle-line',
        auth: 'Hr:CompensationReview:Cycle:Manage',
        color: 'var(--el-color-danger)'
      })
    return (
      <BusinessTableRowActions>
        <ArtButtonTable type="view" label="进入周期" onClick={() => selectCycle(row)} />
        {actions.length ? (
          <ArtButtonMore
            list={actions}
            onClick={(item: ButtonMoreItem) => void handleCycleMoreAction(item, row)}
          />
        ) : null}
      </BusinessTableRowActions>
    )
  }

  const handleCycleMoreAction = async (
    item: ButtonMoreItem,
    row: Api.Hr.CompensationReviewCycle
  ): Promise<void> => {
    if (item.key === 'edit') return openDialog('cycle', row)
    if (item.key === 'delete') return handleDelete('cycle', row)
    await handleCycleAction(row, item.key as Api.Hr.CompensationReviewCycleAction)
  }

  const itemActions = (row: Api.Hr.CompensationReviewItem) => {
    const canEdit =
      row.cycleStatus === 'open'
        ? hasAuth('Hr:CompensationReview:Recommend')
        : row.cycleStatus === 'calibrating' && hasAuth('Hr:CompensationReview:Calibrate')
    return canEdit && hasAuth('Hr:CompensationReview:Amount:Edit') ? (
      <ArtButtonTable type="edit" onClick={() => openDialog('item', row)} />
    ) : (
      <span class="review-page__locked">流程锁定</span>
    )
  }

  const budgetActions = (row: Api.Hr.CompensationReviewBudget) => {
    const editable =
      ['draft', 'open'].includes(row.cycleStatus ?? '') &&
      hasAuth('Hr:CompensationReview:Budget:Manage') &&
      hasAuth('Hr:CompensationReview:Amount:Edit')
    if (!editable) return <span class="review-page__locked">预算锁定</span>
    return (
      <BusinessTableRowActions>
        <ArtButtonTable type="edit" onClick={() => openDialog('budget', row)} />
        <ArtButtonTable type="delete" onClick={() => handleDelete('budget', row)} />
      </BusinessTableRowActions>
    )
  }

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchCompensationReviewRecords(activeEntity.value, {
      ...params,
      from,
      to,
      cycleId: activeEntity.value === 'cycle' ? undefined : selectedCycleId.value || undefined
    })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableTotal.value = response.total ?? 0
    tableAmountAccess.value = Boolean(
      'amountAccess' in response && (response as { amountAccess?: boolean }).amountAccess
    )
  }

  const loadCycleOptions = async (): Promise<void> => {
    const response = await fetchCompensationReviewOptions('cycle', tableState.searchQuery.tenantId)
    cycleOptions.value = response.data ?? []
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchCompensationReviewOverview(
      selectedCycleId.value,
      tableState.searchQuery.tenantId
    )
    if (response.data) {
      Object.assign(overview, response.data)
      if (!selectedCycleId.value && response.data.selectedCycle?.id)
        selectedCycleId.value = response.data.selectedCycle.id
    }
  }
  const refreshWorkspace = async (): Promise<void> => {
    await Promise.all([refreshOverview(), loadCycleOptions(), tableQueryRef.value?.refreshUpdate()])
  }
  const handleCycleChange = async (): Promise<void> => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    await refreshOverview()
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    tableTotal.value = 0
  }
  const selectCycle = async (row: Api.Hr.CompensationReviewCycle): Promise<void> => {
    selectedCycleId.value = row.id ?? ''
    activeEntity.value = row.status === 'draft' ? 'budget' : 'item'
    await handleCycleChange()
  }

  const openDialog = (entity: Entity, row?: RecordItem): void => {
    if (entity !== 'cycle' && !selectedCycle.value) return
    void dialogRef.value?.handleOpen({
      entity,
      type: row ? 'edit' : 'add',
      editData: row,
      cycle: selectedCycle.value
    })
  }
  const handleDialogSuccess = async (entity: Entity, type: DialogType): Promise<void> => {
    if (type === 'add') await tableQueryRef.value?.refreshCreate()
    else await tableQueryRef.value?.refreshUpdate()
    if (entity === 'cycle') await loadCycleOptions()
    await refreshOverview()
  }

  const handleCycleAction = async (
    row: Api.Hr.CompensationReviewCycle,
    action: Api.Hr.CompensationReviewCycleAction
  ): Promise<void> => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'approve') {
        comment = await promptText(
          '请输入本次调薪校准结论、预算判断和例外审批依据。',
          '批准调薪结果',
          {
            confirmButtonText: '批准结果',
            cancelButtonText: '返回',
            placeholder: '请输入审批结论',
            minLength: 4,
            maxLength: 1000,
            type: 'warning'
          }
        )
      } else if (action === 'cancel') {
        comment = await promptText(
          '请输入取消原因。周期内未生效记录将统一标记为排除。',
          '取消调薪周期',
          {
            confirmButtonText: '确认取消',
            cancelButtonText: '返回',
            placeholder: '请输入取消原因',
            minLength: 4,
            maxLength: 500,
            type: 'warning'
          }
        )
      } else {
        const content =
          action === 'open'
            ? '开放后将锁定当前员工薪酬、组织、职级与最近绩效快照，并自动生成组织预算。规则只能通过取消周期重新建立，确认继续？'
            : action === 'calibrate'
              ? '系统将校验所有员工均已建议或排除，并阻断任何组织预算超支。确认进入组织校准？'
              : `系统将按 ${row.effectiveDate} 生效：关闭旧薪酬版本并创建新的批准薪酬。该操作不可撤销，确认继续？`
        await confirmAction(
          content,
          action === 'open'
            ? '开放经理建议'
            : action === 'calibrate'
              ? '进入组织校准'
              : '批量生效调薪',
          {
            confirmButtonText:
              action === 'open' ? '确认开放' : action === 'calibrate' ? '开始校准' : '确认生效',
            cancelButtonText: '返回',
            type: action === 'effect' ? 'warning' : 'info'
          }
        )
      }
      await transitionCompensationReviewCycle(row.id, action, comment)
      selectedCycleId.value = row.id
      await refreshWorkspace()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '调薪周期处理失败，请刷新预算与周期状态后重试')
    }
  }

  const handleDelete = async (
    entity: 'cycle' | 'budget',
    row: Api.Hr.CompensationReviewCycle | Api.Hr.CompensationReviewBudget
  ): Promise<void> => {
    if (!row.id) return
    const label =
      entity === 'cycle'
        ? `${(row as Api.Hr.CompensationReviewCycle).cycleName}（${(row as Api.Hr.CompensationReviewCycle).cycleCode}）`
        : `${(row as Api.Hr.CompensationReviewBudget).organizationName ?? '组织预算'} · ${(row as Api.Hr.CompensationReviewBudget).cycleName ?? '调薪周期'}`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: entity === 'cycle' ? '调薪周期' : '组织预算',
      permission:
        entity === 'cycle'
          ? 'Hr:CompensationReview:Cycle:Manage'
          : ['Hr:CompensationReview:Budget:Manage', 'Hr:CompensationReview:Amount:Edit'],
      confirmMessage:
        entity === 'cycle'
          ? `确认删除草稿周期“${label}”？`
          : `确认删除组织预算“${label}”？进入校准前应核对正向增资预算。`,
      remove: () => deleteCompensationReviewRecord(entity, row.id!),
      onDeleted: async () => {
        if (entity === 'cycle' && selectedCycleId.value === row.id) selectedCycleId.value = ''
        await refreshWorkspace()
      }
    })
  }

  onMounted(async () => {
    await Promise.all([loadCycleOptions(), refreshOverview()])
  })
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .review-page {
    @include hr-table-workspace-layout(420px);

    &__command,
    &__workspace {
      display: grid;
      flex: 0 0 auto;
      gap: 14px;
      min-width: 0;
      padding: 16px;
      background:
        radial-gradient(
          circle at 98% 0%,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 28%
        ),
        var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--theme-color) 11%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
      box-shadow: 0 8px 26px color-mix(in srgb, var(--art-gray-900) 4%, transparent);
    }

    &__lifecycle-scroll {
      min-width: 0;
      height: auto;
    }

    &__command-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(330px, auto);
      gap: 16px;
      align-items: center;
      min-width: 0;

      > div:first-child {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        min-width: 0;
      }

      > div:first-child > span:last-child {
        display: grid;
        min-width: 0;
      }

      small {
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.08em;
      }

      strong {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 16px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      em {
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        font-style: normal;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__command-icon {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 11%, transparent);
      border-radius: var(--art-surface-radius);
    }

    &__cycle-picker {
      display: grid;
      grid-template-columns: auto minmax(220px, 310px) auto;
      gap: 9px;
      align-items: center;
      min-width: 0;

      label {
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-regular);
        white-space: nowrap;
      }

      :deep(.el-select) {
        width: 100%;
      }
    }

    &__lifecycle {
      display: grid;
      grid-template-columns: repeat(5, minmax(220px, 1fr));
      gap: 1px;
      min-width: 1106px;
      padding: 0;
      margin: 0;
      overflow: hidden;
      list-style: none;
      background: var(--art-card-border);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      li {
        position: relative;
        display: grid;
        grid-template-columns: 28px 34px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        min-width: 0;
        min-height: 76px;
        padding: 11px;
        background: var(--default-box-color);
      }

      li::after {
        position: absolute;
        right: -7px;
        z-index: 2;
        width: 13px;
        height: 13px;
        content: '';
        background: inherit;
        border-top: 1px solid var(--art-card-border);
        border-right: 1px solid var(--art-card-border);
        transform: rotate(45deg);
      }

      li:last-child::after {
        display: none;
      }

      li.is-current {
        background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      }

      li.is-complete {
        background: color-mix(in srgb, var(--el-color-success) 6%, var(--default-box-color));
      }

      li.is-risk {
        background: color-mix(in srgb, var(--el-color-danger) 6%, var(--default-box-color));
      }

      li div {
        display: grid;
        min-width: 0;
      }

      li strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      li small {
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        font-weight: 400;
        color: var(--el-text-color-secondary);
        letter-spacing: 0;
        white-space: nowrap;
      }

      li b {
        grid-column: 2 / -1;
        margin-top: -4px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__stage-index {
      align-self: start;
      padding-top: 4px;
      font-size: 9px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
    }

    &__stage-icon {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, transparent);
      border-radius: var(--art-surface-radius);
    }

    .is-complete &__stage-icon {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }

    .is-risk &__stage-icon {
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
    }

    &__guardrails {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;

      article {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 9px;
        align-items: center;
        min-width: 0;
        padding: 11px 12px;
        background: color-mix(in srgb, var(--theme-color) 3%, var(--default-box-color));
        border: 1px solid var(--art-card-border);
        border-radius: var(--art-surface-radius);
      }

      article > span {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, transparent);
        border-radius: var(--art-surface-radius);
      }

      article > div {
        display: grid;
        min-width: 0;
      }

      article small {
        font-size: 10px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
        letter-spacing: 0;
      }

      article strong {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      article em {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        font-style: normal;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      article.is-success > span {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      article.is-warning > span {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }

      article.is-danger > span {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }

      article.is-restricted > span {
        color: var(--el-text-color-secondary);
        background: var(--art-bg-color);
      }
    }

    &__starter {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 18px;
      background: linear-gradient(
        115deg,
        color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color)),
        var(--default-box-color)
      );
      border: 1px dashed color-mix(in srgb, var(--theme-color) 30%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 11%, transparent);
        border-radius: var(--art-surface-radius);
      }

      div {
        min-width: 0;
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 5px 0 0;
        font-size: 11px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__boundary {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      padding-top: 10px;
      font-size: 11px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--art-card-border);

      svg {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--theme-color);
      }
    }

    &__workspace {
      gap: 12px;
      padding: 14px 16px;

      > header {
        display: flex;
        gap: 16px;
        align-items: center;
        justify-content: space-between;
        min-width: 0;
      }

      > header div {
        display: grid;
        min-width: 0;
      }

      > header small {
        font-size: 9px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.08em;
      }

      > header strong {
        margin-top: 2px;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      > header span:not(.review-page__result) {
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__result {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
      background: var(--art-bg-color);
      border-radius: 999px;

      svg {
        color: var(--theme-color);
      }
    }

    &__variance {
      font-weight: 700;
      color: var(--el-color-success-dark-2);

      &.is-risk {
        color: var(--el-color-warning-dark-2);
      }
    }

    &__progress {
      display: grid;
      grid-template-columns: minmax(100px, 1fr) 44px;
      gap: 8px;
      align-items: center;

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
        text-align: right;
      }
    }

    &__masked {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    &__locked {
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    :deep(.art-table-query) {
      flex: 1;
    }

    @media (width <= 1200px) {
      &__command-header {
        grid-template-columns: 1fr;
      }

      &__cycle-picker {
        grid-template-columns: auto minmax(200px, 1fr) auto;
        justify-self: stretch;
      }

      &__lifecycle {
        grid-template-columns: repeat(5, minmax(220px, 1fr));
      }

      &__guardrails {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (width <= 760px) {
      &__command,
      &__workspace {
        padding: 12px;
      }

      &__cycle-picker {
        grid-template-columns: 1fr;
      }

      &__cycle-picker label {
        display: none;
      }

      &__cycle-picker :deep(.el-tag) {
        justify-self: start;
      }

      &__guardrails {
        grid-template-columns: 1fr;
      }

      &__starter {
        grid-template-columns: 42px minmax(0, 1fr);
      }

      &__starter > span {
        width: 42px;
        height: 42px;
      }

      &__starter :deep(.el-button) {
        grid-column: 1 / -1;
        justify-self: start;
      }

      &__workspace > header {
        align-items: flex-start;
      }

      &__result {
        display: none;
      }
    }
  }
</style>
