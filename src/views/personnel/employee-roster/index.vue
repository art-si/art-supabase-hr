<template>
  <div class="hr-roster-page business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      action-hint="请核对关联员工的任职记录，处理完成后返回原页面重新检查。"
    />
    <BusinessWorkspaceHeader
      class="hr-roster-page__overview"
      eyebrow="PEOPLE DIRECTORY"
      title="员工花名册"
      description="按组织维护员工身份、任职状态与完整人事履历，并衔接系统账号开通。"
      icon="ri:contacts-book-3-line"
      :tags="workspaceTags"
      :metrics="workspaceMetrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <div class="hr-roster-page__workspace">
      <ArtWorkspaceSplitter :breakpoint="1200" narrow-mode="hide">
        <template #primary>
          <aside v-if="isDesktopOrganizationLayout" class="hr-roster-page__organization-panel">
            <OrganizationScopeFilter
              scope-type="employee"
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
        <div class="hr-roster-page__table-workspace">
          <section
            v-if="!isDesktopOrganizationLayout"
            class="hr-roster-page__mobile-scope art-card-xs"
          >
            <span aria-hidden="true"><ArtSvgIcon icon="ri:node-tree" /></span
            ><div
              ><small>当前组织范围</small><strong>{{ selectedOrganizationLabel }}</strong></div
            >
            <ElButton type="primary" plain @click="openOrganizationDrawer"
              ><ArtSvgIcon icon="ri:filter-3-line" />组织筛选</ElButton
            >
          </section>
          <ArtTableQuery
            :key="tablePermissionKey"
            ref="tableQueryRef"
            v-model="searchForm"
            :search-items="searchItems"
            :api-fn="fetchTableData"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :search-bar-props="{ span: 6, labelWidth: 82 }"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              emptyText: '暂无员工档案',
              emptyDescription: '可切换组织范围或新增员工档案。'
            }"
            :on-success="handleTableSuccess"
            focusable
            focus-scope-selector=".hr-roster-page__workspace"
          />
        </div>
      </ArtWorkspaceSplitter>
    </div>
    <ArtDrawer ref="organizationDrawerRef">
      <OrganizationScopeFilter
        scope-type="employee"
        class="hr-roster-page__drawer-filter"
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
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { useMediaQuery } from '@vueuse/core'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import OrganizationScopeFilter from '@/views/system/shared/organization-scope-filter.vue'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import {
    DeleteReferenceBlockedError,
    getDeleteReferenceContext
  } from '@/utils/supabase/delete-reference'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import { isReadableFieldAccess, canViewField, getFieldAccess } from '@/utils/field-permission'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import TreeUtils from '@/utils/tree'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { deleteEmployee, fetchEmployeeList, fetchEmployeeOrganizationTree } from '@hr/api'
  import HrEmployeeIdentityCell from '@hr/views/shared/hr-employee-identity-cell.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'

  defineOptions({ name: 'HrEmployeeRoster' })
  type Employee = Api.Hr.Employee
  type SearchParams = Api.Hr.EmployeeSearchParams
  type EmployeeFieldKey = Api.Hr.EmployeeFieldKey
  type EmployeeFieldAccessMap = Api.Hr.EmployeeFieldAccessMap
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>
  type Organization = Api.SystemManage.OrganizationScopeFilterItem
  interface OverviewRow {
    employmentStatus?: unknown
    account?: { id?: unknown } | null
  }

  const ALL_ORGANIZATIONS_KEY = '__all_organizations__'
  const UNASSIGNED_ORGANIZATION_KEY = '__unassigned_organization__'
  const router = useRouter()
  const route = useRoute()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId, isAllTenants } = storeToRefs(useTenantScopeStore())
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const deleteBusy = ref(false)
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    'mdm_employee',
    '员工档案'
  )
  const organizationTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const organizationDrawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const isDesktopOrganizationLayout = useMediaQuery('(min-width: 1201px)')
  const organizationTree = ref<Organization[]>([])
  const organizationFilterLoading = ref(false)
  const selectedTenantId = computed(() => effectiveTenantId.value ?? '')
  const selectedOrganizationKey = ref(ALL_ORGANIZATIONS_KEY)
  const includeDescendantOrganizations = ref(true)
  const listFieldAccess = ref<EmployeeFieldAccessMap>({})
  const currentRows = ref<Employee[]>([])
  const overview = reactive<{ total: number; rows: OverviewRow[] }>({ total: 0, rows: [] })
  const searchForm = ref<SearchParams>({
    recordId: typeof route.query.recordId === 'string' ? route.query.recordId : undefined,
    employmentStatus: undefined,
    employmentType: undefined,
    hireDateRange: [],
    keyword: ''
  })
  watch(
    () => route.query.recordId,
    (recordId) => {
      searchForm.value.recordId = typeof recordId === 'string' ? recordId : undefined
      selectedOrganizationKey.value = ALL_ORGANIZATIONS_KEY
      void tableQueryRef.value?.refreshData()
    }
  )
  const activeCount = computed(
    () =>
      overview.rows.filter((row) => ['probation', 'active'].includes(String(row.employmentStatus)))
        .length
  )
  const linkedAccountCount = computed(() => overview.rows.filter((row) => row.account?.id).length)
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '人事档案按租户隔离', type: 'success', effect: 'light' },
    { label: '支持账号联动', type: 'primary', effect: 'plain' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前结果',
      value: overview.total,
      description: '随筛选条件更新',
      icon: 'ri:group-line'
    },
    {
      label: '本页在岗',
      value: activeCount.value,
      description: '含试用期员工',
      icon: 'ri:user-follow-line',
      tone: 'success'
    },
    ...(isReadableFieldAccess(getFieldAccess(listFieldAccess.value, 'maintenanceAudit'))
      ? [
          {
            label: '已开通账号',
            value: linkedAccountCount.value,
            description: '当前页账号关联',
            icon: 'ri:shield-user-line',
            tone: 'info' as const
          }
        ]
      : [])
  ])
  const selectedOrganization = computed(() =>
    [ALL_ORGANIZATIONS_KEY, UNASSIGNED_ORGANIZATION_KEY].includes(selectedOrganizationKey.value)
      ? null
      : organizationTreeUtils.findNode(organizationTree.value, selectedOrganizationKey.value)
  )
  const selectedOrganizationLabel = computed(() =>
    selectedOrganizationKey.value === UNASSIGNED_ORGANIZATION_KEY
      ? '待归属员工'
      : selectedOrganizationKey.value === ALL_ORGANIZATIONS_KEY
        ? '全部员工'
        : (selectedOrganization.value?.organizationName ?? '全部员工')
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
  const shouldDisplayField = (field: EmployeeFieldKey): boolean =>
    canViewField(listFieldAccess.value, field) ||
    currentRows.value.some((row) => canViewField(row.fieldAccess, field))

  const tablePermissionKey = computed(() =>
    (['contactDetails', 'maintenanceAudit'] as const)
      .map((field) => `${field}:${shouldDisplayField(field) ? 'visible' : 'hidden'}`)
      .join('|')
  )

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '任职状态',
      key: 'employmentStatus',
      type: 'select',
      props: { clearable: true, options: getDictMap.value.hrEmploymentStatus ?? [] }
    },
    {
      label: '用工类型',
      key: 'employmentType',
      type: 'select',
      props: { clearable: true, options: getDictMap.value.hrEmploymentType ?? [] }
    },
    {
      label: '入职日期',
      key: 'hireDateRange',
      type: 'date',
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期',
        rangeSeparator: '至',
        class: '!w-full'
      }
    },
    {
      label: '关键词',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: canViewField(listFieldAccess.value, 'contactDetails')
          ? '工号、姓名、手机、邮箱或岗位'
          : '工号、姓名或岗位'
      }
    }
  ])
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    { type: 'add', label: '新增员工', permission: 'Hr:Employee:Add', onClick: () => openProfile() }
  ])
  const columnsFactory = (): ColumnOption<Employee>[] => [
    {
      prop: 'employeeIdentity',
      label: '员工身份',
      minWidth: 210,
      fixed: 'left',
      link: { permission: 'Hr:Employee:View', onClick: openEmployeeDetail },
      formatter: (row) =>
        h(HrEmployeeIdentityCell, {
          employeeName: row.employeeName,
          employeeNo: row.employeeNo,
          avatarUrl: row.avatarUrl
        })
    },
    {
      prop: 'employmentStatus',
      label: '任职状态',
      width: 108,
      dict: { code: 'hrEmploymentStatus', display: 'auto' }
    },
    {
      prop: 'tenant',
      label: '所属租户',
      minWidth: 180,
      formatter: (row: Employee) =>
        h(BusinessTableIdentityCell, {
          primary: row.tenant?.tenantName,
          secondary: row.tenant?.tenantCode
        })
    },
    {
      prop: 'organization',
      label: '所属组织',
      minWidth: 170,
      showOverflowTooltip: true,
      formatter: (row) => row.organization?.organizationName || '待归属'
    },
    {
      prop: 'jobTitle',
      label: '工作岗位',
      minWidth: 140,
      showOverflowTooltip: true,
      formatter: (row) => row.jobTitle || '--'
    },
    {
      prop: 'employmentType',
      label: '用工类型',
      width: 108,
      dict: { code: 'hrEmploymentType', display: 'text' }
    },
    { prop: 'hireDate', label: '入职日期', width: 116, formatter: (row) => row.hireDate || '--' },
    ...(shouldDisplayField('contactDetails')
      ? [
          {
            prop: 'contact',
            label: '联系方式',
            minWidth: 200,
            formatter: (row: Employee) =>
              canViewField(row.fieldAccess, 'contactDetails')
                ? h('div', { class: 'hr-roster-contact' }, [
                    h('span', null, row.phone || '未填写手机'),
                    h('small', { title: row.email || undefined }, row.email || '未填写邮箱')
                  ])
                : '--'
          }
        ]
      : []),
    ...(shouldDisplayField('maintenanceAudit')
      ? [
          {
            prop: 'account',
            label: '系统账号',
            width: 112,
            formatter: (row: Employee) => {
              const access = getFieldAccess(row.fieldAccess, 'maintenanceAudit')
              if (access === 'masked') return '***'
              return isReadableFieldAccess(access)
                ? h(
                    'span',
                    { class: ['hr-roster-account', row.account?.id ? 'is-linked' : ''] },
                    row.account?.id ? '已开通' : '未开通'
                  )
                : '--'
            }
          },
          {
            prop: 'updateTime',
            label: '最近维护',
            width: 160,
            formatter: (row: Employee) => {
              const access = getFieldAccess(row.fieldAccess, 'maintenanceAudit')
              if (access === 'masked') return '***'
              return isReadableFieldAccess(access)
                ? formatWithDayjs(row.updateTime, 'YYYY-MM-DD HH:mm') || '--'
                : '--'
            }
          }
        ]
      : []),
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) =>
        h(BusinessTableRowActions, null, () => [
          h(ArtButtonTable, {
            type: 'view',
            label: '查看员工详情',
            permission: 'Hr:Employee:View',
            onClick: () => openEmployeeDetail(row)
          }),
          h(ArtButtonMore, {
            list: rowActions,
            onClick: (item: ButtonMoreItem) => handleRowAction(item, row)
          })
        ])
    }
  ]
  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchEmployeeList({
      ...params,
      tenantId: selectedTenantId.value || undefined,
      organizationIds: selectedOrganizationIds.value,
      organizationUnassigned: selectedOrganizationKey.value === UNASSIGNED_ORGANIZATION_KEY,
      from,
      to
    })
    listFieldAccess.value = result.fieldAccess
    currentRows.value = result.data
    return result
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    overview.rows = rows.map((row) => ({
      employmentStatus: row.employmentStatus,
      account:
        row.account && typeof row.account === 'object'
          ? { id: Reflect.get(row.account, 'id') }
          : null
    }))
    overview.total = response.total ?? rows.length
  }
  const loadOrganizationTree = async (): Promise<void> => {
    organizationFilterLoading.value = true
    try {
      const response = await fetchEmployeeOrganizationTree({ tenantId: selectedTenantId.value })
      organizationTree.value = response.data ?? []
    } finally {
      organizationFilterLoading.value = false
    }
  }
  const handleOrganizationSelect = (key: string): void => {
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
        subtitle: '按组织筛选员工花名册',
        size: 'sm',
        showFooter: false,
        contentHeight: 'calc(100vh - 118px)'
      }
    )
  }
  const openProfile = (row?: Employee): void => {
    void router.push(
      row?.id ? `/hr/personnel/employee-profile/${row.id}` : '/hr/personnel/employee-profile'
    )
  }
  const openEmployeeDetail = (row: Employee): void => {
    if (!row.id) return
    void router.push(`/hr/personnel/employee-detail/${row.id}`)
  }
  const rowActions = (): ButtonMoreItem[] => [
    {
      key: 'edit',
      label: '编辑员工档案',
      icon: 'ri:edit-line',
      auth: 'Hr:Employee:Edit'
    },
    {
      key: 'delete',
      label: '删除员工档案',
      icon: 'ri:delete-bin-5-line',
      color: 'var(--el-color-danger)',
      auth: 'Hr:Employee:Delete'
    }
  ]
  const handleRowAction = (item: ButtonMoreItem, row: Employee): void => {
    if (item.key === 'edit') openProfile(row)
    if (item.key === 'delete') void handleDelete(row)
  }
  const handleDelete = async (row: Employee): Promise<void> => {
    if (deleteBusy.value) return
    if (!row.id || !hasAuth('Hr:Employee:Delete')) {
      notifyFriendlyError(
        new Error('当前账号无权删除此员工，或员工记录已变化，请刷新后重试'),
        '员工档案不可删除，请核对权限并刷新后重试'
      )
      return
    }
    const resources = [{ id: row.id, label: `${row.employeeName}（${row.employeeNo}）` }]
    deleteBusy.value = true
    try {
      if (await inspectDeleteReferences(resources)) return
      await confirmAction(
        `确定删除“${row.employeeName}（${row.employeeNo}）”吗？此操作不可恢复。`,
        '删除员工档案',
        {
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonType: 'danger'
        }
      )
      try {
        await deleteEmployee(row.id)
      } catch (error) {
        if (await inspectDeleteReferences(resources, getDeleteReferenceContext(error)?.constraint))
          return
        if (error instanceof DeleteReferenceBlockedError) return
        throw error
      }
      await loadOrganizationTree()
      void tableQueryRef.value?.refreshRemove()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '员工档案删除失败，请检查网络后重试')
    } finally {
      deleteBusy.value = false
    }
  }
  onMounted(async () => {
    await Promise.all(
      ['hrEmploymentStatus', 'hrEmploymentType'].map((code) => userStore.ensureDictLoaded(code))
    )
    await loadOrganizationTree()
  })
</script>

<style scoped lang="scss">
  .hr-roster-page {
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
    }

    &__mobile-scope > span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-surface-radius);
    }

    &__mobile-scope > div {
      display: grid;
      flex: 1;
      min-width: 0;
    }

    &__mobile-scope small {
      color: var(--el-text-color-secondary);
    }

    &__mobile-scope strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__drawer-filter {
      height: 100%;
    }

    :deep(.hr-roster-cell),
    :deep(.hr-roster-contact) {
      display: flex;
      align-items: center;
      min-width: 0;
    }

    :deep(.hr-roster-cell) {
      gap: 10px;
    }

    :deep(.hr-roster-cell > div),
    :deep(.hr-roster-contact) {
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
    }

    :deep(.hr-roster-cell strong),
    :deep(.hr-roster-cell small),
    :deep(.hr-roster-contact small) {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.hr-roster-cell small),
    :deep(.hr-roster-contact small) {
      color: var(--el-text-color-secondary);
    }

    :deep(.hr-roster-account) {
      color: var(--el-text-color-secondary);
    }

    :deep(.hr-roster-account.is-linked) {
      color: var(--el-color-success);
    }
  }
</style>
