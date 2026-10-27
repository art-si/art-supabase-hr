<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="compensation-dialog">
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
      />

      <ArtSectionCard
        v-if="entity === 'plan'"
        title="方案薪酬项目"
        subtitle="定义方案包含的收入、扣减和企业成本项目；方案被已批准员工薪酬使用后即锁定。"
        body-class="compensation-dialog__section-body"
      >
        <div class="compensation-dialog__selector">
          <span>选择薪酬项目</span>
          <ElSelect
            v-model="selectedPlanComponentIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择方案包含的薪酬项目"
          >
            <ElOption
              v-for="option in componentOptions"
              :key="option.id"
              :label="`${option.name} · ${option.code}`"
              :value="option.id"
            />
          </ElSelect>
        </div>
        <div v-if="planItems.length" class="compensation-dialog__item-list">
          <div v-for="item in planItems" :key="item.componentId" class="compensation-dialog__item">
            <div class="compensation-dialog__item-heading">
              <div>
                <strong>{{ item.componentName }}</strong>
                <span>{{ item.componentCode }}</span>
              </div>
              <ArtDictDisplay
                dict-code="hrCompensationComponentCategory"
                :value="item.category || ''"
                display="tag"
              />
            </div>
            <div class="compensation-dialog__item-fields">
              <label v-if="item.amountType === 'fixed'">
                <span>默认金额</span>
                <ElInputNumber
                  v-model="item.defaultAmount"
                  :min="0"
                  :precision="2"
                  :controls="false"
                  placeholder="选填"
                />
              </label>
              <label v-else-if="item.amountType === 'rate'">
                <span>默认比例</span>
                <ElInputNumber
                  v-model="item.defaultRate"
                  :min="0"
                  :precision="6"
                  :controls="false"
                  placeholder="如 0.10"
                />
              </label>
              <div v-else class="compensation-dialog__variable-note">
                <ArtSvgIcon icon="ri:edit-box-line" />
                <span>由薪资核算期录入</span>
              </div>
              <label class="compensation-dialog__switch-field">
                <span>员工必配</span>
                <ElSwitch v-model="item.required" />
              </label>
            </div>
          </div>
        </div>
        <ArtEmptyState
          v-else
          title="尚未选择薪酬项目"
          description="方案仍可仅包含基本工资。"
          size="compact"
          :visual-size="64"
        />
      </ArtSectionCard>

      <ArtSectionCard
        v-if="entity === 'employee'"
        title="薪酬构成"
        subtitle="基本工资单独维护；下列项目继承自薪酬方案，可按员工覆盖默认金额或比例。"
        body-class="compensation-dialog__section-body"
      >
        <div v-if="employeeItems.length" class="compensation-dialog__item-list">
          <div
            v-for="item in employeeItems"
            :key="item.componentId"
            class="compensation-dialog__item"
          >
            <div class="compensation-dialog__item-heading">
              <div>
                <strong>{{ item.componentName }}</strong>
                <span>{{ item.componentCode }}</span>
              </div>
              <ArtDictDisplay
                dict-code="hrCompensationComponentCategory"
                :value="item.category || ''"
                display="tag"
              />
            </div>
            <div class="compensation-dialog__item-fields">
              <label v-if="item.amountType !== 'rate'">
                <span>{{ item.amountType === 'variable' ? '核算金额' : '员工金额' }}</span>
                <ElInputNumber
                  v-model="item.amount"
                  :min="0"
                  :precision="2"
                  :controls="false"
                  placeholder="留空则使用方案默认值"
                />
              </label>
              <label v-else>
                <span>员工比例</span>
                <ElInputNumber
                  v-model="item.rate"
                  :min="0"
                  :precision="6"
                  :controls="false"
                  placeholder="留空则使用方案默认值"
                />
              </label>
              <div class="compensation-dialog__source-note">
                <ArtSvgIcon icon="ri:git-merge-line" />
                <span>保存后记录方案值或员工覆盖值</span>
              </div>
            </div>
          </div>
        </div>
        <ArtEmptyState
          v-else
          :title="form.model.planId ? '该方案仅包含基本工资' : '请先选择薪酬方案'"
          :description="
            form.model.planId
              ? '配置更多薪酬项目后可在此查看。'
              : '选择方案后可查看对应的薪酬项目。'
          "
          size="compact"
          :visual-size="64"
        />
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import dayjs from 'dayjs'
  import { cloneDeep, compact, uniqBy } from 'lodash-es'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, {
    type FormItem,
    type FormItemOption
  } from '@/components/core/forms/art-form/index.vue'
  import type { ArtUserSelectOption } from '@/components/core/forms/art-user-select/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchCompensationOptions,
    fetchCompensationRecords,
    saveCompensationRecord
  } from '@hr/api'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.CompensationEntity
  type RecordItem = Api.Hr.CompensationRecord

  interface CompensationFormModel {
    id?: string
    tenantId?: string
    componentCode: string
    componentName: string
    category: Api.Hr.CompensationComponentCategory
    amountType: Api.Hr.CompensationAmountType
    taxable: boolean
    planCode: string
    planName: string
    currencyCode: string
    payFrequency: Api.Hr.PayFrequency
    gradeId?: string | null
    minimumAmount?: number
    midpointAmount?: number
    maximumAmount?: number
    employeeId?: string
    planId?: string
    baseAmount?: number
    effectiveFrom: string
    effectiveTo?: string | null
    changeReason: string
    enabled: boolean
    sort: number
    description?: string | null
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
    reloadOptions: (key: string) => Promise<void>
  }

  interface FormState {
    model: CompensationFormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<CompensationFormModel>>
  }

  interface CompensationPlanItemEditor extends Omit<
    Api.Hr.CompensationPlanItem,
    'defaultAmount' | 'defaultRate'
  > {
    defaultAmount?: number | null
    defaultRate?: number | null
  }

  interface EmployeeCompensationItemEditor extends Omit<
    Api.Hr.EmployeeCompensationItem,
    'amount' | 'rate'
  > {
    amount?: number | null
    rate?: number | null
  }

  const emit = defineEmits<{ success: [type: DialogType] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('employee')
  const tenantOptions = ref<FormItemOption[]>([])
  const componentOptions = shallowRef<Api.Hr.CompensationReference[]>([])
  const planOptions = shallowRef<Api.Hr.CompensationPlan[]>([])
  const employeeOptions = shallowRef<Api.Hr.CompensationReference[]>([])
  const gradeOptions = shallowRef<Api.Hr.CompensationReference[]>([])
  const planItems = ref<CompensationPlanItemEditor[]>([])
  const employeeItems = ref<EmployeeCompensationItemEditor[]>([])

  const createInitialModel = (): CompensationFormModel => ({
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    componentCode: '',
    componentName: '',
    category: 'earning',
    amountType: 'fixed',
    taxable: true,
    planCode: '',
    planName: '',
    currencyCode: 'CNY',
    payFrequency: 'monthly',
    gradeId: null,
    minimumAmount: undefined,
    midpointAmount: undefined,
    maximumAmount: undefined,
    employeeId: undefined,
    planId: undefined,
    baseAmount: undefined,
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
    effectiveTo: null,
    changeReason: '',
    enabled: true,
    sort: 0,
    description: null
  })

  const formModel = reactive<CompensationFormModel>(createInitialModel())

  const toOptionalNumber = (value: Api.Hr.ProtectedAmount | undefined): number | null => {
    const numberValue = Number(value)
    return value === null || value === undefined || value === '***' || !Number.isFinite(numberValue)
      ? null
      : numberValue
  }

  const selectedPlanComponentIds = computed<string[]>({
    get: () => planItems.value.map((item) => item.componentId),
    set: (ids) => {
      const current = new Map(planItems.value.map((item) => [item.componentId, item]))
      planItems.value = ids.flatMap((id, index) => {
        const existing = current.get(id)
        if (existing) return [{ ...existing, sort: index + 1 }]
        const option = componentOptions.value.find((item) => item.id === id)
        if (!option) return []
        return [
          {
            componentId: id,
            componentCode: option.code,
            componentName: option.name,
            category: option.category,
            amountType: option.amountType,
            defaultAmount: null,
            defaultRate: null,
            required: false,
            sort: index + 1
          }
        ]
      })
    }
  })

  let referenceRequest = 0
  const loadReferenceData = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = form.model.tenantId
    const kind = entity.value
    componentOptions.value = []
    planOptions.value = []
    employeeOptions.value = []
    gradeOptions.value = []
    if (!tenantId) return
    const [components, plans, employees, grades] = await Promise.all([
      kind === 'plan' ? fetchCompensationOptions('component', tenantId) : undefined,
      kind === 'employee'
        ? fetchCompensationRecords<Api.Hr.CompensationPlan>('plan', {
            tenantId,
            status: 'enabled',
            from: 0,
            to: 499
          })
        : undefined,
      kind === 'employee' ? fetchCompensationOptions('employee', tenantId) : undefined,
      kind === 'employee' || kind === 'band'
        ? fetchCompensationOptions('grade', tenantId)
        : undefined
    ])
    if (request !== referenceRequest || tenantId !== form.model.tenantId || kind !== entity.value)
      return
    componentOptions.value = components?.data ?? []
    planOptions.value = plans?.data ?? []
    employeeOptions.value = employees?.data ?? []
    gradeOptions.value = grades?.data ?? []
  }

  const toEmployeeOption = (employee: Api.Hr.CompensationReference): ArtUserSelectOption => ({
    value: employee.id,
    label: compact([employee.name, employee.code]).join(' · '),
    nickName: employee.name,
    userName: employee.code,
    departmentName:
      compact([employee.organizationName, employee.gradeName]).join(' · ') || undefined
  })

  const loadEmployeeSelectOptions = async (): Promise<ArtUserSelectOption[]> => {
    if (!employeeOptions.value.length) await loadReferenceData()
    const selected = form.model.employeeId
      ? employeeOptions.value.find((item) => item.id === form.model.employeeId)
      : undefined
    return uniqBy(
      selected
        ? [...employeeOptions.value.map(toEmployeeOption), toEmployeeOption(selected)]
        : employeeOptions.value.map(toEmployeeOption),
      'value'
    )
  }

  const handleTenantChange = async (): Promise<void> => {
    Object.assign(form.model, { employeeId: undefined, planId: undefined, gradeId: null })
    planItems.value = []
    employeeItems.value = []
    await loadReferenceData()
    await nextTick()
    await Promise.all([
      formRef.value?.reloadOptions('employeeId'),
      formRef.value?.reloadOptions('planId'),
      formRef.value?.reloadOptions('gradeId')
    ])
  }

  const handleEmployeeChange = (employeeId?: string): void => {
    const employee = employeeOptions.value.find((item) => item.id === employeeId)
    form.model.gradeId = employee?.gradeId ?? null
  }

  const applySelectedPlan = (planId?: string, preserve = false): void => {
    const plan = planOptions.value.find((item) => item.id === planId)
    if (!plan) {
      employeeItems.value = []
      return
    }
    Object.assign(form.model, {
      currencyCode: plan.currencyCode,
      payFrequency: plan.payFrequency
    })
    const existing = new Map(
      (preserve ? employeeItems.value : []).map((item) => [item.componentId, item])
    )
    employeeItems.value = (plan.items ?? []).map((item) => ({
      componentId: item.componentId,
      componentCode: item.componentCode,
      componentName: item.componentName,
      category: item.category,
      amountType: item.amountType,
      amount: existing.get(item.componentId)?.amount ?? null,
      rate: existing.get(item.componentId)?.rate ?? null,
      source: existing.get(item.componentId)?.source ?? 'plan'
    }))
  }

  const form = reactive<FormState>({
    model: formModel,
    items: computed(() => {
      const tenant: FormItem[] = isPlatformSuper.value
        ? [
            {
              label: '所属租户',
              key: 'tenantId',
              type: 'select',
              span: 24,
              props: {
                options: tenantOptions.value,
                filterable: true,
                placeholder: '请选择所属租户',
                onChange: () => void handleTenantChange()
              }
            }
          ]
        : []
      if (entity.value === 'component')
        return [
          ...tenant,
          {
            label: '项目编码',
            key: 'componentCode',
            type: 'input',
            props: { maxlength: 32, placeholder: '如 MEAL_ALLOWANCE' }
          },
          {
            label: '项目名称',
            key: 'componentName',
            type: 'input',
            props: { maxlength: 50, placeholder: '如 餐费补贴' }
          },
          {
            label: '项目类别',
            key: 'category',
            type: 'select',
            props: { options: getDictMap.value.hrCompensationComponentCategory ?? [] }
          },
          {
            label: '计值方式',
            key: 'amountType',
            type: 'select',
            props: { options: getDictMap.value.hrCompensationAmountType ?? [] }
          },
          { label: '计入应税', key: 'taxable', type: 'switch' },
          { label: '启用状态', key: 'enabled', type: 'switch' },
          { label: '排序', key: 'sort', type: 'number', props: { min: 0, precision: 0 } },
          {
            label: '项目说明',
            key: 'description',
            type: 'input',
            span: 24,
            props: { type: 'textarea', rows: 3, maxlength: 300, showWordLimit: true }
          }
        ]
      if (entity.value === 'plan')
        return [
          ...tenant,
          {
            label: '方案编码',
            key: 'planCode',
            type: 'input',
            props: { maxlength: 32, placeholder: '如 MONTHLY_STANDARD' }
          },
          {
            label: '方案名称',
            key: 'planName',
            type: 'input',
            props: { maxlength: 60, placeholder: '如 标准月薪制' }
          },
          {
            label: '币种',
            key: 'currencyCode',
            type: 'input',
            props: { maxlength: 3, placeholder: 'CNY' }
          },
          {
            label: '发薪频率',
            key: 'payFrequency',
            type: 'select',
            props: { options: getDictMap.value.hrPayFrequency ?? [] }
          },
          { label: '启用状态', key: 'enabled', type: 'switch' },
          { label: '排序', key: 'sort', type: 'number', props: { min: 0, precision: 0 } },
          {
            label: '方案说明',
            key: 'description',
            type: 'input',
            span: 24,
            props: { type: 'textarea', rows: 3, maxlength: 300, showWordLimit: true }
          }
        ]
      if (entity.value === 'band')
        return [
          ...tenant,
          {
            label: '适用职级',
            key: 'gradeId',
            type: 'select',
            immediate: false,
            api: async () => gradeOptions.value,
            valueField: 'id',
            labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
            props: { filterable: true, placeholder: '请选择职级' }
          },
          {
            label: '币种',
            key: 'currencyCode',
            type: 'input',
            props: { maxlength: 3, placeholder: 'CNY' }
          },
          {
            label: '薪档下限',
            key: 'minimumAmount',
            type: 'number',
            props: { min: 0, precision: 2, controls: false }
          },
          {
            label: '薪档中值',
            key: 'midpointAmount',
            type: 'number',
            props: { min: 0, precision: 2, controls: false }
          },
          {
            label: '薪档上限',
            key: 'maximumAmount',
            type: 'number',
            props: { min: 0, precision: 2, controls: false }
          },
          {
            label: '生效日期',
            key: 'effectiveFrom',
            type: 'date',
            props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
          },
          {
            label: '失效日期',
            key: 'effectiveTo',
            type: 'date',
            props: { type: 'date', valueFormat: 'YYYY-MM-DD', clearable: true, class: '!w-full' }
          },
          {
            label: '政策说明',
            key: 'description',
            type: 'input',
            span: 24,
            props: { type: 'textarea', rows: 3, maxlength: 300, showWordLimit: true }
          }
        ]
      return [
        ...tenant,
        {
          label: '员工',
          key: 'employeeId',
          type: 'userSelect',
          immediate: false,
          api: loadEmployeeSelectOptions,
          props: {
            placeholder: '请选择员工',
            noDataText: '暂无可维护薪酬的员工',
            onChange: handleEmployeeChange
          }
        },
        {
          label: '薪酬方案',
          key: 'planId',
          type: 'select',
          immediate: false,
          api: async () => planOptions.value,
          valueField: 'id',
          labelFn: (option) => `${option.planName ?? ''} · ${option.planCode ?? ''}`,
          props: {
            filterable: true,
            placeholder: '请选择薪酬方案',
            onChange: (value?: string) => applySelectedPlan(value)
          }
        },
        {
          label: '职级',
          key: 'gradeId',
          type: 'select',
          immediate: false,
          api: async () => gradeOptions.value,
          valueField: 'id',
          labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
          props: { filterable: true, clearable: true, placeholder: '默认取当前主任职职级' }
        },
        {
          label: '基本工资',
          key: 'baseAmount',
          type: 'number',
          props: { min: 0, precision: 2, controls: false, placeholder: '请输入基本工资' }
        },
        {
          label: '生效日期',
          key: 'effectiveFrom',
          type: 'date',
          props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
        },
        {
          label: '失效日期',
          key: 'effectiveTo',
          type: 'date',
          props: { type: 'date', valueFormat: 'YYYY-MM-DD', clearable: true, class: '!w-full' }
        },
        {
          label: '调薪原因',
          key: 'changeReason',
          type: 'input',
          span: 24,
          props: {
            type: 'textarea',
            rows: 3,
            maxlength: 300,
            showWordLimit: true,
            placeholder: '说明定薪、调薪或校正原因'
          }
        }
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<CompensationFormModel> = {
        tenantId: isPlatformSuper.value
          ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
          : [],
        currencyCode: [
          { required: true, message: '请输入币种', trigger: 'blur' },
          { pattern: /^[A-Z]{3}$/, message: '币种须为 3 位大写字母', trigger: 'blur' }
        ],
        effectiveFrom: [{ required: true, message: '请选择生效日期', trigger: 'change' }]
      }
      if (entity.value === 'component')
        Object.assign(rules, {
          componentCode: [{ required: true, message: '请输入项目编码', trigger: 'blur' }],
          componentName: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
          category: [{ required: true, message: '请选择项目类别', trigger: 'change' }],
          amountType: [{ required: true, message: '请选择计值方式', trigger: 'change' }]
        })
      if (entity.value === 'plan')
        Object.assign(rules, {
          planCode: [{ required: true, message: '请输入方案编码', trigger: 'blur' }],
          planName: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
          payFrequency: [{ required: true, message: '请选择发薪频率', trigger: 'change' }]
        })
      if (entity.value === 'band')
        Object.assign(rules, {
          gradeId: [{ required: true, message: '请选择职级', trigger: 'change' }],
          minimumAmount: [{ required: true, message: '请输入薪档下限', trigger: 'change' }],
          midpointAmount: [{ required: true, message: '请输入薪档中值', trigger: 'change' }],
          maximumAmount: [{ required: true, message: '请输入薪档上限', trigger: 'change' }]
        })
      if (entity.value === 'employee')
        Object.assign(rules, {
          employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
          planId: [{ required: true, message: '请选择薪酬方案', trigger: 'change' }],
          baseAmount: [{ required: true, message: '请输入基本工资', trigger: 'change' }],
          changeReason: [{ required: true, message: '请输入定薪或调薪原因', trigger: 'blur' }]
        })
      return rules
    })
  })

  const replaceModel = (next: CompensationFormModel): void => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof CompensationFormModel])
    Object.assign(form.model, next)
  }

  const validateBusinessRules = (): void => {
    if (form.model.effectiveTo && form.model.effectiveTo < form.model.effectiveFrom)
      throw new Error('失效日期不能早于生效日期')
    if (entity.value === 'band') {
      const minimum = Number(form.model.minimumAmount)
      const midpoint = Number(form.model.midpointAmount)
      const maximum = Number(form.model.maximumAmount)
      if (!(minimum <= midpoint && midpoint <= maximum))
        throw new Error('薪档金额须满足：下限 ≤ 中值 ≤ 上限')
    }
  }

  const toRecord = (): RecordItem => {
    const common = { id: form.model.id, tenantId: form.model.tenantId }
    if (entity.value === 'component')
      return {
        ...common,
        componentCode: form.model.componentCode,
        componentName: form.model.componentName,
        category: form.model.category,
        amountType: form.model.amountType,
        taxable: form.model.taxable,
        enabled: form.model.enabled,
        sort: form.model.sort,
        description: form.model.description
      }
    if (entity.value === 'plan')
      return {
        ...common,
        planCode: form.model.planCode,
        planName: form.model.planName,
        currencyCode: form.model.currencyCode.toUpperCase(),
        payFrequency: form.model.payFrequency,
        enabled: form.model.enabled,
        sort: form.model.sort,
        description: form.model.description,
        items: cloneDeep(planItems.value)
      }
    if (entity.value === 'band')
      return {
        ...common,
        gradeId: form.model.gradeId!,
        currencyCode: form.model.currencyCode.toUpperCase(),
        minimumAmount: form.model.minimumAmount!,
        midpointAmount: form.model.midpointAmount!,
        maximumAmount: form.model.maximumAmount!,
        effectiveFrom: form.model.effectiveFrom,
        effectiveTo: form.model.effectiveTo,
        description: form.model.description
      }
    return {
      ...common,
      employeeId: form.model.employeeId!,
      planId: form.model.planId!,
      gradeId: form.model.gradeId,
      baseAmount: form.model.baseAmount!,
      currencyCode: form.model.currencyCode.toUpperCase(),
      payFrequency: form.model.payFrequency,
      effectiveFrom: form.model.effectiveFrom,
      effectiveTo: form.model.effectiveTo,
      changeReason: form.model.changeReason,
      items: cloneDeep(employeeItems.value)
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      validateBusinessRules()
      const type: DialogType = form.model.id ? 'edit' : 'add'
      await saveCompensationRecord(entity.value, toRecord())
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
    planItems.value = []
    employeeItems.value = []
    if (row) {
      const raw = structuredClone(toRaw(row))
      replaceModel({ ...createInitialModel(), ...raw } as CompensationFormModel)
      if (nextEntity === 'plan')
        planItems.value = ((raw as Api.Hr.CompensationPlan).items ?? []).map((item) => ({
          ...cloneDeep(item),
          defaultAmount: toOptionalNumber(item.defaultAmount),
          defaultRate: toOptionalNumber(item.defaultRate)
        }))
      if (nextEntity === 'employee')
        employeeItems.value = ((raw as Api.Hr.EmployeeCompensation).items ?? []).map((item) => ({
          ...cloneDeep(item),
          amount: toOptionalNumber(item.amount),
          rate: toOptionalNumber(item.rate)
        }))
    }
    await nextTick()
    formRef.value?.clearValidate()
    const titleMap: Record<Entity, string> = {
      employee: '员工薪酬',
      plan: '薪酬方案',
      component: '薪酬项目',
      band: '薪级范围'
    }
    await dialogRef.value?.handleOpen(undefined, {
      title: `${row ? '编辑' : '新增'}${titleMap[nextEntity]}`,
      subtitle:
        nextEntity === 'employee'
          ? '保存为草稿，批准后按生效日期进入员工薪酬历史并供财务核算读取'
          : '维护统一、可审计且按租户隔离的企业薪酬政策',
      confirmText: row ? '保存更改' : '创建草稿',
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
          await loadReferenceData()
          if (nextEntity === 'employee' && row) applySelectedPlan(form.model.planId, true)
          await nextTick()
          await Promise.all([
            formRef.value?.reloadOptions('employeeId'),
            formRef.value?.reloadOptions('planId'),
            formRef.value?.reloadOptions('gradeId')
          ])
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
  .compensation-dialog {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;

    &__selector {
      display: grid;
      grid-template-columns: 140px minmax(0, 1fr);
      gap: 16px;
      align-items: center;

      > span {
        font-size: 13px;
        font-weight: 600;
        color: var(--art-gray-700);
      }
    }

    &__item-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }

    &__item {
      min-width: 0;
      padding: 14px;
      background: color-mix(in srgb, var(--default-box-color) 68%, transparent);
      border: 1px solid var(--art-border-color);
      border-radius: var(--art-surface-radius);
    }

    &__item-heading {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;

      > div {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 14px;
        white-space: nowrap;
      }

      span {
        margin-top: 3px;
        font-size: 11px;
        color: var(--art-gray-500);
      }
    }

    &__item-fields {
      display: flex;
      gap: 16px;
      align-items: flex-end;

      label {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 6px;
        min-width: 0;

        > span {
          font-size: 12px;
          color: var(--art-gray-600);
        }
      }

      :deep(.el-input-number) {
        width: 100%;
      }
    }

    &__switch-field {
      flex: 0 0 auto !important;
    }

    &__variable-note,
    &__source-note {
      display: flex;
      flex: 1;
      gap: 6px;
      align-items: center;
      min-width: 0;
      min-height: 32px;
      font-size: 12px;
      color: var(--art-gray-500);

      svg {
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
      }
    }

    @media (width <= 760px) {
      &__selector,
      &__item-list {
        grid-template-columns: 1fr;
      }

      &__item-fields {
        flex-direction: column;
        align-items: stretch;
      }

      &__switch-field {
        flex-direction: row !important;
        align-items: center;
        justify-content: space-between;
      }
    }
  }
</style>
