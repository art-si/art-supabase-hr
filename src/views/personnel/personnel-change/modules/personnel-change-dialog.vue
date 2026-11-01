<template>
  <ArtDialog ref="dialogRef">
    <div class="personnel-change-dialog">
      <ArtForm
        ref="formRef"
        v-model:active-tab="activeTab"
        v-model="form.model"
        :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id))"
        :rules="form.rules"
        label-position="top"
        :span="12"
        :gutter="24"
        :validate-on-rule-change="false"
        scroll-to-error
        root-class="personnel-change-dialog__form"
      >
        <template #assignmentSnapshot>
          <ArtSectionCard
            title="异动前任职"
            subtitle="已读取当前有效的主任职记录；提交后该快照将冻结用于审批与审计。"
            :loading="snapshot.loading"
            :empty="!snapshot.data"
            empty-title="未读取到有效任职"
            empty-description="请确认该员工已维护有效的组织与岗位任职记录。"
            body-class="personnel-change-dialog__snapshot-body"
          >
            <div v-if="snapshot.data" class="personnel-change-dialog__snapshot-grid">
              <div
                v-for="item in snapshotItems"
                :key="item.label"
                class="personnel-change-dialog__snapshot-item"
              >
                <span>{{ item.label }}</span>
                <ArtDictDisplay
                  v-if="item.dictCode"
                  :dict-code="item.dictCode"
                  :value="String(item.value ?? '')"
                  display="auto"
                />
                <strong v-else :title="item.value || undefined">{{ item.value || '—' }}</strong>
              </div>
            </div>
          </ArtSectionCard>
        </template>

        <template #targetGuidance>
          <div class="personnel-change-dialog__guidance">
            <span class="personnel-change-dialog__guidance-icon" aria-hidden="true">
              <ArtSvgIcon :icon="changeTypeMeta.icon" />
            </span>
            <div>
              <strong>{{ changeTypeMeta.title }}</strong>
              <p>{{ changeTypeMeta.description }}</p>
            </div>
            <ElTag type="primary" effect="light" round>{{ changeTypeMeta.tag }}</ElTag>
          </div>
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { cloneDeep } from 'lodash-es'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type {
    EmployeeIntegrationItem,
    EmployeeSelectorContractParams
  } from '@/api/integration/employees'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useDocumentNumberRule } from '@/hooks/core/useDocumentNumberRule'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { toHrOrganizationTreeOptions } from '../../../shared/hr-organization-tree-field'
  import {
    fetchAssignmentPositionOptions,
    fetchHrOrganizationTree,
    fetchJobArchitectureOptions,
    fetchPersonnelChangeEmployees,
    savePersonnelChange
  } from '@hr/api'
  import type { HrWorkspaceDefinition, HrWorkspaceTab } from '../../../shared/workspace-config'

  interface DialogOpenData {
    workspace: HrWorkspaceDefinition
    tab: HrWorkspaceTab
    record?: Api.Hr.WorkspaceRecord
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: (keys?: string | string[]) => void
    reloadOptions: (key: string) => Promise<void>
  }

  interface FormState {
    model: Api.Hr.WorkspaceRecord
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<Api.Hr.WorkspaceRecord>>
  }

  interface SnapshotState {
    data?: Api.Hr.AssignmentSnapshot
    loading: boolean
  }

  interface SnapshotItem {
    label: string
    value?: string | null
    dictCode?: string
  }

  interface ChangeTypeMeta {
    title: string
    description: string
    tag: string
    icon: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<DialogOpenData>>()
  const formRef = ref<FormExpose>()
  const activeTab = ref('baseSection')
  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { getDictMap } = storeToRefs(userStore)
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const targetTenantId = ref<string>()
  const isEditing = ref(false)
  const currentWorkspace = shallowRef<HrWorkspaceDefinition>()
  const currentTab = shallowRef<HrWorkspaceTab>()
  const employeeOptions = shallowRef<Api.Hr.PersonnelChangeEmployeeOption[]>([])
  const positionOptions = shallowRef<Api.Hr.PositionOption[]>([])
  const changeNumber = useDocumentNumberRule('hr.personnel_change', targetTenantId)
  const snapshot = reactive<SnapshotState>({ data: undefined, loading: false })
  const formModel = reactive<Api.Hr.WorkspaceRecord>({})

  const statusChangeTypes = new Set([
    'regularization',
    'suspension',
    'reinstatement',
    'termination'
  ])
  const positionChangeTypes = new Set(['transfer', 'position_change', 'promotion', 'demotion'])
  const organizationalChangeTypes = new Set(['transfer', 'position_change'])
  const careerChangeTypes = new Set(['promotion', 'demotion'])
  const titleChangeTypes = new Set(['position_change', 'promotion', 'demotion'])

  const changeTypeMetaMap: Record<string, ChangeTypeMeta> = {
    regularization: {
      title: '转正后任职',
      description: '仅调整员工任职状态，当前组织、岗位和职级保持不变。',
      tag: '状态变更',
      icon: 'ri:user-follow-line'
    },
    transfer: {
      title: '调动后任职',
      description: '重新确认目标组织与岗位，岗位定义将同步带出标准职务。',
      tag: '组织与岗位',
      icon: 'ri:organization-chart'
    },
    position_change: {
      title: '调岗后任职',
      description: '在当前组织内选择新岗位，并可补充员工调整后的任职称谓。',
      tag: '岗位调整',
      icon: 'ri:briefcase-4-line'
    },
    promotion: {
      title: '晋升后任职',
      description: '沿用当前组织与岗位，重点确认晋升后的职级和任职称谓。',
      tag: '职级调整',
      icon: 'ri:arrow-up-circle-line'
    },
    demotion: {
      title: '降级后任职',
      description: '沿用当前组织与岗位，重点确认调整后的职级和任职称谓。',
      tag: '职级调整',
      icon: 'ri:arrow-down-circle-line'
    },
    suspension: {
      title: '停职后状态',
      description: '仅按规则调整任职状态，当前组织和岗位信息保持不变。',
      tag: '状态变更',
      icon: 'ri:pause-circle-line'
    },
    reinstatement: {
      title: '复职后状态',
      description: '仅按规则恢复任职状态，当前组织和岗位信息保持不变。',
      tag: '状态变更',
      icon: 'ri:restart-line'
    },
    termination: {
      title: '离职后状态',
      description: '结束当前有效任职，无需重复填写组织、岗位和职级信息。',
      tag: '结束任职',
      icon: 'ri:user-unfollow-line'
    }
  }

  const changeTypeMeta = computed<ChangeTypeMeta>(
    () =>
      changeTypeMetaMap[formModel.changeType ?? ''] ?? {
        title: '异动后任职',
        description: '系统将根据所选异动类型展示需要确认的任职信息。',
        tag: '待选择',
        icon: 'ri:exchange-2-line'
      }
  )

  const snapshotItems = computed<SnapshotItem[]>(() => [
    { label: '原组织', value: snapshot.data?.organizationName },
    { label: '原岗位', value: snapshot.data?.positionName },
    { label: '原标准职务', value: snapshot.data?.jobName },
    { label: '原职级', value: snapshot.data?.gradeName },
    { label: '原任职称谓', value: snapshot.data?.businessTitle },
    { label: '原任职状态', value: snapshot.data?.employmentStatus, dictCode: 'hrEmploymentStatus' },
    { label: '任职开始日期', value: snapshot.data?.effectiveStart },
    {
      label: '任职比例',
      value: snapshot.data?.fte ? `${Math.round(snapshot.data.fte * 100)}%` : null
    }
  ])

  const getSelectedEmployeeData = (): EmployeeIntegrationItem[] => {
    const employeeId = form.model.employeeId
    const employee = form.model.employee
    const selected = employeeOptions.value.find((item) => item.id === employeeId)
    if (selected) return [selected]
    if (!employeeId || !employee?.employeeName || !targetTenantId.value) return []
    return [
      {
        id: employeeId,
        tenantId: targetTenantId.value,
        employeeNo: employee.employeeNo ?? '',
        employeeName: employee.employeeName,
        employmentStatus: ''
      }
    ]
  }

  const loadEmployeeOptions = async (params: EmployeeSelectorContractParams) => {
    const result = await fetchPersonnelChangeEmployees(params)
    employeeOptions.value = result.data
    return { ...result, fieldAccess: {} }
  }

  const loadOrganizationOptions = async () => {
    const response = await fetchHrOrganizationTree('personnelChange', {
      tenantId: targetTenantId.value
    })
    return { ...response, data: toHrOrganizationTreeOptions(response.data ?? []) }
  }

  const loadPositionOptions = async (): Promise<Api.Hr.PositionOption[]> => {
    const result = await fetchAssignmentPositionOptions(form.model.toOrganizationId ?? undefined)
    positionOptions.value = result.data ?? []
    return positionOptions.value
  }

  const loadArchitectureOptions = async (kind: Api.Hr.JobArchitectureEntity) =>
    (await fetchJobArchitectureOptions(kind, targetTenantId.value)).data ?? []

  const applySelectedEmployee = (employeeId?: string): void => {
    const employee = employeeOptions.value.find((item) => item.id === employeeId)
    snapshot.data = employee?.assignmentSnapshot
    targetTenantId.value = employee?.tenantId || defaultWriteTenantId.value || undefined
    form.model.tenantId = targetTenantId.value
    if (!employee) return
    Object.assign(form.model, {
      beforeAssignmentSnapshot: cloneDeep(employee.assignmentSnapshot),
      baseAssignmentId: employee.assignmentId,
      baseAssignmentUpdatedAt: employee.assignmentUpdatedAt,
      fromOrganizationId: employee.assignmentSnapshot.organizationId,
      fromPositionId: employee.assignmentSnapshot.positionId,
      fromJobProfileId: employee.assignmentSnapshot.jobProfileId,
      fromGradeId: employee.assignmentSnapshot.gradeId,
      fromBusinessTitle: employee.assignmentSnapshot.businessTitle,
      fromEmploymentStatus: employee.employmentStatus
    })
    applyChangeTypeDefaults(form.model.changeType)
    void reloadTargetOptions(form.model.changeType)
  }

  const applyChangeTypeDefaults = (changeType?: string): void => {
    const statusMap: Record<string, Api.Hr.EmploymentStatus> = {
      regularization: 'active',
      suspension: 'leave',
      reinstatement: 'active',
      termination: 'terminated'
    }
    form.model.toEmploymentStatus = changeType ? (statusMap[changeType] ?? null) : null
    if (!positionChangeTypes.has(changeType ?? '')) {
      Object.assign(form.model, {
        toOrganizationId: null,
        toPositionId: null,
        toJobProfileId: null,
        toGradeId: null,
        toBusinessTitle: null
      })
    } else if (changeType === 'position_change') {
      form.model.toOrganizationId = snapshot.data?.organizationId ?? null
    } else if (careerChangeTypes.has(changeType ?? '')) {
      Object.assign(form.model, {
        toOrganizationId: snapshot.data?.organizationId ?? null,
        toPositionId: snapshot.data?.positionId ?? null,
        toJobProfileId: snapshot.data?.jobProfileId ?? null,
        toGradeId: snapshot.data?.gradeId ?? null,
        toBusinessTitle: snapshot.data?.businessTitle ?? null
      })
    } else if (changeType === 'transfer') {
      form.model.toOrganizationId = null
      form.model.toPositionId = null
    }
  }

  const reloadTargetOptions = async (changeType?: string): Promise<void> => {
    if (!changeType) return
    const tasks: Promise<void>[] = []
    if (positionChangeTypes.has(changeType)) {
      tasks.push(formRef.value?.reloadOptions('toOrganizationId') ?? Promise.resolve())
      tasks.push(formRef.value?.reloadOptions('toPositionId') ?? Promise.resolve())
    }
    if (careerChangeTypes.has(changeType)) {
      tasks.push(formRef.value?.reloadOptions('toJobProfileId') ?? Promise.resolve())
      tasks.push(formRef.value?.reloadOptions('toGradeId') ?? Promise.resolve())
    }
    await Promise.all(tasks)
  }

  const handleChangeType = (changeType?: string): void => {
    applyChangeTypeDefaults(changeType)
    formRef.value?.clearValidate([
      'toOrganizationId',
      'toPositionId',
      'toJobProfileId',
      'toGradeId',
      'toEmploymentStatus',
      'toBusinessTitle'
    ])
    void nextTick(() => reloadTargetOptions(changeType))
  }

  const handleOrganizationChange = (): void => {
    Object.assign(form.model, { toPositionId: null, toJobProfileId: null, toGradeId: null })
    void formRef.value?.reloadOptions('toPositionId')
  }

  const handlePositionChange = (positionId?: string): void => {
    const position = positionOptions.value.find((item) => item.id === positionId)
    if (!position) return
    Object.assign(form.model, {
      toOrganizationId: position.organizationId ?? form.model.toOrganizationId,
      toJobProfileId: position.jobProfileId,
      toGradeId: position.gradeId ?? null
    })
  }

  const form = reactive<FormState>({
    model: formModel,
    items: computed((): FormItem[] => {
      const changeType = formModel.changeType ?? ''
      return [
        {
          label: '异动基本信息',
          key: 'baseSection',
          type: positionChangeTypes.has(changeType) ? 'tab' : 'divider',
          span: 24
        },
        {
          label: '异动单号',
          key: 'changeNo',
          type: 'input',
          description: changeNumber.description.value,
          props: {
            maxlength: 60,
            ...changeNumber.inputProps(isEditing.value, '保存时自动生成', true)
          }
        },
        {
          label: '员工',
          key: 'employeeId',
          type: 'employeeSelect',
          props: {
            apiFn: loadEmployeeOptions,
            tenantId:
              tenantScopeStore.isAllTenants && !isEditing.value ? undefined : targetTenantId.value,
            allowAllTenantRead: true,
            selectedData: getSelectedEmployeeData(),
            placeholder: '请选择需要办理异动的员工',
            disabled: isEditing.value,
            onChange: (value?: string) => applySelectedEmployee(value),
            'onUpdate:selectedData': (rows: EmployeeIntegrationItem[]) => {
              const employee = rows[0]
              form.model.employee = employee
                ? {
                    id: employee.id,
                    employeeNo: employee.employeeNo,
                    employeeName: employee.employeeName
                  }
                : null
            }
          },
          description: '员工选定后，系统会读取并冻结当前有效任职快照。'
        },
        {
          label: '',
          key: 'assignmentSnapshot',
          type: 'input',
          span: 24,
          hidden: !formModel.employeeId
        },
        {
          label: '异动类型',
          key: 'changeType',
          type: 'select',
          props: {
            options: getDictMap.value.hrPersonnelChangeType ?? [],
            placeholder: '请选择异动类型',
            onChange: handleChangeType
          },
          description: '选择后仅展示本次异动真正需要维护的任职字段。'
        },
        {
          label: '生效日期',
          key: 'effectiveDate',
          type: 'date',
          props: {
            type: 'date',
            valueFormat: 'YYYY-MM-DD',
            class: '!w-full',
            placeholder: '请选择生效日期'
          }
        },
        {
          label: '异动后任职',
          key: 'targetSection',
          type: positionChangeTypes.has(changeType) ? 'tab' : 'divider',
          span: 24,
          hidden: !changeType
        },
        {
          label: '',
          key: 'targetGuidance',
          type: 'input',
          span: 24,
          hidden: !changeType
        },
        {
          label: '新组织',
          key: 'toOrganizationId',
          type: 'treeSelect',
          hidden: !positionChangeTypes.has(changeType),
          immediate: false,
          api: loadOrganizationOptions,
          resultField: 'data',
          props: {
            filterable: true,
            checkStrictly: true,
            renderAfterExpand: false,
            clearable: true,
            placeholder: '请选择新组织',
            onChange: handleOrganizationChange
          }
        },
        {
          label: '新岗位',
          key: 'toPositionId',
          type: 'select',
          hidden: !positionChangeTypes.has(changeType),
          immediate: false,
          api: loadPositionOptions,
          valueField: 'id',
          labelFn: (option) => `${option.positionName ?? ''} · ${option.positionCode ?? ''}`,
          props: {
            filterable: true,
            clearable: true,
            placeholder: formModel.toOrganizationId ? '请选择新岗位' : '请先选择新组织',
            onChange: handlePositionChange
          }
        },
        {
          label: '新标准职务',
          key: 'toJobProfileId',
          type: 'select',
          hidden: !careerChangeTypes.has(changeType),
          immediate: false,
          api: () => loadArchitectureOptions('profile'),
          valueField: 'id',
          labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
          props: {
            filterable: true,
            disabled: true,
            placeholder: '由目标岗位自动带出'
          },
          description: '标准职务属于岗位定义；如需变更，请选择对应的新岗位。'
        },
        {
          label: '新职级',
          key: 'toGradeId',
          type: 'select',
          hidden: !careerChangeTypes.has(changeType),
          immediate: false,
          api: () => loadArchitectureOptions('grade'),
          valueField: 'id',
          labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
          props: { filterable: true, clearable: true, placeholder: '请选择新职级' }
        },
        {
          label: '新任职状态',
          key: 'toEmploymentStatus',
          type: 'select',
          hidden: !statusChangeTypes.has(changeType),
          props: { options: getDictMap.value.hrEmploymentStatus ?? [], disabled: true }
        },
        {
          label: '新任职称谓',
          key: 'toBusinessTitle',
          type: 'input',
          span: 24,
          hidden: !titleChangeTypes.has(changeType),
          props: {
            maxlength: 80,
            clearable: true,
            placeholder: '可选，如“高级运输调度员”；不填写则展示标准职务名称'
          },
          help: '任职称谓仅用于个性化展示，不代替标准职务或具体岗位。'
        },
        { label: '异动依据', key: 'reasonSection', type: 'divider', span: 24 },
        {
          label: '异动原因',
          key: 'reason',
          type: 'input',
          span: 24,
          props: {
            type: 'textarea',
            rows: 3,
            maxlength: 500,
            showWordLimit: true,
            placeholder: '请填写异动依据、业务原因或审批说明'
          }
        },
        {
          label: '备注',
          key: 'remark',
          type: 'input',
          span: 24,
          props: {
            type: 'textarea',
            rows: 2,
            maxlength: 500,
            showWordLimit: true,
            placeholder: '可选'
          }
        }
      ]
    }),
    rules: computed(() => ({
      employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
      changeType: [{ required: true, message: '请选择异动类型', trigger: 'change' }],
      effectiveDate: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
      toOrganizationId: organizationalChangeTypes.has(formModel.changeType ?? '')
        ? [{ required: true, message: '请选择新组织', trigger: 'change' }]
        : [],
      toPositionId: ['transfer', 'position_change'].includes(formModel.changeType ?? '')
        ? [{ required: true, message: '请选择新岗位', trigger: 'change' }]
        : [],
      reason: [{ required: true, message: '请填写异动原因', trigger: 'blur' }]
    }))
  })

  const resetForm = async (): Promise<void> => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof Api.Hr.WorkspaceRecord])
    Object.assign(form.model, { status: 'draft' })
    snapshot.data = undefined
    snapshot.loading = false
    employeeOptions.value = []
    positionOptions.value = []
    targetTenantId.value = undefined
    await nextTick()
    formRef.value?.clearValidate()
  }

  const buildWriteRecord = (): Api.Hr.WorkspaceRecord => ({
    id: form.model.id,
    tenantId: targetTenantId.value,
    changeNo: form.model.changeNo,
    employeeId: form.model.employeeId,
    changeType: form.model.changeType,
    effectiveDate: form.model.effectiveDate,
    toOrganizationId: form.model.toOrganizationId ?? null,
    toPositionId: form.model.toPositionId ?? null,
    toJobProfileId: form.model.toJobProfileId ?? null,
    toGradeId: form.model.toGradeId ?? null,
    toBusinessTitle: form.model.toBusinessTitle ?? null,
    toEmploymentStatus: form.model.toEmploymentStatus ?? null,
    reason: form.model.reason,
    remark: form.model.remark ?? null
  })

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await savePersonnelChange(buildWriteRecord())
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (data: DialogOpenData): Promise<void> => {
    activeTab.value = 'baseSection'
    const recordTenantId = data.record?.id
      ? data.record.tenantId?.trim()
      : defaultWriteTenantId.value?.trim()
    if (!recordTenantId) {
      notifyFriendlyError(
        new Error('记录缺少目标租户'),
        '无法确定异动单所属租户，请刷新后重试',
        'warning'
      )
      return
    }
    currentWorkspace.value = data.workspace
    currentTab.value = data.tab
    isEditing.value = Boolean(data.record?.id)
    await resetForm()
    targetTenantId.value = recordTenantId
    Object.assign(
      form.model,
      cloneDeep({ status: 'draft', ...data.record, tenantId: recordTenantId })
    )
    snapshot.data = cloneDeep(data.record?.beforeAssignmentSnapshot)
    await dialogRef.value?.handleOpen(data, {
      title: data.record?.id ? '编辑人事异动单' : '新增人事异动单',
      subtitle: '先确认员工与异动类型，再维护本次需要变化的任职信息；审批通过后按生效日期更新。',
      size: 'lg',
      contentMaxHeight: 'calc(100vh - 184px)',
      confirmText: data.record?.id ? '保存更改' : '创建异动单',
      loading: true,
      onOpen: async (_openData, api) => {
        api.setLoading(true)
        try {
          await changeNumber.loadRule()
          await reloadTargetOptions(form.model.changeType)
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => {
        void resetForm()
        currentWorkspace.value = undefined
        currentTab.value = undefined
        isEditing.value = false
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .personnel-change-dialog {
    min-width: 0;

    &__guidance {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      width: 100%;
      padding: 14px 16px;
      background: color-mix(in srgb, var(--main-color) 6%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--main-color) 18%, var(--art-gray-200));
      border-radius: var(--el-border-radius-base);

      strong {
        display: block;
        margin-bottom: 2px;
        font-size: 14px;
        font-weight: 600;
        line-height: 22px;
        color: var(--art-gray-900);
      }

      p {
        margin: 0;
        font-size: 13px;
        line-height: 20px;
        color: var(--art-gray-600);
      }
    }

    &__guidance-icon {
      display: inline-grid;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 19px;
      color: var(--main-color);
      background: color-mix(in srgb, var(--main-color) 12%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    &__snapshot-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px 18px;
    }

    &__snapshot-item {
      display: grid;
      gap: 5px;
      min-width: 0;

      > span {
        font-size: 12px;
        line-height: 18px;
        color: var(--art-gray-600);
      }

      > strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 14px;
        font-weight: 600;
        line-height: 22px;
        color: var(--art-gray-900);
        white-space: nowrap;
      }
    }

    :deep(.art-section-card__body) {
      min-height: 92px;
    }

    :deep(.personnel-change-dialog__form > .el-form) {
      min-width: 0;
    }

    :deep(.art-form-item__content) {
      min-width: 0;
    }

    @media (width <= 900px) {
      &__snapshot-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (width <= 560px) {
      &__guidance {
        grid-template-columns: auto minmax(0, 1fr);

        .el-tag {
          grid-column: 2;
          justify-self: start;
        }
      }

      &__snapshot-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
