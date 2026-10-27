<template>
  <ArtPermissionGuard permission="Hr:Succession:View">
    <div class="succession-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="SUCCESSION & CAREER"
        title="继任与发展"
        description="围绕关键岗位管理继任覆盖、候选人准备度和发展行动，把人才盘点结论转化为可复盘的组织能力计划。"
        icon="ri:git-merge-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="succession-page__command-center" aria-labelledby="succession-control-title">
        <header class="succession-page__command-heading">
          <div>
            <span class="succession-page__section-icon" aria-hidden="true">
              <ArtSvgIcon icon="ri:route-line" />
            </span>
            <span>
              <small>SUCCESSION CONTROL CENTER</small>
              <strong id="succession-control-title">关键岗位继任闭环</strong>
              <em>识别业务连续性风险，建立候选梯队，并用可验收行动推进准备度</em>
            </span>
          </div>
          <span class="succession-page__governance-badge">
            <ArtSvgIcon icon="ri:shield-keyhole-line" />
            仅限授权 HR 管理者
          </span>
        </header>

        <nav class="succession-page__stage-switcher" aria-label="继任管理工作视图">
          <button
            v-for="(stage, index) in journeyStages"
            :key="stage.entity"
            type="button"
            :class="[`is-${stage.tone}`, { 'is-active': activeEntity === stage.entity }]"
            :aria-current="activeEntity === stage.entity ? 'step' : undefined"
            @click="selectStage(stage.entity)"
          >
            <span class="succession-page__stage-index">0{{ index + 1 }}</span>
            <span class="succession-page__stage-icon" aria-hidden="true">
              <ArtSvgIcon :icon="stage.icon" />
            </span>
            <span class="succession-page__stage-copy">
              <span>
                <strong>{{ stage.title }}</strong>
                <em>{{ stage.signal }}</em>
              </span>
              <small>{{ stage.description }}</small>
            </span>
            <span class="succession-page__stage-arrow" aria-hidden="true">
              <ArtSvgIcon icon="ri:arrow-right-s-line" />
            </span>
          </button>
        </nav>

        <footer class="succession-page__active-context" aria-live="polite">
          <span>
            <ArtSvgIcon :icon="activeTab.icon" />
            当前：<strong>{{ activeTab.label }}</strong>
            <em>{{ activeTab.description }}</em>
          </span>
          <dl>
            <div
              ><dt>当前结果</dt><dd>{{ tableTotal }}</dd></div
            >
            <div :class="`is-${activeAttention.tone}`">
              <dt>{{ activeAttention.label }}</dt
              ><dd>{{ activeAttention.value }}</dd>
            </div>
          </dl>
          <p>
            <ArtSvgIcon icon="ri:information-line" />
            现任任职者不能提名为同岗位继任人，评审、退出与任用全程留痕。
          </p>
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
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <SuccessionDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import { ElProgress, ElTag } from 'element-plus'
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
    deleteSuccessionRecord,
    fetchSuccessionOverview,
    fetchSuccessionRecords,
    reviewSuccessionCandidate
  } from '@hr/api'
  import SuccessionDialog from './modules/succession-dialog.vue'

  defineOptions({ name: 'HrSuccession' })
  type Entity = Api.Hr.SuccessionEntity
  type RecordItem = Api.Hr.SuccessionRecord
  type TableParams = Api.Hr.SuccessionSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>
  interface Tab {
    entity: Entity
    label: string
    description: string
    emptyDescription: string
    icon: string
  }
  interface DialogExpose {
    handleOpen: (entity: Entity, row?: RecordItem) => Promise<void>
  }
  type SignalTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

  const tabs: Tab[] = [
    {
      entity: 'plan',
      label: '关键岗位计划',
      description: '覆盖目标与定期复盘',
      emptyDescription: '先识别关键岗位，并建立继任覆盖目标与复盘周期。',
      icon: 'ri:briefcase-4-line'
    },
    {
      entity: 'candidate',
      label: '继任候选人',
      description: '准备度与人才风险',
      emptyDescription: '从人才盘点中提名候选人，并完成准备度与发展差距评审。',
      icon: 'ri:user-star-line'
    },
    {
      entity: 'action',
      label: '发展行动',
      description: '培养任务与成果',
      emptyDescription: '为继任候选人制定导师、轮岗、学习或挑战性任务。',
      icon: 'ri:route-line'
    }
  ]
  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('plan')
  const activeTab = computed(() => tabs.find((tab) => tab.entity === activeEntity.value) ?? tabs[0])
  const deleteTables: Record<Entity, string> = {
    plan: 'hr_succession_plan',
    candidate: 'hr_succession_candidate',
    action: 'hr_succession_development_action'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.SuccessionSearchParams }>({
    searchQuery: { tenantId: '', status: '', keyword: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_succession_plan: 'plan',
      hr_succession_candidate: 'candidate',
      hr_succession_development_action: 'action'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const overview = reactive<Api.Hr.SuccessionOverview>({
    activePlanCount: 0,
    criticalPositionCount: 0,
    readyNowCount: 0,
    uncoveredPlanCount: 0,
    overdueActionCount: 0,
    dueReviewCount: 0
  })
  const tableTotal = ref(0)

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '关键岗位覆盖', type: 'primary', effect: 'plain' },
    { label: '人才风险受控', type: 'warning', effect: 'light' },
    { label: '发展行动闭环', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '执行中计划',
      value: overview.activePlanCount,
      description: `${overview.criticalPositionCount} 个核心关键岗位`,
      icon: 'ri:briefcase-4-line',
      tone: 'primary'
    },
    {
      label: '可立即继任',
      value: overview.readyNowCount,
      description: '已评审的就绪候选人',
      icon: 'ri:verified-badge-line',
      tone: 'success'
    },
    {
      label: '继任未覆盖',
      value: overview.uncoveredPlanCount,
      description: '执行中但无有效候选人',
      icon: 'ri:alarm-warning-line',
      tone: overview.uncoveredPlanCount ? 'warning' : 'info'
    },
    {
      label: '逾期发展行动',
      value: overview.overdueActionCount,
      description: `${overview.dueReviewCount} 个计划 30 天内复盘`,
      icon: 'ri:timer-flash-line',
      tone: overview.overdueActionCount ? 'danger' : 'info'
    }
  ])
  const journeyStages = computed<
    Array<{
      title: string
      entity: Entity
      description: string
      signal: string
      icon: string
      tone: SignalTone
    }>
  >(() => [
    {
      entity: 'plan',
      title: '识别关键岗位',
      description: '关键度 · 空缺风险 · 业务影响',
      signal: `${overview.criticalPositionCount} 个岗位`,
      icon: 'ri:briefcase-4-line',
      tone: overview.criticalPositionCount ? 'primary' : 'info'
    },
    {
      entity: 'candidate',
      title: '建立继任梯队',
      description: '准备度 · 潜力 · 留任风险',
      signal: overview.uncoveredPlanCount
        ? `${overview.uncoveredPlanCount} 个未覆盖`
        : `${overview.readyNowCount} 人就绪`,
      icon: 'ri:user-star-line',
      tone: overview.uncoveredPlanCount ? 'warning' : overview.readyNowCount ? 'success' : 'info'
    },
    {
      entity: 'action',
      title: '推动发展行动',
      description: '负责人 · 时限 · 成果复盘',
      signal: overview.overdueActionCount ? `${overview.overdueActionCount} 项逾期` : '进度正常',
      icon: 'ri:route-line',
      tone: overview.overdueActionCount ? 'danger' : 'success'
    }
  ])
  const activeAttention = computed<{ label: string; value: number; tone: SignalTone }>(() =>
    activeEntity.value === 'plan'
      ? { label: '待补覆盖', value: overview.uncoveredPlanCount, tone: 'warning' }
      : activeEntity.value === 'candidate'
        ? { label: '立即就绪', value: overview.readyNowCount, tone: 'success' }
        : { label: '逾期行动', value: overview.overdueActionCount, tone: 'danger' }
  )
  const statusDictionary = computed(() =>
    activeEntity.value === 'plan'
      ? 'hrSuccessionPlanStatus'
      : activeEntity.value === 'candidate'
        ? 'hrSuccessionCandidateStatus'
        : 'hrSuccessionActionStatus'
  )
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
        options: getDictMap.value[statusDictionary.value] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      },
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder:
            activeEntity.value === 'plan'
              ? '计划、岗位或组织'
              : activeEntity.value === 'candidate'
                ? '候选人、岗位或计划'
                : '行动、候选人或计划'
        }
      }
    )
    return items
  })

  const riskType = (value?: string | null): 'success' | 'warning' | 'danger' | 'info' =>
    value === 'high' || value === 'critical'
      ? 'danger'
      : value === 'medium' || value === 'development_needed'
        ? 'warning'
        : value === 'low' || value === 'ready_now'
          ? 'success'
          : 'info'
  const statusType = (
    value?: string | null
  ): 'success' | 'warning' | 'danger' | 'info' | 'primary' =>
    ['active', 'completed'].includes(value ?? '')
      ? 'success'
      : ['nominated', 'in_progress'].includes(value ?? '')
        ? 'warning'
        : ['closed', 'withdrawn', 'cancelled'].includes(value ?? '')
          ? 'info'
          : value === 'placed'
            ? 'primary'
            : 'info'

  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'action',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => {
      const status = String('status' in row ? row.status : '')
      return (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            permission={permissionFor('Edit')}
            onClick={() => openDialog(activeEntity.value, row)}
          />
          <ArtButtonMore
            list={() => {
              const actions: ButtonMoreItem[] = []
              if (activeEntity.value === 'candidate' && status === 'nominated')
                actions.push({
                  key: 'activate',
                  label: '纳入继任梯队',
                  icon: 'ri:user-follow-line',
                  auth: 'Hr:Succession:Candidate:Review'
                })
              if (activeEntity.value === 'candidate' && status === 'active')
                actions.push({
                  key: 'place',
                  label: '标记正式继任',
                  icon: 'ri:medal-line',
                  auth: 'Hr:Succession:Candidate:Review'
                })
              if (activeEntity.value === 'candidate' && ['nominated', 'active'].includes(status))
                actions.push({
                  key: 'withdraw',
                  label: '退出继任梯队',
                  icon: 'ri:user-unfollow-line',
                  auth: 'Hr:Succession:Candidate:Review'
                })
              if (canDelete(status))
                actions.push({
                  key: 'delete',
                  label: '删除当前记录',
                  icon: 'ri:delete-bin-5-line',
                  color: 'var(--el-color-danger)',
                  auth: permissionFor('Delete')
                })
              return actions
            }}
            onClick={(item: ButtonMoreItem) => {
              if (item.key === 'delete') void handleDelete(row)
              if (activeEntity.value !== 'candidate') return
              if (item.key === 'activate')
                void handleReview(row as Api.Hr.SuccessionCandidate, 'activate')
              if (item.key === 'place')
                void handleReview(row as Api.Hr.SuccessionCandidate, 'place')
              if (item.key === 'withdraw')
                void handleReview(row as Api.Hr.SuccessionCandidate, 'withdraw')
            }}
          />
        </BusinessTableRowActions>
      )
    }
  })

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'plan')
      return [
        {
          prop: 'planName',
          label: '关键岗位计划',
          minWidth: 220,
          fixed: 'left',
          formatter: (row) => (
            <div class="succession-page__identity">
              <strong>{(row as Api.Hr.SuccessionPlan).planName}</strong>
              <small>{(row as Api.Hr.SuccessionPlan).planCode}</small>
            </div>
          )
        },
        {
          prop: 'position',
          label: '岗位 / 组织',
          minWidth: 190,
          formatter: (row) => (
            <div class="succession-page__identity">
              <strong>{(row as Api.Hr.SuccessionPlan).position?.name ?? '--'}</strong>
              <small>
                {(row as Api.Hr.SuccessionPlan).position?.organizationName ?? '未分配组织'}
              </small>
            </div>
          )
        },
        {
          prop: 'criticality',
          label: '关键度',
          width: 115,
          formatter: (row) => (
            <ElTag type={riskType((row as Api.Hr.SuccessionPlan).criticality)} effect="light" round>
              {userStore.getDictLabelByValue(
                'hrSuccessionCriticality',
                (row as Api.Hr.SuccessionPlan).criticality,
                (row as Api.Hr.SuccessionPlan).criticality ?? '--'
              )}
            </ElTag>
          )
        },
        {
          prop: 'risk',
          label: '空缺风险 / 影响',
          minWidth: 165,
          formatter: (row) => (
            <div class="succession-page__tag-stack">
              <ElTag type={riskType((row as Api.Hr.SuccessionPlan).vacancyRisk)} effect="plain">
                {userStore.getDictLabelByValue(
                  'commonRiskLevel',
                  (row as Api.Hr.SuccessionPlan).vacancyRisk,
                  (row as Api.Hr.SuccessionPlan).vacancyRisk ?? '--'
                )}
              </ElTag>
              <span>
                影响：
                {userStore.getDictLabelByValue(
                  'hrSuccessionCriticality',
                  (row as Api.Hr.SuccessionPlan).businessImpact,
                  (row as Api.Hr.SuccessionPlan).businessImpact ?? '--'
                )}
              </span>
            </div>
          )
        },
        {
          prop: 'coverage',
          label: '继任覆盖',
          minWidth: 180,
          formatter: (row) => {
            const plan = row as Api.Hr.SuccessionPlan
            const percent = Math.min(
              100,
              Math.round(
                ((plan.activeCandidateCount ?? 0) / Math.max(plan.targetSuccessors, 1)) * 100
              )
            )
            return (
              <div class="succession-page__coverage">
                <span>
                  <strong>{plan.activeCandidateCount ?? 0}</strong> / {plan.targetSuccessors} 人 ·
                  可立即 {plan.readyNowCount ?? 0}
                </span>
                <ElProgress
                  percentage={percent}
                  stroke-width={7}
                  show-text={false}
                  status={percent >= 100 ? 'success' : undefined}
                />
              </div>
            )
          }
        },
        {
          prop: 'nextReviewDate',
          label: '下次复盘',
          width: 126,
          formatter: (row) => (
            <span
              class={
                dayjs((row as Api.Hr.SuccessionPlan).nextReviewDate).isBefore(dayjs(), 'day')
                  ? 'succession-page__overdue'
                  : ''
              }
            >
              {(row as Api.Hr.SuccessionPlan).nextReviewDate}
            </span>
          )
        },
        {
          prop: 'status',
          label: '状态',
          width: 105,
          formatter: (row) => (
            <ElTag type={statusType((row as Api.Hr.SuccessionPlan).status)} effect="light">
              {userStore.getDictLabelByValue(
                'hrSuccessionPlanStatus',
                (row as Api.Hr.SuccessionPlan).status,
                (row as Api.Hr.SuccessionPlan).status ?? '--'
              )}
            </ElTag>
          )
        },
        actionColumn()
      ]
    if (activeEntity.value === 'candidate')
      return [
        {
          prop: 'employee',
          label: '候选人',
          minWidth: 200,
          fixed: 'left',
          formatter: (row) => (
            <div class="succession-page__identity">
              <strong>{(row as Api.Hr.SuccessionCandidate).employee?.name ?? '--'}</strong>
              <small>
                {(row as Api.Hr.SuccessionCandidate).employee?.code} ·{' '}
                {(row as Api.Hr.SuccessionCandidate).employee?.jobTitle ?? '未维护职务'}
              </small>
            </div>
          )
        },
        {
          prop: 'plan',
          label: '目标岗位',
          minWidth: 190,
          formatter: (row) => (
            <div class="succession-page__identity">
              <strong>{(row as Api.Hr.SuccessionCandidate).plan?.positionName ?? '--'}</strong>
              <small>{(row as Api.Hr.SuccessionCandidate).plan?.name}</small>
            </div>
          )
        },
        {
          prop: 'readiness',
          label: '准备度',
          width: 135,
          formatter: (row) => (
            <ElTag
              type={riskType((row as Api.Hr.SuccessionCandidate).readiness)}
              effect="light"
              round
            >
              {userStore.getDictLabelByValue(
                'hrSuccessionReadiness',
                (row as Api.Hr.SuccessionCandidate).readiness,
                (row as Api.Hr.SuccessionCandidate).readiness ?? '--'
              )}
            </ElTag>
          )
        },
        {
          prop: 'potentialLevel',
          label: '潜力',
          width: 110,
          formatter: (row) =>
            userStore.getDictLabelByValue(
              'hrSuccessionPotential',
              (row as Api.Hr.SuccessionCandidate).potentialLevel,
              (row as Api.Hr.SuccessionCandidate).potentialLevel ?? '--'
            )
        },
        {
          prop: 'retentionRisk',
          label: '留任风险',
          width: 115,
          formatter: (row) => (
            <ElTag
              type={riskType((row as Api.Hr.SuccessionCandidate).retentionRisk)}
              effect="plain"
            >
              {userStore.getDictLabelByValue(
                'commonRiskLevel',
                (row as Api.Hr.SuccessionCandidate).retentionRisk,
                (row as Api.Hr.SuccessionCandidate).retentionRisk ?? '--'
              )}
            </ElTag>
          )
        },
        {
          prop: 'aspirationConfirmed',
          label: '意愿确认',
          width: 100,
          formatter: (row) =>
            (row as Api.Hr.SuccessionCandidate).aspirationConfirmed ? '已确认' : '待确认'
        },
        {
          prop: 'openActionCount',
          label: '开放行动',
          width: 100,
          formatter: (row) => `${(row as Api.Hr.SuccessionCandidate).openActionCount ?? 0} 项`
        },
        {
          prop: 'status',
          label: '状态',
          width: 110,
          formatter: (row) => (
            <ElTag type={statusType((row as Api.Hr.SuccessionCandidate).status)} effect="light">
              {userStore.getDictLabelByValue(
                'hrSuccessionCandidateStatus',
                (row as Api.Hr.SuccessionCandidate).status,
                (row as Api.Hr.SuccessionCandidate).status ?? '--'
              )}
            </ElTag>
          )
        },
        actionColumn()
      ]
    return [
      {
        prop: 'actionTitle',
        label: '发展行动',
        minWidth: 220,
        fixed: 'left',
        formatter: (row) => (
          <div class="succession-page__identity">
            <strong>{(row as Api.Hr.SuccessionDevelopmentAction).actionTitle}</strong>
            <small>
              {userStore.getDictLabelByValue(
                'hrSuccessionActionType',
                (row as Api.Hr.SuccessionDevelopmentAction).actionType,
                (row as Api.Hr.SuccessionDevelopmentAction).actionType ?? '--'
              )}
            </small>
          </div>
        )
      },
      {
        prop: 'candidate',
        label: '候选人 / 目标岗位',
        minWidth: 210,
        formatter: (row) => (
          <div class="succession-page__identity">
            <strong>
              {(row as Api.Hr.SuccessionDevelopmentAction).candidate?.employeeName ?? '--'}
            </strong>
            <small>
              {(row as Api.Hr.SuccessionDevelopmentAction).candidate?.positionName ?? '--'}
            </small>
          </div>
        )
      },
      {
        prop: 'owner',
        label: '负责人',
        minWidth: 145,
        formatter: (row) => (row as Api.Hr.SuccessionDevelopmentAction).owner?.name ?? '未指定'
      },
      {
        prop: 'period',
        label: '计划周期',
        minWidth: 190,
        formatter: (row) =>
          `${(row as Api.Hr.SuccessionDevelopmentAction).startDate} → ${(row as Api.Hr.SuccessionDevelopmentAction).dueDate}`
      },
      {
        prop: 'dueDate',
        label: '到期信号',
        width: 115,
        formatter: (row) => {
          const action = row as Api.Hr.SuccessionDevelopmentAction
          const overdue =
            ['planned', 'in_progress'].includes(action.status) &&
            dayjs(action.dueDate).isBefore(dayjs(), 'day')
          return (
            <span class={overdue ? 'succession-page__overdue' : ''}>
              {overdue ? '已逾期' : action.dueDate}
            </span>
          )
        }
      },
      {
        prop: 'status',
        label: '状态',
        width: 105,
        formatter: (row) => (
          <ElTag
            type={statusType((row as Api.Hr.SuccessionDevelopmentAction).status)}
            effect="light"
          >
            {userStore.getDictLabelByValue(
              'hrSuccessionActionStatus',
              (row as Api.Hr.SuccessionDevelopmentAction).status,
              (row as Api.Hr.SuccessionDevelopmentAction).status ?? '--'
            )}
          </ElTag>
        )
      },
      actionColumn()
    ]
  }

  const permissionFor = (action: 'Add' | 'Edit' | 'Delete') =>
    `Hr:Succession:${activeEntity.value === 'plan' ? 'Plan' : activeEntity.value === 'candidate' ? 'Candidate' : 'Action'}:${action}`
  const canDelete = (status: string) =>
    activeEntity.value === 'plan'
      ? status === 'draft'
      : activeEntity.value === 'candidate'
        ? status === 'nominated'
        : status === 'planned'
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label:
        activeEntity.value === 'plan'
          ? '新增继任计划'
          : activeEntity.value === 'candidate'
            ? '提名候选人'
            : '新增发展行动',
      permission: permissionFor('Add'),
      onClick: () => openDialog(activeEntity.value)
    }
  ])
  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const response = await fetchSuccessionRecords(activeEntity.value, { ...params, from, to })
    return response
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (_rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async () => {
    const response = await fetchSuccessionOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const openDialog = (entity: Entity, row?: RecordItem) =>
    void dialogRef.value?.handleOpen(entity, row)
  const handleSaveSuccess = (type: DialogType) => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void refreshOverview()
  }
  const handleDelete = async (row: RecordItem) => {
    if (!row.id) return
    const entity = activeEntity.value
    const label =
      entity === 'plan'
        ? `${(row as Api.Hr.SuccessionPlan).planName}（${(row as Api.Hr.SuccessionPlan).planCode}）`
        : entity === 'candidate'
          ? `${(row as Api.Hr.SuccessionCandidate).employee?.employeeName ?? '继任候选人'} · ${(row as Api.Hr.SuccessionCandidate).plan?.planName ?? '关键岗位计划'}`
          : (row as Api.Hr.SuccessionDevelopmentAction).actionTitle
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: permissionFor('Delete'),
      remove: () => deleteSuccessionRecord(entity, row.id!),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
        await refreshOverview()
      }
    })
  }
  const handleReview = async (
    row: Api.Hr.SuccessionCandidate,
    action: 'activate' | 'withdraw' | 'place'
  ) => {
    if (!row.id) return
    try {
      const comment =
        action === 'withdraw'
          ? await promptText('请输入退出继任池的原因。', '退出候选人', {
              minLength: 2,
              maxLength: 300,
              placeholder: '请输入具体原因',
              type: 'warning'
            })
          : undefined
      if (action !== 'withdraw')
        await confirmAction(
          action === 'activate'
            ? '确认候选人评审完成并纳入正式继任梯队？'
            : '确认该候选人已完成目标岗位继任？',
          action === 'activate' ? '纳入继任梯队' : '标记完成继任',
          { confirmButtonText: '确认', cancelButtonText: '返回', type: 'info' }
        )
      await reviewSuccessionCandidate(row.id, action, comment)
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '继任候选人处理失败，请刷新状态后重试')
    }
  }
  const handleTabChange = () => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    tableTotal.value = 0
  }
  const selectStage = (entity: Entity) => {
    if (activeEntity.value === entity) return
    activeEntity.value = entity
    handleTabChange()
  }
  onMounted(async () => {
    await Promise.all(
      [
        'hrSuccessionPlanStatus',
        'hrSuccessionCriticality',
        'commonRiskLevel',
        'hrSuccessionReadiness',
        'hrSuccessionPotential',
        'commonRiskLevel',
        'hrSuccessionCandidateStatus',
        'hrSuccessionActionType',
        'hrSuccessionActionStatus'
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

  .succession-page {
    @include hr-table-workspace-layout(360px);

    &__command-center {
      position: relative;
      padding: 16px 18px 13px;
      overflow: hidden;
      background:
        radial-gradient(
          circle at 100% 0%,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 34%
        ),
        var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--theme-color) 13%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--art-gray-900) 3.5%, transparent);
    }

    &__command-heading {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 13px;

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
        margin-top: 1px;
        font-size: 16px;
        line-height: 1.35;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 9px;
        font-weight: 750;
        color: var(--theme-color);
        letter-spacing: 0.1em;
      }

      em {
        @include ellipsis;

        margin-top: 2px;
        font-size: 11px;
        font-style: normal;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-icon,
    &__stage-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--theme-color) 13%, transparent);
    }

    &__section-icon {
      width: 42px;
      height: 42px;
      border-radius: var(--art-surface-radius);

      :deep(.art-svg-icon) {
        font-size: 19px;
      }
    }

    &__governance-badge {
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

    &__stage-switcher {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
      overflow: hidden;
      background: color-mix(in srgb, var(--theme-color) 2%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      button {
        position: relative;
        display: grid;
        grid-template-columns: 30px 36px minmax(0, 1fr) 18px;
        gap: 8px;
        align-items: center;
        min-width: 0;
        min-height: 70px;
        padding: 9px 11px;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 0;
        border-right: 1px solid var(--art-card-border);
        transition:
          background-color 0.18s ease,
          box-shadow 0.18s ease;

        &:last-child {
          border-right: 0;
        }

        &:hover {
          background: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
        }

        &:focus-visible {
          z-index: 1;
          outline: 2px solid var(--theme-color);
          outline-offset: -2px;
        }

        &.is-active {
          z-index: 1;
          background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
          box-shadow: inset 0 -3px 0 var(--theme-color);
        }

        &.is-active.is-warning {
          background: color-mix(in srgb, var(--el-color-warning) 8%, var(--default-box-color));
          box-shadow: inset 0 -3px 0 var(--el-color-warning);
        }

        &.is-active.is-danger {
          background: color-mix(in srgb, var(--el-color-danger) 7%, var(--default-box-color));
          box-shadow: inset 0 -3px 0 var(--el-color-danger);
        }
      }
    }

    &__stage-index {
      font-size: 10px;
      font-weight: 800;
      color: var(--el-text-color-secondary);
      letter-spacing: 0.06em;
    }

    &__stage-copy {
      display: grid;
      min-width: 0;

      > span {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        min-width: 0;
      }

      strong,
      small,
      em {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 3px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      em {
        flex: 0 0 auto;
        max-width: 110px;
        padding: 2px 6px;
        font-size: 10px;
        font-style: normal;
        font-weight: 700;
        color: var(--theme-color);
        white-space: nowrap;
        background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
        border-radius: 999px;
      }
    }

    &__stage-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--art-surface-radius);

      :deep(.art-svg-icon) {
        font-size: 17px;
      }
    }

    &__stage-arrow {
      display: grid;
      place-items: center;
      color: var(--el-text-color-secondary);

      :deep(.art-svg-icon) {
        font-size: 16px;
      }
    }

    &__active-context {
      display: grid;
      grid-template-columns: minmax(220px, auto) auto minmax(260px, 1fr);
      gap: 16px;
      align-items: center;
      min-width: 0;
      padding-top: 10px;

      > span {
        display: flex;
        gap: 6px;
        align-items: center;
        min-width: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);

        :deep(.art-svg-icon) {
          flex: 0 0 auto;
          color: var(--theme-color);
        }

        strong {
          flex: 0 0 auto;
          color: var(--el-text-color-primary);
        }

        em {
          overflow: hidden;
          text-overflow: ellipsis;
          font-style: normal;
          white-space: nowrap;
        }
      }

      dl {
        display: flex;
        gap: 8px;
        margin: 0;
      }

      dl > div {
        display: flex;
        gap: 5px;
        align-items: center;
        white-space: nowrap;

        &.is-warning dd {
          color: var(--el-color-warning-dark-2);
        }

        &.is-success dd {
          color: var(--el-color-success-dark-2);
        }

        &.is-danger dd {
          color: var(--el-color-danger);
        }
      }

      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: var(--el-text-color-primary);
      }

      p {
        display: flex;
        gap: 6px;
        align-items: center;
        justify-content: flex-end;
        min-width: 0;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;

        :deep(.art-svg-icon) {
          flex: 0 0 auto;
          font-size: 13px;
          color: var(--theme-color);
        }
      }
    }

    &__identity {
      display: grid;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        margin-top: 4px;
        color: var(--el-text-color-secondary);
      }
    }

    &__tag-stack {
      display: flex;
      gap: 7px;
      align-items: center;

      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__coverage {
      display: grid;
      gap: 7px;
      min-width: 150px;

      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      strong {
        color: var(--el-text-color-primary);
      }
    }

    &__overdue {
      font-weight: 600;
      color: var(--el-color-danger);
    }
  }

  @media only screen and (width <= 1100px) {
    .succession-page {
      &__active-context {
        grid-template-columns: minmax(220px, 1fr) auto;

        p {
          display: none;
        }
      }
    }
  }

  @media only screen and (width <= 900px) {
    .succession-page {
      &__command-heading {
        align-items: flex-start;
      }

      &__stage-switcher button {
        grid-template-columns: 26px 34px minmax(0, 1fr);

        .succession-page__stage-arrow {
          display: none;
        }
      }
    }
  }

  @media only screen and (width <= 767px) {
    .succession-page {
      &__command-center {
        padding: 14px;
      }

      &__command-heading {
        flex-direction: column;

        em {
          white-space: normal;
        }
      }

      &__stage-switcher {
        grid-template-columns: 1fr;

        button {
          min-height: 62px;
          border-right: 0;
          border-bottom: 1px solid var(--art-card-border);

          &:last-child {
            border-bottom: 0;
          }

          &.is-active {
            box-shadow: inset 3px 0 0 var(--theme-color);
          }
        }
      }

      &__active-context {
        grid-template-columns: 1fr;
        gap: 8px;

        dl {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        dl > div {
          min-width: 0;
        }
      }
    }
  }
</style>
