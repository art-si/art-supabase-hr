<template>
  <ArtPermissionGuard permission="Hr:OrganizationDesign:View">
    <div class="org-design-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="ORGANIZATION DESIGN & CHANGE GOVERNANCE"
        title="组织变革方案"
        description="在不扰动当前组织主数据的前提下，设计新增、更名、迁移与停用方案，固化员工、岗位、招聘、权限和政策范围影响，再经评审批准后移交实施。"
        icon="ri:organization-chart"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
        ><template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template
      ></BusinessWorkspaceHeader>

      <section class="org-design-page__command" aria-labelledby="org-design-command-title">
        <header>
          <div
            ><span class="org-design-page__command-icon"><ArtSvgIcon icon="ri:route-line" /></span
            ><span>
              <small>SAFE CHANGE PATH</small
              ><strong id="org-design-command-title">先模拟影响，再批准移交</strong>
              <em>情景方案与组织主数据执行分层，避免结构调整静默改变权限与历史统计口径</em>
            </span></div
          >
          <ElTag :type="overview.highRiskCount ? 'danger' : 'success'" effect="light" round>
            <ArtSvgIcon
              :icon="overview.highRiskCount ? 'ri:alarm-warning-line' : 'ri:shield-check-line'"
            />
            {{
              overview.highRiskCount ? `${overview.highRiskCount} 个高风险方案` : '当前无高风险待办'
            }}
          </ElTag>
        </header>
        <ElScrollbar class="org-design-page__lifecycle-scroll">
          <ol class="org-design-page__lifecycle" aria-label="组织变革治理链路">
            <li v-for="(stage, index) in lifecycleStages" :key="stage.label" :class="stage.state">
              <span class="org-design-page__stage-index">0{{ index + 1 }}</span
              ><span class="org-design-page__stage-icon"><ArtSvgIcon :icon="stage.icon" /></span>
              <div
                ><strong>{{ stage.label }}</strong
                ><small>{{ stage.description }}</small></div
              ><b>{{ stage.value }}</b>
            </li>
          </ol>
        </ElScrollbar>
        <div class="org-design-page__guardrails">
          <article class="is-success"
            ><span><ArtSvgIcon icon="ri:camera-lens-line" /></span
            ><div
              ><small>影响快照</small
              ><strong>{{ overview.impactedEmployeeCount }} 名员工纳入评估</strong
              ><em>提交时固化，不随界面实时漂移</em></div
            ></article
          >
          <article :class="overview.impactedSecurityUserCount ? 'is-danger' : 'is-success'"
            ><span><ArtSvgIcon icon="ri:key-2-line" /></span
            ><div
              ><small>权限边界</small
              ><strong>{{ overview.impactedSecurityUserCount }} 个账号受影响</strong
              ><em>组织范围可能改变数据访问权</em></div
            ></article
          >
          <article class="is-restricted"
            ><span><ArtSvgIcon icon="ri:database-2-line" /></span
            ><div
              ><small>主数据隔离</small><strong>方案不直接执行</strong
              ><em>批准后移交平台组织管理员</em></div
            ></article
          >
          <article class="is-restricted"
            ><span><ArtSvgIcon icon="ri:history-line" /></span
            ><div
              ><small>历史口径</small><strong>保留原组织引用</strong
              ><em>不删除被业务记录引用的节点</em></div
            ></article
          >
        </div>
        <footer
          ><ArtSvgIcon
            icon="ri:information-line"
          />组织变革方案只形成受控执行包，不会自动修改组织、员工、岗位、角色或用户；实施窗口仍需由组织主数据管理员执行并复核。</footer
        >
      </section>

      <section class="org-design-page__workspace" aria-labelledby="org-design-workspace-title">
        <header
          ><div
            ><small>DESIGN WORKSPACE</small
            ><strong id="org-design-workspace-title">{{ activeTab.label }}</strong
            ><span>{{ activeTab.description }}</span></div
          ><span class="org-design-page__result"
            ><ArtSvgIcon :icon="activeTab.icon" />{{ tableTotal }} 条当前结果</span
          ></header
        >
        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="组织变革工作视图"
          compact
          @change="handleTabChange"
        />
        <div v-if="activeEntity === 'change' && focusedScenario" class="org-design-page__focus">
          <span><ArtSvgIcon icon="ri:focus-3-line" /></span
          ><div
            ><small>当前方案变更包</small><strong>{{ focusedScenario.scenarioName }}</strong
            ><em
              >{{ focusedScenario.scenarioCode }} · 计划
              {{ focusedScenario.effectiveDate }} 生效</em
            ></div
          >
          <ElButton text type="primary" @click="clearScenarioFocus">查看全部变更项</ElButton>
        </div>
      </section>

      <ArtTableQuery
        :key="`${activeEntity}-${focusedScenario?.id || 'all'}`"
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
      <OrganizationDesignDialog ref="dialogRef" @success="handleDialogSuccess" />
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
  import { ElButton, ElTag, type TagProps } from 'element-plus'
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
    deleteOrganizationDesignRecord,
    fetchOrganizationDesignOverview,
    fetchOrganizationDesignRecords,
    transitionOrganizationDesign
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import OrganizationDesignDialog from './modules/organization-design-dialog.vue'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })
  const formatTableDateTime2 = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '待提交评审',
    invalidText: '待提交评审'
  })

  defineOptions({ name: 'HrOrganizationDesign' })
  type Entity = Api.Hr.OrganizationDesignEntity
  type RecordItem = Api.Hr.OrganizationDesignRecord
  type TableParams = Api.Hr.OrganizationDesignSearchParams &
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
      scenario?: Api.Hr.OrganizationDesignScenario
    }) => Promise<void>
  }
  const tabs: Tab[] = [
    {
      value: 'scenario',
      label: '变革方案',
      description: '目标、生效窗口、影响风险与评审状态',
      emptyTitle: '暂无组织变革方案',
      emptyDescription: '创建情景方案，再逐项维护拟议的组织结构变化。',
      icon: 'ri:git-branch-line'
    },
    {
      value: 'change',
      label: '变更清单',
      description: '新增、更名、迁移、停用及影响快照',
      emptyTitle: '暂无组织变更项',
      emptyDescription: '在草稿方案中添加组织变更，提交后系统统一计算影响。',
      icon: 'ri:node-tree'
    }
  ]
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('scenario')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () =>
      activeEntity.value === 'scenario'
        ? 'hr_organization_design_scenario'
        : 'hr_organization_design_change',
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tableTotal = ref(0)
  const focusedScenario = ref<Api.Hr.OrganizationDesignScenario | null>(null)
  const tableState = reactive<{ searchQuery: Api.Hr.OrganizationDesignSearchParams }>({
    searchQuery: { keyword: '', status: '', tenantId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_organization_design_scenario: 'scenario',
      hr_organization_design_change: 'change'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      focusedScenario.value = null
    }
  )
  const overview = reactive<Api.Hr.OrganizationDesignOverview>({
    draftCount: 0,
    reviewCount: 0,
    approvedCount: 0,
    handoffCount: 0,
    highRiskCount: 0,
    changeCount: 0,
    impactedEmployeeCount: 0,
    impactedSecurityUserCount: 0
  })
  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '情景方案隔离', type: 'primary', effect: 'plain' },
    { label: '跨模块影响快照', type: 'success', effect: 'light' },
    { label: '批准后执行移交', type: 'warning', effect: 'light' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '草稿方案',
      value: overview.draftCount,
      description: `${overview.changeCount} 项拟议变更`,
      icon: 'ri:draft-line',
      tone: overview.draftCount ? 'primary' : 'info'
    },
    {
      label: '影响评审',
      value: overview.reviewCount,
      description: '等待业务与权限风险确认',
      icon: 'ri:search-eye-line',
      tone: overview.reviewCount ? 'warning' : 'success'
    },
    {
      label: '已批准',
      value: overview.approvedCount,
      description: '等待移交组织主数据执行',
      icon: 'ri:checkbox-circle-line',
      tone: overview.approvedCount ? 'success' : 'info'
    },
    {
      label: '高风险',
      value: overview.highRiskCount,
      description: `${overview.impactedSecurityUserCount} 个权限账号受影响`,
      icon: 'ri:alarm-warning-line',
      tone: overview.highRiskCount ? 'danger' : 'success'
    }
  ])
  const lifecycleStages = computed(() => [
    {
      label: '建立情景',
      description: '目标、责任人与生效窗口',
      value: `${overview.draftCount} 个草稿`,
      icon: 'ri:git-branch-line',
      state: overview.draftCount ? 'is-current' : ''
    },
    {
      label: '编排变更',
      description: '新增、更名、迁移与停用',
      value: `${overview.changeCount} 项变更`,
      icon: 'ri:node-tree',
      state: overview.changeCount ? 'is-complete' : ''
    },
    {
      label: '影响评审',
      description: '员工、岗位、招聘与权限',
      value: `${overview.reviewCount} 个待评`,
      icon: 'ri:radar-line',
      state: overview.reviewCount ? 'is-risk' : ''
    },
    {
      label: '决策批准',
      description: '记录依据与责任人',
      value: `${overview.approvedCount} 个批准`,
      icon: 'ri:verified-badge-line',
      state: overview.approvedCount ? 'is-current' : ''
    },
    {
      label: '执行移交',
      description: '平台主数据维护窗口',
      value: `${overview.handoffCount} 个已移交`,
      icon: 'ri:send-plane-line',
      state: overview.handoffCount ? 'is-complete' : ''
    }
  ])
  const labels: Record<string, string> = {
    draft: '草稿',
    impact_review: '影响评审',
    approved: '已批准',
    rejected: '已退回',
    handed_off: '已移交',
    cancelled: '已取消',
    unassessed: '未评估',
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '关键风险'
  }
  const statusTag = (value?: string | null) => {
    const type: TagProps['type'] = ['approved', 'handed_off', 'low'].includes(value ?? '')
      ? 'success'
      : ['draft', 'impact_review', 'medium'].includes(value ?? '')
        ? 'warning'
        : ['high', 'critical', 'rejected'].includes(value ?? '')
          ? 'danger'
          : 'info'
    return (
      <ElTag type={type} effect="light" round>
        {labels[value ?? ''] ?? value ?? '--'}
      </ElTag>
    )
  }

  const changeTypeLabel = (value: Api.Hr.OrganizationChangeType) =>
    ({ create: '新增组织', rename: '组织更名', reparent: '调整上级', inactivate: '停用组织' })[
      value
    ]
  const changeTarget = (row: Api.Hr.OrganizationDesignChange) =>
    row.changeType === 'create'
      ? `${row.proposedName || '--'}（${row.proposedCode || '--'}）`
      : row.currentName || '--'
  const changeResult = (row: Api.Hr.OrganizationDesignChange) =>
    row.changeType === 'rename'
      ? `更名为 ${row.proposedName}`
      : row.changeType === 'reparent'
        ? `迁移至 ${row.proposedParentName || '--'}`
        : row.changeType === 'inactivate'
          ? '计划停用'
          : `新建于 ${row.proposedParentName || '根组织'}`
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: activeEntity.value === 'scenario' ? '状态' : '变更类型',
      key: 'status',
      type: 'select',
      options:
        activeEntity.value === 'scenario'
          ? [
              { label: '草稿', value: 'draft' },
              { label: '影响评审', value: 'impact_review' },
              { label: '已批准', value: 'approved' },
              { label: '已退回', value: 'rejected' },
              { label: '已移交', value: 'handed_off' },
              { label: '已取消', value: 'cancelled' }
            ]
          : [
              { label: '新增组织', value: 'create' },
              { label: '组织更名', value: 'rename' },
              { label: '调整上级', value: 'reparent' },
              { label: '停用组织', value: 'inactivate' }
            ],
      props: { clearable: true, placeholder: '全部' }
    },
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder:
          activeEntity.value === 'scenario'
            ? '方案编码、名称、目标或负责人'
            : '方案、组织、拟议结果或理由'
      }
    }
  ])
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: activeEntity.value === 'scenario' ? '新增变革方案' : '新增变更项',
      permission: 'Hr:OrganizationDesign:Scenario:Manage',
      onClick: () => openDialog(activeEntity.value)
    }
  ])
  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'scenario' ? scenarioColumns() : changeColumns()
  const scenarioColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'scenarioName',
      label: '方案 / 编码',
      minWidth: 225,
      fixed: 'left',
      link: { onClick: (row) => focusChanges(row as Api.Hr.OrganizationDesignScenario) },
      formatter: (row) => {
        const item = row as Api.Hr.OrganizationDesignScenario
        return (
          <BusinessTableIdentityCell
            primary={item.scenarioName}
            secondary={item.scenarioCode}
            tertiary={item.objective}
          />
        )
      }
    },
    {
      prop: 'effectiveDate',
      label: '生效 / 负责人',
      minWidth: 170,
      formatter: (row) => {
        const item = row as Api.Hr.OrganizationDesignScenario
        return (
          <BusinessTableIdentityCell
            primary={item.effectiveDate}
            secondary={item.ownerEmployeeName}
            tertiary={item.ownerEmployeeNo}
          />
        )
      }
    },
    {
      prop: 'changeCount',
      label: '变更 / 影响',
      minWidth: 210,
      formatter: (row) => {
        const item = row as Api.Hr.OrganizationDesignScenario
        return (
          <div class="flex flex-wrap gap-1">
            {
              <ElTag size="small" type={'info'} effect="light">
                {item.changeCount ?? 0}
                {' 项变更'}
              </ElTag>
            }
            {
              <ElTag size="small" type={'info'} effect="light">
                {item.impactedEmployeeCount ?? 0}
                {' 人'}
              </ElTag>
            }
            {
              <ElTag size="small" type={'info'} effect="light">
                {item.impactedPositionCount ?? 0}
                {' 岗位'}
              </ElTag>
            }
            {
              <ElTag
                size="small"
                type={(item.impactedSecurityUserCount ?? 0) > 0 ? 'danger' : 'info'}
                effect="light"
              >
                {item.impactedSecurityUserCount ?? 0}
                {' 账号'}
              </ElTag>
            }
          </div>
        )
      }
    },
    {
      prop: 'riskLevel',
      label: '风险',
      width: 105,
      formatter: (row) => statusTag((row as Api.Hr.OrganizationDesignScenario).riskLevel)
    },
    {
      prop: 'status',
      label: '状态',
      width: 112,
      formatter: (row) => statusTag((row as Api.Hr.OrganizationDesignScenario).status)
    },
    {
      prop: 'updateTime',
      label: '最近更新',
      width: 145,
      formatter: (row) => formatTableDateTime((row as Api.Hr.OrganizationDesignScenario).updateTime)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => scenarioActions(row as Api.Hr.OrganizationDesignScenario)
    }
  ]
  const changeColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'currentName',
      label: '组织变化',
      minWidth: 230,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.OrganizationDesignChange
        return (
          <BusinessTableIdentityCell
            primary={changeTarget(item)}
            secondary={changeTypeLabel(item.changeType)}
            tertiary={changeResult(item)}
          />
        )
      }
    },
    {
      prop: 'scenarioName',
      label: '所属方案',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.OrganizationDesignChange
        return (
          <BusinessTableIdentityCell primary={item.scenarioName} secondary={item.scenarioCode} />
        )
      }
    },
    { prop: 'rationale', label: '业务理由', minWidth: 220, showOverflowTooltip: true },
    {
      prop: 'impactedEmployeeCount',
      label: '影响快照',
      minWidth: 225,
      formatter: (row) => {
        const item = row as Api.Hr.OrganizationDesignChange
        return (
          <div class="flex flex-wrap gap-1">
            {
              <ElTag size="small" type={'info'} effect="light">
                {item.impactedEmployeeCount ?? 0}
                {' 人'}
              </ElTag>
            }
            {
              <ElTag size="small" type={'info'} effect="light">
                {item.impactedPositionCount ?? 0}
                {' 岗位'}
              </ElTag>
            }
            {
              <ElTag size="small" type={'info'} effect="light">
                {item.impactedRequisitionCount ?? 0}
                {' 招聘'}
              </ElTag>
            }
            {
              <ElTag
                size="small"
                type={(item.impactedSecurityUserCount ?? 0) > 0 ? 'danger' : 'info'}
                effect="light"
              >
                {item.impactedSecurityUserCount ?? 0}
                {' 账号'}
              </ElTag>
            }
          </div>
        )
      }
    },
    {
      prop: 'impactCapturedAt',
      label: '快照时间',
      width: 145,
      formatter: (row) => {
        const item = row as Api.Hr.OrganizationDesignChange
        return formatTableDateTime2(item.impactCapturedAt)
      }
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => changeActions(row as Api.Hr.OrganizationDesignChange)
    }
  ]
  const scenarioActions = (row: Api.Hr.OrganizationDesignScenario) => {
    const actions: ButtonMoreItem[] = [
      { key: 'changes', label: '查看变更清单', icon: 'ri:node-tree' }
    ]
    if (['draft', 'rejected'].includes(row.status))
      actions.unshift({
        key: 'edit',
        label: '编辑方案',
        icon: 'ri:edit-line',
        auth: 'Hr:OrganizationDesign:Scenario:Manage'
      })
    if (['draft', 'rejected'].includes(row.status))
      actions.push(
        {
          key: 'add_change',
          label: '添加变更项',
          icon: 'ri:add-circle-line',
          auth: 'Hr:OrganizationDesign:Scenario:Manage'
        },
        {
          key: 'submit',
          label: '提交影响评审',
          icon: 'ri:send-plane-line',
          auth: 'Hr:OrganizationDesign:Impact:Review'
        },
        {
          key: 'delete',
          label: '删除方案',
          icon: 'ri:delete-bin-6-line',
          auth: 'Hr:OrganizationDesign:Scenario:Manage',
          color: 'var(--el-color-danger)'
        }
      )
    if (row.status === 'impact_review')
      actions.push(
        {
          key: 'approve',
          label: '批准方案',
          icon: 'ri:checkbox-circle-line',
          auth: 'Hr:OrganizationDesign:Approve'
        },
        {
          key: 'reject',
          label: '退回修改',
          icon: 'ri:arrow-go-back-line',
          auth: 'Hr:OrganizationDesign:Approve',
          color: 'var(--el-color-warning)'
        }
      )
    if (row.status === 'approved')
      actions.push({
        key: 'handoff',
        label: '移交主数据执行',
        icon: 'ri:send-plane-line',
        auth: 'Hr:OrganizationDesign:Handoff'
      })
    return <ArtButtonMore list={actions} onClick={(item) => void handleScenarioMore(item, row)} />
  }
  const changeActions = (row: Api.Hr.OrganizationDesignChange) =>
    ['draft', 'rejected'].includes(row.scenarioStatus ?? '') ? (
      <ArtButtonMore
        list={[
          {
            key: 'edit',
            label: '编辑变更项',
            icon: 'ri:edit-line',
            auth: 'Hr:OrganizationDesign:Scenario:Manage'
          },
          {
            key: 'delete',
            label: '删除变更项',
            icon: 'ri:delete-bin-6-line',
            auth: 'Hr:OrganizationDesign:Scenario:Manage',
            color: 'var(--el-color-danger)'
          }
        ]}
        onClick={(item) => void handleChangeMore(item, row)}
      />
    ) : (
      <span class="text-xs text-[var(--art-gray-500)]">已锁定</span>
    )
  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchOrganizationDesignRecords(activeEntity.value, {
      ...params,
      from,
      to,
      scenarioId: activeEntity.value === 'change' ? focusedScenario.value?.id : undefined
    })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async () => {
    const response = await fetchOrganizationDesignOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const refreshWorkspace = async () => {
    await Promise.all([refreshOverview(), tableQueryRef.value?.refreshUpdate()])
  }
  const handleTabChange = () => {
    if (activeEntity.value !== 'change') focusedScenario.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    tableTotal.value = 0
  }
  const focusChanges = (row: Api.Hr.OrganizationDesignScenario) => {
    focusedScenario.value = row
    activeEntity.value = 'change'
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }
  const clearScenarioFocus = () => {
    focusedScenario.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }
  const openDialog = (
    entity: Entity,
    row?: RecordItem,
    scenario?: Api.Hr.OrganizationDesignScenario
  ) => {
    void dialogRef.value?.handleOpen({
      entity,
      type: row ? 'edit' : 'add',
      editData: row,
      scenario
    })
  }
  const handleDialogSuccess = async (_entity: Entity, type: DialogType) => {
    if (type === 'add') await tableQueryRef.value?.refreshCreate()
    else await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }
  const handleScenarioMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.OrganizationDesignScenario
  ) => {
    if (item.key === 'edit') return openDialog('scenario', row)
    if (item.key === 'changes') return focusChanges(row)
    if (item.key === 'add_change') return openDialog('change', undefined, row)
    if (item.key === 'delete') return handleDelete('scenario', row)
    await handleTransition(row, String(item.key))
  }
  const handleChangeMore = async (item: ButtonMoreItem, row: Api.Hr.OrganizationDesignChange) => {
    if (item.key === 'edit') return openDialog('change', row)
    if (item.key === 'delete') await handleDelete('change', row)
  }
  const handleTransition = async (row: Api.Hr.OrganizationDesignScenario, action: string) => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (['approve', 'reject', 'handoff'].includes(action))
        comment = await promptText(
          action === 'handoff'
            ? '请输入实施窗口、执行责任人与复核安排。'
            : action === 'approve'
              ? '请输入批准依据与关键控制要求。'
              : '请输入退回原因与需补充的分析。',
          action === 'handoff'
            ? '移交组织主数据执行'
            : action === 'approve'
              ? '批准组织变革方案'
              : '退回组织变革方案',
          {
            confirmButtonText: '确认执行',
            cancelButtonText: '返回',
            placeholder: '请输入决策说明',
            minLength: 4,
            maxLength: 600,
            type: action === 'approve' ? 'info' : 'warning'
          }
        )
      else
        await confirmAction(
          '系统将按当前组织结构固化员工、岗位、招聘、权限账号与政策范围影响；提交后变更清单锁定。确认继续？',
          '提交影响评审',
          { confirmButtonText: '提交评审', cancelButtonText: '返回', type: 'info' }
        )
      await transitionOrganizationDesign(row.id, action, comment)
      await refreshWorkspace()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '组织变革方案处理失败，请刷新方案状态后重试')
    }
  }
  const handleDelete = async (kind: Entity, row: RecordItem) => {
    if (!row.id) return
    const label =
      kind === 'scenario'
        ? `${(row as Api.Hr.OrganizationDesignScenario).scenarioName}（${(row as Api.Hr.OrganizationDesignScenario).scenarioCode}）`
        : `${(row as Api.Hr.OrganizationDesignChange).proposedName ?? (row as Api.Hr.OrganizationDesignChange).currentName ?? '组织变更'} · ${(row as Api.Hr.OrganizationDesignChange).scenarioName ?? '变革方案'}`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: 'Hr:OrganizationDesign:Scenario:Manage',
      confirmMessage: `确认删除“${label}”？仅草稿或被退回且尚未移交的记录可删除。`,
      remove: () => deleteOrganizationDesignRecord(kind, row.id!),
      onDeleted: refreshWorkspace
    })
  }
  onMounted(() => void refreshOverview())
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;
  @use '../../shared/hr-lifecycle-workspace' as lifecycle;

  .org-design-page {
    @include hr-table-workspace-layout(420px);

    --org-border: color-mix(in srgb, var(--art-card-border) 84%, transparent);

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
      border: 1px solid var(--org-border);
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

    &__command em,
    &__workspace header span {
      @include lifecycle.supporting-text;
    }

    &__lifecycle-scroll {
      min-width: 0;
      height: auto;
    }

    &__lifecycle {
      display: grid;
      grid-template-columns: repeat(5, minmax(200px, 1fr));
      gap: 1px;
      min-width: 1006px;
      padding: 0;
      margin: 18px 0 0;
      list-style: none;
      background: var(--org-border);
      border: 1px solid var(--org-border);
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
        grid-column: 2/-1;
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
      border: 1px solid var(--org-border);
      border-radius: var(--art-surface-radius);

      > span {
        @include lifecycle.guardrail-icon;
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
      border-top: 1px dashed var(--org-border);

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
      border: 1px solid color-mix(in srgb, var(--theme-color) 15%, var(--org-border));
      border-radius: var(--art-surface-radius);

      > span {
        @include lifecycle.focus-icon;
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
    .org-design-page__guardrails {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media only screen and (width <= 767px) {
    .org-design-page {
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
