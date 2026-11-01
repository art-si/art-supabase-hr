<template>
  <ArtDialog
    ref="dialogRef"
    @open="
      () => {
        activeTab = ''
      }
    "
    size="lg"
  >
    <div class="lifecycle-dialog">
      <ArtEntitySummary
        :icon="context.icon"
        :title="context.title"
        :description="context.description"
        spaced
      />

      <ArtForm
        ref="formRef"
        v-model:active-tab="activeTab"
        v-model="form.model"
        :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id))"
        :rules="form.rules"
        :span="12"
        :gutter="24"
        label-position="top"
      >
        <template #employeeId>
          <ArtEmployeeSelect
            v-model="form.model.employeeId"
            v-model:selected-data="selections.employee"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchLifecycleEmployeeSelector"
            :display-fields="[]"
            placeholder="请选择生命周期事项员工"
          />
        </template>
        <template #ownerEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.ownerEmployeeId"
            v-model:selected-data="selections.owner"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchLifecycleEmployeeSelector"
            :display-fields="[]"
            placeholder="请选择事项或任务负责人"
          />
        </template>
        <template #buddyEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.buddyEmployeeId"
            v-model:selected-data="selections.buddy"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchLifecycleEmployeeSelector"
            :display-fields="[]"
            placeholder="请选择入职伙伴（可选）"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { toNameCodeOption } from '@/utils/form/option'

  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import dayjs from 'dayjs'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, {
    type FormItem,
    type FormItemOption
  } from '@/components/core/forms/art-form/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'
  import { fetchHrOrganizationTree, fetchLifecycleOptions, saveLifecycleRecord } from '@hr/api'
  import { fetchLifecycleEmployeeSelector } from '@hr/api/modules/lifecycle'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.LifecycleEntity
  type RecordItem = Api.Hr.LifecycleRecord

  interface FormModel {
    id?: string
    tenantId?: string
    caseNo: string
    handoffId?: string
    employeeId?: string
    caseType: Api.Hr.LifecycleCaseType
    plannedEffectiveDate: string
    templateId?: string
    organizationId?: string
    positionId?: string
    ownerEmployeeId?: string
    buddyEmployeeId?: string
    priority: Api.Hr.LifecyclePriority
    remark?: string | null
    lifecycleCaseId?: string
    taskType: string
    taskName: string
    description?: string | null
    ownerRole: Api.Hr.LifecycleOwnerRole
    dueDate: string
    required: boolean
    blocking: boolean
    evidenceRequired: boolean
    sort: number
    templateCode: string
    templateName: string
    templateStatus: Api.Hr.LifecycleTemplateStatus
    isDefault: boolean
    dueOffsetDays: number
  }

  interface OpenPayload {
    entity: Entity
    type: DialogType
    editData?: RecordItem
    preset?: Partial<FormModel>
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [type: DialogType, entity: Entity] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const activeTab = ref('')
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('case')
  const tenantOptions = ref<FormItemOption[]>([])
  const caseOptions = shallowRef<Api.Hr.LifecycleReference[]>([])
  const templateOptions = shallowRef<Api.Hr.LifecycleReference[]>([])
  const organizationOptions = shallowRef<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const positionOptions = shallowRef<Api.Hr.LifecycleReference[]>([])
  const handoffOptions = shallowRef<Api.Hr.LifecycleReference[]>([])
  const selections = reactive({
    employee: [] as EmployeeIntegrationItem[],
    owner: [] as EmployeeIntegrationItem[],
    buddy: [] as EmployeeIntegrationItem[]
  })

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    caseNo: '',
    handoffId: undefined,
    employeeId: undefined,
    caseType: 'onboarding',
    plannedEffectiveDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
    templateId: undefined,
    organizationId: undefined,
    positionId: undefined,
    ownerEmployeeId: undefined,
    buddyEmployeeId: undefined,
    priority: 'normal',
    remark: null,
    lifecycleCaseId: undefined,
    taskType: 'other',
    taskName: '',
    description: null,
    ownerRole: 'hr',
    dueDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
    required: true,
    blocking: true,
    evidenceRequired: false,
    sort: 0,
    templateCode: '',
    templateName: '',
    templateStatus: 'draft',
    isDefault: false,
    dueOffsetDays: 0
  })
  const formModel = reactive<FormModel>(createInitialModel())

  const activeTemplateOptions = computed(() =>
    templateOptions.value.filter(
      (item) => item.caseType === formModel.caseType && item.status === 'active'
    )
  )

  const tenantItem = computed<FormItem[]>(() =>
    isPlatformSuper.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select',
            options: tenantOptions.value,
            props: {
              filterable: true,
              placeholder: '请选择所属租户',
              onChange: handleTenantChange
            }
          }
        ]
      : []
  )

  const caseItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '事项与来源', key: 'caseSection', type: 'tab', span: 24 },
    {
      label: '事项编号',
      key: 'caseNo',
      type: 'input',
      props: { clearable: true, placeholder: '留空由系统自动生成', maxlength: 60 }
    },
    {
      label: '事项类型',
      key: 'caseType',
      type: 'select',
      options: getDictMap.value.hrLifecycleCaseType ?? [],
      props: { placeholder: '请选择事项类型', onChange: handleCaseTypeChange }
    },
    {
      label: '招聘交接来源',
      key: 'handoffId',
      type: 'select',
      options: handoffOptions.value.map(toNameCodeOption),
      hidden: () => formModel.caseType !== 'onboarding' || Boolean(formModel.id),
      props: {
        clearable: true,
        filterable: true,
        placeholder: '可选：接收已完成的招聘交接',
        onChange: handleHandoffChange
      },
      description: '选择后自动带入员工、组织、岗位及交接负责人。'
    },
    { label: '员工', key: 'employeeId', type: 'input' },
    {
      label: '计划生效日期',
      key: 'plannedEffectiveDate',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', placeholder: '请选择计划生效日期' }
    },
    {
      label: '优先级',
      key: 'priority',
      type: 'select',
      options: getDictMap.value.hrLifecyclePriority ?? [],
      props: { placeholder: '请选择事项优先级' }
    },
    {
      label: '标准任务包',
      key: 'templateId',
      type: 'select',
      options: activeTemplateOptions.value.map(toNameCodeOption),
      props: { clearable: true, placeholder: '默认使用当前事项类型的标准任务包' },
      description: '建单时固化为实际任务，后续调整模板不会改写在途事项。'
    },
    { label: '组织与责任', key: 'ownerSection', type: 'tab', span: 24 },
    hrOrganizationTreeField({
      key: 'organizationId',
      label: '组织',
      options: organizationOptions.value,
      placeholder: '请选择事项所属组织'
    }),
    {
      label: '岗位',
      key: 'positionId',
      type: 'select',
      options: positionOptions.value.map(toNameCodeOption),
      props: { clearable: true, filterable: true, placeholder: '请选择事项关联岗位' }
    },
    { label: '事项负责人', key: 'ownerEmployeeId', type: 'input' },
    {
      label: '入职伙伴',
      key: 'buddyEmployeeId',
      type: 'input',
      hidden: () => formModel.caseType !== 'onboarding'
    },
    {
      label: '事项说明',
      key: 'remark',
      type: 'textarea',
      span: 24,
      props: { maxlength: 1000, placeholder: '说明背景、风险与需要协同的事项' }
    }
  ])

  const taskItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '任务归属', key: 'taskScopeSection', type: 'tab', span: 24 },
    {
      label: '生命周期事项',
      key: 'lifecycleCaseId',
      type: 'select',
      options: caseOptions.value.map(toNameCodeOption),
      props: { filterable: true, placeholder: '请选择生命周期事项' }
    },
    {
      label: '任务类型',
      key: 'taskType',
      type: 'select',
      options: getDictMap.value.hrLifecycleTaskType ?? [],
      props: { placeholder: '请选择任务类型' }
    },
    { label: '任务名称', key: 'taskName', type: 'input', props: { maxlength: 120 } },
    {
      label: '截止日期',
      key: 'dueDate',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', placeholder: '请选择任务截止日期' }
    },
    { label: '责任与门禁', key: 'taskControlSection', type: 'tab', span: 24 },
    {
      label: '责任泳道',
      key: 'ownerRole',
      type: 'select',
      options: getDictMap.value.hrLifecycleOwnerRole ?? [],
      props: { placeholder: '请选择责任泳道' }
    },
    { label: '具体负责人', key: 'ownerEmployeeId', type: 'input' },
    { label: '必办任务', key: 'required', type: 'switch' },
    {
      label: '阻断生效',
      key: 'blocking',
      type: 'switch',
      props: { disabled: !formModel.required }
    },
    { label: '要求完成证据', key: 'evidenceRequired', type: 'switch' },
    { label: '排序', key: 'sort', type: 'number', props: { min: 0, controls: false } },
    {
      label: '任务说明',
      key: 'description',
      type: 'textarea',
      span: 24,
      props: { maxlength: 1000, placeholder: '说明交付标准、协同对象和完成证据要求' }
    }
  ])

  const templateItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '任务包定义', key: 'templateSection', type: 'divider', span: 24 },
    { label: '任务包编码', key: 'templateCode', type: 'input', props: { maxlength: 60 } },
    { label: '任务包名称', key: 'templateName', type: 'input', props: { maxlength: 120 } },
    {
      label: '适用事项类型',
      key: 'caseType',
      type: 'select',
      options: getDictMap.value.hrLifecycleCaseType ?? [],
      props: { placeholder: '请选择适用事项类型' }
    },
    { label: '设为默认任务包', key: 'isDefault', type: 'switch' },
    {
      label: '任务包说明',
      key: 'description',
      type: 'textarea',
      span: 24,
      props: { maxlength: 1000, placeholder: '说明适用范围、治理要求和版本变更原因' }
    }
  ])

  const templateTaskItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '模板任务', key: 'templateTaskSection', type: 'divider', span: 24 },
    {
      label: '所属任务包',
      key: 'templateId',
      type: 'select',
      options: templateOptions.value
        .filter((item) => item.status !== 'active')
        .map(toNameCodeOption),
      props: { filterable: true, placeholder: '请选择草稿或停用任务包' }
    },
    {
      label: '任务类型',
      key: 'taskType',
      type: 'select',
      options: getDictMap.value.hrLifecycleTaskType ?? [],
      props: { placeholder: '请选择任务类型' }
    },
    { label: '任务名称', key: 'taskName', type: 'input', props: { maxlength: 120 } },
    {
      label: '责任泳道',
      key: 'ownerRole',
      type: 'select',
      options: getDictMap.value.hrLifecycleOwnerRole ?? [],
      props: { placeholder: '请选择责任泳道' }
    },
    {
      label: '相对生效日',
      key: 'dueOffsetDays',
      type: 'number',
      props: { min: -365, max: 365, controls: false },
      description: '负数表示生效日前，0 表示生效当天，正数表示生效日后。'
    },
    { label: '排序', key: 'sort', type: 'number', props: { min: 0, controls: false } },
    { label: '必办任务', key: 'required', type: 'switch' },
    {
      label: '阻断生效',
      key: 'blocking',
      type: 'switch',
      props: { disabled: !formModel.required }
    },
    { label: '要求完成证据', key: 'evidenceRequired', type: 'switch' },
    {
      label: '任务说明',
      key: 'description',
      type: 'textarea',
      span: 24,
      props: { maxlength: 1000, placeholder: '说明标准交付物和完成证据要求' }
    }
  ])

  const formItems = computed(() => {
    if (entity.value === 'case') return caseItems.value
    if (entity.value === 'task') return taskItems.value
    if (entity.value === 'template') return templateItems.value
    return templateTaskItems.value
  })
  const required = (message: string, trigger: 'blur' | 'change') => [
    { required: true, message, trigger }
  ]
  const formRules = computed<FormRules>(() => {
    if (entity.value === 'case')
      return {
        employeeId: required('请选择员工', 'change'),
        caseType: required('请选择事项类型', 'change'),
        plannedEffectiveDate: required('请选择计划生效日期', 'change'),
        priority: required('请选择事项优先级', 'change')
      }
    if (entity.value === 'task')
      return {
        lifecycleCaseId: required('请选择生命周期事项', 'change'),
        taskType: required('请选择任务类型', 'change'),
        taskName: required('请输入任务名称', 'blur'),
        dueDate: required('请选择截止日期', 'change'),
        ownerRole: required('请选择责任泳道', 'change')
      }
    if (entity.value === 'template')
      return {
        templateCode: required('请输入任务包编码', 'blur'),
        templateName: required('请输入任务包名称', 'blur'),
        caseType: required('请选择适用事项类型', 'change')
      }
    return {
      templateId: required('请选择所属任务包', 'change'),
      taskType: required('请选择任务类型', 'change'),
      taskName: required('请输入任务名称', 'blur'),
      ownerRole: required('请选择责任泳道', 'change')
    }
  })
  const form = computed(() => ({
    model: formModel,
    items: formItems.value,
    rules: formRules.value
  }))

  const context = computed(() => {
    const notes: Record<Entity, { icon: string; title: string; description: string }> = {
      case: {
        icon: 'ri:route-line',
        title: '审批通过只是开始，执行就绪才能生效',
        description: '标准任务包会固化为实际任务；阻断任务未完成时，事项不能进入就绪阶段。'
      },
      task: {
        icon: 'ri:task-line',
        title: '任务必须有责任、时限和完成证据',
        description: '责任泳道用于跨部门协作，具体负责人用于追责；必要任务可配置为生效门禁。'
      },
      template: {
        icon: 'ri:stack-line',
        title: '用标准任务包复制成熟流程',
        description: '启用后的任务包保持版本稳定；需要调整时先停用、修改并重新启用。'
      },
      template_task: {
        icon: 'ri:list-check-3',
        title: '按生效日定义统一 SLA',
        description: '相对天数让同一任务包适配不同生效日期，并统一必办、阻断与证据要求。'
      }
    }
    return notes[entity.value]
  })

  watch(
    () => formModel.required,
    (requiredValue) => {
      if (!requiredValue) formModel.blocking = false
    }
  )

  const resetSelections = (): void => {
    Object.assign(selections, { employee: [], owner: [], buddy: [] })
  }

  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = formModel.tenantId
    const kind = entity.value
    caseOptions.value = []
    templateOptions.value = []
    organizationOptions.value = []
    positionOptions.value = []
    handoffOptions.value = []
    if (isPlatformSuper.value && !tenantId) return
    const [cases, templates, organizations, positions, handoffs] = await Promise.all([
      kind === 'task' ? fetchLifecycleOptions('case', tenantId) : undefined,
      kind === 'case' || kind === 'template_task'
        ? fetchLifecycleOptions('template', tenantId)
        : undefined,
      kind === 'case' ? fetchHrOrganizationTree('lifecycle', { tenantId }) : undefined,
      kind === 'case' ? fetchLifecycleOptions('position', tenantId) : undefined,
      kind === 'case' ? fetchLifecycleOptions('handoff', tenantId) : undefined
    ])
    if (request !== referenceRequest || tenantId !== formModel.tenantId || kind !== entity.value)
      return
    caseOptions.value = cases?.data ?? []
    templateOptions.value = templates?.data ?? []
    organizationOptions.value = toHrOrganizationTreeOptions(organizations?.data ?? [])
    positionOptions.value = positions?.data ?? []
    handoffOptions.value = handoffs?.data ?? []
    if (entity.value === 'case' && !formModel.templateId) handleCaseTypeChange()
  }

  const handleTenantChange = async (): Promise<void> => {
    Object.assign(formModel, {
      handoffId: undefined,
      employeeId: undefined,
      templateId: undefined,
      organizationId: undefined,
      positionId: undefined,
      ownerEmployeeId: undefined,
      buddyEmployeeId: undefined,
      lifecycleCaseId: undefined
    })
    resetSelections()
    await loadReferences()
  }
  const handleCaseTypeChange = (): void => {
    const template = activeTemplateOptions.value[0]
    formModel.templateId = template?.id
    if (formModel.caseType !== 'onboarding') {
      formModel.handoffId = undefined
      formModel.buddyEmployeeId = undefined
      selections.buddy = []
    }
  }
  const handleHandoffChange = (value?: string): void => {
    const handoff = handoffOptions.value.find((item) => item.id === value)
    if (!handoff) return
    Object.assign(formModel, {
      employeeId: handoff.employeeId,
      organizationId: handoff.organizationId,
      positionId: handoff.positionId
    })
    if (handoff.employeeId)
      selections.employee = employeeReferenceSelection(
        {
          id: handoff.employeeId,
          code: handoff.code,
          name: handoff.name
        },
        formModel.tenantId
      )
  }

  const toRecord = (): RecordItem => {
    if (entity.value === 'case')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        caseNo: formModel.caseNo,
        handoffId: formModel.handoffId,
        employeeId: formModel.employeeId!,
        caseType: formModel.caseType,
        plannedEffectiveDate: formModel.plannedEffectiveDate,
        status: 'draft',
        templateId: formModel.templateId,
        organizationId: formModel.organizationId,
        positionId: formModel.positionId,
        ownerEmployeeId: formModel.ownerEmployeeId,
        buddyEmployeeId: formModel.buddyEmployeeId,
        priority: formModel.priority,
        executionStatus: 'planning',
        remark: formModel.remark
      }
    if (entity.value === 'task')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        lifecycleCaseId: formModel.lifecycleCaseId!,
        taskType: formModel.taskType,
        taskName: formModel.taskName,
        description: formModel.description,
        ownerEmployeeId: formModel.ownerEmployeeId,
        ownerRole: formModel.ownerRole,
        dueDate: formModel.dueDate,
        required: formModel.required,
        blocking: formModel.blocking,
        evidenceRequired: formModel.evidenceRequired,
        status: 'pending',
        sort: Number(formModel.sort)
      }
    if (entity.value === 'template')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        templateCode: formModel.templateCode,
        templateName: formModel.templateName,
        caseType: formModel.caseType,
        status: formModel.templateStatus,
        isDefault: formModel.isDefault,
        description: formModel.description
      }
    return {
      id: formModel.id,
      tenantId: formModel.tenantId,
      templateId: formModel.templateId!,
      taskType: formModel.taskType,
      taskName: formModel.taskName,
      description: formModel.description,
      ownerRole: formModel.ownerRole,
      dueOffsetDays: Number(formModel.dueOffsetDays),
      required: formModel.required,
      blocking: formModel.blocking,
      evidenceRequired: formModel.evidenceRequired,
      sort: Number(formModel.sort)
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const type: DialogType = formModel.id ? 'edit' : 'add'
      await saveLifecycleRecord(entity.value, toRecord())
      emit('success', type, entity.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const initializeModel = (payload: OpenPayload): void => {
    const record = payload.editData
    Object.assign(formModel, createInitialModel(), payload.preset, record ?? {})
    if (record && entity.value === 'template')
      formModel.templateStatus = (record as Api.Hr.LifecycleTemplate).status
    const caseRecord =
      record && entity.value === 'case' ? (record as Api.Hr.LifecycleCase) : undefined
    const taskRecord =
      record && entity.value === 'task' ? (record as Api.Hr.LifecycleTask) : undefined
    selections.employee = employeeReferenceSelection(caseRecord?.employee, formModel.tenantId)
    selections.owner = employeeReferenceSelection(
      caseRecord?.owner ?? taskRecord?.owner,
      formModel.tenantId
    )
    selections.buddy = employeeReferenceSelection(caseRecord?.buddy, formModel.tenantId)
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    entity.value = payload.entity
    resetSelections()
    initializeModel(payload)
    const titles: Record<Entity, string> = {
      case: '生命周期事项',
      task: '执行任务',
      template: '标准任务包',
      template_task: '模板任务'
    }
    await dialogRef.value?.handleOpen(payload, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}${titles[payload.entity]}`,
      subtitle: '员工生命周期运营 · 责任、时限、门禁与证据全程留痕',
      contentMaxHeight: '72vh',
      confirmText: payload.type === 'add' ? '创建记录' : '保存更改',
      onConfirm: handleSubmit,
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          if (isPlatformSuper.value && !tenantOptions.value.length) {
            const tenants = await fetchEnabledTenantList()
            tenantOptions.value = (tenants.data ?? []).map((tenant) => ({
              label: tenant.tenantName,
              value: tenant.id
            }))
          }
          await loadReferences()
          await nextTick()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      }
    })
  }

  defineExpose({ handleOpen })
</script>
