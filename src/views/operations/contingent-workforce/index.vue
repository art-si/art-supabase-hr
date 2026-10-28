<template>
  <ArtPermissionGuard permission="Hr:ContingentWorkforce:View">
    <div class="contingent-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="CONTINGENT WORKFORCE & ACCESS GOVERNANCE"
        title="外部用工"
        description="将供应商、外部人员、用工任务、准入控制与退场回收纳入同一套可审计闭环，同时与正式员工编制、薪酬、福利和法定报表保持清晰边界。"
        icon="ri:team-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="contingent-page__command" aria-labelledby="contingent-command-title">
        <header>
          <div>
            <span class="contingent-page__command-icon"><ArtSvgIcon icon="ri:route-line" /></span>
            <span>
              <small>WORKFORCE ASSURANCE PATH</small>
              <strong id="contingent-command-title">从供应商准入到权限回收</strong>
              <em>任何在场任务都必须有内部负责人、有效周期和完整的准入控制</em>
            </span>
          </div>
          <ElTag :type="overview.blockedCount ? 'danger' : 'success'" effect="light" round>
            <ArtSvgIcon
              :icon="overview.blockedCount ? 'ri:alarm-warning-line' : 'ri:shield-check-line'"
            />
            {{ overview.blockedCount ? `${overview.blockedCount} 项合规阻断` : '当前无合规阻断' }}
          </ElTag>
        </header>

        <ElScrollbar class="contingent-page__lifecycle-scroll">
          <ol class="contingent-page__lifecycle" aria-label="外部用工治理链路">
            <li v-for="(stage, index) in lifecycleStages" :key="stage.label" :class="stage.state">
              <span class="contingent-page__stage-index">0{{ index + 1 }}</span>
              <span class="contingent-page__stage-icon"><ArtSvgIcon :icon="stage.icon" /></span>
              <div
                ><strong>{{ stage.label }}</strong
                ><small>{{ stage.description }}</small></div
              >
              <b>{{ stage.value }}</b>
            </li>
          </ol>
        </ElScrollbar>

        <div class="contingent-page__guardrails">
          <article :class="overview.pendingControlCount ? 'is-warning' : 'is-success'">
            <span><ArtSvgIcon icon="ri:shield-keyhole-line" /></span>
            <div>
              <small>准入控制</small><strong>{{ overview.pendingControlCount }} 项待完成</strong>
              <em>身份、合同、保密、培训、门禁与账号</em>
            </div>
          </article>
          <article :class="overview.endingSoonCount ? 'is-warning' : ''">
            <span><ArtSvgIcon icon="ri:calendar-close-line" /></span>
            <div>
              <small>任务到期</small><strong>{{ overview.endingSoonCount }} 项 30 天内结束</strong>
              <em>提前确认续期或启动退场</em>
            </div>
          </article>
          <article :class="overview.accessExpiringCount ? 'is-danger' : 'is-success'">
            <span><ArtSvgIcon icon="ri:key-2-line" /></span>
            <div>
              <small>访问权限</small
              ><strong>{{ overview.accessExpiringCount }} 项 14 天内到期</strong>
              <em>系统与现场权限不得晚于任务结束</em>
            </div>
          </article>
          <article class="is-restricted">
            <span><ArtSvgIcon icon="ri:git-branch-line" /></span>
            <div>
              <small>主数据边界</small><strong>外部人员独立建模</strong>
              <em>不计正式编制，不进入薪酬、社保与福利</em>
            </div>
          </article>
        </div>

        <footer>
          <ArtSvgIcon icon="ri:information-line" />
          在任务激活和退场时，服务端会重新校验供应商合同、身份状态、必需控制项和访问权限；前端显示状态不构成绕过治理门禁的依据。
        </footer>
      </section>

      <section class="contingent-page__workspace" aria-labelledby="contingent-workspace-title">
        <header>
          <div>
            <small>OPERATING WORKSPACE</small>
            <strong id="contingent-workspace-title">{{ activeTab.label }}</strong>
            <span>{{ activeTab.description }}</span>
          </div>
          <span class="contingent-page__result">
            <ArtSvgIcon :icon="activeTab.icon" />{{ tableTotal }} 条当前结果
          </span>
        </header>
        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="外部用工工作视图"
          compact
          @change="handleTabChange"
        />
        <div v-if="activeEntity === 'control' && focusedEngagement" class="contingent-page__focus">
          <span><ArtSvgIcon icon="ri:focus-3-line" /></span>
          <div>
            <small>当前仅查看</small>
            <strong
              >{{ focusedEngagement.workerName }} · {{ focusedEngagement.serviceTitle }}</strong
            >
            <em>{{ focusedEngagement.engagementNo }}</em>
          </div>
          <ElButton text type="primary" @click="clearEngagementFocus">查看全部控制项</ElButton>
        </div>
      </section>

      <ArtTableQuery
        :key="`${activeEntity}-${focusedEngagement?.id || 'all'}`"
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

      <ContingentWorkforceDialog ref="dialogRef" @success="handleDialogSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatCurrencyCodeValue } from '@/utils/ui/format'
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import dayjs from 'dayjs'
  import { ElButton, ElTag, type TagProps } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
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
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import {
    deleteContingentWorkforceRecord,
    fetchContingentWorkforceOverview,
    fetchContingentWorkforceRecords,
    transitionContingentWorkforceRecord
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import ContingentWorkforceDialog from './modules/contingent-workforce-dialog.vue'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'HrContingentWorkforce' })

  type Entity = Api.Hr.ContingentWorkforceEntity
  type RecordItem = Api.Hr.ContingentWorkforceRecord
  type TableParams = Api.Hr.ContingentWorkforceSearchParams &
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
      engagement?: Api.Hr.ExternalEngagement
    }) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'engagement',
      label: '用工任务',
      description: '组织、负责人、服务周期与在退场状态',
      emptyTitle: '暂无外部用工任务',
      emptyDescription: '从已核验人员建立任务，明确内部负责人、周期与访问到期日。',
      icon: 'ri:briefcase-4-line'
    },
    {
      value: 'worker',
      label: '外部人员',
      description: '人员身份、用工类型与供应商来源',
      emptyTitle: '暂无外部人员',
      emptyDescription: '外部人员独立于员工花名册维护，并使用独立身份核验状态。',
      icon: 'ri:user-shared-line'
    },
    {
      value: 'vendor',
      label: '供应商',
      description: '主体、合同、合规状态与服务边界',
      emptyTitle: '暂无用工供应商',
      emptyDescription: '登记供应商合同与合规信息，通过核验后才能承载外包或派遣任务。',
      icon: 'ri:building-4-line'
    },
    {
      value: 'control',
      label: '准入控制',
      description: '核验、协议、培训、访问与资产回收',
      emptyTitle: '暂无准入或退场控制项',
      emptyDescription: '创建用工任务时会自动生成六项默认准入控制。',
      icon: 'ri:shield-keyhole-line'
    }
  ]

  const { hasAuth } = useAuth()
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('engagement')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const deleteTables: Record<Entity, string> = {
    engagement: 'hr_external_engagement',
    worker: 'hr_external_worker',
    vendor: 'mdm_external_vendor',
    control: 'hr_external_engagement_control'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tableTotal = ref(0)
  const focusedEngagement = ref<Api.Hr.ExternalEngagement | null>(null)
  const tableState = reactive<{ searchQuery: Api.Hr.ContingentWorkforceSearchParams }>({
    searchQuery: { keyword: '', status: '', tenantId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_external_engagement: 'engagement',
      hr_external_worker: 'worker',
      mdm_external_vendor: 'vendor',
      hr_external_engagement_control: 'control'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      focusedEngagement.value = null
    }
  )
  const overview = reactive<Api.Hr.ContingentWorkforceOverview>({
    piiAccess: false,
    costAccess: false,
    activeVendorCount: 0,
    activeWorkerCount: 0,
    activeEngagementCount: 0,
    pendingReviewCount: 0,
    pendingControlCount: 0,
    endingSoonCount: 0,
    accessExpiringCount: 0,
    blockedCount: 0
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '员工主数据隔离', type: 'primary', effect: 'plain' },
    { label: '准入到退场闭环', type: 'success', effect: 'light' },
    { label: '联系方式与成本受控', type: 'warning', effect: 'light' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '在场任务',
      value: overview.activeEngagementCount,
      description: `${overview.activeWorkerCount} 名外部人员在场`,
      icon: 'ri:user-follow-line',
      tone: overview.activeEngagementCount ? 'primary' : 'info'
    },
    {
      label: '待审核',
      value: overview.pendingReviewCount,
      description: '等待准入控制完成并激活',
      icon: 'ri:time-line',
      tone: overview.pendingReviewCount ? 'warning' : 'success'
    },
    {
      label: '未完成控制',
      value: overview.pendingControlCount,
      description: '必需控制项形成服务端硬门禁',
      icon: 'ri:shield-keyhole-line',
      tone: overview.pendingControlCount ? 'danger' : 'success'
    },
    {
      label: '30 天内到期',
      value: overview.endingSoonCount,
      description: `${overview.accessExpiringCount} 项访问权限 14 天内到期`,
      icon: 'ri:calendar-close-line',
      tone: overview.endingSoonCount || overview.accessExpiringCount ? 'warning' : 'info'
    }
  ])

  const lifecycleStages = computed(() => [
    {
      label: '供应商合规',
      description: '主体、合同与服务边界',
      value: `${overview.activeVendorCount} 家有效`,
      icon: 'ri:building-4-line',
      state: overview.activeVendorCount ? 'is-complete' : ''
    },
    {
      label: '人员核验',
      description: '身份与用工来源',
      value: `${overview.activeWorkerCount} 人在场`,
      icon: 'ri:user-search-line',
      state: overview.activeWorkerCount ? 'is-complete' : ''
    },
    {
      label: '任务审核',
      description: '组织、负责人和周期',
      value: `${overview.pendingReviewCount} 项待审`,
      icon: 'ri:file-list-3-line',
      state: overview.pendingReviewCount ? 'is-current' : ''
    },
    {
      label: '在场控制',
      description: '访问权限与到期预警',
      value: `${overview.activeEngagementCount} 项在场`,
      icon: 'ri:key-2-line',
      state: overview.accessExpiringCount
        ? 'is-risk'
        : overview.activeEngagementCount
          ? 'is-current'
          : ''
    },
    {
      label: '安全退场',
      description: '门禁、账号与资产回收',
      value: `${overview.endingSoonCount} 项将到期`,
      icon: 'ri:logout-box-r-line',
      state: overview.endingSoonCount ? 'is-risk' : ''
    }
  ])

  const labels: Record<string, string> = {
    draft: '草稿',
    suspended: '已暂停',
    expired: '已过期',
    inactive: '已停用',
    candidate: '待核验',
    ready: '已就绪',
    blocked: '已锁定',
    pending_review: '待审核',
    offboarding: '退场中',
    ended: '已退场',
    cancelled: '已取消',
    pending: '待完成',
    completed: '已完成',
    waived: '已豁免',
    failed: '失败',
    verified: '已核验',
    rejected: '未通过',
    passed: '已通过',
    cleared: '已清除'
  }
  const statusLabel = (value?: string | null): string =>
    value === 'active'
      ? activeEntity.value === 'vendor'
        ? '有效'
        : '在场'
      : (labels[value ?? ''] ?? value ?? '--')
  const statusTone = (value?: string | null): TagProps['type'] =>
    ['active', 'completed', 'verified', 'passed', 'cleared', 'ready'].includes(value ?? '')
      ? 'success'
      : ['pending_review', 'pending', 'offboarding', 'suspended', 'expired'].includes(value ?? '')
        ? 'warning'
        : ['blocked', 'failed', 'rejected'].includes(value ?? '')
          ? 'danger'
          : 'info'
  const statusTag = (value?: string | null) => (
    <ElTag type={statusTone(value)} effect="light" round>
      {statusLabel(value)}
    </ElTag>
  )

  const searchItems = computed<SearchFormItem[]>(() => {
    const statusOptions: Record<Entity, Array<{ label: string; value: string }>> = {
      engagement: [
        { label: '草稿', value: 'draft' },
        { label: '待审核', value: 'pending_review' },
        { label: '在场', value: 'active' },
        { label: '退场中', value: 'offboarding' },
        { label: '已退场', value: 'ended' },
        { label: '已取消', value: 'cancelled' }
      ],
      worker: [
        { label: '待核验', value: 'candidate' },
        { label: '已就绪', value: 'ready' },
        { label: '在场', value: 'active' },
        { label: '已停用', value: 'inactive' },
        { label: '已锁定', value: 'blocked' }
      ],
      vendor: [
        { label: '草稿', value: 'draft' },
        { label: '有效', value: 'active' },
        { label: '已暂停', value: 'suspended' },
        { label: '已过期', value: 'expired' },
        { label: '已停用', value: 'inactive' }
      ],
      control: [
        { label: '待完成', value: 'pending' },
        { label: '已完成', value: 'completed' },
        { label: '已豁免', value: 'waived' },
        { label: '失败', value: 'failed' }
      ]
    }
    return [
      {
        label: '状态',
        key: 'status',
        type: 'select',
        options: statusOptions[activeEntity.value],
        props: { clearable: true, placeholder: '全部状态' }
      },
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder:
            activeEntity.value === 'engagement'
              ? '任务、人员、服务角色或组织'
              : activeEntity.value === 'worker'
                ? '人员、编号或供应商'
                : activeEntity.value === 'vendor'
                  ? '供应商、编码或合同'
                  : '控制项、任务或人员'
        }
      }
    ]
  })

  const permissionByEntity: Record<Entity, string> = {
    engagement: 'Hr:ContingentWorkforce:Engagement:Manage',
    worker: 'Hr:ContingentWorkforce:Worker:Manage',
    vendor: 'Hr:ContingentWorkforce:Vendor:Manage',
    control: 'Hr:ContingentWorkforce:Control:Manage'
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label:
        activeEntity.value === 'engagement'
          ? '新增用工任务'
          : activeEntity.value === 'worker'
            ? '新增外部人员'
            : activeEntity.value === 'vendor'
              ? '新增供应商'
              : '新增控制项',
      permission: permissionByEntity[activeEntity.value],
      onClick: () => openDialog(activeEntity.value)
    }
  ])

  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'engagement'
      ? engagementColumns()
      : activeEntity.value === 'worker'
        ? workerColumns()
        : activeEntity.value === 'vendor'
          ? vendorColumns()
          : controlColumns()

  const engagementColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'workerName',
      label: '外部人员 / 任务',
      minWidth: 220,
      fixed: 'left',
      link: {
        onClick: (row) => focusControls(row as Api.Hr.ExternalEngagement)
      },
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagement
        return (
          <BusinessTableIdentityCell
            primary={item.workerName}
            secondary={`${item.workerNo || '--'} · ${item.engagementNo}`}
            tertiary={item.serviceTitle}
          />
        )
      }
    },
    {
      prop: 'organizationName',
      label: '组织 / 内部负责人',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagement
        return (
          <BusinessTableIdentityCell
            primary={item.organizationName}
            secondary={item.sponsorEmployeeName}
            tertiary={item.positionName}
          />
        )
      }
    },
    {
      prop: 'endDate',
      label: '服务与访问周期',
      minWidth: 220,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagement
        const accessRisk =
          item.status === 'active' && dayjs(item.accessExpiryDate).diff(dayjs(), 'day') <= 14
        return (
          <BusinessTableIdentityCell
            primary={`${item.startDate} → ${item.endDate}`}
            secondary={`访问到期 ${item.accessExpiryDate || '—'}`}
            class={
              accessRisk ? '[&_small]:font-bold [&_small]:text-[var(--el-color-warning)]!' : ''
            }
          />
        )
      }
    },
    {
      prop: 'pendingControlCount',
      label: '准入控制',
      width: 126,
      align: 'center',
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagement
        return (
          <ElTag
            size="small"
            type={(item.pendingControlCount ?? 0) > 0 ? 'warning' : 'info'}
            effect="light"
          >
            {item.pendingControlCount ?? 0}
            {` / ${item.controlCount ?? 0} 待完成`}
          </ElTag>
        )
      }
    },
    {
      prop: 'billingRate',
      label: '结算口径',
      minWidth: 140,
      align: 'right',
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagement
        return item.billingRate == null
          ? '--'
          : `${formatCurrencyCodeValue(item.billingRate, item.currencyCode ?? 'CNY')}${item.billingUnit ? ` / ${billingUnitLabel(item.billingUnit)}` : ''}`
      }
    },
    {
      prop: 'complianceStatus',
      label: '合规',
      width: 105,
      formatter: (row) => statusTag((row as Api.Hr.ExternalEngagement).complianceStatus)
    },
    {
      prop: 'status',
      label: '任务状态',
      width: 112,
      formatter: (row) => statusTag((row as Api.Hr.ExternalEngagement).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => engagementActions(row as Api.Hr.ExternalEngagement)
    }
  ]

  const workerColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'workerName',
      label: '外部人员 / 编号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.ExternalWorker
        return (
          <BusinessTableIdentityCell
            primary={item.workerName}
            secondary={item.workerNo}
            tertiary={workerTypeLabel(item.workerType)}
          />
        )
      }
    },
    {
      prop: 'vendorName',
      label: '供应商 / 外部编号',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalWorker
        return (
          <BusinessTableIdentityCell
            primary={item.vendorName || '独立外部人员'}
            secondary={item.vendorWorkerNo}
          />
        )
      }
    },
    {
      prop: 'identityCheckStatus',
      label: '身份核验',
      width: 112,
      formatter: (row) => statusTag((row as Api.Hr.ExternalWorker).identityCheckStatus)
    },
    {
      prop: 'activeEngagementCount',
      label: '在场任务',
      width: 105,
      align: 'center',
      formatter: (row) => (
        <ElTag size="small" type={'info'} effect="light">
          {(row as Api.Hr.ExternalWorker).activeEngagementCount ?? 0}
          {' 项'}
        </ElTag>
      )
    },
    {
      prop: 'nextEndDate',
      label: '最近结束日',
      width: 120,
      formatter: (row) => (row as Api.Hr.ExternalWorker).nextEndDate || '--'
    },
    {
      prop: 'phone',
      label: '联系方式',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalWorker
        return <BusinessTableIdentityCell primary={item.phone} secondary={item.email} />
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => statusTag((row as Api.Hr.ExternalWorker).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => workerActions(row as Api.Hr.ExternalWorker)
    }
  ]

  const vendorColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'vendorName',
      label: '供应商 / 编码',
      minWidth: 210,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.ExternalVendor
        return (
          <BusinessTableIdentityCell
            primary={item.vendorName}
            secondary={item.vendorCode}
            tertiary={item.serviceScope}
          />
        )
      }
    },
    {
      prop: 'contractEndDate',
      label: '合同边界',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalVendor
        return (
          <BusinessTableIdentityCell
            primary={item.contractNo}
            secondary={`${item.contractStartDate || '--'} → ${item.contractEndDate || '--'}`}
          />
        )
      }
    },
    {
      prop: 'complianceStatus',
      label: '合规 / 风险',
      minWidth: 135,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalVendor
        return (
          <div class="flex flex-wrap gap-1">
            {statusTag(item.complianceStatus)}
            {riskTag(item.riskLevel)}
          </div>
        )
      }
    },
    {
      prop: 'workerCount',
      label: '人员 / 在场',
      width: 125,
      align: 'center',
      formatter: (row) => {
        const item = row as Api.Hr.ExternalVendor
        return (
          <BusinessTableIdentityCell
            primary={`${item.workerCount ?? 0} 人`}
            secondary={`${item.activeEngagementCount ?? 0} 项在场`}
          />
        )
      }
    },
    {
      prop: 'contactPhone',
      label: '联系人',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalVendor
        return (
          <BusinessTableIdentityCell
            primary={item.contactName}
            secondary={item.contactPhone}
            tertiary={item.contactEmail}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => statusTag((row as Api.Hr.ExternalVendor).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => vendorActions(row as Api.Hr.ExternalVendor)
    }
  ]

  const controlColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'controlName',
      label: '控制项 / 类型',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagementControl
        return (
          <BusinessTableIdentityCell
            primary={item.controlName}
            secondary={controlTypeLabel(item.controlType)}
            tertiary={item.required ? '必需项' : '可选项'}
          />
        )
      }
    },
    {
      prop: 'workerName',
      label: '人员 / 用工任务',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagementControl
        return (
          <BusinessTableIdentityCell
            primary={item.workerName}
            secondary={item.engagementNo}
            tertiary={statusLabel(item.engagementStatus)}
          />
        )
      }
    },
    {
      prop: 'dueDate',
      label: '截止日期',
      width: 120,
      formatter: (row) => (row as Api.Hr.ExternalEngagementControl).dueDate || '--'
    },
    {
      prop: 'evidenceReference',
      label: '证明 / 工单',
      minWidth: 180,
      showOverflowTooltip: true,
      formatter: (row) => (row as Api.Hr.ExternalEngagementControl).evidenceReference || '--'
    },
    {
      prop: 'completedBy',
      label: '完成信息',
      minWidth: 170,
      formatter: (row) => {
        const item = row as Api.Hr.ExternalEngagementControl
        return (
          <BusinessTableIdentityCell
            primary={item.completedBy}
            secondary={item.completedAt ? formatTableDateTime(item.completedAt) : null}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => statusTag((row as Api.Hr.ExternalEngagementControl).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => controlActions(row as Api.Hr.ExternalEngagementControl)
    }
  ]

  const engagementActions = (row: Api.Hr.ExternalEngagement) => {
    const actions: ButtonMoreItem[] = []
    if (['draft', 'pending_review'].includes(row.status))
      actions.push({
        key: 'edit',
        label: '编辑任务',
        icon: 'ri:edit-line',
        auth: permissionByEntity.engagement
      })
    if (row.status === 'draft') {
      actions.push({
        key: 'submit',
        label: '提交审核',
        icon: 'ri:send-plane-line',
        auth: permissionByEntity.engagement
      })
      actions.push({
        key: 'delete',
        label: '删除草稿',
        icon: 'ri:delete-bin-6-line',
        auth: permissionByEntity.engagement,
        color: 'var(--el-color-danger)'
      })
    }
    if (row.status === 'pending_review')
      actions.push({
        key: 'activate',
        label: '激活在场',
        icon: 'ri:play-circle-line',
        auth: 'Hr:ContingentWorkforce:Activate'
      })
    if (row.status === 'active')
      actions.push({
        key: 'begin_exit',
        label: '启动退场',
        icon: 'ri:logout-box-r-line',
        auth: 'Hr:ContingentWorkforce:End'
      })
    if (row.status === 'offboarding')
      actions.push({
        key: 'end',
        label: '确认退场',
        icon: 'ri:checkbox-circle-line',
        auth: 'Hr:ContingentWorkforce:End'
      })
    if (['draft', 'pending_review'].includes(row.status))
      actions.push({
        key: 'cancel',
        label: '取消任务',
        icon: 'ri:close-circle-line',
        auth: permissionByEntity.engagement,
        color: 'var(--el-color-danger)'
      })
    return (
      <BusinessTableRowActions>
        <ArtButtonTable type="view" label="准入清单" onClick={() => focusControls(row)} />
        {actions.length ? (
          <ArtButtonMore
            list={actions}
            onClick={(item: ButtonMoreItem) => void handleEngagementMore(item, row)}
          />
        ) : null}
      </BusinessTableRowActions>
    )
  }

  const workerActions = (row: Api.Hr.ExternalWorker) => {
    const actions: ButtonMoreItem[] = []
    if (row.status !== 'blocked')
      actions.push({
        key: 'edit',
        label: '编辑人员',
        icon: 'ri:edit-line',
        auth: permissionByEntity.worker
      })
    if (row.identityCheckStatus !== 'passed' && row.status !== 'blocked')
      actions.push({
        key: 'verify_identity',
        label: '通过身份核验',
        icon: 'ri:user-follow-line',
        auth: permissionByEntity.worker
      })
    if (row.status === 'blocked')
      actions.push({
        key: 'unblock',
        label: '解除锁定',
        icon: 'ri:lock-unlock-line',
        auth: permissionByEntity.worker
      })
    else
      actions.push({
        key: 'block',
        label: '锁定人员',
        icon: 'ri:forbid-line',
        auth: permissionByEntity.worker,
        color: 'var(--el-color-danger)'
      })
    if (row.status === 'candidate')
      actions.push({
        key: 'delete',
        label: '删除候选档案',
        icon: 'ri:delete-bin-6-line',
        auth: permissionByEntity.worker,
        color: 'var(--el-color-danger)'
      })
    return (
      <ArtButtonMore
        list={actions}
        onClick={(item: ButtonMoreItem) => void handleWorkerMore(item, row)}
      />
    )
  }

  const vendorActions = (row: Api.Hr.ExternalVendor) => {
    const actions: ButtonMoreItem[] = [
      { key: 'edit', label: '编辑供应商', icon: 'ri:edit-line', auth: permissionByEntity.vendor }
    ]
    if (row.complianceStatus !== 'verified')
      actions.push({
        key: 'verify',
        label: '通过合规核验',
        icon: 'ri:shield-check-line',
        auth: permissionByEntity.vendor
      })
    if (row.complianceStatus === 'verified' && row.status !== 'active')
      actions.push({
        key: 'activate',
        label: '激活供应商',
        icon: 'ri:play-circle-line',
        auth: permissionByEntity.vendor
      })
    if (row.status === 'active')
      actions.push({
        key: 'suspend',
        label: '暂停供应商',
        icon: 'ri:pause-circle-line',
        auth: permissionByEntity.vendor,
        color: 'var(--el-color-warning)'
      })
    if (['draft', 'suspended', 'expired'].includes(row.status))
      actions.push({
        key: 'deactivate',
        label: '停用供应商',
        icon: 'ri:stop-circle-line',
        auth: permissionByEntity.vendor
      })
    if (row.status === 'draft')
      actions.push({
        key: 'delete',
        label: '删除草稿',
        icon: 'ri:delete-bin-6-line',
        auth: permissionByEntity.vendor,
        color: 'var(--el-color-danger)'
      })
    return (
      <ArtButtonMore
        list={actions}
        onClick={(item: ButtonMoreItem) => void handleVendorMore(item, row)}
      />
    )
  }

  const controlActions = (row: Api.Hr.ExternalEngagementControl) =>
    hasAuth(permissionByEntity.control) ? (
      <ArtButtonTable type="edit" onClick={() => openDialog('control', row)} />
    ) : (
      <span class="text-xs text-[var(--art-gray-500)]">只读</span>
    )

  const billingUnitLabel = (value: NonNullable<Api.Hr.ExternalEngagement['billingUnit']>): string =>
    ({ hour: '小时', day: '天', month: '月', fixed: '固定总价' })[value]
  const workerTypeLabel = (value: Api.Hr.ExternalWorkerType): string =>
    ({
      outsourced: '业务外包',
      dispatch: '劳务派遣',
      contractor: '独立承揽',
      consultant: '专业顾问',
      temporary: '临时用工'
    })[value]
  const controlTypeLabel = (value: Api.Hr.ExternalEngagementControl['controlType']): string =>
    ({
      identity: '身份核验',
      contract: '合同/订单',
      nda: '保密协议',
      insurance: '保险证明',
      safety_training: '安全培训',
      access_badge: '门禁权限',
      system_account: '系统账号',
      equipment: '设备资产',
      other: '其他'
    })[value]
  const riskTag = (value: Api.Hr.ExternalVendor['riskLevel']) => (
    <ElTag
      type={value === 'high' ? 'danger' : value === 'medium' ? 'warning' : 'success'}
      effect="plain"
      round
    >
      {value === 'high' ? '高风险' : value === 'medium' ? '中风险' : '低风险'}
    </ElTag>
  )

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const response = await fetchContingentWorkforceRecords(activeEntity.value, {
      ...params,
      from,
      to,
      engagementId: activeEntity.value === 'control' ? focusedEngagement.value?.id : undefined
    })
    return response
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (_rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchContingentWorkforceOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const refreshWorkspace = async (): Promise<void> => {
    await Promise.all([refreshOverview(), tableQueryRef.value?.refreshUpdate()])
  }
  const handleTabChange = (): void => {
    if (activeEntity.value !== 'control') focusedEngagement.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    tableTotal.value = 0
  }
  const focusControls = (row: Api.Hr.ExternalEngagement): void => {
    focusedEngagement.value = row
    activeEntity.value = 'control'
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }
  const clearEngagementFocus = (): void => {
    focusedEngagement.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }

  const openDialog = (entity: Entity, row?: RecordItem): void => {
    void dialogRef.value?.handleOpen({
      entity,
      type: row ? 'edit' : 'add',
      editData: row,
      engagement: entity === 'control' ? (focusedEngagement.value ?? undefined) : undefined
    })
  }
  const handleDialogSuccess = async (_entity: Entity, type: DialogType): Promise<void> => {
    if (type === 'add') await tableQueryRef.value?.refreshCreate()
    else await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }

  const handleEngagementMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.ExternalEngagement
  ): Promise<void> => {
    if (item.key === 'edit') return openDialog('engagement', row)
    if (item.key === 'delete') return handleDelete('engagement', row)
    await handleTransition('engagement', row.id, String(item.key))
  }
  const handleWorkerMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.ExternalWorker
  ): Promise<void> => {
    if (item.key === 'edit') return openDialog('worker', row)
    if (item.key === 'delete') return handleDelete('worker', row)
    await handleTransition('worker', row.id, String(item.key))
  }
  const handleVendorMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.ExternalVendor
  ): Promise<void> => {
    if (item.key === 'edit') return openDialog('vendor', row)
    if (item.key === 'delete') return handleDelete('vendor', row)
    await handleTransition('vendor', row.id, String(item.key))
  }

  const handleTransition = async (
    kind: Api.Hr.ContingentTransitionKind,
    id: string | undefined,
    action: string
  ): Promise<void> => {
    if (!id) return
    try {
      let comment: string | undefined
      if (['block', 'begin_exit', 'end', 'cancel'].includes(action)) {
        const actionTitle =
          action === 'block'
            ? '锁定外部人员'
            : action === 'begin_exit'
              ? '启动退场'
              : action === 'end'
                ? '确认完成退场'
                : '取消用工任务'
        comment = await promptText(
          action === 'end'
            ? '请输入退场原因或服务完成说明；系统将再次校验门禁、账号和资产回收结果。'
            : `请输入${actionTitle}的原因与依据。`,
          actionTitle,
          {
            confirmButtonText: '确认执行',
            cancelButtonText: '返回',
            placeholder: '请输入原因或依据',
            minLength: 4,
            maxLength: 600,
            type: 'warning'
          }
        )
      } else {
        const title =
          action === 'activate'
            ? '确认激活'
            : action === 'submit'
              ? '提交审核'
              : action === 'verify' || action === 'verify_identity'
                ? '确认核验通过'
                : action === 'suspend'
                  ? '暂停供应商'
                  : action === 'deactivate'
                    ? '停用供应商'
                    : '确认状态变更'
        const description =
          action === 'activate' && kind === 'engagement'
            ? '系统将校验供应商合同、人员身份、内部负责人和所有必需准入控制。通过后任务进入在场状态。'
            : action === 'activate'
              ? '系统将校验供应商合规结果与合同有效期。确认继续？'
              : action === 'submit'
                ? '提交后进入待审核；只有完成所有必需准入控制后才能激活。'
                : `确认执行“${title}”？`
        await confirmAction(description, title, {
          confirmButtonText: title,
          cancelButtonText: '返回',
          type: action === 'suspend' ? 'warning' : 'info'
        })
      }
      await transitionContingentWorkforceRecord(kind, id, action, comment)
      await refreshWorkspace()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '外部用工记录处理失败，请刷新准入与合同状态后重试')
    }
  }

  const handleDelete = async (entity: Entity, row: RecordItem): Promise<void> => {
    if (!row.id) return
    const label =
      entity === 'engagement'
        ? `${(row as Api.Hr.ExternalEngagement).serviceTitle}（${(row as Api.Hr.ExternalEngagement).engagementNo}）`
        : entity === 'worker'
          ? `${(row as Api.Hr.ExternalWorker).workerName}（${(row as Api.Hr.ExternalWorker).workerNo}）`
          : `${(row as Api.Hr.ExternalVendor).vendorName}（${(row as Api.Hr.ExternalVendor).vendorCode}）`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: permissionByEntity[entity],
      confirmMessage: `确认删除“${label}”？仅未进入流程且没有下游依赖的草稿可删除。`,
      remove: () => deleteContingentWorkforceRecord(entity, row.id!),
      onDeleted: refreshWorkspace
    })
  }

  onMounted(() => void refreshOverview())
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;
  @use '../../shared/hr-lifecycle-workspace' as lifecycle;

  .contingent-page {
    @include hr-table-workspace-layout(420px);

    --contingent-border: color-mix(in srgb, var(--art-card-border) 84%, transparent);

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
      border: 1px solid var(--contingent-border);
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
      background: var(--contingent-border);
      border: 1px solid var(--contingent-border);
      border-radius: var(--art-surface-radius);
    }

    &__lifecycle li {
      position: relative;
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
        background: color-mix(in srgb, var(--el-color-warning) 9%, var(--art-bg-color));
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
      border: 1px solid var(--contingent-border);
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

      &.is-warning > span {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
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
      border-top: 1px dashed var(--contingent-border);

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
      border: 1px solid color-mix(in srgb, var(--theme-color) 15%, var(--contingent-border));
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
    .contingent-page__guardrails {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media only screen and (width <= 767px) {
    .contingent-page {
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
