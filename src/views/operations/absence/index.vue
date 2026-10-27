<template>
  <ArtPermissionGuard permission="Hr:Absence:View">
    <div class="absence-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="TIME OFF"
        title="假勤管理"
        description="统一假别、适用政策、员工休假余额与申请审批；余额变动使用不可变台账，批准结果可供考勤与薪资核算使用。"
        icon="ri:calendar-schedule-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableQueryRef" />
        </template>
      </BusinessWorkspaceHeader>

      <section class="absence-page__control-deck" aria-labelledby="absence-control-title">
        <header class="absence-page__control-heading">
          <span class="absence-page__control-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:calendar-check-line" />
          </span>
          <span>
            <strong id="absence-control-title">假勤权益闭环</strong>
            <small>政策定义、申请审批与余额台账使用同一业务口径</small>
          </span>
          <span class="absence-page__control-badge">
            <ArtSvgIcon icon="ri:lock-2-line" /> 原因与附件独立授权
          </span>
        </header>

        <div class="absence-page__journey" aria-label="假勤业务流程">
          <span><i>01</i><strong>权益政策</strong><small>假别 · 额度 · 适用范围</small></span>
          <ArtSvgIcon icon="ri:arrow-right-line" aria-hidden="true" />
          <span><i>02</i><strong>申请审批</strong><small>提交占用 · 审批核销</small></span>
          <ArtSvgIcon icon="ri:arrow-right-line" aria-hidden="true" />
          <span><i>03</i><strong>余额台账</strong><small>调整 · 使用 · 冲销留痕</small></span>
        </div>

        <HrEntityNavigation
          :model-value="activeEntity"
          :items="navigationItems"
          navigation-label="假勤管理分类"
          compact
          @update:model-value="selectEntity"
        />

        <footer class="absence-page__control-note">
          <ArtSvgIcon icon="ri:information-line" />
          员工余额只通过授予、使用、调整和冲销台账变化，不允许直接覆盖当前余额。
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
        :search-bar-props="{ span: 6, labelWidth: 78, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <AbsenceDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '../../shared/hr-entity-navigation.vue'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import {
    actLeaveRequest,
    deleteAbsenceRecord,
    fetchAbsenceOverview,
    fetchAbsenceRecords
  } from '@hr/api'
  import AbsenceDialog from './modules/absence-dialog.vue'

  defineOptions({ name: 'HrAbsence' })

  type Entity = Api.Hr.AbsenceEntity
  type EditableEntity = Exclude<Entity, 'ledger'>
  type RecordItem = Api.Hr.AbsenceRecord
  type TableParams = Api.Hr.AbsenceSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface AbsenceTab {
    entity: Entity
    label: string
    description: string
    emptyDescription: string
    icon: string
  }

  interface AbsenceDialogExpose {
    handleOpen: (entity: EditableEntity, row?: RecordItem) => Promise<void>
  }

  const tabs: AbsenceTab[] = [
    {
      entity: 'request',
      label: '休假申请',
      description: '申请、审批与撤销闭环',
      emptyDescription: '创建申请草稿，提交后占用余额，批准后转为实际使用。',
      icon: 'ri:file-user-line'
    },
    {
      entity: 'balance',
      label: '员工余额',
      description: '年度权益、占用与可用余额',
      emptyDescription: '余额会在员工首次提交申请或管理员调整时按生效政策初始化。',
      icon: 'ri:scales-3-line'
    },
    {
      entity: 'ledger',
      label: '余额台账',
      description: '每次权益变动的不可变记录',
      emptyDescription: '权益授予、申请占用、批准使用、释放和冲销都会写入台账。',
      icon: 'ri:book-open-line'
    },
    {
      entity: 'policy',
      label: '休假政策',
      description: '额度、结转及适用范围',
      emptyDescription: '按全员、组织、职级或员工建立带有效期的休假政策。',
      icon: 'ri:government-line'
    },
    {
      entity: 'type',
      label: '假别定义',
      description: '计量单位与展示口径',
      emptyDescription: '先维护年休假、病假、事假、调休等标准假别。',
      icon: 'ri:price-tag-3-line'
    }
  ]
  const navigationItems = computed<HrEntityNavigationItem[]>(() =>
    tabs.map((tab) => ({ ...tab, value: tab.entity }))
  )

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('request')
  const activeTab = computed(() => tabs.find((tab) => tab.entity === activeEntity.value) ?? tabs[0])
  const deleteTables: Record<Entity, string> = {
    request: 'hr_leave_request',
    balance: 'hr_leave_balance',
    ledger: 'hr_leave_ledger',
    policy: 'hr_leave_policy',
    type: 'hr_leave_type'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<AbsenceDialogExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.AbsenceSearchParams }>({
    searchQuery: {
      tenantId: '',
      status: '',
      keyword: '',
      balanceYear: dayjs().year()
    }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_leave_request: 'request',
      hr_leave_balance: 'balance',
      hr_leave_ledger: 'ledger',
      hr_leave_policy: 'policy',
      hr_leave_type: 'type'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      tableState.searchQuery.balanceYear = undefined
    }
  )
  const overview = reactive<Api.Hr.AbsenceOverview>({
    pendingCount: 0,
    upcomingCount: 0,
    coveredEmployeeCount: 0,
    activePolicyCount: 0,
    expiringBalanceCount: 0
  })
  const tableOverview = reactive({ total: 0, reasonAccess: false })

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '有效期政策', type: 'primary', effect: 'plain' },
    { label: '隐私字段授权', type: 'warning', effect: 'light' },
    { label: '不可变余额台账', type: 'success', effect: 'light' }
  ]

  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '待审批',
      value: overview.pendingCount,
      description: '待处理休假申请',
      icon: 'ri:hourglass-line',
      tone: overview.pendingCount ? 'warning' : 'info'
    },
    {
      label: '30 天内休假',
      value: overview.upcomingCount,
      description: '已批准的未来安排',
      icon: 'ri:calendar-event-line',
      tone: 'primary'
    },
    {
      label: '余额覆盖员工',
      value: overview.coveredEmployeeCount,
      description: '本年度已有权益账户',
      icon: 'ri:team-line',
      tone: 'success'
    },
    {
      label: '当前视图',
      value: tableOverview.total,
      description: activeTab.value.label,
      icon: 'ri:list-check-3',
      tone: 'info'
    }
  ])

  const statusDictionary = computed(() => {
    if (activeEntity.value === 'request') return 'hrLeaveRequestStatus'
    if (activeEntity.value === 'policy') return 'hrLeavePolicyStatus'
    if (activeEntity.value === 'ledger') return 'hrLeaveLedgerType'
    if (activeEntity.value === 'type') return 'commonStatus'
    return ''
  })

  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (isPlatformSuper.value)
      items.push({
        label: '租户',
        key: 'tenantId',
        type: 'select',
        options: tenantOptions.value,
        props: { clearable: true, filterable: true, placeholder: '全部租户' }
      })
    if (statusDictionary.value)
      items.push({
        label: '状态',
        key: 'status',
        type: 'select',
        options: getDictMap.value[statusDictionary.value] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      })
    if (activeEntity.value === 'balance' || activeEntity.value === 'ledger')
      items.push({
        label: '年度',
        key: 'balanceYear',
        type: 'input',
        props: { type: 'number', min: 2000, max: 2200, placeholder: '余额年度' }
      })
    items.push({
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: keywordPlaceholder.value }
    })
    return items
  })

  const keywordPlaceholder = computed(() => {
    const map: Record<Entity, string> = {
      request: '申请编号、员工或假别',
      balance: '员工或假别',
      ledger: '员工、假别或申请编号',
      policy: '政策编码、名称或假别',
      type: '假别编码或名称'
    }
    return map[activeEntity.value]
  })

  const formatAmount = (value: unknown, unit?: string): string => {
    const amount = Number(value ?? 0)
    return `${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} ${unit === 'hour' ? '小时' : '天'}`
  }

  const formatScope = (row: Api.Hr.LeavePolicy): string => {
    if (row.scopeType === 'all') return '全员'
    if (row.scopeType === 'organization') return row.scope?.organizationName ?? '指定组织'
    if (row.scopeType === 'employee') return row.scope?.employeeName ?? '指定员工'
    return row.scope?.gradeName ?? '指定职级'
  }

  const rowMoreActions = (status: string, canEdit: boolean): ButtonMoreItem[] => {
    const actions: ButtonMoreItem[] = []
    if (activeEntity.value === 'request' && status === 'draft')
      actions.push({
        key: 'submit',
        label: '提交请假申请',
        icon: 'ri:send-plane-line',
        auth: 'Hr:Absence:Submit'
      })
    if (activeEntity.value === 'request' && status === 'pending')
      actions.push(
        {
          key: 'approve',
          label: '批准请假申请',
          icon: 'ri:checkbox-circle-line',
          auth: 'Hr:Absence:Approve'
        },
        {
          key: 'reject',
          label: '驳回请假申请',
          icon: 'ri:close-circle-line',
          color: 'var(--el-color-danger)',
          auth: 'Hr:Absence:Approve'
        }
      )
    if (activeEntity.value === 'request' && ['pending', 'approved'].includes(status))
      actions.push({
        key: 'cancel',
        label: '撤销请假申请',
        icon: 'ri:arrow-go-back-line',
        auth: 'Hr:Absence:Submit'
      })
    if (canEdit)
      actions.push({
        key: 'delete',
        label: activeEntity.value === 'request' ? '删除请假申请' : '删除假别配置',
        icon: 'ri:delete-bin-5-line',
        color: 'var(--el-color-danger)',
        auth:
          activeEntity.value === 'request'
            ? 'Hr:Absence:Request:Delete'
            : 'Hr:Absence:Policy:Delete'
      })
    return actions
  }

  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'action',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => {
      if (activeEntity.value === 'ledger')
        return <span class="text-xs text-[var(--el-text-color-secondary)]">不可变</span>
      if (activeEntity.value === 'balance')
        return (
          <ArtButtonTable
            type="edit"
            label="调整假期余额"
            permission="Hr:Absence:Balance:Adjust"
            onClick={() => openDialog('balance', row)}
          />
        )

      const status = 'status' in row ? String(row.status ?? '') : ''
      const canEdit = activeEntity.value !== 'request' || status === 'draft'
      return (
        <BusinessTableRowActions>
          {canEdit ? (
            <ArtButtonTable
              type="edit"
              permission={
                activeEntity.value === 'request'
                  ? 'Hr:Absence:Request:Edit'
                  : 'Hr:Absence:Policy:Edit'
              }
              onClick={() => openDialog(activeEntity.value as EditableEntity, row)}
            />
          ) : null}
          <ArtButtonMore
            list={() => rowMoreActions(status, canEdit)}
            onClick={(item: ButtonMoreItem) => void handleMoreAction(item, row)}
          />
        </BusinessTableRowActions>
      )
    }
  })

  const handleMoreAction = async (item: ButtonMoreItem, row: RecordItem): Promise<void> => {
    if (item.key === 'delete') return await handleDelete(row)
    if (item.key === 'submit') return await handleRequestAction(row, 'submit')
    if (item.key === 'approve') return await handleRequestAction(row, 'approve')
    if (item.key === 'reject') return await handleRequestAction(row, 'reject')
    if (item.key === 'cancel') return await handleRequestAction(row, 'cancel')
  }

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'type')
      return [
        { prop: 'leaveCode', label: '假别编码', width: 150 },
        { prop: 'leaveName', label: '假别名称', minWidth: 150 },
        {
          prop: 'category',
          label: '类别',
          width: 110,
          formatter: (row) => (
            <ArtDictDisplay
              dictCode="hrLeaveCategory"
              value={String((row as Api.Hr.LeaveType).category)}
              display="tag"
            />
          )
        },
        {
          prop: 'unit',
          label: '单位',
          width: 90,
          formatter: (row) => (
            <ArtDictDisplay dictCode="hrLeaveUnit" value={String((row as Api.Hr.LeaveType).unit)} />
          )
        },
        {
          prop: 'paidRatio',
          label: '带薪比例',
          width: 110,
          formatter: (row) => `${(Number((row as Api.Hr.LeaveType).paidRatio) * 100).toFixed(0)}%`
        },
        { prop: 'minimumIncrement', label: '最小单位', width: 100 },
        { prop: 'policyCount', label: '政策数', width: 90 },
        {
          prop: 'enabled',
          label: '状态',
          width: 90,
          formatter: (row) => (
            <ElTag type={(row as Api.Hr.LeaveType).enabled ? 'success' : 'info'} effect="light">
              {(row as Api.Hr.LeaveType).enabled ? '启用' : '停用'}
            </ElTag>
          )
        },
        actionColumn()
      ]

    if (activeEntity.value === 'policy')
      return [
        { prop: 'policyCode', label: '政策编码', width: 150 },
        { prop: 'policyName', label: '政策名称', minWidth: 170 },
        { prop: 'leaveType.leaveName', label: '假别', width: 120 },
        {
          prop: 'scopeType',
          label: '适用范围',
          minWidth: 150,
          formatter: (row) => formatScope(row as Api.Hr.LeavePolicy)
        },
        {
          prop: 'entitlementMethod',
          label: '权益方式',
          width: 130,
          formatter: (row) => (
            <ArtDictDisplay
              dictCode="hrLeaveEntitlementMethod"
              value={String((row as Api.Hr.LeavePolicy).entitlementMethod)}
              display="tag"
            />
          )
        },
        { prop: 'annualQuota', label: '年度额度', width: 110, align: 'right' },
        { prop: 'monthlyAccrual', label: '每月累积', width: 110, align: 'right' },
        { prop: 'effectiveFrom', label: '生效日期', width: 120 },
        {
          prop: 'effectiveTo',
          label: '失效日期',
          width: 120,
          formatter: (row) => (row as Api.Hr.LeavePolicy).effectiveTo ?? '长期'
        },
        {
          prop: 'status',
          label: '状态',
          width: 100,
          formatter: (row) => (
            <ArtDictDisplay
              dictCode="hrLeavePolicyStatus"
              value={String((row as Api.Hr.LeavePolicy).status)}
              display="tag"
            />
          )
        },
        actionColumn()
      ]

    if (activeEntity.value === 'balance')
      return [
        { prop: 'employee.employeeNo', label: '员工编号', width: 140 },
        { prop: 'employee.employeeName', label: '员工姓名', minWidth: 120 },
        { prop: 'organization.organizationName', label: '当前组织', minWidth: 150 },
        { prop: 'leaveType.leaveName', label: '假别', width: 120 },
        { prop: 'balanceYear', label: '年度', width: 90 },
        {
          prop: 'availableAmount',
          label: '可用',
          width: 120,
          align: 'right',
          formatter: (row) =>
            formatAmount(
              (row as Api.Hr.LeaveBalance).availableAmount,
              (row as Api.Hr.LeaveBalance).leaveType?.unit
            )
        },
        {
          prop: 'pendingAmount',
          label: '审批占用',
          width: 120,
          align: 'right',
          formatter: (row) =>
            formatAmount(
              (row as Api.Hr.LeaveBalance).pendingAmount,
              (row as Api.Hr.LeaveBalance).leaveType?.unit
            )
        },
        {
          prop: 'usedAmount',
          label: '已使用',
          width: 120,
          align: 'right',
          formatter: (row) =>
            formatAmount(
              (row as Api.Hr.LeaveBalance).usedAmount,
              (row as Api.Hr.LeaveBalance).leaveType?.unit
            )
        },
        {
          prop: 'expiresOn',
          label: '到期日期',
          width: 120,
          formatter: (row) => (row as Api.Hr.LeaveBalance).expiresOn ?? '—'
        },
        actionColumn()
      ]

    if (activeEntity.value === 'ledger')
      return [
        { prop: 'occurredOn', label: '发生日期', width: 120 },
        { prop: 'employee.employeeNo', label: '员工编号', width: 140 },
        { prop: 'employee.employeeName', label: '员工姓名', minWidth: 120 },
        { prop: 'leaveType.leaveName', label: '假别', width: 120 },
        {
          prop: 'transactionType',
          label: '台账类型',
          width: 120,
          formatter: (row) => (
            <ArtDictDisplay
              dictCode="hrLeaveLedgerType"
              value={String((row as Api.Hr.LeaveLedger).transactionType)}
              display="tag"
            />
          )
        },
        {
          prop: 'request.requestNo',
          label: '关联申请',
          width: 170,
          formatter: (row) => (row as Api.Hr.LeaveLedger).request?.requestNo ?? '—'
        },
        {
          prop: 'change',
          label: '变动',
          width: 120,
          align: 'right',
          formatter: (row) => formatLedgerDelta(row as Api.Hr.LeaveLedger)
        },
        { prop: 'reason', label: '业务原因', minWidth: 240, showOverflowTooltip: true },
        actionColumn()
      ]

    return [
      { prop: 'requestNo', label: '申请编号', width: 180 },
      { prop: 'employee.employeeNo', label: '员工编号', width: 140 },
      { prop: 'employee.employeeName', label: '员工姓名', minWidth: 120 },
      { prop: 'organization.organizationName', label: '当前组织', minWidth: 150 },
      { prop: 'leaveType.leaveName', label: '假别', width: 120 },
      { prop: 'startDate', label: '开始日期', width: 120 },
      { prop: 'endDate', label: '结束日期', width: 120 },
      {
        prop: 'requestedAmount',
        label: '申请数量',
        width: 120,
        align: 'right',
        formatter: (row) =>
          formatAmount(
            (row as Api.Hr.LeaveRequest).requestedAmount,
            (row as Api.Hr.LeaveRequest).unitSnapshot
          )
      },
      {
        prop: 'reason',
        label: '申请原因',
        minWidth: 180,
        showOverflowTooltip: true,
        formatter: (row) => (row as Api.Hr.LeaveRequest).reason || '—'
      },
      {
        prop: 'status',
        label: '状态',
        width: 100,
        formatter: (row) => (
          <ArtDictDisplay
            dictCode="hrLeaveRequestStatus"
            value={String((row as Api.Hr.LeaveRequest).status)}
            display="tag"
          />
        )
      },
      actionColumn()
    ]
  }

  const formatLedgerDelta = (row: Api.Hr.LeaveLedger): string => {
    const value =
      Number(row.deltaOpening) +
      Number(row.deltaAccrued) +
      Number(row.deltaAdjusted) -
      Number(row.deltaPending) -
      Number(row.deltaUsed) -
      Number(row.deltaExpired)
    const unit = row.leaveType?.unit === 'hour' ? '小时' : '天'
    return `${value > 0 ? '+' : ''}${value.toFixed(2)} ${unit}`
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => {
    if (activeEntity.value === 'ledger') return []
    if (activeEntity.value === 'balance')
      return [
        {
          type: 'add',
          label: '调整休假余额',
          permission: 'Hr:Absence:Balance:Adjust',
          onClick: () => openDialog('balance')
        }
      ]
    return [
      {
        type: 'add',
        label: activeEntity.value === 'request' ? '新增休假申请' : `新增${activeTab.value.label}`,
        permission:
          activeEntity.value === 'request' ? 'Hr:Absence:Request:Add' : 'Hr:Absence:Policy:Add',
        onClick: () => openDialog(activeEntity.value as EditableEntity)
      }
    ]
  })

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchAbsenceRecords(activeEntity.value, { ...params, from, to })
  }

  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableOverview.total = response.total ?? 0
    tableOverview.reasonAccess = Boolean('reasonAccess' in response && response.reasonAccess)
  }

  const refreshOverview = async (): Promise<void> => {
    const response = await fetchAbsenceOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }

  const openDialog = (entity: EditableEntity, row?: RecordItem): void =>
    void dialogRef.value?.handleOpen(entity, row)

  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void refreshOverview()
  }

  const handleDelete = async (row: RecordItem): Promise<void> => {
    if (!row.id || !['type', 'policy', 'request'].includes(activeEntity.value)) return
    const entity = activeEntity.value as 'type' | 'policy' | 'request'
    const label =
      entity === 'type'
        ? `${(row as Api.Hr.LeaveType).leaveName}（${(row as Api.Hr.LeaveType).leaveCode}）`
        : entity === 'policy'
          ? `${(row as Api.Hr.LeavePolicy).policyName}（${(row as Api.Hr.LeavePolicy).policyCode}）`
          : ((row as Api.Hr.LeaveRequest).requestNo ??
            `${(row as Api.Hr.LeaveRequest).employee?.employeeName ?? '员工'} · ${(row as Api.Hr.LeaveRequest).startDate}`)
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: entity === 'request' ? 'Hr:Absence:Request:Delete' : 'Hr:Absence:Policy:Delete',
      remove: () => deleteAbsenceRecord(entity, row.id!),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
        await refreshOverview()
      }
    })
  }

  const handleRequestAction = async (
    row: RecordItem,
    action: 'submit' | 'approve' | 'reject' | 'cancel'
  ): Promise<void> => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'reject')
        comment = await promptText('请输入驳回原因，申请人可在记录中查看。', '驳回休假申请', {
          confirmButtonText: '确认驳回',
          cancelButtonText: '取消',
          placeholder: '请输入具体原因',
          minLength: 2,
          maxLength: 300,
          type: 'warning'
        })
      else {
        const messageMap = {
          submit: '提交后将占用对应年度休假余额，是否继续？',
          approve: '批准后占用余额将转为实际使用，并写入不可变台账，是否继续？',
          cancel: '撤销将释放占用或冲销未开始的已批准休假，是否继续？'
        } as const
        await confirmAction(
          messageMap[action],
          `${action === 'submit' ? '提交' : action === 'approve' ? '批准' : '撤销'}休假申请`,
          {
            confirmButtonText: action === 'approve' ? '确认批准' : '继续',
            cancelButtonText: '返回',
            type: action === 'cancel' ? 'warning' : 'info'
          }
        )
      }
      await actLeaveRequest(row.id, action, comment)
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '休假申请处理失败，请刷新申请状态后重试')
    }
  }

  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, {
      keyword: '',
      status: '',
      balanceYear: dayjs().year()
    })
    Object.assign(tableOverview, { total: 0, reasonAccess: false })
  }
  const selectEntity = (value: string): void => {
    if (activeEntity.value === value) return
    activeEntity.value = value as Entity
    handleTabChange()
  }

  onMounted(async () => {
    await Promise.all([
      userStore.ensureDictLoaded('hrLeaveCategory'),
      userStore.ensureDictLoaded('hrLeaveUnit'),
      userStore.ensureDictLoaded('hrLeaveEntitlementMethod'),
      userStore.ensureDictLoaded('hrLeavePolicyScope'),
      userStore.ensureDictLoaded('hrLeavePolicyStatus'),
      userStore.ensureDictLoaded('hrLeaveRequestStatus'),
      userStore.ensureDictLoaded('hrLeaveSession'),
      userStore.ensureDictLoaded('hrLeaveLedgerType')
    ])
    if (isPlatformSuper.value) {
      const response = await fetchEnabledTenantList()
      tenantOptions.value = (response.data ?? []).map((tenant) => ({
        label: `${tenant.tenantName}（${tenant.tenantCode}）`,
        value: tenant.id!
      }))
    }
    await refreshOverview()
  })
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .absence-page {
    @include hr-table-workspace-layout(360px);

    &__control-deck {
      display: grid;
      gap: 12px;
      min-width: 0;
      padding: 16px;
      background:
        radial-gradient(
          circle at 96% 0,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 28%
        ),
        var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--theme-color) 11%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
      box-shadow: 0 8px 26px color-mix(in srgb, var(--art-gray-900) 4%, transparent);
    }

    &__control-heading {
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr) auto;
      gap: 11px;
      align-items: center;
      min-width: 0;

      > span:nth-child(2) {
        display: grid;
        min-width: 0;
      }

      strong {
        font-size: 15px;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 3px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__control-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 38px;
      height: 38px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--art-surface-radius);
    }

    &__control-badge {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      font-size: 11px;
      color: var(--el-color-warning-dark-2);
      white-space: nowrap;
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-7);
      border-radius: 999px;

      svg {
        width: 14px;
      }
    }

    &__journey {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr) 24px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-width: 0;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--theme-color) 3%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      > svg {
        flex: 0 0 auto;
        justify-self: center;
        color: color-mix(in srgb, var(--theme-color) 58%, var(--el-text-color-secondary));
      }

      > span {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        gap: 2px 9px;
        align-items: center;
        min-width: 0;
      }

      i {
        display: grid;
        grid-row: 1 / 3;
        place-items: center;
        width: 24px;
        height: 24px;
        font-size: 9px;
        font-style: normal;
        font-weight: 700;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, transparent);
        border-radius: 50%;
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
    }

    &__control-note {
      display: flex;
      gap: 6px;
      align-items: flex-start;
      padding-top: 10px;
      font-size: 11px;
      line-height: 1.5;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--art-card-border);

      svg {
        flex: 0 0 auto;
        width: 14px;
        margin-top: 1px;
        color: var(--theme-color);
      }
    }

    &__actions {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 2px;
      align-items: center;
    }
  }

  @media only screen and (width <= 1100px) {
    .absence-page {
      &__journey {
        grid-template-columns: 1fr;

        > svg {
          display: none;
        }
      }
    }
  }

  @media only screen and (width <= 768px) {
    .absence-page {
      gap: 10px;

      &__control-deck {
        padding: 12px;
      }

      &__control-heading {
        grid-template-columns: 38px minmax(0, 1fr);
      }

      &__control-badge {
        grid-column: 1 / -1;
        justify-self: start;
      }
    }
  }
</style>
