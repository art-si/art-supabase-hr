<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="mobility-dialog">
      <ArtEntitySummary
        :icon="entity === 'opportunity' ? 'ri:compass-3-line' : 'ri:user-follow-line'"
        :eyebrow="entity === 'opportunity' ? 'INTERNAL OPPORTUNITY' : 'EMPLOYEE APPLICATION'"
        :title="entity === 'opportunity' ? '内部机会与准入条件' : '内部流动申请'"
        :description="
          entity === 'opportunity'
            ? '定义岗位、轮岗、项目或短期任务；发布前可编辑，发布后进入受控申请流程。'
            : '申请将保留员工当前任职快照；录用接受后仍需通过人事异动完成正式任职变更。'
        "
      >
        <template #aside>
          <ElTag type="success" effect="light" round>
            <ArtSvgIcon icon="ri:shield-check-line" />不直接变更任职
          </ElTag>
        </template>
      </ArtEntitySummary>

      <section
        v-if="entity === 'application' && selectedOpportunity"
        class="mobility-dialog__target"
      >
        <span aria-hidden="true"><ArtSvgIcon icon="ri:briefcase-4-line" /></span>
        <div>
          <small>申请目标</small>
          <strong>{{ selectedOpportunity.opportunityTitle }}</strong>
          <p>
            {{ opportunityTypeLabel(selectedOpportunity.opportunityType) }} ·
            {{ selectedOpportunity.organizationName }}
            <template v-if="selectedOpportunity.positionName">
              · {{ selectedOpportunity.positionName }}
            </template>
          </p>
        </div>
        <span>{{ selectedOpportunity.applicationCloseDate }} 截止</span>
      </section>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id))"
        :rules="form.rules"
        :span="12"
        :gutter="22"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #hiringManagerEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.hiringManagerEmployeeId"
            v-model:selected-data="employeeSelection.manager"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchInternalMobilityEmployeeSelector"
            :display-fields="[]"
            placeholder="请选择机会负责人"
          />
        </template>
        <template #employeeId>
          <ArtEmployeeSelect
            v-model="form.model.employeeId"
            v-model:selected-data="employeeSelection.applicant"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchInternalMobilityEmployeeSelector"
            :display-fields="[]"
            :disabled="Boolean(form.model.id)"
            placeholder="请选择申请员工"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { toNameCodeOption } from '@/utils/form/option'

  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchInternalMobilityEmployeeSelector } from '@hr/api/modules/internal-mobility'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import {
    fetchHrOrganizationTree,
    fetchInternalMobilityOptions,
    saveInternalMobilityApplication,
    saveInternalMobilityOpportunity
  } from '@hr/api'
  import type { DialogType } from '@/types'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'

  type Entity = Api.Hr.InternalMobilityEntity
  type RecordItem = Api.Hr.InternalMobilityRecord

  interface OpenPayload {
    entity: Entity
    type: DialogType
    editData?: RecordItem
    opportunity?: Api.Hr.InternalMobilityOpportunity
    manageAccess?: boolean
  }

  interface FormModel {
    id?: string
    tenantId?: string
    opportunityCode: string
    opportunityTitle: string
    opportunityType: Api.Hr.InternalOpportunityType
    organizationId?: string
    positionId?: string
    hiringManagerEmployeeId?: string
    capacity: number
    workLocation: string
    workMode: Api.Hr.InternalMobilityWorkMode
    expectedStartDate: string
    expectedEndDate?: string
    applicationOpenDate: string
    applicationCloseDate: string
    minTenureMonths: number
    roleSummary: string
    requiredSkills: string
    eligibilityNotes: string
    version: number
    opportunityId?: string
    employeeId?: string
    motivation: string
    relevantExperience: string
    preferredStartDate?: string
    managerAwareness: Api.Hr.InternalMobilityManagerAwareness
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [entity: Entity, type: DialogType] }>()
  const userStore = useUserStore()
  const opportunityTypeOptions = useDictionaryOptions('hrMobilityOpportunityType')
  const workModeOptions = useDictionaryOptions('hrMobilityWorkMode')
  const managerAwarenessOptions = useDictionaryOptions('hrMobilityManagerAwareness')
  const { getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const entity = ref<Entity>('opportunity')
  const dialogType = ref<DialogType>('add')
  const manageAccess = ref(false)
  const selectedOpportunity = ref<Api.Hr.InternalMobilityOpportunity>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const references = reactive({
    organizations: [] as ReturnType<typeof toHrOrganizationTreeOptions>,
    positions: [] as Api.Hr.InternalMobilityReference[],
    opportunities: [] as Api.Hr.InternalMobilityReference[]
  })

  const employeeSelection = reactive<{
    manager: EmployeeIntegrationItem[]
    applicant: EmployeeIntegrationItem[]
  }>({ manager: [], applicant: [] })

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    opportunityCode: '',
    opportunityTitle: '',
    opportunityType: 'permanent',
    organizationId: undefined,
    positionId: undefined,
    hiringManagerEmployeeId: undefined,
    capacity: 1,
    workLocation: '',
    workMode: 'onsite',
    expectedStartDate: dayjs().add(14, 'day').format('YYYY-MM-DD'),
    expectedEndDate: undefined,
    applicationOpenDate: dayjs().format('YYYY-MM-DD'),
    applicationCloseDate: dayjs().add(10, 'day').format('YYYY-MM-DD'),
    minTenureMonths: 0,
    roleSummary: '',
    requiredSkills: '',
    eligibilityNotes: '',
    version: 1,
    opportunityId: undefined,
    employeeId: undefined,
    motivation: '',
    relevantExperience: '',
    preferredStartDate: undefined,
    managerAwareness: 'not_informed'
  })
  const formModel = reactive<FormModel>(createInitialModel())

  const opportunityTypeLabel = (value: Api.Hr.InternalOpportunityType): string =>
    ({ permanent: '永久岗位', rotation: '轮岗机会', project: '项目机会', gig: '短期任务' })[value]

  const tenantItems = computed<FormItem[]>(() =>
    isPlatformSuper.value && entity.value === 'opportunity'
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select',
            span: 24,
            options: tenantOptions.value,
            props: { filterable: true, placeholder: '请选择所属租户' }
          }
        ]
      : []
  )
  const filteredPositions = computed(() =>
    references.positions.filter(
      (item) => !formModel.organizationId || item.organizationId === formModel.organizationId
    )
  )

  const opportunityItems = computed<FormItem[]>(() => [
    ...tenantItems.value,
    { label: '机会定义', key: 'opportunityDefinition', type: 'divider', span: 24 },
    { label: '机会编码', key: 'opportunityCode', type: 'input', props: { maxlength: 40 } },
    { label: '机会名称', key: 'opportunityTitle', type: 'input', props: { maxlength: 160 } },
    {
      label: '机会类型',
      key: 'opportunityType',
      type: 'select',
      options: opportunityTypeOptions
    },
    hrOrganizationTreeField({
      key: 'organizationId',
      label: '目标组织',
      options: references.organizations
    }),
    ...(formModel.opportunityType === 'permanent'
      ? [
          {
            label: '目标岗位',
            key: 'positionId',
            type: 'select' as const,
            options: filteredPositions.value.map(toNameCodeOption),
            props: { filterable: true }
          }
        ]
      : [
          {
            label: '关联岗位（可选）',
            key: 'positionId',
            type: 'select' as const,
            options: filteredPositions.value.map(toNameCodeOption),
            props: { clearable: true, filterable: true }
          }
        ]),
    {
      label: '机会负责人',
      key: 'hiringManagerEmployeeId',
      type: 'input'
    },
    {
      label: '录用容量',
      key: 'capacity',
      type: 'number',
      props: { min: 1, max: 999, precision: 0, class: '!w-full' }
    },
    { label: '工作安排', key: 'workArrangement', type: 'divider', span: 24 },
    {
      label: '工作方式',
      key: 'workMode',
      type: 'select',
      options: workModeOptions
    },
    { label: '工作地点', key: 'workLocation', type: 'input', props: { maxlength: 160 } },
    { label: '预计开始日', key: 'expectedStartDate', type: 'date', props: { class: '!w-full' } },
    ...(formModel.opportunityType === 'permanent'
      ? []
      : [
          {
            label: '预计结束日',
            key: 'expectedEndDate',
            type: 'date' as const,
            props: { class: '!w-full' }
          }
        ]),
    { label: '申请开放日', key: 'applicationOpenDate', type: 'date', props: { class: '!w-full' } },
    { label: '申请截止日', key: 'applicationCloseDate', type: 'date', props: { class: '!w-full' } },
    {
      label: '最低任职月数',
      key: 'minTenureMonths',
      type: 'number',
      props: { min: 0, max: 600, precision: 0, class: '!w-full' }
    },
    { label: '角色与准入', key: 'roleAndEligibility', type: 'divider', span: 24 },
    {
      label: '角色说明',
      key: 'roleSummary',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 1200, showWordLimit: true }
    },
    {
      label: '所需技能',
      key: 'requiredSkills',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 800, showWordLimit: true }
    },
    {
      label: '其他准入说明',
      key: 'eligibilityNotes',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 800, showWordLimit: true }
    }
  ])

  const applicationItems = computed<FormItem[]>(() => [
    ...(!selectedOpportunity.value
      ? [
          {
            label: '申请机会',
            key: 'opportunityId',
            type: 'select' as const,
            span: 24,
            options: references.opportunities.map(toNameCodeOption),
            props: { filterable: true, disabled: Boolean(formModel.id) }
          }
        ]
      : []),
    ...(manageAccess.value
      ? [
          {
            label: '申请员工',
            key: 'employeeId',
            type: 'input' as const,
            span: 24,
            props: { filterable: true, disabled: Boolean(formModel.id) }
          }
        ]
      : []),
    { label: '申请说明', key: 'applicationStatement', type: 'divider', span: 24 },
    {
      label: '申请动机',
      key: 'motivation',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 4, maxlength: 1200, showWordLimit: true }
    },
    {
      label: '相关经验与优势',
      key: 'relevantExperience',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 1200, showWordLimit: true }
    },
    {
      label: '期望开始日',
      key: 'preferredStartDate',
      type: 'date',
      props: { clearable: true, class: '!w-full' }
    },
    {
      label: '直属经理知会',
      key: 'managerAwareness',
      type: 'select',
      options: managerAwarenessOptions
    }
  ])

  const formRules = computed<FormRules<FormModel>>(() => ({
    tenantId:
      isPlatformSuper.value && entity.value === 'opportunity'
        ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
        : [],
    opportunityCode:
      entity.value === 'opportunity' ? [{ required: true, message: '请输入机会编码' }] : [],
    opportunityTitle:
      entity.value === 'opportunity' ? [{ required: true, message: '请输入机会名称' }] : [],
    opportunityType:
      entity.value === 'opportunity' ? [{ required: true, message: '请选择机会类型' }] : [],
    organizationId:
      entity.value === 'opportunity' ? [{ required: true, message: '请选择目标组织' }] : [],
    positionId:
      entity.value === 'opportunity' && formModel.opportunityType === 'permanent'
        ? [{ required: true, message: '永久机会必须选择目标岗位' }]
        : [],
    hiringManagerEmployeeId:
      entity.value === 'opportunity' ? [{ required: true, message: '请选择机会负责人' }] : [],
    capacity: entity.value === 'opportunity' ? [{ required: true, message: '请输入录用容量' }] : [],
    expectedStartDate:
      entity.value === 'opportunity' ? [{ required: true, message: '请选择预计开始日' }] : [],
    expectedEndDate:
      entity.value === 'opportunity' && formModel.opportunityType !== 'permanent'
        ? [{ required: true, message: '临时机会必须选择预计结束日' }]
        : [],
    applicationOpenDate:
      entity.value === 'opportunity' ? [{ required: true, message: '请选择申请开放日' }] : [],
    applicationCloseDate:
      entity.value === 'opportunity' ? [{ required: true, message: '请选择申请截止日' }] : [],
    minTenureMonths:
      entity.value === 'opportunity' ? [{ required: true, message: '请输入最低任职月数' }] : [],
    roleSummary:
      entity.value === 'opportunity' ? [{ required: true, message: '请输入角色说明' }] : [],
    requiredSkills:
      entity.value === 'opportunity' ? [{ required: true, message: '请输入所需技能' }] : [],
    opportunityId:
      entity.value === 'application' ? [{ required: true, message: '请选择申请机会' }] : [],
    employeeId:
      entity.value === 'application' && manageAccess.value
        ? [{ required: true, message: '请选择申请员工' }]
        : [],
    motivation:
      entity.value === 'application' ? [{ required: true, message: '请输入申请动机' }] : [],
    managerAwareness:
      entity.value === 'application' ? [{ required: true, message: '请选择经理知会状态' }] : []
  }))
  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model: formModel,
    items: computed(() =>
      entity.value === 'opportunity' ? opportunityItems.value : applicationItems.value
    ),
    rules: formRules
  })

  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = formModel.tenantId
    const kind = entity.value
    references.organizations = []
    references.positions = []
    references.opportunities = []
    if (!tenantId && isPlatformSuper.value && kind === 'opportunity') return
    const [organizations, positions, opportunities] = await Promise.all([
      kind === 'opportunity'
        ? fetchHrOrganizationTree('internalMobility', { tenantId })
        : undefined,
      kind === 'opportunity' ? fetchInternalMobilityOptions('position', tenantId) : undefined,
      kind === 'application' && !selectedOpportunity.value
        ? fetchInternalMobilityOptions('opportunity', tenantId)
        : undefined
    ])
    if (request !== referenceRequest || tenantId !== formModel.tenantId || kind !== entity.value)
      return
    references.organizations = toHrOrganizationTreeOptions(organizations?.data ?? [])
    references.positions = positions?.data ?? []
    references.opportunities = opportunities?.data ?? []
  }

  const validateDates = (): boolean => {
    if (entity.value !== 'opportunity') return true
    if (dayjs(formModel.applicationCloseDate).isBefore(formModel.applicationOpenDate, 'day')) {
      ElMessage.warning('申请截止日不能早于开放日')
      return false
    }
    if (dayjs(formModel.expectedStartDate).isBefore(formModel.applicationOpenDate, 'day')) {
      ElMessage.warning('预计开始日不能早于申请开放日')
      return false
    }
    if (
      formModel.expectedEndDate &&
      dayjs(formModel.expectedEndDate).isBefore(formModel.expectedStartDate, 'day')
    ) {
      ElMessage.warning('预计结束日不能早于开始日')
      return false
    }
    return true
  }

  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!validateDates()) return false
      if (entity.value === 'opportunity') {
        await saveInternalMobilityOpportunity({
          id: formModel.id,
          tenantId: formModel.tenantId,
          opportunityCode: formModel.opportunityCode.trim(),
          opportunityTitle: formModel.opportunityTitle.trim(),
          opportunityType: formModel.opportunityType,
          organizationId: formModel.organizationId!,
          positionId: formModel.positionId || null,
          hiringManagerEmployeeId: formModel.hiringManagerEmployeeId!,
          capacity: formModel.capacity,
          workLocation: normalizeNullableText(formModel.workLocation),
          workMode: formModel.workMode,
          expectedStartDate: formModel.expectedStartDate,
          expectedEndDate:
            formModel.opportunityType === 'permanent' ? null : formModel.expectedEndDate || null,
          applicationOpenDate: formModel.applicationOpenDate,
          applicationCloseDate: formModel.applicationCloseDate,
          minTenureMonths: formModel.minTenureMonths,
          roleSummary: formModel.roleSummary.trim(),
          requiredSkills: formModel.requiredSkills.trim(),
          eligibilityNotes: normalizeNullableText(formModel.eligibilityNotes),
          status: 'draft',
          version: formModel.version
        })
      } else {
        await saveInternalMobilityApplication({
          id: formModel.id,
          tenantId: formModel.tenantId,
          opportunityId: formModel.opportunityId!,
          employeeId: formModel.employeeId,
          motivation: formModel.motivation.trim(),
          relevantExperience: normalizeNullableText(formModel.relevantExperience),
          preferredStartDate: formModel.preferredStartDate || null,
          managerAwareness: formModel.managerAwareness,
          status: 'draft'
        })
      }
      emit('success', entity.value, dialogType.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    entity.value = payload.entity
    dialogType.value = payload.type
    manageAccess.value = Boolean(payload.manageAccess)
    selectedOpportunity.value = payload.opportunity
    Object.assign(formModel, createInitialModel(), payload.editData ?? {})
    employeeSelection.manager = []
    employeeSelection.applicant = []
    const row = payload.editData
    if (row && 'hiringManagerEmployeeId' in row && row.hiringManagerName && row.tenantId) {
      employeeSelection.manager = [
        {
          id: row.hiringManagerEmployeeId,
          tenantId: row.tenantId,
          employeeName: row.hiringManagerName,
          employeeNo: '',
          employmentStatus: ''
        }
      ]
    }
    if (row && 'employeeName' in row && row.employeeId && row.employeeName && row.tenantId) {
      employeeSelection.applicant = [
        {
          id: row.employeeId,
          tenantId: row.tenantId,
          employeeName: row.employeeName,
          employeeNo: row.employeeNo ?? '',
          employmentStatus: ''
        }
      ]
    }
    if (payload.opportunity) {
      formModel.opportunityId = payload.opportunity.id
      formModel.tenantId = payload.opportunity.tenantId
    }
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}${payload.entity === 'opportunity' ? '内部机会' : '内部申请'}`,
      subtitle: '内部机会、员工选择与正式任职变更分层治理',
      confirmText: payload.type === 'add' ? '保存草稿' : '保存更改',
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

  watch(
    () => formModel.tenantId,
    async (tenantId, previous) => {
      if (!tenantId || tenantId === previous || dialogType.value !== 'add') return
      formModel.organizationId = undefined
      formModel.positionId = undefined
      formModel.hiringManagerEmployeeId = undefined
      formModel.employeeId = undefined
      employeeSelection.manager = []
      employeeSelection.applicant = []
      await loadReferences()
    }
  )
  watch(
    () => formModel.organizationId,
    () => {
      if (dialogType.value === 'add') formModel.positionId = undefined
    }
  )
  watch(
    () => formModel.opportunityType,
    (type) => {
      if (type === 'permanent') formModel.expectedEndDate = undefined
    }
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .mobility-dialog {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__target {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 15px 16px;
      border-radius: var(--art-surface-radius);

      > span:first-child {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        font-size: 20px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 11%, transparent);
        border-radius: var(--art-surface-radius);
      }

      div {
        display: grid;
        min-width: 0;
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

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__target {
      padding-block: 12px;
      background: var(--art-gray-100);
      border: 1px solid var(--art-card-border);

      > span:last-child {
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }
  }

  @media only screen and (width <= 767px) {
    .mobility-dialog {
      &__target {
        grid-template-columns: 44px minmax(0, 1fr);
      }

      &__target > span:last-child {
        grid-column: 1 / -1;
        justify-self: start;
      }
    }
  }
</style>
