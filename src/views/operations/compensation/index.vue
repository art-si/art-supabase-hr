<template>
  <ArtPermissionGuard permission="Hr:Compensation:View">
    <div class="compensation-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="TOTAL REWARDS"
        title="薪酬管理"
        description="统一薪酬项目、薪酬方案、职级薪档与员工有效期薪酬；已批准结果作为财务薪资核算的受控输入。"
        icon="ri:money-cny-circle-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableQueryRef" />
        </template>
      </BusinessWorkspaceHeader>

      <section class="compensation-page__control-deck" aria-labelledby="compensation-control-title">
        <header class="compensation-page__control-heading">
          <span class="compensation-page__control-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:funds-box-line" />
          </span>
          <span>
            <strong id="compensation-control-title">薪酬政策与核算边界</strong>
            <small>HR 维护有效期薪酬事实，FMS 负责期间计算、计提审批与发放</small>
          </span>
          <span class="compensation-page__control-badge">
            <ArtSvgIcon icon="ri:shield-keyhole-line" /> 敏感金额授权
          </span>
        </header>

        <div class="compensation-page__responsibility" aria-label="薪酬职责边界">
          <article>
            <span><ArtSvgIcon icon="ri:shield-check-line" /></span>
            <div><strong>HR 政策层</strong><small>定薪、调薪、薪档与生效历史</small></div>
          </article>
          <ArtSvgIcon icon="ri:arrow-right-line" aria-hidden="true" />
          <article>
            <span><ArtSvgIcon icon="ri:calculator-line" /></span>
            <div><strong>FMS 核算层</strong><small>当期计算、审批计提与实际发放</small></div>
          </article>
          <p>审批后记录锁定并保留历史，核算系统只消费已生效数据。</p>
        </div>

        <HrEntityNavigation
          :model-value="activeEntity"
          :items="navigationItems"
          navigation-label="薪酬管理分类"
          compact
          @update:model-value="selectEntity"
        />
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

      <CompensationDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatNumberValue } from '@/utils/ui/format'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
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
    actCompensationRecord,
    deleteCompensationRecord,
    fetchCompensationOverview,
    fetchCompensationRecords
  } from '@hr/api'
  import CompensationDialog from './modules/compensation-dialog.vue'

  defineOptions({ name: 'HrCompensation' })

  type Entity = Api.Hr.CompensationEntity
  type RecordItem = Api.Hr.CompensationRecord
  type TableParams = Api.Hr.CompensationSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface CompensationTab {
    entity: Entity
    label: string
    description: string
    emptyDescription: string
    icon: string
  }

  interface CompensationDialogExpose {
    handleOpen: (entity: Entity, row?: RecordItem) => Promise<void>
  }

  const tabs: CompensationTab[] = [
    {
      entity: 'employee',
      label: '员工薪酬',
      description: '有效期化的定薪与调薪历史',
      emptyDescription: '创建员工薪酬草稿并批准后，才会进入财务核算输入。',
      icon: 'ri:user-star-line'
    },
    {
      entity: 'band',
      label: '薪级范围',
      description: '职级对应的薪档政策区间',
      emptyDescription: '按职级建立薪档上下限与中值，支持版本化生效。',
      icon: 'ri:bar-chart-box-line'
    },
    {
      entity: 'plan',
      label: '薪酬方案',
      description: '岗位群复用的薪酬构成模板',
      emptyDescription: '建立月薪、年薪或时薪方案，并配置收入与扣减项目。',
      icon: 'ri:file-list-3-line'
    },
    {
      entity: 'component',
      label: '薪酬项目',
      description: '收入、扣减与企业成本口径',
      emptyDescription: '新增补贴、扣减、社保公积金等标准薪酬项目。',
      icon: 'ri:funds-box-line'
    }
  ]
  const navigationItems = computed<HrEntityNavigationItem[]>(() =>
    tabs.map((tab) => ({ ...tab, value: tab.entity }))
  )

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('employee')
  const activeTab = computed(() => tabs.find((tab) => tab.entity === activeEntity.value) ?? tabs[0])
  const deleteTables: Record<Entity, string> = {
    employee: 'hr_employee_compensation',
    band: 'hr_salary_band',
    plan: 'hr_compensation_plan',
    component: 'hr_pay_component'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<CompensationDialogExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.CompensationSearchParams }>({
    searchQuery: { tenantId: '', status: '', keyword: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_employee_compensation: 'employee',
      hr_salary_band: 'band',
      hr_compensation_plan: 'plan',
      hr_pay_component: 'component'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const overview = reactive<Api.Hr.CompensationOverview>({
    employeeCount: 0,
    coveredCount: 0,
    coverageRate: 0,
    scheduledCount: 0,
    enabledPlanCount: 0,
    enabledComponentCount: 0
  })
  const tableOverview = reactive({ total: 0, amountAccess: false })

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '有效期管理', type: 'primary', effect: 'plain' },
    { label: '敏感金额授权', type: 'warning', effect: 'light' },
    { label: '衔接 FMS 核算', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '薪酬覆盖',
      value: `${overview.coverageRate}%`,
      description: `${overview.coveredCount} / ${overview.employeeCount} 名在册员工`,
      icon: 'ri:pie-chart-2-line',
      tone: overview.coverageRate >= 95 ? 'success' : 'warning'
    },
    {
      label: '待生效调薪',
      value: overview.scheduledCount,
      description: '已批准的未来记录',
      icon: 'ri:calendar-event-line',
      tone: overview.scheduledCount ? 'warning' : 'info'
    },
    {
      label: '启用方案',
      value: overview.enabledPlanCount,
      description: `${overview.enabledComponentCount} 个启用薪酬项目`,
      icon: 'ri:file-list-3-line'
    },
    {
      label: '当前视图',
      value: tableOverview.total,
      description: activeTab.value.label,
      icon: activeTab.value.icon,
      tone: 'info'
    }
  ])

  const lifecycleStatusOptions = computed(
    () => getDictMap.value.hrCompensationLifecycleStatus ?? []
  )
  const enabledStatusOptions = useDictionaryOptions('commonEnabledStatus')
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '所属租户',
      key: 'tenantId',
      type: 'select',
      hidden: !isPlatformSuper.value,
      props: { options: tenantOptions.value, clearable: true, filterable: true }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        options:
          activeEntity.value === 'component' || activeEntity.value === 'plan'
            ? enabledStatusOptions
            : lifecycleStatusOptions.value,
        clearable: true
      }
    },
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder:
          activeEntity.value === 'employee'
            ? '员工编号、姓名或方案'
            : `${activeTab.value.label}编码或名称`
      }
    }
  ])

  const formatAmount = (value: Api.Hr.ProtectedAmount, currency = 'CNY'): string => {
    if (value === '***') return '••••••'
    const amount = Number(value)
    if (!Number.isFinite(amount)) return '—'
    return formatNumberValue(amount, 'zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2
    })
  }

  const tenantColumn = (): ColumnOption<RecordItem>[] =>
    isPlatformSuper.value
      ? [
          {
            prop: 'tenant.tenantName',
            label: '所属租户',
            minWidth: 160,
            showOverflowTooltip: true
          }
        ]
      : []

  const lifecycleColumn = (): ColumnOption<RecordItem> => ({
    prop: 'lifecycleStatus',
    label: '状态',
    width: 100,
    formatter: (row) => (
      <ArtDictDisplay
        dictCode="hrCompensationLifecycleStatus"
        value={String(
          (row as Api.Hr.EmployeeCompensation | Api.Hr.SalaryBand).lifecycleStatus ?? ''
        )}
        display="tag"
      />
    )
  })

  const canEditRow = (row: RecordItem): boolean => {
    if (activeEntity.value === 'component') return true
    if (activeEntity.value === 'plan')
      return Number((row as Api.Hr.CompensationPlan).employeeCount ?? 0) === 0
    return (row as Api.Hr.EmployeeCompensation | Api.Hr.SalaryBand).lifecycleStatus === 'draft'
  }

  const canDeleteRow = (row: RecordItem): boolean =>
    activeEntity.value === 'component' ||
    (activeEntity.value === 'plan' &&
      Number((row as Api.Hr.CompensationPlan).employeeCount ?? 0) === 0) ||
    (row as Api.Hr.EmployeeCompensation | Api.Hr.SalaryBand).lifecycleStatus === 'draft'

  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'operation',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => {
      const lifecycle = (row as Api.Hr.EmployeeCompensation | Api.Hr.SalaryBand).lifecycleStatus
      const editPermission =
        activeEntity.value === 'employee'
          ? 'Hr:Compensation:Record:Edit'
          : 'Hr:Compensation:Policy:Edit'
      const deletePermission =
        activeEntity.value === 'employee'
          ? 'Hr:Compensation:Record:Delete'
          : 'Hr:Compensation:Policy:Delete'
      return (
        <BusinessTableRowActions>
          {canEditRow(row) && (
            <ArtButtonTable
              type="edit"
              permission={editPermission}
              onClick={() => openDialog(row)}
            />
          )}
          <ArtButtonMore
            list={() => {
              const actions: ButtonMoreItem[] = []
              if (
                (activeEntity.value === 'employee' || activeEntity.value === 'band') &&
                lifecycle === 'draft'
              )
                actions.push({
                  key: 'approve',
                  label: '批准薪酬版本',
                  icon: 'ri:checkbox-circle-line',
                  auth: 'Hr:Compensation:Approve'
                })
              if (
                (activeEntity.value === 'employee' || activeEntity.value === 'band') &&
                lifecycle === 'scheduled'
              )
                actions.push({
                  key: 'cancel',
                  label: '取消薪酬版本',
                  icon: 'ri:close-circle-line',
                  color: 'var(--el-color-danger)',
                  auth: 'Hr:Compensation:Approve'
                })
              if (activeEntity.value === 'employee' && lifecycle === 'active')
                actions.push({
                  key: 'end',
                  label: '终止当前薪酬',
                  icon: 'ri:stop-circle-line',
                  auth: 'Hr:Compensation:Approve'
                })
              if (canDeleteRow(row))
                actions.push({
                  key: 'delete',
                  label: '删除薪酬记录',
                  icon: 'ri:delete-bin-5-line',
                  color: 'var(--el-color-danger)',
                  auth: deletePermission
                })
              return actions
            }}
            onClick={(item: ButtonMoreItem) => {
              if (item.key === 'approve') void handleAction(row, 'approve')
              if (item.key === 'cancel') void handleAction(row, 'cancel')
              if (item.key === 'end') void handleEnd(row)
              if (item.key === 'delete') void handleDelete(row)
            }}
          />
        </BusinessTableRowActions>
      )
    }
  })

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'component')
      return [
        ...tenantColumn(),
        { prop: 'componentCode', label: '项目编码', minWidth: 150, showOverflowTooltip: true },
        { prop: 'componentName', label: '薪酬项目', minWidth: 180, showOverflowTooltip: true },
        {
          prop: 'category',
          label: '类别',
          width: 110,
          formatter: (row) => (
            <ArtDictDisplay
              dictCode="hrCompensationComponentCategory"
              value={String((row as Api.Hr.PayComponent).category)}
              display="tag"
            />
          )
        },
        {
          prop: 'amountType',
          label: '计值方式',
          width: 120,
          formatter: (row) => (
            <ArtDictDisplay
              dictCode="hrCompensationAmountType"
              value={String((row as Api.Hr.PayComponent).amountType)}
              display="auto"
            />
          )
        },
        {
          prop: 'planCount',
          label: '关联方案',
          width: 100,
          align: 'right',
          formatter: (row) => `${(row as Api.Hr.PayComponent).planCount ?? 0} 个`
        },
        {
          prop: 'enabled',
          label: '状态',
          width: 90,
          formatter: (row) => (
            <ElTag type={(row as Api.Hr.PayComponent).enabled ? 'success' : 'info'} effect="plain">
              {(row as Api.Hr.PayComponent).enabled ? '启用' : '停用'}
            </ElTag>
          )
        },
        actionColumn()
      ]
    if (activeEntity.value === 'plan')
      return [
        ...tenantColumn(),
        { prop: 'planCode', label: '方案编码', minWidth: 150, showOverflowTooltip: true },
        { prop: 'planName', label: '薪酬方案', minWidth: 200, showOverflowTooltip: true },
        {
          prop: 'payFrequency',
          label: '发薪频率',
          width: 110,
          formatter: (row) => (
            <ArtDictDisplay
              dictCode="hrPayFrequency"
              value={String((row as Api.Hr.CompensationPlan).payFrequency)}
              display="tag"
            />
          )
        },
        { prop: 'currencyCode', label: '币种', width: 80 },
        {
          prop: 'componentCount',
          label: '薪酬项目',
          width: 110,
          align: 'right',
          formatter: (row) => `${(row as Api.Hr.CompensationPlan).componentCount ?? 0} 项`
        },
        {
          prop: 'employeeCount',
          label: '员工引用',
          width: 110,
          align: 'right',
          formatter: (row) => `${(row as Api.Hr.CompensationPlan).employeeCount ?? 0} 人`
        },
        {
          prop: 'enabled',
          label: '状态',
          width: 90,
          formatter: (row) => (
            <ElTag
              type={(row as Api.Hr.CompensationPlan).enabled ? 'success' : 'info'}
              effect="plain"
            >
              {(row as Api.Hr.CompensationPlan).enabled ? '启用' : '停用'}
            </ElTag>
          )
        },
        actionColumn()
      ]
    if (activeEntity.value === 'band')
      return [
        ...tenantColumn(),
        { prop: 'grade.gradeCode', label: '职级编码', minWidth: 130, showOverflowTooltip: true },
        { prop: 'grade.gradeName', label: '职级', minWidth: 150, showOverflowTooltip: true },
        {
          prop: 'minimumAmount',
          label: '薪档下限',
          minWidth: 140,
          align: 'right',
          formatter: (row) =>
            formatAmount(
              (row as Api.Hr.SalaryBand).minimumAmount,
              (row as Api.Hr.SalaryBand).currencyCode
            )
        },
        {
          prop: 'midpointAmount',
          label: '薪档中值',
          minWidth: 140,
          align: 'right',
          formatter: (row) =>
            formatAmount(
              (row as Api.Hr.SalaryBand).midpointAmount,
              (row as Api.Hr.SalaryBand).currencyCode
            )
        },
        {
          prop: 'maximumAmount',
          label: '薪档上限',
          minWidth: 140,
          align: 'right',
          formatter: (row) =>
            formatAmount(
              (row as Api.Hr.SalaryBand).maximumAmount,
              (row as Api.Hr.SalaryBand).currencyCode
            )
        },
        { prop: 'effectiveFrom', label: '生效日期', width: 120 },
        {
          prop: 'effectiveTo',
          label: '失效日期',
          width: 120,
          formatter: (row) => (row as Api.Hr.SalaryBand).effectiveTo ?? '长期'
        },
        lifecycleColumn(),
        actionColumn()
      ]
    return [
      ...tenantColumn(),
      { prop: 'employee.employeeNo', label: '员工编号', minWidth: 130, showOverflowTooltip: true },
      {
        prop: 'employee.employeeName',
        label: '员工姓名',
        minWidth: 130,
        showOverflowTooltip: true
      },
      {
        prop: 'organization.organizationName',
        label: '当前组织',
        minWidth: 160,
        showOverflowTooltip: true,
        formatter: (row) =>
          (row as Api.Hr.EmployeeCompensation).organization?.organizationName ?? '—'
      },
      { prop: 'plan.planName', label: '薪酬方案', minWidth: 160, showOverflowTooltip: true },
      {
        prop: 'grade.gradeName',
        label: '职级',
        minWidth: 110,
        showOverflowTooltip: true,
        formatter: (row) => (row as Api.Hr.EmployeeCompensation).grade?.gradeName ?? '—'
      },
      {
        prop: 'baseAmount',
        label: '基本工资',
        minWidth: 150,
        align: 'right',
        formatter: (row) =>
          formatAmount(
            (row as Api.Hr.EmployeeCompensation).baseAmount,
            (row as Api.Hr.EmployeeCompensation).currencyCode
          )
      },
      {
        prop: 'rangeStatus',
        label: '薪档位置',
        width: 110,
        formatter: (row) => (
          <ArtDictDisplay
            dictCode="hrCompensationRangeStatus"
            value={String((row as Api.Hr.EmployeeCompensation).rangeStatus ?? '')}
            display="tag"
          />
        )
      },
      { prop: 'effectiveFrom', label: '生效日期', width: 120 },
      {
        prop: 'effectiveTo',
        label: '失效日期',
        width: 120,
        formatter: (row) => (row as Api.Hr.EmployeeCompensation).effectiveTo ?? '长期'
      },
      lifecycleColumn(),
      actionColumn()
    ]
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${activeTab.value.label}`,
      permission:
        activeEntity.value === 'employee'
          ? 'Hr:Compensation:Record:Add'
          : 'Hr:Compensation:Policy:Add',
      onClick: () => openDialog()
    }
  ])

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchCompensationRecords(activeEntity.value, { ...params, from, to })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableOverview.total = response.total ?? 0
    tableOverview.amountAccess = Boolean(
      'amountAccess' in response && (response as { amountAccess?: boolean }).amountAccess
    )
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchCompensationOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const openDialog = (row?: RecordItem): void =>
    void dialogRef.value?.handleOpen(activeEntity.value, row)
  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void refreshOverview()
  }
  const handleDelete = async (row: RecordItem): Promise<void> => {
    if (!row.id) return
    const entity = activeEntity.value
    const label =
      entity === 'plan'
        ? `${(row as Api.Hr.CompensationPlan).planName}（${(row as Api.Hr.CompensationPlan).planCode}）`
        : entity === 'component'
          ? `${(row as Api.Hr.PayComponent).componentName}（${(row as Api.Hr.PayComponent).componentCode}）`
          : entity === 'band'
            ? `${(row as Api.Hr.SalaryBand).grade?.gradeName ?? '职级薪档'} · ${(row as Api.Hr.SalaryBand).effectiveFrom}`
            : `${(row as Api.Hr.EmployeeCompensation).employee?.employeeName ?? '员工'} · ${(row as Api.Hr.EmployeeCompensation).effectiveFrom}`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission:
        entity === 'employee' ? 'Hr:Compensation:Record:Delete' : 'Hr:Compensation:Policy:Delete',
      remove: () => deleteCompensationRecord(entity, row.id!),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
        await refreshOverview()
      }
    })
  }
  const handleAction = async (row: RecordItem, action: 'approve' | 'cancel'): Promise<void> => {
    if (!row.id || (activeEntity.value !== 'employee' && activeEntity.value !== 'band')) return
    const verb = action === 'approve' ? '批准' : '取消'
    try {
      await confirmAction(
        action === 'approve'
          ? `批准后将按 ${String((row as Api.Hr.EmployeeCompensation | Api.Hr.SalaryBand).effectiveFrom)} 生效并锁定历史，是否继续？`
          : '取消后该未来记录不再生效，是否继续？',
        `${verb}${activeTab.value.label}`,
        {
          confirmButtonText: verb,
          cancelButtonText: '返回',
          type: action === 'approve' ? 'warning' : 'error'
        }
      )
      await actCompensationRecord(activeEntity.value, row.id, action)
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '薪酬记录处理失败，请刷新记录后重试')
    }
  }
  const handleEnd = async (row: RecordItem): Promise<void> => {
    if (!row.id) return
    try {
      const effectiveTo = await promptText(
        '请输入薪酬终止日期（YYYY-MM-DD）。历史记录会保留，后续可新增新的薪酬版本。',
        '终止员工薪酬',
        {
          confirmButtonText: '确认终止',
          cancelButtonText: '取消',
          initialValue: dayjs().format('YYYY-MM-DD'),
          placeholder: 'YYYY-MM-DD',
          minLength: 10,
          maxLength: 10,
          type: 'warning'
        }
      )
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
        ElMessage.warning('请输入 YYYY-MM-DD 格式日期')
        return
      }
      await actCompensationRecord('employee', row.id, 'end', effectiveTo)
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '员工薪酬终止失败，请核对日期并刷新记录后重试')
    }
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    Object.assign(tableOverview, { total: 0, amountAccess: false })
  }
  const selectEntity = (value: string): void => {
    if (activeEntity.value === value) return
    activeEntity.value = value as Entity
    handleTabChange()
  }

  onMounted(async () => {
    await Promise.all([
      userStore.ensureDictLoaded('hrCompensationLifecycleStatus'),
      userStore.ensureDictLoaded('hrCompensationComponentCategory'),
      userStore.ensureDictLoaded('hrCompensationAmountType'),
      userStore.ensureDictLoaded('hrCompensationRangeStatus'),
      userStore.ensureDictLoaded('hrPayFrequency')
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

  .compensation-page {
    @include hr-table-workspace-layout(360px);

    &__control-deck {
      display: grid;
      gap: 12px;
      min-width: 0;
      padding: 16px;
      background:
        radial-gradient(
          circle at 96% 2%,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 30%
        ),
        var(--default-box-color);
      border: 1px solid var(--art-surface-border);
      border-radius: var(--art-surface-radius);
      box-shadow: var(--art-surface-shadow);
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

    &__responsibility {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) 28px minmax(220px, 1fr) minmax(240px, auto);
      gap: 10px;
      align-items: center;
      min-width: 0;
      padding: 11px 12px;
      background: color-mix(in srgb, var(--theme-color) 3%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      > svg {
        justify-self: center;
        color: color-mix(in srgb, var(--theme-color) 58%, var(--el-text-color-secondary));
      }

      article {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 9px;
        align-items: center;
        min-width: 0;
      }

      article > span {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, transparent);
        border-radius: var(--art-surface-radius);
      }

      article > div {
        display: grid;
        min-width: 0;
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 3px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      p {
        margin: 0;
        font-size: 11px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.art-table-query) {
      flex: 1;
    }

    @media (width <= 900px) {
      &__responsibility {
        grid-template-columns: 1fr;

        > svg {
          display: none;
        }

        p {
          padding-top: 8px;
          border-top: 1px dashed var(--art-card-border);
        }
      }
    }

    @media (width <= 760px) {
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
