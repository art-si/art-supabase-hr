<template>
  <ArtPermissionGuard permission="Hr:Compliance:View">
    <div class="compliance-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="WORKFORCE COMPLIANCE CONTROL"
        title="用工合规中心"
        description="统一管理劳动合同版本、续签决策、员工资质核验和到期风险，把合规资料转化为有负责人、有时限、有审计的处置闭环。"
        icon="ri:shield-check-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="compliance-page__control" aria-labelledby="compliance-control-title">
        <header class="compliance-page__heading">
          <div>
            <span class="compliance-page__section-icon" aria-hidden="true">
              <ArtSvgIcon icon="ri:radar-line" />
            </span>
            <span>
              <strong id="compliance-control-title">用工合规控制链</strong>
              <small>从权威资料建档、真实性核验，到期前决策与不可变审计</small>
            </span>
          </div>
          <span class="compliance-page__governance">
            <ArtSvgIcon icon="ri:lock-2-line" />版本留痕 · 权限隔离
          </span>
        </header>

        <ol class="compliance-page__rail" aria-label="用工合规处理阶段">
          <li v-for="(stage, index) in controlStages" :key="stage.label" :class="stage.state">
            <span class="compliance-page__rail-index">0{{ index + 1 }}</span>
            <span class="compliance-page__rail-icon"><ArtSvgIcon :icon="stage.icon" /></span>
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
          navigation-label="用工合规管理分类"
          compact
          @change="handleTabChange"
        />

        <div class="compliance-page__context" aria-live="polite">
          <div>
            <span class="compliance-page__context-icon"><ArtSvgIcon :icon="activeTab.icon" /></span>
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
            <div :class="attentionTone"
              ><dt>{{ attentionLabel }}</dt
              ><dd>{{ attentionValue }}</dd></div
            >
          </dl>
        </div>

        <footer class="compliance-page__note">
          <ArtSvgIcon icon="ri:information-line" />
          续签会创建新合同版本，不覆盖原签署事实；资质有效性与核验状态分开管理，所有处置动作均保留审计轨迹。
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
          rowKey,
          tableLayout: 'fixed',
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <ComplianceRecordDialog ref="recordDialogRef" @success="handleRecordSuccess" />
      <ComplianceActionDialog ref="actionDialogRef" @success="handleActionSuccess" />
      <ComplianceDetailDrawer ref="detailDrawerRef" />
      <MasterDataDeleteGuard ref="contractDeleteGuardRef" />
      <MasterDataDeleteGuard ref="qualificationDeleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    DeleteReferenceBlockedError,
    getDeleteReferenceContext
  } from '@/utils/supabase/delete-reference'
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
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import type { ColumnOption, DialogType } from '@/types'
  import {
    deleteComplianceRecord,
    fetchComplianceDetail,
    fetchComplianceOverview,
    fetchComplianceRecords
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import ComplianceRecordDialog from './modules/compliance-record-dialog.vue'
  import ComplianceActionDialog from './modules/compliance-action-dialog.vue'
  import ComplianceDetailDrawer from './modules/compliance-detail-drawer.vue'

  defineOptions({ name: 'HrCompliance' })

  type Entity = Api.Hr.ComplianceEntity
  type RecordEntity = Api.Hr.ComplianceRecordEntity
  type RecordItem = Api.Hr.ComplianceRecord
  type EditableRecord = Api.Hr.ComplianceContract | Api.Hr.ComplianceQualification
  type TableParams = Api.Hr.ComplianceSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyDescription: string
  }
  interface RecordDialogExpose {
    handleOpen: (payload: {
      entity: RecordEntity
      type: DialogType
      editData?: EditableRecord
      loadEditData?: () => Promise<EditableRecord | undefined>
    }) => Promise<void>
  }
  interface ActionDialogExpose {
    handleOpen: (
      entity: RecordEntity,
      action: Api.Hr.ComplianceAction,
      record: EditableRecord
    ) => Promise<void>
    handleOpenDeferred: (
      entity: RecordEntity,
      action: Api.Hr.ComplianceAction | 'resolve',
      loadRecord: () => Promise<EditableRecord | undefined>
    ) => Promise<void>
  }
  interface DetailDrawerExpose {
    handleOpen: (entity: RecordEntity, id: string) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'risk',
      label: '风险控制台',
      description: '按紧迫度汇总待处置合同与资质',
      emptyDescription: '当前没有进入提醒窗口的合同或员工资质。',
      icon: 'ri:alarm-warning-line'
    },
    {
      value: 'contract',
      label: '劳动合同',
      description: '签署版本、续签决策与终止留痕',
      emptyDescription: '为员工建立首个劳动合同版本，并维护签署与到期信息。',
      icon: 'ri:file-shield-2-line'
    },
    {
      value: 'qualification',
      label: '员工资质',
      description: '真实性核验、有效期与责任人',
      emptyDescription: '录入员工资质并完成独立核验，建立到期复审责任。',
      icon: 'ri:award-line'
    }
  ]

  const userStore = useUserStore()
  const complianceRiskObjectOptions = useDictionaryOptions('hrComplianceRiskObject')
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const deleteBusy = ref(false)
  const {
    deleteGuardRef: contractDeleteGuardRef,
    inspectDeleteReferences: inspectContractReferences
  } = useRecordDeleteGuard('hr_employee_contract', '劳动合同')
  const {
    deleteGuardRef: qualificationDeleteGuardRef,
    inspectDeleteReferences: inspectQualificationReferences
  } = useRecordDeleteGuard('hr_employee_qualification', '员工资质')
  const activeEntity = ref<Entity>('risk')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const recordDialogRef = ref<RecordDialogExpose>()
  const actionDialogRef = ref<ActionDialogExpose>()
  const detailDrawerRef = ref<DetailDrawerExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableTotal = ref(0)
  const tableState = reactive<{ searchQuery: Api.Hr.ComplianceSearchParams }>({
    searchQuery: { tenantId: '', status: '', riskStatus: '', keyword: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_employee_contract: 'contract',
      hr_employee_qualification: 'qualification'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const overview = reactive<Api.Hr.ComplianceOverview>({
    activeContractCount: 0,
    contractRiskCount: 0,
    overdueContractCount: 0,
    qualificationRiskCount: 0,
    expiredQualificationCount: 0,
    pendingVerificationCount: 0,
    verifiedRate: 0
  })

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '合同版本控制', type: 'primary', effect: 'plain' },
    { label: '到期风险预警', type: 'warning', effect: 'light' },
    { label: '核验审计留痕', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '有效劳动合同',
      value: overview.activeContractCount,
      description: '当前受控的有效合同版本',
      icon: 'ri:file-shield-2-line',
      tone: 'primary'
    },
    {
      label: '合同到期风险',
      value: overview.contractRiskCount,
      description: `${overview.overdueContractCount} 份已经逾期`,
      icon: 'ri:calendar-event-line',
      tone: overview.contractRiskCount ? 'danger' : 'success'
    },
    {
      label: '资质到期风险',
      value: overview.qualificationRiskCount,
      description: `${overview.expiredQualificationCount} 项已经失效`,
      icon: 'ri:award-line',
      tone: overview.qualificationRiskCount ? 'warning' : 'success'
    },
    {
      label: '资质核验率',
      value: `${overview.verifiedRate}%`,
      description: `${overview.pendingVerificationCount} 项等待核验`,
      icon: 'ri:verified-badge-line',
      tone: overview.verifiedRate >= 95 ? 'success' : 'info'
    }
  ])
  const controlStages = computed(() => [
    {
      label: '权威资料建档',
      description: '合同版本与资质原始凭证',
      value: `${overview.activeContractCount} 份有效合同`,
      icon: 'ri:archive-stack-line',
      state: overview.activeContractCount ? 'is-complete' : 'is-current'
    },
    {
      label: '真实性与责任核验',
      description: '独立核验、负责人和复审日',
      value: `${overview.pendingVerificationCount} 项待核验`,
      icon: 'ri:shield-check-line',
      state: overview.pendingVerificationCount ? 'is-current' : 'is-complete'
    },
    {
      label: '到期决策与处置',
      description: '分级预警、续签或终止闭环',
      value: `${overview.contractRiskCount + overview.qualificationRiskCount} 项风险`,
      icon: 'ri:radar-line',
      state:
        overview.contractRiskCount + overview.qualificationRiskCount ? 'is-risk' : 'is-complete'
    }
  ])
  const attentionLabel = computed(() =>
    activeEntity.value === 'risk'
      ? '已逾期'
      : activeEntity.value === 'contract'
        ? '合同风险'
        : '待核验'
  )
  const attentionValue = computed(() =>
    activeEntity.value === 'risk'
      ? overview.overdueContractCount + overview.expiredQualificationCount
      : activeEntity.value === 'contract'
        ? overview.contractRiskCount
        : overview.pendingVerificationCount
  )
  const attentionTone = computed(() => (attentionValue.value ? 'is-danger' : 'is-success'))

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
    if (activeEntity.value === 'risk') {
      items.push({
        label: '风险对象',
        key: 'status',
        type: 'select',
        options: complianceRiskObjectOptions,
        props: { clearable: true, placeholder: '全部对象' }
      })
    } else {
      items.push({
        label: '状态',
        key: 'status',
        type: 'select',
        options:
          activeEntity.value === 'contract'
            ? (getDictMap.value.hrContractStatus ?? [])
            : [
                ...(getDictMap.value.hrQualificationStatus ?? []),
                ...(getDictMap.value.hrQualificationVerificationStatus ?? [])
              ],
        props: { clearable: true, placeholder: '全部状态' }
      })
    }
    items.push(
      {
        label: '风险等级',
        key: 'riskStatus',
        type: 'select',
        options: (getDictMap.value.hrComplianceRiskStatus ?? []).filter(
          (item) => activeEntity.value !== 'risk' || item.value !== 'clear'
        ),
        props: { clearable: true, placeholder: '全部风险' }
      },
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder:
            activeEntity.value === 'contract'
              ? '员工、工号或合同编号'
              : activeEntity.value === 'qualification'
                ? '员工、证书或发证机构'
                : '员工、工号或风险对象'
        }
      }
    )
    return items
  })

  const riskTone = (risk?: Api.Hr.ComplianceRiskStatus): TagProps['type'] =>
    ['overdue', 'critical'].includes(risk || '')
      ? 'danger'
      : risk === 'due_soon'
        ? 'warning'
        : risk === 'clear'
          ? 'success'
          : 'primary'
  const daysText = (days?: number | null): string => {
    if (days == null) return '无固定到期日'
    return days < 0 ? `已逾期 ${Math.abs(days)} 天` : `剩余 ${days} 天`
  }
  const riskCell = (risk?: Api.Hr.ComplianceRiskStatus, days?: number | null) => (
    <div class="compliance-page__risk-cell">
      <ElTag type={riskTone(risk)} effect="light" round>
        {userStore.getDictLabelByValue('hrComplianceRiskStatus', risk, risk ?? '--')}
      </ElTag>
      <small>{daysText(days)}</small>
    </div>
  )
  const dateText = createDateTimeFormatter({
    format: 'YYYY-MM-DD',
    emptyText: '--',
    invalidText: '--'
  })

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'risk') return riskColumns()
    if (activeEntity.value === 'contract') return contractColumns()
    return qualificationColumns()
  }
  const riskColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '员工 / 任职信息',
      minWidth: 220,
      fixed: 'left',
      link: { permission: 'Hr:Compliance:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceRisk
        return (
          <BusinessTableIdentityCell
            primary={item.employee.employeeName}
            secondary={`${item.employee.employeeNo ?? '--'} · ${item.employee.positionName ?? item.employee.jobTitle ?? '未维护岗位'}`}
          />
        )
      }
    },
    {
      prop: 'subject',
      label: '风险对象',
      minWidth: 200,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceRisk
        return <BusinessTableIdentityCell primary={item.subject} secondary={item.riskType} />
      }
    },
    {
      prop: 'riskStatus',
      label: '风险等级',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceRisk
        return riskCell(item.riskStatus, item.daysRemaining)
      }
    },
    {
      prop: 'dueDate',
      label: '到期日',
      width: 120,
      formatter: (row) => dateText((row as Api.Hr.ComplianceRisk).dueDate)
    },
    {
      prop: 'owner',
      label: '处置负责人',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceRisk
        return (
          <BusinessTableIdentityCell
            primary={item.owner?.employeeName || '待指定'}
            secondary={item.owner?.jobTitle || '需要明确责任人'}
          />
        )
      }
    },
    { prop: 'description', label: '处置提示', minWidth: 240, showOverflowTooltip: true },
    actionColumn()
  ]
  const contractColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'contractNo',
      label: '合同 / 员工',
      minWidth: 235,
      fixed: 'left',
      link: { permission: 'Hr:Compliance:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceContract
        return (
          <BusinessTableIdentityCell
            primary={item.contractNo}
            secondary={`${item.employee?.employeeName ?? '--'} · ${item.employee?.employeeNo ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'period',
      label: '合同期限',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceContract
        return (
          <BusinessTableIdentityCell
            primary={`${dateText(item.startDate)} 至 ${dateText(item.endDate)}`}
            secondary={userStore.getDictLabelByValue(
              'hrContractType',
              item.contractType,
              item.contractType ?? '--'
            )}
          />
        )
      }
    },
    {
      prop: 'contractStatus',
      label: '合同状态',
      width: 105,
      dict: { code: 'hrContractStatus', display: 'auto' }
    },
    {
      prop: 'renewalDecision',
      label: '续签决策 / 负责人',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceContract
        return (
          <BusinessTableIdentityCell
            primary={userStore.getDictLabelByValue(
              'hrContractRenewalDecision',
              item.renewalDecision,
              item.renewalDecision ?? '--'
            )}
            secondary={item.renewalOwner?.employeeName || '待指定负责人'}
          />
        )
      }
    },
    {
      prop: 'riskStatus',
      label: '到期风险',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceContract
        return riskCell(item.riskStatus, item.daysRemaining)
      }
    },
    {
      prop: 'version',
      label: '版本来源',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceContract
        return (
          <BusinessTableIdentityCell
            primary={item.previousContractNo ? '续签版本' : '首个版本'}
            secondary={item.previousContractNo ? `承接 ${item.previousContractNo}` : '原始签署版本'}
          />
        )
      }
    },
    actionColumn()
  ]
  const qualificationColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'qualificationName',
      label: '资质 / 员工',
      minWidth: 235,
      fixed: 'left',
      link: { permission: 'Hr:Compliance:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceQualification
        return (
          <BusinessTableIdentityCell
            primary={item.qualificationName}
            secondary={`${item.employee?.employeeName ?? '--'} · ${item.employee?.employeeNo ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'certificate',
      label: '证书 / 发证机构',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceQualification
        return (
          <BusinessTableIdentityCell
            primary={item.certificateNo || '未维护证书编号'}
            secondary={item.issuer || '未维护发证机构'}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '有效状态',
      width: 105,
      dict: { code: 'hrQualificationStatus', display: 'auto' }
    },
    {
      prop: 'verificationStatus',
      label: '核验状态',
      width: 110,
      dict: { code: 'hrQualificationVerificationStatus', display: 'auto' }
    },
    {
      prop: 'riskStatus',
      label: '到期风险',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceQualification
        return riskCell(item.riskStatus, item.daysRemaining)
      }
    },
    {
      prop: 'owner',
      label: '责任人 / 复审日',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.ComplianceQualification
        return (
          <BusinessTableIdentityCell
            primary={item.responsibleEmployee?.employeeName || '待指定'}
            secondary={
              item.nextReviewDate ? `复审 ${dateText(item.nextReviewDate)}` : '未设置复审日'
            }
          />
        )
      }
    },
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
          permission="Hr:Compliance:View"
          label="查看合规详情"
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
    if (activeEntity.value === 'risk') {
      const risk = row as Api.Hr.ComplianceRisk
      return [
        {
          key: 'resolve',
          label: risk.entityType === 'contract' ? '推进到期处置' : '处理资质风险',
          icon: 'ri:arrow-right-circle-line',
          auth:
            risk.entityType === 'contract'
              ? 'Hr:Compliance:Contract:Renew'
              : 'Hr:Compliance:Qualification:Verify'
        },
        {
          key: 'comment',
          label: '补充处置说明',
          icon: 'ri:chat-1-line',
          auth: 'Hr:Compliance:Edit'
        }
      ]
    }
    if (activeEntity.value === 'contract') {
      const item = row as Api.Hr.ComplianceContract
      const actions: ButtonMoreItem[] = []
      if (item.contractStatus === 'draft') {
        actions.push(
          {
            key: 'edit',
            label: '编辑合同资料',
            icon: 'ri:edit-line',
            auth: 'Hr:Compliance:Edit'
          },
          {
            key: 'activate',
            label: '确认合同生效',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:Compliance:Edit'
          },
          {
            key: 'delete',
            label: '删除合同草稿',
            icon: 'ri:delete-bin-line',
            color: 'var(--el-color-danger)',
            auth: 'Hr:Compliance:Delete'
          }
        )
      }
      if (item.contractStatus === 'active') {
        actions.push(
          {
            key: 'edit',
            label: '更新合同资料',
            icon: 'ri:edit-line',
            auth: 'Hr:Compliance:Edit'
          },
          {
            key: 'start_renewal',
            label: '启动合同续签',
            icon: 'ri:refresh-line',
            auth: 'Hr:Compliance:Contract:Renew'
          },
          {
            key: 'terminate',
            label: '终止劳动合同',
            icon: 'ri:close-circle-line',
            color: 'var(--el-color-danger)',
            auth: 'Hr:Compliance:Contract:Terminate'
          }
        )
      }
      if (item.contractStatus === 'renewing') {
        actions.push(
          {
            key: 'renew',
            label: '完成合同续签',
            icon: 'ri:file-copy-2-line',
            auth: 'Hr:Compliance:Contract:Renew'
          },
          {
            key: 'terminate',
            label: '终止劳动合同',
            icon: 'ri:close-circle-line',
            color: 'var(--el-color-danger)',
            auth: 'Hr:Compliance:Contract:Terminate'
          }
        )
      }
      actions.push({
        key: 'comment',
        label: '补充合规说明',
        icon: 'ri:chat-1-line',
        auth: 'Hr:Compliance:Edit'
      })
      return actions
    }
    const item = row as Api.Hr.ComplianceQualification
    const actions: ButtonMoreItem[] = []
    if (item.status !== 'revoked') {
      actions.push({
        key: 'edit',
        label: '编辑资质资料',
        icon: 'ri:edit-line',
        auth: 'Hr:Compliance:Edit'
      })
    }
    if (item.verificationStatus !== 'verified' && item.status !== 'revoked') {
      actions.push(
        {
          key: 'verify',
          label: '通过资质核验',
          icon: 'ri:shield-check-line',
          auth: 'Hr:Compliance:Qualification:Verify'
        },
        {
          key: 'reject',
          label: '驳回资质核验',
          icon: 'ri:error-warning-line',
          color: 'var(--el-color-warning)',
          auth: 'Hr:Compliance:Qualification:Verify'
        }
      )
    }
    if (item.verificationStatus === 'verified' && item.status !== 'revoked') {
      actions.push({
        key: 'revoke',
        label: '撤销员工资质',
        icon: 'ri:close-circle-line',
        color: 'var(--el-color-danger)',
        auth: 'Hr:Compliance:Qualification:Revoke'
      })
    }
    if (item.verificationStatus !== 'verified' && item.status !== 'revoked') {
      actions.push({
        key: 'delete',
        label: '删除未核验记录',
        icon: 'ri:delete-bin-line',
        color: 'var(--el-color-danger)',
        auth: 'Hr:Compliance:Delete'
      })
    }
    actions.push({
      key: 'comment',
      label: '补充合规说明',
      icon: 'ri:chat-1-line',
      auth: 'Hr:Compliance:Edit'
    })
    return actions
  }

  const getRecordContext = (row: RecordItem): { entity: RecordEntity; id: string } | null => {
    if ('recordId' in row) return { entity: row.entityType, id: row.recordId }
    if (!row.id) return null
    return { entity: activeEntity.value as RecordEntity, id: row.id }
  }
  const loadEditableRecord = async (
    row: RecordItem
  ): Promise<{ entity: RecordEntity; record: EditableRecord } | null> => {
    const context = getRecordContext(row)
    if (!context) return null
    if (!('recordId' in row)) {
      return { entity: context.entity, record: row as EditableRecord }
    }
    const response = await fetchComplianceDetail(context.entity, context.id)
    return response.data ? { entity: context.entity, record: response.data } : null
  }
  const resolveRiskAction = (
    record: EditableRecord,
    entity: RecordEntity
  ): Api.Hr.ComplianceAction => {
    if (entity === 'contract') {
      return (record as Api.Hr.ComplianceContract).contractStatus === 'renewing'
        ? 'renew'
        : 'start_renewal'
    }
    return (record as Api.Hr.ComplianceQualification).verificationStatus === 'verified'
      ? 'comment'
      : 'verify'
  }
  const handleRowAction = async (item: ButtonMoreItem, row: RecordItem): Promise<void> => {
    if (item.key === 'edit') {
      const context = getRecordContext(row)
      if (!context) return
      await recordDialogRef.value?.handleOpen({
        entity: context.entity,
        type: 'edit',
        editData: 'recordId' in row ? undefined : (row as EditableRecord),
        loadEditData:
          'recordId' in row
            ? async () =>
                (await fetchComplianceDetail(context.entity, context.id)).data ?? undefined
            : undefined
      })
      return
    }
    if ('recordId' in row && item.key !== 'delete') {
      const recordContext = getRecordContext(row)
      if (!recordContext) return
      await actionDialogRef.value?.handleOpenDeferred(
        recordContext.entity,
        item.key as Api.Hr.ComplianceAction | 'resolve',
        async () =>
          (await fetchComplianceDetail(recordContext.entity, recordContext.id)).data ?? undefined
      )
      return
    }
    const context = await loadEditableRecord(row)
    if (!context) return
    if (item.key === 'delete') {
      await handleDelete(context.entity, context.record)
      return
    }
    const action =
      item.key === 'resolve'
        ? resolveRiskAction(context.record, context.entity)
        : (item.key as Api.Hr.ComplianceAction)
    await actionDialogRef.value?.handleOpen(context.entity, action, context.record)
  }
  const openDetail = (row: RecordItem): void => {
    const context = getRecordContext(row)
    if (context) void detailDrawerRef.value?.handleOpen(context.entity, context.id)
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => {
    if (activeEntity.value === 'risk') return []
    return [
      {
        type: 'add',
        label: activeEntity.value === 'contract' ? '新增劳动合同' : '新增员工资质',
        permission: 'Hr:Compliance:Add',
        onClick: () =>
          void recordDialogRef.value?.handleOpen({
            entity: activeEntity.value as RecordEntity,
            type: 'add'
          })
      }
    ]
  })
  const rowKey = (row: RecordItem): string =>
    'recordId' in row
      ? `${row.entityType}-${row.recordId}`
      : row.id || `${activeEntity.value}-record`
  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchComplianceRecords(activeEntity.value, { ...params, from, to })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchComplianceOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const handleRecordSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void refreshOverview()
  }
  const handleActionSuccess = (): void => {
    void tableQueryRef.value?.refreshUpdate()
    void refreshOverview()
  }
  const handleDelete = async (entity: RecordEntity, record: EditableRecord): Promise<void> => {
    if (!record.id || deleteBusy.value) return
    if (!hasAuth('Hr:Compliance:Delete')) {
      notifyFriendlyError(new Error('当前账号无权删除合规草稿'), '当前账号无权删除合规草稿')
      return
    }
    const inspect =
      entity === 'contract' ? inspectContractReferences : inspectQualificationReferences
    const label =
      entity === 'contract'
        ? (record as Api.Hr.ComplianceContract).contractNo
        : (record as Api.Hr.ComplianceQualification).qualificationName
    const resources = [{ id: record.id, label: label || '未编号合规草稿' }]
    deleteBusy.value = true
    try {
      if (await inspect(resources)) return
      await confirmAction(
        entity === 'contract'
          ? `确定删除合同草稿“${(record as Api.Hr.ComplianceContract).contractNo}”吗？`
          : `确定删除未核验资质“${(record as Api.Hr.ComplianceQualification).qualificationName}”吗？`,
        '删除合规草稿',
        {
          confirmButtonText: '删除',
          cancelButtonText: '返回',
          type: 'warning',
          confirmButtonType: 'danger'
        }
      )
      try {
        if (!hasAuth('Hr:Compliance:Delete')) {
          notifyFriendlyError(
            new Error('合规草稿删除权限已变化'),
            '删除权限已变化，请刷新页面后重试'
          )
          return
        }
        await deleteComplianceRecord(entity, record.id)
      } catch (error) {
        if (await inspect(resources, getDeleteReferenceContext(error)?.constraint)) return
        if (error instanceof DeleteReferenceBlockedError) return
        throw error
      }
      await tableQueryRef.value?.refreshRemove()
      await refreshOverview()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '合规草稿删除失败，请刷新记录后重试')
    } finally {
      deleteBusy.value = false
    }
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { status: '', riskStatus: '', keyword: '' })
    tableTotal.value = 0
  }

  onMounted(async () => {
    await Promise.all(
      [
        'hrContractType',
        'hrContractStatus',
        'hrContractRenewalDecision',
        'hrQualificationType',
        'hrQualificationStatus',
        'hrQualificationVerificationStatus',
        'hrComplianceRiskStatus',
        'hrComplianceEventType'
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

  .compliance-page {
    @include hr-table-workspace-layout(360px);

    &__control {
      position: relative;
      padding: 18px;
      overflow: hidden;
      background:
        radial-gradient(
          circle at 96% 8%,
          color-mix(in srgb, var(--theme-color) 9%, transparent),
          transparent 30%
        ),
        var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--theme-color) 10%, var(--art-card-border));
      border-radius: calc(var(--el-border-radius-base) + 6px);
      box-shadow: 0 10px 30px color-mix(in srgb, var(--art-gray-900) 4%, transparent);
    }

    &__heading {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;

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
      border: 1px solid color-mix(in srgb, var(--theme-color) 13%, transparent);
    }

    &__section-icon {
      width: 38px;
      height: 38px;
      border-radius: 11px;

      :deep(.art-svg-icon) {
        font-size: 19px;
      }
    }

    &__governance {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-color-success-dark-2);
      white-space: nowrap;
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: 999px;
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 0;
      margin: 0 0 14px;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: 32px 38px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        min-height: 82px;
        padding: 12px;
        background: color-mix(in srgb, var(--theme-color) 2.5%, var(--default-box-color));
        border: 1px solid var(--art-card-border);
        border-radius: calc(var(--el-border-radius-base) + 3px);

        &.is-risk {
          background: var(--el-color-danger-light-9);
          border-color: var(--el-color-danger-light-7);
        }

        &.is-complete .compliance-page__rail-icon {
          color: var(--el-color-success-dark-2);
          background: var(--el-color-success-light-9);
          border-color: var(--el-color-success-light-7);
        }

        &.is-current {
          border-color: color-mix(in srgb, var(--theme-color) 24%, var(--art-card-border));
        }

        > div {
          display: grid;
          min-width: 0;
        }

        strong {
          font-size: 13px;
        }

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        b {
          grid-column: 2 / -1;
          margin-top: -5px;
          font-size: 11px;
          font-weight: 600;
          color: var(--el-text-color-regular);
        }
      }
    }

    &__rail-index {
      font-size: 11px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
    }

    &__rail-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
    }

    &__context {
      display: flex;
      gap: 18px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      margin-top: 12px;
      background: color-mix(in srgb, var(--theme-color) 3%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
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

      > div small {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
      }

      > div strong {
        margin-top: 2px;
        font-size: 13px;
      }

      > div em {
        @include ellipsis;

        margin-top: 2px;
        font-size: 11px;
        font-style: normal;
        color: var(--el-text-color-secondary);
      }

      dl {
        display: flex;
        margin: 0;
      }

      dl > div {
        min-width: 82px;
        padding: 0 14px;
        text-align: right;
      }

      dl > div + div {
        border-left: 1px solid var(--art-card-border);
      }

      dt {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 2px 0 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--el-text-color-primary);
      }

      .is-danger dd {
        color: var(--el-color-danger);
      }

      .is-success dd {
        color: var(--el-color-success);
      }
    }

    &__context-icon {
      width: 36px;
      height: 36px;
      border-radius: 9px;
    }

    &__note {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      margin-top: 11px;
      font-size: 11px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);

      :deep(.art-svg-icon) {
        flex: 0 0 auto;
        margin-top: 1px;
        color: var(--theme-color);
      }
    }

    &__risk-cell {
      display: grid;
      gap: 4px;
      justify-items: start;

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__actions {
      display: flex;
      align-items: center;

      :deep(.art-button-table) {
        margin-right: 6px;
      }
    }
  }

  @media only screen and (width <= 1100px) {
    .compliance-page__rail {
      grid-template-columns: 1fr;
    }
  }

  @media only screen and (width <= 767px) {
    .compliance-page {
      &__control {
        padding: 14px;
      }

      &__heading,
      &__context {
        align-items: flex-start;
      }

      &__heading,
      &__context {
        flex-direction: column;
      }

      &__context dl {
        width: 100%;
      }

      &__context dl > div {
        flex: 1;
        text-align: left;
      }

      &__rail li {
        grid-template-columns: 28px 36px minmax(0, 1fr);
      }
    }
  }
</style>
