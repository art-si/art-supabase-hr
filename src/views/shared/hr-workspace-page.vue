<template>
  <div class="hr-workspace-page business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice :location-ready="locationReady" />
    <BusinessWorkspaceHeader
      class="hr-workspace-page__overview"
      :eyebrow="workspace.eyebrow"
      :title="workspace.title"
      :description="workspace.description"
      :icon="workspace.icon"
      :tags="workspaceTags"
      :metrics="workspaceMetrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <section
      v-if="workspace.tabs.length > 1"
      class="hr-workspace-page__tabs"
      :class="{ 'has-detailed-tabs': hasDetailedTabs }"
    >
      <ElTabs v-model="activeTabKey" @tab-change="handleTabChange">
        <ElTabPane v-for="tab in workspace.tabs" :key="tab.key" :name="tab.key">
          <template #label>
            <span v-if="tab.description" class="hr-workspace-page__tab-label">
              <ArtSvgIcon :icon="tab.icon || workspace.icon" />
              <span>
                <strong>{{ tab.label }}</strong>
                <small>{{ tab.description }}</small>
              </span>
            </span>
            <template v-else>{{ tab.label }}</template>
          </template>
        </ElTabPane>
      </ElTabs>
    </section>

    <ArtTableQuery
      :key="tableKey"
      ref="tableQueryRef"
      v-model="search.model"
      :search-items="search.items"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 8, labelWidth: 74 }"
      :table-props="{
        rowKey: 'id',
        tableLayout: 'fixed',
        emptyText: `暂无${activeTab.label}`,
        emptyDescription: `可调整筛选条件或新增${activeTab.label}。`
      }"
      :on-success="handleTableSuccess"
      focusable
    />

    <PersonnelChangeDialog
      v-if="props.workspaceKey === 'personnelChange'"
      ref="personnelChangeDialogRef"
      @success="handleDialogSuccess"
    />
    <WorkspaceRecordDialog v-else ref="dialogRef" @success="handleDialogSuccess" />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { get } from 'lodash-es'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryApiFn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { useHrMasterDeleteLocation } from './use-hr-master-delete-location'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import {
    DeleteReferenceBlockedError,
    getDeleteReferenceContext
  } from '@/utils/supabase/delete-reference'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    deleteHrWorkspaceRecord,
    getHrWorkspaceRecordTable,
    effectPersonnelChange,
    effectRecruitmentRequisition,
    fetchHrWorkspaceRecords,
    submitHrApproval
  } from '@hr/api'
  import WorkspaceRecordDialog from './workspace-record-dialog.vue'
  import PersonnelChangeDialog from '../personnel/personnel-change/modules/personnel-change-dialog.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import {
    hrWorkspaceDefinitions,
    type HrWorkspaceDefinition,
    type HrWorkspaceKey,
    type HrWorkspaceTab
  } from './workspace-config'

  interface WorkspacePermissions {
    view: string
    add: string
    edit: string
    delete: string
    submit?: string
    effect?: string
  }

  interface WorkspaceRecordDialogExpose {
    handleOpen: (data: {
      workspace: HrWorkspaceDefinition
      tab: HrWorkspaceTab
      record?: Api.Hr.WorkspaceRecord
    }) => Promise<void>
  }

  type TableParams = Api.Hr.WorkspaceSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  const props = defineProps<{ workspaceKey: HrWorkspaceKey; permissions: WorkspacePermissions }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const deleteContext = ref<{ entity: Api.Hr.WorkspaceEntity; label: string }>()
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<WorkspaceRecordDialogExpose>()
  const personnelChangeDialogRef = ref<WorkspaceRecordDialogExpose>()
  const workspace = computed(() => hrWorkspaceDefinitions[props.workspaceKey])
  const activeTabKey = ref(workspace.value.tabs[0].key)
  const activeTab = computed(
    () =>
      workspace.value.tabs.find((tab) => tab.key === activeTabKey.value) ?? workspace.value.tabs[0]
  )
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    () => getHrWorkspaceRecordTable(deleteContext.value?.entity ?? activeTab.value.entity),
    () => deleteContext.value?.label ?? activeTab.value.label
  )
  const tableKey = computed(() => `${props.workspaceKey}-${activeTabKey.value}`)
  const hasDetailedTabs = computed(() => workspace.value.tabs.some((tab) => tab.description))
  const overview = reactive({ total: 0, attention: 0, completed: 0 })

  const search = reactive<{
    model: Api.Hr.WorkspaceSearchParams
    items: ComputedRef<SearchFormItem[]>
  }>({
    model: { keyword: '', status: '' },
    items: computed(() => [
      {
        label: '关键词',
        key: 'keyword',
        type: 'input',
        props: { placeholder: `搜索${activeTab.value.label}`, clearable: true }
      },
      ...(activeTab.value.statusDict
        ? [
            {
              label: '状态',
              key: 'status',
              type: 'select' as const,
              props: {
                options: getDictMap.value[activeTab.value.statusDict] ?? [],
                clearable: true
              }
            }
          ]
        : [])
    ])
  })
  const { locationReady } = useHrMasterDeleteLocation<string>(
    { hr_personnel_change: 'changes' },
    activeTabKey,
    search.model,
    tableQueryRef
  )

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() =>
    workspace.value.tags.map((label, index) => ({
      label,
      type: index === 0 ? 'primary' : index === 1 ? 'success' : 'info',
      effect: index === 0 ? 'plain' : 'light'
    }))
  )
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前结果',
      value: overview.total,
      description: activeTab.value.label,
      icon: 'ri:file-list-3-line'
    },
    {
      label: '本页待关注',
      value: overview.attention,
      description: '审批中、临期或异常',
      icon: 'ri:alarm-warning-line',
      tone: 'warning'
    },
    {
      label: '本页已完成',
      value: overview.completed,
      description: '已生效、完成或通过',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${activeTab.value.label}`,
      permission: props.permissions.add,
      onClick: () => void openDialog()
    }
  ])

  const isAttentionStatus = (status: string): boolean =>
    [
      'pending',
      'expiring',
      'expired',
      'late',
      'early_leave',
      'absent',
      'manager_review',
      'in_progress',
      'interview'
    ].includes(status)
  const isCompletedStatus = (status: string): boolean =>
    [
      'approved',
      'effective',
      'completed',
      'valid',
      'normal',
      'worked',
      'passed',
      'hired',
      'confirmed'
    ].includes(status)
  const getRowStatus = (row: Api.Hr.WorkspaceRecord): string =>
    String(get(row, String(activeTab.value.statusKey ?? 'status')) ?? '')
  const canEditRow = (row: Api.Hr.WorkspaceRecord): boolean =>
    !activeTab.value.approvalBusinessType || ['draft', 'rejected'].includes(getRowStatus(row))

  const openDialog = async (record?: Api.Hr.WorkspaceRecord): Promise<void> => {
    const target =
      props.workspaceKey === 'personnelChange' ? personnelChangeDialogRef.value : dialogRef.value
    await target?.handleOpen({ workspace: workspace.value, tab: activeTab.value, record })
  }

  const handleDelete = async (row: Api.Hr.WorkspaceRecord): Promise<void> => {
    if (!row.id || deleteContext.value) return
    if (!hasAuth(props.permissions.delete)) {
      notifyFriendlyError(new Error('当前账号无权删除此记录'), '当前账号无权删除此记录')
      return
    }
    const tab = activeTab.value
    const identity = get(row, tab.columns[0]?.key ?? '')
    const resources = [
      { id: row.id, label: typeof identity === 'string' && identity ? identity : tab.label }
    ]
    deleteContext.value = { entity: tab.entity, label: tab.label }
    try {
      if (await inspectDeleteReferences(resources)) return
      await confirmAction(
        `确定删除“${resources[0]!.label}”吗？删除后无法恢复。`,
        `删除${tab.label}`,
        {
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonType: 'danger'
        }
      )
      try {
        await deleteHrWorkspaceRecord(tab.entity, row.id)
      } catch (error) {
        if (await inspectDeleteReferences(resources, getDeleteReferenceContext(error)?.constraint))
          return
        if (error instanceof DeleteReferenceBlockedError) return
        throw error
      }
      void tableQueryRef.value?.refreshRemove()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '记录删除失败，请刷新资料后重试')
    } finally {
      deleteContext.value = undefined
    }
  }

  const handleSubmitApproval = async (row: Api.Hr.WorkspaceRecord): Promise<void> => {
    if (!row.id || !activeTab.value.approvalBusinessType) return
    await submitHrApproval(activeTab.value.approvalBusinessType, row.id)
    void tableQueryRef.value?.refreshUpdate()
  }

  const handleEffect = async (row: Api.Hr.WorkspaceRecord): Promise<void> => {
    if (!row.id) return
    if (activeTab.value.approvalBusinessType === 'hr_recruitment_requisition') {
      await effectRecruitmentRequisition(row.id)
    } else {
      await effectPersonnelChange(row.id)
    }
    void tableQueryRef.value?.refreshUpdate()
  }

  const columnsFactory = (): ColumnOption<Api.Hr.WorkspaceRecord>[] => [
    ...activeTab.value.columns.map((column) => ({
      prop: String(column.key),
      label: column.label,
      minWidth: column.minWidth,
      width: column.width,
      showOverflowTooltip: true,
      formatter: (row: Api.Hr.WorkspaceRecord) => {
        const value = get(row, String(column.key))
        if (column.secondaryKey || column.tertiaryKey)
          return (
            <BusinessTableIdentityCell
              primary={value == null ? undefined : String(value)}
              secondary={String(get(row, String(column.secondaryKey)) ?? '')}
              tertiary={String(get(row, String(column.tertiaryKey)) ?? '')}
            />
          )
        if (column.dictCode)
          return (
            <ArtDictDisplay dictCode={column.dictCode} value={String(value ?? '')} display="auto" />
          )
        if (column.dateTime && value) return formatWithDayjs(String(value), 'YYYY-MM-DD HH:mm')
        return `${value ?? '—'}${value !== null && value !== undefined && column.suffix ? column.suffix : ''}`
      }
    })),
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row: Api.Hr.WorkspaceRecord) => (
        <BusinessTableRowActions>
          {canEditRow(row) && (
            <ArtButtonTable
              type="edit"
              permission={props.permissions.edit}
              onClick={() => void openDialog(row)}
            />
          )}
          <ArtButtonMore
            list={() => rowMoreActions(row)}
            onClick={(item: ButtonMoreItem) => void handleRowMoreAction(item, row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const rowMoreActions = (row: Api.Hr.WorkspaceRecord): ButtonMoreItem[] => {
    const actions: ButtonMoreItem[] = []
    if (canEditRow(row)) {
      actions.push({
        key: 'delete',
        label: `删除${activeTab.value.label}`,
        icon: 'ri:delete-bin-5-line',
        color: 'var(--el-color-danger)',
        auth: props.permissions.delete
      })
    }
    if (
      activeTab.value.approvalBusinessType &&
      ['draft', 'rejected'].includes(getRowStatus(row)) &&
      props.permissions.submit
    ) {
      actions.unshift({
        key: 'submit',
        label: '提交审批',
        icon: 'ri:send-plane-line',
        auth: props.permissions.submit
      })
    }
    if (activeTab.value.canEffect && getRowStatus(row) === 'approved' && props.permissions.effect) {
      actions.unshift({
        key: 'effect',
        label: '确认生效',
        icon: 'ri:checkbox-circle-line',
        auth: props.permissions.effect
      })
    }
    return actions
  }

  const handleRowMoreAction = async (
    item: ButtonMoreItem,
    row: Api.Hr.WorkspaceRecord
  ): Promise<void> => {
    if (item.key === 'delete') await handleDelete(row)
    if (item.key === 'submit') await handleSubmitApproval(row)
    if (item.key === 'effect') await handleEffect(row)
  }

  const fetchTableData: ArtTableQueryApiFn = async (params) => {
    const { from, to } = buildSupabasePageRange(params as TableParams)
    const result = await fetchHrWorkspaceRecords(activeTab.value.entity, { ...params, from, to })
    if (result.error) throw result.error
    return result
  }

  const handleTableSuccess = (
    data: Api.Hr.WorkspaceRecord[],
    response: { total?: number }
  ): void => {
    overview.total = response.total ?? data.length
    const statuses = data.map(getRowStatus)
    overview.attention = statuses.filter(isAttentionStatus).length
    overview.completed = statuses.filter(isCompletedStatus).length
  }

  const handleTabChange = (): void => {
    Object.assign(search.model, { keyword: '', status: '' })
    Object.assign(overview, { total: 0, attention: 0, completed: 0 })
  }

  const handleDialogSuccess = (): void => {
    void tableQueryRef.value?.refreshData()
  }

  onMounted(async () => {
    const codes = new Set<string>(['commonBoolean'])
    workspace.value.tabs.forEach((tab) => {
      if (tab.statusDict) codes.add(tab.statusDict)
      tab.columns.forEach((column) => column.dictCode && codes.add(column.dictCode))
      tab.fields.forEach((field) => field.dictCode && codes.add(field.dictCode))
    })
    await Promise.all([...codes].map((code) => userStore.ensureDictLoaded(code)))
  })
</script>

<style scoped lang="scss">
  @use './hr-table-workspace-layout' as *;

  .hr-workspace-page {
    @include hr-table-workspace-layout(360px);

    &__tabs {
      min-width: 0;
      padding-inline: 8px;

      :deep(.el-tabs__header) {
        margin: 0;
      }

      &.has-detailed-tabs {
        padding-inline: 0;

        :deep(.el-tabs__nav-wrap) {
          padding-inline: 0;

          &::after {
            height: 1px;
            background-color: var(--el-border-color-lighter);
          }
        }

        :deep(.el-tabs__item) {
          height: 64px;
          padding-inline: 18px;
          color: var(--art-gray-600);

          &:hover,
          &.is-active {
            color: var(--theme-color);
          }

          &:focus-visible {
            outline: 2px solid color-mix(in srgb, var(--theme-color) 34%, transparent);
            outline-offset: -4px;
            border-radius: var(--el-border-radius-small);
          }
        }

        :deep(.el-tabs__item.is-top:nth-child(2)) {
          padding-left: 0;
        }

        :deep(.el-tabs__active-bar) {
          height: 3px;
          border-radius: 999px 999px 0 0;
        }

        :deep(.el-tabs__nav-next),
        :deep(.el-tabs__nav-prev) {
          display: grid;
          place-items: center;
          width: 32px;
          height: 64px;
          color: var(--art-gray-700);
          background: var(--default-box-color);
        }
      }
    }

    &__tab-label {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;

      > svg {
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
      }

      > span {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.25;
      }

      strong {
        font-size: 14px;
        font-weight: 600;
      }

      small {
        max-width: 224px;
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        font-weight: 400;
        color: var(--art-gray-500);
        white-space: nowrap;
      }
    }

    :deep(.art-table-query) {
      flex: 1;
    }

    @media (width <= 860px) {
      &__tabs.has-detailed-tabs :deep(.el-tabs__item) {
        height: 52px;
        padding-inline: 12px;
      }

      &__tab-label small {
        display: none;
      }

      &__tabs.has-detailed-tabs :deep(.el-tabs__nav-next),
      &__tabs.has-detailed-tabs :deep(.el-tabs__nav-prev) {
        height: 52px;
      }
    }
  }
</style>
