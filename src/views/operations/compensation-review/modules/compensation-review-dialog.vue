<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="review-dialog">
      <ArtEntitySummary
        :icon="context.icon"
        :eyebrow="context.eyebrow"
        :title="context.title"
        :description="context.description"
      >
        <template #aside>
          <ElTag type="success" effect="light" round>
            <ArtSvgIcon icon="ri:shield-check-line" />{{ context.boundary }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <section v-if="entity === 'item'" class="review-dialog__employee" aria-label="员工调薪快照">
        <div>
          <small>复核对象</small>
          <strong>{{ formModel.employeeName || '--' }}</strong>
          <span
            >{{ formModel.employeeNo || '--' }} ·
            {{ formModel.organizationName || '未分配组织' }}</span
          >
        </div>
        <dl>
          <div
            ><dt>职级</dt><dd>{{ formModel.gradeName || '--' }}</dd></div
          >
          <div
            ><dt>当前基本工资</dt
            ><dd>{{
              formatCurrencyCodeValue(formModel.currentBaseAmount, formModel.currencyCode)
            }}</dd></div
          >
          <div
            ><dt>当前建议</dt
            ><dd>{{
              formatCurrencyCodeValue(formModel.proposedBaseAmount, formModel.currencyCode)
            }}</dd></div
          >
        </dl>
      </section>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id) || parentTenantLocked)"
        :rules="form.rules"
        :span="12"
        :gutter="22"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { formatCurrencyCodeValue } from '@/utils/ui/format'
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { fetchHrOrganizationTree, saveCompensationReviewRecord } from '@hr/api'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.CompensationReviewEntity
  type RecordItem = Api.Hr.CompensationReviewRecord

  interface OpenPayload {
    entity: Entity
    type: DialogType
    editData?: RecordItem
    cycle?: Api.Hr.CompensationReviewCycle | null
  }

  interface FormModel {
    id?: string
    tenantId?: string
    cycleId?: string
    cycleCode: string
    cycleName: string
    reviewYear: number
    effectiveDate: string
    recommendationDueDate: string
    calibrationDueDate: string
    scopeOrganizationId?: string
    currencyCode: string
    defaultBudgetPercent: number
    guidelineMinPercent: number
    guidelineMaxPercent: number
    description?: string
    organizationId?: string
    organizationName?: string
    budgetAmount?: number
    note?: string
    employeeId?: string
    employeeNo?: string
    employeeName?: string
    gradeName?: string
    currentCompensationId?: string
    currentGradeId?: string
    currentBaseAmount?: Api.Hr.ProtectedAmount
    proposedBaseAmount?: Api.Hr.ProtectedAmount
    recommendationReason?: string
    calibrationNote?: string
    exclude: boolean
    exclusionReason?: string
    cycleStatus?: Api.Hr.CompensationReviewCycleStatus
    status?: Api.Hr.CompensationReviewItemStatus
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [entity: Entity, type: DialogType] }>()
  const userStore = useUserStore()
  const { isPlatformSuper } = storeToRefs(userStore)
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const entity = ref<Entity>('cycle')
  const dialogType = ref<DialogType>('add')
  const parentTenantLocked = ref(false)
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const organizationOptions = ref<ReturnType<typeof toHrOrganizationTreeOptions>>([])

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: defaultWriteTenantId.value ?? undefined,
    cycleId: undefined,
    cycleCode: `MERIT-${dayjs().year()}`,
    cycleName: `${dayjs().year()} 年度调薪复核`,
    reviewYear: dayjs().year(),
    effectiveDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    recommendationDueDate: dayjs().add(10, 'day').format('YYYY-MM-DD'),
    calibrationDueDate: dayjs().add(20, 'day').format('YYYY-MM-DD'),
    scopeOrganizationId: undefined,
    currencyCode: 'CNY',
    defaultBudgetPercent: 5,
    guidelineMinPercent: 0,
    guidelineMaxPercent: 10,
    description: undefined,
    organizationId: undefined,
    organizationName: undefined,
    budgetAmount: undefined,
    note: undefined,
    employeeId: undefined,
    employeeNo: undefined,
    employeeName: undefined,
    gradeName: undefined,
    currentCompensationId: undefined,
    currentGradeId: undefined,
    currentBaseAmount: undefined,
    proposedBaseAmount: undefined,
    recommendationReason: undefined,
    calibrationNote: undefined,
    exclude: false,
    exclusionReason: undefined,
    cycleStatus: undefined,
    status: undefined
  })
  const formModel = reactive<FormModel>(createInitialModel())

  const buildRecord = (): RecordItem => {
    const common = { id: formModel.id, tenantId: formModel.tenantId }
    if (entity.value === 'cycle') {
      return {
        ...common,
        cycleCode: formModel.cycleCode,
        cycleName: formModel.cycleName,
        reviewYear: formModel.reviewYear,
        effectiveDate: formModel.effectiveDate,
        recommendationDueDate: formModel.recommendationDueDate,
        calibrationDueDate: formModel.calibrationDueDate,
        scopeOrganizationId: formModel.scopeOrganizationId,
        currencyCode: formModel.currencyCode,
        defaultBudgetPercent: formModel.defaultBudgetPercent,
        guidelineMinPercent: formModel.guidelineMinPercent,
        guidelineMaxPercent: formModel.guidelineMaxPercent,
        status: formModel.cycleStatus ?? 'draft',
        description: formModel.description
      }
    }
    if (entity.value === 'budget') {
      return {
        ...common,
        cycleId: formModel.cycleId ?? '',
        organizationId: formModel.organizationId,
        budgetAmount: formModel.budgetAmount ?? 0,
        note: formModel.note,
        source: 'manual'
      }
    }
    return {
      ...common,
      cycleId: formModel.cycleId ?? '',
      employeeId: formModel.employeeId ?? '',
      organizationId: formModel.organizationId,
      currentCompensationId: formModel.currentCompensationId ?? '',
      currentGradeId: formModel.currentGradeId,
      currentBaseAmount: formModel.currentBaseAmount ?? 0,
      proposedBaseAmount: formModel.proposedBaseAmount ?? 0,
      status: formModel.status ?? 'pending',
      recommendationReason: formModel.recommendationReason,
      calibrationNote: formModel.calibrationNote,
      exclude: formModel.exclude,
      exclusionReason: formModel.exclusionReason
    }
  }

  const context = computed(() => {
    if (entity.value === 'cycle') {
      return {
        icon: 'ri:calendar-schedule-line',
        eyebrow: 'REVIEW CYCLE GOVERNANCE',
        title: '定义调薪周期与决策边界',
        description: '日期、组织范围、预算率和调薪指引在开放后锁定，确保各部门采用同一口径。',
        boundary: '开放后生成薪酬快照'
      }
    }
    if (entity.value === 'budget') {
      return {
        icon: 'ri:funds-line',
        eyebrow: 'ORGANIZATION BUDGET',
        title: '维护组织调薪预算',
        description: '预算只约束正向增资，不允许在校准结束后回改分母或绕过超支校验。',
        boundary: '服务端校验预算占用'
      }
    }
    return {
      icon: 'ri:user-star-line',
      eyebrow:
        formModel.cycleStatus === 'calibrating' ? 'CALIBRATION DECISION' : 'MANAGER RECOMMENDATION',
      title: formModel.cycleStatus === 'calibrating' ? '校准员工调薪结果' : '提交员工调薪建议',
      description: '当前工资来自周期开放时的受控快照；任何调薪与例外都必须保留可审计依据。',
      boundary: '金额按权限受控'
    }
  })

  const tenantItems = (): FormItem[] =>
    isPlatformSuper.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select',
            span: 24,
            options: tenantOptions.value,
            props: {
              filterable: true,
              disabled: dialogType.value === 'edit',
              placeholder: '请选择所属租户',
              onChange: handleTenantChange
            }
          }
        ]
      : []

  const cycleItems = computed<FormItem[]>(() => [
    ...tenantItems(),
    { label: '周期识别', key: 'identity', type: 'divider', span: 24 },
    {
      label: '周期编码',
      key: 'cycleCode',
      type: 'input',
      props: { maxlength: 40, placeholder: '例如 MERIT-2027' }
    },
    {
      label: '周期名称',
      key: 'cycleName',
      type: 'input',
      props: { maxlength: 120, placeholder: '请输入组织可识别的周期名称' }
    },
    {
      label: '复核年度',
      key: 'reviewYear',
      type: 'number',
      props: { min: 2000, max: 2200, precision: 0, class: '!w-full' }
    },
    hrOrganizationTreeField({
      key: 'scopeOrganizationId',
      label: '组织范围',
      options: organizationOptions.value,
      placeholder: formModel.tenantId ? '全部组织' : '请先选择租户',
      disabled: !formModel.tenantId
    }),
    { label: '节奏与生效', key: 'timeline', type: 'divider', span: 24 },
    {
      label: '经理建议截止',
      key: 'recommendationDueDate',
      type: 'date',
      props: { class: '!w-full' }
    },
    { label: '组织校准截止', key: 'calibrationDueDate', type: 'date', props: { class: '!w-full' } },
    { label: '调薪生效日', key: 'effectiveDate', type: 'date', props: { class: '!w-full' } },
    { label: '币种', key: 'currencyCode', type: 'input', props: { maxlength: 3 } },
    { label: '预算与指引', key: 'guardrail', type: 'divider', span: 24 },
    {
      label: '默认预算率（%）',
      key: 'defaultBudgetPercent',
      type: 'number',
      props: { min: 0, max: 100, precision: 2, class: '!w-full' },
      help: '开放周期时按组织当前基本工资自动生成预算'
    },
    {
      label: '建议下限（%）',
      key: 'guidelineMinPercent',
      type: 'number',
      props: { min: -100, max: 500, precision: 2, class: '!w-full' }
    },
    {
      label: '建议上限（%）',
      key: 'guidelineMaxPercent',
      type: 'number',
      props: { min: -100, max: 500, precision: 2, class: '!w-full' }
    },
    {
      label: '周期说明',
      key: 'description',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 4, maxlength: 1000, showWordLimit: true }
    }
  ])

  const budgetItems = computed<FormItem[]>(() => [
    {
      ...hrOrganizationTreeField({
        key: 'organizationId',
        label: '所属组织',
        options: organizationOptions.value,
        disabled: dialogType.value === 'edit',
        placeholder: '未分配组织或选择具体组织'
      }),
      span: 24
    },
    {
      label: '批准预算金额',
      key: 'budgetAmount',
      type: 'number',
      span: 24,
      props: { min: 0, precision: 2, class: '!w-full', placeholder: '请输入组织可用调薪预算' }
    },
    {
      label: '预算说明',
      key: 'note',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '说明预算来源、例外审批或调整依据'
      }
    }
  ])

  const itemItems = computed<FormItem[]>(() => [
    {
      label: '排除本周期',
      key: 'exclude',
      type: 'switch',
      span: 24,
      help: '例如已离职、近期已单独调薪或不在本次政策范围内'
    },
    {
      label: '排除原因',
      key: 'exclusionReason',
      type: 'input',
      span: 24,
      hidden: () => !formModel.exclude,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true }
    },
    {
      label: '建议基本工资',
      key: 'proposedBaseAmount',
      type: 'number',
      span: 24,
      hidden: () => formModel.exclude,
      props: { min: 0, precision: 2, class: '!w-full' }
    },
    {
      label: '经理建议依据',
      key: 'recommendationReason',
      type: 'input',
      span: 24,
      hidden: () => formModel.exclude,
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 1000,
        showWordLimit: true,
        placeholder: '说明绩效、市场定位、岗位变化或保留风险依据'
      }
    },
    {
      label: '校准结论 / 例外依据',
      key: 'calibrationNote',
      type: 'input',
      span: 24,
      hidden: () => formModel.exclude || formModel.cycleStatus !== 'calibrating',
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 1000,
        showWordLimit: true,
        placeholder: '记录委员会校准口径及超出指引的审批依据'
      }
    }
  ])

  const form = computed(() => ({
    model: formModel,
    items:
      entity.value === 'cycle'
        ? cycleItems.value
        : entity.value === 'budget'
          ? budgetItems.value
          : itemItems.value,
    rules: rules.value
  }))

  const required = (message: string, trigger: 'blur' | 'change' = 'blur') => ({
    required: true,
    message,
    trigger
  })
  const rules = computed<FormRules>(() => {
    if (entity.value === 'cycle') {
      return {
        tenantId: isPlatformSuper.value ? [required('请选择所属租户', 'change')] : [],
        cycleCode: [required('请输入周期编码')],
        cycleName: [required('请输入周期名称')],
        reviewYear: [required('请输入复核年度', 'change')],
        effectiveDate: [required('请选择生效日期', 'change')],
        recommendationDueDate: [required('请选择建议截止日期', 'change')],
        calibrationDueDate: [required('请选择校准截止日期', 'change')],
        currencyCode: [required('请输入币种')],
        defaultBudgetPercent: [required('请输入默认预算率', 'change')],
        guidelineMinPercent: [required('请输入建议下限', 'change')],
        guidelineMaxPercent: [required('请输入建议上限', 'change')]
      }
    }
    if (entity.value === 'budget')
      return { budgetAmount: [required('请输入批准预算金额', 'change')] }
    return formModel.exclude
      ? { exclusionReason: [required('请输入排除原因')] }
      : {
          proposedBaseAmount: [required('请输入建议基本工资', 'change')],
          recommendationReason: [required('请输入经理建议依据')]
        }
  })

  const setFromRecord = (record: RecordItem): void => {
    Object.assign(formModel, record)
    if (entity.value === 'item') {
      formModel.exclude = (record as Api.Hr.CompensationReviewItem).status === 'excluded'
    }
    if (
      entity.value === 'budget' &&
      typeof (record as Api.Hr.CompensationReviewBudget).budgetAmount !== 'number'
    ) {
      formModel.budgetAmount = undefined
    }
    if (
      entity.value === 'item' &&
      typeof (record as Api.Hr.CompensationReviewItem).proposedBaseAmount !== 'number'
    ) {
      formModel.proposedBaseAmount = undefined
    }
  }

  let organizationLoadVersion = 0
  const loadOptions = async (): Promise<void> => {
    const version = ++organizationLoadVersion
    const tenantId = formModel.tenantId
    organizationOptions.value = []
    if (!tenantId || entity.value === 'item') return
    const response = await fetchHrOrganizationTree('compensationReview', { tenantId })
    if (version !== organizationLoadVersion || tenantId !== formModel.tenantId) return
    organizationOptions.value = toHrOrganizationTreeOptions(response.data ?? [])
  }

  const handleTenantChange = async (): Promise<void> => {
    formModel.scopeOrganizationId = undefined
    formModel.organizationId = undefined
    await loadOptions()
  }

  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (entity.value === 'cycle') {
        if (
          formModel.recommendationDueDate > formModel.calibrationDueDate ||
          formModel.calibrationDueDate > formModel.effectiveDate
        ) {
          ElMessage.warning('日期顺序应为：经理建议截止 ≤ 组织校准截止 ≤ 调薪生效日')
          return false
        }
        if (formModel.guidelineMinPercent > formModel.guidelineMaxPercent) {
          ElMessage.warning('调薪建议下限不能大于上限')
          return false
        }
      }
      await saveCompensationReviewRecord(entity.value, buildRecord())
      emit('success', entity.value, dialogType.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    parentTenantLocked.value = payload.entity !== 'cycle' && Boolean(payload.cycle)
    organizationLoadVersion += 1
    entity.value = payload.entity
    dialogType.value = payload.type
    Object.assign(formModel, createInitialModel())
    organizationOptions.value = []
    if (entity.value !== 'cycle' && payload.cycle) {
      formModel.cycleId = payload.cycle.id
      formModel.tenantId = payload.cycle.tenantId
      formModel.cycleStatus = payload.cycle.status
      formModel.currencyCode = payload.cycle.currencyCode
    }
    if (payload.editData) setFromRecord(payload.editData)
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}${entity.value === 'cycle' ? '调薪周期' : entity.value === 'budget' ? '组织预算' : '员工调薪建议'}`,
      subtitle: '所有金额、状态与生效结果均在服务端按租户和权限校验',
      confirmText:
        payload.type === 'add' ? '创建记录' : formModel.exclude ? '确认排除' : '保存更改',
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
          await loadOptions()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: submit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .review-dialog {
    display: grid;
    gap: 18px;
    min-width: 0;

    &__employee {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(360px, 1.4fr);
      gap: 18px;
      align-items: center;
      padding: 14px 16px;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      > div {
        display: grid;
      }

      small,
      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        margin-top: 3px;
        font-size: 16px;
        color: var(--el-text-color-primary);
      }

      span {
        margin-top: 3px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      dl {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin: 0;
      }

      dl div {
        min-width: 0;
        padding: 9px 10px;
        background: var(--art-bg-color);
        border-radius: var(--art-surface-radius);
      }

      dd {
        margin: 4px 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        font-weight: 700;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }
  }

  @media only screen and (width <= 767px) {
    .review-dialog {
      &__employee {
        grid-template-columns: 1fr;
      }

      &__employee dl {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
