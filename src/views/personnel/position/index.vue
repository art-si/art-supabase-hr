<template>
  <ArtPermissionGuard permission="Hr:Position:View">
    <div class="position-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="false" />
      <BusinessWorkspaceHeader
        eyebrow="POSITION CATALOG"
        title="岗位管理"
        description="按组织维护具体编制岗位；每个岗位关联标准职务、职级与任职人数规则。"
        icon="ri:briefcase-4-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableQueryRef" />
        </template>
      </BusinessWorkspaceHeader>

      <div class="position-page__workspace">
        <ArtWorkspaceSplitter :breakpoint="1200" narrow-mode="hide">
          <template #primary>
            <aside v-if="isDesktopOrganizationLayout" class="position-page__organization-panel">
              <OrganizationScopeFilter
                scope-type="position"
                :data="organizationTree"
                :loading="organizationFilterLoading"
                :selected-key="selectedOrganizationKey"
                :include-descendants="includeDescendantOrganizations"
                :global-scope="isAllTenants"
                @select="handleOrganizationSelect"
                @refresh="loadOrganizationTree"
                @update:include-descendants="handleIncludeDescendantsChange"
              />
            </aside>
          </template>

          <div class="position-page__table-workspace">
            <section
              v-if="!isDesktopOrganizationLayout"
              class="position-page__mobile-scope art-card-xs"
            >
              <span aria-hidden="true"><ArtSvgIcon icon="ri:node-tree" /></span>
              <div>
                <small>当前组织范围</small>
                <strong>
                  <ArtTooltip
                    v-if="selectedOrganization"
                    :content="selectedOrganizationLabel"
                    trigger="click"
                    placement="top-start"
                  >
                    <button
                      type="button"
                      class="block w-full cursor-pointer truncate text-left"
                      :title="selectedOrganizationLabel"
                    >
                      {{ selectedOrganizationLabel }}
                    </button>
                  </ArtTooltip>
                  <template v-else>{{ selectedOrganizationLabel }}</template>
                </strong>
              </div>
              <ElButton type="primary" plain @click="openOrganizationDrawer">
                <ArtSvgIcon icon="ri:filter-3-line" />组织筛选
              </ElButton>
            </section>

            <ArtTableQuery
              ref="tableQueryRef"
              v-model="tableState.searchQuery"
              :search-items="searchItems"
              :api-fn="fetchTableData"
              :response-adapter="responseAdapter"
              :columns-factory="columnsFactory"
              :header-actions="headerActions"
              header-actions-placement="workspace"
              :search-bar-props="{ span: 8, labelWidth: 72, showExpand: false }"
              :table-props="{
                rowKey: 'id',
                tableLayout: 'fixed',
                emptyText: hasAppliedFilters ? '没有符合条件的岗位' : '暂无岗位',
                emptyDescription: tableEmptyDescription
              }"
              :on-success="handleTableSuccess"
              focusable
              focus-scope-selector=".position-page__workspace"
            />
          </div>
        </ArtWorkspaceSplitter>
      </div>

      <ArtDrawer ref="organizationDrawerRef">
        <OrganizationScopeFilter
          scope-type="position"
          class="position-page__drawer-filter"
          :data="organizationTree"
          :loading="organizationFilterLoading"
          :selected-key="selectedOrganizationKey"
          :include-descendants="includeDescendantOrganizations"
          :global-scope="isAllTenants"
          @select="handleOrganizationSelect"
          @refresh="loadOrganizationTree"
          @update:include-descendants="handleIncludeDescendantsChange"
        />
      </ArtDrawer>

      <PositionDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { ElMessage, ElTag } from 'element-plus'
  import { useMediaQuery } from '@vueuse/core'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import {
    DeleteReferenceBlockedError,
    getDeleteReferenceContext
  } from '@/utils/supabase/delete-reference'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtTooltip from '@/components/core/feedback/art-tooltip/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import OrganizationScopeFilter from '@/views/system/shared/organization-scope-filter.vue'
  import { ColumnOption, DialogType } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ApiResponse } from '@/utils/table/table-cache'
  import { defaultResponseAdapter } from '@/utils/table/table-utils'
  import { formatWithDayjs } from '@/utils/time'
  import TreeUtils from '@/utils/tree'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { deletePosition, fetchPositionList, fetchPositionOrganizationTree } from '@hr/api'
  import PositionDialog from './modules/position-dialog.vue'

  defineOptions({ name: 'HrPosition' })

  type Position = Api.Hr.Position
  type SearchParams = Api.Hr.PositionSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>
  type TableResult = Awaited<ReturnType<typeof fetchPositionList>> & { hasFilters: boolean }
  type TableResponse = ApiResponse<Position> & { hasFilters: boolean }
  type Organization = Api.SystemManage.OrganizationScopeFilterItem

  interface PositionDialogDefaults {
    organizationId?: string
  }

  interface PositionDialogExpose {
    handleOpen: (row?: Position, defaults?: PositionDialogDefaults) => Promise<void>
  }

  interface PositionOverviewRow {
    enabled: boolean
    employeeCount: number
  }

  const ALL_ORGANIZATIONS_KEY = '__all_organizations__'
  const { confirmDelete } = useArtFeedback()
  const { hasAuth } = useAuth()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard('mdm_position', '岗位')
  const deleteBusy = ref(false)
  const userStore = useUserStore()
  const { isPlatformSuper } = storeToRefs(userStore)
  const { effectiveTenantId, isAllTenants } = storeToRefs(useTenantScopeStore())
  const organizationTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<PositionDialogExpose>()
  const organizationDrawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const isDesktopOrganizationLayout = useMediaQuery('(min-width: 1201px)')
  const organizationTree = ref<Organization[]>([])
  const organizationFilterLoading = ref(false)
  const selectedOrganizationKey = ref(ALL_ORGANIZATIONS_KEY)
  const includeDescendantOrganizations = ref(true)
  const selectedTenantId = computed(() => effectiveTenantId.value ?? '')
  const overview = reactive<{ total: number; rows: PositionOverviewRow[] }>({ total: 0, rows: [] })
  const hasAppliedFilters = ref(false)
  const tableState = reactive<{ searchQuery: SearchParams }>({
    searchQuery: { enabled: undefined, keyword: '' }
  })

  const selectedOrganization = computed(() =>
    selectedOrganizationKey.value === ALL_ORGANIZATIONS_KEY
      ? null
      : organizationTreeUtils.findNode(organizationTree.value, selectedOrganizationKey.value)
  )
  const selectedOrganizationLabel = computed(() =>
    selectedOrganizationKey.value === ALL_ORGANIZATIONS_KEY
      ? '全部岗位'
      : (selectedOrganization.value?.organizationName ?? '全部岗位')
  )
  const selectedOrganizationIds = computed(() => {
    const organization = selectedOrganization.value
    if (!organization?.id) return []
    if (!includeDescendantOrganizations.value) return [organization.id]
    return organizationTreeUtils
      .getDescendants(organizationTree.value, organization.id, true)
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id))
  })
  const tableEmptyDescription = computed(() => {
    if (hasAppliedFilters.value) return '可调整岗位状态或关键字后再查询。'
    if (!hasAuth('Hr:Position:Add')) return '可切换组织范围后再查询。'
    return selectedOrganization.value
      ? '可新增岗位，或切换组织范围后再查询。'
      : '请先维护职务体系，再为组织新增具体岗位。'
  })
  const enabledPositionCount = computed(
    () => overview.rows.filter((position) => position.enabled).length
  )
  const employeeCount = computed(() =>
    overview.rows.reduce((total, position) => total + Number(position.employeeCount ?? 0), 0)
  )
  const enabledOptions = useDictionaryOptions('commonBoolean', (value) => value === 'true')
  const booleanOptions = computed(() =>
    enabledOptions.map((item) => ({
      ...item,
      label: item.value ? '启用' : '停用'
    }))
  )
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '组织树筛选', type: 'primary', effect: 'plain' },
    { label: '标准职务关联', type: 'success', effect: 'light' },
    { label: '任职人数控制', type: 'info', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前结果',
      value: overview.total,
      description: selectedOrganizationLabel.value,
      icon: 'ri:briefcase-4-line'
    },
    {
      label: '本页启用',
      value: enabledPositionCount.value,
      description: '可用于员工任职',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '本页在岗员工',
      value: employeeCount.value,
      description: '按岗位人数汇总',
      icon: 'ri:team-line',
      tone: 'info'
    }
  ])

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '状态',
      key: 'enabled',
      type: 'select',
      props: { options: booleanOptions.value, clearable: true }
    },
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '岗位编码、名称或说明' }
    }
  ])

  const columnsFactory = (): ColumnOption<Position>[] => [
    ...(isPlatformSuper.value && !selectedTenantId.value
      ? [
          {
            prop: 'tenant.tenantName',
            label: '所属租户',
            minWidth: 170,
            showOverflowTooltip: true
          } as ColumnOption<Position>
        ]
      : []),
    {
      prop: 'positionCode',
      label: '岗位编码',
      minWidth: 150,
      showOverflowTooltip: true
    },
    {
      prop: 'positionName',
      label: '岗位名称',
      minWidth: 220,
      formatter: (row) => (
        <BusinessTableIdentityCell
          primary={row.positionName}
          secondary={row.description || '组织任职岗位'}
        />
      )
    },
    {
      prop: 'jobProfile.jobName',
      label: '标准职务',
      minWidth: 160,
      showOverflowTooltip: true,
      formatter: (row) => row.jobProfile?.jobName ?? '—'
    },
    {
      prop: 'grade.gradeName',
      label: '职级',
      width: 112,
      showOverflowTooltip: true,
      formatter: (row) => row.grade?.gradeName ?? '—'
    },
    {
      prop: 'headcountLimit',
      label: '编制上限',
      width: 100,
      align: 'right',
      formatter: (row) => `${row.headcountLimit ?? 1} 人`
    },
    {
      prop: 'employeeCount',
      label: '在岗人数',
      width: 100,
      align: 'right',
      formatter: (row) => (
        <span class="position-page__employee-count">
          <strong>{row.employeeCount ?? 0}</strong>
          <small>人</small>
        </span>
      )
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      formatter: (row) => (
        <ElTag type={row.enabled ? 'success' : 'info'} effect="plain">
          {row.enabled ? '启用' : '停用'}
        </ElTag>
      )
    },
    { prop: 'sort', label: '排序', width: 80, align: 'right' },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 120,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            permission="Hr:Position:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonTable
            type="delete"
            permission="Hr:Position:Delete"
            disabled={deleteBusy.value}
            onClick={() => void handleDelete(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: '新增岗位',
      permission: 'Hr:Position:Add',
      onClick: () => openDialog()
    }
  ])

  const fetchTableData = async (params: TableParams): Promise<TableResult> => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const hasFilters = params.enabled != null || Boolean(params.keyword?.trim())
    const result = await fetchPositionList({
      ...params,
      tenantId: selectedTenantId.value || undefined,
      organizationIds: selectedOrganizationIds.value,
      from,
      to
    })
    return { ...result, hasFilters }
  }

  const responseAdapter = (response: TableResult): TableResponse => ({
    ...defaultResponseAdapter<Position>(response),
    hasFilters: response.hasFilters
  })

  const handleTableSuccess = (rows: Position[], response: TableResponse): void => {
    overview.rows = rows.map((row) => ({
      enabled: Boolean(row.enabled),
      employeeCount: Number(row.employeeCount ?? 0)
    }))
    overview.total = response.total ?? rows.length
    hasAppliedFilters.value = response.hasFilters
  }

  const loadOrganizationTree = async (): Promise<void> => {
    organizationFilterLoading.value = true
    try {
      const response = await fetchPositionOrganizationTree({ tenantId: selectedTenantId.value })
      organizationTree.value = response.data ?? []
      if (
        selectedOrganizationKey.value !== ALL_ORGANIZATIONS_KEY &&
        !organizationTreeUtils.findNode(organizationTree.value, selectedOrganizationKey.value)
      ) {
        selectedOrganizationKey.value = ALL_ORGANIZATIONS_KEY
      }
    } finally {
      organizationFilterLoading.value = false
    }
  }

  const handleOrganizationSelect = (key: string): void => {
    if (selectedOrganizationKey.value === key) {
      organizationDrawerRef.value?.handleClose()
      return
    }
    selectedOrganizationKey.value = key
    organizationDrawerRef.value?.handleClose()
    void tableQueryRef.value?.refreshData()
  }

  const handleIncludeDescendantsChange = (value: boolean): void => {
    includeDescendantOrganizations.value = value
    void tableQueryRef.value?.refreshData()
  }

  const openOrganizationDrawer = (): void => {
    void organizationDrawerRef.value?.handleOpen(
      {},
      {
        title: '组织范围',
        subtitle: '按组织筛选岗位目录',
        size: 'sm',
        showFooter: false,
        contentHeight: 'calc(100vh - 118px)'
      }
    )
  }

  const openDialog = (row?: Position): void => {
    const defaults = row ? undefined : { organizationId: selectedOrganization.value?.id }
    void dialogRef.value?.handleOpen(row, defaults)
  }

  const handleSaveSuccess = (type: DialogType): void => {
    void loadOrganizationTree()
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleDelete = async (row: Position): Promise<void> => {
    if (deleteBusy.value) return
    if (!row.id || !hasAuth('Hr:Position:Delete')) {
      ElMessage.error('当前账号无权删除此岗位，或岗位记录已变化，请刷新后重试')
      return
    }
    const resources = [{ id: row.id, label: `${row.positionName}（${row.positionCode}）` }]
    deleteBusy.value = true
    try {
      if (await inspectDeleteReferences(resources)) return
      await confirmDelete(
        `确认删除岗位“${row.positionName}（${row.positionCode}）”？此操作不可恢复。`
      )
      try {
        await deletePosition(row.id)
      } catch (error) {
        if (await inspectDeleteReferences(resources, getDeleteReferenceContext(error)?.constraint))
          return
        if (error instanceof DeleteReferenceBlockedError) return
        throw error
      }
      ElMessage.success('岗位已删除')
      await Promise.all([loadOrganizationTree(), tableQueryRef.value?.refreshRemove()])
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '岗位删除失败，请检查网络后重试')
    } finally {
      deleteBusy.value = false
    }
  }

  onMounted(async () => {
    await Promise.all([userStore.ensureDictLoaded('commonBoolean'), loadOrganizationTree()])
  })
</script>

<style scoped lang="scss">
  .position-page {
    &__workspace {
      flex: 1;
      width: 100%;
      min-width: 0;
      min-height: 0;
    }

    &__organization-panel {
      min-height: 0;
    }

    &__table-workspace {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      min-height: 0;
    }

    &__mobile-scope {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;

      > span {
        display: inline-flex;
        flex: 0 0 36px;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        display: grid;
        flex: 1;
        min-width: 0;
      }

      small {
        color: var(--el-text-color-secondary);
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &__drawer-filter {
      height: 100%;
    }

    :deep(.position-page__employee-count) {
      display: inline-flex;
      gap: 3px;
      align-items: baseline;
      font-variant-numeric: tabular-nums;

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__actions {
      display: flex;
      align-items: center;
    }
  }
</style>
