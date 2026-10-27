<template>
  <ArtPermissionGuard permission="Hr:InternalMobility:View">
    <div class="mobility-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="INTERNAL TALENT MARKETPLACE"
        title="内部人才市场"
        description="统一发布内部岗位、轮岗、项目与短期任务，让员工主动申请、HR 结构化评审，并将永久岗位录用安全移交至正式人事异动。"
        icon="ri:compass-3-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="mobility-page__command" aria-labelledby="mobility-command-title">
        <header>
          <div>
            <span class="mobility-page__command-icon"><ArtSvgIcon icon="ri:route-line" /></span>
            <span>
              <small>CONTROLLED MOBILITY PATH</small>
              <strong id="mobility-command-title">开放机会，公平评估，受控转岗</strong>
              <em>把内部人才流动与外部招聘、继任梯队和正式任职数据分层治理</em>
            </span>
          </div>
          <ElTag :type="overview.closingSoonCount ? 'warning' : 'success'" effect="light" round>
            <ArtSvgIcon
              :icon="overview.closingSoonCount ? 'ri:timer-line' : 'ri:shield-check-line'"
            />
            {{
              overview.closingSoonCount
                ? `${overview.closingSoonCount} 个机会 7 天内截止`
                : '申请窗口运行正常'
            }}
          </ElTag>
        </header>

        <ol class="mobility-page__lifecycle" aria-label="内部人才流动链路">
          <li v-for="(stage, index) in lifecycleStages" :key="stage.label" :class="stage.state">
            <span class="mobility-page__stage-index">0{{ index + 1 }}</span>
            <span class="mobility-page__stage-icon"><ArtSvgIcon :icon="stage.icon" /></span>
            <div
              ><strong>{{ stage.label }}</strong
              ><small>{{ stage.description }}</small></div
            >
            <b>{{ stage.value }}</b>
          </li>
        </ol>

        <div class="mobility-page__guardrails">
          <article>
            <span><ArtSvgIcon icon="ri:eye-2-line" /></span>
            <div
              ><small>机会可见</small><strong>员工自主发现</strong
              ><em>草稿与取消记录不对员工展示</em></div
            >
          </article>
          <article>
            <span><ArtSvgIcon icon="ri:scales-line" /></span>
            <div
              ><small>公平评估</small><strong>分数与依据留痕</strong
              ><em>候选、录用均受容量约束</em></div
            >
          </article>
          <article>
            <span><ArtSvgIcon icon="ri:lock-2-line" /></span>
            <div
              ><small>申请隐私</small><strong>员工只看本人记录</strong
              ><em>评审信息仅授权 HR 可见</em></div
            >
          </article>
          <article class="is-restricted">
            <span><ArtSvgIcon icon="ri:git-pull-request-line" /></span>
            <div
              ><small>任职边界</small><strong>接受不等于生效</strong
              ><em>永久机会转人事异动草稿</em></div
            >
          </article>
        </div>
        <footer>
          <ArtSvgIcon icon="ri:information-line" />
          轮岗、项目和短期任务保留为临时机会记录；只有永久岗位录用可生成正式人事异动，且仍需按异动流程审批与生效。
        </footer>
      </section>

      <section class="mobility-page__workspace" aria-labelledby="mobility-workspace-title">
        <header>
          <div>
            <small>TALENT MARKETPLACE WORKSPACE</small>
            <strong id="mobility-workspace-title">{{ activeTab.label }}</strong>
            <span>{{ activeTab.description }}</span>
          </div>
          <span class="mobility-page__result"
            ><ArtSvgIcon :icon="activeTab.icon" />{{ tableTotal }} 条当前结果</span
          >
        </header>
        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="内部人才市场工作视图"
          compact
          @change="handleTabChange"
        />
        <div
          v-if="activeEntity === 'application' && focusedOpportunity"
          class="mobility-page__focus"
        >
          <span><ArtSvgIcon icon="ri:focus-3-line" /></span>
          <div>
            <small>当前机会申请池</small>
            <strong>{{ focusedOpportunity.opportunityTitle }}</strong>
            <em
              >{{ focusedOpportunity.opportunityCode }} ·
              {{ focusedOpportunity.organizationName }}</em
            >
          </div>
          <ElButton text type="primary" @click="clearOpportunityFocus">查看全部申请</ElButton>
        </div>
        <div
          v-if="!overview.manageAccess && !overview.myEmployeeId"
          class="mobility-page__profile-note"
        >
          <ArtSvgIcon icon="ri:user-settings-line" />
          当前账号尚未关联员工档案，可浏览已开放机会；关联后才能提交本人申请。
        </div>
      </section>

      <ArtTableQuery
        :key="`${activeEntity}-${focusedOpportunity?.id || 'all'}`"
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

      <InternalMobilityDialog ref="dialogRef" @success="handleDialogSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { ElButton, ElProgress, ElTag, type TagProps } from 'element-plus'
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
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import {
    deleteInternalMobilityRecord,
    fetchInternalMobilityOverview,
    fetchInternalMobilityRecords,
    transitionInternalMobility
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import InternalMobilityDialog from './modules/internal-mobility-dialog.vue'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'HrInternalMobility' })
  type Entity = Api.Hr.InternalMobilityEntity
  type RecordItem = Api.Hr.InternalMobilityRecord
  type TableParams = Api.Hr.InternalMobilitySearchParams &
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
      opportunity?: Api.Hr.InternalMobilityOpportunity
      manageAccess?: boolean
    }) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'opportunity',
      label: '内部机会',
      description: '岗位、轮岗、项目与短期任务的开放窗口',
      emptyTitle: '暂无内部机会',
      emptyDescription: '由 HR 创建机会草稿并发布，员工即可在申请窗口内自主申请。',
      icon: 'ri:compass-3-line'
    },
    {
      value: 'application',
      label: '流动申请',
      description: '申请、评审、候选、录用与异动交接',
      emptyTitle: '暂无内部申请',
      emptyDescription: '员工提交申请后，HR 可在这里完成结构化评审和录用决策。',
      icon: 'ri:user-follow-line'
    }
  ]
  const userStore = useUserStore()
  const { isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('opportunity')
  const activeTab = computed(
    () => tabs.find((item) => item.value === activeEntity.value) ?? tabs[0]!
  )
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () =>
      activeEntity.value === 'opportunity'
        ? 'hr_internal_opportunity'
        : 'hr_internal_mobility_application',
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tableTotal = ref(0)
  const focusedOpportunity = ref<Api.Hr.InternalMobilityOpportunity | null>(null)
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.InternalMobilitySearchParams }>({
    searchQuery: { keyword: '', status: '', tenantId: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_internal_mobility_application: 'application',
      hr_internal_opportunity: 'opportunity'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef
  )
  const overview = reactive<Api.Hr.InternalMobilityOverview>({
    openOpportunityCount: 0,
    closingSoonCount: 0,
    applicationCount: 0,
    activeApplicationCount: 0,
    offerCount: 0,
    convertedCount: 0,
    myEmployeeId: null,
    manageAccess: false
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '内部优先流动', type: 'primary', effect: 'plain' },
    { label: '员工自主申请', type: 'success', effect: 'light' },
    { label: '正式异动分层', type: 'warning', effect: 'light' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '开放机会',
      value: overview.openOpportunityCount,
      description: `${overview.closingSoonCount} 个机会 7 天内截止`,
      icon: 'ri:briefcase-4-line',
      tone: overview.openOpportunityCount ? 'primary' : 'info'
    },
    {
      label: overview.manageAccess ? '申请总数' : '我的申请',
      value: overview.applicationCount,
      description: `${overview.activeApplicationCount} 条申请正在推进`,
      icon: 'ri:file-user-line',
      tone: overview.activeApplicationCount ? 'warning' : 'info'
    },
    {
      label: '录用意向',
      value: overview.offerCount,
      description: '已发出、已接受或已转异动',
      icon: 'ri:hand-heart-line',
      tone: overview.offerCount ? 'success' : 'info'
    },
    {
      label: '异动交接',
      value: overview.convertedCount,
      description: '已生成正式人事异动草稿',
      icon: 'ri:git-pull-request-line',
      tone: overview.convertedCount ? 'success' : 'info'
    }
  ])
  const lifecycleStages = computed(() => [
    {
      label: '发现机会',
      description: '透明展示职责、技能与窗口',
      value: `${overview.openOpportunityCount} 个开放`,
      icon: 'ri:compass-discover-line',
      state: overview.openOpportunityCount ? 'is-current' : ''
    },
    {
      label: '员工申请',
      description: '动机、经验与经理知会',
      value: `${overview.applicationCount} 条申请`,
      icon: 'ri:user-shared-line',
      state: overview.applicationCount ? 'is-complete' : ''
    },
    {
      label: '结构化评审',
      description: '评估分数、依据与容量控制',
      value: `${overview.activeApplicationCount} 条推进中`,
      icon: 'ri:survey-line',
      state: overview.activeApplicationCount ? 'is-risk' : ''
    },
    {
      label: '录用与接受',
      description: '员工确认内部机会意向',
      value: `${overview.offerCount} 条意向`,
      icon: 'ri:hand-heart-line',
      state: overview.offerCount ? 'is-current' : ''
    },
    {
      label: '正式交接',
      description: '永久岗位转人事异动草稿',
      value: `${overview.convertedCount} 条已转`,
      icon: 'ri:git-pull-request-line',
      state: overview.convertedCount ? 'is-complete' : ''
    }
  ])

  const labels: Record<string, string> = {
    permanent: '永久岗位',
    rotation: '轮岗机会',
    project: '项目机会',
    gig: '短期任务',
    onsite: '现场',
    hybrid: '混合',
    remote: '远程',
    draft: '草稿',
    open: '开放中',
    paused: '已暂停',
    closed: '已关闭',
    cancelled: '已取消',
    submitted: '已提交',
    under_review: '评审中',
    shortlisted: '候选名单',
    offered: '已发意向',
    accepted: '已接受',
    rejected: '未通过',
    withdrawn: '已撤回',
    converted: '已转异动',
    not_informed: '尚未知会',
    informed: '已知会',
    supported: '明确支持'
  }
  const statusTag = (value?: string | null) => {
    const type: TagProps['type'] = ['open', 'accepted', 'converted', 'supported'].includes(
      value ?? ''
    )
      ? 'success'
      : ['draft', 'paused', 'submitted', 'under_review', 'shortlisted', 'offered'].includes(
            value ?? ''
          )
        ? 'warning'
        : ['rejected', 'cancelled'].includes(value ?? '')
          ? 'danger'
          : 'info'
    return (
      <ElTag type={type} effect="light" round>
        {labels[value ?? ''] ?? value ?? '--'}
      </ElTag>
    )
  }

  const opportunityStatusOptions = useDictionaryOptions('hrMobilityOpportunityStatus')
  const applicationStatusOptions = useDictionaryOptions('hrMobilityApplicationStatus')
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
        options:
          activeEntity.value === 'opportunity'
            ? opportunityStatusOptions
            : applicationStatusOptions,
        props: { clearable: true, placeholder: '全部状态' }
      },
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder:
            activeEntity.value === 'opportunity' ? '机会、组织、岗位或技能' : '员工、机会或工号'
        }
      }
    )
    return items
  })
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() =>
    activeEntity.value === 'opportunity'
      ? [
          {
            type: 'add',
            label: '新增内部机会',
            permission: 'Hr:InternalMobility:Opportunity:Manage',
            onClick: () => openDialog('opportunity')
          }
        ]
      : [
          {
            type: 'add',
            label: '发起内部申请',
            permission: 'Hr:InternalMobility:Application:Self',
            onClick: () => openDialog('application')
          }
        ]
  )
  const columnsFactory = (): ColumnOption<RecordItem>[] =>
    activeEntity.value === 'opportunity' ? opportunityColumns() : applicationColumns()

  const opportunityColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'opportunityTitle',
      label: '内部机会',
      minWidth: 245,
      fixed: 'left',
      link: {
        permission: 'Hr:InternalMobility:Application:Manage',
        disabled: (row) => !(row as Api.Hr.InternalMobilityOpportunity).applicationCount,
        onClick: (row) => focusApplications(row as Api.Hr.InternalMobilityOpportunity)
      },
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityOpportunity
        return (
          <BusinessTableIdentityCell
            primary={item.opportunityTitle}
            secondary={item.opportunityCode}
            tertiary={item.roleSummary}
          />
        )
      }
    },
    {
      prop: 'organizationName',
      label: '目标范围',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityOpportunity
        return (
          <BusinessTableIdentityCell
            primary={item.organizationName}
            secondary={item.positionName || '不限定正式岗位'}
            tertiary={item.hiringManagerName}
          />
        )
      }
    },
    {
      prop: 'opportunityType',
      label: '类型 / 安排',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityOpportunity
        return (
          <div class="mobility-page__tag-stack">
            {statusTag(item.opportunityType)}
            <span>
              {labels[item.workMode]}
              {item.workLocation ? ` · ${item.workLocation}` : ''}
            </span>
          </div>
        )
      }
    },
    {
      prop: 'applicationCloseDate',
      label: '申请窗口',
      minWidth: 176,
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityOpportunity
        const closingSoon =
          item.status === 'open' && dayjs(item.applicationCloseDate).diff(dayjs(), 'day') <= 7
        return (
          <BusinessTableIdentityCell
            primary={`${item.applicationOpenDate} → ${item.applicationCloseDate}`}
            secondary={`预计 ${item.expectedStartDate} 开始`}
            tertiary={closingSoon ? '即将截止' : undefined}
          />
        )
      }
    },
    {
      prop: 'applicationCount',
      label: '申请 / 容量',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityOpportunity
        const accepted = item.acceptedCount ?? 0
        return (
          <div class="mobility-page__capacity">
            <span>
              <strong>{item.applicationCount ?? 0}</strong> 申请 · {accepted} / {item.capacity} 录用
            </span>
            <ElProgress
              percentage={Math.min(100, Math.round((accepted / Math.max(item.capacity, 1)) * 100))}
              stroke-width={7}
              show-text={false}
              status={accepted >= item.capacity ? 'success' : undefined}
            />
          </div>
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 108,
      formatter: (row) => statusTag((row as Api.Hr.InternalMobilityOpportunity).status)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => opportunityActions(row as Api.Hr.InternalMobilityOpportunity)
    }
  ]

  const applicationColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employeeName',
      label: '申请员工',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityApplication
        return (
          <BusinessTableIdentityCell
            primary={item.employeeName}
            secondary={item.employeeNo}
            tertiary={item.currentOrganizationName}
          />
        )
      }
    },
    {
      prop: 'opportunityTitle',
      label: '目标机会',
      minWidth: 220,
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityApplication
        return (
          <BusinessTableIdentityCell
            primary={item.opportunityTitle}
            secondary={item.opportunityCode}
            tertiary={`${item.targetOrganizationName || '--'} · ${item.targetPositionName || labels[item.opportunityType ?? ''] || '临时机会'}`}
          />
        )
      }
    },
    {
      prop: 'currentPositionName',
      label: '当前任职快照',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityApplication
        return (
          <BusinessTableIdentityCell
            primary={item.currentPositionName || '未分配岗位'}
            secondary={item.currentJobTitle || '未维护职务'}
            tertiary={item.currentOrganizationName}
          />
        )
      }
    },
    {
      prop: 'managerAwareness',
      label: '经理知会',
      width: 112,
      formatter: (row) => statusTag((row as Api.Hr.InternalMobilityApplication).managerAwareness)
    },
    {
      prop: 'assessmentScore',
      label: '评审结果',
      minWidth: 150,
      formatter: (row) => {
        const item = row as Api.Hr.InternalMobilityApplication
        return (
          <BusinessTableIdentityCell
            primary={item.assessmentScore == null ? '待评估' : `${item.assessmentScore} 分`}
            secondary={item.assessmentNote || '尚无评估依据'}
          />
        )
      }
    },
    {
      prop: 'status',
      label: '阶段',
      width: 110,
      formatter: (row) => statusTag((row as Api.Hr.InternalMobilityApplication).status)
    },
    {
      prop: 'updateTime',
      label: '最近更新',
      width: 145,
      formatter: (row) =>
        formatTableDateTime((row as Api.Hr.InternalMobilityApplication).updateTime)
    },
    {
      prop: 'action',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => applicationActions(row as Api.Hr.InternalMobilityApplication)
    }
  ]

  const opportunityActions = (row: Api.Hr.InternalMobilityOpportunity) => {
    const actions: ButtonMoreItem[] = []
    if (row.status === 'open' && !row.myApplicationId)
      actions.push({
        key: 'apply',
        label: '申请机会',
        icon: 'ri:user-add-line',
        auth: 'Hr:InternalMobility:Application:Self'
      })
    if (row.applicationCount)
      actions.push({
        key: 'applications',
        label: '查看申请池',
        icon: 'ri:team-line',
        auth: 'Hr:InternalMobility:Application:Manage'
      })
    if (row.status === 'draft')
      actions.push(
        {
          key: 'edit',
          label: '编辑机会',
          icon: 'ri:edit-line',
          auth: 'Hr:InternalMobility:Opportunity:Manage'
        },
        {
          key: 'publish',
          label: '发布机会',
          icon: 'ri:send-plane-line',
          auth: 'Hr:InternalMobility:Publish'
        },
        {
          key: 'cancel',
          label: '取消机会',
          icon: 'ri:close-circle-line',
          auth: 'Hr:InternalMobility:Publish'
        },
        {
          key: 'delete',
          label: '删除草稿',
          icon: 'ri:delete-bin-6-line',
          auth: 'Hr:InternalMobility:Opportunity:Manage',
          color: 'var(--el-color-danger)'
        }
      )
    if (row.status === 'open')
      actions.push(
        {
          key: 'pause',
          label: '暂停申请',
          icon: 'ri:pause-circle-line',
          auth: 'Hr:InternalMobility:Publish'
        },
        {
          key: 'close',
          label: '关闭机会',
          icon: 'ri:stop-circle-line',
          auth: 'Hr:InternalMobility:Publish'
        }
      )
    if (row.status === 'paused')
      actions.push(
        {
          key: 'reopen',
          label: '重新开放',
          icon: 'ri:play-circle-line',
          auth: 'Hr:InternalMobility:Publish'
        },
        {
          key: 'close',
          label: '关闭机会',
          icon: 'ri:stop-circle-line',
          auth: 'Hr:InternalMobility:Publish'
        }
      )
    return actions.length ? (
      <ArtButtonMore list={actions} onClick={(item) => void handleOpportunityMore(item, row)} />
    ) : (
      <span class="mobility-page__locked">{row.myApplicationId ? '已申请' : '无操作'}</span>
    )
  }

  const applicationActions = (row: Api.Hr.InternalMobilityApplication) => {
    const actions: ButtonMoreItem[] = []
    if (row.status === 'draft')
      actions.push(
        {
          key: 'edit',
          label: '编辑申请',
          icon: 'ri:edit-line',
          auth: 'Hr:InternalMobility:Application:Self'
        },
        {
          key: 'submit',
          label: '提交申请',
          icon: 'ri:send-plane-line',
          auth: 'Hr:InternalMobility:Application:Self'
        },
        {
          key: 'delete',
          label: '删除草稿',
          icon: 'ri:delete-bin-6-line',
          auth: 'Hr:InternalMobility:Application:Self',
          color: 'var(--el-color-danger)'
        }
      )
    if (['submitted', 'under_review', 'shortlisted', 'offered'].includes(row.status))
      actions.push({
        key: 'withdraw',
        label: '撤回申请',
        icon: 'ri:arrow-go-back-line',
        auth: 'Hr:InternalMobility:Application:Self',
        color: 'var(--el-color-warning)'
      })
    if (row.status === 'submitted')
      actions.push({
        key: 'review',
        label: '开始评审',
        icon: 'ri:search-eye-line',
        auth: 'Hr:InternalMobility:Application:Manage'
      })
    if (['submitted', 'under_review'].includes(row.status))
      actions.push(
        {
          key: 'shortlist',
          label: '进入候选名单',
          icon: 'ri:user-star-line',
          auth: 'Hr:InternalMobility:Application:Manage'
        },
        {
          key: 'reject',
          label: '未通过',
          icon: 'ri:close-circle-line',
          auth: 'Hr:InternalMobility:Application:Manage',
          color: 'var(--el-color-danger)'
        }
      )
    if (row.status === 'shortlisted')
      actions.push(
        {
          key: 'offer',
          label: '发出录用意向',
          icon: 'ri:hand-heart-line',
          auth: 'Hr:InternalMobility:Application:Manage'
        },
        {
          key: 'reject',
          label: '未通过',
          icon: 'ri:close-circle-line',
          auth: 'Hr:InternalMobility:Application:Manage',
          color: 'var(--el-color-danger)'
        }
      )
    if (row.status === 'offered')
      actions.push({
        key: 'accept',
        label: '接受机会',
        icon: 'ri:checkbox-circle-line',
        auth: 'Hr:InternalMobility:Application:Self'
      })
    if (row.status === 'accepted' && row.opportunityType === 'permanent')
      actions.push({
        key: 'convert',
        label: '转正式人事异动',
        icon: 'ri:git-pull-request-line',
        auth: 'Hr:InternalMobility:Convert'
      })
    return actions.length ? (
      <ArtButtonMore list={actions} onClick={(item) => void handleApplicationMore(item, row)} />
    ) : (
      <span class="mobility-page__locked">{row.personnelChangeId ? '已交接' : '流程结束'}</span>
    )
  }

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const response = await fetchInternalMobilityRecords(activeEntity.value, {
      ...params,
      from,
      to,
      opportunityId: activeEntity.value === 'application' ? focusedOpportunity.value?.id : undefined
    })
    return response
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (_rows, response) => {
    tableTotal.value = response.total ?? 0
  }
  const refreshOverview = async () => {
    const response = await fetchInternalMobilityOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const refreshWorkspace = async () => {
    await Promise.all([refreshOverview(), tableQueryRef.value?.refreshUpdate()])
  }
  const handleTabChange = () => {
    if (activeEntity.value !== 'application') focusedOpportunity.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
    tableTotal.value = 0
  }
  const focusApplications = (row: Api.Hr.InternalMobilityOpportunity) => {
    focusedOpportunity.value = row
    activeEntity.value = 'application'
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }
  const clearOpportunityFocus = () => {
    focusedOpportunity.value = null
    Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  }
  const openDialog = (
    entity: Entity,
    row?: RecordItem,
    opportunity?: Api.Hr.InternalMobilityOpportunity
  ) => {
    void dialogRef.value?.handleOpen({
      entity,
      type: row ? 'edit' : 'add',
      editData: row,
      opportunity,
      manageAccess: overview.manageAccess
    })
  }
  const handleDialogSuccess = async (_entity: Entity, type: DialogType) => {
    if (type === 'add') await tableQueryRef.value?.refreshCreate()
    else await tableQueryRef.value?.refreshUpdate()
    await refreshOverview()
  }
  const handleOpportunityMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.InternalMobilityOpportunity
  ) => {
    if (item.key === 'apply') return openDialog('application', undefined, row)
    if (item.key === 'applications') return focusApplications(row)
    if (item.key === 'edit') return openDialog('opportunity', row)
    if (item.key === 'delete') return handleDelete('opportunity', row)
    await handleOpportunityTransition(row, String(item.key))
  }
  const handleApplicationMore = async (
    item: ButtonMoreItem,
    row: Api.Hr.InternalMobilityApplication
  ) => {
    if (item.key === 'edit') return openDialog('application', row)
    if (item.key === 'delete') return handleDelete('application', row)
    await handleApplicationTransition(row, String(item.key))
  }
  const handleOpportunityTransition = async (
    row: Api.Hr.InternalMobilityOpportunity,
    action: string
  ) => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (['pause', 'close', 'cancel'].includes(action))
        comment = await promptText(
          action === 'close' ? '请输入关闭原因与未完成申请处理安排。' : '请输入本次操作说明。',
          action === 'pause'
            ? '暂停内部机会'
            : action === 'close'
              ? '关闭内部机会'
              : '取消内部机会',
          {
            confirmButtonText: '确认执行',
            cancelButtonText: '返回',
            placeholder: '请输入操作说明',
            minLength: action === 'close' ? 4 : 1,
            maxLength: 600,
            type: 'warning'
          }
        )
      else
        await confirmAction(
          action === 'publish'
            ? '发布后员工可在申请窗口内看到并申请，机会内容将锁定。确认发布？'
            : '确认重新开放该内部机会？',
          action === 'publish' ? '发布内部机会' : '重新开放内部机会',
          { confirmButtonText: '确认', cancelButtonText: '返回', type: 'info' }
        )
      await transitionInternalMobility('opportunity', row.id, action, comment)
      await refreshWorkspace()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '内部机会处理失败，请刷新状态后重试')
    }
  }
  const handleApplicationTransition = async (
    row: Api.Hr.InternalMobilityApplication,
    action: string
  ) => {
    if (!row.id) return
    try {
      let comment: string | undefined
      let score: number | undefined
      if (action === 'shortlist') {
        const scoreText = await promptText('请输入 0-100 的结构化评估分数。', '评估分数', {
          confirmButtonText: '下一步',
          cancelButtonText: '返回',
          placeholder: '例如：85',
          minLength: 1,
          maxLength: 3,
          type: 'info'
        })
        score = Number(scoreText)
        if (!Number.isFinite(score) || score < 0 || score > 100) {
          ElMessage.warning('评估分数必须在 0-100 之间')
          return
        }
        comment = await promptText('请记录进入候选名单的能力证据与评估依据。', '候选名单依据', {
          confirmButtonText: '确认入选',
          cancelButtonText: '返回',
          placeholder: '请输入评估依据',
          minLength: 4,
          maxLength: 1200,
          type: 'info'
        })
      } else if (['withdraw', 'review', 'offer', 'reject'].includes(action)) {
        comment = await promptText(
          action === 'withdraw'
            ? '请输入撤回原因。'
            : action === 'review'
              ? '可记录初步评审说明。'
              : action === 'offer'
                ? '请输入录用依据与交接要求。'
                : '请输入未通过原因与可反馈建议。',
          action === 'withdraw'
            ? '撤回内部申请'
            : action === 'review'
              ? '开始结构化评审'
              : action === 'offer'
                ? '发出录用意向'
                : '申请未通过',
          {
            confirmButtonText: '确认执行',
            cancelButtonText: '返回',
            placeholder: '请输入说明',
            minLength: action === 'review' ? 0 : 4,
            maxLength: 1200,
            type: action === 'reject' ? 'warning' : 'info'
          }
        )
      } else {
        const messages: Record<string, [string, string]> = {
          submit: ['提交后将进入 HR 评审，申请内容不再允许编辑。确认提交？', '提交内部申请'],
          accept: [
            '接受机会不会立即改变任职信息；永久岗位仍需正式人事异动。确认接受？',
            '接受内部机会'
          ],
          convert: [
            '系统将生成正式人事异动草稿，不会直接生效任职变更。确认继续？',
            '转正式人事异动'
          ]
        }
        const [message, title] = messages[action] ?? ['确认执行该操作？', '确认操作']
        await confirmAction(message, title, {
          confirmButtonText: '确认',
          cancelButtonText: '返回',
          type: 'info'
        })
      }
      await transitionInternalMobility('application', row.id, action, comment, score)
      await refreshWorkspace()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '内部申请处理失败，请刷新状态后重试')
    }
  }
  const handleDelete = async (kind: Entity, row: RecordItem) => {
    if (!row.id) return
    const label =
      kind === 'opportunity'
        ? `${(row as Api.Hr.InternalMobilityOpportunity).opportunityTitle}（${(row as Api.Hr.InternalMobilityOpportunity).opportunityCode}）`
        : `${(row as Api.Hr.InternalMobilityApplication).employeeName ?? '我的申请'} · ${(row as Api.Hr.InternalMobilityApplication).opportunityTitle ?? '内部机会'}`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission:
        kind === 'opportunity'
          ? 'Hr:InternalMobility:Opportunity:Manage'
          : 'Hr:InternalMobility:Application:Self',
      confirmMessage: `确认删除“${label}”？仅未进入流程的草稿可以删除。`,
      remove: () => deleteInternalMobilityRecord(kind, row.id!),
      onDeleted: refreshWorkspace
    })
  }
  onMounted(async () => {
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

  .mobility-page {
    @include hr-table-workspace-layout(420px);

    --mobility-border: color-mix(in srgb, var(--art-card-border) 84%, transparent);

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
      border: 1px solid var(--mobility-border);
      border-radius: var(--art-surface-radius);
      box-shadow: 0 8px 28px rgb(37 42 62 / 3%);
    }

    &__command > header,
    &__workspace > header {
      min-width: 0;
    }

    &__command {
      overflow: hidden;
      background:
        radial-gradient(
          circle at 100% 0%,
          color-mix(in srgb, var(--theme-color) 7%, transparent),
          transparent 30%
        ),
        var(--art-bg-color);

      > header {
        display: flex;
        gap: 16px;
        align-items: center;
        justify-content: space-between;

        > div {
          display: flex;
          gap: 12px;
          align-items: center;
          min-width: 0;

          > span:last-child {
            display: grid;
            min-width: 0;
          }
        }

        small,
        strong,
        em {
          display: block;
        }

        small {
          font-size: 10px;
          font-weight: 700;
          color: var(--theme-color);
          letter-spacing: 0.13em;
        }

        strong {
          margin-top: 2px;
          font-size: 16px;
          color: var(--el-text-color-primary);
        }

        em {
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          font-style: normal;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }
      }

      > footer {
        display: flex;
        gap: 7px;
        align-items: flex-start;
        padding-top: 12px;
        margin-top: 14px;
        font-size: 11px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
        border-top: 1px solid var(--mobility-border);

        svg {
          flex: 0 0 auto;
          margin-top: 2px;
          color: var(--theme-color);
        }
      }
    }

    &__command-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 18px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--art-surface-radius);
    }

    &__lifecycle {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0;
      padding: 0;
      margin: 16px 0 0;
      overflow: hidden;
      list-style: none;
      border: 1px solid var(--mobility-border);
      border-radius: var(--art-surface-radius);

      li {
        position: relative;
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        min-width: 0;
        padding: 12px;
        background: color-mix(in srgb, var(--art-bg-color) 96%, var(--theme-color));
        border-right: 1px solid var(--mobility-border);

        &:last-child {
          border-right: 0;
        }

        &.is-current {
          background: color-mix(in srgb, var(--theme-color) 7%, var(--art-bg-color));
        }

        &.is-complete .mobility-page__stage-icon {
          color: var(--el-color-success);
          background: var(--el-color-success-light-9);
        }

        &.is-risk .mobility-page__stage-icon {
          color: var(--el-color-warning);
          background: var(--el-color-warning-light-9);
        }

        div {
          min-width: 0;
        }

        strong,
        small,
        b {
          display: block;
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
          margin-top: -2px;
          font-size: 10px;
          font-weight: 600;
          color: var(--theme-color);
        }
      }
    }

    &__stage-index {
      position: absolute;
      top: 6px;
      right: 8px;
      font-size: 9px;
      color: var(--el-text-color-secondary);
    }

    &__stage-icon {
      display: grid;
      grid-row: 1 / span 2;
      place-items: center;
      width: 28px;
      height: 28px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, transparent);
      border-radius: var(--art-surface-radius);
    }

    &__guardrails {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;

      article {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 9px;
        align-items: center;
        min-width: 0;
        padding: 10px 11px;
        background: var(--art-gray-50);
        border: 1px solid var(--mobility-border);
        border-radius: var(--art-surface-radius);

        > span {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, transparent);
          border-radius: var(--art-surface-radius);
        }

        div {
          display: grid;
          min-width: 0;
        }

        small,
        strong,
        em {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        small {
          font-size: 9px;
          color: var(--el-text-color-secondary);
        }

        strong {
          margin-top: 1px;
          font-size: 12px;
          color: var(--el-text-color-primary);
        }

        em {
          margin-top: 2px;
          font-size: 10px;
          font-style: normal;
          color: var(--el-text-color-secondary);
        }

        &.is-restricted > span {
          color: var(--el-color-warning);
          background: var(--el-color-warning-light-9);
        }
      }
    }

    &__workspace {
      display: grid;
      gap: 12px;
      padding-block: 14px;

      > header {
        display: flex;
        gap: 16px;
        align-items: center;
        justify-content: space-between;

        > div {
          display: grid;
          min-width: 0;
        }

        small {
          font-size: 9px;
          font-weight: 700;
          color: var(--theme-color);
          letter-spacing: 0.12em;
        }

        strong {
          margin-top: 1px;
          font-size: 15px;
          color: var(--el-text-color-primary);
        }

        span {
          margin-top: 2px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__result {
      display: inline-flex !important;
      flex: 0 0 auto;
      gap: 6px;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      margin: 0 !important;
      font-size: 11px !important;
      color: var(--el-text-color-secondary) !important;
      background: var(--art-gray-100);
      border-radius: 999px;
    }

    &__focus,
    &__profile-note {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--theme-color) 5%, var(--art-bg-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 16%, var(--mobility-border));
      border-radius: var(--art-surface-radius);
    }

    &__focus {
      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 32px;
        height: 32px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, transparent);
        border-radius: var(--art-surface-radius);
      }

      > div {
        display: grid;
        min-width: 0;
        margin-right: auto;
      }

      small {
        font-size: 9px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      em {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        font-style: normal;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__profile-note {
      font-size: 11px;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border-color: var(--el-color-warning-light-7);
    }

    &__tag-stack {
      display: grid;
      gap: 6px;
      justify-items: start;

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__capacity {
      min-width: 150px;

      span {
        display: block;
        margin-bottom: 7px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }
    }

    &__locked {
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }
  }

  @media only screen and (width <= 1180px) {
    .mobility-page {
      &__lifecycle {
        grid-template-columns: repeat(3, minmax(0, 1fr));

        li {
          border-bottom: 1px solid var(--mobility-border);

          &:nth-child(3) {
            border-right: 0;
          }

          &:nth-child(n + 4) {
            border-bottom: 0;
          }
        }
      }

      &__guardrails {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media only screen and (width <= 767px) {
    .mobility-page {
      &__command > header,
      &__workspace > header {
        align-items: flex-start;
      }

      &__command > header {
        flex-direction: column;
      }

      &__lifecycle {
        grid-template-columns: 1fr;

        li {
          border-right: 0;
          border-bottom: 1px solid var(--mobility-border) !important;

          &:last-child {
            border-bottom: 0 !important;
          }
        }
      }

      &__guardrails {
        grid-template-columns: 1fr;
      }

      &__focus {
        flex-wrap: wrap;

        .el-button {
          width: 100%;
        }
      }
    }
  }
</style>
