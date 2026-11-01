<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="org-design-dialog">
      <ArtEntitySummary
        :icon="entity === 'scenario' ? 'ri:git-branch-line' : 'ri:node-tree'"
        :eyebrow="entity === 'scenario' ? 'CHANGE SCENARIO' : 'PROPOSED ORGANIZATION DELTA'"
        :title="entity === 'scenario' ? '组织变革情景方案' : '组织结构变更项'"
        :description="
          entity === 'scenario'
            ? '定义变革目标、生效窗口和责任人，方案评审前不会影响当前组织。'
            : '仅记录拟议变化；提交评审时才固化关联员工、岗位、招聘、权限和政策范围影响。'
        "
      >
        <template #aside>
          <ElTag type="success" effect="light" round>
            <ArtSvgIcon icon="ri:shield-check-line" />不直接改主数据
          </ElTag>
        </template>
      </ArtEntitySummary>
      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id) || parentTenantLocked)"
        :rules="form.rules"
        :span="12"
        :gutter="22"
        label-position="top"
      >
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { toNameCodeOption } from '@/utils/form/option'

  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { watchIgnorable } from '@vueuse/core'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import dayjs from 'dayjs'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { fetchOrganizationDesignEmployeeSelector } from '@hr/api/modules/organization-design'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions,
    withoutHrOrganizationBranch
  } from '../../../shared/hr-organization-tree-field'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import {
    fetchHrOrganizationTree,
    fetchOrganizationDesignOptions,
    saveOrganizationDesignChange,
    saveOrganizationDesignScenario
  } from '@hr/api'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.OrganizationDesignEntity
  type RecordItem = Api.Hr.OrganizationDesignRecord

  interface OpenPayload {
    entity: Entity
    type: DialogType
    editData?: RecordItem
    scenario?: Api.Hr.OrganizationDesignScenario
  }

  interface FormModel {
    id?: string
    tenantId?: string
    scenarioCode: string
    scenarioName: string
    objective: string
    effectiveDate: string
    ownerEmployeeId?: string
    version: number
    scenarioId?: string
    changeType: Api.Hr.OrganizationChangeType
    organizationId?: string
    proposedParentId?: string
    proposedCode?: string
    proposedName?: string
    proposedType?: string
    rationale: string
    sequence: number
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [entity: Entity, type: DialogType] }>()
  const userStore = useUserStore()
  const changeTypeOptions = useDictionaryOptions('hrOrganizationChangeType')
  const organizationTypeOptions = useDictionaryOptions('organizationType')
  const { getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const entity = ref<Entity>('scenario')
  const dialogType = ref<DialogType>('add')
  const parentTenantLocked = ref(false)
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const organizationOptions = ref<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const ownerSelection = shallowRef<EmployeeIntegrationItem[]>([])
  const references = reactive({
    scenarios: [] as Api.Hr.OrganizationDesignReference[]
  })

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    scenarioCode: '',
    scenarioName: '',
    objective: '',
    effectiveDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    ownerEmployeeId: undefined,
    version: 1,
    scenarioId: undefined,
    changeType: 'create',
    organizationId: undefined,
    proposedParentId: undefined,
    proposedCode: undefined,
    proposedName: undefined,
    proposedType: 'department',
    rationale: '',
    sequence: 10
  })
  const formModel = reactive<FormModel>(createInitialModel())

  const tenantItems = computed<FormItem[]>((): FormItem[] =>
    isPlatformSuper.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select',
            span: 24,
            options: tenantOptions.value,
            props: { filterable: true, disabled: Boolean(formModel.id) }
          }
        ]
      : []
  )

  const scenarioItems = computed<FormItem[]>((): FormItem[] => [
    ...tenantItems.value,
    { label: '方案定义', key: 'scenarioDefinition', type: 'divider', span: 24 },
    { label: '方案编码', key: 'scenarioCode', type: 'input', props: { maxlength: 40 } },
    { label: '方案名称', key: 'scenarioName', type: 'input', props: { maxlength: 160 } },
    { label: '计划生效日', key: 'effectiveDate', type: 'date', props: { class: '!w-full' } },
    {
      props: {
        selectedData: ownerSelection.value,
        'onUpdate:selectedData': ($event: typeof ownerSelection.value) => {
          ownerSelection.value = $event
        },
        tenantId: form.model.tenantId,
        apiFn: fetchOrganizationDesignEmployeeSelector,
        displayFields: ['jobTitle'],
        placeholder: '可选：请选择方案负责人'
      },
      label: '方案负责人',
      key: 'ownerEmployeeId',
      type: 'employeeSelect'
    },
    {
      label: '变革目标与业务理由',
      key: 'objective',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 4, maxlength: 1000, showWordLimit: true }
    }
  ])

  const changeItems = computed<FormItem[]>((): FormItem[] => [
    ...tenantItems.value,
    { label: '方案与动作', key: 'changeDefinition', type: 'divider', span: 24 },
    {
      label: '所属方案',
      key: 'scenarioId',
      type: 'select',
      options: references.scenarios.map(toNameCodeOption),
      props: { filterable: true, disabled: Boolean(formModel.id) }
    },
    {
      label: '变更类型',
      key: 'changeType',
      type: 'select',
      options: changeTypeOptions
    },
    ...(formModel.changeType !== 'create'
      ? [
          hrOrganizationTreeField({
            key: 'organizationId',
            label: '目标组织',
            options: organizationOptions.value,
            disabled: Boolean(formModel.id),
            onChange: () => {
              formModel.proposedParentId = undefined
            }
          })
        ]
      : []),
    ...(['create', 'reparent'].includes(formModel.changeType)
      ? [
          hrOrganizationTreeField({
            key: 'proposedParentId',
            label: '拟上级组织',
            options: withoutHrOrganizationBranch(
              organizationOptions.value,
              formModel.changeType === 'reparent' ? formModel.organizationId : undefined
            ),
            clearable: formModel.changeType === 'create'
          })
        ]
      : []),
    ...(formModel.changeType === 'create'
      ? [
          {
            label: '拟组织编码',
            key: 'proposedCode',
            type: 'input' as const,
            props: { maxlength: 50 }
          },
          {
            label: '拟组织名称',
            key: 'proposedName',
            type: 'input' as const,
            props: { maxlength: 160 }
          },
          {
            label: '拟组织类型',
            key: 'proposedType',
            type: 'select' as const,
            options: organizationTypeOptions
          }
        ]
      : []),
    ...(formModel.changeType === 'rename'
      ? [
          {
            label: '拟组织名称',
            key: 'proposedName',
            type: 'input' as const,
            props: { maxlength: 160 }
          }
        ]
      : []),
    { label: '变更说明', key: 'changeRationale', type: 'divider', span: 24 },
    {
      label: '执行顺序',
      key: 'sequence',
      type: 'number',
      props: { min: 0, max: 9999, precision: 0, class: '!w-full' }
    },
    {
      label: '业务理由与预期结果',
      key: 'rationale',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 4, maxlength: 1000, showWordLimit: true }
    }
  ])

  const formRules = computed<FormRules<FormModel>>(() => ({
    tenantId: isPlatformSuper.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    scenarioCode:
      entity.value === 'scenario' ? [{ required: true, message: '请输入方案编码' }] : [],
    scenarioName:
      entity.value === 'scenario' ? [{ required: true, message: '请输入方案名称' }] : [],
    objective: entity.value === 'scenario' ? [{ required: true, message: '请输入变革目标' }] : [],
    effectiveDate:
      entity.value === 'scenario' ? [{ required: true, message: '请选择计划生效日' }] : [],
    scenarioId: entity.value === 'change' ? [{ required: true, message: '请选择所属方案' }] : [],
    changeType: entity.value === 'change' ? [{ required: true, message: '请选择变更类型' }] : [],
    organizationId:
      entity.value === 'change' && formModel.changeType !== 'create'
        ? [{ required: true, message: '请选择目标组织' }]
        : [],
    proposedParentId:
      entity.value === 'change' && formModel.changeType === 'reparent'
        ? [{ required: true, message: '请选择拟上级组织' }]
        : [],
    proposedCode:
      entity.value === 'change' && formModel.changeType === 'create'
        ? [{ required: true, message: '请输入拟组织编码' }]
        : [],
    proposedName:
      entity.value === 'change' && ['create', 'rename'].includes(formModel.changeType)
        ? [{ required: true, message: '请输入拟组织名称' }]
        : [],
    proposedType:
      entity.value === 'change' && formModel.changeType === 'create'
        ? [{ required: true, message: '请选择拟组织类型' }]
        : [],
    rationale: entity.value === 'change' ? [{ required: true, message: '请输入业务理由' }] : []
  }))
  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model: formModel,
    items: computed((): FormItem[] =>
      entity.value === 'scenario' ? scenarioItems.value : changeItems.value
    ),
    rules: formRules
  })

  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = formModel.tenantId
    const kind = entity.value
    organizationOptions.value = []
    references.scenarios = []
    if (!tenantId && isPlatformSuper.value) return
    const kinds = kind === 'change' ? (['scenario'] as const) : ([] as const)
    const [responses, organizations] = await Promise.all([
      Promise.all(kinds.map((kind) => fetchOrganizationDesignOptions(kind, tenantId))),
      kind === 'change' ? fetchHrOrganizationTree('organizationDesign', { tenantId }) : undefined
    ])
    if (request !== referenceRequest || tenantId !== formModel.tenantId || kind !== entity.value)
      return
    organizationOptions.value = toHrOrganizationTreeOptions(organizations?.data ?? [])
    kinds.forEach((kind, index) => {
      references[`${kind}s` as keyof typeof references] = responses[index]?.data ?? []
    })
  }
  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        entity.value === 'change' &&
        formModel.changeType === 'reparent' &&
        formModel.organizationId === formModel.proposedParentId
      ) {
        ElMessage.warning('目标组织不能成为自己的上级')
        return false
      }
      if (entity.value === 'scenario')
        await saveOrganizationDesignScenario({
          id: formModel.id,
          tenantId: formModel.tenantId,
          scenarioCode: formModel.scenarioCode.trim(),
          scenarioName: formModel.scenarioName.trim(),
          objective: formModel.objective.trim(),
          effectiveDate: formModel.effectiveDate,
          ownerEmployeeId: formModel.ownerEmployeeId || null,
          status: 'draft',
          riskLevel: 'unassessed',
          version: formModel.version
        })
      else
        await saveOrganizationDesignChange({
          id: formModel.id,
          tenantId: formModel.tenantId,
          scenarioId: formModel.scenarioId!,
          changeType: formModel.changeType,
          organizationId: formModel.changeType === 'create' ? null : formModel.organizationId,
          proposedParentId: ['create', 'reparent'].includes(formModel.changeType)
            ? formModel.proposedParentId || null
            : null,
          proposedCode: formModel.changeType === 'create' ? formModel.proposedCode?.trim() : null,
          proposedName: ['create', 'rename'].includes(formModel.changeType)
            ? formModel.proposedName?.trim()
            : null,
          proposedType: formModel.changeType === 'create' ? formModel.proposedType : null,
          rationale: formModel.rationale.trim(),
          sequence: formModel.sequence
        })
      emit('success', entity.value, dialogType.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }
  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    parentTenantLocked.value = Boolean(payload.scenario)
    referenceRequest += 1
    ignoreTenantUpdates(() => {
      entity.value = payload.entity
      dialogType.value = payload.type
      Object.assign(formModel, createInitialModel(), payload.editData ?? {})
      ownerSelection.value =
        payload.editData &&
        'ownerEmployeeId' in payload.editData &&
        payload.editData.ownerEmployeeId
          ? employeeReferenceSelection(
              {
                id: payload.editData.ownerEmployeeId,
                name: payload.editData.ownerEmployeeName,
                code: payload.editData.ownerEmployeeNo
              },
              formModel.tenantId
            )
          : []
      if (payload.scenario) {
        formModel.scenarioId = payload.scenario.id
        formModel.tenantId = payload.scenario.tenantId
      }
    })
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}${payload.entity === 'scenario' ? '组织变革方案' : '组织变更项'}`,
      subtitle: '方案、影响评审与组织主数据执行分层治理',
      confirmText: payload.type === 'add' ? '创建草稿' : '保存更改',
      contentMaxHeight: 'calc(100vh - 184px)',
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          if (isPlatformSuper.value && !tenantOptions.value.length) {
            const response = await fetchEnabledTenantList()
            tenantOptions.value = (response.data ?? []).map((tenant) => ({
              label: `${tenant.tenantName}（${tenant.tenantCode}）`,
              value: tenant.id!
            }))
          }
          await loadReferences()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: submit
    })
  }
  const { ignoreUpdates: ignoreTenantUpdates } = watchIgnorable(
    () => formModel.tenantId,
    async (tenantId, previous) => {
      if (tenantId === previous || dialogType.value !== 'add') return
      ownerSelection.value = []
      formModel.ownerEmployeeId = undefined
      formModel.scenarioId = undefined
      formModel.organizationId = undefined
      formModel.proposedParentId = undefined
      await loadReferences()
    }
  )
  watch(
    () => formModel.changeType,
    () => {
      if (dialogType.value === 'add') {
        formModel.organizationId = undefined
        formModel.proposedParentId = undefined
        formModel.proposedCode = undefined
        formModel.proposedName = undefined
      }
    }
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .org-design-dialog {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
</style>
