<template>
  <ArtPermissionGuard permission="Hr:JobProfile:View">
    <div class="job-architecture-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="JOB ARCHITECTURE"
        title="职务体系"
        description="统一维护职族、标准职务和职级；岗位引用标准职务，员工通过任职关系占用岗位。"
        icon="ri:stack-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableQueryRef" />
        </template>
      </BusinessWorkspaceHeader>

      <section class="job-architecture-page__domain-navigation" aria-label="职务体系工作域">
        <div>
          <span class="job-architecture-page__domain-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:node-tree" />
          </span>
          <span>
            <strong>标准职务架构</strong>
            <small>先定义职族与标准职务，再建立职级层级，供岗位和员工任职关系引用</small>
          </span>
        </div>
        <HrEntityNavigation
          :model-value="activeEntity"
          :items="navigationItems"
          navigation-label="职务体系分类"
          compact
          @update:model-value="selectEntity"
        />
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
        :search-bar-props="{ span: 6, labelWidth: 80, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: `可新增${activeTab.label}，逐步建立企业统一任职标准。`
        }"
        :on-success="handleTableSuccess"
        focusable
      />

      <JobArchitectureDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '../../shared/hr-entity-navigation.vue'
  import { useHrMasterDeleteLocation } from '../../shared/use-hr-master-delete-location'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import { deleteJobArchitectureRecord, fetchJobArchitectureList } from '@hr/api'
  import JobArchitectureDialog from './modules/job-architecture-dialog.vue'

  defineOptions({ name: 'HrJobArchitecture' })

  type Entity = Api.Hr.JobArchitectureEntity
  type RecordItem = Api.Hr.JobFamily | Api.Hr.Grade | Api.Hr.JobProfile
  type TableParams = Api.Hr.JobArchitectureSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface ArchitectureTab {
    entity: Entity
    label: string
    description: string
    icon: string
    addPermission: string
    editPermission: string
    deletePermission: string
  }

  interface JobArchitectureDialogExpose {
    handleOpen: (entity: Entity, row?: RecordItem) => Promise<void>
  }

  const tabs: ArchitectureTab[] = [
    {
      entity: 'profile',
      label: '标准职务',
      description: '跨组织复用的工作分类',
      icon: 'ri:id-card-line',
      addPermission: 'Hr:JobProfile:Add',
      editPermission: 'Hr:JobProfile:Edit',
      deletePermission: 'Hr:JobProfile:Delete'
    },
    {
      entity: 'family',
      label: '职族',
      description: '相近职务的专业序列',
      icon: 'ri:git-branch-line',
      addPermission: 'Hr:JobFamily:Add',
      editPermission: 'Hr:JobFamily:Edit',
      deletePermission: 'Hr:JobFamily:Delete'
    },
    {
      entity: 'grade',
      label: '职级',
      description: '能力与薪酬层级基准',
      icon: 'ri:bar-chart-grouped-line',
      addPermission: 'Hr:Grade:Add',
      editPermission: 'Hr:Grade:Edit',
      deletePermission: 'Hr:Grade:Delete'
    }
  ]
  const navigationItems = computed<HrEntityNavigationItem[]>(() =>
    tabs.map((tab) => ({ ...tab, value: tab.entity }))
  )

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const activeEntity = ref<Entity>('profile')
  const activeTab = computed(() => tabs.find((tab) => tab.entity === activeEntity.value) ?? tabs[0])
  const deleteTables: Record<Entity, string> = {
    profile: 'mdm_job_profile',
    family: 'mdm_job_family',
    grade: 'mdm_grade'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<JobArchitectureDialogExpose>()
  const tableState = reactive<{ searchQuery: Api.Hr.JobArchitectureSearchParams }>({
    searchQuery: { enabled: undefined, keyword: '' }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    { mdm_job_profile: 'profile' },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      tableState.searchQuery.enabled = undefined
    }
  )
  const selectedTenantId = computed(() => effectiveTenantId.value ?? '')
  const overview = reactive({ total: 0, enabled: 0, references: 0 })
  const booleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      label: item.value === 'true' ? '启用' : '停用',
      value: item.value === 'true'
    }))
  )
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '企业主数据', type: 'primary', effect: 'plain' },
    { label: '岗位与任职解耦', type: 'success', effect: 'light' },
    { label: '历史可追溯', type: 'info', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前结果',
      value: overview.total,
      description: activeTab.value.label,
      icon: activeTab.value.icon
    },
    {
      label: '本页启用',
      value: overview.enabled,
      description: '可用于岗位和异动',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '本页引用',
      value: overview.references,
      description: '岗位或职务引用数',
      icon: 'ri:links-line',
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
      props: { clearable: true, placeholder: `${activeTab.value.label}编码或名称` }
    }
  ])

  const commonColumns = (): ColumnOption<RecordItem>[] => [
    ...(isPlatformSuper.value
      ? [
          {
            prop: 'tenant.tenantName',
            label: '所属租户',
            minWidth: 160,
            showOverflowTooltip: true
          } as ColumnOption<RecordItem>
        ]
      : []),
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
    { prop: 'sort', label: '排序', width: 80, align: 'right' }
  ]

  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'operation',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => (
      <BusinessTableRowActions>
        <ArtButtonTable
          type="edit"
          permission={activeTab.value.editPermission}
          onClick={() => openDialog(row)}
        />
        <ArtButtonTable
          type="delete"
          permission={activeTab.value.deletePermission}
          onClick={() => void handleDelete(row)}
        />
      </BusinessTableRowActions>
    )
  })

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'family')
      return [
        ...commonColumns().slice(0, isPlatformSuper.value ? 1 : 0),
        { prop: 'familyCode', label: '职族编码', minWidth: 150, showOverflowTooltip: true },
        { prop: 'familyName', label: '职族名称', minWidth: 200, showOverflowTooltip: true },
        {
          prop: 'jobProfileCount',
          label: '标准职务',
          width: 110,
          align: 'right',
          formatter: (row) => `${(row as Api.Hr.JobFamily).jobProfileCount ?? 0} 个`
        },
        ...commonColumns().slice(isPlatformSuper.value ? 1 : 0),
        actionColumn()
      ]
    if (activeEntity.value === 'grade')
      return [
        ...commonColumns().slice(0, isPlatformSuper.value ? 1 : 0),
        { prop: 'gradeCode', label: '职级编码', minWidth: 140, showOverflowTooltip: true },
        { prop: 'gradeName', label: '职级名称', minWidth: 180, showOverflowTooltip: true },
        { prop: 'gradeLevel', label: '层级值', width: 100, align: 'right' },
        {
          prop: 'jobProfileCount',
          label: '标准职务',
          width: 110,
          align: 'right',
          formatter: (row) => `${(row as Api.Hr.Grade).jobProfileCount ?? 0} 个`
        },
        ...commonColumns().slice(isPlatformSuper.value ? 1 : 0),
        actionColumn()
      ]
    return [
      ...commonColumns().slice(0, isPlatformSuper.value ? 1 : 0),
      { prop: 'jobCode', label: '职务编码', minWidth: 150, showOverflowTooltip: true },
      { prop: 'jobName', label: '标准职务', minWidth: 200, showOverflowTooltip: true },
      { prop: 'family.familyName', label: '所属职族', minWidth: 160, showOverflowTooltip: true },
      {
        prop: 'defaultGrade.gradeName',
        label: '默认职级',
        minWidth: 130,
        showOverflowTooltip: true,
        formatter: (row) => (row as Api.Hr.JobProfile).defaultGrade?.gradeName ?? '—'
      },
      {
        prop: 'positionCount',
        label: '关联岗位',
        width: 110,
        align: 'right',
        formatter: (row) => `${(row as Api.Hr.JobProfile).positionCount ?? 0} 个`
      },
      ...commonColumns().slice(isPlatformSuper.value ? 1 : 0),
      actionColumn()
    ]
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${activeTab.value.label}`,
      permission: activeTab.value.addPermission,
      onClick: () => openDialog()
    }
  ])
  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchJobArchitectureList(activeEntity.value, {
      ...params,
      tenantId: selectedTenantId.value || undefined,
      from,
      to
    })
  }
  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    overview.total = response.total ?? rows.length
    overview.enabled = rows.filter((row) => Boolean(row.enabled)).length
    overview.references = rows.reduce(
      (total, row) => total + Number(row.positionCount ?? row.jobProfileCount ?? 0),
      0
    )
  }
  const openDialog = (row?: RecordItem): void =>
    void dialogRef.value?.handleOpen(activeEntity.value, row)
  const handleSaveSuccess = (type: DialogType): void =>
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  const handleDelete = async (row: RecordItem): Promise<void> => {
    if (!row.id) return
    const entity = activeEntity.value
    const name =
      entity === 'family'
        ? (row as Api.Hr.JobFamily).familyName
        : entity === 'grade'
          ? (row as Api.Hr.Grade).gradeName
          : (row as Api.Hr.JobProfile).jobName
    const code =
      entity === 'family'
        ? (row as Api.Hr.JobFamily).familyCode
        : entity === 'grade'
          ? (row as Api.Hr.Grade).gradeCode
          : (row as Api.Hr.JobProfile).jobCode
    const label = `${name}（${code}）`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: activeTab.value.deletePermission,
      remove: () => deleteJobArchitectureRecord(entity, row.id!),
      onDeleted: () => tableQueryRef.value?.refreshRemove() ?? Promise.resolve()
    })
  }
  const handleTabChange = (): void => {
    Object.assign(tableState.searchQuery, { keyword: '', enabled: undefined })
    Object.assign(overview, { total: 0, enabled: 0, references: 0 })
  }
  const selectEntity = (value: string): void => {
    if (activeEntity.value === value) return
    activeEntity.value = value as Entity
    handleTabChange()
  }
  onMounted(() => userStore.ensureDictLoaded('commonBoolean'))
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .job-architecture-page {
    @include hr-table-workspace-layout(360px);

    &__domain-navigation {
      display: grid;
      gap: 12px;
      min-width: 0;
      padding: 14px;
      background: linear-gradient(
        120deg,
        color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color)),
        var(--default-box-color) 55%
      );
      border: 1px solid color-mix(in srgb, var(--theme-color) 11%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

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

      > div strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      > div small {
        margin-top: 3px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__domain-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--art-surface-radius);
    }

    &__actions {
      display: flex;
      align-items: center;
    }

    :deep(.art-table-query) {
      flex: 1;
    }

    @media (width <= 760px) {
      &__domain-navigation {
        padding: 12px;
      }
    }
  }
</style>
