<template>
  <ArtPermissionGuard permission="Hr:Lifecycle:View">
    <div class="lifecycle-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="EMPLOYEE JOURNEY OPERATIONS"
        title="入转调离"
        description="把入职、转正、调动与离职从审批记录升级为可执行的员工旅程，统一责任、时限、门禁、证据和生效归档。"
        icon="ri:user-settings-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="lifecycle-page__journey" aria-labelledby="lifecycle-journey-title">
        <header class="lifecycle-page__heading">
          <div>
            <span class="lifecycle-page__section-icon"><ArtSvgIcon icon="ri:route-line" /></span>
            <span>
              <strong id="lifecycle-journey-title">员工旅程执行轨道</strong>
              <small>审批与执行分轴管理，必办和阻断任务共同决定事项能否生效</small>
            </span>
          </div>
          <span class="lifecycle-page__governance"
            ><ArtSvgIcon icon="ri:shield-check-line" />过程留痕 · 门禁受控</span
          >
        </header>

        <ol class="lifecycle-page__rail" aria-label="生命周期事项执行阶段">
          <li v-for="(stage, index) in journeyStages" :key="stage.label" :class="stage.state">
            <span class="lifecycle-page__rail-index">0{{ index + 1 }}</span>
            <span class="lifecycle-page__rail-icon"><ArtSvgIcon :icon="stage.icon" /></span>
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
          navigation-label="员工生命周期运营分类"
          compact
          @change="handleTabChange"
        />
        <footer class="lifecycle-page__note">
          <ArtSvgIcon icon="ri:information-line" />
          标准任务包仅在建单时固化；在途事项不会因模板调整而被改写。招聘交接完成后可直接生成入职事项，避免重复录入。
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
        :search-bar-props="{ span: 6, labelWidth: 76, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        focusable
      />
      <LifecycleDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { toNameCodeOption } from '@/utils/form/option'

  import dayjs from 'dayjs'
  import { ElProgress } from 'element-plus'
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
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import {
    deleteLifecycleRecord,
    fetchLifecycleOptions,
    fetchLifecycleOverview,
    fetchLifecycleRecords,
    submitHrApproval,
    transitionLifecycleCase,
    transitionLifecycleTask,
    transitionLifecycleTemplate
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import LifecycleDialog from './modules/lifecycle-dialog.vue'

  defineOptions({ name: 'HrLifecycle' })
  type Entity = Api.Hr.LifecycleEntity
  type RecordItem = Api.Hr.LifecycleRecord
  type TableParams = Api.Hr.LifecycleSearchParams &
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
      value: 'case',
      label: '生命周期事项',
      description: '审批、执行与生效闭环',
      emptyDescription: '先创建员工生命周期事项，系统会按事项类型加载默认标准任务包。',
      statusDict: 'hrLifecycleExecutionStatus',
      icon: 'ri:route-line'
    },
    {
      value: 'task',
      label: '执行任务',
      description: '责任、SLA 与完成证据',
      emptyDescription: '事项创建后，标准任务包会自动生成跨部门执行任务。',
      statusDict: 'hrLifecycleTaskStatus',
      icon: 'ri:task-line'
    },
    {
      value: 'template',
      label: '标准任务包',
      description: '按场景复制成熟流程',
      emptyDescription: '创建入职、转正、调动或离职任务包，统一组织执行标准。',
      statusDict: 'hrLifecycleTemplateStatus',
      icon: 'ri:stack-line'
    },
    {
      value: 'template_task',
      label: '模板任务',
      description: '责任泳道与相对时限',
      emptyDescription: '为草稿或停用任务包配置责任泳道、相对生效日和完成门禁。',
      icon: 'ri:list-check-3'
    }
  ]

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('case')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const deleteTables: Record<Entity, string> = {
    case: 'hr_lifecycle_case',
    task: 'hr_lifecycle_task',
    template: 'hr_lifecycle_template',
    template_task: 'hr_lifecycle_template_task'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const caseOptions = shallowRef<Api.Hr.LifecycleReference[]>([])
  const templateOptions = shallowRef<Api.Hr.LifecycleReference[]>([])
  const tableState = reactive<{ searchQuery: Api.Hr.LifecycleSearchParams }>({
    searchQuery: { tenantId: '', status: '', keyword: '', caseId: '', templateId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_lifecycle_case: 'case',
      hr_lifecycle_task: 'task',
      hr_lifecycle_template: 'template',
      hr_lifecycle_template_task: 'template_task'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const overview = reactive<Api.Hr.LifecycleOverview>({
    activeCaseCount: 0,
    dueSoonCaseCount: 0,
    overdueBlockingTaskCount: 0,
    readyCaseCount: 0,
    defaultTemplateCount: 0,
    completionRate: 0
  })

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '标准任务包', type: 'primary', effect: 'plain' },
    { label: '跨部门 SLA', type: 'warning', effect: 'light' },
    { label: '生效门禁', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '在途事项',
      value: overview.activeCaseCount,
      description: `${overview.dueSoonCaseCount} 项将在 7 天内生效`,
      icon: 'ri:route-line',
      tone: 'primary'
    },
    {
      label: '逾期阻断任务',
      value: overview.overdueBlockingTaskCount,
      description: '未关闭前事项不能进入就绪',
      icon: 'ri:alarm-warning-line',
      tone: overview.overdueBlockingTaskCount ? 'danger' : 'success'
    },
    {
      label: '已就绪事项',
      value: overview.readyCaseCount,
      description: '等待确认实际生效并归档',
      icon: 'ri:shield-check-line',
      tone: overview.readyCaseCount ? 'warning' : 'info'
    },
    {
      label: '近 90 天办结率',
      value: `${overview.completionRate}%`,
      description: `${overview.defaultTemplateCount} 套默认标准任务包`,
      icon: 'ri:verified-badge-line',
      tone: overview.completionRate >= 80 ? 'success' : 'info'
    }
  ])
  const journeyStages = computed(() => [
    {
      label: '事项规划',
      description: '审批、来源与任务包固化',
      value: `${overview.defaultTemplateCount} 套标准`,
      icon: 'ri:file-list-3-line',
      state: overview.defaultTemplateCount ? 'is-complete' : 'is-current'
    },
    {
      label: '协同执行',
      description: '按责任泳道与 SLA 推进',
      value: `${overview.activeCaseCount} 项在途`,
      icon: 'ri:team-line',
      state: overview.activeCaseCount ? 'is-current' : ''
    },
    {
      label: '就绪校验',
      description: '阻断与必办任务门禁',
      value: `${overview.readyCaseCount} 项就绪`,
      icon: 'ri:shield-check-line',
      state: overview.readyCaseCount ? 'is-current' : ''
    },
    {
      label: '生效归档',
      description: '实际日期与证据留痕',
      value: `${overview.completionRate}% 办结`,
      icon: 'ri:archive-stack-line',
      state: overview.completionRate ? 'is-complete' : ''
    }
  ])

  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (isPlatformSuper.value)
      items.push({
        label: '租户',
        key: 'tenantId',
        type: 'select',
        options: tenantOptions.value,
        props: {
          clearable: true,
          filterable: true,
          placeholder: '全部租户',
          onChange: handleTenantFilterChange
        }
      })
    if (activeEntity.value === 'task')
      items.push({
        label: '事项',
        key: 'caseId',
        type: 'select',
        options: caseOptions.value.map(toNameCodeOption),
        props: { clearable: true, filterable: true, placeholder: '全部生命周期事项' }
      })
    if (activeEntity.value === 'template_task')
      items.push({
        label: '任务包',
        key: 'templateId',
        type: 'select',
        options: templateOptions.value.map(toNameCodeOption),
        props: { clearable: true, filterable: true, placeholder: '全部标准任务包' }
      })
    if (activeTab.value.statusDict)
      items.push({
        label: '状态',
        key: 'status',
        type: 'select',
        options: getDictMap.value[activeTab.value.statusDict] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      })
    items.push({
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: {
          case: '事项编号、员工、组织或岗位',
          task: '任务、事项编号或员工',
          template: '任务包名称、编码或说明',
          template_task: '模板任务或任务包'
        }[activeEntity.value]
      }
    })
    return items
  })

  const progress = (closed = 0, total = 0, overdue = 0) => {
    const rate = Math.round((closed / Math.max(total, 1)) * 100)
    return (
      <div class="lifecycle-page__progress">
        <span>
          <strong>{rate}%</strong>
          <small>
            {closed} / {total} 项{overdue ? ` · ${overdue} 项逾期` : ''}
          </small>
        </span>
        <ElProgress
          percentage={rate}
          stroke-width={6}
          show-text={false}
          status={overdue ? 'exception' : undefined}
        />
      </div>
    )
  }
  const deadline = (date?: string | null, status?: string) => {
    const overdue = Boolean(
      date &&
      dayjs(date).isBefore(dayjs(), 'day') &&
      ['pending', 'processing'].includes(status ?? '')
    )
    return (
      <span class={['lifecycle-page__deadline', overdue && 'is-overdue']}>
        {date ?? '--'}
        {overdue ? ' · 已逾期' : ''}
      </span>
    )
  }

  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'case'
      ? caseColumns()
      : activeEntity.value === 'task'
        ? taskColumns()
        : activeEntity.value === 'template'
          ? templateColumns()
          : templateTaskColumns()
  const caseColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '员工 / 事项',
      minWidth: 225,
      fixed: 'left',
      link: {
        permission: 'Hr:Lifecycle:View',
        onClick: (row) => openCaseTasks(row as Api.Hr.LifecycleCase)
      },
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleCase
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={`${item.employee?.code ?? '--'} · ${item.caseNo}`}
          />
        )
      }
    },
    {
      prop: 'caseType',
      label: '旅程类型',
      width: 105,
      dict: { code: 'hrLifecycleCaseType', display: 'auto' }
    },
    {
      prop: 'scope',
      label: '组织 / 岗位',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleCase
        return (
          <BusinessTableIdentityCell
            primary={item.organization?.name ?? '未指定组织'}
            secondary={item.position?.name ?? '未指定岗位'}
          />
        )
      }
    },
    {
      prop: 'plannedEffectiveDate',
      label: '计划生效 / 优先级',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleCase
        return (
          <BusinessTableIdentityCell
            primary={item.plannedEffectiveDate}
            secondary={userStore.getDictLabelByValue(
              'hrLifecyclePriority',
              item.priority,
              item.priority ?? '--'
            )}
          />
        )
      }
    },
    {
      prop: 'taskProgress',
      label: '任务闭环',
      minWidth: 185,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleCase
        return progress(item.closedTaskCount, item.taskCount, item.overdueTaskCount)
      }
    },
    {
      prop: 'owner',
      label: '负责人',
      minWidth: 130,
      formatter: (row) => (row as Api.Hr.LifecycleCase).owner?.name ?? '未指定'
    },
    {
      prop: 'executionStatus',
      label: '执行状态',
      width: 105,
      dict: { code: 'hrLifecycleExecutionStatus', display: 'auto' }
    },
    actionColumn()
  ]
  const taskColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'taskName',
      label: '执行任务',
      minWidth: 250,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTask
        return (
          <BusinessTableIdentityCell
            primary={item.taskName}
            secondary={`${item.case?.code ?? '--'} · ${item.employee?.name ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'taskType',
      label: '任务类型',
      width: 115,
      dict: { code: 'hrLifecycleTaskType', display: 'auto' }
    },
    {
      prop: 'ownerRole',
      label: '责任泳道 / 负责人',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTask
        return (
          <BusinessTableIdentityCell
            primary={userStore.getDictLabelByValue(
              'hrLifecycleOwnerRole',
              item.ownerRole,
              item.ownerRole ?? '--'
            )}
            secondary={item.owner?.name ?? '待指派'}
          />
        )
      }
    },
    {
      prop: 'dueDate',
      label: '截止日期',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTask
        return deadline(item.dueDate, item.status)
      }
    },
    {
      prop: 'governance',
      label: '门禁要求',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTask
        return (
          [item.required && '必办', item.blocking && '阻断', item.evidenceRequired && '需证据']
            .filter(Boolean)
            .join(' · ') || '可选任务'
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      dict: { code: 'hrLifecycleTaskStatus', display: 'auto' }
    },
    actionColumn()
  ]
  const templateColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'templateName',
      label: '标准任务包',
      minWidth: 245,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTemplate
        return (
          <BusinessTableIdentityCell primary={item.templateName} secondary={item.templateCode} />
        )
      }
    },
    {
      prop: 'caseType',
      label: '适用旅程',
      width: 110,
      dict: { code: 'hrLifecycleCaseType', display: 'auto' }
    },
    {
      prop: 'coverage',
      label: '模板任务 / 已应用',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTemplate
        return (
          <BusinessTableIdentityCell
            primary={`${item.taskCount ?? 0} 项任务`}
            secondary={`${item.usageCount ?? 0} 个事项已应用`}
          />
        )
      }
    },
    {
      prop: 'isDefault',
      label: '默认版本',
      width: 105,
      formatter: (row) => ((row as Api.Hr.LifecycleTemplate).isDefault ? '默认' : '非默认')
    },
    { prop: 'description', label: '治理说明', minWidth: 260, showOverflowTooltip: true },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      dict: { code: 'hrLifecycleTemplateStatus', display: 'auto' }
    },
    actionColumn()
  ]
  const templateTaskColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'taskName',
      label: '模板任务',
      minWidth: 245,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTemplateTask
        return (
          <BusinessTableIdentityCell
            primary={item.taskName}
            secondary={userStore.getDictLabelByValue(
              'hrLifecycleTaskType',
              item.taskType,
              item.taskType ?? '--'
            )}
          />
        )
      }
    },
    {
      prop: 'template',
      label: '所属任务包',
      minWidth: 210,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTemplateTask
        return (
          <BusinessTableIdentityCell
            primary={item.template?.name}
            secondary={item.template?.code}
          />
        )
      }
    },
    {
      prop: 'ownerRole',
      label: '责任泳道',
      width: 115,
      dict: { code: 'hrLifecycleOwnerRole', display: 'auto' }
    },
    {
      prop: 'dueOffsetDays',
      label: '相对生效日',
      width: 125,
      formatter: (row) => {
        const value = (row as Api.Hr.LifecycleTemplateTask).dueOffsetDays
        return value === 0
          ? '生效当天'
          : value < 0
            ? `提前 ${Math.abs(value)} 天`
            : `延后 ${value} 天`
      }
    },
    {
      prop: 'governance',
      label: '门禁要求',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.LifecycleTemplateTask
        return (
          [item.required && '必办', item.blocking && '阻断', item.evidenceRequired && '需证据']
            .filter(Boolean)
            .join(' · ') || '可选任务'
        )
      }
    },
    { prop: 'sort', label: '排序', width: 80 },
    actionColumn()
  ]

  const permissionFor = (action: 'add' | 'edit' | 'delete') =>
    activeEntity.value === 'template' || activeEntity.value === 'template_task'
      ? 'Hr:Lifecycle:ManageTemplate'
      : `Hr:Lifecycle:${action === 'add' ? 'Add' : action === 'edit' ? 'Edit' : 'Delete'}`
  const canEdit = (row: RecordItem) =>
    activeEntity.value === 'case'
      ? (row as Api.Hr.LifecycleCase).executionStatus === 'planning' &&
        ['draft', 'rejected'].includes((row as Api.Hr.LifecycleCase).status)
      : activeEntity.value === 'task'
        ? ['pending', 'processing'].includes((row as Api.Hr.LifecycleTask).status)
        : activeEntity.value === 'template'
          ? (row as Api.Hr.LifecycleTemplate).status !== 'active'
          : (row as Api.Hr.LifecycleTemplateTask).template?.status !== 'active'
  const canDelete = (row: RecordItem) =>
    activeEntity.value === 'case'
      ? (row as Api.Hr.LifecycleCase).executionStatus === 'planning' &&
        ['draft', 'rejected'].includes((row as Api.Hr.LifecycleCase).status)
      : activeEntity.value === 'task'
        ? (row as Api.Hr.LifecycleTask).status === 'pending'
        : activeEntity.value === 'template'
          ? (row as Api.Hr.LifecycleTemplate).status !== 'active'
          : (row as Api.Hr.LifecycleTemplateTask).template?.status !== 'active'
  const transitionActions = (row: RecordItem): ButtonMoreItem[] => {
    if (!row.id) return []
    const actions: ButtonMoreItem[] = []
    if (activeEntity.value === 'case') {
      const item = row as Api.Hr.LifecycleCase
      actions.push({
        key: 'view_tasks',
        label: '查看执行任务',
        icon: 'ri:list-check-3',
        auth: 'Hr:Lifecycle:View'
      })
      if (item.status === 'draft' && item.executionStatus === 'planning')
        actions.unshift({
          key: 'submit_case',
          label: '提交事项审批',
          icon: 'ri:send-plane-line',
          auth: 'Hr:Lifecycle:Submit'
        })
      if (['approved', 'effective'].includes(item.status) && item.executionStatus === 'planning')
        actions.unshift({
          key: 'start_case',
          label: '启动生命周期事项',
          icon: 'ri:play-circle-line',
          auth: 'Hr:Lifecycle:Start'
        })
      if (item.executionStatus === 'in_progress')
        actions.unshift(
          {
            key: 'ready_case',
            label: '校验事项就绪',
            icon: 'ri:shield-check-line',
            auth: 'Hr:Lifecycle:Start'
          },
          {
            key: 'cancel_case',
            label: '取消生命周期事项',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Lifecycle:Start'
          }
        )
      if (item.executionStatus === 'ready')
        actions.unshift(
          {
            key: 'complete_case',
            label: '确认事项生效',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:Lifecycle:CompleteCase'
          },
          {
            key: 'cancel_case',
            label: '取消生命周期事项',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Lifecycle:Start'
          }
        )
    }
    if (activeEntity.value === 'task') {
      const item = row as Api.Hr.LifecycleTask
      if (item.status === 'pending')
        actions.push(
          {
            key: 'start_task',
            label: '开始执行任务',
            icon: 'ri:play-circle-line',
            auth: 'Hr:Lifecycle:CompleteTask'
          },
          {
            key: 'complete_task',
            label: '完成执行任务',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:Lifecycle:CompleteTask'
          },
          {
            key: 'waive_task',
            label: '豁免执行任务',
            icon: 'ri:shield-check-line',
            auth: 'Hr:Lifecycle:WaiveTask'
          }
        )
      if (item.status === 'processing')
        actions.push(
          {
            key: 'complete_task',
            label: '完成执行任务',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:Lifecycle:CompleteTask'
          },
          {
            key: 'waive_task',
            label: '豁免执行任务',
            icon: 'ri:shield-check-line',
            auth: 'Hr:Lifecycle:WaiveTask'
          }
        )
      if (['completed', 'skipped'].includes(item.status))
        actions.push({
          key: 'reopen_task',
          label: '重新打开任务',
          icon: 'ri:arrow-go-back-line',
          auth: 'Hr:Lifecycle:CompleteTask'
        })
    }
    if (activeEntity.value === 'template') {
      const item = row as Api.Hr.LifecycleTemplate
      actions.push({
        key: item.status === 'active' ? 'deactivate_template' : 'activate_template',
        label: item.status === 'active' ? '停用任务模板' : '启用任务模板',
        icon: item.status === 'active' ? 'ri:stop-circle-line' : 'ri:play-circle-line',
        auth: 'Hr:Lifecycle:ManageTemplate'
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
        {canEdit(row) ? (
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
    if (activeEntity.value === 'case') {
      const record = row as Api.Hr.LifecycleCase
      if (item.key === 'view_tasks') return openCaseTasks(record)
      if (item.key === 'submit_case') return await handleSubmitApproval(record)
      if (item.key === 'start_case') return await handleCaseTransition(record, 'start')
      if (item.key === 'ready_case') return await handleCaseTransition(record, 'ready')
      if (item.key === 'cancel_case') return await handleCaseTransition(record, 'cancel')
      if (item.key === 'complete_case') return await handleCaseTransition(record, 'complete')
    }
    if (activeEntity.value === 'task') {
      const record = row as Api.Hr.LifecycleTask
      if (item.key === 'start_task') return await handleTaskTransition(record, 'start')
      if (item.key === 'complete_task') return await handleTaskTransition(record, 'complete')
      if (item.key === 'waive_task') return await handleTaskTransition(record, 'waive')
      if (item.key === 'reopen_task') return await handleTaskTransition(record, 'reopen')
    }
    if (activeEntity.value === 'template') {
      const record = row as Api.Hr.LifecycleTemplate
      if (item.key === 'activate_template')
        return await handleTemplateTransition(record, 'activate')
      if (item.key === 'deactivate_template')
        return await handleTemplateTransition(record, 'deactivate')
    }
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: {
        case: '新增生命周期事项',
        task: '新增执行任务',
        template: '新增标准任务包',
        template_task: '新增模板任务'
      }[activeEntity.value],
      permission: permissionFor('add'),
      onClick: () => openDialog(activeEntity.value)
    }
  ])

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const response = await fetchLifecycleRecords(activeEntity.value, { ...params, from, to })
    return response
  }
  const loadReferences = async () => {
    const tenantId = tableState.searchQuery.tenantId
    const [cases, templates] = await Promise.all([
      fetchLifecycleOptions('case', tenantId),
      fetchLifecycleOptions('template', tenantId)
    ])
    caseOptions.value = cases.data ?? []
    templateOptions.value = templates.data ?? []
  }
  const refreshOverview = async () => {
    const response = await fetchLifecycleOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const handleTenantFilterChange = async () => {
    Object.assign(tableState.searchQuery, { caseId: '', templateId: '' })
    await Promise.all([loadReferences(), refreshOverview()])
  }
  const openDialog = (entityValue: Entity, row?: RecordItem, preset?: Record<string, unknown>) =>
    void dialogRef.value?.handleOpen({
      entity: entityValue,
      type: row ? 'edit' : 'add',
      editData: row,
      preset: { tenantId: tableState.searchQuery.tenantId || undefined, ...preset }
    })
  const handleSaveSuccess = (type: DialogType) => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void Promise.all([refreshOverview(), loadReferences()])
  }
  const handleTabChange = () =>
    Object.assign(tableState.searchQuery, { keyword: '', status: '', caseId: '', templateId: '' })
  const openCaseTasks = (row: Api.Hr.LifecycleCase) => {
    activeEntity.value = 'task'
    Object.assign(tableState.searchQuery, {
      keyword: '',
      status: '',
      caseId: row.id ?? '',
      templateId: ''
    })
  }
  const refreshAfterAction = async () => {
    await tableQueryRef.value?.getData()
    await Promise.all([refreshOverview(), loadReferences()])
  }
  const handleDelete = async (row: RecordItem) => {
    if (!row.id) return
    const entity = activeEntity.value
    const label =
      entity === 'case'
        ? (row as Api.Hr.LifecycleCase).caseNo
        : entity === 'template'
          ? `${(row as Api.Hr.LifecycleTemplate).templateName}（${(row as Api.Hr.LifecycleTemplate).templateCode}）`
          : (row as Api.Hr.LifecycleTask | Api.Hr.LifecycleTemplateTask).taskName
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: permissionFor('delete'),
      remove: () => deleteLifecycleRecord(entity, row.id!),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
        await Promise.all([refreshOverview(), loadReferences()])
      }
    })
  }
  const handleSubmitApproval = async (row: Api.Hr.LifecycleCase) => {
    if (!row.id) return
    try {
      await confirmAction('提交后事项进入审批流程，审批通过前不能启动执行。', '提交生命周期事项', {
        confirmButtonText: '提交审批',
        cancelButtonText: '取消',
        type: 'info'
      })
      await submitHrApproval('hr_lifecycle_case', row.id)
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '生命周期事项提交失败，请刷新状态后重试')
    }
  }
  const handleCaseTransition = async (
    row: Api.Hr.LifecycleCase,
    action: Api.Hr.LifecycleCaseAction
  ) => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'cancel')
        comment = await promptText('请输入取消事项的业务原因。', '取消生命周期事项', {
          minLength: 2,
          maxLength: 500
        })
      else
        await confirmAction(
          action === 'start'
            ? '启动后将按责任泳道和截止日期推进实际任务。'
            : action === 'ready'
              ? '系统将校验所有阻断任务，确认后事项进入待生效状态。'
              : `确认事项已于 ${row.plannedEffectiveDate} 生效并完成归档？`,
          action === 'start' ? '启动事项' : action === 'ready' ? '校验就绪' : '确认生效',
          { confirmButtonText: '确认', cancelButtonText: '取消', type: 'info' }
        )
      await transitionLifecycleCase(
        row.id,
        action,
        comment,
        action === 'complete' ? row.plannedEffectiveDate : undefined
      )
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '生命周期事项状态更新失败，请刷新后重试')
    }
  }
  const handleTaskTransition = async (
    row: Api.Hr.LifecycleTask,
    action: Api.Hr.LifecycleTaskAction
  ) => {
    if (!row.id) return
    try {
      let note: string | undefined
      if (action === 'complete')
        note = await promptText(
          row.evidenceRequired
            ? '该任务要求完成证据，请填写完成结果或证据说明。'
            : '请填写任务完成说明。',
          '完成执行任务',
          { minLength: row.evidenceRequired ? 2 : 0, maxLength: 1000 }
        )
      if (action === 'waive')
        note = await promptText('豁免会保留在审计记录中，请填写充分的业务原因。', '豁免执行任务', {
          minLength: 2,
          maxLength: 1000
        })
      if (action === 'reopen')
        await confirmAction('重新打开后，事项需要再次通过就绪门禁。', '重新打开任务', {
          confirmButtonText: '重新打开',
          cancelButtonText: '取消',
          type: 'warning'
        })
      await transitionLifecycleTask(row.id, action, note)
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '执行任务状态更新失败，请刷新后重试')
    }
  }
  const handleTemplateTransition = async (
    row: Api.Hr.LifecycleTemplate,
    action: Api.Hr.LifecycleTemplateAction
  ) => {
    if (!row.id) return
    try {
      await confirmAction(
        action === 'activate'
          ? '启用后可用于新建事项；已有在途事项仍保留原任务快照。'
          : '停用后不再用于新建事项，已有事项不受影响。',
        action === 'activate' ? '启用标准任务包' : '停用标准任务包',
        {
          confirmButtonText: action === 'activate' ? '启用' : '停用',
          cancelButtonText: '取消',
          type: 'info'
        }
      )
      await transitionLifecycleTemplate(row.id, action)
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '标准任务包状态更新失败，请刷新后重试')
    }
  }

  onMounted(async () => {
    if (isPlatformSuper.value) {
      const tenants = await fetchEnabledTenantList()
      tenantOptions.value = (tenants.data ?? [])
        .filter((tenant): tenant is typeof tenant & { id: string } => Boolean(tenant.id))
        .map((tenant) => ({ label: tenant.tenantName, value: tenant.id }))
    }
    await Promise.all([loadReferences(), refreshOverview()])
  })
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .lifecycle-page {
    @include hr-table-workspace-layout(360px);

    &__journey {
      padding: 18px 20px 0;
      overflow: hidden;
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--theme-color) 5%, transparent),
          transparent 44%
        ),
        var(--default-box-color);
      border: 1px solid var(--art-border-color);
      border-radius: var(--art-surface-radius);
    }

    &__heading,
    &__heading > div,
    &__governance,
    &__note {
      display: flex;
      align-items: center;
    }

    &__heading {
      gap: 18px;
      justify-content: space-between;
      margin-bottom: 16px;

      > div {
        gap: 11px;
        min-width: 0;
      }

      strong,
      small {
        display: block;
      }

      strong {
        font-size: 16px;
        line-height: 1.4;
        color: var(--art-gray-900);
      }

      small {
        margin-top: 2px;
        font-size: 12px;
        color: var(--art-gray-600);
      }
    }

    &__section-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 11%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 20%, var(--art-border-color));
      border-radius: var(--el-border-radius-base);
    }

    &__governance {
      flex: 0 0 auto;
      gap: 6px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-border-color));
      border-radius: 999px;
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      padding: 0;
      margin: 0 0 16px;
      overflow: hidden;
      list-style: none;
      border: 1px solid var(--art-border-color);
      border-radius: var(--el-border-radius-base);

      li {
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        min-width: 0;
        padding: 13px 14px;
        background: color-mix(in srgb, var(--art-gray-100) 45%, var(--default-box-color));

        & + li {
          border-left: 1px solid var(--art-border-color);
        }

        &.is-current {
          background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
        }

        &.is-complete .lifecycle-page__rail-icon {
          color: var(--el-color-success);
          background: color-mix(in srgb, var(--el-color-success) 10%, var(--default-box-color));
        }

        strong,
        small {
          display: block;
        }

        strong {
          font-size: 13px;
          color: var(--art-gray-900);
        }

        small {
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          color: var(--art-gray-600);
          white-space: nowrap;
        }

        b {
          font-size: 12px;
          font-weight: 600;
          color: var(--art-gray-800);
          white-space: nowrap;
        }
      }
    }

    &__rail-index {
      font-size: 11px;
      font-weight: 700;
      color: var(--art-gray-500);
      letter-spacing: 0.06em;
    }

    &__rail-icon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-radius: 50%;
    }

    &__note {
      gap: 7px;
      padding: 10px 0 12px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--art-gray-600);
      border-top: 1px dashed var(--art-border-color);
    }

    &__progress {
      min-width: 0;

      span {
        display: flex;
        gap: 8px;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 5px;
      }

      strong {
        color: var(--art-gray-900);
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--art-gray-600);
        white-space: nowrap;
      }
    }

    &__deadline.is-overdue {
      font-weight: 600;
      color: var(--el-color-danger);
    }

    &__actions {
      display: flex;
      flex-wrap: nowrap;
      gap: 2px;
      align-items: center;
      white-space: nowrap;
    }

    :deep(.hr-entity-navigation) {
      margin: 0 -20px;
      border-top: 1px solid var(--art-border-color);
    }
  }

  @media only screen and (width <= 1100px) {
    .lifecycle-page__rail {
      grid-template-columns: repeat(2, minmax(0, 1fr));

      li:nth-child(3) {
        border-top: 1px solid var(--art-border-color);
        border-left: 0;
      }

      li:nth-child(4) {
        border-top: 1px solid var(--art-border-color);
      }
    }
  }

  @media only screen and (width <= 700px) {
    .lifecycle-page {
      &__journey {
        padding: 15px 14px 0;
      }

      &__heading {
        align-items: flex-start;
      }

      &__governance {
        display: none;
      }

      &__rail {
        grid-template-columns: 1fr;

        li + li,
        li:nth-child(3),
        li:nth-child(4) {
          border-top: 1px solid var(--art-border-color);
          border-left: 0;
        }
      }

      :deep(.hr-entity-navigation) {
        margin: 0 -14px;
      }
    }
  }
</style>
