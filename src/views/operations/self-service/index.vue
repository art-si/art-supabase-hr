<template>
  <ArtPermissionGuard permission="Hr:SelfService:View">
    <div class="service-delivery-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="EMPLOYEE SERVICE DELIVERY"
        title="员工服务交付"
        description="以统一服务目录承接员工诉求，用明确处理人、SLA 与不可变沟通轨迹闭环每一次服务交付。"
        icon="ri:customer-service-2-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section
        class="service-delivery-page__control"
        aria-labelledby="service-delivery-control-title"
      >
        <header class="service-delivery-page__heading">
          <div>
            <span class="service-delivery-page__section-icon">
              <ArtSvgIcon icon="ri:route-line" />
            </span>
            <span>
              <strong id="service-delivery-control-title">服务交付控制链</strong>
              <small>服务入口、受理责任、员工补充与解决确认保持同一条可审计轨迹</small>
            </span>
          </div>
          <span class="service-delivery-page__governance">
            <ArtSvgIcon icon="ri:shield-check-line" />租户隔离 · SLA 留痕
          </span>
        </header>

        <ol class="service-delivery-page__rail" aria-label="员工服务交付阶段">
          <li v-for="(stage, index) in deliveryStages" :key="stage.label" :class="stage.state">
            <span class="service-delivery-page__rail-index">0{{ index + 1 }}</span>
            <span class="service-delivery-page__rail-icon"><ArtSvgIcon :icon="stage.icon" /></span>
            <div>
              <strong>{{ stage.label }}</strong>
              <small>{{ stage.description }}</small>
            </div>
            <b>{{ stage.value }}</b>
          </li>
        </ol>

        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="员工服务交付分类"
          compact
          @change="handleTabChange"
        />
        <footer class="service-delivery-page__note">
          <ArtSvgIcon icon="ri:information-line" />
          普通员工只能查看和推进本人服务工单；团队队列、分派、解决和服务目录维护均由受控权限与服务端
          RPC 双重校验。
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
          emptyText: activeEntity === 'request' ? '暂无员工服务工单' : '暂无可用服务',
          emptyDescription: activeTab.emptyDescription
        }"
        focusable
      />

      <ServiceDeliveryDialog ref="dialogRef" @success="handleSaveSuccess" />
      <ServiceAssignmentDialog ref="assignmentDialogRef" @success="refreshAfterAction" />
      <ServiceRequestDrawer ref="requestDrawerRef" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import { ElTag } from 'element-plus'
  import { useRoute, useRouter } from 'vue-router'
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
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatDateTimeValue as formatDateTime } from '@/utils/ui/format'
  import type { ColumnOption, DialogType } from '@/types'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import {
    deleteServiceRequest,
    fetchServiceDeliveryOverview,
    fetchServiceDeliveryRecords,
    transitionServiceRequest
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import ServiceAssignmentDialog from './modules/service-assignment-dialog.vue'
  import ServiceDeliveryDialog from './modules/service-delivery-dialog.vue'
  import ServiceRequestDrawer from './modules/service-request-drawer.vue'

  defineOptions({ name: 'HrSelfService' })

  const queueScopeOptions = useDictionaryOptions('hrServiceQueueScope')

  type Entity = Api.Hr.ServiceDeliveryEntity
  type RecordItem = Api.Hr.ServiceDeliveryRecord
  type TableParams = Api.Hr.ServiceDeliverySearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyDescription: string
  }
  interface DeliveryDialogExpose {
    handleOpen: (payload: {
      entity: Entity
      type: DialogType
      managerView: boolean
      editData?: RecordItem
      preset?: Partial<Api.Hr.ServiceRequest>
    }) => Promise<void>
  }
  interface AssignmentDialogExpose {
    handleOpen: (request: Api.Hr.ServiceRequest) => Promise<void>
  }
  interface RequestDrawerExpose {
    handleOpen: (id: string) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'request',
      label: '服务工单',
      description: '诉求、责任人与 SLA',
      emptyDescription: '从服务目录发起工单后，可在这里跟踪受理、补充、解决和确认过程。',
      icon: 'ri:customer-service-2-line'
    },
    {
      value: 'service',
      label: '服务目录',
      description: '入口、队列与交付承诺',
      emptyDescription: '维护员工可发现的服务项目，并明确受理队列和交付时限。',
      icon: 'ri:service-line'
    }
  ]

  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('request')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    'hr_self_service_request',
    '服务工单'
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DeliveryDialogExpose>()
  const assignmentDialogRef = ref<AssignmentDialogExpose>()
  const requestDrawerRef = ref<RequestDrawerExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.ServiceDeliverySearchParams }>({
    searchQuery: { keyword: '', status: '', category: '', scope: 'mine', tenantId: '' }
  })
  const overview = reactive<Api.Hr.ServiceDeliveryOverview>({
    availableServiceCount: 0,
    openRequestCount: 0,
    slaRiskCount: 0,
    unassignedCount: 0,
    resolvedMonthCount: 0,
    responseOnTimeRate: 0,
    managerView: false
  })

  const managerView = computed(() => overview.managerView || isPlatformSuper.value)
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    { hr_self_service_request: 'request', hr_service_catalog: 'service' },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      tableState.searchQuery.category = ''
      tableState.searchQuery.scope = managerView.value ? 'team' : 'mine'
    }
  )
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '员工可追踪', type: 'primary', effect: 'plain' },
    { label: 'SLA 自动计时', type: 'warning', effect: 'light' },
    { label: '交付全留痕', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '可用服务',
      value: overview.availableServiceCount,
      description: '统一员工服务入口',
      icon: 'ri:service-line',
      tone: 'primary'
    },
    {
      label: '处理中工单',
      value: overview.openRequestCount,
      description: `${overview.unassignedCount} 条尚未分派`,
      icon: 'ri:customer-service-2-line',
      tone: overview.unassignedCount ? 'warning' : 'info'
    },
    {
      label: 'SLA 风险',
      value: overview.slaRiskCount,
      description: '临近或已经超过时限',
      icon: 'ri:alarm-warning-line',
      tone: overview.slaRiskCount ? 'danger' : 'success'
    },
    {
      label: '首次响应准时率',
      value: `${overview.responseOnTimeRate}%`,
      description: `本月已解决 ${overview.resolvedMonthCount} 条`,
      icon: 'ri:verified-badge-line',
      tone: overview.responseOnTimeRate >= 95 ? 'success' : 'info'
    }
  ])
  const deliveryStages = computed(() => [
    {
      label: '发现服务',
      description: '目录、说明与受理方式',
      value: `${overview.availableServiceCount} 项可用`,
      icon: 'ri:compass-3-line',
      state: overview.availableServiceCount ? 'is-complete' : 'is-current'
    },
    {
      label: '提交诉求',
      description: '问题、附件与优先级',
      value: `${overview.openRequestCount} 条进行中`,
      icon: 'ri:file-add-line',
      state: overview.openRequestCount ? 'is-current' : ''
    },
    {
      label: '受理协同',
      description: '唯一责任人与员工补充',
      value: `${overview.unassignedCount} 条待分派`,
      icon: 'ri:user-settings-line',
      state: overview.unassignedCount ? 'is-risk' : 'is-complete'
    },
    {
      label: '解决确认',
      description: '结果交付与重开闭环',
      value: `${overview.resolvedMonthCount} 条本月解决`,
      icon: 'ri:checkbox-circle-line',
      state: overview.slaRiskCount ? 'is-risk' : 'is-complete'
    }
  ])

  const statusTone = (status: Api.Hr.ServiceRequestStatus) =>
    ['resolved', 'closed'].includes(status)
      ? 'success'
      : ['submitted', 'waiting_employee'].includes(status)
        ? 'warning'
        : ['assigned', 'in_progress'].includes(status)
          ? 'primary'
          : 'info'
  const slaTone = (status?: Api.Hr.ServiceRequestSlaStatus) =>
    status === 'breached'
      ? 'danger'
      : status === 'at_risk'
        ? 'warning'
        : status === 'on_track'
          ? 'success'
          : 'info'
  const slaLabel = (status?: Api.Hr.ServiceRequestSlaStatus): string =>
    ({ clear: '停止计时', on_track: 'SLA 正常', at_risk: 'SLA 临近', breached: 'SLA 超时' })[
      status || 'clear'
    ]

  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (isPlatformSuper.value) {
      items.push({
        label: '租户',
        key: 'tenantId',
        type: 'select',
        options: tenantOptions.value,
        props: {
          clearable: true,
          filterable: true,
          placeholder: '全部租户',
          onChange: () => void refreshOverview()
        }
      })
    }
    if (activeEntity.value === 'request' && managerView.value) {
      items.push({
        label: '范围',
        key: 'scope',
        type: 'select',
        options: queueScopeOptions,
        props: { clearable: false }
      })
    }
    if (activeEntity.value === 'request') {
      items.push({
        label: '状态',
        key: 'status',
        type: 'select',
        options: getDictMap.value.hrServiceRequestStatus ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      })
    }
    items.push({
      label: '类别',
      key: 'category',
      type: 'select',
      options: getDictMap.value.hrServiceCategory ?? [],
      props: { clearable: true, placeholder: '全部类别' }
    })
    items.push({
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder:
          activeEntity.value === 'request' ? '工单编号、主题或员工' : '服务编码、名称或受理组'
      }
    })
    return items
  })

  const requestColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'requestNo',
      label: '工单 / 申请员工',
      minWidth: 220,
      fixed: 'left',
      link: {
        permission: 'Hr:SelfService:View',
        onClick: (row) => {
          if (row.id) void requestDrawerRef.value?.handleOpen(row.id)
        }
      },
      formatter: (row) => {
        const item = row as Api.Hr.ServiceRequest
        return (
          <BusinessTableIdentityCell
            primary={item.requestNo}
            secondary={`${item.requester?.name ?? '--'} · ${item.requester?.code ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'title',
      label: '诉求 / 服务项目',
      minWidth: 245,
      formatter: (row) => {
        const item = row as Api.Hr.ServiceRequest
        return (
          <BusinessTableIdentityCell
            primary={item.title}
            secondary={item.service?.name ?? item.requestType}
          />
        )
      }
    },
    {
      prop: 'assignee',
      label: '处理责任',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.ServiceRequest
        return (
          <BusinessTableIdentityCell
            primary={item.assignee?.name ?? '待分派'}
            secondary={item.service?.routingGroup ?? 'HR 服务台'}
          />
        )
      }
    },
    {
      prop: 'priority',
      label: '优先级',
      width: 100,
      dict: { code: 'hrServicePriority', display: 'auto' }
    },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      formatter: (row) => {
        const item = row as Api.Hr.ServiceRequest
        return (
          <ElTag type={statusTone(item.status)} effect="light">
            {userStore.getDictLabelByValue(
              'hrServiceRequestStatus',
              item.status,
              item.status ?? '--'
            )}
          </ElTag>
        )
      }
    },
    {
      prop: 'slaStatus',
      label: 'SLA / 解决时限',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.ServiceRequest
        return (
          <div class="service-delivery-page__sla">
            <ElTag type={slaTone(item.slaStatus)} effect="plain">
              {slaLabel(item.slaStatus)}
            </ElTag>
            <span>{formatDateTime(item.resolutionDueAt)}</span>
          </div>
        )
      }
    },
    {
      prop: 'lastActivityAt',
      label: '最近活动',
      minWidth: 150,
      formatter: (row) => formatDateTime((row as Api.Hr.ServiceRequest).lastActivityAt)
    },
    requestActionColumn()
  ]
  const serviceColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'serviceName',
      label: '服务项目',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.ServiceCatalog
        return (
          <BusinessTableIdentityCell
            primary={item.serviceName}
            secondary={`${item.serviceCode} · ${userStore.getDictLabelByValue('hrServiceCategory', item.category, item.category ?? '--')}`}
          />
        )
      }
    },
    { prop: 'description', label: '服务说明', minWidth: 280, showOverflowTooltip: true },
    {
      prop: 'serviceMode',
      label: '交付方式',
      minWidth: 130,
      formatter: (row) =>
        (row as Api.Hr.ServiceCatalog).serviceMode === 'case' ? '服务工单' : '专业流程'
    },
    {
      prop: 'routingGroup',
      label: '受理队列',
      minWidth: 145,
      formatter: (row) => (row as Api.Hr.ServiceCatalog).routingGroup || '--'
    },
    {
      prop: 'sla',
      label: '响应 / 解决',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.ServiceCatalog
        return `${item.firstResponseHours} 小时 / ${item.resolutionHours} 小时`
      }
    },
    {
      prop: 'requestCount',
      label: '累计工单',
      width: 105,
      formatter: (row) => `${(row as Api.Hr.ServiceCatalog).requestCount ?? 0} 条`
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      formatter: (row) => (
        <ElTag type={(row as Api.Hr.ServiceCatalog).enabled ? 'success' : 'info'} effect="light">
          {(row as Api.Hr.ServiceCatalog).enabled ? '启用' : '停用'}
        </ElTag>
      )
    },
    serviceActionColumn()
  ]
  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'request' ? requestColumns() : serviceColumns()

  interface ServiceMoreAction extends ButtonMoreItem {
    run: () => void
  }
  const serviceAction = (
    key: string,
    label: string,
    run: () => void,
    icon: string,
    auth?: string,
    color?: string
  ): ServiceMoreAction => ({ key, label, run, icon, auth, color })
  const requestActions = (item: Api.Hr.ServiceRequest): ServiceMoreAction[] => {
    if (!item.id) return []
    if (item.status === 'draft') {
      return [
        serviceAction(
          'submit',
          '提交服务工单',
          () => void handleRequestAction(item, 'submit'),
          'ri:send-plane-line',
          'Hr:SelfService:Submit'
        ),
        serviceAction(
          'edit',
          '编辑服务工单',
          () => openDialog('request', item),
          'ri:edit-line',
          'Hr:SelfService:Edit'
        ),
        serviceAction(
          'delete',
          '删除服务工单',
          () => void handleDelete(item),
          'ri:delete-bin-5-line',
          'Hr:SelfService:Delete',
          'var(--el-color-danger)'
        )
      ]
    }
    if (item.status === 'submitted') {
      return [
        serviceAction(
          'assign',
          '分派服务工单',
          () => void assignmentDialogRef.value?.handleOpen(item),
          'ri:user-settings-line',
          'Hr:SelfService:Assign'
        ),
        serviceAction(
          'start',
          '开始处理',
          () => void handleRequestAction(item, 'start'),
          'ri:play-circle-line',
          'Hr:SelfService:Resolve'
        ),
        serviceAction(
          'cancel',
          '取消服务工单',
          () => void handleRequestAction(item, 'cancel'),
          'ri:close-circle-line',
          'Hr:SelfService:Submit'
        )
      ]
    }
    if (item.status === 'assigned') {
      return [
        serviceAction(
          'reassign',
          '重新分派',
          () => void assignmentDialogRef.value?.handleOpen(item),
          'ri:user-settings-line',
          'Hr:SelfService:Assign'
        ),
        serviceAction(
          'start',
          '开始处理',
          () => void handleRequestAction(item, 'start'),
          'ri:play-circle-line',
          'Hr:SelfService:Resolve'
        ),
        serviceAction(
          'resolve',
          '标记已解决',
          () => void handleRequestAction(item, 'resolve'),
          'ri:checkbox-circle-line',
          'Hr:SelfService:Resolve'
        )
      ]
    }
    if (item.status === 'in_progress') {
      return [
        serviceAction(
          'wait',
          '请求员工补充',
          () => void handleRequestAction(item, 'wait'),
          'ri:question-answer-line',
          'Hr:SelfService:Resolve'
        ),
        serviceAction(
          'resolve',
          '标记已解决',
          () => void handleRequestAction(item, 'resolve'),
          'ri:checkbox-circle-line',
          'Hr:SelfService:Resolve'
        ),
        serviceAction(
          'comment',
          '记录沟通',
          () => void handleRequestAction(item, 'comment'),
          'ri:chat-1-line'
        )
      ]
    }
    if (item.status === 'waiting_employee') {
      return [
        serviceAction(
          'resume',
          '员工已补充',
          () => void handleRequestAction(item, 'resume'),
          'ri:play-circle-line'
        ),
        serviceAction(
          'comment',
          '记录沟通',
          () => void handleRequestAction(item, 'comment'),
          'ri:chat-1-line'
        )
      ]
    }
    if (item.status === 'resolved') {
      return [
        serviceAction(
          'close',
          '确认关闭',
          () => void handleRequestAction(item, 'close'),
          'ri:checkbox-circle-line'
        ),
        serviceAction(
          'reopen',
          '重新打开',
          () => void handleRequestAction(item, 'reopen'),
          'ri:arrow-go-back-line'
        )
      ]
    }
    if (item.status === 'closed')
      return [
        serviceAction(
          'reopen',
          '重新打开',
          () => void handleRequestAction(item, 'reopen'),
          'ri:arrow-go-back-line'
        )
      ]
    return []
  }
  const requestActionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'action',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => {
      const item = row as Api.Hr.ServiceRequest
      return (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            label="查看服务工单详情"
            permission="Hr:SelfService:View"
            onClick={() => item.id && void requestDrawerRef.value?.handleOpen(item.id)}
          />
          <ArtButtonMore
            list={() => requestActions(item)}
            onClick={(action: ButtonMoreItem) =>
              requestActions(item)
                .find((candidate) => candidate.key === action.key)
                ?.run()
            }
          />
        </BusinessTableRowActions>
      )
    }
  })
  const serviceActionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'action',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => {
      const item = row as Api.Hr.ServiceCatalog
      return (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            label="编辑服务项目"
            permission="Hr:SelfService:Catalog:Manage"
            onClick={() => openDialog('service', item)}
          />
          <ArtButtonMore
            list={() => {
              const actions: ServiceMoreAction[] = []
              if (item.enabled && item.serviceMode === 'case')
                actions.push(
                  serviceAction(
                    'start_service',
                    '发起服务',
                    () =>
                      openDialog('request', undefined, {
                        serviceId: item.id,
                        requestType: item.category,
                        title: item.serviceName,
                        priority: 'normal',
                        channel: 'self_service'
                      }),
                    'ri:add-circle-line'
                  )
                )
              if (item.enabled && item.serviceMode === 'redirect' && item.routePath)
                actions.push(
                  serviceAction(
                    'open_route',
                    '进入服务流程',
                    () => void router.push(item.routePath!),
                    'ri:external-link-line'
                  )
                )
              return actions
            }}
            onClick={(action: ButtonMoreItem) => {
              if (action.key === 'start_service')
                openDialog('request', undefined, {
                  serviceId: item.id,
                  requestType: item.category,
                  title: item.serviceName,
                  priority: 'normal',
                  channel: 'self_service'
                })
              if (action.key === 'open_route' && item.routePath) void router.push(item.routePath)
            }}
          />
        </BusinessTableRowActions>
      )
    }
  })

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: activeEntity.value === 'request' ? '新建服务工单' : '新增服务项目',
      permission:
        activeEntity.value === 'request' ? 'Hr:SelfService:Add' : 'Hr:SelfService:Catalog:Manage',
      onClick: () => openDialog(activeEntity.value)
    }
  ])
  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const response = await fetchServiceDeliveryRecords(activeEntity.value, { ...params, from, to })
    return response
  }
  const refreshOverview = async () => {
    const response = await fetchServiceDeliveryOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const openDialog = (entity: Entity, row?: RecordItem, preset?: Partial<Api.Hr.ServiceRequest>) =>
    void dialogRef.value?.handleOpen({
      entity,
      type: row ? 'edit' : 'add',
      managerView: managerView.value,
      editData: row,
      preset
    })
  const handleSaveSuccess = (type: DialogType, entity: Entity) => {
    if (entity === activeEntity.value) {
      void (type === 'add'
        ? tableQueryRef.value?.refreshCreate()
        : tableQueryRef.value?.refreshUpdate())
    } else {
      activeEntity.value = entity
    }
    void refreshOverview()
  }
  const handleTabChange = () =>
    Object.assign(tableState.searchQuery, {
      keyword: '',
      status: '',
      category: '',
      scope: activeEntity.value === 'request' ? 'mine' : undefined
    })
  const refreshAfterAction = async () => {
    await tableQueryRef.value?.getData()
    await refreshOverview()
  }
  const handleDelete = async (item: Api.Hr.ServiceRequest) => {
    if (!item.id) return
    const label = `${item.title}（${item.requestNo}）`
    await deleteRecord({
      resource: { id: item.id, label },
      permission: 'Hr:SelfService:Delete',
      remove: () => deleteServiceRequest(item.id!),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
        await refreshOverview()
      }
    })
  }
  const handleRequestAction = async (
    item: Api.Hr.ServiceRequest,
    action: Api.Hr.ServiceRequestAction
  ) => {
    if (!item.id) return
    try {
      let comment: string | undefined
      if (['wait', 'resolve', 'reopen', 'comment'].includes(action)) {
        const prompts: Partial<Record<Api.Hr.ServiceRequestAction, [string, string]>> = {
          wait: ['说明需要员工补充的材料或信息，内容会写入服务轨迹。', '请求员工补充'],
          resolve: ['填写可供员工确认的解决结果，内容会写入服务轨迹。', '提交解决结果'],
          reopen: ['说明重新打开工单的原因，系统将重新启动解决计时。', '重新打开工单'],
          comment: ['输入本次沟通内容，保存后不可从服务轨迹中删除。', '添加沟通记录']
        }
        const [message, title] = prompts[action]!
        comment = await promptText(message, title, { minLength: 2, maxLength: 800 })
      } else if (['submit', 'start', 'resume', 'close', 'cancel'].includes(action)) {
        const labels: Partial<Record<Api.Hr.ServiceRequestAction, string>> = {
          submit: '提交后工单将进入服务队列并开始 SLA 计时，是否继续？',
          start: '确认开始处理该服务工单？',
          resume: '确认员工已补充所需信息并恢复处理？',
          close: '确认解决结果已交付并关闭工单？',
          cancel: '确认取消该服务工单？'
        }
        await confirmAction(labels[action]!, '服务工单状态确认', {
          confirmButtonText: '确认',
          cancelButtonText: '取消',
          type: action === 'cancel' ? 'warning' : 'info'
        })
      }
      await transitionServiceRequest(item.id, action, undefined, comment)
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '服务工单处理失败，请刷新状态后重试')
    }
  }

  onMounted(async () => {
    if (isPlatformSuper.value) {
      const response = await fetchEnabledTenantList()
      tenantOptions.value = (response.data ?? [])
        .filter((tenant): tenant is typeof tenant & { id: string } => Boolean(tenant.id))
        .map((tenant) => ({ label: tenant.tenantName, value: tenant.id }))
    }
    await refreshOverview()
    if (
      route.query.fromMasterDelete === '1' &&
      route.query.dependencyCode === 'hr_self_service_request' &&
      managerView.value &&
      tableState.searchQuery.scope === 'mine'
    ) {
      tableState.searchQuery.scope = 'team'
      await tableQueryRef.value?.refreshData()
    }
  })
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .service-delivery-page {
    @include hr-table-workspace-layout(360px);

    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;

    &__control {
      display: grid;
      gap: 14px;
      min-width: 0;
      padding: 18px;
      background: var(--default-box-color);
      border: 1px solid var(--art-surface-border);
      border-radius: var(--art-surface-radius);
      box-shadow: var(--art-surface-shadow);
    }

    &__heading,
    &__heading > div,
    &__governance,
    &__rail li,
    &__actions,
    &__sla {
      display: flex;
      align-items: center;
    }

    &__heading {
      gap: 16px;
      justify-content: space-between;

      > div {
        gap: 12px;
        min-width: 0;
      }

      strong,
      small {
        display: block;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 3px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 38px;
      height: 38px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--el-border-radius-base);
    }

    &__governance {
      flex: 0 0 auto;
      gap: 6px;
      padding: 7px 11px;
      font-size: 12px;
      color: var(--el-text-color-regular);
      background: color-mix(in srgb, var(--el-color-success) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--el-color-success) 20%, var(--art-card-border));
      border-radius: 999px;
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      min-width: 0;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        position: relative;
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr);
        gap: 3px 10px;
        min-width: 0;
        padding: 13px;
        background: color-mix(in srgb, var(--default-box-color) 92%, var(--theme-color));
        border: 1px solid var(--art-card-border);
        border-radius: var(--art-surface-radius);

        &.is-current {
          border-color: color-mix(in srgb, var(--theme-color) 38%, var(--art-card-border));
        }

        &.is-risk {
          border-color: color-mix(in srgb, var(--el-color-warning) 42%, var(--art-card-border));
        }

        &.is-complete .service-delivery-page__rail-icon {
          color: var(--el-color-success);
          background: color-mix(in srgb, var(--el-color-success) 11%, transparent);
        }

        div {
          min-width: 0;
        }

        strong,
        small,
        b {
          display: block;
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 13px;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }

        small {
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        b {
          grid-column: 2;
          margin-top: 4px;
          font-size: 12px;
          font-weight: 600;
          color: var(--theme-color);
        }
      }
    }

    &__rail-index {
      position: absolute;
      top: 7px;
      right: 9px;
      font-size: 10px;
      color: var(--el-text-color-secondary);
    }

    &__rail-icon {
      display: grid;
      grid-row: 1 / span 2;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, transparent);
      border-radius: var(--el-border-radius-base);
    }

    &__note {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      font-size: 12px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
    }

    &__actions {
      flex-wrap: wrap;
      gap: 0 4px;
    }

    &__sla {
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  @media (width <= 1180px) {
    .service-delivery-page__rail {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width <= 720px) {
    .service-delivery-page {
      &__control {
        padding: 14px;
      }

      &__heading {
        flex-direction: column;
        align-items: flex-start;
      }

      &__rail {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
