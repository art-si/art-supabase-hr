<template>
  <ArtPermissionGuard permission="Hr:EmployeeRelations:View">
    <div class="employee-relations-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="EMPLOYEE RELATIONS CASE CONTROL"
        title="员工关系案件"
        description="以保密受理、分派调查、纠正行动和结案审计管理敏感员工关系事项，并与普通员工服务工单和正式人事异动保持清晰边界。"
        icon="ri:shield-user-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="employee-relations-page__control" aria-labelledby="relations-control-title">
        <header class="employee-relations-page__heading">
          <div>
            <span class="employee-relations-page__section-icon" aria-hidden="true">
              <ArtSvgIcon icon="ri:git-branch-line" />
            </span>
            <span>
              <strong id="relations-control-title">员工关系案件控制链</strong>
              <small>把最高风险、待分派和逾期案件放在操作员最短扫描路径内</small>
            </span>
          </div>
          <span
            class="employee-relations-page__governance"
            :class="{ 'is-restricted': !overview.sensitiveAccess }"
          >
            <ArtSvgIcon
              :icon="overview.sensitiveAccess ? 'ri:shield-keyhole-line' : 'ri:lock-2-line'"
            />
            {{ overview.sensitiveAccess ? '敏感内容授权可见' : '敏感内容服务端脱敏' }}
          </span>
        </header>

        <ol class="employee-relations-page__rail" aria-label="员工关系案件阶段">
          <li v-for="(stage, index) in controlStages" :key="stage.label" :class="stage.state">
            <span class="employee-relations-page__rail-index">0{{ index + 1 }}</span>
            <span class="employee-relations-page__rail-icon"
              ><ArtSvgIcon :icon="stage.icon"
            /></span>
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
          navigation-label="员工关系案件分类"
          compact
          @change="handleTabChange"
        />

        <div class="employee-relations-page__context" aria-live="polite">
          <div>
            <span class="employee-relations-page__context-icon"
              ><ArtSvgIcon :icon="activeTab.icon"
            /></span>
            <span>
              <small>当前工作视图</small>
              <strong>{{ activeTab.label }}</strong>
              <em>{{ activeTab.description }}</em>
            </span>
          </div>
          <dl>
            <div
              ><dt>当前结果</dt><dd>{{ tableTotal }}</dd></div
            >
            <div :class="attentionValue ? 'is-danger' : 'is-success'">
              <dt>{{ attentionLabel }}</dt
              ><dd>{{ attentionValue }}</dd>
            </div>
          </dl>
        </div>

        <footer class="employee-relations-page__note">
          <ArtSvgIcon icon="ri:information-line" />
          纠正行动只记录建议、责任人与完成证据，不直接改变员工任职状态；涉及调岗、降职或离职时，必须转入人事异动与正式审批流程。
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
          emptyText: activeEntity === 'case' ? '暂无员工关系案件' : '暂无处置行动',
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <EmployeeRelationRecordDialog ref="recordDialogRef" @success="handleRecordSuccess" />
      <EmployeeRelationActionDialog ref="actionDialogRef" @success="refreshAfterAction" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
      <EmployeeRelationDetailDrawer ref="detailDrawerRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
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
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import type { ColumnOption, DialogType } from '@/types'
  import {
    deleteEmployeeRelationRecord,
    fetchEmployeeRelationsOverview,
    fetchEmployeeRelationsRecords,
    transitionEmployeeRelationAction,
    transitionEmployeeRelationCase
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import EmployeeRelationRecordDialog from './modules/employee-relation-record-dialog.vue'
  import EmployeeRelationActionDialog from './modules/employee-relation-action-dialog.vue'
  import EmployeeRelationDetailDrawer from './modules/employee-relation-detail-drawer.vue'

  defineOptions({ name: 'HrEmployeeRelations' })

  type Entity = Api.Hr.EmployeeRelationEntity
  type RecordItem = Api.Hr.EmployeeRelationRecord
  type TableParams = Api.Hr.EmployeeRelationSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>
  type ManagedAction = Extract<
    Api.Hr.EmployeeRelationCaseAction,
    'triage' | 'require_action' | 'resolve'
  >

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyDescription: string
  }
  interface RecordDialogExpose {
    handleOpen: (payload: {
      entity: Entity
      type: DialogType
      editData?: RecordItem
      presetCase?: Api.Hr.EmployeeRelationCase
    }) => Promise<void>
  }
  interface ActionDialogExpose {
    handleOpen: (action: ManagedAction, record: Api.Hr.EmployeeRelationCase) => Promise<void>
  }
  interface DetailDrawerExpose {
    handleOpen: (id: string) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'case',
      label: '案件队列',
      description: '风险、负责人和处理阶段',
      emptyDescription: '创建案件草稿并提交后，可在这里完成分级、调查、处置和结案。',
      icon: 'ri:shield-user-line'
    },
    {
      value: 'action',
      label: '处置行动',
      description: '责任人、期限与完成结果',
      emptyDescription: '调查中案件进入处置阶段后，可建立可追踪的纠正与跟进行动。',
      icon: 'ri:route-line'
    }
  ]

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('case')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () =>
      activeEntity.value === 'case' ? 'hr_employee_relation_case' : 'hr_employee_relation_action',
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const recordDialogRef = ref<RecordDialogExpose>()
  const actionDialogRef = ref<ActionDialogExpose>()
  const detailDrawerRef = ref<DetailDrawerExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableTotal = ref(0)
  const tableState = reactive<{ searchQuery: Api.Hr.EmployeeRelationSearchParams }>({
    searchQuery: { keyword: '', status: '', caseType: '', severity: '', tenantId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    { hr_employee_relation_case: 'case', hr_employee_relation_action: 'action' },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      tableState.searchQuery.caseType = ''
      tableState.searchQuery.severity = ''
    }
  )
  const overview = reactive<Api.Hr.EmployeeRelationOverview>({
    openCaseCount: 0,
    criticalCaseCount: 0,
    unassignedCaseCount: 0,
    overdueCaseCount: 0,
    overdueActionCount: 0,
    resolvedMonthCount: 0,
    sensitiveAccess: false
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '保密案件隔离', type: 'primary', effect: 'plain' },
    { label: '调查处置闭环', type: 'warning', effect: 'light' },
    {
      label: overview.sensitiveAccess ? '敏感内容已授权' : '敏感内容已脱敏',
      type: overview.sensitiveAccess ? 'success' : 'info',
      effect: 'light'
    }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '开放案件',
      value: overview.openCaseCount,
      description: `${overview.unassignedCaseCount} 件尚未分派`,
      icon: 'ri:folder-shield-2-line',
      tone: overview.unassignedCaseCount ? 'warning' : 'primary'
    },
    {
      label: '紧急案件',
      value: overview.criticalCaseCount,
      description: '需优先控制人员与业务风险',
      icon: 'ri:alarm-warning-line',
      tone: overview.criticalCaseCount ? 'danger' : 'success'
    },
    {
      label: '时限风险',
      value: overview.overdueCaseCount + overview.overdueActionCount,
      description: `${overview.overdueCaseCount} 件案件 · ${overview.overdueActionCount} 项行动`,
      icon: 'ri:timer-flash-line',
      tone: overview.overdueCaseCount + overview.overdueActionCount ? 'danger' : 'success'
    },
    {
      label: '本月解决',
      value: overview.resolvedMonthCount,
      description: '已形成解决结论的案件',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    }
  ])
  const controlStages = computed(() => [
    {
      label: '保密受理',
      description: '事实、来源与涉及员工',
      value: `${overview.unassignedCaseCount} 件待分派`,
      icon: 'ri:inbox-archive-line',
      state: overview.unassignedCaseCount ? 'is-risk' : 'is-complete'
    },
    {
      label: '分派分级',
      description: '负责人、风险与目标日',
      value: `${overview.criticalCaseCount} 件紧急`,
      icon: 'ri:user-settings-line',
      state: overview.criticalCaseCount ? 'is-risk' : 'is-complete'
    },
    {
      label: '事实调查',
      description: '证据、访谈与调查发现',
      value: `${overview.openCaseCount} 件开放`,
      icon: 'ri:search-eye-line',
      state: overview.openCaseCount ? 'is-current' : 'is-complete'
    },
    {
      label: '纠正行动',
      description: '责任人、期限与结果',
      value: `${overview.overdueActionCount} 项逾期`,
      icon: 'ri:route-line',
      state: overview.overdueActionCount ? 'is-risk' : 'is-complete'
    },
    {
      label: '解决结案',
      description: '结论确认与审计封存',
      value: `${overview.resolvedMonthCount} 件本月解决`,
      icon: 'ri:shield-check-line',
      state: 'is-complete'
    }
  ])
  const attentionLabel = computed(() => (activeEntity.value === 'case' ? '案件逾期' : '行动逾期'))
  const attentionValue = computed(() =>
    activeEntity.value === 'case' ? overview.overdueCaseCount : overview.overdueActionCount
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
    items.push(
      {
        label: '状态',
        key: 'status',
        type: 'select',
        options:
          getDictMap.value[
            activeEntity.value === 'case'
              ? 'hrEmployeeRelationCaseStatus'
              : 'commonActionProgressStatus'
          ] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      },
      {
        label: '案件类型',
        key: 'caseType',
        type: 'select',
        options: getDictMap.value.hrEmployeeRelationCaseType ?? [],
        props: { clearable: true, placeholder: '全部类型' }
      },
      {
        label: '严重程度',
        key: 'severity',
        type: 'select',
        options: getDictMap.value.hrEmployeeRelationSeverity ?? [],
        props: { clearable: true, placeholder: '全部等级' }
      },
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder:
            activeEntity.value === 'case'
              ? overview.sensitiveAccess
                ? '案件号、标题、员工或负责人'
                : '案件号、员工或负责人'
              : overview.sensitiveAccess
                ? '案件号、行动或负责人'
                : '案件号或负责人'
        }
      }
    )
    return items
  })

  const severityTone = (severity?: string | null): TagProps['type'] =>
    severity === 'critical'
      ? 'danger'
      : severity === 'high'
        ? 'warning'
        : severity === 'low'
          ? 'info'
          : 'primary'
  const dueTone = (status?: Api.Hr.EmployeeRelationDueStatus): TagProps['type'] =>
    status === 'overdue'
      ? 'danger'
      : status === 'due_soon'
        ? 'warning'
        : status === 'on_track'
          ? 'success'
          : 'info'
  const dueLabel = (status?: Api.Hr.EmployeeRelationDueStatus): string =>
    ({ clear: '暂无时限', on_track: '计划内', due_soon: '临近到期', overdue: '已逾期' })[
      status ?? 'clear'
    ]
  const dateText = createDateTimeFormatter({
    format: 'YYYY-MM-DD',
    emptyText: '--',
    invalidText: '--'
  })

  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'case' ? caseColumns() : actionColumns()
  const caseColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'caseNo',
      label: '案件 / 受控标题',
      minWidth: 245,
      fixed: 'left',
      link: { permission: 'Hr:EmployeeRelations:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationCase
        return <BusinessTableIdentityCell primary={item.title} secondary={item.caseNo} />
      }
    },
    {
      prop: 'subjectEmployee',
      label: '涉及员工 / 任职信息',
      minWidth: 210,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationCase
        return (
          <BusinessTableIdentityCell
            primary={item.subjectEmployee?.employeeName}
            secondary={`${item.subjectEmployee?.employeeNo || '--'} · ${item.subjectEmployee?.positionName || item.subjectEmployee?.jobTitle || '未维护岗位'}`}
          />
        )
      }
    },
    {
      prop: 'caseType',
      label: '类型 / 风险',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationCase
        return (
          <div class="employee-relations-page__tag-stack">
            <span>
              {userStore.getDictLabelByValue(
                'hrEmployeeRelationCaseType',
                item.caseType,
                item.caseType ?? '--'
              )}
            </span>
            <ElTag type={severityTone(item.severity)} effect="light" size="small" round>
              {userStore.getDictLabelByValue(
                'hrEmployeeRelationSeverity',
                item.severity,
                item.severity ?? '--'
              )}
            </ElTag>
          </div>
        )
      }
    },
    {
      prop: 'ownerEmployee',
      label: '负责人 / 状态',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationCase
        return (
          <BusinessTableIdentityCell
            primary={item.ownerEmployee?.employeeName || '尚未分派'}
            secondary={userStore.getDictLabelByValue(
              'hrEmployeeRelationCaseStatus',
              item.status,
              item.status ?? '--'
            )}
          />
        )
      }
    },
    {
      prop: 'targetResolutionDate',
      label: '目标解决日',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationCase
        return (
          <div class="employee-relations-page__due">
            <span>{dateText(item.targetResolutionDate)}</span>
            <ElTag type={dueTone(item.dueStatus)} effect="plain" size="small">
              {dueLabel(item.dueStatus)}
            </ElTag>
          </div>
        )
      }
    },
    {
      prop: 'openActionCount',
      label: '开放行动',
      width: 96,
      formatter: (row) => `${(row as Api.Hr.EmployeeRelationCase).openActionCount ?? 0} 项`
    },
    {
      prop: 'confidentialityLevel',
      label: '保密等级',
      width: 110,
      dict: { code: 'hrEmployeeRelationConfidentiality', display: 'auto' }
    },
    actionColumn()
  ]
  const actionColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'title',
      label: '处置行动',
      minWidth: 230,
      fixed: 'left',
      link: { permission: 'Hr:EmployeeRelations:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationAction
        return (
          <BusinessTableIdentityCell
            primary={item.title}
            secondary={userStore.getDictLabelByValue(
              'hrEmployeeRelationActionType',
              item.actionType,
              item.actionType ?? '--'
            )}
          />
        )
      }
    },
    {
      prop: 'relationCase',
      label: '关联案件',
      minWidth: 205,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationAction
        return (
          <BusinessTableIdentityCell
            primary={item.relationCase?.title}
            secondary={item.relationCase?.caseNo}
          />
        )
      }
    },
    {
      prop: 'ownerEmployee',
      label: '行动负责人',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationAction
        return (
          <BusinessTableIdentityCell
            primary={item.ownerEmployee?.employeeName}
            secondary={item.ownerEmployee?.jobTitle}
          />
        )
      }
    },
    {
      prop: 'dueDate',
      label: '完成期限',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeRelationAction
        return (
          <div class="employee-relations-page__due">
            <span>{dateText(item.dueDate)}</span>
            <ElTag type={dueTone(item.dueStatus)} effect="plain" size="small">
              {dueLabel(item.dueStatus)}
            </ElTag>
          </div>
        )
      }
    },
    {
      prop: 'status',
      label: '行动状态',
      width: 110,
      dict: { code: 'commonActionProgressStatus', display: 'auto' }
    },
    { prop: 'completionNote', label: '完成说明', minWidth: 220, showOverflowTooltip: true },
    actionColumn()
  ]

  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'action',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => (
      <BusinessTableRowActions>
        <ArtButtonTable
          type="view"
          permission="Hr:EmployeeRelations:View"
          label="查看案件详情"
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
    if (activeEntity.value === 'action') {
      const item = row as Api.Hr.EmployeeRelationAction
      const actions: ButtonMoreItem[] = []
      if (item.status === 'planned') {
        actions.push(
          {
            key: 'edit',
            label: '编辑处置行动',
            icon: 'ri:edit-line',
            auth: 'Hr:EmployeeRelations:Action:Manage'
          },
          {
            key: 'start',
            label: '启动处置行动',
            icon: 'ri:play-circle-line',
            auth: 'Hr:EmployeeRelations:Action:Manage'
          },
          {
            key: 'delete',
            label: '删除待开始行动',
            icon: 'ri:delete-bin-line',
            color: 'var(--el-color-danger)',
            auth: 'Hr:EmployeeRelations:Action:Manage'
          }
        )
      }
      if (['planned', 'in_progress'].includes(item.status)) {
        actions.push(
          {
            key: 'complete',
            label: '完成处置行动',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:EmployeeRelations:Action:Manage'
          },
          {
            key: 'cancel',
            label: '取消处置行动',
            icon: 'ri:close-circle-line',
            color: 'var(--el-color-warning)',
            auth: 'Hr:EmployeeRelations:Action:Manage'
          }
        )
      }
      return actions
    }

    const item = row as Api.Hr.EmployeeRelationCase
    const actions: ButtonMoreItem[] = []
    if (['draft', 'reported'].includes(item.status) && overview.sensitiveAccess) {
      actions.push({
        key: 'edit',
        label: '编辑案件资料',
        icon: 'ri:edit-line',
        auth: 'Hr:EmployeeRelations:Edit'
      })
    }
    if (item.status === 'draft') {
      actions.push(
        {
          key: 'submit',
          label: '提交案件报告',
          icon: 'ri:send-plane-line',
          auth: 'Hr:EmployeeRelations:Edit'
        },
        {
          key: 'delete',
          label: '删除案件草稿',
          icon: 'ri:delete-bin-line',
          color: 'var(--el-color-danger)',
          auth: 'Hr:EmployeeRelations:Delete'
        }
      )
    }
    if (['reported', 'triaged'].includes(item.status)) {
      actions.push({
        key: 'triage',
        label: item.status === 'reported' ? '分派与分级' : '调整分派与期限',
        icon: 'ri:user-settings-line',
        auth: 'Hr:EmployeeRelations:Assign'
      })
    }
    if (item.status === 'triaged') {
      actions.push({
        key: 'start_investigation',
        label: '启动事实调查',
        icon: 'ri:search-eye-line',
        auth: 'Hr:EmployeeRelations:Investigate'
      })
    }
    if (item.status === 'investigating') {
      actions.push({
        key: 'require_action',
        label: '提交调查发现',
        icon: 'ri:file-search-line',
        auth: 'Hr:EmployeeRelations:Investigate'
      })
    }
    if (['investigating', 'action_required'].includes(item.status)) {
      actions.push(
        {
          key: 'add_action',
          label: '新增处置行动',
          icon: 'ri:route-line',
          auth: 'Hr:EmployeeRelations:Action:Manage'
        },
        {
          key: 'resolve',
          label: '提交解决结论',
          icon: 'ri:checkbox-circle-line',
          auth: 'Hr:EmployeeRelations:Resolve'
        },
        {
          key: 'comment',
          label: '补充调查说明',
          icon: 'ri:chat-1-line',
          auth: 'Hr:EmployeeRelations:Investigate'
        }
      )
    }
    if (item.status === 'resolved') {
      actions.push({
        key: 'close',
        label: '正式结案',
        icon: 'ri:shield-check-line',
        auth: 'Hr:EmployeeRelations:Close'
      })
    }
    if (['resolved', 'closed'].includes(item.status)) {
      actions.push({
        key: 'reopen',
        label: '重新启动调查',
        icon: 'ri:restart-line',
        color: 'var(--el-color-warning)',
        auth: 'Hr:EmployeeRelations:Close'
      })
    }
    if (['reported', 'triaged'].includes(item.status)) {
      actions.push({
        key: 'cancel',
        label: '取消案件',
        icon: 'ri:close-circle-line',
        color: 'var(--el-color-danger)',
        auth: 'Hr:EmployeeRelations:Resolve'
      })
    }
    return actions
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() =>
    activeEntity.value === 'case'
      ? [
          {
            type: 'add',
            label: '新建员工关系案件',
            permission: 'Hr:EmployeeRelations:Add',
            onClick: () => void recordDialogRef.value?.handleOpen({ entity: 'case', type: 'add' })
          }
        ]
      : []
  )
  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchEmployeeRelationsRecords(activeEntity.value, { ...params, from, to })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchEmployeeRelationsOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const refreshAfterAction = async (): Promise<void> => {
    await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }
  const handleRecordSuccess = async (entity: Entity, type: DialogType): Promise<void> => {
    if (entity !== activeEntity.value) activeEntity.value = entity
    await nextTick()
    if (type === 'add') await tableQueryRef.value?.refreshCreate()
    else await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }
  const caseIdOf = (row: RecordItem): string | undefined =>
    activeEntity.value === 'case'
      ? (row as Api.Hr.EmployeeRelationCase).id
      : (row as Api.Hr.EmployeeRelationAction).relationCase?.id
  const openDetail = (row: RecordItem): void => {
    const id = caseIdOf(row)
    if (id) void detailDrawerRef.value?.handleOpen(id)
  }

  const handleRowAction = async (item: ButtonMoreItem, row: RecordItem): Promise<void> => {
    if (!row.id) return
    const actionKey = String(item.key)
    if (activeEntity.value === 'action') {
      await handleActionRowAction(actionKey, row as Api.Hr.EmployeeRelationAction)
      return
    }
    await handleCaseRowAction(actionKey, row as Api.Hr.EmployeeRelationCase)
  }
  const handleActionRowAction = async (
    key: string,
    row: Api.Hr.EmployeeRelationAction
  ): Promise<void> => {
    if (!row.id) return
    if (key === 'edit') {
      const presetCase: Api.Hr.EmployeeRelationCase = {
        id: row.relationCase?.id,
        tenantId: row.tenantId,
        caseNo: row.relationCase?.caseNo || '--',
        caseType: row.relationCase?.caseType || 'other',
        title: row.relationCase?.title || '受限员工关系案件',
        subjectEmployeeId: '',
        anonymousReport: false,
        source: 'hr',
        severity: row.relationCase?.severity || 'medium',
        confidentialityLevel: 'restricted',
        status: row.relationCase?.status || 'investigating'
      }
      await recordDialogRef.value?.handleOpen({
        entity: 'action',
        type: 'edit',
        editData: row,
        presetCase
      })
      return
    }
    if (key === 'delete') {
      await deleteRecord({
        resource: { id: row.id, label: `${row.title} · ${row.relationCase?.caseNo ?? '案件'}` },
        resourceLabel: '处置行动',
        permission: 'Hr:EmployeeRelations:Action:Manage',
        confirmMessage: `确认删除尚未启动的处置行动“${row.title}”？`,
        remove: () => deleteEmployeeRelationRecord('action', row.id!),
        onDeleted: async () => {
          await tableQueryRef.value?.refreshRemove()
          await refreshOverview()
        }
      })
      return
    }
    try {
      if (key === 'start') {
        await confirmAction('确认启动该处置行动？启动后将进入执行中状态。', '启动处置行动', {
          confirmButtonText: '确认启动',
          cancelButtonText: '返回',
          type: 'info'
        })
        await transitionEmployeeRelationAction(row.id, 'start')
      } else if (key === 'complete') {
        const comment = await promptText('请填写可核验的完成结果。', '完成处置行动', {
          minLength: 2,
          maxLength: 800,
          placeholder: '说明完成事项、结果和证据',
          type: 'success'
        })
        await transitionEmployeeRelationAction(row.id, 'complete', comment)
      } else if (key === 'cancel') {
        const comment = await promptText('请说明取消该行动的原因。', '取消处置行动', {
          minLength: 2,
          maxLength: 500,
          placeholder: '请输入取消原因',
          type: 'warning'
        })
        await transitionEmployeeRelationAction(row.id, 'cancel', comment)
      }
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '处置行动处理失败，请刷新状态后重试')
    }
  }
  const handleCaseRowAction = async (
    key: string,
    row: Api.Hr.EmployeeRelationCase
  ): Promise<void> => {
    if (!row.id) return
    if (key === 'edit') {
      await recordDialogRef.value?.handleOpen({ entity: 'case', type: 'edit', editData: row })
      return
    }
    if (key === 'triage' || key === 'require_action' || key === 'resolve') {
      await actionDialogRef.value?.handleOpen(key, row)
      return
    }
    if (key === 'add_action') {
      await recordDialogRef.value?.handleOpen({ entity: 'action', type: 'add', presetCase: row })
      return
    }
    if (key === 'delete') {
      await deleteRecord({
        resource: { id: row.id, label: `${row.title}（${row.caseNo}）` },
        resourceLabel: '员工关系案件',
        permission: 'Hr:EmployeeRelations:Delete',
        confirmMessage: `确认删除案件草稿“${row.title}（${row.caseNo}）”？其草稿事件将一并移除。`,
        remove: () => deleteEmployeeRelationRecord('case', row.id!),
        onDeleted: async () => {
          await tableQueryRef.value?.refreshRemove()
          await refreshOverview()
        }
      })
      return
    }
    try {
      if (key === 'submit') {
        await confirmAction(
          '提交后案件进入待受理队列，报告事实仍按敏感权限隔离。',
          '提交案件报告',
          {
            confirmButtonText: '确认提交',
            cancelButtonText: '返回',
            type: 'info'
          }
        )
        await transitionEmployeeRelationCase(row.id, 'submit')
      } else if (key === 'start_investigation') {
        await confirmAction('确认负责人已接受案件，并启动事实调查？', '启动事实调查', {
          confirmButtonText: '启动调查',
          cancelButtonText: '返回',
          type: 'info'
        })
        await transitionEmployeeRelationCase(row.id, 'start_investigation')
      } else if (key === 'close') {
        await confirmAction(
          '正式结案后案件进入审计封存；如出现新证据仍可受控重新调查。',
          '正式结案',
          {
            confirmButtonText: '确认结案',
            cancelButtonText: '返回',
            type: 'success'
          }
        )
        await transitionEmployeeRelationCase(row.id, 'close')
      } else if (key === 'reopen') {
        const comment = await promptText('请说明重新启动调查的新证据或业务原因。', '重新启动调查', {
          minLength: 2,
          maxLength: 500,
          placeholder: '请输入重新调查原因',
          type: 'warning'
        })
        await transitionEmployeeRelationCase(row.id, 'reopen', { comment })
      } else if (key === 'cancel') {
        const comment = await promptText(
          '取消案件不会删除历史，请说明取消原因。',
          '取消员工关系案件',
          {
            minLength: 2,
            maxLength: 500,
            placeholder: '请输入取消原因',
            type: 'warning'
          }
        )
        await transitionEmployeeRelationCase(row.id, 'cancel', { comment })
      } else if (key === 'comment') {
        const comment = await promptText('补充内容会写入不可变案件轨迹。', '补充调查说明', {
          minLength: 2,
          maxLength: 800,
          placeholder: '请输入调查进展或决策依据',
          type: 'info'
        })
        await transitionEmployeeRelationCase(row.id, 'comment', { comment })
      }
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '员工关系案件处理失败，请刷新状态后重试')
    }
  }

  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '', caseType: '', severity: '' })
    tableTotal.value = 0
  }

  onMounted(async () => {
    await Promise.all(
      [
        'hrEmployeeRelationCaseType',
        'hrEmployeeRelationCaseStatus',
        'hrEmployeeRelationSeverity',
        'hrEmployeeRelationConfidentiality',
        'hrEmployeeRelationSource',
        'hrEmployeeRelationOutcome',
        'hrEmployeeRelationActionType',
        'commonActionProgressStatus',
        'hrEmployeeRelationEventType'
      ].map((code) => userStore.ensureDictLoaded(code))
    )
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

  .employee-relations-page {
    @include hr-table-workspace-layout(360px);

    &__control {
      position: relative;
      padding: 18px;
      overflow: hidden;
      background:
        radial-gradient(
          circle at 97% 3%,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 30%
        ),
        var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--theme-color) 11%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
      box-shadow: 0 10px 30px color-mix(in srgb, var(--art-gray-900) 4%, transparent);
    }

    &__heading {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 15px;

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
        font-size: 15px;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 3px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-icon,
    &__rail-icon,
    &__context-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
    }

    &__section-icon {
      width: 38px;
      height: 38px;
      border-radius: var(--art-surface-radius);
    }

    &__governance {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      font-size: 11px;
      font-weight: 650;
      color: var(--el-color-success-dark-2);
      white-space: nowrap;
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: 999px;

      &.is-restricted {
        color: var(--el-text-color-regular);
        background: var(--art-gray-100);
        border-color: var(--art-card-border);
      }
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        position: relative;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        min-width: 0;
        min-height: 72px;
        padding: 10px;
        background: color-mix(in srgb, var(--theme-color) 2%, var(--art-gray-100));
        border: 1px solid color-mix(in srgb, var(--theme-color) 10%, var(--art-card-border));
        border-radius: var(--art-surface-radius);

        &.is-current {
          background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
          border-color: color-mix(in srgb, var(--theme-color) 28%, var(--art-card-border));
        }

        &.is-risk {
          background: color-mix(in srgb, var(--el-color-danger) 5%, var(--default-box-color));
          border-color: color-mix(in srgb, var(--el-color-danger) 18%, var(--art-card-border));

          b {
            color: var(--el-color-danger);
          }
        }

        > div {
          display: grid;
          min-width: 0;
        }

        strong,
        small,
        b {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 12px;
          color: var(--el-text-color-primary);
        }

        small {
          margin-top: 3px;
          font-size: 10px;
          color: var(--el-text-color-secondary);
        }

        b {
          grid-column: 2;
          font-size: 10px;
          font-weight: 650;
          color: var(--theme-color);
        }
      }
    }

    &__rail-index {
      position: absolute;
      top: 5px;
      left: 37px;
      font-size: 8px;
      font-weight: 800;
      color: var(--theme-color);
    }

    &__rail-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }

    :deep(.hr-entity-navigation) {
      margin-top: 12px;
    }

    &__context {
      display: flex;
      gap: 18px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 11px 13px;
      margin-top: 10px;
      background: color-mix(in srgb, var(--theme-color) 3.5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 12%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > div {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }

      > div > span:last-child {
        display: flex;
        gap: 8px;
        align-items: baseline;
        min-width: 0;
      }

      > div small {
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.06em;
      }

      > div strong {
        flex: 0 0 auto;
        color: var(--el-text-color-primary);
      }

      > div em {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        font-style: normal;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      dl {
        display: flex;
        flex: 0 0 auto;
        gap: 8px;
        margin: 0;
      }

      dl > div {
        display: grid;
        grid-template-columns: auto auto;
        gap: 7px;
        align-items: baseline;
        min-width: 104px;
        padding: 7px 10px;
        background: var(--default-box-color);
        border: 1px solid var(--art-card-border);
        border-radius: var(--el-border-radius-base);

        &.is-danger dd {
          color: var(--el-color-danger);
        }

        &.is-success dd {
          color: var(--el-color-success-dark-2);
        }
      }

      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: var(--el-text-color-primary);
      }
    }

    &__context-icon {
      width: 32px;
      height: 32px;
      border-radius: var(--el-border-radius-base);
    }

    &__note {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      padding-top: 11px;
      margin-top: 12px;
      font-size: 11px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--art-card-border);

      :deep(.art-svg-icon) {
        flex: 0 0 auto;
        margin-top: 1px;
        font-size: 14px;
        color: var(--theme-color);
      }
    }

    &__tag-stack,
    &__due {
      display: grid;
      gap: 5px;
      justify-items: start;
      min-width: 0;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }
  }

  @media only screen and (width <= 1180px) {
    .employee-relations-page__rail {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media only screen and (width <= 900px) {
    .employee-relations-page {
      &__rail {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__context {
        align-items: flex-start;
      }

      &__context > div > span:last-child {
        display: grid;
        gap: 2px;
      }
    }
  }

  @media only screen and (width <= 767px) {
    .employee-relations-page {
      &__control {
        padding: 14px;
      }

      &__heading,
      &__context {
        flex-direction: column;
        align-items: stretch;
      }

      &__rail {
        grid-template-columns: 1fr;
      }

      &__governance {
        align-self: flex-start;
      }

      &__context dl {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__context dl > div {
        min-width: 0;
      }
    }
  }
</style>
