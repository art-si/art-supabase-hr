<template>
  <ArtPermissionGuard permission="Hr:Benefits:View">
    <div class="benefits-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="false" />
      <BusinessWorkspaceHeader
        eyebrow="BENEFITS & ENROLLMENT CONTROL"
        title="福利与参保"
        description="统一福利计划、覆盖方案、人生事件与员工参保；审核后的缴费快照作为薪资受控输入，避免福利经办直接修改薪资或财务结果。"
        icon="ri:heart-pulse-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="benefits-page__control" aria-labelledby="benefit-control-title">
        <header class="benefits-page__heading">
          <div>
            <span class="benefits-page__section-icon" aria-hidden="true"
              ><ArtSvgIcon icon="ri:route-line"
            /></span>
            <span>
              <strong id="benefit-control-title">从福利政策到薪资输入</strong>
              <small>按计划有效性、参保窗口和审核结果控制每一笔员工保障</small>
            </span>
          </div>
          <ElTag
            class="benefits-page__governance"
            :type="overview.amountVisible ? 'success' : 'warning'"
            effect="light"
            round
          >
            <ArtSvgIcon
              :icon="overview.amountVisible ? 'ri:money-cny-circle-line' : 'ri:lock-2-line'"
            />
            {{ overview.amountVisible ? '缴费金额已授权' : '缴费金额服务端隐藏' }}
          </ElTag>
        </header>

        <ol class="benefits-page__rail" aria-label="福利管理控制阶段">
          <li v-for="(stage, index) in controlStages" :key="stage.label" :class="stage.state">
            <span class="benefits-page__rail-index">0{{ index + 1 }}</span>
            <span class="benefits-page__rail-icon"><ArtSvgIcon :icon="stage.icon" /></span>
            <div
              ><strong>{{ stage.label }}</strong
              ><small>{{ stage.description }}</small></div
            >
            <b>{{ stage.value }}</b>
          </li>
        </ol>

        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="福利与参保分类"
          compact
          @change="handleTabChange"
        />

        <div class="benefits-page__context" aria-live="polite">
          <div>
            <span class="benefits-page__context-icon"><ArtSvgIcon :icon="activeTab.icon" /></span>
            <span
              ><small>当前工作视图</small><strong>{{ activeTab.label }}</strong
              ><em>{{ activeTab.description }}</em></span
            >
          </div>
          <dl>
            <div
              ><dt>当前结果</dt><dd>{{ tableTotal }}</dd></div
            >
            <div :class="attentionValue ? 'is-warning' : 'is-success'"
              ><dt>{{ attentionLabel }}</dt
              ><dd>{{ attentionValue }}</dd></div
            >
          </dl>
        </div>

        <footer class="benefits-page__note">
          <ArtSvgIcon icon="ri:information-line" />
          福利模块管理计划、资格、员工选择与缴费快照；薪资模块只读取审核后且处于有效保障期的输入，财务仍负责计算、入账与支付。
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
          emptyText: activeTab.emptyTitle,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <BenefitRecordDialog ref="recordDialogRef" @success="handleRecordSuccess" />
      <BenefitOptionDialog ref="optionDialogRef" @success="handleOptionSuccess" />
      <BenefitDetailDrawer
        ref="detailDrawerRef"
        @add-option="openAddOption"
        @edit-option="openEditOption"
      />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatCurrencyCodeValue } from '@/utils/ui/format'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { ElTag, type TagProps } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import type { ColumnOption, DialogType } from '@/types'
  import { fetchBenefitRecords, fetchBenefitsOverview, transitionBenefitRecord } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import BenefitRecordDialog from './modules/benefit-record-dialog.vue'
  import BenefitOptionDialog from './modules/benefit-option-dialog.vue'
  import BenefitDetailDrawer from './modules/benefit-detail-drawer.vue'

  defineOptions({ name: 'HrBenefits' })

  type Entity = Api.Hr.BenefitEntity
  type RecordItem = Api.Hr.BenefitRecord
  type TableParams = Api.Hr.BenefitSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyTitle: string
    emptyDescription: string
  }
  interface RecordDialogExpose {
    handleOpen: (payload: {
      entity: Entity
      type: DialogType
      editData?: RecordItem
    }) => Promise<void>
  }
  interface OptionDialogExpose {
    handleOpen: (payload: {
      type: DialogType
      plan: Api.Hr.BenefitPlan
      editData?: Api.Hr.BenefitOption
    }) => Promise<void>
  }
  interface DetailDrawerExpose {
    handleOpen: (entity: Entity, id: string) => Promise<void>
    refresh: () => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'plan',
      label: '福利计划',
      description: '政策、覆盖方案与有效期',
      emptyTitle: '暂无福利计划',
      emptyDescription: '先建立福利计划和至少一个覆盖方案，再启用员工参保。',
      icon: 'ri:heart-pulse-line'
    },
    {
      value: 'enrollment',
      label: '员工参保',
      description: '员工选择、缴费与审核',
      emptyTitle: '暂无员工参保记录',
      emptyDescription: '为符合资格的员工建立参保草稿，并提交独立审核。',
      icon: 'ri:user-heart-line'
    },
    {
      value: 'event',
      label: '人生事件',
      description: '资格触发与参保窗口',
      emptyTitle: '暂无福利人生事件',
      emptyDescription: '记录入职、婚育、保障丧失等事件，开放受控参保窗口。',
      icon: 'ri:calendar-event-line'
    }
  ]

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { hasAllAuth } = useAuth()
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('plan')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const recordDialogRef = ref<RecordDialogExpose>()
  const optionDialogRef = ref<OptionDialogExpose>()
  const detailDrawerRef = ref<DetailDrawerExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableTotal = ref(0)
  const tableState = reactive<{ searchQuery: Api.Hr.BenefitSearchParams }>({
    searchQuery: { keyword: '', status: '', planType: '', tenantId: '' }
  })
  const overview = reactive<Api.Hr.BenefitOverview>({
    activePlanCount: 0,
    activeEnrollmentCount: 0,
    pendingEnrollmentCount: 0,
    openEventCount: 0,
    expiringEventCount: 0,
    monthlyEmployeeContribution: null,
    monthlyEmployerContribution: null,
    amountVisible: false
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '福利计划独立建模', type: 'primary', effect: 'plain' },
    { label: '人生事件资格窗口', type: 'warning', effect: 'light' },
    { label: '审核后进入薪资', type: 'success', effect: 'light' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '生效计划',
      value: overview.activePlanCount,
      description: '当前有效期内可供参保',
      icon: 'ri:heart-add-2-line',
      tone: overview.activePlanCount ? 'primary' : 'warning'
    },
    {
      label: '在保员工',
      value: overview.activeEnrollmentCount,
      description: `${overview.pendingEnrollmentCount} 项等待审核`,
      icon: 'ri:user-heart-line',
      tone: overview.pendingEnrollmentCount ? 'warning' : 'success'
    },
    {
      label: '开放窗口',
      value: overview.openEventCount,
      description: `${overview.expiringEventCount} 项 7 天内截止`,
      icon: 'ri:calendar-event-line',
      tone: overview.expiringEventCount ? 'danger' : 'success'
    },
    {
      label: '雇主月成本',
      value: overview.amountVisible
        ? formatCurrencyCodeValue(overview.monthlyEmployerContribution)
        : '--',
      description: overview.amountVisible ? '生效参保缴费快照合计' : '当前权限不可查看金额',
      icon: overview.amountVisible ? 'ri:money-cny-circle-line' : 'ri:lock-2-line',
      tone: 'info'
    }
  ])
  const controlStages = computed(() => [
    {
      label: '定义计划',
      description: '政策、有效期与参保方式',
      value: `${overview.activePlanCount} 项生效`,
      icon: 'ri:file-list-3-line',
      state: overview.activePlanCount ? 'is-complete' : 'is-current'
    },
    {
      label: '配置方案',
      description: '覆盖层级与缴费规则',
      value: '历史快照',
      icon: 'ri:stack-line',
      state: overview.activePlanCount ? 'is-complete' : ''
    },
    {
      label: '开放资格',
      description: '人生事件与选择窗口',
      value: `${overview.openEventCount} 项开放`,
      icon: 'ri:calendar-check-line',
      state: overview.expiringEventCount ? 'is-risk' : overview.openEventCount ? 'is-current' : ''
    },
    {
      label: '参保审核',
      description: '员工选择与独立复核',
      value: `${overview.pendingEnrollmentCount} 项待审`,
      icon: 'ri:verified-badge-line',
      state: overview.pendingEnrollmentCount ? 'is-risk' : 'is-complete'
    },
    {
      label: '薪资读取',
      description: '只读取审核后缴费快照',
      value: `${overview.activeEnrollmentCount} 项有效`,
      icon: 'ri:exchange-funds-line',
      state: overview.activeEnrollmentCount ? 'is-complete' : ''
    }
  ])
  const attentionLabel = computed(() =>
    activeEntity.value === 'enrollment'
      ? '待审核'
      : activeEntity.value === 'event'
        ? '即将到期'
        : '生效计划'
  )
  const attentionValue = computed(() =>
    activeEntity.value === 'enrollment'
      ? overview.pendingEnrollmentCount
      : activeEntity.value === 'event'
        ? overview.expiringEventCount
        : overview.activePlanCount
  )

  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (isPlatformSuper.value) {
      items.push({
        label: '租户',
        key: 'tenantId',
        type: 'select',
        options: tenantOptions.value,
        props: { clearable: true, filterable: true, placeholder: '全部租户' }
      })
    }
    const statusCode =
      activeEntity.value === 'plan'
        ? 'hrBenefitPlanStatus'
        : activeEntity.value === 'enrollment'
          ? 'hrBenefitEnrollmentStatus'
          : 'hrBenefitLifeEventStatus'
    items.push(
      {
        label: '状态',
        key: 'status',
        type: 'select',
        options: getDictMap.value[statusCode] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      },
      {
        label: '计划类型',
        key: 'planType',
        type: 'select',
        options: getDictMap.value.hrBenefitPlanType ?? [],
        hidden: activeEntity.value === 'event',
        props: { clearable: true, placeholder: '全部类型' }
      },
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder:
            activeEntity.value === 'plan'
              ? '计划编码、名称或机构'
              : activeEntity.value === 'enrollment'
                ? '参保编号、员工或计划'
                : '员工姓名或工号'
        }
      }
    )
    return items
  })

  const dateText = createDateTimeFormatter({
    format: 'YYYY-MM-DD',
    emptyText: '--',
    invalidText: '--'
  })

  const dueTone = (status?: Api.Hr.BenefitDueStatus): TagProps['type'] =>
    status === 'expired'
      ? 'danger'
      : status === 'due_soon' || status === 'expiring'
        ? 'warning'
        : 'success'
  const dueLabel = (status?: Api.Hr.BenefitDueStatus): string =>
    ({ clear: '窗口正常', due_soon: '即将截止', expiring: '保障将到期', expired: '已过期' })[
      status ?? 'clear'
    ]

  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'plan'
      ? planColumns()
      : activeEntity.value === 'enrollment'
        ? enrollmentColumns()
        : eventColumns()
  const planColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'planName',
      label: '福利计划 / 编码',
      minWidth: 230,
      fixed: 'left',
      link: { permission: 'Hr:Benefits:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.BenefitPlan
        return <BusinessTableIdentityCell primary={item.planName} secondary={item.planCode} />
      }
    },
    {
      prop: 'planType',
      label: '计划类型',
      minWidth: 140,
      dict: { code: 'hrBenefitPlanType', display: 'auto' }
    },
    {
      prop: 'enrollmentMethod',
      label: '参保 / 覆盖',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.BenefitPlan
        return (
          <BusinessTableIdentityCell
            primary={userStore.getDictLabelByValue(
              'hrBenefitEnrollmentMethod',
              item.enrollmentMethod,
              item.enrollmentMethod ?? '--'
            )}
            secondary={userStore.getDictLabelByValue(
              'hrBenefitCoverageScope',
              item.coverageScope,
              item.coverageScope ?? '--'
            )}
          />
        )
      }
    },
    {
      prop: 'effectiveFrom',
      label: '有效期',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.BenefitPlan
        return (
          <BusinessTableIdentityCell
            primary={dateText(item.effectiveFrom)}
            secondary={`至 ${dateText(item.effectiveTo)}`}
          />
        )
      }
    },
    {
      prop: 'optionCount',
      label: '方案 / 在保',
      minWidth: 130,
      align: 'center',
      formatter: (row) => {
        const item = row as Api.Hr.BenefitPlan
        return (
          <BusinessTableIdentityCell
            primary={`${item.optionCount ?? 0} 项`}
            secondary={`${item.activeEnrollmentCount ?? 0} 人在保`}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      minWidth: 110,
      dict: { code: 'hrBenefitPlanStatus', display: 'auto' }
    },
    operationColumn()
  ]
  const enrollmentColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '员工 / 工号',
      minWidth: 190,
      fixed: 'left',
      link: { permission: 'Hr:Benefits:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.BenefitEnrollment
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.employeeName}
            secondary={`${item.employee?.employeeNo || '--'} · ${item.employee?.positionName || item.employee?.jobTitle || '未维护岗位'}`}
          />
        )
      }
    },
    {
      prop: 'plan',
      label: '计划 / 覆盖方案',
      minWidth: 220,
      formatter: (row) => {
        const item = row as Api.Hr.BenefitEnrollment
        return (
          <BusinessTableIdentityCell
            primary={item.plan?.planName}
            secondary={item.option?.optionName}
          />
        )
      }
    },
    {
      prop: 'coverageFrom',
      label: '保障期',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.BenefitEnrollment
        return (
          <BusinessTableIdentityCell
            primary={dateText(item.coverageFrom)}
            secondary={`至 ${dateText(item.coverageTo)}`}
          />
        )
      }
    },
    {
      prop: 'employeeContribution',
      label: '员工 / 雇主月缴费',
      minWidth: 190,
      align: 'right',
      formatter: (row) => {
        const item = row as Api.Hr.BenefitEnrollment
        return (
          <BusinessTableIdentityCell
            primary={formatCurrencyCodeValue(item.employeeContribution, item.currencyCode)}
            secondary={`雇主 ${formatCurrencyCodeValue(item.employerContribution, item.currencyCode)}`}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '参保状态',
      minWidth: 115,
      dict: { code: 'hrBenefitEnrollmentStatus', display: 'auto' }
    },
    {
      prop: 'payrollSyncStatus',
      label: '薪资输入',
      minWidth: 120,
      dict: { code: 'hrBenefitPayrollSyncStatus', display: 'auto' }
    },
    operationColumn()
  ]
  const eventColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '员工 / 工号',
      minWidth: 200,
      fixed: 'left',
      link: { permission: 'Hr:Benefits:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.BenefitLifeEvent
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.employeeName}
            secondary={`${item.employee?.employeeNo || '--'} · ${item.employee?.organizationName || '未维护组织'}`}
          />
        )
      }
    },
    {
      prop: 'eventType',
      label: '人生事件',
      minWidth: 150,
      dict: { code: 'hrBenefitLifeEventType', display: 'auto' }
    },
    {
      prop: 'eventDate',
      label: '事件日期',
      minWidth: 125,
      formatter: (row) => dateText((row as Api.Hr.BenefitLifeEvent).eventDate)
    },
    {
      prop: 'enrollmentWindowEnd',
      label: '参保窗口',
      minWidth: 170,
      formatter: (row) => {
        const item = row as Api.Hr.BenefitLifeEvent
        return (
          <div class="flex items-center gap-2">
            <strong>{dateText(item.enrollmentWindowEnd)}</strong>
            <ElTag type={dueTone(item.dueStatus)} size="small" effect="light" round>
              {dueLabel(item.dueStatus)}
            </ElTag>
          </div>
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      minWidth: 115,
      dict: { code: 'hrBenefitLifeEventStatus', display: 'auto' }
    },
    operationColumn()
  ]
  const operationColumn = (): ColumnOption<RecordItem> => ({
    prop: 'operation',
    label: '操作',
    width: 112,
    fixed: 'right',
    align: 'center',
    formatter: (row) => (
      <BusinessTableRowActions>
        <ArtButtonTable
          type="view"
          permission="Hr:Benefits:View"
          label="查看福利详情"
          onClick={() => openDetail(row)}
        />
        <ArtButtonMore
          list={() => rowActions(row)}
          onClick={(item: ButtonMoreItem) => void handleRowAction(item, row)}
        />
      </BusinessTableRowActions>
    )
  })

  const rowActions = (row: RecordItem): ButtonMoreItem[] => {
    if (activeEntity.value === 'plan') {
      const item = row as Api.Hr.BenefitPlan
      const actions: ButtonMoreItem[] = []
      if (['draft', 'active'].includes(item.status))
        actions.push({
          key: 'edit',
          label: '编辑福利计划',
          icon: 'ri:edit-line',
          auth: 'Hr:Benefits:Plan:Manage'
        })
      if (
        ['draft', 'active'].includes(item.status) &&
        hasAllAuth(['Hr:Benefits:Plan:Manage', 'Hr:Benefits:Amount:Edit'])
      ) {
        actions.push({
          key: 'add_option',
          label: '新增覆盖方案',
          icon: 'ri:stack-line',
          auth: 'Hr:Benefits:Plan:Manage'
        })
      }
      if (item.status === 'draft')
        actions.push({
          key: 'activate',
          label: '启用福利计划',
          icon: 'ri:play-circle-line',
          auth: 'Hr:Benefits:Plan:Manage'
        })
      if (item.status === 'active')
        actions.push({
          key: 'deactivate',
          label: '停用福利计划',
          icon: 'ri:pause-circle-line',
          auth: 'Hr:Benefits:Plan:Manage'
        })
      if (item.status === 'inactive')
        actions.push({
          key: 'reactivate',
          label: '重新启用计划',
          icon: 'ri:restart-line',
          auth: 'Hr:Benefits:Plan:Manage'
        })
      if (item.status === 'draft')
        actions.push({
          key: 'cancel',
          label: '取消计划草稿',
          icon: 'ri:close-circle-line',
          color: 'var(--el-color-danger)',
          auth: 'Hr:Benefits:Plan:Manage'
        })
      return actions
    }
    if (activeEntity.value === 'enrollment') {
      const item = row as Api.Hr.BenefitEnrollment
      const actions: ButtonMoreItem[] = []
      if (item.status === 'draft')
        actions.push(
          {
            key: 'edit',
            label: '编辑参保草稿',
            icon: 'ri:edit-line',
            auth: 'Hr:Benefits:Enrollment:Manage'
          },
          {
            key: 'submit',
            label: '提交参保审核',
            icon: 'ri:send-plane-line',
            auth: 'Hr:Benefits:Enrollment:Manage'
          },
          {
            key: 'cancel',
            label: '取消参保草稿',
            icon: 'ri:close-circle-line',
            color: 'var(--el-color-danger)',
            auth: 'Hr:Benefits:Enrollment:Manage'
          }
        )
      if (item.status === 'pending')
        actions.push(
          {
            key: 'approve',
            label: '审核通过并生效',
            icon: 'ri:verified-badge-line',
            auth: 'Hr:Benefits:Approve'
          },
          {
            key: 'reject',
            label: '驳回参保草稿',
            icon: 'ri:arrow-go-back-line',
            color: 'var(--el-color-warning)',
            auth: 'Hr:Benefits:Approve'
          }
        )
      if (item.status === 'active')
        actions.push({
          key: 'end',
          label: '终止员工保障',
          icon: 'ri:stop-circle-line',
          color: 'var(--el-color-warning)',
          auth: 'Hr:Benefits:Enrollment:Manage'
        })
      return actions
    }
    const item = row as Api.Hr.BenefitLifeEvent
    if (item.status !== 'open') return []
    return [
      {
        key: 'edit',
        label: '编辑人生事件',
        icon: 'ri:edit-line',
        auth: 'Hr:Benefits:Event:Manage'
      },
      {
        key: 'process',
        label: '标记事件已处理',
        icon: 'ri:checkbox-circle-line',
        auth: 'Hr:Benefits:Event:Manage'
      },
      {
        key: 'cancel',
        label: '取消人生事件',
        icon: 'ri:close-circle-line',
        color: 'var(--el-color-danger)',
        auth: 'Hr:Benefits:Event:Manage'
      }
    ]
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      key: `add-${activeEntity.value}`,
      label:
        activeEntity.value === 'plan'
          ? '新增福利计划'
          : activeEntity.value === 'enrollment'
            ? '新增员工参保'
            : '新增人生事件',
      type: 'add',
      icon: 'ri:add-line',
      permission:
        activeEntity.value === 'plan'
          ? 'Hr:Benefits:Plan:Manage'
          : activeEntity.value === 'enrollment'
            ? 'Hr:Benefits:Enrollment:Manage'
            : 'Hr:Benefits:Event:Manage',
      onClick: () =>
        void recordDialogRef.value?.handleOpen({ entity: activeEntity.value, type: 'add' })
    }
  ])

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange(params)
    return fetchBenefitRecords(activeEntity.value, { ...params, from, to })
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchBenefitsOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (_rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshAfterMutation = async (): Promise<void> => {
    await Promise.all([tableQueryRef.value?.refreshUpdate(), refreshOverview()])
  }
  const handleRecordSuccess = async (): Promise<void> => {
    await refreshAfterMutation()
  }
  const handleOptionSuccess = async (): Promise<void> => {
    await Promise.all([refreshAfterMutation(), detailDrawerRef.value?.refresh()])
  }
  const handleTabChange = async (): Promise<void> => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '', planType: '' })
    tableTotal.value = 0
    await nextTick()
    await tableQueryRef.value?.refreshData()
  }
  const openDetail = (row: RecordItem): void => {
    if (row.id) void detailDrawerRef.value?.handleOpen(activeEntity.value, row.id)
  }
  const openAddOption = (plan: Api.Hr.BenefitPlan): void => {
    void optionDialogRef.value?.handleOpen({ type: 'add', plan })
  }
  const openEditOption = (plan: Api.Hr.BenefitPlan, option: Api.Hr.BenefitOption): void => {
    void optionDialogRef.value?.handleOpen({ type: 'edit', plan, editData: option })
  }

  const handleRowAction = async (menuItem: ButtonMoreItem, row: RecordItem): Promise<void> => {
    if (!row.id) return
    const key = String(menuItem.key)
    if (key === 'edit') {
      await recordDialogRef.value?.handleOpen({
        entity: activeEntity.value,
        type: 'edit',
        editData: row
      })
      return
    }
    if (key === 'add_option') {
      openAddOption(row as Api.Hr.BenefitPlan)
      return
    }
    try {
      if (key === 'reject' || key === 'end') {
        const comment = await promptText(
          key === 'reject'
            ? '请输入驳回原因，记录将返回草稿。'
            : '请输入终止说明，薪资输入将同步停止。',
          key === 'reject' ? '驳回参保审核' : '终止员工保障',
          {
            placeholder: '请输入原因或说明',
            confirmButtonText: key === 'reject' ? '确认驳回' : '确认终止',
            multiline: true,
            minLength: 2,
            maxLength: 500
          }
        )
        await transitionBenefitRecord(activeEntity.value, row.id, key, comment)
        await refreshAfterMutation()
        return
      }
      const actionMap: Record<string, Api.Hr.BenefitTransitionAction> = {
        activate: 'activate',
        deactivate: 'deactivate',
        reactivate: 'reactivate',
        submit: 'submit',
        approve: 'approve',
        process: 'process',
        cancel: 'cancel'
      }
      const action = actionMap[key]
      if (!action) return
      await confirmAction(
        action === 'approve'
          ? '审核通过后将生成可供薪资读取的缴费输入。'
          : action === 'activate'
            ? '启用前请确认计划至少包含一个有效覆盖方案。'
            : '该操作会改变当前福利记录状态并写入审计轨迹。',
        action === 'approve'
          ? '审核参保生效'
          : action === 'activate'
            ? '启用福利计划'
            : '确认执行操作',
        {
          confirmButtonText: action === 'approve' ? '审核通过' : '确认执行',
          type: action === 'approve' || action === 'activate' ? 'success' : 'warning'
        }
      )
      await transitionBenefitRecord(activeEntity.value, row.id, action)
      await refreshAfterMutation()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '福利记录处理失败，请刷新状态后重试')
    }
  }

  onMounted(async () => {
    const tasks: Promise<unknown>[] = [
      refreshOverview(),
      ...[
        'hrBenefitPlanType',
        'hrBenefitPlanStatus',
        'hrBenefitEnrollmentMethod',
        'hrBenefitCoverageScope',
        'hrBenefitCoverageLevel',
        'hrBenefitContributionType',
        'hrBenefitLifeEventType',
        'hrBenefitLifeEventStatus',
        'hrBenefitEnrollmentStatus',
        'hrBenefitPayrollSyncStatus'
      ].map((code) => userStore.ensureDictLoaded(code))
    ]
    if (isPlatformSuper.value)
      tasks.push(
        fetchEnabledTenantList().then((response) => {
          tenantOptions.value = (response.data ?? []).map((tenant) => ({
            label: `${tenant.tenantName}（${tenant.tenantCode}）`,
            value: tenant.id!
          }))
        })
      )
    await Promise.all(tasks)
  })
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .benefits-page {
    @include hr-table-workspace-layout(360px);

    display: flex;
    flex-direction: column;
    gap: var(--art-page-gap);

    &__control {
      display: grid;
      gap: 16px;
      padding: 18px;
      background: var(--default-box-color);
      border-radius: var(--custom-radius);
    }

    &__heading {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;

      > div {
        display: flex;
        gap: 11px;
        align-items: center;
        min-width: 0;
      }

      > div > span:last-child {
        display: grid;
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 3px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-icon,
    &__context-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 38px;
      height: 38px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--el-border-radius-base);
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 1px;
      padding: 0;
      margin: 0;
      overflow: hidden;
      list-style: none;
      background: var(--art-card-border);
      border: 1px solid var(--art-card-border);
      border-radius: calc(var(--el-border-radius-base) + 4px);

      li {
        position: relative;
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr);
        gap: 9px;
        align-items: center;
        min-width: 0;
        padding: 14px;
        background: var(--default-box-color);

        &.is-current {
          background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
        }

        &.is-complete .benefits-page__rail-icon {
          color: var(--el-color-success);
          background: var(--el-color-success-light-9);
        }

        &.is-risk .benefits-page__rail-icon {
          color: var(--el-color-warning);
          background: var(--el-color-warning-light-9);
        }

        div {
          display: grid;
          min-width: 0;
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          white-space: nowrap;
        }

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 10px;
          white-space: nowrap;
        }

        b {
          grid-column: 2;
          font-size: 11px;
          font-weight: 600;
          color: var(--el-text-color-regular);
        }
      }
    }

    &__rail-index {
      position: absolute;
      top: 7px;
      right: 8px;
      font-size: 9px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
    }

    &__rail-icon {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, transparent);
      border-radius: 50%;
    }

    &__context {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: var(--art-gray-100);
      border-radius: var(--el-border-radius-base);

      > div {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }

      > div > span:last-child {
        display: grid;
        min-width: 0;
      }

      em {
        @include ellipsis;

        margin-top: 2px;
        font-size: 11px;
        font-style: normal;
        color: var(--el-text-color-secondary);
      }

      dl {
        display: flex;
        gap: 20px;
        margin: 0;
      }

      dl div {
        min-width: 76px;
        text-align: right;
      }

      dt {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 2px 0 0;
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
      }

      .is-warning dd {
        color: var(--el-color-warning-dark-2);
      }

      .is-success dd {
        color: var(--el-color-success-dark-2);
      }
    }

    &__note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: 11px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
    }

    &__operations {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      justify-content: center;
    }
  }

  @media only screen and (width <= 1180px) {
    .benefits-page {
      &__rail {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  }

  @media only screen and (width <= 767px) {
    .benefits-page {
      &__control {
        padding: 14px;
      }

      &__heading,
      &__context {
        flex-direction: column;
        align-items: stretch;
      }

      &__governance {
        align-self: flex-start;
      }

      &__rail {
        grid-template-columns: 1fr;
      }

      &__context dl {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__context dl div {
        min-width: 0;
        text-align: left;
      }
    }
  }
</style>
