<template>
  <ArtPermissionGuard permission="Hr:PolicyAcknowledgement:View">
    <div class="policy-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="POLICY DISTRIBUTION & ACKNOWLEDGEMENT"
        title="政策与签收"
        description="统一治理制度版本、适用范围、员工送达、签收时限与审计凭证，让每一次发布都形成可证明、可追踪、不可静默覆盖的合规闭环。"
        icon="ri:file-shield-2-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="policy-page__command" aria-labelledby="policy-command-title">
        <header>
          <div>
            <span class="policy-page__command-icon"><ArtSvgIcon icon="ri:route-line" /></span>
            <span>
              <small>CONTROLLED DISTRIBUTION PATH</small>
              <strong id="policy-command-title">从受控版本到签收证据</strong>
              <em>发布时固化适用人群；完成、豁免与重新打开均保留责任人和时间依据</em>
            </span>
          </div>
          <ElTag :type="overview.overdueCount ? 'danger' : 'success'" effect="light" round>
            <ArtSvgIcon
              :icon="overview.overdueCount ? 'ri:alarm-warning-line' : 'ri:shield-check-line'"
            />
            {{ overview.overdueCount ? `${overview.overdueCount} 项签收逾期` : '当前无逾期签收' }}
          </ElTag>
        </header>

        <ElScrollbar class="policy-page__lifecycle-scroll">
          <ol class="policy-page__lifecycle" aria-label="政策发布与签收治理链路">
            <li v-for="(stage, index) in lifecycleStages" :key="stage.label" :class="stage.state">
              <span class="policy-page__stage-index">0{{ index + 1 }}</span>
              <span class="policy-page__stage-icon"><ArtSvgIcon :icon="stage.icon" /></span>
              <div>
                <strong>{{ stage.label }}</strong>
                <small>{{ stage.description }}</small>
              </div>
              <b>{{ stage.value }}</b>
            </li>
          </ol>
        </ElScrollbar>

        <div class="policy-page__guardrails">
          <article class="is-restricted">
            <span><ArtSvgIcon icon="ri:git-commit-line" /></span>
            <div
              ><small>版本控制</small><strong>发布版本不可覆盖</strong
              ><em>变更必须创建新版本</em></div
            >
          </article>
          <article class="is-success">
            <span><ArtSvgIcon icon="ri:group-line" /></span>
            <div
              ><small>受众快照</small><strong>发布时固化名单</strong
              ><em>组织范围自动包含下级组织</em></div
            >
          </article>
          <article :class="overview.overdueCount ? 'is-danger' : 'is-success'">
            <span><ArtSvgIcon icon="ri:timer-flash-line" /></span>
            <div
              ><small>时限治理</small><strong>{{ overview.overdueCount }} 项已逾期</strong
              ><em>按生效日与签收天数计算</em></div
            >
          </article>
          <article :class="overview.evidenceAccess ? 'is-success' : 'is-restricted'">
            <span
              ><ArtSvgIcon :icon="overview.evidenceAccess ? 'ri:key-2-line' : 'ri:lock-line'"
            /></span>
            <div
              ><small>证据边界</small
              ><strong>{{ overview.evidenceAccess ? '已授权查看' : '敏感依据已隐藏' }}</strong
              ><em>查看权与业务操作权独立</em></div
            >
          </article>
        </div>

        <footer>
          <ArtSvgIcon icon="ri:information-line" />
          发布操作由服务端按实时员工主数据生成送达记录；页面统计仅用于运营判断，不会替代服务端权限、范围和状态门禁。
        </footer>
      </section>

      <section class="policy-page__workspace" aria-labelledby="policy-workspace-title">
        <header>
          <div>
            <small>OPERATING WORKSPACE</small>
            <strong id="policy-workspace-title">{{ activeTab.label }}</strong>
            <span>{{ activeTab.description }}</span>
          </div>
          <span class="policy-page__result"
            ><ArtSvgIcon :icon="activeTab.icon" />{{ tableTotal }} 条当前结果</span
          >
        </header>
        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="政策与签收工作视图"
          compact
          @change="handleTabChange"
        />
        <div v-if="activeEntity === 'receipt' && focusedPolicy" class="policy-page__focus">
          <span><ArtSvgIcon icon="ri:focus-3-line" /></span>
          <div>
            <small>当前政策签收</small>
            <strong>{{ focusedPolicy.policyTitle }} · v{{ focusedPolicy.versionNo }}</strong>
            <em>{{ focusedPolicy.policyCode }} · {{ audienceLabel(focusedPolicy) }}</em>
          </div>
          <ElButton text type="primary" @click="clearPolicyFocus">查看全部签收</ElButton>
        </div>
      </section>

      <ArtTableQuery
        :key="`${activeEntity}-${focusedPolicy?.id || 'all'}`"
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

      <PolicyDocumentDialog ref="dialogRef" @success="handleDialogSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import dayjs from 'dayjs'
  import { ElButton, ElProgress, ElTag, type TagProps } from 'element-plus'
  import { clamp } from 'lodash-es'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import {
    deletePolicyDocument,
    fetchPolicyAcknowledgementOverview,
    fetchPolicyAcknowledgementRecords,
    transitionPolicyAcknowledgement
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import PolicyDocumentDialog from './modules/policy-document-dialog.vue'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'HrPolicyAcknowledgement' })

  type Entity = Api.Hr.PolicyAcknowledgementEntity
  type RecordItem = Api.Hr.PolicyAcknowledgementRecord
  type TableParams = Api.Hr.PolicyAcknowledgementSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyTitle: string
    emptyDescription: string
  }

  interface DialogExpose {
    handleOpen: (payload: { type: DialogType; editData?: Api.Hr.HrPolicyDocument }) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'policy',
      label: '政策版本',
      description: '制度编码、受控版本、适用范围、生效与发布状态',
      emptyTitle: '暂无政策版本',
      emptyDescription: '创建受控政策草稿，明确适用人群与签收时限后再发布。',
      icon: 'ri:file-list-3-line'
    },
    {
      value: 'receipt',
      label: '员工签收',
      description: '送达对象、截止日期、完成状态与审计依据',
      emptyTitle: '暂无员工签收记录',
      emptyDescription: '政策发布后，系统会按适用范围自动生成员工送达与签收记录。',
      icon: 'ri:quill-pen-line'
    }
  ]

  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('policy')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard('hr_policy_document', '政策草稿')
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tableTotal = ref(0)
  const focusedPolicy = ref<Api.Hr.HrPolicyDocument | null>(null)
  const tableState = reactive<{ searchQuery: Api.Hr.PolicyAcknowledgementSearchParams }>({
    searchQuery: { keyword: '', status: '', tenantId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    { hr_policy_document: 'policy', hr_policy_receipt: 'receipt' },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      focusedPolicy.value = null
    }
  )
  const overview = reactive<Api.Hr.PolicyAcknowledgementOverview>({
    draftPolicyCount: 0,
    publishedPolicyCount: 0,
    scheduledPolicyCount: 0,
    receiptCount: 0,
    acknowledgedCount: 0,
    pendingCount: 0,
    overdueCount: 0,
    completionRate: 0,
    evidenceAccess: false
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '受控版本', type: 'primary', effect: 'plain' },
    { label: '适用人群快照', type: 'success', effect: 'light' },
    { label: '凭证独立授权', type: 'warning', effect: 'light' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '生效政策',
      value: overview.publishedPolicyCount,
      description: `${overview.scheduledPolicyCount} 份等待生效`,
      icon: 'ri:file-shield-2-line',
      tone: overview.publishedPolicyCount ? 'primary' : 'info'
    },
    {
      label: '签收完成率',
      value: `${overview.completionRate}%`,
      description: `${overview.acknowledgedCount} / ${overview.receiptCount} 已闭环`,
      icon: 'ri:pie-chart-2-line',
      tone: overview.completionRate >= 90 ? 'success' : overview.receiptCount ? 'warning' : 'info'
    },
    {
      label: '待处理签收',
      value: overview.pendingCount,
      description: '待确认或待豁免处理',
      icon: 'ri:time-line',
      tone: overview.pendingCount ? 'warning' : 'success'
    },
    {
      label: '已逾期',
      value: overview.overdueCount,
      description: `${overview.draftPolicyCount} 份政策仍为草稿`,
      icon: 'ri:alarm-warning-line',
      tone: overview.overdueCount ? 'danger' : 'success'
    }
  ])
  const lifecycleStages = computed(() => [
    {
      label: '起草与版本',
      description: '编码、正文与修订关系',
      value: `${overview.draftPolicyCount} 份草稿`,
      icon: 'ri:draft-line',
      state: overview.draftPolicyCount ? 'is-current' : ''
    },
    {
      label: '范围与发布',
      description: '固化组织或用工类型',
      value: `${overview.publishedPolicyCount} 份已发布`,
      icon: 'ri:send-plane-line',
      state: overview.publishedPolicyCount ? 'is-complete' : ''
    },
    {
      label: '生效与送达',
      description: '生成员工签收任务',
      value: `${overview.receiptCount} 条送达`,
      icon: 'ri:mail-check-line',
      state: overview.receiptCount ? 'is-complete' : ''
    },
    {
      label: '签收与豁免',
      description: '确认责任与业务依据',
      value: `${overview.pendingCount} 条待处理`,
      icon: 'ri:quill-pen-line',
      state: overview.overdueCount ? 'is-risk' : overview.pendingCount ? 'is-current' : ''
    },
    {
      label: '证据与复核',
      description: '状态、时间与凭证审计',
      value: `${overview.completionRate}% 已闭环`,
      icon: 'ri:shield-check-line',
      state: overview.completionRate >= 90 ? 'is-complete' : ''
    }
  ])

  const labels: Record<string, string> = {
    draft: '草稿',
    published: '已发布',
    retired: '已退役',
    cancelled: '已取消',
    pending: '待签收',
    overdue: '已逾期',
    acknowledged: '已签收',
    waived: '已豁免'
  }
  const statusLabel = (value?: string | null): string => labels[value ?? ''] ?? value ?? '--'
  const statusTone = (value?: string | null): TagProps['type'] =>
    ['published', 'acknowledged'].includes(value ?? '')
      ? 'success'
      : ['draft', 'pending'].includes(value ?? '')
        ? 'warning'
        : value === 'overdue'
          ? 'danger'
          : 'info'
  const statusTag = (value?: string | null) => (
    <ElTag type={statusTone(value)} effect="light" round>
      {statusLabel(value)}
    </ElTag>
  )

  const progress = (completed = 0, total = 0, overdue = 0) => {
    const percentage = total ? Math.round((completed * 100) / total) : 0
    return (
      <div class="grid gap-1">
        <ElProgress
          percentage={clamp(percentage, 0, 100)}
          strokeWidth={5}
          showText={false}
          status="success"
        />
        <small
          class={
            overdue
              ? 'text-xs font-semibold text-[var(--el-color-danger)]'
              : 'text-xs text-[var(--art-gray-600)]'
          }
        >
          {completed} / {total} · {percentage}%{overdue ? ` · ${overdue} 逾期` : ''}
        </small>
      </div>
    )
  }

  const audienceLabel = (row: Api.Hr.HrPolicyDocument): string =>
    row.audienceType === 'all'
      ? '全部在册员工'
      : row.audienceType === 'organization'
        ? `${row.audienceOrganizationName || '指定组织'}（含下级）`
        : employmentTypeLabel(row.audienceEmploymentType)
  const employmentTypeLabel = (value?: string | null): string =>
    ({ full_time: '全职', part_time: '兼职', intern: '实习', contractor: '合同制' })[value ?? ''] ??
    value ??
    '--'

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '状态',
      key: 'status',
      type: 'select',
      options:
        activeEntity.value === 'policy'
          ? [
              { label: '草稿', value: 'draft' },
              { label: '已发布', value: 'published' },
              { label: '已退役', value: 'retired' },
              { label: '已取消', value: 'cancelled' }
            ]
          : [
              { label: '待签收', value: 'pending' },
              { label: '已逾期', value: 'overdue' },
              { label: '已签收', value: 'acknowledged' },
              { label: '已豁免', value: 'waived' }
            ],
      props: { clearable: true, placeholder: '全部状态' }
    },
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder:
          activeEntity.value === 'policy' ? '政策编码、名称、分类或组织' : '员工、工号、政策或组织'
      }
    }
  ])
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() =>
    activeEntity.value === 'policy'
      ? [
          {
            type: 'add',
            label: '新建政策版本',
            permission: 'Hr:PolicyAcknowledgement:Policy:Manage',
            onClick: () => openDialog()
          }
        ]
      : []
  )

  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'policy' ? policyColumns() : receiptColumns()

  const policyColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'policyTitle',
      label: '政策 / 版本',
      minWidth: 230,
      fixed: 'left',
      link: { onClick: (row) => focusReceipts(row as Api.Hr.HrPolicyDocument) },
      formatter: (row) => {
        const item = row as Api.Hr.HrPolicyDocument
        return (
          <BusinessTableIdentityCell
            primary={item.policyTitle}
            secondary={`${item.policyCode} · v${item.versionNo}`}
            tertiary={item.category}
          />
        )
      }
    },
    {
      prop: 'audienceType',
      label: '适用人群',
      minWidth: 180,
      formatter: (row) => (
        <BusinessTableIdentityCell
          primary={audienceLabel(row as Api.Hr.HrPolicyDocument)}
          secondary={'发布时固化范围'}
        />
      )
    },
    {
      prop: 'effectiveDate',
      label: '生效 / 签收时限',
      width: 155,
      formatter: (row) => {
        const item = row as Api.Hr.HrPolicyDocument
        return (
          <BusinessTableIdentityCell
            primary={item.effectiveDate}
            secondary={`发布后 ${item.acknowledgementDueDays} 天内`}
          />
        )
      }
    },
    {
      prop: 'receiptCount',
      label: '签收进度',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.HrPolicyDocument
        return progress(
          (item.acknowledgedCount ?? 0) + (item.waivedCount ?? 0),
          item.receiptCount ?? 0,
          item.overdueCount ?? 0
        )
      }
    },
    {
      prop: 'documentReference',
      label: '受控文档',
      minWidth: 160,
      showOverflowTooltip: true,
      formatter: (row) => (row as Api.Hr.HrPolicyDocument).documentReference
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => statusTag((row as Api.Hr.HrPolicyDocument).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => policyActions(row as Api.Hr.HrPolicyDocument)
    }
  ]

  const receiptColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employeeName',
      label: '员工 / 工号',
      minWidth: 185,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.HrPolicyReceipt
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
      prop: 'policyTitle',
      label: '政策 / 版本',
      minWidth: 220,
      formatter: (row) => {
        const item = row as Api.Hr.HrPolicyReceipt
        return (
          <BusinessTableIdentityCell
            primary={item.policyTitle}
            secondary={`${item.policyCode || '--'} · v${item.policyVersionNo || '--'}`}
          />
        )
      }
    },
    {
      prop: 'deliveredAt',
      label: '送达 / 截止',
      width: 170,
      formatter: (row) => {
        const item = row as Api.Hr.HrPolicyReceipt
        return (
          <BusinessTableIdentityCell
            primary={formatTableDateTime(item.deliveredAt)}
            secondary={`截止 ${item.dueDate}`}
            tertiary={
              item.status === 'overdue'
                ? `逾期 ${dayjs().diff(dayjs(item.dueDate), 'day')} 天`
                : null
            }
          />
        )
      }
    },
    {
      prop: 'acknowledgedAt',
      label: '完成信息',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.HrPolicyReceipt
        return (
          <BusinessTableIdentityCell
            primary={item.acknowledgedBy || item.waivedBy}
            secondary={
              item.acknowledgedAt || item.waivedAt
                ? dayjs(item.acknowledgedAt || item.waivedAt).format('YYYY-MM-DD HH:mm')
                : null
            }
            tertiary={
              overview.evidenceAccess
                ? item.acknowledgementNote || item.waiverReason
                : '业务依据受控'
            }
          />
        )
      }
    },
    {
      prop: 'evidenceReference',
      label: '证据引用',
      minWidth: 155,
      showOverflowTooltip: true,
      formatter: (row) =>
        overview.evidenceAccess
          ? (row as Api.Hr.HrPolicyReceipt).evidenceReference || '--'
          : '未授权查看'
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => statusTag((row as Api.Hr.HrPolicyReceipt).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => receiptActions(row as Api.Hr.HrPolicyReceipt)
    }
  ]

  const policyActions = (row: Api.Hr.HrPolicyDocument) => {
    const actions: ButtonMoreItem[] = [
      {
        key: 'receipts',
        label: '查看员工签收',
        icon: 'ri:group-line'
      }
    ]
    if (row.status === 'draft') {
      actions.unshift({
        key: 'edit',
        label: '编辑草稿',
        icon: 'ri:edit-line',
        auth: 'Hr:PolicyAcknowledgement:Policy:Manage'
      })
      actions.push(
        {
          key: 'publish',
          label: '发布政策',
          icon: 'ri:send-plane-line',
          auth: 'Hr:PolicyAcknowledgement:Publish'
        },
        {
          key: 'cancel',
          label: '取消草稿',
          icon: 'ri:close-circle-line',
          auth: 'Hr:PolicyAcknowledgement:Publish',
          color: 'var(--el-color-warning)'
        },
        {
          key: 'delete',
          label: '删除草稿',
          icon: 'ri:delete-bin-6-line',
          auth: 'Hr:PolicyAcknowledgement:Policy:Manage',
          color: 'var(--el-color-danger)'
        }
      )
    }
    if (row.status === 'published')
      actions.push({
        key: 'retire',
        label: '退役政策',
        icon: 'ri:archive-line',
        auth: 'Hr:PolicyAcknowledgement:Publish',
        color: 'var(--el-color-warning)'
      })
    return <ArtButtonMore list={actions} onClick={(item) => void handlePolicyMore(item, row)} />
  }

  const receiptActions = (row: Api.Hr.HrPolicyReceipt) => {
    const actions: ButtonMoreItem[] = []
    if (['pending', 'overdue'].includes(row.status))
      actions.push(
        {
          key: 'acknowledge',
          label: '确认签收',
          icon: 'ri:quill-pen-line',
          auth: 'Hr:PolicyAcknowledgement:Receipt:Manage'
        },
        {
          key: 'waive',
          label: '豁免签收',
          icon: 'ri:shield-cross-line',
          auth: 'Hr:PolicyAcknowledgement:Receipt:Manage',
          color: 'var(--el-color-warning)'
        }
      )
    if (['acknowledged', 'waived'].includes(row.status))
      actions.push({
        key: 'reopen',
        label: '重新打开',
        icon: 'ri:restart-line',
        auth: 'Hr:PolicyAcknowledgement:Receipt:Manage'
      })
    return actions.length ? (
      <ArtButtonMore list={actions} onClick={(item) => void handleReceiptMore(item, row)} />
    ) : (
      <span class="text-xs text-[var(--art-gray-500)]">只读</span>
    )
  }

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchPolicyAcknowledgementRecords(activeEntity.value, {
      ...params,
      from,
      to,
      policyId: activeEntity.value === 'receipt' ? focusedPolicy.value?.id : undefined
    })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchPolicyAcknowledgementOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const refreshWorkspace = async (): Promise<void> => {
    await Promise.all([refreshOverview(), tableQueryRef.value?.refreshUpdate()])
  }
  const handleTabChange = (): void => {
    if (activeEntity.value !== 'receipt') focusedPolicy.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    tableTotal.value = 0
  }
  const focusReceipts = (row: Api.Hr.HrPolicyDocument): void => {
    focusedPolicy.value = row
    activeEntity.value = 'receipt'
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }
  const clearPolicyFocus = (): void => {
    focusedPolicy.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }
  const openDialog = (row?: Api.Hr.HrPolicyDocument): void => {
    void dialogRef.value?.handleOpen({ type: row ? 'edit' : 'add', editData: row })
  }
  const handleDialogSuccess = async (type: DialogType): Promise<void> => {
    if (type === 'add') await tableQueryRef.value?.refreshCreate()
    else await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }

  const handlePolicyMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.HrPolicyDocument
  ): Promise<void> => {
    if (item.key === 'edit') return openDialog(row)
    if (item.key === 'receipts') return focusReceipts(row)
    if (item.key === 'delete') return handleDelete(row)
    await handlePolicyTransition(row, String(item.key))
  }
  const handlePolicyTransition = async (
    row: Api.Hr.HrPolicyDocument,
    action: string
  ): Promise<void> => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'retire' || action === 'cancel') {
        comment = await promptText(
          action === 'retire'
            ? '请输入政策退役原因。退役不会删除历史签收与审计证据。'
            : '请输入取消草稿的原因，取消后不可再次发布。',
          action === 'retire' ? '退役政策' : '取消政策草稿',
          {
            confirmButtonText: '确认执行',
            cancelButtonText: '返回',
            placeholder: '请输入决策原因或依据',
            minLength: action === 'retire' ? 4 : 0,
            maxLength: 600,
            type: 'warning'
          }
        )
      } else {
        await confirmAction(
          `系统将按“${audienceLabel(row)}”实时生成员工送达清单；发布后该版本不可再编辑。确认继续？`,
          '发布政策版本',
          { confirmButtonText: '确认发布', cancelButtonText: '返回', type: 'info' }
        )
      }
      await transitionPolicyAcknowledgement('policy', row.id, action, comment)
      await refreshWorkspace()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '政策版本处理失败，请刷新范围与状态后重试')
    }
  }
  const handleReceiptMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.HrPolicyReceipt
  ): Promise<void> => {
    if (!row.id) return
    const action = String(item.key)
    const title =
      action === 'acknowledge'
        ? '确认员工签收'
        : action === 'waive'
          ? '豁免员工签收'
          : '重新打开签收'
    const description =
      action === 'acknowledge'
        ? '请输入签收确认说明；系统将记录执行人和完成时间。'
        : action === 'waive'
          ? '请输入正式豁免原因；豁免计入闭环，但与员工主动签收区分展示。'
          : '请输入重新打开原因；原完成状态将撤销并重新进入待签收。'
    try {
      const comment = await promptText(description, title, {
        confirmButtonText: '确认执行',
        cancelButtonText: '返回',
        placeholder: '请输入说明或业务依据',
        minLength: 4,
        maxLength: 600,
        type: action === 'waive' || action === 'reopen' ? 'warning' : 'info'
      })
      await transitionPolicyAcknowledgement('receipt', row.id, action, comment)
      await refreshWorkspace()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '政策签收处理失败，请刷新签收状态后重试')
    }
  }
  const handleDelete = async (row: Api.Hr.HrPolicyDocument): Promise<void> => {
    if (!row.id) return
    const label = `${row.policyTitle}（${row.policyCode} · v${row.versionNo}）`
    await deleteRecord({
      resource: { id: row.id, label },
      permission: 'Hr:PolicyAcknowledgement:Policy:Manage',
      confirmMessage: `确认删除政策草稿“${label}”？仅未发布且没有下游依赖的草稿可删除。`,
      remove: () => deletePolicyDocument(row.id!),
      onDeleted: refreshWorkspace
    })
  }

  onMounted(() => void refreshOverview())
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;
  @use '../../shared/hr-lifecycle-workspace' as lifecycle;

  .policy-page {
    @include hr-table-workspace-layout(420px);

    --policy-border: color-mix(in srgb, var(--art-card-border) 84%, transparent);

    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;

    &__command,
    &__workspace {
      flex: 0 0 auto;
      min-width: 0;
      padding: 18px;
      background: var(--art-bg-color);
      border: 1px solid var(--policy-border);
      border-radius: var(--art-surface-radius);
      box-shadow: 0 8px 28px rgb(37 42 62 / 3%);
    }

    &__command > header,
    &__workspace > header {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
    }

    &__command > header > div {
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 0;
    }

    &__command > header > div > span:last-child,
    &__workspace > header > div {
      display: grid;
      min-width: 0;
    }

    &__command-icon {
      @include lifecycle.command-icon;
    }

    &__command small,
    &__workspace small {
      font-size: 10px;
      font-weight: 700;
      color: var(--theme-color);
      letter-spacing: 0.12em;
    }

    &__command strong,
    &__workspace strong {
      margin-top: 2px;
      font-size: 16px;
      color: var(--el-text-color-primary);
    }

    &__lifecycle-scroll {
      min-width: 0;
      height: auto;
    }

    &__command em,
    &__workspace header span {
      @include lifecycle.supporting-text;
    }

    &__lifecycle {
      display: grid;
      grid-template-columns: repeat(5, minmax(200px, 1fr));
      gap: 1px;
      min-width: 1006px;
      padding: 0;
      margin: 18px 0 0;
      list-style: none;
      background: var(--policy-border);
      border: 1px solid var(--policy-border);
      border-radius: var(--art-surface-radius);
    }

    &__lifecycle li {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-width: 175px;
      padding: 12px;
      background: var(--art-bg-color);

      &.is-complete {
        background: color-mix(in srgb, var(--el-color-success) 5%, var(--art-bg-color));
      }

      &.is-current {
        background: color-mix(in srgb, var(--theme-color) 7%, var(--art-bg-color));
      }

      &.is-risk {
        background: color-mix(in srgb, var(--el-color-danger) 7%, var(--art-bg-color));
      }

      div {
        display: grid;
        min-width: 0;
      }

      strong {
        margin: 0;
        font-size: 12px;
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-secondary);
        letter-spacing: 0;
        white-space: nowrap;
      }

      b {
        grid-column: 2 / -1;
        font-size: 11px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
      }
    }

    &__stage-index {
      align-self: start;
      font-size: 9px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
    }

    &__stage-icon {
      @include lifecycle.stage-icon;
    }

    &__guardrails {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }

    &__guardrails article {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
      padding: 12px;
      background: var(--default-box-color);
      border: 1px solid var(--policy-border);
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 8%, transparent);
        border-radius: var(--art-surface-radius);
      }

      div {
        display: grid;
        min-width: 0;
      }

      small {
        color: var(--el-text-color-secondary);
        letter-spacing: 0;
      }

      strong {
        margin: 1px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        white-space: nowrap;
      }

      em {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        white-space: nowrap;
      }

      &.is-danger > span {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }

      &.is-success > span {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-restricted > span {
        color: var(--el-text-color-secondary);
        background: var(--art-gray-100);
      }
    }

    &__command > footer {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      padding-top: 12px;
      margin-top: 12px;
      font-size: 11px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--policy-border);

      svg {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--theme-color);
      }
    }

    &__workspace {
      padding-bottom: 14px;
    }

    &__workspace > header {
      margin-bottom: 12px;
    }

    &__result {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 6px;
      align-items: center;
      font-size: 11px !important;
      color: var(--el-text-color-secondary) !important;
    }

    &__focus {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      margin-top: 12px;
      background: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 15%, var(--policy-border));
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, transparent);
        border-radius: var(--art-surface-radius);
      }

      div {
        display: grid;
        min-width: 0;
        margin-right: auto;
      }

      small {
        letter-spacing: 0;
      }

      strong {
        margin: 0;
        font-size: 12px;
      }

      em {
        font-size: 10px;
      }
    }
  }

  @media only screen and (width <= 1200px) {
    .policy-page__guardrails {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media only screen and (width <= 767px) {
    .policy-page {
      &__command,
      &__workspace {
        padding: 14px;
      }

      &__command > header,
      &__workspace > header {
        align-items: flex-start;
      }

      &__command > header {
        flex-direction: column;
      }

      &__guardrails {
        grid-template-columns: 1fr;
      }

      &__focus {
        flex-wrap: wrap;
        align-items: flex-start;
      }

      &__focus .el-button {
        width: 100%;
      }
    }
  }
</style>
