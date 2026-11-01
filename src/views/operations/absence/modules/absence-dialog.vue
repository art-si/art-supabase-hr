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
    <div class="absence-dialog">
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
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { toNameCodeOption } from '@/utils/form/option'

  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
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
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'
  import {
    adjustLeaveBalance,
    fetchAbsenceOptions,
    fetchHrOrganizationTree,
    saveAbsenceRecord
  } from '@hr/api'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchAbsenceEmployeeSelector } from '@hr/api/modules/absence'
  import type { DialogType } from '@/types'

  type Entity = Exclude<Api.Hr.AbsenceEntity, 'ledger'>
  type RecordItem = Api.Hr.AbsenceRecord

  interface AbsenceFormModel {
    id?: string
    tenantId?: string
    leaveCode: string
    leaveName: string
    category: string
    unit: Api.Hr.LeaveUnit
    paidRatio: number
    minimumIncrement: number
    proofRequiredAfter?: number | null
    color: string
    enabled: boolean
    sort: number
    description?: string | null
    leaveTypeId?: string
    policyCode: string
    policyName: string
    scopeType: Api.Hr.LeavePolicyScope
    organizationId?: string | null
    employeeId?: string
    gradeId?: string | null
    entitlementMethod: Api.Hr.LeaveEntitlementMethod
    annualQuota: number
    monthlyAccrual: number
    carryoverLimit: number
    carryoverExpiryMonths?: number | null
    allowNegative: boolean
    negativeLimit: number
    probationEligible: boolean
    effectiveFrom: string
    effectiveTo?: string | null
    status: Api.Hr.LeavePolicyStatus
    startDate: string
    endDate: string
    startSession: 'full' | 'morning' | 'afternoon'
    endSession: 'full' | 'morning' | 'afternoon'
    requestedAmount?: number
    reason: string
    proofUrls: string[]
    balanceYear: number
    delta?: number
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
    reloadOptions: (key: string) => Promise<void>
  }

  const emit = defineEmits<{ success: [type: DialogType] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const activeTab = ref('')
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('request')
  const tenantOptions = ref<FormItemOption[]>([])
  const employeeSelection = shallowRef<EmployeeIntegrationItem[]>([])
  const leaveTypeOptions = shallowRef<Api.Hr.AbsenceReference[]>([])
  const organizationOptions = shallowRef<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const gradeOptions = shallowRef<Api.Hr.AbsenceReference[]>([])

  const createInitialModel = (): AbsenceFormModel => ({
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    leaveCode: '',
    leaveName: '',
    category: 'annual',
    unit: 'day',
    paidRatio: 1,
    minimumIncrement: 0.5,
    proofRequiredAfter: null,
    color: '#6366f1',
    enabled: true,
    sort: 0,
    description: null,
    leaveTypeId: undefined,
    policyCode: '',
    policyName: '',
    scopeType: 'all',
    organizationId: null,
    employeeId: undefined,
    gradeId: null,
    entitlementMethod: 'annual',
    annualQuota: 0,
    monthlyAccrual: 0,
    carryoverLimit: 0,
    carryoverExpiryMonths: null,
    allowNegative: false,
    negativeLimit: 0,
    probationEligible: false,
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
    effectiveTo: null,
    status: 'draft',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
    startSession: 'full',
    endSession: 'full',
    requestedAmount: undefined,
    reason: '',
    proofUrls: [],
    balanceYear: dayjs().year(),
    delta: undefined
  })

  const form = reactive<{
    model: AbsenceFormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<AbsenceFormModel>>
  }>({
    model: createInitialModel(),
    items: computed((): FormItem[] => {
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

      if (entity.value === 'type')
        return [
          ...common,
          input('leaveCode', '假别编码', '如 ANNUAL_LEAVE'),
          input('leaveName', '假别名称', '如 年休假'),
          dict('category', '休假类别', 'hrLeaveCategory'),
          dict('unit', '计量单位', 'hrLeaveUnit'),
          number('paidRatio', '带薪比例', { min: 0, max: 1, step: 0.1, precision: 4 }),
          number('minimumIncrement', '最小请假单位', { min: 0.01, step: 0.5, precision: 2 }),
          number('proofRequiredAfter', '证明材料阈值', {
            min: 0,
            precision: 2,
            placeholder: '留空表示不强制'
          }),
          input('color', '识别颜色', '#6366f1'),
          { label: '启用', key: 'enabled', type: 'switch' },
          number('sort', '排序', { min: 0, precision: 0 }),
          textarea('description', '假别说明')
        ]

      if (entity.value === 'policy') {
        const scopeItem = createScopeItem()
        return [
          ...common,
          { key: 'policyScope', label: '政策与适用范围', type: 'tab' },
          select('leaveTypeId', '假别', leaveTypeOptions.value, '请选择假别'),
          input('policyCode', '政策编码', '如 ANNUAL_STD'),
          input('policyName', '政策名称', '如 全员年休假政策'),
          {
            ...dict('scopeType', '适用范围', 'hrLeavePolicyScope'),
            props: {
              onChange: handleScopeTypeChange
            }
          },
          ...(scopeItem ? [scopeItem] : []),
          { key: 'policyEntitlement', label: '权益与生效', type: 'tab' },
          dict('entitlementMethod', '权益方式', 'hrLeaveEntitlementMethod'),
          number('annualQuota', '年度额度', { min: 0, precision: 2 }),
          number('monthlyAccrual', '每月累积', { min: 0, precision: 4 }),
          number('carryoverLimit', '最大结转', { min: 0, precision: 2 }),
          number('carryoverExpiryMonths', '结转有效月数', { min: 1, max: 60, precision: 0 }),
          { label: '允许负余额', key: 'allowNegative', type: 'switch' },
          number('negativeLimit', '负余额上限', { min: 0, precision: 2 }),
          { label: '试用期适用', key: 'probationEligible', type: 'switch' },
          date('effectiveFrom', '生效日期'),
          date('effectiveTo', '失效日期', true),
          dict('status', '政策状态', 'hrLeavePolicyStatus'),
          textarea('description', '政策说明')
        ]
      }

      if (entity.value === 'request')
        return [
          ...common,
          {
            props: {
              selectedData: employeeSelection.value,
              'onUpdate:selectedData': ($event: typeof employeeSelection.value) => {
                employeeSelection.value = $event
              },
              tenantId: form.model.tenantId,
              apiFn: fetchAbsenceEmployeeSelector,
              displayFields: [],
              placeholder: '请选择员工'
            },
            label: '员工',
            key: 'employeeId',
            type: 'employeeSelect'
          },
          select('leaveTypeId', '假别', leaveTypeOptions.value, '请选择假别'),
          date('startDate', '开始日期'),
          dict('startSession', '开始时段', 'hrLeaveSession'),
          date('endDate', '结束日期'),
          dict('endSession', '结束时段', 'hrLeaveSession'),
          number('requestedAmount', '申请数量', { min: 0.01, precision: 2 }),
          textarea('reason', '申请原因', '说明休假原因；该字段受独立隐私权限保护')
        ]

      return [
        ...common,
        {
          props: {
            selectedData: employeeSelection.value,
            'onUpdate:selectedData': ($event: typeof employeeSelection.value) => {
              employeeSelection.value = $event
            },
            tenantId: form.model.tenantId,
            apiFn: fetchAbsenceEmployeeSelector,
            displayFields: [],
            placeholder: '请选择员工'
          },
          label: '员工',
          key: 'employeeId',
          type: 'employeeSelect'
        },
        select('leaveTypeId', '假别', leaveTypeOptions.value, '请选择假别'),
        number('balanceYear', '余额年度', { min: 2000, max: 2200, precision: 0 }),
        number('delta', '调整数量', { precision: 2, placeholder: '正数增加，负数扣减' }),
        textarea('reason', '调整原因', '说明调整依据；保存后写入不可变余额台账')
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<AbsenceFormModel> = {
        tenantId: isPlatformSuper.value
          ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
          : []
      }
      if (entity.value === 'type')
        Object.assign(rules, {
          leaveCode: [{ required: true, message: '请输入假别编码', trigger: 'blur' }],
          leaveName: [{ required: true, message: '请输入假别名称', trigger: 'blur' }],
          category: [{ required: true, message: '请选择休假类别', trigger: 'change' }],
          unit: [{ required: true, message: '请选择计量单位', trigger: 'change' }]
        })
      if (entity.value === 'policy')
        Object.assign(rules, {
          leaveTypeId: [{ required: true, message: '请选择假别', trigger: 'change' }],
          policyCode: [{ required: true, message: '请输入政策编码', trigger: 'blur' }],
          policyName: [{ required: true, message: '请输入政策名称', trigger: 'blur' }],
          scopeType: [{ required: true, message: '请选择适用范围', trigger: 'change' }],
          entitlementMethod: [{ required: true, message: '请选择权益方式', trigger: 'change' }],
          effectiveFrom: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
          status: [{ required: true, message: '请选择政策状态', trigger: 'change' }]
        })
      if (entity.value === 'request')
        Object.assign(rules, {
          employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
          leaveTypeId: [{ required: true, message: '请选择假别', trigger: 'change' }],
          startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
          endDate: [{ required: true, message: '请选择结束日期', trigger: 'change' }],
          requestedAmount: [{ required: true, message: '请输入申请数量', trigger: 'change' }],
          reason: [{ required: true, message: '请输入申请原因', trigger: 'blur' }]
        })
      if (entity.value === 'balance')
        Object.assign(rules, {
          employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
          leaveTypeId: [{ required: true, message: '请选择假别', trigger: 'change' }],
          balanceYear: [{ required: true, message: '请输入余额年度', trigger: 'change' }],
          delta: [{ required: true, message: '请输入调整数量', trigger: 'change' }],
          reason: [{ required: true, message: '请输入调整原因', trigger: 'blur' }]
        })
      return rules
    })
  })

  const contextNote = computed(() => {
    const notes: Record<Entity, { icon: string; title: string; description: string }> = {
      request: {
        icon: 'ri:shield-user-line',
        title: '隐私保护',
        description: '休假原因与证明材料使用独立权限；提交后先占用余额，批准后再转为实际使用。'
      },
      balance: {
        icon: 'ri:book-open-line',
        title: '不可变台账',
        description: '余额不允许直接覆盖，每次调整都会生成可追溯的台账分录。'
      },
      policy: {
        icon: 'ri:scales-3-line',
        title: '有效期政策',
        description: '按全员、组织、职级或员工设定政策，同一适用范围的生效期间不得重叠。'
      },
      type: {
        icon: 'ri:price-tag-3-line',
        title: '标准假别',
        description: '仅定义计量与展示口径；法定额度、结转和负余额规则统一在政策中维护。'
      }
    }
    return notes[entity.value]
  })

  function input(key: keyof AbsenceFormModel, label: string, placeholder?: string): FormItem {
    return { label, key: String(key), type: 'input', props: { placeholder } }
  }
  function number(
    key: keyof AbsenceFormModel,
    label: string,
    props: Record<string, unknown> = {}
  ): FormItem {
    return { label, key: String(key), type: 'number', props: { controls: false, ...props } }
  }
  function dict(key: keyof AbsenceFormModel, label: string, dictCode: string): FormItem {
    return {
      label,
      key: String(key),
      type: 'select',
      options: getDictMap.value[dictCode] ?? [],
      props: { placeholder: `请选择${label}` }
    }
  }
  function date(key: keyof AbsenceFormModel, label: string, clearable = false): FormItem {
    return {
      label,
      key: String(key),
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', clearable, class: '!w-full' }
    }
  }
  function select(
    key: keyof AbsenceFormModel,
    label: string,
    options: Api.Hr.AbsenceReference[],
    placeholder: string
  ): FormItem {
    return {
      label,
      key: String(key),
      type: 'select',
      options: options.map(toNameCodeOption),
      props: { filterable: true, placeholder }
    }
  }
  function textarea(key: keyof AbsenceFormModel, label: string, placeholder?: string): FormItem {
    return {
      label,
      key: String(key),
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true, placeholder }
    }
  }

  const createScopeItem = (): FormItem | null => {
    if (form.model.scopeType === 'organization')
      return hrOrganizationTreeField({
        key: 'organizationId',
        label: '指定组织',
        options: organizationOptions.value,
        placeholder: '请选择适用组织'
      })
    if (form.model.scopeType === 'employee')
      return {
        props: {
          selectedData: employeeSelection.value,
          'onUpdate:selectedData': ($event: typeof employeeSelection.value) => {
            employeeSelection.value = $event
          },
          tenantId: form.model.tenantId,
          apiFn: fetchAbsenceEmployeeSelector,
          displayFields: [],
          placeholder: '请选择员工'
        },
        label: '指定员工',
        key: 'employeeId',
        type: 'employeeSelect'
      }
    if (form.model.scopeType === 'grade')
      return select('gradeId', '指定职级', gradeOptions.value, '请选择适用职级')
    return null
  }

  const replaceModel = (next: AbsenceFormModel): void => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof AbsenceFormModel])
    Object.assign(form.model, next)
  }

  let referenceRequest = 0
  const loadReferenceData = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = form.model.tenantId
    const kind = entity.value
    leaveTypeOptions.value = []
    organizationOptions.value = []
    gradeOptions.value = []
    if (isPlatformSuper.value && !tenantId) return
    const [leaveTypes, organizations, grades] = await Promise.all([
      kind !== 'type' ? fetchAbsenceOptions('leave_type', tenantId) : undefined,
      kind === 'policy' ? fetchHrOrganizationTree('absence', { tenantId }) : undefined,
      kind === 'policy' ? fetchAbsenceOptions('grade', tenantId) : undefined
    ])
    if (request !== referenceRequest || tenantId !== form.model.tenantId || kind !== entity.value)
      return
    leaveTypeOptions.value = leaveTypes?.data ?? []
    organizationOptions.value = toHrOrganizationTreeOptions(organizations?.data ?? [])
    gradeOptions.value = grades?.data ?? []
  }

  const reloadReferenceFields = async (): Promise<void> => {
    await nextTick()
    await Promise.all([
      formRef.value?.reloadOptions('leaveTypeId'),
      formRef.value?.reloadOptions('organizationId'),
      formRef.value?.reloadOptions('gradeId')
    ])
  }

  const handleTenantChange = async (): Promise<void> => {
    form.model.employeeId = undefined
    employeeSelection.value = []
    form.model.leaveTypeId = undefined
    form.model.organizationId = null
    form.model.gradeId = null
    await loadReferenceData()
    await reloadReferenceFields()
  }

  const handleScopeTypeChange = (): void => {
    form.model.organizationId = null
    form.model.employeeId = undefined
    employeeSelection.value = []
    form.model.gradeId = null
  }

  const validateBusinessRules = (): void => {
    if (entity.value === 'policy') {
      if (form.model.effectiveTo && form.model.effectiveTo < form.model.effectiveFrom)
        throw new Error('失效日期不能早于生效日期')
      const targetMap = {
        organization: form.model.organizationId,
        employee: form.model.employeeId,
        grade: form.model.gradeId
      }
      if (form.model.scopeType !== 'all' && !targetMap[form.model.scopeType])
        throw new Error('请选择政策适用对象')
    }
    if (entity.value === 'request') {
      if (form.model.endDate < form.model.startDate) throw new Error('结束日期不能早于开始日期')
      if (dayjs(form.model.startDate).year() !== dayjs(form.model.endDate).year())
        throw new Error('跨年度请假请拆分为两张申请')
    }
    if (entity.value === 'balance' && Number(form.model.delta) === 0)
      throw new Error('调整数量不能为 0')
  }

  const toRecord = (): RecordItem => {
    const common = { id: form.model.id, tenantId: form.model.tenantId }
    if (entity.value === 'type')
      return {
        ...common,
        leaveCode: form.model.leaveCode,
        leaveName: form.model.leaveName,
        category: form.model.category,
        unit: form.model.unit,
        paidRatio: Number(form.model.paidRatio),
        minimumIncrement: Number(form.model.minimumIncrement),
        proofRequiredAfter: form.model.proofRequiredAfter,
        color: form.model.color,
        enabled: form.model.enabled,
        sort: Number(form.model.sort),
        description: form.model.description
      }
    if (entity.value === 'policy')
      return {
        ...common,
        leaveTypeId: form.model.leaveTypeId!,
        policyCode: form.model.policyCode,
        policyName: form.model.policyName,
        scopeType: form.model.scopeType,
        organizationId: form.model.organizationId,
        employeeId: form.model.employeeId ?? null,
        gradeId: form.model.gradeId,
        entitlementMethod: form.model.entitlementMethod,
        annualQuota: Number(form.model.annualQuota),
        monthlyAccrual: Number(form.model.monthlyAccrual),
        carryoverLimit: Number(form.model.carryoverLimit),
        carryoverExpiryMonths: form.model.carryoverExpiryMonths,
        allowNegative: form.model.allowNegative,
        negativeLimit: Number(form.model.negativeLimit),
        probationEligible: form.model.probationEligible,
        effectiveFrom: form.model.effectiveFrom,
        effectiveTo: form.model.effectiveTo,
        status: form.model.status,
        description: form.model.description
      }
    return {
      ...common,
      employeeId: form.model.employeeId!,
      leaveTypeId: form.model.leaveTypeId!,
      startDate: form.model.startDate,
      endDate: form.model.endDate,
      startSession: form.model.startSession,
      endSession: form.model.endSession,
      requestedAmount: Number(form.model.requestedAmount),
      reason: form.model.reason,
      proofUrls: form.model.proofUrls
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      validateBusinessRules()
      if (entity.value === 'balance') {
        await adjustLeaveBalance({
          tenantId: form.model.tenantId,
          employeeId: form.model.employeeId!,
          leaveTypeId: form.model.leaveTypeId!,
          balanceYear: Number(form.model.balanceYear),
          delta: Number(form.model.delta),
          reason: form.model.reason
        })
        emit('success', 'edit')
      } else {
        const type: DialogType = form.model.id ? 'edit' : 'add'
        await saveAbsenceRecord(entity.value, toRecord())
        emit('success', type)
      }
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (nextEntity: Entity, row?: RecordItem): Promise<void> => {
    entity.value = nextEntity
    replaceModel(createInitialModel())
    employeeSelection.value =
      row && 'employee' in row && row.employee?.id && row.tenantId
        ? [
            {
              id: row.employee.id,
              tenantId: row.tenantId,
              employeeName: row.employee.employeeName ?? '未命名员工',
              employeeNo: row.employee.employeeNo ?? '',
              employmentStatus: ''
            }
          ]
        : []
    if (row)
      replaceModel({
        ...createInitialModel(),
        ...(structuredClone(toRaw(row)) as Partial<AbsenceFormModel>),
        employeeId: 'employeeId' in row ? (row.employeeId ?? undefined) : undefined
      })
    await nextTick()
    formRef.value?.clearValidate()
    const titleMap: Record<Entity, string> = {
      request: '休假申请',
      balance: '休假余额',
      policy: '休假政策',
      type: '假别'
    }
    await dialogRef.value?.handleOpen(undefined, {
      title:
        nextEntity === 'balance'
          ? '调整休假余额'
          : `${row ? '编辑' : '新增'}${titleMap[nextEntity]}`,
      subtitle: '假勤政策、余额与审批结果全程按租户隔离并保留可审计历史',
      confirmText: nextEntity === 'balance' ? '确认调整' : row ? '保存更改' : '创建记录',
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
          await reloadReferenceFields()
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
  .absence-dialog {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
</style>
