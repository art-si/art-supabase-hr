<template>
  <ArtPermissionGuard permission="Hr:OrganizationPosition:View">
    <div class="organization-position-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="false" />
      <BusinessWorkspaceHeader
        eyebrow="ORGANIZATION DIRECTORY"
        title="组织岗位人员"
        description="从系统组织逐级查看部门岗位与直接任职员工，统一核对部门、岗位和人员关系。"
        icon="ri:organization-chart"
        density="compact"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      />

      <div class="organization-position-page__workspace">
        <ArtWorkspaceSplitter
          primary-size="280px"
          primary-min="250px"
          primary-max="380px"
          :breakpoint="1180"
          stacked-primary-size="360px"
        >
          <template #primary>
            <ArtSectionCard
              :show-scrollbar="false"
              class="organization-position-page__organization-card"
              title="组织"
              :subtitle="`${flatOrganizations.length} 个可用节点`"
              :loading="organizationState.loading"
              :error="organizationState.error"
              :empty="
                !organizationState.loading &&
                !organizationState.error &&
                !organizationState.tree.length
              "
              empty-title="暂无可用组织"
              empty-description="请先在系统管理 / 部门管理中维护并启用组织。"
              :min-height="280"
              @retry="loadOrganizations"
            >
              <template #actions>
                <ArtTreeExpandToggle
                  :tree="organizationTreeRef"
                  :data="organizationState.tree"
                  label="组织树"
                  default-expanded
                />
                <ArtIconButton
                  icon="ri:refresh-line"
                  label="刷新组织"
                  :loading="organizationState.loading"
                  @click="loadOrganizations"
                />
              </template>

              <div class="organization-position-page__navigator">
                <ElInput
                  v-model="organizationState.keyword"
                  clearable
                  placeholder="搜索组织名称或编码"
                  aria-label="搜索组织"
                >
                  <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
                </ElInput>
                <ElScrollbar class="organization-position-page__organization-scrollbar">
                  <ElTree
                    ref="organizationTreeRef"
                    :data="organizationState.tree"
                    :props="organizationTreeProps"
                    :filter-node-method="matchesOrganizationNodeKeyword"
                    node-key="id"
                    default-expand-all
                    highlight-current
                    :expand-on-click-node="false"
                    aria-label="组织树"
                    @node-click="handleOrganizationSelect"
                  >
                    <template #default="{ data: organization }">
                      <div class="organization-position-page__organization-node">
                        <span aria-hidden="true">
                          <ArtSvgIcon
                            :icon="getOrganizationTypeIcon(organization.organizationType)"
                          />
                        </span>
                        <span>
                          <strong :title="organization.organizationName">
                            {{ organization.organizationName }}
                          </strong>
                          <small :title="organization.organizationCode" translate="no">
                            {{ organization.organizationCode }}
                          </small>
                        </span>
                        <ArtSvgIcon
                          v-if="organization.id === organizationState.selectedId"
                          icon="ri:check-line"
                          aria-hidden="true"
                        />
                      </div>
                    </template>
                    <template #empty>
                      <ArtEmptyState
                        title="未找到匹配项"
                        description="请调整关键词或清空筛选条件。"
                        size="compact"
                        :visual-size="64"
                      />
                    </template>
                  </ElTree>
                </ElScrollbar>
              </div>
            </ArtSectionCard>
          </template>

          <div class="organization-position-page__directory">
            <ArtSectionCard
              :show-scrollbar="false"
              class="organization-position-page__position-card"
              title="岗位"
              :subtitle="positionSubtitle"
              :loading="directoryState.loading"
              :error="directoryState.error"
              :empty="!directoryState.loading && !directoryState.error && !filteredPositions.length"
              empty-title="当前组织及下级暂无岗位"
              empty-description="可在 HR / 岗位管理中为当前组织或下级组织新增并启用岗位。"
              :min-height="280"
              @retry="loadDirectory"
            >
              <template #actions>
                <ElInput
                  v-model="directoryState.positionKeyword"
                  class="organization-position-page__position-search"
                  clearable
                  placeholder="搜索岗位"
                  aria-label="搜索岗位"
                >
                  <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
                </ElInput>
              </template>

              <ElScrollbar class="organization-position-page__position-scrollbar">
                <ul
                  class="organization-position-page__position-list"
                  aria-label="当前组织及下级岗位列表"
                >
                  <li
                    v-for="position in filteredPositions"
                    :key="position.id || position.positionCode"
                  >
                    <button
                      type="button"
                      :class="{ 'is-selected': position.id === directoryState.selectedPositionId }"
                      :aria-pressed="position.id === directoryState.selectedPositionId"
                      @click="handlePositionSelect(position)"
                    >
                      <span class="organization-position-page__position-icon" aria-hidden="true">
                        <ArtSvgIcon icon="ri:briefcase-4-line" />
                      </span>
                      <span class="organization-position-page__position-identity">
                        <strong :title="position.positionName">{{ position.positionName }}</strong>
                        <small
                          :title="`${position.positionCode} · ${positionOrganizationName(position)}`"
                        >
                          {{ position.positionCode }} · {{ positionOrganizationName(position) }}
                        </small>
                      </span>
                      <span class="organization-position-page__position-count">
                        {{ position.employeeCount ?? 0 }} 人
                      </span>
                    </button>
                  </li>
                </ul>
              </ElScrollbar>
            </ArtSectionCard>

            <ArtSectionCard
              :show-scrollbar="false"
              class="organization-position-page__employee-card"
              title="员工"
              :subtitle="employeeSubtitle"
              :loading="directoryState.loading"
              :error="directoryState.error"
              :empty="!directoryState.loading && !directoryState.error && !filteredEmployees.length"
              :empty-title="
                directoryState.selectedPositionId ? '该岗位暂无直接任职员工' : '请先选择岗位'
              "
              :empty-description="
                directoryState.selectedPositionId
                  ? '可前往员工花名册调整员工所属组织或工作岗位。'
                  : '从中间的岗位列表选择一个岗位后查看人员。'
              "
              :min-height="280"
              @retry="loadDirectory"
            >
              <template #actions>
                <ElInput
                  v-model="directoryState.employeeKeyword"
                  class="organization-position-page__employee-search"
                  clearable
                  placeholder="姓名或工号"
                  aria-label="搜索员工姓名或工号"
                >
                  <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
                </ElInput>
              </template>

              <ElScrollbar class="organization-position-page__employee-scrollbar">
                <ul class="organization-position-page__employee-list">
                  <li v-for="employee in filteredEmployees" :key="employee.id">
                    <ElAvatar
                      :size="40"
                      :src="employee.avatarUrl || undefined"
                      :alt="`${employee.employeeName}的头像`"
                    >
                      {{ employee.employeeName.slice(0, 1) }}
                    </ElAvatar>
                    <div class="organization-position-page__employee-identity">
                      <strong :title="employee.employeeName">{{ employee.employeeName }}</strong>
                      <small>
                        <span :title="employee.employeeNo" translate="no">{{
                          employee.employeeNo
                        }}</span>
                        <i aria-hidden="true"></i>
                        <span :title="employee.jobTitle || undefined">{{
                          employee.jobTitle || '未设置职务'
                        }}</span>
                      </small>
                    </div>
                    <ArtDictDisplay
                      dict-code="hrEmploymentStatus"
                      :value="employee.employmentStatus"
                      display="auto"
                    />
                  </li>
                </ul>
              </ElScrollbar>
            </ArtSectionCard>
          </div>
        </ArtWorkspaceSplitter>
      </div>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import {
    getOrganizationTypeIcon,
    matchesOrganizationNodeKeyword
  } from '@/utils/organization-display'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
  import type { ElTree } from 'element-plus'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtTreeExpandToggle from '@/components/core/widget/art-tree-expand-toggle/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import { fetchOrganizationOptionsTree } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import TreeUtils from '@/utils/tree'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase/error'
  import { fetchOrganizationPositionDirectory } from '@hr/api'

  defineOptions({ name: 'HrOrganizationPosition' })

  type Organization = Api.SystemManage.OrganizationListItem
  type Position = Api.Hr.Position
  type DirectoryEmployee = Api.Hr.OrganizationPositionEmployee

  interface OrganizationState {
    tree: Organization[]
    loading: boolean
    error: string | null
    keyword: string
    selectedId: string
  }

  interface DirectoryState {
    positions: Position[]
    employees: DirectoryEmployee[]
    employeeTotal: number
    truncated: boolean
    selectedPositionId: string
    positionKeyword: string
    employeeKeyword: string
    loading: boolean
    error: string | null
  }

  const userStore = useUserStore()
  const organizationTreeRef = ref<InstanceType<typeof ElTree>>()
  const organizationTreeProps = { children: 'children', label: 'organizationName' }
  const organizationTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  const organizationState = reactive<OrganizationState>({
    tree: [],
    loading: false,
    error: null,
    keyword: '',
    selectedId: ''
  })
  const directoryState = reactive<DirectoryState>({
    positions: [],
    employees: [],
    employeeTotal: 0,
    truncated: false,
    selectedPositionId: '',
    positionKeyword: '',
    employeeKeyword: '',
    loading: false,
    error: null
  })

  const flatOrganizations = computed(() => organizationTreeUtils.treeToList(organizationState.tree))
  const selectedOrganization = computed(() =>
    flatOrganizations.value.find((organization) => organization.id === organizationState.selectedId)
  )
  const organizationNames = computed(
    () =>
      new Map(
        flatOrganizations.value.map((organization) => [
          organization.id,
          organization.organizationName
        ])
      )
  )
  const positionOrganizationName = (position: Position): string =>
    organizationNames.value.get(position.organizationId || '') ||
    selectedOrganization.value?.organizationName ||
    '当前组织'
  const filteredPositions = computed(() => {
    const keyword = directoryState.positionKeyword.trim().toLocaleLowerCase('zh-CN')
    if (!keyword) return directoryState.positions
    return directoryState.positions.filter((position) =>
      [position.positionCode, position.positionName, position.description].some((value) =>
        String(value ?? '')
          .toLocaleLowerCase('zh-CN')
          .includes(keyword)
      )
    )
  })
  const selectedPosition = computed(() =>
    directoryState.positions.find((position) => position.id === directoryState.selectedPositionId)
  )
  const filteredEmployees = computed(() => {
    const keyword = directoryState.employeeKeyword.trim().toLocaleLowerCase('zh-CN')
    return directoryState.employees.filter(
      (employee) =>
        employee.positionId === directoryState.selectedPositionId &&
        (!keyword ||
          [employee.employeeName, employee.employeeNo].some((value) =>
            value.toLocaleLowerCase('zh-CN').includes(keyword)
          ))
    )
  })
  const positionSubtitle = computed(
    () =>
      `${selectedOrganization.value?.organizationName || '当前组织'}及下级 · ${directoryState.positions.length} 个岗位`
  )
  const employeeSubtitle = computed(() => {
    const suffix = directoryState.truncated ? '（结果已截取）' : ''
    return `${selectedPosition.value?.positionName || '未选择岗位'} · ${filteredEmployees.value.length} 人${suffix}`
  })
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '系统组织数据', type: 'primary', effect: 'plain' },
    { label: 'HR 岗位数据', type: 'success', effect: 'light' },
    { label: '只读关系浏览', type: 'info', effect: 'plain' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前组织',
      value: selectedOrganization.value?.organizationName || '未选择',
      description: selectedOrganization.value?.organizationCode || '从左侧组织树选择',
      icon: 'ri:organization-chart'
    },
    {
      label: '当前岗位',
      value: selectedPosition.value?.positionName || '未选择',
      description: selectedPosition.value?.positionCode || '从岗位列表选择',
      icon: 'ri:briefcase-4-line',
      tone: 'info'
    },
    {
      label: '直接任职',
      value: filteredEmployees.value.length,
      description: '当前岗位直接任职员工',
      icon: 'ri:team-line',
      tone: 'success'
    }
  ])

  const loadDirectory = async (): Promise<void> => {
    if (!organizationState.selectedId) return
    directoryState.loading = true
    directoryState.error = null
    try {
      const response = await fetchOrganizationPositionDirectory(organizationState.selectedId)
      Object.assign(directoryState, {
        positions: response.data.positions,
        employees: response.data.employees,
        employeeTotal: response.data.employeeTotal,
        truncated: response.data.truncated
      })
      const positions = response.data.positions
      if (!positions.some((position) => position.id === directoryState.selectedPositionId)) {
        directoryState.selectedPositionId = positions[0]?.id ?? ''
      }
    } catch (error) {
      Object.assign(directoryState, {
        positions: [],
        employees: [],
        employeeTotal: 0,
        truncated: false,
        selectedPositionId: '',
        error: getFriendlySupabaseErrorMessage(error, '组织岗位人员关系加载失败，请稍后重试')
      })
    } finally {
      directoryState.loading = false
    }
  }

  const loadOrganizations = async (): Promise<void> => {
    organizationState.loading = true
    organizationState.error = null
    try {
      const response = await fetchOrganizationOptionsTree({
        status: '1'
      })
      organizationState.tree = response.data ?? []
      const organizations = organizationTreeUtils.treeToList(organizationState.tree)
      if (!organizations.some((organization) => organization.id === organizationState.selectedId)) {
        organizationState.selectedId = organizations[0]?.id ?? ''
      }
      await nextTick()
      organizationTreeRef.value?.setCurrentKey(organizationState.selectedId || undefined)
      await loadDirectory()
    } catch (error) {
      organizationState.tree = []
      organizationState.selectedId = ''
      organizationState.error = getFriendlySupabaseErrorMessage(
        error,
        '组织结构加载失败，请稍后重试'
      )
    } finally {
      organizationState.loading = false
    }
  }

  const handleOrganizationSelect = async (organization: Organization): Promise<void> => {
    if (!organization.id || organization.id === organizationState.selectedId) return
    organizationState.selectedId = organization.id
    directoryState.selectedPositionId = ''
    await loadDirectory()
  }
  const handlePositionSelect = (position: Position): void => {
    if (position.id) directoryState.selectedPositionId = position.id
  }

  watch(
    () => organizationState.keyword,
    (keyword) => organizationTreeRef.value?.filter(keyword)
  )
  onMounted(async () => {
    await userStore.ensureDictLoaded('hrEmploymentStatus')
    await loadOrganizations()
  })
