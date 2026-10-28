<template>
  <ArtPermissionGuard permission="Hr:Talent:View">
    <div class="learning-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="LEARNING OPERATIONS"
        title="培训与能力"
        description="统一管理培养计划、课程产品、交付班次、员工学习结果与证书，让培训投入能够回写人才能力并形成可审计闭环。"
        icon="ri:graduation-cap-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="learning-page__control-deck" aria-labelledby="learning-control-title">
        <header class="learning-page__control-heading">
          <div class="learning-page__heading-copy">
            <span class="learning-page__section-icon"><ArtSvgIcon icon="ri:route-line" /></span>
            <span>
              <strong id="learning-control-title">企业学习交付闭环</strong>
              <small>先定义课程与能力目标，再按班次交付，并以结果驱动履历、证书和能力更新</small>
            </span>
          </div>
          <span class="learning-page__governance-badge">
            <ArtSvgIcon icon="ri:shield-check-line" />结果受控回写
          </span>
        </header>

        <div class="learning-page__journey" aria-label="学习发展业务流程">
          <article v-for="(stage, index) in journeyStages" :key="stage.title">
            <span class="learning-page__journey-index">0{{ index + 1 }}</span>
            <span class="learning-page__journey-icon"><ArtSvgIcon :icon="stage.icon" /></span>
            <div
              ><strong>{{ stage.title }}</strong
              ><small>{{ stage.description }}</small></div
            >
            <ArtSvgIcon
              v-if="index < journeyStages.length - 1"
              class="learning-page__connector"
              icon="ri:arrow-right-line"
              aria-hidden="true"
            />
          </article>
        </div>

        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="学习运营分类"
          compact
          @change="handleTabChange"
        />

        <footer class="learning-page__control-note">
          <ArtSvgIcon icon="ri:information-line" />
          课程发布后固化通过标准；班次存在未完成结果时不可结班；员工通过课程后自动写入培训履历，并按能力映射更新个人能力证据。
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

      <LearningDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter, formatSensitiveCurrencyValue } from '@/utils/ui/format'

  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
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
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import {
    deleteLearningRecord,
    fetchLearningOverview,
    fetchLearningRecords,
    transitionLearningRecord
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import LearningDialog from './modules/learning-dialog.vue'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })
  const formatTableDateTime2 = createDateTimeFormatter({
    format: 'MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'HrTalentDevelopment' })
  type Entity = Api.Hr.LearningEntity
  type RecordItem = Api.Hr.LearningRecord
  type TableParams = Api.Hr.LearningSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>
  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyDescription: string
    statusDict?: string
  }
  interface DialogExpose {
    handleOpen: (entity: Entity, row?: RecordItem) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'plan',
      label: '培养计划',
      description: '目标、预算与执行责任',
      emptyDescription: '先建立年度或专项培养计划，明确目标人群、预算和负责人。',
      statusDict: 'hrTrainingPlanStatus',
      icon: 'ri:calendar-check-line'
    },
    {
      value: 'course',
      label: '课程目录',
      description: '内容、标准与证书规则',
      emptyDescription: '把可复用的学习内容沉淀为课程，并明确通过、出勤和证书标准。',
      statusDict: 'hrLearningCourseStatus',
      icon: 'ri:book-open-line'
    },
    {
      value: 'course_competency',
      label: '能力映射',
      description: '课程到能力证据',
      emptyDescription: '为草稿课程配置目标能力等级，通过结果将自动回写员工能力档案。',
      icon: 'ri:focus-3-line'
    },
    {
      value: 'session',
      label: '培训班次',
      description: '排期、容量与交付成本',
      emptyDescription: '从已发布计划和课程创建培训班次，再开放员工报名。',
      statusDict: 'hrLearningSessionStatus',
      icon: 'ri:presentation-line'
    },
    {
      value: 'enrollment',
      label: '学习结果',
      description: '出勤、成绩与完成状态',
      emptyDescription: '将员工安排到开放班次，并持续登记参与状态与最终学习结果。',
      statusDict: 'hrLearningEnrollmentStatus',
      icon: 'ri:user-follow-line'
    },
    {
      value: 'certificate',
      label: '学习证书',
      description: '签发、有效期与撤销',
      emptyDescription: '员工通过启用证书的课程后，系统将在此自动签发证书。',
      statusDict: 'hrLearningCertificateStatus',
      icon: 'ri:award-line'
    }
  ]
  const journeyStages = [
    { title: '规划投入', description: '目标人群 · 预算责任', icon: 'ri:calendar-check-line' },
    { title: '定义课程', description: '通过标准 · 能力目标', icon: 'ri:book-open-line' },
    { title: '组织交付', description: '班次容量 · 出勤成绩', icon: 'ri:presentation-line' },
    { title: '沉淀成果', description: '履历证书 · 能力证据', icon: 'ri:award-line' }
  ]

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('plan')
  const activeTab = computed<Tab>(
    () => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!
  )
  const deleteTables: Record<Entity, string> = {
    plan: 'hr_training_plan',
    course: 'hr_learning_course',
    course_competency: 'hr_learning_course_competency',
    session: 'hr_learning_session',
    enrollment: 'hr_training_enrollment',
    certificate: 'hr_learning_certificate'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.LearningSearchParams }>({
    searchQuery: { tenantId: '', status: '', keyword: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_training_plan: 'plan',
      hr_learning_course: 'course',
      hr_learning_course_competency: 'course_competency',
      hr_learning_session: 'session',
      hr_training_enrollment: 'enrollment',
      hr_learning_certificate: 'certificate'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const overview = reactive<Api.Hr.LearningOverview>({
    publishedCourseCount: 0,
    openSessionCount: 0,
    activeLearnerCount: 0,
    completionRate: 0,
    expiringCertificateCount: 0,
    budgetExecutionRate: 0
  })
  const tableTotal = ref(0)

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '课程标准化', type: 'primary', effect: 'plain' },
    { label: '结果自动回写', type: 'success', effect: 'light' },
    { label: '投入产出可追溯', type: 'warning', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '已发布课程',
      value: overview.publishedCourseCount,
      description: '可用于创建培训班次',
      icon: 'ri:book-open-line',
      tone: 'primary'
    },
    {
      label: '开放 / 进行班次',
      value: overview.openSessionCount,
      description: `${overview.activeLearnerCount} 名员工正在学习`,
      icon: 'ri:presentation-line',
      tone: 'success'
    },
    {
      label: '学习完成率',
      value: `${overview.completionRate}%`,
      description: '已出最终结果中的通过率',
      icon: 'ri:verified-badge-line',
      tone: overview.completionRate >= 80 ? 'success' : 'warning'
    },
    {
      label: '预算执行率',
      value: `${overview.budgetExecutionRate}%`,
      description: `${overview.expiringCertificateCount} 张证书 60 天内到期`,
      icon: 'ri:funds-line',
      tone: overview.budgetExecutionRate > 100 ? 'danger' : 'info'
    }
  ])

  const keywordPlaceholder = computed(
    () =>
      ({
        plan: '计划、负责人或编码',
        course: '课程、供应方或编码',
        course_competency: '课程或能力项',
        session: '班次、课程、讲师或计划',
        enrollment: '员工、班次或课程',
        certificate: '员工、课程或证书编号'
      })[activeEntity.value]
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
      props: { clearable: true, placeholder: keywordPlaceholder.value }
    })
    return items
  })

  const statusType = (
    value?: string | null
  ): 'success' | 'warning' | 'danger' | 'info' | 'primary' =>
    ['published', 'open', 'passed', 'valid', 'completed'].includes(value ?? '')
      ? 'success'
      : ['in_progress', 'attending', 'enrolled'].includes(value ?? '')
        ? 'primary'
        : ['failed', 'no_show', 'revoked'].includes(value ?? '')
          ? 'danger'
          : ['cancelled', 'retired', 'expired', 'withdrawn'].includes(value ?? '')
            ? 'warning'
            : 'info'

  const statusTag = (dictionary: string, status?: string | null) => (
    <ElTag type={statusType(status)} effect="light" round>
      {userStore.getDictLabelByValue(dictionary, status, status ?? '--')}
    </ElTag>
  )

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

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'plan') return planColumns()
    if (activeEntity.value === 'course') return courseColumns()
    if (activeEntity.value === 'course_competency') return competencyColumns()
    if (activeEntity.value === 'session') return sessionColumns()
    if (activeEntity.value === 'enrollment') return enrollmentColumns()
    return certificateColumns()
  }
  const planColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'planName',
      label: '培养计划',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) => {
        const plan = row as Api.Hr.LearningPlan
        return (
          <BusinessTableIdentityCell
            primary={plan.planName}
            secondary={`${plan.planCode} · ${userStore.getDictLabelByValue('hrTrainingType', plan.trainingType, plan.trainingType ?? '--')}`}
          />
        )
      }
    },
    {
      prop: 'owner',
      label: '负责人 / 人群',
      minWidth: 190,
      formatter: (row) => {
        const plan = row as Api.Hr.LearningPlan
        return (
          <BusinessTableIdentityCell
            primary={plan.owner?.name ?? '未指定负责人'}
            secondary={plan.targetAudience ?? '未明确目标人群'}
          />
        )
      }
    },
    {
      prop: 'period',
      label: '计划周期',
      minWidth: 190,
      formatter: (row) => {
        const plan = row as Api.Hr.LearningPlan
        return `${plan.startDate} → ${plan.endDate ?? '持续执行'}`
      }
    },
    {
      prop: 'delivery',
      label: '交付规模',
      width: 140,
      formatter: (row) => {
        const plan = row as Api.Hr.LearningPlan
        return `${plan.sessionCount ?? 0} 个班次 · ${plan.learnerCount ?? 0} 人`
      }
    },
    {
      prop: 'budget',
      label: '预算 / 实际',
      minWidth: 175,
      formatter: (row) => {
        const plan = row as Api.Hr.LearningPlan
        return (
          <BusinessTableIdentityCell
            primary={formatSensitiveCurrencyValue(plan.budget)}
            secondary={`实际 ${formatSensitiveCurrencyValue(plan.actualCost)}`}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      formatter: (row) => statusTag('hrTrainingPlanStatus', (row as Api.Hr.LearningPlan).status)
    },
    actionColumn()
  ]
  const courseColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'courseName',
      label: '课程',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) => {
        const course = row as Api.Hr.LearningCourse
        return (
          <BusinessTableIdentityCell
            primary={course.courseName}
            secondary={`${course.courseCode} · ${userStore.getDictLabelByValue('hrLearningCourseCategory', course.category, course.category ?? '--')}`}
          />
        )
      }
    },
    {
      prop: 'deliveryMode',
      label: '交付方式',
      width: 125,
      formatter: (row) =>
        userStore.getDictLabelByValue(
          'hrLearningDeliveryMode',
          (row as Api.Hr.LearningCourse).deliveryMode,
          (row as Api.Hr.LearningCourse).deliveryMode ?? '--'
        )
    },
    {
      prop: 'hours',
      label: '课时 / 学分',
      width: 125,
      formatter: (row) =>
        `${(row as Api.Hr.LearningCourse).durationHours}h / ${(row as Api.Hr.LearningCourse).creditHours} 分`
    },
    {
      prop: 'standard',
      label: '通过标准',
      minWidth: 170,
      formatter: (row) => {
        const course = row as Api.Hr.LearningCourse
        return (
          <BusinessTableIdentityCell
            primary={course.passingScore == null ? '不设分数线' : `${course.passingScore} 分`}
            secondary={`最低出勤 ${course.minimumAttendancePercent}%`}
          />
        )
      }
    },
    {
      prop: 'coverage',
      label: '班次 / 能力',
      width: 130,
      formatter: (row) =>
        `${(row as Api.Hr.LearningCourse).sessionCount ?? 0} / ${(row as Api.Hr.LearningCourse).competencyCount ?? 0}`
    },
    {
      prop: 'certificateEnabled',
      label: '证书',
      width: 105,
      formatter: (row) =>
        (row as Api.Hr.LearningCourse).certificateEnabled ? '自动签发' : '不签发'
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) => statusTag('hrLearningCourseStatus', (row as Api.Hr.LearningCourse).status)
    },
    actionColumn()
  ]
  const competencyColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'course',
      label: '课程',
      minWidth: 240,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.LearningCourseCompetency
        return (
          <BusinessTableIdentityCell primary={item.course?.name} secondary={item.course?.code} />
        )
      }
    },
    {
      prop: 'competency',
      label: '目标能力',
      minWidth: 240,
      formatter: (row) => {
        const item = row as Api.Hr.LearningCourseCompetency
        return (
          <BusinessTableIdentityCell
            primary={item.competency?.name}
            secondary={item.competency?.code}
          />
        )
      }
    },
    {
      prop: 'targetLevel',
      label: '完成目标等级',
      minWidth: 160,
      formatter: (row) => (
        <ElTag type="primary" effect="light" round>
          {userStore.getDictLabelByValue(
            'commonCompetencyLevel',
            (row as Api.Hr.LearningCourseCompetency).targetLevel,
            (row as Api.Hr.LearningCourseCompetency).targetLevel ?? '--'
          )}
        </ElTag>
      )
    },
    {
      prop: 'createTime',
      label: '配置时间',
      width: 165,
      formatter: (row) => formatTableDateTime((row as Api.Hr.LearningCourseCompetency).createTime)
    },
    actionColumn()
  ]
  const sessionColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'sessionCode',
      label: '培训班次',
      minWidth: 230,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.LearningSession
        return (
          <BusinessTableIdentityCell
            primary={item.course?.name}
            secondary={`${item.sessionCode} · ${item.plan?.name ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'schedule',
      label: '交付时间',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.LearningSession
        return (
          <BusinessTableIdentityCell
            primary={formatTableDateTime(item.startAt)}
            secondary={`至 ${formatTableDateTime2(item.endAt)}`}
          />
        )
      }
    },
    {
      prop: 'channel',
      label: '讲师 / 渠道',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.LearningSession
        return (
          <BusinessTableIdentityCell
            primary={item.instructorName ?? '未指定讲师'}
            secondary={item.location ?? item.meetingUrl ?? '--'}
          />
        )
      }
    },
    {
      prop: 'enrollment',
      label: '报名 / 通过',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.LearningSession
        const percentage = Math.min(
          100,
          Math.round(((item.enrollmentCount ?? 0) / Math.max(item.capacity, 1)) * 100)
        )
        return (
          <div class="learning-page__progress">
            <span>
              <strong>{item.enrollmentCount ?? 0}</strong> / {item.capacity} 人 · 通过{' '}
              {item.passedCount ?? 0}
            </span>
            <ElProgress percentage={percentage} stroke-width={6} show-text={false} />
          </div>
        )
      }
    },
    {
      prop: 'cost',
      label: '预计 / 实际',
      minWidth: 160,
      formatter: (row) => {
        const item = row as Api.Hr.LearningSession
        return (
          <BusinessTableIdentityCell
            primary={formatSensitiveCurrencyValue(item.estimatedCost)}
            secondary={`实际 ${formatSensitiveCurrencyValue(item.actualCost)}`}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) =>
        statusTag('hrLearningSessionStatus', (row as Api.Hr.LearningSession).status)
    },
    actionColumn()
  ]
  const enrollmentColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '学习员工',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.LearningEnrollment
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={item.employee?.code}
          />
        )
      }
    },
    {
      prop: 'course',
      label: '课程 / 班次',
      minWidth: 230,
      formatter: (row) => {
        const item = row as Api.Hr.LearningEnrollment
        return (
          <BusinessTableIdentityCell primary={item.course?.name} secondary={item.session?.code} />
        )
      }
    },
    {
      prop: 'schedule',
      label: '开始时间',
      width: 160,
      formatter: (row) => formatTableDateTime((row as Api.Hr.LearningEnrollment).session?.startAt)
    },
    {
      prop: 'attendancePercent',
      label: '出勤',
      width: 90,
      formatter: (row) =>
        (row as Api.Hr.LearningEnrollment).attendancePercent == null
          ? '--'
          : `${(row as Api.Hr.LearningEnrollment).attendancePercent}%`
    },
    {
      prop: 'score',
      label: '成绩',
      width: 85,
      formatter: (row) => (row as Api.Hr.LearningEnrollment).score ?? '--'
    },
    {
      prop: 'certificateNo',
      label: '证书编号',
      minWidth: 170,
      formatter: (row) => (row as Api.Hr.LearningEnrollment).certificateNo ?? '--'
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) =>
        statusTag('hrLearningEnrollmentStatus', (row as Api.Hr.LearningEnrollment).status)
    },
    actionColumn()
  ]
  const certificateColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'certificateNo',
      label: '证书',
      minWidth: 230,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.LearningCertificate
        return (
          <BusinessTableIdentityCell
            primary={item.certificateName}
            secondary={item.certificateNo}
          />
        )
      }
    },
    {
      prop: 'employee',
      label: '持证员工',
      minWidth: 180,
      formatter: (row) => {
        const item = row as Api.Hr.LearningCertificate
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={item.employee?.code}
          />
        )
      }
    },
    {
      prop: 'course',
      label: '对应课程',
      minWidth: 190,
      formatter: (row) => (row as Api.Hr.LearningCertificate).course?.name ?? '--'
    },
    { prop: 'issuedOn', label: '签发日期', width: 120 },
    {
      prop: 'expiresOn',
      label: '到期信号',
      width: 130,
      formatter: (row) => {
        const item = row as Api.Hr.LearningCertificate
        const expiring =
          item.status === 'valid' &&
          item.expiresOn &&
          dayjs(item.expiresOn).diff(dayjs(), 'day') <= 60
        return (
          <span class={expiring ? 'learning-page__warning' : ''}>
            {item.expiresOn ?? '长期有效'}
          </span>
        )
      }
    },
    {
      prop: 'credentialUrl',
      label: '电子凭证',
      minWidth: 150,
      formatter: (row) => ((row as Api.Hr.LearningCertificate).credentialUrl ? '已维护' : '待维护')
    },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      formatter: (row) =>
        statusTag('hrLearningCertificateStatus', (row as Api.Hr.LearningCertificate).status)
    },
    actionColumn()
  ]

  const permissionFor = (action: 'add' | 'edit' | 'delete'): string =>
    ({
      plan: { add: 'Hr:Talent:Add', edit: 'Hr:Talent:Edit', delete: 'Hr:Talent:Delete' },
      course: {
        add: 'Hr:Talent:Course:Add',
        edit: 'Hr:Talent:Course:Edit',
        delete: 'Hr:Talent:Course:Edit'
      },
      course_competency: {
        add: 'Hr:Talent:Course:Competency',
        edit: 'Hr:Talent:Course:Competency',
        delete: 'Hr:Talent:Course:Competency'
      },
      session: {
        add: 'Hr:Talent:Session:Add',
        edit: 'Hr:Talent:Session:Edit',
        delete: 'Hr:Talent:Session:Edit'
      },
      enrollment: {
        add: 'Hr:Talent:Enrollment:Add',
        edit: 'Hr:Talent:Enrollment:Manage',
        delete: 'Hr:Talent:Enrollment:Manage'
      },
      certificate: {
        add: 'Hr:Talent:Certificate:Manage',
        edit: 'Hr:Talent:Certificate:Manage',
        delete: 'Hr:Talent:Certificate:Manage'
      }
    })[activeEntity.value][action]
  const statusOf = (row: RecordItem): string => ('status' in row ? String(row.status) : '')
  const canEdit = (row: RecordItem): boolean => {
    const status = statusOf(row)
    return (
      activeEntity.value === 'course_competency' ||
      (activeEntity.value === 'plan' && status === 'draft') ||
      (activeEntity.value === 'course' && status === 'draft') ||
      (activeEntity.value === 'session' && status === 'planned') ||
      (activeEntity.value === 'enrollment' && status === 'enrolled') ||
      (activeEntity.value === 'certificate' && status === 'valid')
    )
  }
  const canDelete = (row: RecordItem): boolean => {
    const status = statusOf(row)
    return (
      activeEntity.value === 'course_competency' ||
      (activeEntity.value === 'plan' && status === 'draft') ||
      (activeEntity.value === 'course' && status === 'draft') ||
      (activeEntity.value === 'session' && status === 'planned') ||
      (activeEntity.value === 'enrollment' && status === 'enrolled')
    )
  }
  const transitionActions = (row: RecordItem): ButtonMoreItem[] => {
    if (!row.id) return []
    const actions: ButtonMoreItem[] = []
    const status = statusOf(row)
    if (activeEntity.value === 'plan') {
      if (status === 'draft')
        actions.push({
          key: 'publish',
          label: '发布培训计划',
          icon: 'ri:send-plane-line',
          auth: 'Hr:Talent:Plan:Transition'
        })
      if (status === 'published')
        actions.push(
          {
            key: 'start',
            label: '启动培训计划',
            icon: 'ri:play-circle-line',
            auth: 'Hr:Talent:Plan:Transition'
          },
          {
            key: 'cancel',
            label: '取消培训计划',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Talent:Plan:Transition'
          }
        )
      if (status === 'in_progress')
        actions.push(
          {
            key: 'complete',
            label: '完成培训计划',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:Talent:Plan:Transition'
          },
          {
            key: 'cancel',
            label: '取消培训计划',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Talent:Plan:Transition'
          }
        )
    }
    if (activeEntity.value === 'course') {
      if (status === 'draft')
        actions.push({
          key: 'publish',
          label: '发布课程',
          icon: 'ri:send-plane-line',
          auth: 'Hr:Talent:Course:Publish'
        })
      if (status === 'published')
        actions.push({
          key: 'retire',
          label: '停用课程',
          icon: 'ri:stop-circle-line',
          auth: 'Hr:Talent:Course:Publish'
        })
    }
    if (activeEntity.value === 'session') {
      if (status === 'planned')
        actions.push(
          {
            key: 'open',
            label: '开放培训班次',
            icon: 'ri:door-open-line',
            auth: 'Hr:Talent:Session:Transition'
          },
          {
            key: 'cancel',
            label: '取消培训班次',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Talent:Session:Transition'
          }
        )
      if (status === 'open')
        actions.push(
          {
            key: 'start',
            label: '开始培训班次',
            icon: 'ri:play-circle-line',
            auth: 'Hr:Talent:Session:Transition'
          },
          {
            key: 'cancel',
            label: '取消培训班次',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Talent:Session:Transition'
          }
        )
      if (status === 'in_progress')
        actions.push(
          {
            key: 'complete',
            label: '完成培训班次',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:Talent:Session:Transition'
          },
          {
            key: 'cancel',
            label: '取消培训班次',
            icon: 'ri:close-circle-line',
            auth: 'Hr:Talent:Session:Transition'
          }
        )
    }
    if (activeEntity.value === 'enrollment' && ['enrolled', 'attending'].includes(status))
      actions.push(
        ...(status === 'enrolled'
          ? [
              {
                key: 'attend',
                label: '开始学习',
                icon: 'ri:play-circle-line',
                auth: 'Hr:Talent:Enrollment:Manage'
              }
            ]
          : []),
        {
          key: 'result',
          label: '登记学习结果',
          icon: 'ri:file-list-3-line',
          auth: 'Hr:Talent:Enrollment:Manage'
        },
        {
          key: 'withdraw',
          label: '退出培训',
          icon: 'ri:logout-box-r-line',
          auth: 'Hr:Talent:Enrollment:Manage'
        }
      )
    if (activeEntity.value === 'certificate' && status === 'valid')
      actions.push({
        key: 'revoke',
        label: '撤销证书',
        icon: 'ri:close-circle-line',
        color: 'var(--el-color-danger)',
        auth: 'Hr:Talent:Certificate:Manage'
      })
    return actions
  }

  const handleMoreAction = async (item: ButtonMoreItem, row: RecordItem): Promise<void> => {
    if (item.key === 'delete') return await handleDelete(row)
    if (item.key === 'result') return handleLearningResult(row as Api.Hr.LearningEnrollment)
    if (
      [
        'publish',
        'start',
        'cancel',
        'complete',
        'retire',
        'open',
        'attend',
        'withdraw',
        'revoke'
      ].includes(String(item.key))
    )
      return await handleTransition(row, String(item.key))
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() =>
    activeEntity.value === 'certificate'
      ? []
      : [
          {
            type: 'add',
            label: {
              plan: '新增培养计划',
              course: '新增课程',
              course_competency: '配置能力映射',
              session: '新增培训班次',
              enrollment: '安排员工学习',
              certificate: ''
            }[activeEntity.value],
            permission: permissionFor('add'),
            onClick: () => openDialog(activeEntity.value)
          }
        ]
  )
  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchLearningRecords(activeEntity.value, { ...params, from, to })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async (): Promise<void> => {
    const response = await fetchLearningOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const openDialog = (entity: Entity, row?: RecordItem): void => {
    void dialogRef.value?.handleOpen(entity, row)
  }
  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void refreshOverview()
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    tableTotal.value = 0
  }
  const handleDelete = async (row: RecordItem): Promise<void> => {
    if (!row.id) return
    const entity = activeEntity.value
    const label =
      entity === 'plan'
        ? `${(row as Api.Hr.LearningPlan).planName}（${(row as Api.Hr.LearningPlan).planCode}）`
        : entity === 'course'
          ? `${(row as Api.Hr.LearningCourse).courseName}（${(row as Api.Hr.LearningCourse).courseCode}）`
          : entity === 'session'
            ? (row as Api.Hr.LearningSession).sessionCode
            : entity === 'enrollment'
              ? `${(row as Api.Hr.LearningEnrollment).employee?.name ?? '员工'} · ${(row as Api.Hr.LearningEnrollment).session?.code ?? '培训班次'}`
              : `${(row as Api.Hr.LearningCourseCompetency).course?.name ?? '课程'} · ${(row as Api.Hr.LearningCourseCompetency).competency?.name ?? '能力映射'}`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: permissionFor('delete'),
      remove: () => deleteLearningRecord(entity, row.id!),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
        await refreshOverview()
      }
    })
  }
  const handleLearningResult = async (row: Api.Hr.LearningEnrollment): Promise<void> => {
    if (!row.id) return
    try {
      const result = await promptText('输入“通过”或“未通过”。', '登记学习结果', {
        minLength: 2,
        maxLength: 3,
        placeholder: '通过 / 未通过',
        type: 'info'
      })
      if (!['通过', '未通过'].includes(result)) throw new Error('请准确输入“通过”或“未通过”')
      const attendanceValue = Number(
        await promptText('请输入出勤率（0-100）。', '登记出勤率', {
          minLength: 1,
          maxLength: 5,
          placeholder: '例如 95',
          type: 'info'
        })
      )
      const scoreValue = Number(
        await promptText('请输入考核成绩（0-100），无成绩要求可填 100。', '登记成绩', {
          minLength: 1,
          maxLength: 5,
          placeholder: '例如 88',
          type: 'info'
        })
      )
      if (
        ![attendanceValue, scoreValue].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 100
        )
      )
        throw new Error('出勤率和成绩必须是 0-100 的数字')
      await transitionLearningRecord('enrollment', row.id, result === '通过' ? 'pass' : 'fail', {
        attendancePercent: attendanceValue,
        score: scoreValue,
        comment: '由学习运营台登记最终结果'
      })
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error instanceof Error && error.message && !error.message.includes('cancel'))
        notifyFriendlyError(error, '培养任务操作未完成，请检查状态后重试', 'warning')
    }
  }
  const handleTransition = async (row: RecordItem, action: string): Promise<void> => {
    if (!row.id) return
    try {
      let payload: Record<string, unknown> = {}
      if (action === 'revoke' || action === 'cancel') {
        const comment = await promptText(
          action === 'revoke' ? '请输入证书撤销原因。' : '请输入取消原因。',
          action === 'revoke' ? '撤销学习证书' : '取消学习记录',
          { minLength: 2, maxLength: 300, placeholder: '请输入具体原因', type: 'warning' }
        )
        payload = { comment }
      } else if (activeEntity.value === 'session' && action === 'complete') {
        const costValue = Number(
          await promptText('请输入本班次实际成本。', '完成培训班次', {
            minLength: 1,
            maxLength: 12,
            placeholder: '例如 4800',
            type: 'info'
          })
        )
        if (!Number.isFinite(costValue) || costValue < 0) throw new Error('实际成本必须是非负数字')
        payload = { actualCost: costValue, comment: '培训班次已完成并核算成本' }
      } else
        await confirmAction('确认推进当前学习记录到下一业务状态？', '状态确认', {
          confirmButtonText: '确认',
          cancelButtonText: '返回',
          type: 'info'
        })
      await transitionLearningRecord(activeEntity.value, row.id, action, payload)
      await tableQueryRef.value?.refreshUpdate()
      await refreshOverview()
    } catch (error) {
      if (error instanceof Error && error.message && !error.message.includes('cancel'))
        notifyFriendlyError(error, '培养任务操作未完成，请检查状态后重试', 'warning')
    }
  }

  onMounted(async () => {
    await Promise.all(
      [
        'hrTrainingPlanStatus',
        'hrTrainingType',
        'hrLearningCourseCategory',
        'hrLearningDeliveryMode',
        'hrLearningCourseStatus',
        'hrLearningSessionStatus',
        'hrLearningEnrollmentStatus',
        'hrLearningCertificateStatus',
        'commonCompetencyLevel'
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

  .learning-page {
    @include hr-table-workspace-layout(360px);

    &__control-deck {
      display: grid;
      gap: 14px;
      padding: 18px;
      overflow: hidden;
      background:
        radial-gradient(
          circle at 96% 5%,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 29%
        ),
        var(--default-box-color);
      border: 1px solid var(--art-surface-border);
      border-radius: var(--art-surface-radius);
      box-shadow: var(--art-surface-shadow);
    }

    &__control-heading,
    &__heading-copy {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    &__control-heading {
      justify-content: space-between;
    }

    &__heading-copy {
      min-width: 0;

      > span:last-child {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      strong {
        font-size: 16px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-icon,
    &__journey-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--art-control-radius);
    }

    &__journey-icon {
      width: 40px;
      height: 40px;
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 12%, transparent);

      :deep(.art-svg-icon) {
        font-size: 18px;
      }
    }

    &__governance-badge {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 6px;
      align-items: center;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--el-color-success-dark-2);
      background: color-mix(in srgb, var(--el-color-success) 9%, transparent);
      border: 1px solid color-mix(in srgb, var(--el-color-success) 22%, transparent);
      border-radius: 999px;
    }

    &__journey {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 24px;

      article {
        position: relative;
        display: grid;
        grid-template-columns: 22px 40px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        min-width: 0;
        min-height: 68px;
        padding: 13px 16px;
        background: color-mix(in srgb, var(--default-box-color) 96%, var(--theme-color));
        border: 1px solid var(--art-card-border);
        border-radius: var(--art-surface-radius);
      }

      div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__journey-index {
      font-size: 11px;
      font-weight: 700;
      color: var(--theme-color);
    }

    &__connector {
      position: absolute;
      top: 50%;
      right: -22px;
      z-index: 1;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      font-size: 16px;
      color: var(--theme-color);
      pointer-events: none;
      transform: translateY(-50%);
    }

    &__control-deck :deep(.hr-entity-navigation) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 12px;

      &.is-compact button {
        grid-template-columns: 40px minmax(0, 1fr) 18px;
        gap: 12px;
        min-height: 64px;
        padding: 11px 14px;
      }

      .hr-entity-navigation__icon {
        width: 40px;
        height: 40px;
        border-radius: var(--art-control-radius);

        .art-svg-icon {
          font-size: 19px;
        }
      }

      .hr-entity-navigation__arrow {
        justify-self: end;
      }
    }

    &__control-note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding-top: 12px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--art-card-border);

      :deep(.art-svg-icon) {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--theme-color);
      }
    }

    &__progress {
      display: grid;
      gap: 7px;

      span {
        font-size: 12px;
        color: var(--el-text-color-regular);
      }
    }

    &__actions {
      display: flex;
      gap: 3px;
      align-items: center;
      white-space: nowrap;
    }

    &__warning {
      font-weight: 650;
      color: var(--el-color-warning-dark-2);
    }

    :deep(.art-table-query) {
      min-width: 0;
    }
  }

  @media only screen and (width <= 1599px) {
    .learning-page__control-deck :deep(.hr-entity-navigation) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media only screen and (width <= 1199px) {
    .learning-page {
      &__journey {
        grid-template-columns: repeat(2, minmax(0, 1fr));

        article:nth-child(2) .learning-page__connector {
          display: none;
        }
      }
    }
  }

  @media only screen and (width <= 899px) {
    .learning-page {
      &__control-deck :deep(.hr-entity-navigation) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media only screen and (width <= 767px) {
    .learning-page {
      &__control-deck {
        padding: 14px;
      }

      &__control-heading {
        display: grid;
      }

      &__governance-badge {
        justify-self: start;
      }

      &__journey {
        grid-template-columns: 1fr;

        article .learning-page__connector {
          display: none;
        }
      }

      &__control-deck :deep(.hr-entity-navigation) {
        grid-template-columns: 1fr;

        &.is-compact button {
          min-height: 62px;
        }
      }
    }
  }
</style>
