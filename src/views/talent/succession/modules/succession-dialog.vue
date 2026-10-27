<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="succession-dialog">
      <div class="succession-dialog__context" role="note">
        <ArtSvgIcon :icon="contextNote.icon" />
        <div class="succession-dialog__context-copy"
          ><strong>{{ contextNote.title }}</strong
          ><span>{{ contextNote.description }}</span></div
        >
        <ul aria-label="本次维护要点">
          <li v-for="signal in contextSignals" :key="signal">
            <ArtSvgIcon icon="ri:check-line" />
            {{ signal }}
          </li>
        </ul>
      </div>
      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id))"
        :rules="form.rules"
        :span="12"
        :gutter="24"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #ownerEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.ownerEmployeeId"
            v-model:selected-data="employeeSelection.owner"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchSuccessionEmployeeSelector"
            :display-fields="['jobTitle']"
            placeholder="可选：请选择负责人"
          />
        </template>
        <template #employeeId>
          <ArtEmployeeSelect
            v-model="form.model.employeeId"
            v-model:selected-data="employeeSelection.candidate"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchSuccessionEmployeeSelector"
            :display-fields="['jobTitle']"
            placeholder="请选择候选员工"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import dayjs from 'dayjs'
  import { uniqBy } from 'lodash-es'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, {
    type FormItem,
    type FormItemOption
  } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { fetchSuccessionOptions, saveSuccessionRecord } from '@hr/api'
  import { fetchSuccessionEmployeeSelector } from '@hr/api/modules/succession'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.SuccessionEntity
  type RecordItem = Api.Hr.SuccessionRecord
  interface FormModel {
    id?: string
    tenantId?: string
    planCode: string
    positionId?: string
    planName: string
    criticality: 'medium' | 'high' | 'critical'
    vacancyRisk: 'low' | 'medium' | 'high'
    businessImpact: 'medium' | 'high' | 'critical'
    targetSuccessors: number
    reviewCycleMonths: number
    nextReviewDate: string
    ownerEmployeeId?: string
    status: string
    notes?: string | null
    planId?: string
    employeeId?: string
    readiness: Api.Hr.SuccessionReadiness
    potentialLevel: 'emerging' | 'medium' | 'high'
    retentionRisk: 'low' | 'medium' | 'high'
    priority: number
    nominationSource: 'talent_review' | 'manager' | 'hr' | 'self' | 'external_assessment'
    aspirationConfirmed: boolean
    mobilityScope?: string | null
    strengths?: string | null
    developmentGaps?: string | null
    reviewComment?: string | null
    nominatedOn: string
    lastReviewedOn?: string | null
    candidateId?: string
    actionType: Api.Hr.SuccessionDevelopmentAction['actionType']
    actionTitle: string
    actionDescription?: string | null
    startDate: string
    dueDate: string
    completionDate?: string | null
    outcome?: string | null
  }
  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
    reloadOptions: (key: string) => Promise<void>
  }

  const emit = defineEmits<{ success: [type: DialogType] }>()
  const userStore = useUserStore()
  const nominationSourceOptions = useDictionaryOptions('hrSuccessionNominationSource')
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('plan')
  const tenantOptions = ref<FormItemOption[]>([])
  const positionOptions = shallowRef<Api.Hr.SuccessionReference[]>([])
  const employeeSelection = reactive<{
    owner: EmployeeIntegrationItem[]
    candidate: EmployeeIntegrationItem[]
  }>({ owner: [], candidate: [] })
  const planOptions = shallowRef<Api.Hr.SuccessionReference[]>([])
  const candidateOptions = shallowRef<Api.Hr.SuccessionReference[]>([])

  const createInitialModel = (): FormModel => ({
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    planCode: '',
    positionId: undefined,
    planName: '',
    criticality: 'high',
    vacancyRisk: 'medium',
    businessImpact: 'high',
    targetSuccessors: 2,
    reviewCycleMonths: 6,
    nextReviewDate: dayjs().add(6, 'month').format('YYYY-MM-DD'),
    ownerEmployeeId: undefined,
    status: 'draft',
    notes: null,
    planId: undefined,
    employeeId: undefined,
    readiness: 'development_needed',
    potentialLevel: 'emerging',
    retentionRisk: 'medium',
    priority: 1,
    nominationSource: 'talent_review',
    aspirationConfirmed: false,
    mobilityScope: null,
    strengths: null,
    developmentGaps: null,
    reviewComment: null,
    nominatedOn: dayjs().format('YYYY-MM-DD'),
    lastReviewedOn: null,
    candidateId: undefined,
    actionType: 'mentoring',
    actionTitle: '',
    actionDescription: null,
    startDate: dayjs().format('YYYY-MM-DD'),
    dueDate: dayjs().add(3, 'month').format('YYYY-MM-DD'),
    completionDate: null,
    outcome: null
  })

  const formModel = reactive<FormModel>(createInitialModel())
  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model: formModel,
    items: computed(() => {
      const common: FormItem[] = isPlatformSuper.value
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
      if (entity.value === 'plan')
        return [
          ...common,
          input('planCode', '计划编码', '如 SUCCESSION_OPS_01'),
          input('planName', '计划名称', '如 运输调度负责人继任计划'),
          select('positionId', '关键岗位', positionOptions.value, '请选择关键岗位'),
          { label: '计划负责人', key: 'ownerEmployeeId', type: 'input' },
          dict('criticality', '岗位关键度', 'hrSuccessionCriticality'),
          dict('vacancyRisk', '空缺风险', 'commonRiskLevel'),
          dict('businessImpact', '业务影响', 'hrSuccessionCriticality'),
          number('targetSuccessors', '目标继任人数', { min: 1, max: 20, precision: 0 }),
          number('reviewCycleMonths', '复盘周期（月）', { min: 1, max: 36, precision: 0 }),
          date('nextReviewDate', '下次复盘日期'),
          dict('status', '计划状态', 'hrSuccessionPlanStatus'),
          textarea('notes', '计划说明', '记录关键岗位风险背景、继任策略与评审口径')
        ]
      if (entity.value === 'candidate')
        return [
          ...common,
          select('planId', '继任计划', planOptions.value, '请选择目标计划'),
          { label: '候选人', key: 'employeeId', type: 'input' },
          dict('readiness', '继任准备度', 'hrSuccessionReadiness'),
          dict('potentialLevel', '人才潜力', 'hrSuccessionPotential'),
          dict('retentionRisk', '留任风险', 'commonRiskLevel'),
          number('priority', '计划内优先级', { min: 1, max: 20, precision: 0 }),
          nominationSourceItem(),
          { label: '已确认发展意愿', key: 'aspirationConfirmed', type: 'switch' },
          input('mobilityScope', '可流动范围', '如 同城 / 全国 / 海外'),
          date('nominatedOn', '提名日期'),
          textarea('strengths', '关键优势', '记录与目标岗位相关的核心优势'),
          textarea('developmentGaps', '发展差距', '记录距离目标岗位仍需补齐的能力'),
          textarea('reviewComment', '评审意见', '记录人才评审委员会意见')
        ]
      return [
        ...common,
        select('candidateId', '继任候选人', candidateOptions.value, '请选择候选人'),
        dict('actionType', '行动类型', 'hrSuccessionActionType'),
        input('actionTitle', '行动名称', '如 主持季度运营复盘'),
        { label: '行动负责人', key: 'ownerEmployeeId', type: 'input' },
        date('startDate', '开始日期'),
        date('dueDate', '截止日期'),
        dict('status', '行动状态', 'hrSuccessionActionStatus'),
        ...(formModel.status === 'completed'
          ? [
              date('completionDate', '完成日期'),
              textarea('outcome', '完成成果', '记录可验证的成果与能力变化')
            ]
          : []),
        textarea('actionDescription', '行动说明', '说明发展目标、执行方式和验收标准')
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<FormModel> = {
        tenantId: isPlatformSuper.value
          ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
          : []
      }
      if (entity.value === 'plan')
        Object.assign(rules, {
          planCode: required('请输入计划编码', 'blur'),
          planName: required('请输入计划名称', 'blur'),
          positionId: required('请选择关键岗位', 'change'),
          criticality: required('请选择岗位关键度', 'change'),
          vacancyRisk: required('请选择空缺风险', 'change'),
          businessImpact: required('请选择业务影响', 'change'),
          nextReviewDate: required('请选择复盘日期', 'change'),
          status: required('请选择计划状态', 'change')
        })
      if (entity.value === 'candidate')
        Object.assign(rules, {
          planId: required('请选择继任计划', 'change'),
          employeeId: required('请选择候选人', 'change'),
          readiness: required('请选择继任准备度', 'change'),
          potentialLevel: required('请选择人才潜力', 'change'),
          retentionRisk: required('请选择留任风险', 'change'),
          nominatedOn: required('请选择提名日期', 'change')
        })
      if (entity.value === 'action')
        Object.assign(rules, {
          candidateId: required('请选择继任候选人', 'change'),
          actionType: required('请选择行动类型', 'change'),
          actionTitle: required('请输入行动名称', 'blur'),
          startDate: required('请选择开始日期', 'change'),
          dueDate: required('请选择截止日期', 'change'),
          status: required('请选择行动状态', 'change'),
          completionDate:
            formModel.status === 'completed' ? required('请选择完成日期', 'change') : []
        })
      return rules
    })
  })

  const contextNote = computed(
    () =>
      ({
        plan: {
          icon: 'ri:briefcase-4-line',
          title: '关键岗位优先',
          description: '同一岗位只能有一个执行中的继任计划；目标覆盖人数用于持续识别梯队缺口。'
        },
        candidate: {
          icon: 'ri:user-star-line',
          title: '评审与意愿分离',
          description: '准备度、潜力、留任风险和发展意愿分别记录，避免以单一标签替代人才判断。'
        },
        action: {
          icon: 'ri:route-line',
          title: '可验证的发展行动',
          description: '每项行动都应指定截止日和验收成果，后续可关联学习、轮岗与绩效任务。'
        }
      })[entity.value]
  )
  const contextSignals = computed(
    () =>
      ({
        plan: ['岗位风险有依据', '覆盖目标可量化', '复盘日期明确'],
        candidate: ['准备度已评审', '发展意愿已确认', '差距记录可追踪'],
        action: ['责任人清晰', '截止日期明确', '成果可验证']
      })[entity.value]
  )
  const required = (message: string, trigger: 'blur' | 'change') => [
    { required: true, message, trigger }
  ]
  const input = (key: keyof FormModel, label: string, placeholder?: string): FormItem => ({
    label,
    key: String(key),
    type: 'input',
    props: { placeholder }
  })
  const number = (
    key: keyof FormModel,
    label: string,
    props: Record<string, unknown>
  ): FormItem => ({ label, key: String(key), type: 'number', props: { controls: false, ...props } })
  const date = (key: keyof FormModel, label: string): FormItem => ({
    label,
    key: String(key),
    type: 'date',
    props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
  })
  const dict = (key: keyof FormModel, label: string, code: string): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: getDictMap.value[code] ?? [],
    props: { placeholder: `请选择${label}` }
  })
  const textarea = (key: keyof FormModel, label: string, placeholder?: string): FormItem => ({
    label,
    key: String(key),
    type: 'input',
    span: 24,
    props: { type: 'textarea', rows: 3, maxlength: 800, showWordLimit: true, placeholder }
  })
  const select = (
    key: keyof FormModel,
    label: string,
    options: Api.Hr.SuccessionReference[],
    placeholder: string,
    clearable = false
  ): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: options.map((option) => ({
      label: `${option.name}${option.code ? ` · ${option.code}` : ''}${option.positionName ? ` · ${option.positionName}` : ''}`,
      value: option.id
    })),
    props: { filterable: true, clearable, placeholder }
  })
  const nominationSourceItem = (): FormItem => ({
    label: '提名来源',
    key: 'nominationSource',
    type: 'select',
    options: nominationSourceOptions,
    props: { placeholder: '请选择提名来源' }
  })
  const replaceModel = (next: FormModel) => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof FormModel])
    Object.assign(form.model, next)
  }

  const selectedReferences = shallowRef<
    Partial<Record<'position' | 'plan' | 'candidate', Api.Hr.SuccessionReference>>
  >({})
  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = form.model.tenantId
    const kind = entity.value
    positionOptions.value = []
    planOptions.value = []
    candidateOptions.value = []
    if (isPlatformSuper.value && !tenantId) {
      return
    }
    const [positions, plans, candidates] = await Promise.all([
      kind === 'plan' ? fetchSuccessionOptions('position', tenantId) : undefined,
      kind === 'candidate' ? fetchSuccessionOptions('plan', tenantId) : undefined,
      kind === 'action' ? fetchSuccessionOptions('candidate', tenantId) : undefined
    ])
    if (request !== referenceRequest || tenantId !== form.model.tenantId || kind !== entity.value)
      return
    const preserved = (
      key: 'position' | 'plan' | 'candidate',
      id?: string
    ): Api.Hr.SuccessionReference[] => {
      const reference = selectedReferences.value[key]
      return reference && reference.id === id && reference.tenantId === tenantId ? [reference] : []
    }
    positionOptions.value = uniqBy(
      [...(positions?.data ?? []), ...preserved('position', form.model.positionId)],
      'id'
    )
    planOptions.value = uniqBy(
      [...(plans?.data ?? []), ...preserved('plan', form.model.planId)],
      'id'
    )
    candidateOptions.value = uniqBy(
      [...(candidates?.data ?? []), ...preserved('candidate', form.model.candidateId)],
      'id'
    )
  }
  const reloadReferences = async () => {
    await nextTick()
    await Promise.all(
      ['positionId', 'planId', 'candidateId'].map((key) => formRef.value?.reloadOptions(key))
    )
  }
  const handleTenantChange = async () => {
    selectedReferences.value = {}
    form.model.positionId = undefined
    form.model.ownerEmployeeId = undefined
    form.model.planId = undefined
    form.model.employeeId = undefined
    form.model.candidateId = undefined
    employeeSelection.owner = []
    employeeSelection.candidate = []
    await loadReferences()
    await reloadReferences()
  }
  const validateBusiness = () => {
    if (entity.value === 'action' && form.model.dueDate < form.model.startDate)
      throw new Error('截止日期不能早于开始日期')
    if (
      entity.value === 'action' &&
      form.model.status === 'completed' &&
      !form.model.outcome?.trim()
    )
      throw new Error('完成的发展行动必须填写可验证成果')
  }
  const toRecord = (): RecordItem => {
    const common = { id: form.model.id, tenantId: form.model.tenantId }
    if (entity.value === 'plan')
      return {
        ...common,
        planCode: form.model.planCode,
        positionId: form.model.positionId!,
        planName: form.model.planName,
        criticality: form.model.criticality,
        vacancyRisk: form.model.vacancyRisk,
        businessImpact: form.model.businessImpact,
        targetSuccessors: Number(form.model.targetSuccessors),
        reviewCycleMonths: Number(form.model.reviewCycleMonths),
        nextReviewDate: form.model.nextReviewDate,
        ownerEmployeeId: form.model.ownerEmployeeId ?? null,
        status: form.model.status as Api.Hr.SuccessionPlanStatus,
        notes: form.model.notes
      }
    if (entity.value === 'candidate')
      return {
        ...common,
        planId: form.model.planId!,
        employeeId: form.model.employeeId!,
        readiness: form.model.readiness,
        potentialLevel: form.model.potentialLevel,
        retentionRisk: form.model.retentionRisk,
        priority: Number(form.model.priority),
        nominationSource: form.model.nominationSource,
        aspirationConfirmed: form.model.aspirationConfirmed,
        mobilityScope: form.model.mobilityScope,
        strengths: form.model.strengths,
        developmentGaps: form.model.developmentGaps,
        reviewComment: form.model.reviewComment,
        status: form.model.status as Api.Hr.SuccessionCandidateStatus,
        nominatedOn: form.model.nominatedOn,
        lastReviewedOn: form.model.lastReviewedOn
      }
    return {
      ...common,
      candidateId: form.model.candidateId!,
      actionType: form.model.actionType,
      actionTitle: form.model.actionTitle,
      actionDescription: form.model.actionDescription,
      ownerEmployeeId: form.model.ownerEmployeeId ?? null,
      startDate: form.model.startDate,
      dueDate: form.model.dueDate,
      status: form.model.status as Api.Hr.SuccessionActionStatus,
      completionDate: form.model.completionDate,
      outcome: form.model.outcome
    }
  }
  const handleSubmit = async () => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      validateBusiness()
      const type: DialogType = form.model.id ? 'edit' : 'add'
      await saveSuccessionRecord(entity.value, toRecord())
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }
  const handleOpen = async (nextEntity: Entity, row?: RecordItem) => {
    entity.value = nextEntity
    selectedReferences.value = {
      position: row && 'position' in row ? row.position : undefined,
      plan: row && 'plan' in row ? row.plan : undefined,
      candidate: row && 'candidate' in row ? row.candidate : undefined
    }
    replaceModel(createInitialModel())
    if (row)
      replaceModel({
        ...createInitialModel(),
        ...(structuredClone(toRaw(row)) as Partial<FormModel>),
        ownerEmployeeId: 'ownerEmployeeId' in row ? (row.ownerEmployeeId ?? undefined) : undefined
      })
    employeeSelection.owner =
      row && 'owner' in row ? employeeReferenceSelection(row.owner, form.model.tenantId) : []
    employeeSelection.candidate =
      row && 'employee' in row ? employeeReferenceSelection(row.employee, form.model.tenantId) : []
    if (nextEntity === 'candidate' && !row) form.model.status = 'nominated'
    if (nextEntity === 'action' && !row) form.model.status = 'planned'
    await nextTick()
    formRef.value?.clearValidate()
    const label = { plan: '继任计划', candidate: '继任候选人', action: '发展行动' }[nextEntity]
    await dialogRef.value?.handleOpen(undefined, {
      title: `${row ? '编辑' : '新增'}${label}`,
      subtitle: '继任信息按租户隔离，并通过独立 HR 管理权限访问',
      confirmText: row ? '保存更改' : '创建记录',
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
          await reloadReferences()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .succession-dialog {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;

    &__context {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: flex-start;
      padding: 14px 16px;
      color: var(--el-text-color-regular);
      background: color-mix(in srgb, var(--el-color-primary) 7%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--el-color-primary) 18%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > :deep(.art-svg-icon) {
        flex: 0 0 auto;
        margin-top: 2px;
        font-size: 20px;
        color: var(--el-color-primary);
      }

      &-copy {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      span {
        font-size: 13px;
        line-height: 1.6;
      }

      ul {
        display: grid;
        gap: 6px;
        min-width: 154px;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      li {
        display: flex;
        gap: 6px;
        align-items: center;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;

        :deep(.art-svg-icon) {
          font-size: 13px;
          color: var(--el-color-success);
        }
      }
    }
  }

  @media only screen and (width <= 767px) {
    .succession-dialog__context {
      grid-template-columns: 22px minmax(0, 1fr);

      ul {
        grid-template-columns: 1fr;
        grid-column: 2;
      }
    }
  }
</style>