</script>

<style scoped lang="scss">
  .organization-position-page {
    gap: var(--art-space-3);
    min-width: 0;

    &__workspace {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 0;
    }

    &__directory {
      display: grid;
      grid-template-columns: 360px minmax(360px, 1fr);
      gap: var(--art-space-3);
      min-width: 0;
      height: 100%;
      min-height: 0;
    }

    &__organization-card,
    &__position-card,
    &__employee-card {
      min-width: 0;
      min-height: 0;
      overflow: hidden;

      :deep(.art-section-card__body),
      :deep(.art-async-state),
      :deep(.art-async-state__content) {
        height: 100%;
        min-height: 0;
      }
    }

    &__navigator {
      display: flex;
      flex-direction: column;
      gap: var(--art-space-3);
      height: 100%;
      min-height: 0;
    }

    &__organization-scrollbar,
    &__position-scrollbar,
    &__employee-scrollbar {
      flex: 1;
      min-height: 0;
    }

    &__organization-node {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 18px;
      gap: var(--art-space-2);
      align-items: center;
      width: 100%;
      min-width: 0;
      padding-right: var(--art-space-2);

      > span:first-child {
        color: var(--el-text-color-secondary);
      }

      > span:nth-child(2) {
        display: grid;
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
        font-weight: 500;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      > svg {
        color: var(--theme-color);
      }
    }

    &__position-search,
    &__employee-search {
      width: 180px;
    }

    &__position-list {
      display: grid;
      gap: var(--art-space-2);
      padding: 0;
      margin: 0;
      list-style: none;

      button {
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr) auto;
        gap: var(--art-space-3);
        align-items: center;
        width: 100%;
        min-width: 0;
        padding: var(--art-space-3);
        color: inherit;
        text-align: left;
        cursor: pointer;
        background: var(--art-gray-100);
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);
        transition:
          border-color 0.18s ease,
          background-color 0.18s ease,
          box-shadow 0.18s ease;

        &:hover {
          border-color: color-mix(in srgb, var(--theme-color) 30%, transparent);
        }

        &.is-selected {
          background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
          border-color: color-mix(in srgb, var(--theme-color) 30%, transparent);
          box-shadow: inset 3px 0 0 var(--theme-color);
        }

        &:focus-visible {
          outline: 2px solid var(--theme-color);
          outline-offset: 2px;
        }
      }
    }

    &__position-icon {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    &__position-identity {
      display: grid;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__position-count {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__employee-list {
      display: grid;
      gap: var(--art-space-2);
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        gap: var(--art-space-3);
        align-items: center;
        min-width: 0;
        padding: var(--art-space-3);
        background: var(--art-gray-100);
        border-radius: var(--el-border-radius-base);
      }
    }

    &__employee-identity {
      display: grid;
      min-width: 0;

      strong,
      small span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        display: flex;
        gap: 6px;
        align-items: center;
        min-width: 0;
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);

        i {
          flex: none;
          width: 3px;
          height: 3px;
          background: var(--el-text-color-placeholder);
          border-radius: 50%;
        }
      }
    }

    :deep(.el-tree-node__content) {
      min-height: 44px;
      border-radius: var(--el-border-radius-small);
    }

    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    @media (width <= 1180px) {
      &__directory {
        display: flex;
        flex-direction: column;
        height: auto;
      }

      &__organization-card,
      &__position-card,
      &__employee-card {
        flex: 0 0 360px;
      }
    }
  }
</style>
