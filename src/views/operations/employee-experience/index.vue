<template>
  <ArtPermissionGuard permission="Hr:Experience:View">
    <div class="employee-experience-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="false" />
      <BusinessWorkspaceHeader
        eyebrow="EMPLOYEE LISTENING & ACTION"
        title="员工体验与敬业度"
        description="以匿名调查持续倾听员工体验，只在达到最小汇报人数后形成组织洞察，并通过有负责人、有期限、有验收结果的行动闭环推动改善。"
        icon="ri:chat-heart-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="employee-experience-page__control" aria-labelledby="experience-control-title">
        <header class="employee-experience-page__heading">
          <div>
            <span class="employee-experience-page__section-icon" aria-hidden="true">
              <ArtSvgIcon icon="ri:shield-check-line" />
            </span>
            <span>
              <small>TRUSTED LISTENING LOOP</small>
              <strong id="experience-control-title">从倾听到可验证改善</strong>
              <em>完成状态与匿名答案物理分离，个人反馈不进入绩效、任职或员工关系结论</em>
            </span>
          </div>
          <span class="employee-experience-page__privacy-badge">
            <ArtSvgIcon icon="ri:lock-2-line" />
            最小匿名阈值 5 人
          </span>
        </header>

        <ol class="employee-experience-page__rail" aria-label="员工体验治理闭环">
          <li v-for="(stage, index) in controlStages" :key="stage.label" :class="stage.state">
            <span class="employee-experience-page__rail-index">0{{ index + 1 }}</span>
            <span class="employee-experience-page__rail-icon" aria-hidden="true">
              <ArtSvgIcon :icon="stage.icon" />
            </span>
            <div>
              <strong>{{ stage.label }}</strong>
              <small>{{ stage.description }}</small>
            </div>
            <b>{{ stage.value }}</b>
          </li>
        </ol>

        <HrEntityNavigation
          v-if="navigationItems.length"
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="员工体验工作视图"
          compact
          @change="handleTabChange"
        />

        <div class="employee-experience-page__context" aria-live="polite">
          <div>
            <span class="employee-experience-page__context-icon" aria-hidden="true">
              <ArtSvgIcon :icon="activeTab.icon" />
            </span>
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
            <div :class="activeAttention.tone">
              <dt>{{ activeAttention.label }}</dt
              ><dd>{{ activeAttention.value }}</dd>
            </div>
          </dl>
        </div>

        <footer class="employee-experience-page__note">
          <ArtSvgIcon icon="ri:information-line" />
          员工只提交匿名答案，系统仅保留是否完成；组织与主题洞察低于调查设定阈值时不会返回分数、群组结果或开放评论。
        </footer>
      </section>

      <ArtTableQuery
        v-if="navigationItems.length"
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
          rowKey: tableRowKey,
          tableLayout: 'fixed',
          emptyText: activeTab.emptyTitle,
          emptyDescription: activeTab.emptyDescription
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <ArtSectionCard
        v-else
        title="当前角色暂无可用工作视图"
        subtitle="请为角色分配员工答卷或匿名洞察权限后重试。"
        empty
        empty-title="未配置员工体验权限"
        empty-description="页面查看权限不会自动授予答卷、调查管理、评论查看或行动管理能力。"
      />

      <ExperienceSurveyDialog ref="surveyDialogRef" @success="handleRecordSuccess('survey')" />
      <ExperienceQuestionDialog ref="questionDialogRef" @success="handleQuestionSuccess" />
      <ExperienceActionDialog ref="actionDialogRef" @success="handleRecordSuccess('action')" />
      <ExperienceResponseDialog ref="responseDialogRef" @success="handleResponseSuccess" />
      <ExperienceDetailDrawer
        ref="detailDrawerRef"
        @add-question="openAddQuestion"
        @edit-question="openEditQuestion"
        @add-action="openActionFromInsight"
      />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { ElProgress, ElTag, type TagProps } from 'element-plus'
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
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
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
  import {
    fetchEmployeeExperienceOverview,
    fetchEmployeeExperienceRecords,
    transitionEmployeeExperienceRecord
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import ExperienceSurveyDialog from './modules/experience-survey-dialog.vue'
  import ExperienceQuestionDialog from './modules/experience-question-dialog.vue'
  import ExperienceActionDialog from './modules/experience-action-dialog.vue'
  import ExperienceResponseDialog from './modules/experience-response-dialog.vue'
  import ExperienceDetailDrawer from './modules/experience-detail-drawer.vue'

  defineOptions({ name: 'HrEmployeeExperience' })

  type Entity = Api.Hr.EmployeeExperienceEntity
  type RecordItem = Api.Hr.EmployeeExperienceRecord
  type TableParams = Api.Hr.EmployeeExperienceSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyTitle: string
    emptyDescription: string
  }
  interface SurveyDialogExpose {
    handleOpen: (type: DialogType, editData?: Api.Hr.EmployeeExperienceSurvey) => Promise<void>
  }
  interface QuestionDialogExpose {
    handleOpen: (
      survey: Api.Hr.EmployeeExperienceSurvey,
      editData?: Api.Hr.EmployeeExperienceQuestion
    ) => Promise<void>
  }
  interface ActionDialogExpose {
    handleOpen: (payload: {
      type: DialogType
      editData?: Api.Hr.EmployeeExperienceAction
      presetSurvey?: Api.Hr.EmployeeExperienceReference
      presetDimension?: string
    }) => Promise<void>
  }
  interface ResponseDialogExpose {
    handleOpen: (record: Api.Hr.EmployeeExperienceMySurvey) => Promise<void>
  }
  interface DetailDrawerExpose {
    handleOpen: (entity: Entity, id: string, dimension?: string) => Promise<void>
    refresh: () => Promise<void>
  }

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { hasAuth } = useAuth()
  const { confirmAction, promptText } = useArtFeedback()
  const canRespond = computed(() => hasAuth('Hr:Experience:Respond'))
  const canViewInsights = computed(() => hasAuth('Hr:Experience:Insights:View'))

  const allTabs: Tab[] = [
    {
      value: 'my',
      label: '我的问卷',
      description: '查看待填写、已完成与已过期调查',
      emptyTitle: '暂无待参与调查',
      emptyDescription: '当前没有向您开放的员工体验调查；已完成记录仍会保留完成状态。',
      icon: 'ri:survey-line'
    },
    {
      value: 'survey',
      label: '调查管理',
      description: '配置题目、受众、匿名阈值与开放周期',
      emptyTitle: '暂无员工体验调查',
      emptyDescription: '先创建调查和量表题，确认覆盖人数达到匿名阈值后再发布。',
      icon: 'ri:file-list-3-line'
    },
    {
      value: 'insight',
      label: '聚合洞察',
      description: '查看达到匿名阈值的主题与组织结果',
      emptyTitle: '暂无可展示洞察',
      emptyDescription: '未达到最小汇报人数的主题不会返回分数；可等待更多答卷或调整后续调查覆盖。',
      icon: 'ri:radar-line'
    },
    {
      value: 'action',
      label: '改善行动',
      description: '分配负责人、期限、成功标准与验收结果',
      emptyTitle: '暂无员工体验改善行动',
      emptyDescription: '从达到匿名阈值的主题洞察建立行动，避免针对个人反馈采取措施。',
      icon: 'ri:route-line'
    }
  ]
  const tabs = computed(() =>
    allTabs.filter((tab) => (tab.value === 'my' ? canRespond.value : canViewInsights.value))
  )
  const navigationItems = computed<HrEntityNavigationItem[]>(() => tabs.value)
  const activeEntity = ref<Entity>(canRespond.value ? 'my' : 'survey')
  const activeTab = computed(
    () => tabs.value.find((tab) => tab.value === activeEntity.value) ?? tabs.value[0] ?? allTabs[0]!
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const surveyDialogRef = ref<SurveyDialogExpose>()
  const questionDialogRef = ref<QuestionDialogExpose>()
  const actionDialogRef = ref<ActionDialogExpose>()
  const responseDialogRef = ref<ResponseDialogExpose>()
  const detailDrawerRef = ref<DetailDrawerExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableTotal = ref(0)
  const tableRowKey = (row: RecordItem): string =>
    activeEntity.value === 'insight'
      ? `${(row as Api.Hr.EmployeeExperienceInsight).surveyId}:${(row as Api.Hr.EmployeeExperienceInsight).dimension}`
      : 'id' in row
        ? row.id || ''
        : ''
  const tableState = reactive<{ searchQuery: Api.Hr.EmployeeExperienceSearchParams }>({
    searchQuery: { keyword: '', status: '', surveyType: '', tenantId: '' }
  })
  const overview = reactive<Api.Hr.EmployeeExperienceOverview>({
    openSurveyCount: 0,
    myPendingCount: 0,
    participantCount: 0,
    completedCount: 0,
    responseRate: null,
    lowDimensionCount: 0,
    openActionCount: 0,
    overdueActionCount: 0,
    insightsVisible: false,
    commentsVisible: false,
    respondVisible: false
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '完成状态与答案分离', type: 'primary', effect: 'plain' },
    { label: '低于阈值不出结果', type: 'warning', effect: 'light' },
    { label: '组织行动全程留痕', type: 'success', effect: 'light' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: canViewInsights.value ? '开放调查' : '我的待答',
      value: canViewInsights.value ? overview.openSurveyCount : overview.myPendingCount,
      description: canViewInsights.value
        ? `${overview.myPendingCount} 项与当前员工相关`
        : '当前开放且尚未完成',
      icon: 'ri:survey-line',
      tone: overview.myPendingCount ? 'warning' : 'primary'
    },
    {
      label: '总体参与率',
      value: overview.insightsVisible ? `${overview.responseRate ?? 0}%` : '--',
      description: overview.insightsVisible
        ? `${overview.completedCount} / ${overview.participantCount} 人已完成`
        : '普通员工不可查看组织参与数据',
      icon: 'ri:group-line',
      tone: overview.responseRate != null && overview.responseRate < 60 ? 'warning' : 'success'
    },
    {
      label: '关注主题',
      value: overview.insightsVisible ? overview.lowDimensionCount : '--',
      description: '达到阈值且得分低于 60',
      icon: 'ri:alarm-warning-line',
      tone: overview.lowDimensionCount ? 'danger' : 'success'
    },
    {
      label: '开放行动',
      value: overview.insightsVisible ? overview.openActionCount : '--',
      description: overview.insightsVisible
        ? `${overview.overdueActionCount} 项已逾期`
        : '行动信息仅授权管理者可见',
      icon: 'ri:route-line',
      tone: overview.overdueActionCount ? 'danger' : 'info'
    }
  ])
  const controlStages = computed(() => [
    {
      label: '持续倾听',
      description: '脉冲、敬业度与生命周期调查',
      value: `${overview.openSurveyCount} 项开放`,
      icon: 'ri:chat-heart-line',
      state: overview.openSurveyCount ? 'is-current' : ''
    },
    {
      label: '匿名保护',
      description: '参与状态与答案物理分离',
      value: '至少 5 人',
      icon: 'ri:shield-user-line',
      state: 'is-protected'
    },
    {
      label: '聚合洞察',
      description: '只呈现阈值安全的主题结果',
      value: `${overview.lowDimensionCount} 个关注`,
      icon: 'ri:radar-line',
      state: overview.lowDimensionCount ? 'is-risk' : ''
    },
    {
      label: '行动闭环',
      description: '负责人、期限与成果复盘',
      value: `${overview.openActionCount} 项推进`,
      icon: 'ri:route-line',
      state: overview.overdueActionCount ? 'is-risk' : ''
    }
  ])
  const activeAttention = computed(() => {
    if (activeEntity.value === 'my')
      return { label: '待填写', value: overview.myPendingCount, tone: 'is-warning' }
    if (activeEntity.value === 'survey')
      return { label: '开放调查', value: overview.openSurveyCount, tone: 'is-primary' }
    if (activeEntity.value === 'insight')
      return { label: '关注主题', value: overview.lowDimensionCount, tone: 'is-danger' }
    return { label: '逾期行动', value: overview.overdueActionCount, tone: 'is-danger' }
  })

  const statusDictionary = computed(() => {
    if (activeEntity.value === 'my') return 'hrExperienceParticipantStatus'
    if (activeEntity.value === 'survey' || activeEntity.value === 'insight')
      return 'hrExperienceSurveyStatus'
    return 'commonActionProgressStatus'
  })
  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (isPlatformSuper.value && activeEntity.value !== 'my') {
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
        options: getDictMap.value[statusDictionary.value] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      },
      {
        label: '调查类型',
        key: 'surveyType',
        type: 'select',
        options: getDictMap.value.hrExperienceSurveyType ?? [],
        props: { clearable: true, placeholder: '全部类型' }
      },
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder: activeEntity.value === 'action' ? '行动、调查或负责人' : '调查名称或编码'
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

  const availabilityMetaMap: Record<
    Api.Hr.EmployeeExperienceAvailability,
    { label: string; type: TagProps['type'] }
  > = {
    available: { label: '可填写', type: 'warning' },
    completed: { label: '已完成', type: 'success' },
    expired: { label: '已过期', type: 'info' },
    unavailable: { label: '未开放', type: 'info' }
  }
  const availabilityMeta = (
    availability: Api.Hr.EmployeeExperienceAvailability
  ): { label: string; type: TagProps['type'] } => availabilityMetaMap[availability]
  const riskMetaMap: Record<
    Api.Hr.EmployeeExperienceRiskLevel,
    { label: string; type: TagProps['type'] }
  > = {
    high: { label: '重点关注', type: 'danger' },
    medium: { label: '建议改善', type: 'warning' },
    healthy: { label: '表现健康', type: 'success' }
  }
  const riskMeta = (
    risk: Api.Hr.EmployeeExperienceRiskLevel
  ): { label: string; type: TagProps['type'] } => riskMetaMap[risk]
  const dueMeta = (
    due?: Api.Hr.EmployeeExperienceDueStatus
  ): { label: string; type: TagProps['type'] } =>
    due === 'overdue'
      ? { label: '已逾期', type: 'danger' }
      : due === 'due_soon'
        ? { label: '即将到期', type: 'warning' }
        : { label: '进度正常', type: 'success' }

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'my') return myColumns()
    if (activeEntity.value === 'survey') return surveyColumns()
    if (activeEntity.value === 'insight') return insightColumns()
    return actionColumns()
  }
  const myColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'surveyName',
      label: '调查 / 编码',
      minWidth: 240,
      fixed: 'left',
      link: {
        permission: 'Hr:Experience:View',
        disabled: (row) => (row as Api.Hr.EmployeeExperienceMySurvey).availability === 'available',
        onClick: openDetail
      },
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceMySurvey
        return <BusinessTableIdentityCell primary={item.surveyName} secondary={item.surveyCode} />
      }
    },
    {
      prop: 'surveyType',
      label: '调查类型',
      minWidth: 130,
      dict: { code: 'hrExperienceSurveyType', display: 'auto' }
    },
    {
      prop: 'startDate',
      label: '开放周期',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceMySurvey
        return (
          <BusinessTableIdentityCell
            primary={dateText(item.startDate)}
            secondary={`至 ${dateText(item.endDate)}`}
          />
        )
      }
    },
    {
      prop: 'questionCount',
      label: '题目',
      minWidth: 95,
      align: 'center',
      formatter: (row) => `${(row as Api.Hr.EmployeeExperienceMySurvey).questionCount} 题`
    },
    {
      prop: 'availability',
      label: '填写状态',
      minWidth: 120,
      formatter: (row) => {
        const meta = availabilityMeta((row as Api.Hr.EmployeeExperienceMySurvey).availability)
        return (
          <ElTag type={meta.type} effect="light" round>
            {meta.label}
          </ElTag>
        )
      }
    },
    operationColumn()
  ]
  const surveyColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'surveyName',
      label: '调查 / 编码',
      minWidth: 230,
      fixed: 'left',
      link: { permission: 'Hr:Experience:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceSurvey
        return <BusinessTableIdentityCell primary={item.surveyName} secondary={item.surveyCode} />
      }
    },
    {
      prop: 'surveyType',
      label: '类型 / 频率',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceSurvey
        return (
          <BusinessTableIdentityCell
            primary={userStore.getDictLabelByValue(
              'hrExperienceSurveyType',
              item.surveyType,
              item.surveyType ?? '--'
            )}
            secondary={userStore.getDictLabelByValue(
              'hrExperienceCadence',
              item.cadence,
              item.cadence ?? '--'
            )}
          />
        )
      }
    },
    {
      prop: 'audienceType',
      label: '覆盖范围',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceSurvey
        return (
          <BusinessTableIdentityCell
            primary={userStore.getDictLabelByValue(
              'hrExperienceAudienceType',
              item.audienceType,
              item.audienceType ?? '--'
            )}
            secondary={item.audienceOrganizationName || `匿名阈值 ${item.minimumGroupSize} 人`}
          />
        )
      }
    },
    {
      prop: 'startDate',
      label: '调查周期',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceSurvey
        return (
          <BusinessTableIdentityCell
            primary={dateText(item.startDate)}
            secondary={`至 ${dateText(item.endDate)}`}
          />
        )
      }
    },
    {
      prop: 'responseRate',
      label: '参与 / 题目',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceSurvey
        return (
          <BusinessTableIdentityCell
            primary={`${item.completedCount ?? 0} / ${item.participantCount ?? 0}（${item.responseRate ?? 0}%）`}
            secondary={`${item.questionCount ?? 0} 道启用题目`}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      minWidth: 110,
      dict: { code: 'hrExperienceSurveyStatus', display: 'auto' }
    },
    operationColumn()
  ]
  const insightColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'surveyName',
      label: '调查 / 主题',
      minWidth: 250,
      fixed: 'left',
      link: { permission: 'Hr:Experience:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceInsight
        return (
          <BusinessTableIdentityCell
            primary={item.surveyName}
            secondary={`${item.surveyCode} · ${userStore.getDictLabelByValue('hrExperienceDimension', item.dimension, item.dimension ?? '--')}`}
          />
        )
      }
    },
    {
      prop: 'scorePercent',
      label: '主题得分',
      minWidth: 210,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceInsight
        return (
          <div class="employee-experience-page__score">
            <span>
              <strong>{item.scorePercent}</strong>
              <small>/ 100</small>
            </span>
            <ElProgress
              percentage={item.scorePercent}
              status={
                item.riskLevel === 'high'
                  ? 'exception'
                  : item.riskLevel === 'healthy'
                    ? 'success'
                    : 'warning'
              }
              stroke-width={6}
              show-text={false}
            />
          </div>
        )
      }
    },
    {
      prop: 'respondentCount',
      label: '安全样本',
      minWidth: 130,
      align: 'center',
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceInsight
        return (
          <BusinessTableIdentityCell
            primary={`${item.respondentCount} 人`}
            secondary={`阈值 ${item.minimumGroupSize} 人`}
          />
        )
      }
    },
    {
      prop: 'questionCount',
      label: '量表题',
      minWidth: 95,
      align: 'center',
      formatter: (row) => `${(row as Api.Hr.EmployeeExperienceInsight).questionCount} 题`
    },
    {
      prop: 'actionCount',
      label: '改善行动',
      minWidth: 105,
      align: 'center',
      formatter: (row) => `${(row as Api.Hr.EmployeeExperienceInsight).actionCount} 项`
    },
    {
      prop: 'riskLevel',
      label: '健康度',
      minWidth: 120,
      formatter: (row) => {
        const meta = riskMeta((row as Api.Hr.EmployeeExperienceInsight).riskLevel)
        return (
          <ElTag type={meta.type} effect="light" round>
            {meta.label}
          </ElTag>
        )
      }
    },
    operationColumn()
  ]
  const actionColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'title',
      label: '改善行动 / 调查',
      minWidth: 260,
      fixed: 'left',
      link: { permission: 'Hr:Experience:View', onClick: openDetail },
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceAction
        return (
          <BusinessTableIdentityCell
            primary={item.title}
            secondary={item.surveyName || item.surveyCode}
          />
        )
      }
    },
    {
      prop: 'dimension',
      label: '改善主题',
      minWidth: 135,
      dict: { code: 'hrExperienceDimension', display: 'auto' }
    },
    {
      prop: 'ownerEmployeeName',
      label: '负责人',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceAction
        return (
          <BusinessTableIdentityCell
            primary={item.ownerEmployeeName}
            secondary={item.ownerEmployeeNo}
          />
        )
      }
    },
    {
      prop: 'organizationName',
      label: '行动范围',
      minWidth: 145,
      formatter: (row) => (row as Api.Hr.EmployeeExperienceAction).organizationName || '全组织'
    },
    {
      prop: 'dueDate',
      label: '计划期限',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.EmployeeExperienceAction
        const meta = dueMeta(item.dueStatus)
        return (
          <div class="employee-experience-page__due">
            <strong>{dateText(item.dueDate)}</strong>
            <ElTag type={meta.type} effect="light" round size="small">
              {meta.label}
            </ElTag>
          </div>
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      minWidth: 115,
      dict: { code: 'commonActionProgressStatus', display: 'auto' }
    },
    operationColumn()
  ]
  const operationColumn = (): ColumnOption<RecordItem> => ({
    prop: 'operation',
    label: '操作',
    width: 112,
    fixed: 'right',
    align: 'center',
    formatter: (row) => {
      if (activeEntity.value === 'my') {
        const item = row as Api.Hr.EmployeeExperienceMySurvey
        return item.availability === 'available' ? (
          <ArtButtonTable
            type="edit"
            permission="Hr:Experience:Respond"
            label="填写匿名调查"
            onClick={() => void responseDialogRef.value?.handleOpen(item)}
          />
        ) : (
          <ArtButtonTable
            type="view"
            permission="Hr:Experience:View"
            label="查看调查状态"
            onClick={() => openDetail(row)}
          />
        )
      }
      return (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="Hr:Experience:View"
            label="查看员工体验详情"
            onClick={() => openDetail(row)}
          />
          <ArtButtonMore
            list={() => rowActions(row)}
            onClick={(item: ButtonMoreItem) => void handleRowAction(item, row)}
          />
        </BusinessTableRowActions>
      )
    }
  })

  const rowActions = (row: RecordItem): ButtonMoreItem[] => {
    if (activeEntity.value === 'survey') {
      const item = row as Api.Hr.EmployeeExperienceSurvey
      const actions: ButtonMoreItem[] = []
      if (item.status === 'draft') {
        actions.push(
          {
            key: 'edit',
            label: '编辑调查设置',
            icon: 'ri:edit-line',
            auth: 'Hr:Experience:Survey:Manage'
          },
          {
            key: 'add_question',
            label: '新增调查题目',
            icon: 'ri:questionnaire-line',
            auth: 'Hr:Experience:Question:Manage'
          },
          {
            key: 'launch',
            label: '发布并固化受众',
            icon: 'ri:send-plane-line',
            auth: 'Hr:Experience:Launch'
          }
        )
      }
      if (item.status === 'scheduled') {
        actions.push({
          key: 'open',
          label: '立即开放调查',
          icon: 'ri:play-circle-line',
          auth: 'Hr:Experience:Launch'
        })
      }
      if (['scheduled', 'open'].includes(item.status)) {
        actions.push({
          key: 'close',
          label: '关闭调查',
          icon: 'ri:stop-circle-line',
          auth: 'Hr:Experience:Launch'
        })
      }
      if (['draft', 'scheduled', 'open'].includes(item.status)) {
        actions.push({
          key: 'cancel',
          label: '取消调查',
          icon: 'ri:close-circle-line',
          color: 'var(--el-color-danger)',
          auth: 'Hr:Experience:Launch'
        })
      }
      return actions
    }
    if (activeEntity.value === 'insight') {
      return [
        {
          key: 'add_action',
          label: '建立改善行动',
          icon: 'ri:route-line',
          auth: 'Hr:Experience:Action:Manage'
        }
      ]
    }
    const item = row as Api.Hr.EmployeeExperienceAction
    const actions: ButtonMoreItem[] = []
    if (['planned', 'in_progress'].includes(item.status)) {
      actions.push({
        key: 'edit',
        label: '编辑改善行动',
        icon: 'ri:edit-line',
        auth: 'Hr:Experience:Action:Manage'
      })
    }
    if (item.status === 'planned') {
      actions.push({
        key: 'start',
        label: '启动改善行动',
        icon: 'ri:play-circle-line',
        auth: 'Hr:Experience:Action:Manage'
      })
    }
    if (item.status === 'in_progress') {
      actions.push({
        key: 'complete',
        label: '验收行动成果',
        icon: 'ri:checkbox-circle-line',
        auth: 'Hr:Experience:Action:Close'
      })
    }
    if (['planned', 'in_progress'].includes(item.status)) {
      actions.push({
        key: 'cancel',
        label: '取消改善行动',
        icon: 'ri:close-circle-line',
        color: 'var(--el-color-danger)',
        auth: 'Hr:Experience:Action:Manage'
      })
    }
    return actions
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => {
    if (activeEntity.value === 'survey') {
      return [
        {
          type: 'add',
          label: '新建员工体验调查',
          permission: 'Hr:Experience:Survey:Manage',
          onClick: () => void surveyDialogRef.value?.handleOpen('add')
        }
      ]
    }
    if (activeEntity.value === 'action') {
      return [
        {
          type: 'add',
          label: '新增改善行动',
          permission: 'Hr:Experience:Action:Manage',
          onClick: () => void actionDialogRef.value?.handleOpen({ type: 'add' })
        }
      ]
    }
    return []
  })
  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchEmployeeExperienceRecords(activeEntity.value, { ...params, from, to })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (_rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchEmployeeExperienceOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const refreshAfterAction = async (): Promise<void> => {
    await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
    await detailDrawerRef.value?.refresh()
  }
  const handleRecordSuccess = async (
    entity: Extract<Entity, 'survey' | 'action'>
  ): Promise<void> => {
    if (activeEntity.value !== entity) activeEntity.value = entity
    await nextTick()
    await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }
  const handleQuestionSuccess = async (): Promise<void> => {
    await tableQueryRef.value?.refreshUpdate()
    await detailDrawerRef.value?.refresh()
  }
  const handleResponseSuccess = async (): Promise<void> => {
    await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }
  const openDetail = (row: RecordItem): void => {
    if (activeEntity.value === 'insight') {
      const item = row as Api.Hr.EmployeeExperienceInsight
      void detailDrawerRef.value?.handleOpen('insight', item.surveyId, item.dimension)
      return
    }
    if ('id' in row && row.id) void detailDrawerRef.value?.handleOpen(activeEntity.value, row.id)
  }
  const openAddQuestion = (survey: Api.Hr.EmployeeExperienceSurvey): void => {
    void questionDialogRef.value?.handleOpen(survey)
  }
  const openEditQuestion = (
    survey: Api.Hr.EmployeeExperienceSurvey,
    question: Api.Hr.EmployeeExperienceQuestion
  ): void => {
    void questionDialogRef.value?.handleOpen(survey, question)
  }
  const openActionFromInsight = (
    survey: Api.Hr.EmployeeExperienceReference,
    dimension: string
  ): void => {
    void actionDialogRef.value?.handleOpen({
      type: 'add',
      presetSurvey: survey,
      presetDimension: dimension
    })
  }
  const handleRowAction = async (item: ButtonMoreItem, row: RecordItem): Promise<void> => {
    const key = String(item.key)
    if (activeEntity.value === 'survey') {
      await handleSurveyAction(key, row as Api.Hr.EmployeeExperienceSurvey)
      return
    }
    if (activeEntity.value === 'insight') {
      const insight = row as Api.Hr.EmployeeExperienceInsight
      openActionFromInsight(
        {
          id: insight.surveyId,
          tenantId: insight.tenantId,
          surveyCode: insight.surveyCode,
          surveyName: insight.surveyName,
          surveyType: insight.surveyType
        },
        insight.dimension
      )
      return
    }
    await handleActionRowAction(key, row as Api.Hr.EmployeeExperienceAction)
  }
  const handleSurveyAction = async (
    key: string,
    row: Api.Hr.EmployeeExperienceSurvey
  ): Promise<void> => {
    if (!row.id) return
    if (key === 'edit') {
      await surveyDialogRef.value?.handleOpen('edit', row)
      return
    }
    if (key === 'add_question') {
      await questionDialogRef.value?.handleOpen(row)
      return
    }
    try {
      if (key === 'launch') {
        await confirmAction(
          `发布后将按当前组织与在职状态固化受众，且必须至少有 ${row.minimumGroupSize} 名符合条件员工。确认发布？`,
          '发布员工体验调查',
          { confirmButtonText: '发布并固化受众', cancelButtonText: '返回检查', type: 'info' }
        )
        await transitionEmployeeExperienceRecord('survey', row.id, 'launch')
      } else if (key === 'open') {
        await confirmAction('确认当前日期已进入调查周期，并立即向参与员工开放？', '开放调查', {
          confirmButtonText: '立即开放',
          cancelButtonText: '返回',
          type: 'info'
        })
        await transitionEmployeeExperienceRecord('survey', row.id, 'open')
      } else if (key === 'close') {
        await confirmAction(
          '关闭后员工不能继续提交答卷，已提交的匿名答案继续用于阈值安全洞察。',
          '关闭调查',
          {
            confirmButtonText: '确认关闭',
            cancelButtonText: '继续收集',
            type: 'warning'
          }
        )
        await transitionEmployeeExperienceRecord('survey', row.id, 'close')
      } else if (key === 'cancel') {
        const reason = await promptText('取消不会删除历史，请填写业务原因。', '取消员工体验调查', {
          minLength: 2,
          maxLength: 500,
          placeholder: '请输入取消原因',
          type: 'warning'
        })
        await transitionEmployeeExperienceRecord('survey', row.id, 'cancel', reason)
      }
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '员工体验调查处理失败，请刷新状态后重试')
    }
  }
  const handleActionRowAction = async (
    key: string,
    row: Api.Hr.EmployeeExperienceAction
  ): Promise<void> => {
    if (!row.id) return
    if (key === 'edit') {
      await actionDialogRef.value?.handleOpen({ type: 'edit', editData: row })
      return
    }
    try {
      if (key === 'start') {
        await confirmAction(
          '启动后行动将进入执行阶段，负责人可继续维护进展说明。',
          '启动改善行动',
          {
            confirmButtonText: '确认启动',
            cancelButtonText: '暂不启动',
            type: 'info'
          }
        )
        await transitionEmployeeExperienceRecord('action', row.id, 'start')
      } else if (key === 'complete') {
        const result = await promptText('请填写可核验的成果、数据或复盘结论。', '验收改善行动', {
          minLength: 2,
          maxLength: 1200,
          placeholder: '说明行动结果、成功标准达成情况和后续安排',
          type: 'success'
        })
        await transitionEmployeeExperienceRecord('action', row.id, 'complete', result)
      } else if (key === 'cancel') {
        const reason = await promptText('取消不会删除行动历史，请说明原因。', '取消改善行动', {
          minLength: 2,
          maxLength: 600,
          placeholder: '请输入取消原因',
          type: 'warning'
        })
        await transitionEmployeeExperienceRecord('action', row.id, 'cancel', reason)
      }
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '改善行动处理失败，请刷新状态后重试')
    }
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '', surveyType: '' })
    tableTotal.value = 0
  }

  onMounted(async () => {
    await Promise.all(
      [
        'hrExperienceSurveyType',
        'hrExperienceCadence',
        'hrExperienceSurveyStatus',
        'hrExperienceDimension',
        'hrExperienceAnswerType',
        'hrExperienceParticipantStatus',
        'commonActionProgressStatus',
        'hrExperienceAudienceType'
      ].map((code) => userStore.ensureDictLoaded(code))
    )
    if (!tabs.value.some((tab) => tab.value === activeEntity.value) && tabs.value[0]) {
      activeEntity.value = tabs.value[0].value
    }
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

  .employee-experience-page {
    @include hr-table-workspace-layout(360px);

    &__control {
      position: relative;
      padding: 17px 18px;
      overflow: hidden;
      background:
        radial-gradient(
          circle at 100% 0%,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 34%
        ),
        var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--theme-color) 12%, var(--art-card-border));
      border-radius: calc(var(--el-border-radius-base) + 5px);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--art-gray-900) 3.5%, transparent);
    }

    &__heading {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;

      > div {
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 0;
      }

      > div > span:last-child {
        display: grid;
        min-width: 0;
      }

      small {
        font-size: 9px;
        font-weight: 750;
        color: var(--theme-color);
        letter-spacing: 0.1em;
      }

      strong {
        margin-top: 1px;
        font-size: 16px;
        color: var(--el-text-color-primary);
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
    &__rail-icon,
    &__context-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
    }

    &__section-icon {
      width: 42px;
      height: 42px;
      border-radius: calc(var(--el-border-radius-base) + 4px);

      :deep(.art-svg-icon) {
        font-size: 19px;
      }
    }

    &__privacy-badge {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 6px;
      align-items: center;
      min-height: 29px;
      padding: 0 10px;
      font-size: 11px;
      font-weight: 700;
      color: var(--el-color-success-dark-2);
      white-space: nowrap;
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: 999px;
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      padding: 0;
      margin: 0;
      overflow: hidden;
      list-style: none;
      background: color-mix(in srgb, var(--theme-color) 2%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
      border-radius: calc(var(--el-border-radius-base) + 2px);

      li {
        position: relative;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        gap: 9px;
        align-items: center;
        min-width: 0;
        min-height: 68px;
        padding: 9px 11px;
        border-right: 1px solid var(--art-card-border);

        &:last-child {
          border-right: 0;
        }

        &.is-current {
          background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
          box-shadow: inset 0 -3px 0 var(--theme-color);
        }

        &.is-protected {
          background: color-mix(in srgb, var(--el-color-success) 5%, var(--default-box-color));
        }

        &.is-risk {
          background: color-mix(in srgb, var(--el-color-danger) 5%, var(--default-box-color));

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
          font-size: 10px;
          font-weight: 700;
          color: var(--theme-color);
        }
      }
    }

    &__rail-index {
      position: absolute;
      top: 5px;
      left: 40px;
      font-size: 8px;
      font-weight: 800;
      color: var(--theme-color);
      letter-spacing: 0.04em;
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
      padding: 10px 12px;
      margin-top: 10px;
      background: color-mix(in srgb, var(--theme-color) 3.5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 12%, var(--art-card-border));
      border-radius: calc(var(--el-border-radius-base) + 2px);

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
        padding: 6px 9px;
        background: var(--default-box-color);
        border: 1px solid var(--art-card-border);
        border-radius: var(--el-border-radius-base);

        &.is-danger dd {
          color: var(--el-color-danger);
        }

        &.is-warning dd {
          color: var(--el-color-warning-dark-2);
        }

        &.is-primary dd {
          color: var(--theme-color);
        }
      }

      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 16px;
        font-weight: 750;
        font-variant-numeric: tabular-nums;
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
      padding-top: 10px;
      margin-top: 11px;
      font-size: 11px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--art-card-border);

      :deep(.art-svg-icon) {
        flex: 0 0 auto;
        margin-top: 1px;
        color: var(--theme-color);
      }
    }

    &__score {
      display: grid;
      gap: 5px;
      min-width: 0;

      > span {
        display: flex;
        gap: 4px;
        align-items: baseline;
      }

      strong {
        font-size: 16px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__due {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;

      strong {
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
      }
    }

    &__operations {
      display: flex;
      gap: 2px;
      align-items: center;
      white-space: nowrap;
    }
  }

  @media only screen and (width <= 1100px) {
    .employee-experience-page {
      &__rail {
        grid-template-columns: repeat(2, minmax(0, 1fr));

        li:nth-child(2) {
          border-right: 0;
        }

        li:nth-child(-n + 2) {
          border-bottom: 1px solid var(--art-card-border);
        }
      }

      &__context > div > span:last-child {
        display: grid;
        gap: 2px;
      }
    }
  }

  @media only screen and (width <= 767px) {
    .employee-experience-page {
      &__control {
        padding: 14px;
      }

      &__heading,
      &__context {
        flex-direction: column;
        align-items: stretch;
      }

      &__heading em {
        white-space: normal;
      }

      &__privacy-badge {
        align-self: flex-start;
      }

      &__rail {
        grid-template-columns: 1fr;

        li {
          border-right: 0;
          border-bottom: 1px solid var(--art-card-border);

          &:last-child {
            border-bottom: 0;
          }
        }
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
