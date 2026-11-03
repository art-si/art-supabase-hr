<template>
  <ArtPermissionGuard permission="Hr:Recruitment:View">
    <div class="recruitment-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="RECRUITMENT OPERATIONS"
        title="招聘运营工作台"
        description="从用人需求、候选人评估、面试决策到 Offer 与入职交接，形成可追踪、可审计、可量化的招聘闭环。"
        icon="ri:user-add-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="recruitment-page__pipeline" aria-label="招聘业务闭环">
        <div
          v-for="(step, index) in pipelineSteps"
          :key="step.label"
          class="recruitment-page__pipeline-step"
        >
          <span><ArtSvgIcon :icon="step.icon" /></span>
          <div
            ><strong>{{ step.label }}</strong
            ><small>{{ step.description }}</small></div
          >
          <ArtSvgIcon
            v-if="index < pipelineSteps.length - 1"
            class="recruitment-page__pipeline-arrow"
            icon="ri:arrow-right-line"
          />
        </div>
        <p
          ><ArtSvgIcon icon="ri:shield-check-line" />
          联系方式与薪资按敏感权限遮罩；阶段变化与评价结果保留审计轨迹。</p
        >
      </section>

      <section class="recruitment-page__tabs" aria-label="招聘管理分类">
        <ElTabs v-model="activeEntity" @tab-change="handleTabChange">
          <ElTabPane v-for="tab in tabs" :key="tab.entity" :name="tab.entity">
            <template #label>
              <span class="recruitment-page__tab-label">
                <ArtSvgIcon :icon="tab.icon" />
                <span
                  ><strong>{{ tab.label }}</strong
                  ><small>{{ tab.description }}</small></span
                >
              </span>
            </template>
          </ElTabPane>
        </ElTabs>
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
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <RecruitmentDialog ref="dialogRef" @success="handleSaveSuccess" />
      <RecruitmentActionDialog ref="actionDialogRef" @success="handleActionSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatNumberValue } from '@/utils/ui/format'
  import dayjs from 'dayjs'
  import { ElProgress } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryApiFn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
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
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import type { ColumnOption } from '@/types'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import {
    completeRecruitmentTask,
    deleteRecruitmentRecord,
    effectRecruitmentRequisition,
    fetchRecruitmentOverview,
    fetchRecruitmentRecords,
    submitHrApproval,
    transitionCandidateStage,
    transitionRecruitmentHandoff,
    transitionRecruitmentOffer
  } from '@hr/api'
  import RecruitmentDialog from './modules/recruitment-dialog.vue'
  import RecruitmentActionDialog from './modules/recruitment-action-dialog.vue'

  defineOptions({ name: 'HrRecruitment' })
  type Entity = Api.Hr.RecruitmentEntity
  type RecordItem = Api.Hr.RecruitmentRecord
  type TableParams = Api.Hr.RecruitmentSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab {
    entity: Entity
    label: string
    description: string
    emptyDescription: string
    icon: string
    statusDict: string
  }
  interface DialogExpose {
    handleOpen: (entity: Entity, row?: RecordItem) => Promise<void>
  }
  interface ActionDialogExpose {
    handleOpen: (data: { kind: string; id: string; subject: string }) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      entity: 'requisition',
      label: '招聘需求',
      description: '审批与编制目标',
      emptyDescription: '先创建招聘需求并完成审批，再启动候选人招募。',
      icon: 'ri:file-list-3-line',
      statusDict: 'hrRecruitmentStatus'
    },
    {
      entity: 'candidate',
      label: '候选人',
      description: '来源、授权与阶段',
      emptyDescription: '把候选人关联到有效招聘需求，并记录信息授权状态。',
      icon: 'ri:user-search-line',
      statusDict: 'hrCandidateStage'
    },
    {
      entity: 'interview',
      label: '面试评估',
      description: '轮次与独立评价',
      emptyDescription: '为筛选通过的候选人安排面试，并由面试官独立提交评价。',
      icon: 'ri:calendar-event-line',
      statusDict: 'hrInterviewStatus'
    },
    {
      entity: 'offer',
      label: 'Offer 管理',
      description: '版本、审批与反馈',
      emptyDescription: '面试决策通过后创建 Offer，依次完成审批、发送和反馈登记。',
      icon: 'ri:mail-send-line',
      statusDict: 'hrOfferStatus'
    },
    {
      entity: 'handoff',
      label: '入职交接',
      description: '接受到正式入职',
      emptyDescription: '候选人接受 Offer 后自动建立交接，完成员工档案关联与入职准备。',
      icon: 'ri:exchange-box-line',
      statusDict: 'hrRecruitmentHandoffStatus'
    },
    {
      entity: 'task',
      label: '入职任务',
      description: '负责人、时限与验收',
      emptyDescription: '为入职交接补充资料、账号、设备、培训等可验收任务。',
      icon: 'ri:task-line',
      statusDict: 'hrOnboardingTaskStatus'
    }
  ]
  const pipelineSteps = [
    { label: '需求审批', description: '组织、岗位与人数', icon: 'ri:file-check-line' },
    { label: '候选人筛选', description: '来源与授权', icon: 'ri:user-search-line' },
    { label: '面试决策', description: '多轮独立评价', icon: 'ri:survey-line' },
    { label: 'Offer', description: '版本与审批', icon: 'ri:mail-send-line' },
    { label: '入职交接', description: '任务与员工建档', icon: 'ri:user-follow-line' }
  ]

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const activeEntity = ref<Entity>('requisition')
  const activeTab = computed(() => tabs.find((tab) => tab.entity === activeEntity.value) ?? tabs[0])
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => (activeEntity.value === 'requisition' ? 'hr_recruitment_requisition' : 'hr_candidate'),
    () => activeTab.value.label
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const actionDialogRef = ref<ActionDialogExpose>()
  const tenantOptions = shallowRef<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.RecruitmentSearchParams }>({
    searchQuery: { tenantId: '', status: '', keyword: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_recruitment_requisition: 'requisition',
      hr_candidate: 'candidate',
      hr_recruitment_handoff: 'handoff'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const overview = reactive<Api.Hr.RecruitmentOverview>({
    activeRequisitionCount: 0,
    openCandidateCount: 0,
    upcomingInterviewCount: 0,
    awaitingOfferResponseCount: 0,
    acceptedOfferCount: 0,
    pendingHandoffCount: 0,
    overdueTaskCount: 0,
    hiredCandidateCount: 0
  })
  const sensitiveAccess = ref(false)
  const canViewSensitive = computed(
    () => sensitiveAccess.value && hasAuth('Hr:Recruitment:Sensitive:View')
  )

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '招聘漏斗', type: 'primary', effect: 'plain' },
    { label: '评价可审计', type: 'warning', effect: 'light' },
    { label: '入职闭环', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '招聘中需求',
      value: overview.activeRequisitionCount,
      description: `${overview.openCandidateCount} 名在途候选人`,
      icon: 'ri:file-list-3-line',
      tone: 'primary'
    },
    {
      label: '7 日内面试',
      value: overview.upcomingInterviewCount,
      description: '待协调与评价',
      icon: 'ri:calendar-event-line',
      tone: 'warning'
    },
    {
      label: '待反馈 Offer',
      value: overview.awaitingOfferResponseCount,
      description: `${overview.acceptedOfferCount} 份已接受`,
      icon: 'ri:mail-check-line',
      tone: 'success'
    },
    {
      label: '待完成交接',
      value: overview.pendingHandoffCount,
      description: `${overview.overdueTaskCount} 项任务逾期`,
      icon: 'ri:exchange-box-line',
      tone: overview.overdueTaskCount ? 'danger' : 'info'
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
        props: { clearable: true, filterable: true, placeholder: '全部租户' }
      })
    items.push(
      {
        label: '状态',
        key: 'status',
        type: 'select',
        options: getDictMap.value[activeTab.value.statusDict] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      },
      {
        label: '关键词',
        key: 'keyword',
        type: 'input',
        props: { clearable: true, placeholder: `搜索${activeTab.value.label}` }
      }
    )
    return items
  })
  const addPermissions: Record<Entity, string> = {
    requisition: 'Hr:Recruitment:Add',
    candidate: 'Hr:Recruitment:Add',
    interview: 'Hr:Recruitment:Interview:Add',
    offer: 'Hr:Recruitment:Offer:Add',
    handoff: 'Hr:Recruitment:Handoff:Add',
    task: 'Hr:Recruitment:Task:Manage'
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${activeTab.value.label}`,
      permission: addPermissions[activeEntity.value],
      onClick: () => void dialogRef.value?.handleOpen(activeEntity.value)
    }
  ])

  const dict = (code: string, value?: string | null) => (
    <ArtDictDisplay dictCode={code} value={String(value ?? '')} display="auto" />
  )

  interface RecruitmentMoreAction extends ButtonMoreItem {
    run: () => void
  }
  const editButton = (permission: string, row: RecordItem) => (
    <ArtButtonTable
      type="edit"
      permission={permission}
      onClick={() => void dialogRef.value?.handleOpen(activeEntity.value, row)}
    />
  )
  const moreAction = (
    key: string,
    label: string,
    permission: string,
    run: () => void,
    icon: string,
    color?: string
  ): RecruitmentMoreAction => ({ key, label, auth: permission, run, icon, color })
  const renderActions = (primary: import('vue').VNodeChild, actions: RecruitmentMoreAction[]) => (
    <BusinessTableRowActions>
      {primary}
      <ArtButtonMore
        list={actions}
        onClick={(item: ButtonMoreItem) => actions.find((action) => action.key === item.key)?.run()}
      />
    </BusinessTableRowActions>
  )

  const requisitionActions = (row: Api.Hr.RecruitmentRequisition) => {
    const editable = ['draft', 'rejected'].includes(row.status)
    const actions: RecruitmentMoreAction[] = []
    if (editable) {
      actions.push(
        moreAction(
          'submit',
          '提交审批',
          'Hr:Recruitment:Submit',
          () => void submitRequisition(row),
          'ri:send-plane-line'
        ),
        moreAction(
          'delete',
          '删除招聘需求',
          'Hr:Recruitment:Delete',
          () => void handleDelete(row),
          'ri:delete-bin-5-line',
          'var(--el-color-danger)'
        )
      )
    }
    if (row.status === 'approved')
      actions.push(
        moreAction(
          'effect',
          '启动招聘',
          'Hr:Recruitment:Effect',
          () => void effectRequisition(row),
          'ri:play-circle-line'
        )
      )
    return renderActions(editable ? editButton('Hr:Recruitment:Edit', row) : null, actions)
  }
  const candidateActions = (row: Api.Hr.RecruitmentCandidate) => {
    const editable = !['hired', 'rejected', 'withdrawn'].includes(row.stage)
    const actions: RecruitmentMoreAction[] = []
    if (row.stage === 'new')
      actions.push(
        moreAction(
          'screen',
          '进入筛选',
          'Hr:Recruitment:Candidate:Move',
          () => void screenCandidate(row),
          'ri:filter-3-line'
        )
      )
    if (editable) {
      actions.push(
        moreAction(
          'reject',
          '淘汰候选人',
          'Hr:Recruitment:Candidate:Move',
          () => void openAction('candidate_reject', row.id!, `淘汰候选人 ${row.candidateName}`),
          'ri:close-circle-line',
          'var(--el-color-danger)'
        ),
        moreAction(
          'withdraw',
          '记录候选人放弃',
          'Hr:Recruitment:Candidate:Move',
          () =>
            void openAction('candidate_withdraw', row.id!, `记录候选人 ${row.candidateName} 放弃`),
          'ri:arrow-go-back-line'
        )
      )
    }
    if (row.stage === 'new')
      actions.push(
        moreAction(
          'delete',
          '删除候选人',
          'Hr:Recruitment:Delete',
          () => void handleDelete(row),
          'ri:delete-bin-5-line',
          'var(--el-color-danger)'
        )
      )
    return renderActions(editable ? editButton('Hr:Recruitment:Edit', row) : null, actions)
  }
  const interviewActions = (row: Api.Hr.RecruitmentInterview) => {
    const scheduled = row.status === 'scheduled'
    const actions = scheduled
      ? [
          moreAction(
            'complete',
            '提交面试评价',
            'Hr:Recruitment:Interview:Complete',
            () => void openAction('interview_complete', row.id!, row.candidate?.name ?? '候选人'),
            'ri:checkbox-circle-line'
          ),
          moreAction(
            'cancel',
            '取消面试',
            'Hr:Recruitment:Interview:Edit',
            () =>
              void openAction(
                'interview_cancel',
                row.id!,
                `取消 ${row.candidate?.name ?? ''} 的面试`
              ),
            'ri:close-circle-line'
          ),
          moreAction(
            'no_show',
            '记录未到场',
            'Hr:Recruitment:Interview:Edit',
            () =>
              void openAction(
                'interview_no_show',
                row.id!,
                `记录 ${row.candidate?.name ?? ''} 未到场`
              ),
            'ri:user-unfollow-line',
            'var(--el-color-danger)'
          )
        ]
      : []
    return renderActions(
      scheduled ? editButton('Hr:Recruitment:Interview:Edit', row) : null,
      actions
    )
  }
  const offerActions = (row: Api.Hr.RecruitmentOffer) => {
    const editable = ['draft', 'rejected'].includes(row.status)
    const actions: RecruitmentMoreAction[] = []
    if (editable)
      actions.push(
        moreAction(
          'submit',
          '提交审批',
          'Hr:Recruitment:Offer:Submit',
          () => void offerAction(row, 'submit'),
          'ri:send-plane-line'
        )
      )
    if (row.status === 'pending_approval') {
      actions.push(
        moreAction(
          'approve',
          '批准 Offer',
          'Hr:Recruitment:Offer:Approve',
          () => void offerAction(row, 'approve'),
          'ri:checkbox-circle-line'
        ),
        moreAction(
          'reject',
          '驳回 Offer',
          'Hr:Recruitment:Offer:Approve',
          () => void openAction('offer_reject', row.id!, `驳回 ${row.offerNo}`),
          'ri:close-circle-line',
          'var(--el-color-danger)'
        )
      )
    }
    if (row.status === 'approved')
      actions.push(
        moreAction(
          'send',
          '发送 Offer',
          'Hr:Recruitment:Offer:Send',
          () => void offerAction(row, 'send'),
          'ri:mail-send-line'
        )
      )
    if (row.status === 'sent') {
      actions.push(
        moreAction(
          'accept',
          '登记已接受',
          'Hr:Recruitment:Offer:Respond',
          () => void offerAction(row, 'accept'),
          'ri:checkbox-circle-line'
        ),
        moreAction(
          'decline',
          '登记已拒绝',
          'Hr:Recruitment:Offer:Respond',
          () => void openAction('offer_decline', row.id!, `登记 ${row.offerNo} 被拒绝`),
          'ri:close-circle-line',
          'var(--el-color-danger)'
        )
      )
    }
    if (['approved', 'sent'].includes(row.status))
      actions.push(
        moreAction(
          'withdraw',
          '撤回 Offer',
          'Hr:Recruitment:Offer:Send',
          () => void openAction('offer_withdraw', row.id!, `撤回 ${row.offerNo}`),
          'ri:arrow-go-back-line'
        )
      )
    return renderActions(editable ? editButton('Hr:Recruitment:Offer:Edit', row) : null, actions)
  }
  const handoffActions = (row: Api.Hr.RecruitmentHandoff) => {
    const editable = ['pending', 'ready'].includes(row.status)
    const actions: RecruitmentMoreAction[] = []
    if (row.status === 'pending')
      actions.push(
        moreAction(
          'ready',
          '标记交接就绪',
          'Hr:Recruitment:Handoff:Complete',
          () => void handoffAction(row, 'ready'),
          'ri:flag-line'
        )
      )
    if (editable) {
      actions.push(
        moreAction(
          'complete',
          '完成入职交接',
          'Hr:Recruitment:Handoff:Complete',
          () => void handoffAction(row, 'complete'),
          'ri:checkbox-circle-line'
        ),
        moreAction(
          'cancel',
          '取消入职交接',
          'Hr:Recruitment:Handoff:Complete',
          () =>
            void openAction(
              'handoff_cancel',
              row.id!,
              `取消 ${row.candidate?.name ?? ''} 的入职交接`
            ),
          'ri:close-circle-line',
          'var(--el-color-danger)'
        )
      )
    }
    return renderActions(editable ? editButton('Hr:Recruitment:Handoff:Edit', row) : null, actions)
  }
  const taskActions = (row: Api.Hr.RecruitmentTask) => {
    const editable = ['pending', 'in_progress'].includes(row.status)
    const actions = editable
      ? [
          moreAction(
            'complete',
            '完成任务',
            'Hr:Recruitment:Task:Manage',
            () => void taskComplete(row),
            'ri:checkbox-circle-line'
          ),
          moreAction(
            'skip',
            '跳过任务',
            'Hr:Recruitment:Task:Manage',
            () => void openAction('task_skip', row.id!, `跳过任务：${row.taskTitle}`),
            'ri:skip-forward-line'
          )
        ]
      : []
    return renderActions(editable ? editButton('Hr:Recruitment:Task:Manage', row) : null, actions)
  }

  const requisitionColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'requisitionNo',
      label: '需求编号',
      minWidth: 160,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentRequisition
        return (
          <BusinessTableIdentityCell
            primary={item.requisitionNo}
            secondary={userStore.getDictLabelByValue(
              'hrEmploymentType',
              item.employmentType,
              '待核对'
            )}
          />
        )
      }
    },
    {
      prop: 'position',
      label: '岗位 / 组织',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentRequisition
        return (
          <BusinessTableIdentityCell
            primary={item.position?.name}
            secondary={item.organization?.name}
          />
        )
      }
    },
    {
      prop: 'funnel',
      label: '招聘漏斗',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentRequisition
        return (
          <div class="recruitment-page__funnel">
            <span>候选 {item.candidateCount ?? 0}</span>
            <span>面试 {item.interviewCount ?? 0}</span>
            <span>Offer {item.offerCount ?? 0}</span>
          </div>
        )
      }
    },
    {
      prop: 'progress',
      label: '录用进度',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentRequisition
        const percent = Math.round(((item.hiredCount ?? 0) / Math.max(item.openingCount, 1)) * 100)
        return progress(`${item.hiredCount ?? 0} / ${item.openingCount} 人`, percent)
      }
    },
    {
      prop: 'expectedOnboardDate',
      label: '期望到岗',
      width: 120,
      formatter: (row) => (row as Api.Hr.RecruitmentRequisition).expectedOnboardDate ?? '--'
    },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      formatter: (row) => dict('hrRecruitmentStatus', (row as Api.Hr.RecruitmentRequisition).status)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => requisitionActions(row as Api.Hr.RecruitmentRequisition)
    }
  ]
  const candidateColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'candidateName',
      label: '候选人',
      minWidth: 170,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentCandidate
        return (
          <BusinessTableIdentityCell
            primary={item.candidateName}
            secondary={item.requisition?.positionName}
          />
        )
      }
    },
    {
      prop: 'requisition',
      label: '招聘需求',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentCandidate
        return (
          <BusinessTableIdentityCell
            primary={item.requisition?.code}
            secondary={item.requisition?.organizationName}
          />
        )
      }
    },
    {
      prop: 'contact',
      label: '联系方式',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentCandidate
        return canViewSensitive.value ? (
          <BusinessTableIdentityCell primary={item.phone} secondary={item.email} />
        ) : (
          masked()
        )
      }
    },
    {
      prop: 'source',
      label: '来源',
      width: 110,
      formatter: (row) => dict('hrCandidateSource', (row as Api.Hr.RecruitmentCandidate).source)
    },
    {
      prop: 'activity',
      label: '流程进展',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentCandidate
        return (
          <BusinessTableIdentityCell
            primary={`${item.interviewCount ?? 0} 次面试`}
            secondary={
              item.latestOfferStatus
                ? `Offer：${userStore.getDictLabelByValue('hrOfferStatus', item.latestOfferStatus, '未识别状态')}`
                : '尚未创建 Offer'
            }
          />
        )
      }
    },
    {
      prop: 'stage',
      label: '阶段',
      width: 110,
      formatter: (row) => dict('hrCandidateStage', (row as Api.Hr.RecruitmentCandidate).stage)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => candidateActions(row as Api.Hr.RecruitmentCandidate)
    }
  ]
  const interviewColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'candidate',
      label: '候选人',
      minWidth: 175,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentInterview
        return (
          <BusinessTableIdentityCell
            primary={item.candidate?.name}
            secondary={item.candidate?.positionName}
          />
        )
      }
    },
    {
      prop: 'roundNo',
      label: '轮次 / 类型',
      minWidth: 135,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentInterview
        return (
          <BusinessTableIdentityCell
            primary={`第 ${item.roundNo} 轮`}
            secondary={userStore.getDictLabelByValue(
              'hrInterviewType',
              item.interviewType,
              '待核对'
            )}
          />
        )
      }
    },
    {
      prop: 'schedule',
      label: '面试时间',
      minWidth: 185,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentInterview
        return (
          <BusinessTableIdentityCell
            primary={formatWithDayjs(item.scheduledStartAt, 'MM-DD HH:mm')}
            secondary={`${formatWithDayjs(item.scheduledEndAt, 'HH:mm')} · ${item.location || '地点待确认'}`}
          />
        )
      }
    },
    {
      prop: 'interviewer',
      label: '面试官',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentInterview
        return (
          <BusinessTableIdentityCell
            primary={item.interviewer?.name}
            secondary={item.interviewer?.code}
          />
        )
      }
    },
    {
      prop: 'assessment',
      label: '评价结果',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentInterview
        return item.status === 'completed' ? (
          <BusinessTableIdentityCell
            primary={`${item.score ?? 0} 分`}
            secondary={userStore.getDictLabelByValue(
              'hrInterviewRecommendation',
              item.recommendation,
              '待核对'
            )}
          />
        ) : (
          <span class="recruitment-page__muted">等待面试评价</span>
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => dict('hrInterviewStatus', (row as Api.Hr.RecruitmentInterview).status)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => interviewActions(row as Api.Hr.RecruitmentInterview)
    }
  ]
  const offerColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'offerNo',
      label: 'Offer',
      minWidth: 175,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentOffer
        return (
          <BusinessTableIdentityCell primary={item.offerNo} secondary={`版本 V${item.versionNo}`} />
        )
      }
    },
    {
      prop: 'candidate',
      label: '候选人 / 岗位',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentOffer
        return (
          <BusinessTableIdentityCell
            primary={item.candidate?.name}
            secondary={item.candidate?.positionName}
          />
        )
      }
    },
    {
      prop: 'package',
      label: '薪酬方案',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentOffer
        return canViewSensitive.value ? (
          <BusinessTableIdentityCell
            primary={`${item.currency} ${formatNumberValue(item.monthlySalary ?? 0)}/月`}
            secondary={`目标奖金 ${formatNumberValue(item.targetBonus ?? 0)}`}
          />
        ) : (
          masked()
        )
      }
    },
    {
      prop: 'dates',
      label: '入职 / 有效期',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentOffer
        return (
          <BusinessTableIdentityCell
            primary={item.proposedOnboardDate}
            secondary={`有效至 ${item.expiresOn}`}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 120,
      formatter: (row) => dict('hrOfferStatus', (row as Api.Hr.RecruitmentOffer).status)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => offerActions(row as Api.Hr.RecruitmentOffer)
    }
  ]
  const handoffColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'candidate',
      label: '候选人',
      minWidth: 170,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentHandoff
        return (
          <BusinessTableIdentityCell primary={item.candidate?.name} secondary={item.offer?.code} />
        )
      }
    },
    {
      prop: 'position',
      label: '岗位 / 组织',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentHandoff
        return (
          <BusinessTableIdentityCell
            primary={item.position?.name}
            secondary={item.organization?.name}
          />
        )
      }
    },
    {
      prop: 'plannedOnboardDate',
      label: '计划入职',
      width: 120,
      formatter: (row) => (row as Api.Hr.RecruitmentHandoff).plannedOnboardDate
    },
    {
      prop: 'tasks',
      label: '准备任务',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentHandoff
        const total = item.taskCount ?? 0
        const completed = item.completedTaskCount ?? 0
        return progress(
          `${completed} / ${total} 项${item.overdueTaskCount ? ` · ${item.overdueTaskCount} 项逾期` : ''}`,
          Math.round((completed / Math.max(total, 1)) * 100),
          Boolean(item.overdueTaskCount)
        )
      }
    },
    {
      prop: 'owner',
      label: '交接负责人',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentHandoff
        return <BusinessTableIdentityCell primary={item.owner?.name} secondary={item.owner?.code} />
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) =>
        dict('hrRecruitmentHandoffStatus', (row as Api.Hr.RecruitmentHandoff).status)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => handoffActions(row as Api.Hr.RecruitmentHandoff)
    }
  ]
  const taskColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'taskTitle',
      label: '入职任务',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentTask
        return (
          <BusinessTableIdentityCell
            primary={item.taskTitle}
            secondary={userStore.getDictLabelByValue(
              'hrOnboardingTaskCategory',
              item.taskCategory,
              '待核对'
            )}
          />
        )
      }
    },
    {
      prop: 'handoff',
      label: '候选人 / 入职日',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentTask
        return (
          <BusinessTableIdentityCell
            primary={item.handoff?.name}
            secondary={item.handoff?.plannedOnboardDate}
          />
        )
      }
    },
    {
      prop: 'owner',
      label: '负责人',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentTask
        return <BusinessTableIdentityCell primary={item.owner?.name} secondary={item.owner?.code} />
      }
    },
    {
      prop: 'dueDate',
      label: '截止日期',
      width: 120,
      formatter: (row) => {
        const item = row as Api.Hr.RecruitmentTask
        return (
          <span
            class={
              dayjs(item.dueDate).isBefore(dayjs(), 'day') &&
              ['pending', 'in_progress'].includes(item.status)
                ? 'recruitment-page__overdue'
                : ''
            }
          >
            {item.dueDate}
          </span>
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => dict('hrOnboardingTaskStatus', (row as Api.Hr.RecruitmentTask).status)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => taskActions(row as Api.Hr.RecruitmentTask)
    }
  ]
  const columnFactories: Record<Entity, () => ColumnOption<RecordItem>[]> = {
    requisition: requisitionColumns,
    candidate: candidateColumns,
    interview: interviewColumns,
    offer: offerColumns,
    handoff: handoffColumns,
    task: taskColumns
  }
  const columnsFactory = (): ColumnOption<RecordItem>[] => columnFactories[activeEntity.value]()
  const progress = (label: string, percent: number, danger = false) => (
    <div class="recruitment-page__progress">
      <span>{label}</span>
      <ElProgress
        percentage={Math.min(percent, 100)}
        stroke-width={7}
        show-text={false}
        status={danger ? 'exception' : percent >= 100 ? 'success' : undefined}
      />
    </div>
  )
  const masked = () => (
    <span class="recruitment-page__masked">
      <ArtSvgIcon icon="ri:lock-line" /> 已按权限隐藏
    </span>
  )

  const fetchTableData: ArtTableQueryApiFn = async (params) => {
    const { from, to } = buildSupabasePageRange(params as TableParams)
    const response = await fetchRecruitmentRecords(activeEntity.value, { ...params, from, to })
    sensitiveAccess.value = response.sensitiveAccess
    return response
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchRecruitmentOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const handleTableSuccess = (): void => {
    void refreshOverview()
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { status: '', keyword: '' })
  }
  const handleSaveSuccess = (): void => {
    void tableQueryRef.value?.refreshData()
    void refreshOverview()
  }
  const handleActionSuccess = (): void => {
    void tableQueryRef.value?.refreshUpdate()
    void refreshOverview()
  }
  const openAction = async (kind: string, id: string, subject: string): Promise<void> => {
    await actionDialogRef.value?.handleOpen({ kind, id, subject })
  }
  const submitRequisition = async (row: Api.Hr.RecruitmentRequisition): Promise<void> => {
    await submitHrApproval('hr_recruitment_requisition', row.id!)
    handleActionSuccess()
  }
  const effectRequisition = async (row: Api.Hr.RecruitmentRequisition): Promise<void> => {
    await effectRecruitmentRequisition(row.id!)
    handleActionSuccess()
  }
  const screenCandidate = async (row: Api.Hr.RecruitmentCandidate): Promise<void> => {
    await transitionCandidateStage(row.id!, 'screening', '简历筛选开始')
    handleActionSuccess()
  }
  const offerAction = async (
    row: Api.Hr.RecruitmentOffer,
    action: 'submit' | 'approve' | 'send' | 'accept'
  ): Promise<void> => {
    const labels = {
      submit: '提交审批',
      approve: '批准',
      send: '发送给候选人',
      accept: '登记候选人已接受'
    }
    await confirmAction(
      `确定${labels[action]} Offer「${row.offerNo}」吗？`,
      `${labels[action]} Offer`,
      { confirmButtonText: labels[action], type: action === 'accept' ? 'success' : 'warning' }
    )
    await transitionRecruitmentOffer(row.id!, action)
    handleActionSuccess()
  }
  const handoffAction = async (
    row: Api.Hr.RecruitmentHandoff,
    action: 'ready' | 'complete'
  ): Promise<void> => {
    const label = action === 'ready' ? '标记入职准备就绪' : '完成入职交接并计入录用'
    await confirmAction(`确定为「${row.candidate?.name ?? '该候选人'}」${label}吗？`, label, {
      confirmButtonText: label,
      type: action === 'complete' ? 'success' : 'warning'
    })
    await transitionRecruitmentHandoff(row.id!, action)
    handleActionSuccess()
  }
  const taskComplete = async (row: Api.Hr.RecruitmentTask): Promise<void> => {
    await confirmAction(`确定完成任务「${row.taskTitle}」吗？`, '完成入职任务', {
      confirmButtonText: '确认完成',
      type: 'success'
    })
    await completeRecruitmentTask(row.id!)
    handleActionSuccess()
  }
  const handleDelete = async (
    row: Api.Hr.RecruitmentRequisition | Api.Hr.RecruitmentCandidate
  ): Promise<void> => {
    if (!row.id) return
    const entity = activeEntity.value === 'requisition' ? 'requisition' : 'candidate'
    const label =
      entity === 'requisition'
        ? (row as Api.Hr.RecruitmentRequisition).requisitionNo
        : (row as Api.Hr.RecruitmentCandidate).candidateName
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: 'Hr:Recruitment:Delete',
      confirmMessage: `确定删除「${label}」吗？仅未进入流程的记录允许删除。`,
      remove: () => deleteRecruitmentRecord(entity, row.id!),
      onDeleted: () => tableQueryRef.value?.refreshRemove() ?? Promise.resolve()
    })
  }

  onMounted(async () => {
    await Promise.all(
      [
        'hrRecruitmentStatus',
        'hrCandidateStage',
        'hrCandidateSource',
        'hrEmploymentType',
        'hrInterviewType',
        'hrInterviewStatus',
        'hrInterviewRecommendation',
        'hrOfferStatus',
        'hrRecruitmentHandoffStatus',
        'hrOnboardingTaskCategory',
        'hrOnboardingTaskStatus',
        'hrCandidateConsentStatus'
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

  .recruitment-page {
    @include hr-table-workspace-layout(420px);

    &__pipeline {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0;
      padding: 14px 16px;
      background: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 12%, var(--art-card-border));
      border-radius: var(--custom-radius);

      > p {
        display: flex;
        grid-column: 1 / -1;
        gap: 6px;
        align-items: center;
        padding-top: 10px;
        margin: 12px 0 0;
        font-size: 12px;
        color: var(--art-gray-700);
        border-top: 1px solid color-mix(in srgb, var(--theme-color) 10%, var(--art-card-border));
      }
    }

    &__pipeline-step {
      position: relative;
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
      padding-inline: 8px 28px;

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: var(--art-gray-900);
      }

      small {
        color: var(--art-gray-600);
      }
    }

    &__pipeline-arrow {
      position: absolute;
      top: 50%;
      right: 6px;
      color: color-mix(in srgb, var(--theme-color) 55%, var(--art-gray-500));
      transform: translateY(-50%);
    }

    &__tabs {
      min-width: 0;
    }

    &__tabs :deep(.el-tabs__header) {
      margin: 0;
    }

    &__tabs :deep(.el-tabs__nav-wrap::after) {
      height: 1px;
      background-color: var(--el-border-color-lighter);
    }

    &__tabs :deep(.el-tabs__item) {
      height: 58px;
      padding-inline: 16px;
    }

    &__tabs :deep(.el-tabs__active-bar) {
      height: 3px;
      border-radius: 999px 999px 0 0;
    }

    &__tab-label {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }

    &__tab-label > :deep(.art-svg-icon) {
      flex: 0 0 auto;
      font-size: 18px;
    }

    &__tab-label > span {
      display: grid;
      min-width: 0;
      line-height: 1.25;
    }

    &__tab-label strong {
      font-size: 14px;
      font-weight: 600;
    }

    &__tab-label small {
      margin-top: 2px;
      font-size: 11px;
      font-weight: 400;
      color: var(--art-gray-500);
    }

    &__funnel {
      display: flex;
      gap: 10px;
      align-items: center;
      color: var(--art-gray-700);
    }

    &__funnel span + span {
      padding-left: 10px;
      border-left: 1px solid var(--el-border-color-lighter);
    }

    &__progress {
      display: grid;
      gap: 7px;
      min-width: 0;
    }

    &__progress span {
      font-size: 12px;
      color: var(--art-gray-700);
    }

    &__masked,
    &__muted {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      font-size: 12px;
      color: var(--art-gray-600);
    }

    &__overdue {
      font-weight: 600;
      color: var(--el-color-danger);
    }

    :deep(.art-table-query) {
      flex: 1;
    }

    @media (width <= 1180px) {
      &__pipeline {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px 0;
      }

      &__pipeline-step:nth-child(3) &__pipeline-arrow {
        display: none;
      }

      &__tab-label small {
        display: none;
      }
    }

    @media (width <= 760px) {
      &__pipeline {
        grid-template-columns: 1fr;
      }

      &__pipeline-step {
        padding-inline: 0;
      }

      &__pipeline-arrow {
        display: none;
      }

      &__tabs :deep(.el-tabs__item) {
        height: 48px;
        padding-inline: 12px;
      }
    }
  }
</style>
