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
    <div class="performance-dialog">
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
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchPerformanceEmployeeSelector } from '@hr/api/modules/performance'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'
  import { fetchHrOrganizationTree, fetchPerformanceOptions, savePerformanceRecord } from '@hr/api'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.PerformanceEntity
  type RecordItem = Api.Hr.PerformanceRecord

  interface FormModel {
    id?: string
    tenantId?: string
    cycleCode: string
    cycleName: string
    startDate: string
    endDate: string
    ownerEmployeeId?: string
    checkInFrequencyDays: number
    selfReviewDueDate?: string | null
    managerReviewDueDate?: string | null
    calibrationDueDate?: string | null
    description?: string | null
    cycleId?: string
    employeeId?: string
    reviewerEmployeeId?: string
    reviewId?: string
    goalName: string
    targetDescription: string
    goalType: Api.Hr.PerformanceGoal['goalType']
    weight: number
    dueDate?: string | null
    progressPercent: number
    goalStatus: Api.Hr.PerformanceGoalStatus
    actualResult?: string | null
    evidenceSource?: string | null
    employeeScore?: number | null
    managerScore?: number | null
    checkInDate: string
    riskStatus: Api.Hr.PerformanceCheckIn['riskStatus']
    achievement?: string | null
    blocker?: string | null
    nextAction: string
    managerFeedback?: string | null
    facilitatorEmployeeId?: string
    sessionNo: string
    sessionName: string
    organizationId?: string
    scheduledAt: string
    distributionNote?: string | null
    calibratedScore: number
    calibratedLevel: Api.Hr.PerformanceLevel
    adjustmentReason?: string | null
    originalScore: number
    originalLevel: Api.Hr.PerformanceLevel
    sessionId?: string
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  interface OpenPayload {
    entity: Entity
    type: DialogType
    editData?: RecordItem
    preset?: Partial<FormModel>
  }

  const emit = defineEmits<{ success: [type: DialogType, entity: Entity] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const activeTab = ref('')
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('cycle')
  const tenantOptions = ref<FormItemOption[]>([])
  const cycleOptions = shallowRef<Api.Hr.PerformanceReference[]>([])
  const reviewOptions = shallowRef<Api.Hr.PerformanceReference[]>([])
  const organizationOptions = shallowRef<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const selections = reactive({
    owner: [] as EmployeeIntegrationItem[],
    employee: [] as EmployeeIntegrationItem[],
    reviewer: [] as EmployeeIntegrationItem[],
    facilitator: [] as EmployeeIntegrationItem[]
  })

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    cycleCode: '',
    cycleName: '',
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('year').format('YYYY-MM-DD'),
    ownerEmployeeId: undefined,
    checkInFrequencyDays: 30,
    selfReviewDueDate: dayjs().endOf('year').subtract(45, 'day').format('YYYY-MM-DD'),
    managerReviewDueDate: dayjs().endOf('year').subtract(20, 'day').format('YYYY-MM-DD'),
    calibrationDueDate: dayjs().endOf('year').subtract(7, 'day').format('YYYY-MM-DD'),
    description: null,
    cycleId: undefined,
    employeeId: undefined,
    reviewerEmployeeId: undefined,
    reviewId: undefined,
    goalName: '',
    targetDescription: '',
    goalType: 'business',
    weight: 0,
    dueDate: dayjs().endOf('year').format('YYYY-MM-DD'),
    progressPercent: 0,
    goalStatus: 'draft',
    actualResult: null,
    evidenceSource: null,
    employeeScore: null,
    managerScore: null,
    checkInDate: dayjs().format('YYYY-MM-DD'),
    riskStatus: 'on_track',
    achievement: null,
    blocker: null,
    nextAction: '',
    managerFeedback: null,
    facilitatorEmployeeId: undefined,
    sessionNo: '',
    sessionName: '',
    organizationId: undefined,
    scheduledAt: dayjs().add(7, 'day').format('YYYY-MM-DD HH:mm:ss'),
    distributionNote: null,
    calibratedScore: 0,
    calibratedLevel: 'b',
    adjustmentReason: null,
    originalScore: 0,
    originalLevel: 'b',
    sessionId: undefined
  })

  const formModel = reactive<FormModel>(createInitialModel())
  const commonItems = computed<FormItem[]>((): FormItem[] =>
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

  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model: formModel,
    items: computed((): FormItem[] => {
      const common = commonItems.value
      if (entity.value === 'cycle')
        return [
          ...common,
          input('cycleCode', '周期编码', '如 PERF_2027_ANNUAL'),
          input('cycleName', '周期名称', '如 2027 年度绩效周期'),
          {
            props: {
              selectedData: selections.owner,
              'onUpdate:selectedData': ($event: typeof selections.owner) => {
                selections.owner = $event
              },
              tenantId: form.model.tenantId,
              apiFn: fetchPerformanceEmployeeSelector,
              displayFields: [],
              placeholder: '请选择周期负责人'
            },
            label: '周期负责人',
            key: 'ownerEmployeeId',
            type: 'employeeSelect'
          },
          number('checkInFrequencyDays', '沟通频率（天）', { min: 7, max: 365, precision: 0 }),
          date('startDate', '周期开始'),
          date('endDate', '周期结束'),
          date('selfReviewDueDate', '自评截止'),
          date('managerReviewDueDate', '主管评价截止'),
          date('calibrationDueDate', '校准截止'),
          textarea('description', '周期说明', '说明业务重点、评分口径与适用范围')
        ]
      if (entity.value === 'review')
        return [
          ...common,
          select('cycleId', '绩效周期', cycleOptions.value, '请选择草稿或执行中的周期'),
          {
            props: {
              selectedData: selections.employee,
              'onUpdate:selectedData': ($event: typeof selections.employee) => {
                selections.employee = $event
              },
              tenantId: form.model.tenantId,
              apiFn: fetchPerformanceEmployeeSelector,
              displayFields: [],
              placeholder: '请选择被考核员工'
            },
            label: '被考核员工',
            key: 'employeeId',
            type: 'employeeSelect'
          },
          {
            props: {
              selectedData: selections.reviewer,
              'onUpdate:selectedData': ($event: typeof selections.reviewer) => {
                selections.reviewer = $event
              },
              tenantId: form.model.tenantId,
              apiFn: fetchPerformanceEmployeeSelector,
              displayFields: [],
              placeholder: '请选择评价主管'
            },
            label: '评价主管',
            key: 'reviewerEmployeeId',
            type: 'employeeSelect'
          }
        ]
      if (entity.value === 'goal')
        return [
          ...common,
          { key: 'goalDefinition', label: '目标定义', type: 'tab' },
          select('reviewId', '员工考核', reviewOptions.value, '请选择员工考核'),
          input('goalName', '目标名称', '使用可识别的业务结果命名'),
          dict('goalType', '目标类型', 'hrPerformanceGoalType'),
          number('weight', '目标权重（%）', { min: 0, max: 100, precision: 2 }),
          date('dueDate', '目标截止'),
          number('progressPercent', '当前进度（%）', { min: 0, max: 100, precision: 2 }),
          dict('goalStatus', '目标状态', 'hrPerformanceGoalStatus'),
          { key: 'goalResult', label: '结果与评价', type: 'tab' },
          textarea('targetDescription', '验收标准', '描述可量化、可验证的目标标准'),
          textarea('actualResult', '实际结果', '记录已完成成果与差距'),
          input('evidenceSource', '证据来源', '如 经营看板 / 客诉记录 / 安全台账'),
          number('employeeScore', '员工自评分', { min: 0, max: 100, precision: 2 }),
          number('managerScore', '主管评分', { min: 0, max: 100, precision: 2 })
        ]
      if (entity.value === 'check_in')
        return [
          ...common,
          { key: 'checkInContext', label: '沟通记录', type: 'tab' },
          select('reviewId', '员工考核', reviewOptions.value, '请选择执行中的员工考核'),
          {
            props: {
              selectedData: selections.facilitator,
              'onUpdate:selectedData': ($event: typeof selections.facilitator) => {
                selections.facilitator = $event
              },
              tenantId: form.model.tenantId,
              apiFn: fetchPerformanceEmployeeSelector,
              displayFields: [],
              placeholder: '请选择沟通或校准负责人'
            },
            label: '沟通负责人',
            key: 'facilitatorEmployeeId',
            type: 'employeeSelect'
          },
          date('checkInDate', '沟通日期'),
          number('progressPercent', '整体进度（%）', { min: 0, max: 100, precision: 2 }),
          dict('riskStatus', '进展风险', 'hrPerformanceCheckInRisk'),
          { key: 'checkInActions', label: '成果与行动', type: 'tab' },
          textarea('achievement', '阶段成果', '记录本阶段已完成的可验证成果'),
          textarea('blocker', '阻碍与支持', '记录影响目标达成的问题及需要的支持'),
          textarea('nextAction', '下一步行动', '明确下一阶段动作、责任与完成标准'),
          textarea('managerFeedback', '主管反馈', '记录反馈、辅导建议与承诺事项')
        ]
      if (entity.value === 'calibration')
        return [
          ...common,
          input('sessionNo', '会议编号', '如 CAL_2027_ANNUAL_01'),
          input('sessionName', '会议名称', '如 运营条线年度绩效校准会'),
          select('cycleId', '绩效周期', cycleOptions.value, '请选择执行或评议中的周期'),
          hrOrganizationTreeField({
            key: 'organizationId',
            label: '校准组织范围',
            options: organizationOptions.value,
            placeholder: '不选则覆盖整个周期'
          }),
          {
            props: {
              selectedData: selections.facilitator,
              'onUpdate:selectedData': ($event: typeof selections.facilitator) => {
                selections.facilitator = $event
              },
              tenantId: form.model.tenantId,
              apiFn: fetchPerformanceEmployeeSelector,
              displayFields: [],
              placeholder: '请选择沟通或校准负责人'
            },
            label: '校准主持人',
            key: 'facilitatorEmployeeId',
            type: 'employeeSelect'
          },
          datetime('scheduledAt', '会议时间'),
          textarea('distributionNote', '校准口径', '说明评分尺度、分布参考及需重点讨论的群体')
        ]
      return [
        ...common,
        number('originalScore', '主管原始评分', { min: 0, max: 100, precision: 2, disabled: true }),
        dict('originalLevel', '主管原始等级', 'hrPerformanceLevel', true),
        number('calibratedScore', '校准后评分', { min: 0, max: 100, precision: 2 }),
        dict('calibratedLevel', '校准后等级', 'hrPerformanceLevel'),
        textarea('adjustmentReason', '调整依据', '评分或等级发生变化时必须说明跨团队比较依据')
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<FormModel> = {
        tenantId: isPlatformSuper.value ? required('请选择所属租户', 'change') : []
      }
      if (entity.value === 'cycle')
        Object.assign(rules, {
          cycleCode: required('请输入周期编码', 'blur'),
          cycleName: required('请输入周期名称', 'blur'),
          startDate: required('请选择周期开始日期', 'change'),
          endDate: required('请选择周期结束日期', 'change')
        })
      if (entity.value === 'review')
        Object.assign(rules, {
          cycleId: required('请选择绩效周期', 'change'),
          employeeId: required('请选择被考核员工', 'change'),
          reviewerEmployeeId: required('请选择评价主管', 'change')
        })
      if (entity.value === 'goal')
        Object.assign(rules, {
          reviewId: required('请选择员工考核', 'change'),
          goalName: required('请输入目标名称', 'blur'),
          targetDescription: required('请输入验收标准', 'blur'),
          goalType: required('请选择目标类型', 'change')
        })
      if (entity.value === 'check_in')
        Object.assign(rules, {
          reviewId: required('请选择员工考核', 'change'),
          checkInDate: required('请选择沟通日期', 'change'),
          riskStatus: required('请选择进展风险', 'change'),
          nextAction: required('请输入下一步行动', 'blur')
        })
      if (entity.value === 'calibration')
        Object.assign(rules, {
          sessionNo: required('请输入会议编号', 'blur'),
          sessionName: required('请输入会议名称', 'blur'),
          cycleId: required('请选择绩效周期', 'change'),
          scheduledAt: required('请选择会议时间', 'change')
        })
      if (entity.value === 'calibration_item')
        Object.assign(rules, {
          calibratedScore: required('请输入校准后评分', 'blur'),
          calibratedLevel: required('请选择校准后等级', 'change')
        })
      return rules
    })
  })

  const context = computed(() => {
    const notes: Record<Entity, { icon: string; title: string; description: string }> = {
      cycle: {
        icon: 'ri:calendar-check-line',
        title: '先定义节奏，再启动评价',
        description: '周期启动时逐人校验目标权重 100%，随后统一开放员工自评。'
      },
      review: {
        icon: 'ri:user-star-line',
        title: '评价对象与主管关系明确',
        description: '员工与评价主管分别选择，绩效结果始终归属同一周期和租户。'
      },
      goal: {
        icon: 'ri:focus-2-line',
        title: '目标必须可衡量、可举证',
        description: '目标权重、进度、证据和双方评分分阶段维护，不能直接修改最终总分。'
      },
      check_in: {
        icon: 'ri:chat-check-line',
        title: '持续沟通不是备注',
        description: '每次沟通沉淀成果、阻碍、风险和下一步行动，并同步目标推进状态。'
      },
      calibration: {
        icon: 'ri:scales-line',
        title: '校准会议统一评分尺度',
        description: '会议开始后自动载入待校准结果，定案后写回最终评分与等级。'
      },
      calibration_item: {
        icon: 'ri:equalizer-2-line',
        title: '调整必须留痕',
        description: '评分或等级发生变化时必须记录比较依据，保留主管原始结果。'
      }
    }
    return notes[entity.value]
  })

  const required = (message: string, trigger: 'blur' | 'change') => [
    { required: true, message, trigger }
  ]
  const input = (key: keyof FormModel, label: string, placeholder?: string): FormItem => ({
    label,
    key: String(key),
    type: 'input',
    props: { placeholder }
  })
  const textarea = (key: keyof FormModel, label: string, placeholder?: string): FormItem => ({
    label,
    key: String(key),
    type: 'input',
    span: 24,
    props: { type: 'textarea', rows: 3, maxlength: 1000, showWordLimit: true, placeholder }
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
    props: { type: 'date', valueFormat: 'YYYY-MM-DD', placeholder: `请选择${label}` }
  })
  const datetime = (key: keyof FormModel, label: string): FormItem => ({
    label,
    key: String(key),
    type: 'date',
    props: {
      type: 'datetime',
      valueFormat: 'YYYY-MM-DD HH:mm:ss',
      placeholder: `请选择${label}`
    }
  })
  const dict = (key: keyof FormModel, label: string, code: string, disabled = false): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: getDictMap.value[code] ?? [],
    props: { disabled, placeholder: `请选择${label}` }
  })
  const select = (
    key: keyof FormModel,
    label: string,
    options: Api.Hr.PerformanceReference[],
    placeholder: string,
    clearable = false
  ): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: options.map(toNameCodeOption),
    props: { filterable: true, clearable, placeholder }
  })

  const resetSelections = (): void => {
    Object.assign(selections, { owner: [], employee: [], reviewer: [], facilitator: [] })
  }

  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = formModel.tenantId
    const kind = entity.value
    cycleOptions.value = []
    reviewOptions.value = []
    organizationOptions.value = []
    if (isPlatformSuper.value && !tenantId) {
      return
    }
    const [cycles, reviews, organizations] = await Promise.all([
      kind === 'review' || kind === 'calibration'
        ? fetchPerformanceOptions('cycle', tenantId)
        : undefined,
      kind === 'goal' || kind === 'check_in'
        ? fetchPerformanceOptions('review', tenantId)
        : undefined,
      kind === 'calibration' ? fetchHrOrganizationTree('performance', { tenantId }) : undefined
    ])
    if (request !== referenceRequest || tenantId !== formModel.tenantId || kind !== entity.value)
      return
    cycleOptions.value = cycles?.data ?? []
    reviewOptions.value = reviews?.data ?? []
    organizationOptions.value = toHrOrganizationTreeOptions(organizations?.data ?? [])
  }

  const handleTenantChange = async (): Promise<void> => {
    Object.assign(formModel, {
      cycleId: undefined,
      reviewId: undefined,
      employeeId: undefined,
      reviewerEmployeeId: undefined,
      ownerEmployeeId: undefined,
      facilitatorEmployeeId: undefined,
      organizationId: undefined
    })
    resetSelections()
    await loadReferences()
  }

  const validateBusiness = (): void => {
    if (entity.value === 'cycle') {
      if (formModel.endDate < formModel.startDate) throw new Error('周期结束日期不能早于开始日期')
      const milestones = [
        formModel.selfReviewDueDate,
        formModel.managerReviewDueDate,
        formModel.calibrationDueDate
      ].filter(Boolean) as string[]
      if (milestones.some((dateValue) => dateValue < formModel.startDate))
        throw new Error('评审里程碑不能早于周期开始日期')
      if (
        formModel.selfReviewDueDate &&
        formModel.managerReviewDueDate &&
        formModel.managerReviewDueDate < formModel.selfReviewDueDate
      )
        throw new Error('主管评价截止不能早于员工自评截止')
    }
    if (
      entity.value === 'calibration_item' &&
      (formModel.calibratedScore !== formModel.originalScore ||
        formModel.calibratedLevel !== formModel.originalLevel) &&
      !formModel.adjustmentReason?.trim()
    )
      throw new Error('调整评分或等级时必须填写校准依据')
  }

  const toRecord = (): RecordItem => {
    if (entity.value === 'cycle')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        cycleCode: formModel.cycleCode,
        cycleName: formModel.cycleName,
        startDate: formModel.startDate,
        endDate: formModel.endDate,
        status: 'draft',
        ownerEmployeeId: formModel.ownerEmployeeId,
        checkInFrequencyDays: Number(formModel.checkInFrequencyDays),
        selfReviewDueDate: formModel.selfReviewDueDate,
        managerReviewDueDate: formModel.managerReviewDueDate,
        calibrationDueDate: formModel.calibrationDueDate,
        description: formModel.description
      }
    if (entity.value === 'review')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        cycleId: formModel.cycleId!,
        employeeId: formModel.employeeId!,
        reviewerEmployeeId: formModel.reviewerEmployeeId,
        status: 'draft'
      }
    if (entity.value === 'goal')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        reviewId: formModel.reviewId!,
        goalName: formModel.goalName,
        targetDescription: formModel.targetDescription,
        goalType: formModel.goalType,
        weight: Number(formModel.weight),
        progressPercent: Number(formModel.progressPercent),
        status: formModel.goalStatus,
        dueDate: formModel.dueDate,
        actualResult: formModel.actualResult,
        evidenceSource: formModel.evidenceSource,
        employeeScore: formModel.employeeScore,
        managerScore: formModel.managerScore
      }
    if (entity.value === 'check_in')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        reviewId: formModel.reviewId!,
        checkInDate: formModel.checkInDate,
        progressPercent: Number(formModel.progressPercent),
        riskStatus: formModel.riskStatus,
        achievement: formModel.achievement,
        blocker: formModel.blocker,
        nextAction: formModel.nextAction,
        managerFeedback: formModel.managerFeedback,
        facilitatorEmployeeId: formModel.facilitatorEmployeeId
      }
    if (entity.value === 'calibration')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        sessionNo: formModel.sessionNo,
        sessionName: formModel.sessionName,
        cycleId: formModel.cycleId!,
        organizationId: formModel.organizationId,
        facilitatorEmployeeId: formModel.facilitatorEmployeeId,
        scheduledAt: formModel.scheduledAt,
        status: 'setup',
        distributionNote: formModel.distributionNote
      }
    return {
      id: formModel.id,
      tenantId: formModel.tenantId,
      sessionId: formModel.sessionId!,
      reviewId: formModel.reviewId!,
      originalScore: Number(formModel.originalScore),
      originalLevel: formModel.originalLevel,
      calibratedScore: Number(formModel.calibratedScore),
      calibratedLevel: formModel.calibratedLevel,
      adjustmentReason: formModel.adjustmentReason
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      validateBusiness()
      const type: DialogType = formModel.id ? 'edit' : 'add'
      await savePerformanceRecord(entity.value, toRecord())
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
    if (record && 'status' in record && entity.value === 'goal')
      formModel.goalStatus = (record as Api.Hr.PerformanceGoal).status
    if (record && entity.value === 'calibration_item') {
      const item = record as Api.Hr.PerformanceCalibrationItem
      Object.assign(formModel, {
        sessionId: item.sessionId,
        reviewId: item.reviewId,
        originalScore: item.originalScore,
        originalLevel: item.originalLevel,
        calibratedScore: item.calibratedScore,
        calibratedLevel: item.calibratedLevel,
        adjustmentReason: item.adjustmentReason
      })
    }
    const cycle = record && 'owner' in record ? (record as Api.Hr.PerformanceCycle) : undefined
    const review = record && 'employee' in record ? (record as Api.Hr.PerformanceReview) : undefined
    const facilitator =
      record && 'facilitator' in record
        ? (record as Api.Hr.PerformanceCheckIn | Api.Hr.PerformanceCalibrationSession)
        : undefined
    selections.owner = employeeReferenceSelection(cycle?.owner, formModel.tenantId)
    selections.employee = employeeReferenceSelection(review?.employee, formModel.tenantId)
    selections.reviewer = employeeReferenceSelection(review?.reviewer, formModel.tenantId)
    selections.facilitator = employeeReferenceSelection(
      facilitator?.facilitator,
      formModel.tenantId
    )
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    entity.value = payload.entity
    resetSelections()
    initializeModel(payload)
    const titles: Record<Entity, string> = {
      cycle: '绩效周期',
      review: '员工考核',
      goal: '绩效目标',
      check_in: '绩效沟通',
      calibration: '绩效校准会议',
      calibration_item: '校准评分'
    }
    await dialogRef.value?.handleOpen(payload.type, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}${titles[payload.entity]}`,
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
