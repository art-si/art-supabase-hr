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
    <div class="workforce-planning-dialog">
      <ArtEntitySummary
        :icon="contextNote.icon"
        :title="contextNote.title"
        :description="contextNote.description"
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
        <template #ownerEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.ownerEmployeeId"
            v-model:selected-data="ownerSelection"
            :tenant-id="form.model.tenantId"
            placeholder="请选择规划负责人"
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
  import {
    fetchHrOrganizationTree,
    fetchWorkforcePlanningOptions,
    saveWorkforcePlanningRecord
  } from '@hr/api'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.WorkforcePlanningEntity
  type RecordItem = Api.Hr.WorkforcePlanningRecord

  interface FormModel {
    id?: string
    tenantId?: string
    planNo: string
    planName: string
    scenario: Api.Hr.WorkforcePlanScenario
    periodStart: string
    periodEnd: string
    baselineDate: string
    ownerEmployeeId?: string
    budgetAmount?: number | null
    currencyCode: string
    objective?: string | null
    assumptions?: string | null
    remark?: string | null
    planId?: string
    organizationId?: string
    positionId?: string
    baselineCount: number
    plannedHires: number
    plannedExits: number
    annualCostPerHead?: number | null
    demandDate?: string | null
    priority: Api.Hr.WorkforcePlanPriority
    rationale: string
    approvedCount: number
    effectiveFrom: string
    effectiveTo?: string | null
    enabled: boolean
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [type: DialogType] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const activeTab = ref('')
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('cycle')
  const tenantOptions = ref<FormItemOption[]>([])
  const planOptions = shallowRef<Api.Hr.WorkforcePlanningReference[]>([])
  const organizationOptions = shallowRef<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const positionOptions = shallowRef<Api.Hr.WorkforcePlanningReference[]>([])
  const ownerSelection = ref<EmployeeIntegrationItem[]>([])

  const createInitialModel = (): FormModel => ({
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    planNo: '',
    planName: '',
    scenario: 'baseline',
    periodStart: dayjs().startOf('year').add(1, 'year').format('YYYY-MM-DD'),
    periodEnd: dayjs().endOf('year').add(1, 'year').format('YYYY-MM-DD'),
    baselineDate: dayjs().format('YYYY-MM-DD'),
    ownerEmployeeId: undefined,
    budgetAmount: null,
    currencyCode: 'CNY',
    objective: null,
    assumptions: null,
    remark: null,
    planId: undefined,
    organizationId: undefined,
    positionId: undefined,
    baselineCount: 0,
    plannedHires: 0,
    plannedExits: 0,
    annualCostPerHead: null,
    demandDate: null,
    priority: 'normal',
    rationale: '',
    approvedCount: 1,
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
    effectiveTo: null,
    enabled: true
  })

  const formModel = reactive<FormModel>(createInitialModel())
  const targetCount = computed(
    () =>
      Number(formModel.baselineCount) +
      Number(formModel.plannedHires) -
      Number(formModel.plannedExits)
  )
  const filteredPositions = computed(() =>
    positionOptions.value.filter(
      (option) => !formModel.organizationId || option.organizationId === formModel.organizationId
    )
  )
  const contextNote = computed(() => {
    if (entity.value === 'cycle')
      return {
        icon: 'ri:calendar-schedule-line',
        title: '规划周期是预测与审批容器',
        description: '草稿阶段维护岗位需求；批准不会改变岗位容量，启用后才同步有效编制。'
      }
    if (entity.value === 'line')
      return {
        icon: 'ri:organization-chart',
        title: `当前基线 ${formModel.baselineCount} 人 · 目标编制 ${targetCount.value} 人`,
        description: '基线由系统按当前主岗人数快照；增员与减员共同形成目标编制和年度成本预测。'
      }
    return {
      icon: 'ri:shield-check-line',
      title: '有效编制是岗位容量的运营权威',
      description: '当前生效的核定人数会同步岗位硬上限；低于现有在岗人数的调整将被阻止。'
    }
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
  const number = (key: keyof FormModel, label: string, min = 0): FormItem => ({
    label,
    key: String(key),
    type: 'number',
    props: { controls: false, min, precision: 0 }
  })
  const money = (key: keyof FormModel, label: string): FormItem => ({
    label,
    key: String(key),
    type: 'number',
    props: { controls: false, min: 0, precision: 2 }
  })
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
  const textarea = (key: keyof FormModel, label: string, placeholder: string): FormItem => ({
    label,
    key: String(key),
    type: 'input',
    span: 24,
    props: { type: 'textarea', rows: 3, maxlength: 800, showWordLimit: true, placeholder }
  })
  const select = (
    key: keyof FormModel,
    label: string,
    options: Api.Hr.WorkforcePlanningReference[],
    onChange?: () => void
  ): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: options.map(toNameCodeOption),
    props: { filterable: true, placeholder: `请选择${label}`, onChange }
  })

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
              disabled: Boolean(formModel.id),
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
    items: computed(() => {
      if (entity.value === 'cycle')
        return [
          ...tenantItem.value,
          { key: 'planIdentity', label: '规划定义', type: 'tab' },
          input('planNo', '规划编号', '如 WFP_2027_BASE'),
          input('planName', '规划名称', '如 2027 年度业务增长人力规划'),
          dict('scenario', '规划场景', 'hrWorkforcePlanScenario'),
          { label: '规划负责人', key: 'ownerEmployeeId', type: 'input' },
          { key: 'planBasis', label: '周期与测算依据', type: 'tab' },
          date('periodStart', '周期开始'),
          date('periodEnd', '周期结束'),
          date('baselineDate', '基线日期'),
          money('budgetAmount', '年度人力预算'),
          input('currencyCode', '币种', 'CNY'),
          textarea('objective', '规划目标', '说明业务目标、组织能力与人员规模预期'),
          textarea('assumptions', '关键假设', '记录增长率、流失率、生产率或组织调整假设'),
          textarea('remark', '补充说明', '记录审批口径或适用边界')
        ]
      if (entity.value === 'line')
        return [
          ...tenantItem.value,
          select('planId', '草稿规划', planOptions.value),
          hrOrganizationTreeField({
            key: 'organizationId',
            label: '组织',
            options: organizationOptions.value,
            onChange: handleOrganizationChange
          }),
          select('positionId', '岗位', filteredPositions.value, handlePositionChange),
          dict('priority', '需求优先级', 'hrWorkforcePlanPriority'),
          number('plannedHires', '计划增员'),
          number('plannedExits', '计划减员'),
          money('annualCostPerHead', '年度人均成本'),
          date('demandDate', '需求到位日期'),
          textarea('rationale', '业务依据', '说明工作量、能力缺口、增长目标或替补需求'),
          textarea('assumptions', '测算假设', '记录生产率、流失或成本测算口径')
        ]
      return [
        ...tenantItem.value,
        hrOrganizationTreeField({
          key: 'organizationId',
          label: '组织',
          options: organizationOptions.value,
          onChange: handleOrganizationChange
        }),
        select('positionId', '岗位', filteredPositions.value, handlePositionChange),
        number('approvedCount', '核定人数'),
        { label: '启用该记录', key: 'enabled', type: 'switch' },
        date('effectiveFrom', '生效日期'),
        date('effectiveTo', '失效日期'),
        textarea('remark', '调整说明', '说明编制核定依据、审批来源或临时调整原因')
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<FormModel> = {
        tenantId: isPlatformSuper.value ? required('请选择所属租户', 'change') : []
      }
      if (entity.value === 'cycle')
        Object.assign(rules, {
          planNo: required('请输入规划编号', 'blur'),
          planName: required('请输入规划名称', 'blur'),
          scenario: required('请选择规划场景', 'change'),
          periodStart: required('请选择周期开始日期', 'change'),
          periodEnd: required('请选择周期结束日期', 'change'),
          baselineDate: required('请选择基线日期', 'change')
        })
      else
        Object.assign(rules, {
          organizationId: required('请选择组织', 'change'),
          positionId: required('请选择岗位', 'change')
        })
      if (entity.value === 'line')
        Object.assign(rules, {
          planId: required('请选择草稿规划', 'change'),
          priority: required('请选择需求优先级', 'change'),
          rationale: required('请输入业务依据', 'blur')
        })
      if (entity.value === 'effective')
        Object.assign(rules, {
          approvedCount: required('请输入核定人数', 'blur'),
          effectiveFrom: required('请选择生效日期', 'change')
        })
      return rules
    })
  })

  const replaceModel = (next: FormModel): void => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof FormModel])
    Object.assign(form.model, next)
  }

  const handleTenantChange = async (): Promise<void> => {
    Object.assign(formModel, {
      ownerEmployeeId: undefined,
      planId: undefined,
      organizationId: undefined,
      positionId: undefined,
      baselineCount: 0
    })
    ownerSelection.value = []
    await loadReferences()
  }
  const handleOrganizationChange = (): void => {
    formModel.positionId = undefined
    formModel.baselineCount = 0
  }
  const handlePositionChange = (): void => {
    const position = positionOptions.value.find((option) => option.id === formModel.positionId)
    formModel.baselineCount = position?.currentCount ?? 0
    if (entity.value === 'effective') formModel.approvedCount = position?.headcountLimit ?? 1
  }
  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = formModel.tenantId
    const kind = entity.value
    planOptions.value = []
    organizationOptions.value = []
    positionOptions.value = []
    if (isPlatformSuper.value && !tenantId) return
    const [plans, organizations, positions] = await Promise.all([
      kind === 'line' ? fetchWorkforcePlanningOptions('plan', tenantId) : undefined,
      kind !== 'cycle' ? fetchHrOrganizationTree('headcount', { tenantId }) : undefined,
      kind !== 'cycle' ? fetchWorkforcePlanningOptions('position', tenantId) : undefined
    ])
    if (request !== referenceRequest || tenantId !== formModel.tenantId || kind !== entity.value)
      return
    planOptions.value = (plans?.data ?? []).filter((option) => option.status === 'draft')
    organizationOptions.value = toHrOrganizationTreeOptions(organizations?.data ?? [])
    positionOptions.value = positions?.data ?? []
  }

  const validateBusiness = (): void => {
    if (entity.value === 'cycle') {
      if (formModel.periodEnd < formModel.periodStart)
        throw new Error('周期结束日期不能早于开始日期')
      if (formModel.baselineDate > formModel.periodEnd)
        throw new Error('基线日期不能晚于周期结束日期')
    }
    if (entity.value === 'line' && targetCount.value < 0)
      throw new Error('计划减员不能使目标编制低于 0 人')
    if (
      entity.value === 'effective' &&
      formModel.effectiveTo &&
      formModel.effectiveTo < formModel.effectiveFrom
    )
      throw new Error('失效日期不能早于生效日期')
  }
  const toRecord = (): RecordItem => {
    if (entity.value === 'cycle')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        planNo: formModel.planNo,
        planName: formModel.planName,
        scenario: formModel.scenario,
        periodStart: formModel.periodStart,
        periodEnd: formModel.periodEnd,
        baselineDate: formModel.baselineDate,
        ownerEmployeeId: formModel.ownerEmployeeId,
        status: 'draft',
        budgetAmount: formModel.budgetAmount,
        currencyCode: formModel.currencyCode,
        objective: formModel.objective,
        assumptions: formModel.assumptions,
        remark: formModel.remark
      }
    if (entity.value === 'line')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        planId: formModel.planId!,
        organizationId: formModel.organizationId!,
        positionId: formModel.positionId!,
        baselineCount: formModel.baselineCount,
        plannedHires: Number(formModel.plannedHires),
        plannedExits: Number(formModel.plannedExits),
        targetCount: targetCount.value,
        annualCostPerHead: formModel.annualCostPerHead,
        demandDate: formModel.demandDate,
        priority: formModel.priority,
        rationale: formModel.rationale,
        assumptions: formModel.assumptions
      }
    return {
      id: formModel.id,
      tenantId: formModel.tenantId,
      organizationId: formModel.organizationId!,
      positionId: formModel.positionId!,
      approvedCount: Number(formModel.approvedCount),
      effectiveFrom: formModel.effectiveFrom,
      effectiveTo: formModel.effectiveTo,
      enabled: formModel.enabled,
      remark: formModel.remark
    }
  }
  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      validateBusiness()
      const type: DialogType = formModel.id ? 'edit' : 'add'
      await saveWorkforcePlanningRecord(entity.value, toRecord())
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (nextEntity: Entity, row?: RecordItem): Promise<void> => {
    entity.value = nextEntity
    replaceModel(createInitialModel())
    ownerSelection.value = []
    if (row) {
      replaceModel({
        ...createInitialModel(),
        ...(structuredClone(toRaw(row)) as Partial<FormModel>)
      })
      if ('owner' in row)
        ownerSelection.value = employeeReferenceSelection(row.owner, formModel.tenantId)
    }
    await nextTick()
    formRef.value?.clearValidate()
    const label = { cycle: '规划周期', line: '岗位需求', effective: '有效编制' }[nextEntity]
    await dialogRef.value?.handleOpen(undefined, {
      title: `${row ? '编辑' : '新增'}${label}`,
      subtitle: '规划建议、审批状态与岗位实时容量分层管理，并保留完整来源追溯',
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
  .workforce-planning-dialog {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
</style>
