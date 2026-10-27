<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="contingent-dialog">
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

      <section v-if="entity === 'engagement'" class="contingent-dialog__notice">
        <ArtSvgIcon icon="ri:information-line" />
        <span>
          保存任务后系统自动生成身份、合同、保密、安全、门禁和账号六项准入控制；全部完成后才能激活在场。
        </span>
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
      >
        <template #sponsorEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.sponsorEmployeeId"
            v-model:selected-data="sponsorSelection"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchContingentSponsorEmployeeSelector"
            :display-fields="['jobTitle']"
            placeholder="请选择内部负责人"
          />
        </template>
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
  import { normalizeNullableText } from '@/utils/form/normalize'
  import dayjs from 'dayjs'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { fetchContingentSponsorEmployeeSelector } from '@hr/api/modules/contingent-workforce'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import {
    fetchContingentWorkforceOptions,
    fetchHrOrganizationTree,
    saveContingentWorkforceRecord
  } from '@hr/api'
  import type { DialogType } from '@/types'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'

  type Entity = Api.Hr.ContingentWorkforceEntity
  type RecordItem = Api.Hr.ContingentWorkforceRecord

  interface OpenPayload {
    entity: Entity
    type: DialogType
    editData?: RecordItem
    engagement?: Api.Hr.ExternalEngagement
  }

  interface FormModel {
    id?: string
    tenantId?: string
    vendorCode: string
    vendorName: string
    registrationNo?: string
    contactName?: string
    contactPhone?: string
    contactEmail?: string
    serviceScope?: string
    contractNo?: string
    contractStartDate?: string
    contractEndDate?: string
    complianceStatus: 'pending' | 'verified' | 'rejected' | 'expired'
    riskLevel: 'low' | 'medium' | 'high'
    vendorStatus: Api.Hr.ExternalVendorStatus
    note?: string
    workerNo: string
    workerName: string
    workerType: Api.Hr.ExternalWorkerType
    vendorId?: string
    vendorWorkerNo?: string
    phone?: string
    email?: string
    identityCheckStatus: 'pending' | 'passed' | 'failed' | 'expired'
    workerStatus: Api.Hr.ExternalWorkerStatus
    engagementNo: string
    workerId?: string
    organizationId?: string
    positionId?: string
    sponsorEmployeeId?: string
    serviceTitle: string
    workLocation?: string
    startDate: string
    endDate: string
    accessExpiryDate: string
    fte: number
    billingRate?: number
    billingUnit?: 'hour' | 'day' | 'month' | 'fixed'
    currencyCode: string
    engagementStatus: Api.Hr.ExternalEngagementStatus
    engagementComplianceStatus: 'pending' | 'cleared' | 'blocked' | 'expired'
    activationNote?: string
    version: number
    engagementId?: string
    controlType: Api.Hr.ExternalEngagementControl['controlType']
    controlName: string
    required: boolean
    controlStatus: Api.Hr.ExternalControlStatus
    dueDate?: string
    evidenceReference?: string
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [entity: Entity, type: DialogType] }>()
  const userStore = useUserStore()
  const riskLevelOptions = useDictionaryOptions('hrContingentVendorRiskLevel')
  const workerTypeOptions = useDictionaryOptions('hrContingentWorkerType')
  const billingUnitOptions = useDictionaryOptions('hrContingentBillingUnit')
  const controlTypeOptions = useDictionaryOptions('hrContingentControlType')
  const controlStatusOptions = useDictionaryOptions('hrContingentControlStatus')
  const { getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const { hasAuth } = useAuth()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const entity = ref<Entity>('engagement')
  const dialogType = ref<DialogType>('add')
  const parentTenantLocked = ref(false)
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const organizationOptions = ref<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const sponsorSelection = shallowRef<EmployeeIntegrationItem[]>([])
  const references = reactive({
    vendors: [] as Api.Hr.ContingentWorkforceReference[],
    workers: [] as Api.Hr.ContingentWorkforceReference[],
    positions: [] as Api.Hr.ContingentWorkforceReference[],
    engagements: [] as Api.Hr.ContingentWorkforceReference[]
  })

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    vendorCode: '',
    vendorName: '',
    registrationNo: undefined,
    contactName: undefined,
    contactPhone: undefined,
    contactEmail: undefined,
    serviceScope: undefined,
    contractNo: undefined,
    contractStartDate: dayjs().format('YYYY-MM-DD'),
    contractEndDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
    complianceStatus: 'pending',
    riskLevel: 'medium',
    vendorStatus: 'draft',
    note: undefined,
    workerNo: '',
    workerName: '',
    workerType: 'outsourced',
    vendorId: undefined,
    vendorWorkerNo: undefined,
    phone: undefined,
    email: undefined,
    identityCheckStatus: 'pending',
    workerStatus: 'candidate',
    engagementNo: '',
    workerId: undefined,
    organizationId: undefined,
    positionId: undefined,
    sponsorEmployeeId: undefined,
    serviceTitle: '',
    workLocation: undefined,
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(3, 'month').format('YYYY-MM-DD'),
    accessExpiryDate: dayjs().add(3, 'month').format('YYYY-MM-DD'),
    fte: 1,
    billingRate: undefined,
    billingUnit: undefined,
    currencyCode: 'CNY',
    engagementStatus: 'draft',
    engagementComplianceStatus: 'pending',
    activationNote: undefined,
    version: 1,
    engagementId: undefined,
    controlType: 'other',
    controlName: '',
    required: true,
    controlStatus: 'pending',
    dueDate: dayjs().format('YYYY-MM-DD'),
    evidenceReference: undefined
  })
  const formModel = reactive<FormModel>(createInitialModel())

  const commonTenantItems = (): FormItem[] =>
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
              disabled: Boolean(formModel.id),
              placeholder: '请选择所属租户'
            }
          }
        ]
      : []

  const vendorItems = computed<FormItem[]>(() => [
    ...commonTenantItems(),
    { label: '供应商身份', key: 'vendorIdentity', type: 'divider', span: 24 },
    { label: '供应商编码', key: 'vendorCode', type: 'input', props: { maxlength: 40 } },
    { label: '供应商名称', key: 'vendorName', type: 'input', props: { maxlength: 120 } },
    { label: '统一登记号', key: 'registrationNo', type: 'input', props: { maxlength: 80 } },
    {
      label: '风险等级',
      key: 'riskLevel',
      type: 'select',
      options: riskLevelOptions
    },
    { label: '合同与服务', key: 'vendorContract', type: 'divider', span: 24 },
    { label: '合同/框架编号', key: 'contractNo', type: 'input', props: { maxlength: 80 } },
    { label: '服务范围', key: 'serviceScope', type: 'input', props: { maxlength: 240 } },
    { label: '合同开始日', key: 'contractStartDate', type: 'date', props: { class: '!w-full' } },
    { label: '合同结束日', key: 'contractEndDate', type: 'date', props: { class: '!w-full' } },
    { label: '联系与备注', key: 'vendorContact', type: 'divider', span: 24 },
    { label: '联系人', key: 'contactName', type: 'input', props: { maxlength: 60 } },
    { label: '联系电话', key: 'contactPhone', type: 'input', props: { maxlength: 40 } },
    { label: '联系邮箱', key: 'contactEmail', type: 'input', props: { maxlength: 120 } },
    {
      label: '内部备注',
      key: 'note',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 600, showWordLimit: true }
    }
  ])

  const workerItems = computed<FormItem[]>(() => [
    ...commonTenantItems(),
    { label: '人员身份', key: 'workerIdentity', type: 'divider', span: 24 },
    { label: '外部人员编号', key: 'workerNo', type: 'input', props: { maxlength: 40 } },
    { label: '姓名', key: 'workerName', type: 'input', props: { maxlength: 80 } },
    {
      label: '用工类型',
      key: 'workerType',
      type: 'select',
      options: workerTypeOptions
    },
    {
      label: '所属供应商',
      key: 'vendorId',
      type: 'select',
      options: references.vendors.map(toNameCodeOption),
      props: { clearable: true, filterable: true, placeholder: '外包/派遣必选' }
    },
    { label: '供应商人员编号', key: 'vendorWorkerNo', type: 'input', props: { maxlength: 60 } },
    { label: '联系与备注', key: 'workerContact', type: 'divider', span: 24 },
    { label: '联系电话', key: 'phone', type: 'input', props: { maxlength: 40 } },
    { label: '联系邮箱', key: 'email', type: 'input', props: { maxlength: 120 } },
    {
      label: '内部备注',
      key: 'note',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 600, showWordLimit: true }
    }
  ])

  const filteredPositions = computed(() =>
    references.positions.filter(
      (item) => !formModel.organizationId || item.organizationId === formModel.organizationId
    )
  )
  const engagementItems = computed<FormItem[]>(() => [
    ...commonTenantItems(),
    { label: '任务归属', key: 'engagementIdentity', type: 'divider', span: 24 },
    { label: '用工任务编号', key: 'engagementNo', type: 'input', props: { maxlength: 40 } },
    {
      label: '外部人员',
      key: 'workerId',
      type: 'select',
      options: references.workers.map(toNameCodeOption),
      props: { filterable: true, placeholder: '请选择未锁定的外部人员' }
    },
    hrOrganizationTreeField({
      key: 'organizationId',
      label: '用工组织',
      options: organizationOptions.value
    }),
    {
      label: '关联岗位',
      key: 'positionId',
      type: 'select',
      options: filteredPositions.value.map(toNameCodeOption),
      props: { clearable: true, filterable: true, placeholder: '可选：不占正式员工编制' }
    },
    {
      label: '内部负责人',
      key: 'sponsorEmployeeId',
      type: 'input',
      description: '对准入、在场与退场负责'
    },
    { label: '服务角色', key: 'serviceTitle', type: 'input', props: { maxlength: 120 } },
    { label: '工作地点', key: 'workLocation', type: 'input', props: { maxlength: 160 } },
    { label: '周期与访问', key: 'engagementPeriod', type: 'divider', span: 24 },
    { label: '开始日期', key: 'startDate', type: 'date', props: { class: '!w-full' } },
    { label: '计划结束日', key: 'endDate', type: 'date', props: { class: '!w-full' } },
    {
      label: '访问权限到期日',
      key: 'accessExpiryDate',
      type: 'date',
      props: { class: '!w-full' },
      help: '不得晚于计划结束日'
    },
    {
      label: '投入比例 FTE',
      key: 'fte',
      type: 'number',
      props: { min: 0.01, max: 1, step: 0.1, precision: 2, class: '!w-full' }
    },
    { label: '成本与说明', key: 'engagementCost', type: 'divider', span: 24 },
    {
      label: '结算单价',
      key: 'billingRate',
      type: 'number',
      hidden: () => !hasAuth('Hr:ContingentWorkforce:Cost:Edit'),
      props: { min: 0, precision: 2, class: '!w-full' }
    },
    {
      label: '结算单位',
      key: 'billingUnit',
      type: 'select',
      hidden: () => !hasAuth('Hr:ContingentWorkforce:Cost:Edit'),
      options: billingUnitOptions,
      props: { clearable: true }
    },
    {
      label: '币种',
      key: 'currencyCode',
      type: 'input',
      hidden: () => !hasAuth('Hr:ContingentWorkforce:Cost:Edit'),
      props: { maxlength: 3 }
    },
    {
      label: '任务说明',
      key: 'activationNote',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 600, showWordLimit: true }
    }
  ])

  const controlItems = computed<FormItem[]>(() => [
    ...commonTenantItems(),
    { label: '控制对象', key: 'controlTarget', type: 'divider', span: 24 },
    {
      label: '用工任务',
      key: 'engagementId',
      type: 'select',
      span: 24,
      options: references.engagements.map(toNameCodeOption),
      props: { filterable: true, disabled: dialogType.value === 'edit' }
    },
    {
      label: '控制类型',
      key: 'controlType',
      type: 'select',
      options: controlTypeOptions
    },
    { label: '控制项名称', key: 'controlName', type: 'input', props: { maxlength: 120 } },
    { label: '要求与结果', key: 'controlResult', type: 'divider', span: 24 },
    { label: '必需项', key: 'required', type: 'switch' },
    {
      label: '执行状态',
      key: 'controlStatus',
      type: 'select',
      options: controlStatusOptions
    },
    { label: '截止日期', key: 'dueDate', type: 'date', props: { class: '!w-full' } },
    { label: '证明/工单引用', key: 'evidenceReference', type: 'input', props: { maxlength: 240 } },
    {
      label: '备注 / 豁免依据',
      key: 'note',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 600, showWordLimit: true }
    }
  ])

  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model: formModel,
    items: computed(() =>
      entity.value === 'vendor'
        ? vendorItems.value
        : entity.value === 'worker'
          ? workerItems.value
          : entity.value === 'engagement'
            ? engagementItems.value
            : controlItems.value
    ),
    rules: computed(() => ({
      tenantId: isPlatformSuper.value
        ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
        : [],
      vendorCode:
        entity.value === 'vendor' ? [{ required: true, message: '请输入供应商编码' }] : [],
      vendorName:
        entity.value === 'vendor' ? [{ required: true, message: '请输入供应商名称' }] : [],
      contractStartDate:
        entity.value === 'vendor' ? [{ required: true, message: '请选择合同开始日' }] : [],
      contractEndDate:
        entity.value === 'vendor' ? [{ required: true, message: '请选择合同结束日' }] : [],
      workerNo:
        entity.value === 'worker' ? [{ required: true, message: '请输入外部人员编号' }] : [],
      workerName: entity.value === 'worker' ? [{ required: true, message: '请输入姓名' }] : [],
      workerType: entity.value === 'worker' ? [{ required: true, message: '请选择用工类型' }] : [],
      engagementNo:
        entity.value === 'engagement' ? [{ required: true, message: '请输入用工任务编号' }] : [],
      workerId:
        entity.value === 'engagement' ? [{ required: true, message: '请选择外部人员' }] : [],
      organizationId:
        entity.value === 'engagement' ? [{ required: true, message: '请选择用工组织' }] : [],
      sponsorEmployeeId:
        entity.value === 'engagement' ? [{ required: true, message: '请选择内部负责人' }] : [],
      serviceTitle:
        entity.value === 'engagement' ? [{ required: true, message: '请输入服务角色' }] : [],
      startDate:
        entity.value === 'engagement' ? [{ required: true, message: '请选择开始日期' }] : [],
      endDate: entity.value === 'engagement' ? [{ required: true, message: '请选择结束日期' }] : [],
      accessExpiryDate:
        entity.value === 'engagement' ? [{ required: true, message: '请选择访问到期日' }] : [],
      engagementId:
        entity.value === 'control' ? [{ required: true, message: '请选择用工任务' }] : [],
      controlType:
        entity.value === 'control' ? [{ required: true, message: '请选择控制类型' }] : [],
      controlName:
        entity.value === 'control' ? [{ required: true, message: '请输入控制项名称' }] : []
    }))
  })

  const context = computed(() => {
    if (entity.value === 'vendor')
      return {
        icon: 'ri:building-4-line',
        eyebrow: 'SUPPLIER ASSURANCE',
        title: '供应商与合同边界',
        description: '登记主体、服务范围与合同期限；完成合规核验并处于合同有效期内后才能激活。',
        boundary: '供应商不等于员工'
      }
    if (entity.value === 'worker')
      return {
        icon: 'ri:user-shared-line',
        eyebrow: 'EXTERNAL WORKER IDENTITY',
        title: '外部人员身份与来源',
        description: '维护外部人员最小必要档案；身份核验使用独立状态，不写入正式员工花名册。',
        boundary: '联系方式独立授权'
      }
    if (entity.value === 'control')
      return {
        icon: 'ri:shield-keyhole-line',
        eyebrow: 'ACCESS & COMPLIANCE CONTROL',
        title: '准入与退场控制项',
        description: '把核验、协议、培训、账号、门禁与资产动作变成可追溯的责任清单。',
        boundary: '必需项形成硬门禁'
      }
    return {
      icon: 'ri:briefcase-4-line',
      eyebrow: 'CONTINGENT ENGAGEMENT',
      title: '用工任务与内部责任',
      description: '一项任务明确外部人员、组织、内部负责人、服务周期、访问到期和成本口径。',
      boundary: '不占正式员工编制'
    }
  })

  const validateBusinessRules = (): boolean => {
    if (
      entity.value === 'vendor' &&
      formModel.contractStartDate &&
      formModel.contractEndDate &&
      dayjs(formModel.contractEndDate).isBefore(formModel.contractStartDate, 'day')
    ) {
      ElMessage.warning('合同结束日不能早于开始日')
      return false
    }
    if (
      entity.value === 'worker' &&
      ['outsourced', 'dispatch'].includes(formModel.workerType) &&
      !formModel.vendorId
    ) {
      ElMessage.warning('外包或劳务派遣人员必须选择供应商')
      return false
    }
    if (entity.value === 'engagement') {
      if (dayjs(formModel.endDate).isBefore(formModel.startDate, 'day')) {
        ElMessage.warning('计划结束日不能早于开始日')
        return false
      }
      if (
        dayjs(formModel.accessExpiryDate).isBefore(formModel.startDate, 'day') ||
        dayjs(formModel.accessExpiryDate).isAfter(formModel.endDate, 'day')
      ) {
        ElMessage.warning('访问权限到期日必须位于用工任务周期内')
        return false
      }
    }
    if (
      entity.value === 'control' &&
      formModel.controlStatus === 'waived' &&
      !formModel.note?.trim()
    ) {
      ElMessage.warning('豁免必需控制项必须填写依据')
      return false
    }
    return true
  }

  const toRecord = (): RecordItem => {
    if (entity.value === 'vendor')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        vendorCode: formModel.vendorCode.trim(),
        vendorName: formModel.vendorName.trim(),
        registrationNo: normalizeNullableText(formModel.registrationNo),
        contactName: normalizeNullableText(formModel.contactName),
        contactPhone: normalizeNullableText(formModel.contactPhone),
        contactEmail: normalizeNullableText(formModel.contactEmail),
        serviceScope: normalizeNullableText(formModel.serviceScope),
        contractNo: normalizeNullableText(formModel.contractNo),
        contractStartDate: formModel.contractStartDate || null,
        contractEndDate: formModel.contractEndDate || null,
        complianceStatus: formModel.complianceStatus,
        riskLevel: formModel.riskLevel,
        status: formModel.vendorStatus,
        note: normalizeNullableText(formModel.note)
      }
    if (entity.value === 'worker')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        workerNo: formModel.workerNo.trim(),
        workerName: formModel.workerName.trim(),
        workerType: formModel.workerType,
        vendorId: formModel.vendorId || null,
        vendorWorkerNo: normalizeNullableText(formModel.vendorWorkerNo),
        phone: normalizeNullableText(formModel.phone),
        email: normalizeNullableText(formModel.email),
        identityCheckStatus: formModel.identityCheckStatus,
        status: formModel.workerStatus,
        note: normalizeNullableText(formModel.note)
      }
    if (entity.value === 'engagement')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        engagementNo: formModel.engagementNo.trim(),
        workerId: formModel.workerId!,
        vendorId: formModel.vendorId || null,
        organizationId: formModel.organizationId!,
        positionId: formModel.positionId || null,
        sponsorEmployeeId: formModel.sponsorEmployeeId!,
        serviceTitle: formModel.serviceTitle.trim(),
        workLocation: normalizeNullableText(formModel.workLocation),
        startDate: formModel.startDate,
        endDate: formModel.endDate,
        accessExpiryDate: formModel.accessExpiryDate,
        fte: formModel.fte,
        billingRate: formModel.billingRate,
        billingUnit: formModel.billingUnit || null,
        currencyCode: formModel.currencyCode.trim().toUpperCase(),
        complianceStatus: formModel.engagementComplianceStatus,
        status: formModel.engagementStatus,
        activationNote: normalizeNullableText(formModel.activationNote),
        version: formModel.version
      }
    return {
      id: formModel.id,
      tenantId: formModel.tenantId,
      engagementId: formModel.engagementId!,
      controlType: formModel.controlType,
      controlName: formModel.controlName.trim(),
      required: formModel.required,
      status: formModel.controlStatus,
      dueDate: formModel.dueDate || null,
      evidenceReference: normalizeNullableText(formModel.evidenceReference),
      note: normalizeNullableText(formModel.note)
    }
  }

  const setFromRecord = (record: RecordItem): void => {
    Object.assign(formModel, createInitialModel(), record)
    if ('status' in record) {
      if (entity.value === 'vendor')
        formModel.vendorStatus = record.status as Api.Hr.ExternalVendorStatus
      if (entity.value === 'worker')
        formModel.workerStatus = record.status as Api.Hr.ExternalWorkerStatus
      if (entity.value === 'engagement') {
        const engagement = record as Api.Hr.ExternalEngagement
        formModel.engagementStatus = engagement.status
        formModel.engagementComplianceStatus = engagement.complianceStatus
        formModel.billingRate =
          typeof engagement.billingRate === 'number' ? engagement.billingRate : undefined
      }
      if (entity.value === 'control')
        formModel.controlStatus = record.status as Api.Hr.ExternalControlStatus
    }
  }

  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!validateBusinessRules()) return false
      await saveContingentWorkforceRecord(entity.value, toRecord())
      emit('success', entity.value, dialogType.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = formModel.tenantId
    const kind = entity.value
    organizationOptions.value = []
    Object.assign(references, { vendors: [], workers: [], positions: [], engagements: [] })
    if (!tenantId && isPlatformSuper.value) return
    const kinds =
      entity.value === 'worker'
        ? (['vendor'] as const)
        : entity.value === 'engagement'
          ? (['vendor', 'worker', 'position'] as const)
          : entity.value === 'control'
            ? (['engagement'] as const)
            : ([] as const)
    const [responses, organizations, sponsors] = await Promise.all([
      Promise.all(kinds.map((kind) => fetchContingentWorkforceOptions(kind, tenantId))),
      entity.value === 'engagement'
        ? fetchHrOrganizationTree('contingentWorkforce', { tenantId })
        : undefined,
      entity.value === 'engagement' && dialogType.value === 'edit'
        ? fetchContingentWorkforceOptions('sponsor', tenantId)
        : undefined
    ])
    if (request !== referenceRequest || tenantId !== formModel.tenantId || kind !== entity.value)
      return
    organizationOptions.value = toHrOrganizationTreeOptions(organizations?.data ?? [])
    const sponsor = sponsors?.data?.find((item) => item.id === formModel.sponsorEmployeeId)
    if (sponsor) sponsorSelection.value = employeeReferenceSelection(sponsor, tenantId)
    kinds.forEach((kind, index) => {
      const key = `${kind}s` as keyof typeof references
      references[key] = responses[index]?.data ?? []
    })
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    parentTenantLocked.value = Boolean(payload.engagement)
    referenceRequest += 1
    ignoreReferenceUpdates(() => {
      entity.value = payload.entity
      dialogType.value = payload.type
      Object.assign(formModel, createInitialModel())
      sponsorSelection.value = []
      if (payload.editData) {
        setFromRecord(payload.editData)
        if ('sponsorEmployeeId' in payload.editData)
          sponsorSelection.value = employeeReferenceSelection(
            { id: payload.editData.sponsorEmployeeId, name: payload.editData.sponsorEmployeeName },
            formModel.tenantId
          )
      }
      if (payload.engagement) {
        formModel.engagementId = payload.engagement.id
        formModel.tenantId = payload.engagement.tenantId
        formModel.dueDate = payload.engagement.startDate
      }
    })
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}${context.value.title}`,
      subtitle: '外部人员、供应商、访问权限与正式员工主数据分域管理并全程审计',
      confirmText: payload.type === 'add' ? '创建记录' : '保存更改',
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

  const { ignoreUpdates: ignoreReferenceUpdates } = watchIgnorable(
    [() => formModel.tenantId, () => formModel.organizationId] as const,
    async ([tenantId, organizationId], [previousTenantId, previousOrganizationId]) => {
      if (tenantId === previousTenantId || dialogType.value !== 'add') {
        if (organizationId !== previousOrganizationId) formModel.positionId = undefined
        return
      }
      formModel.vendorId = undefined
      formModel.workerId = undefined
      formModel.organizationId = undefined
      formModel.positionId = undefined
      sponsorSelection.value = []
      formModel.sponsorEmployeeId = undefined
      formModel.engagementId = undefined
      await loadReferences()
    }
  )
  watch(
    () => formModel.workerId,
    (workerId) => {
      const worker = references.workers.find((item) => item.id === workerId)
      if (worker?.vendorId) formModel.vendorId = worker.vendorId
    }
  )
  watch(
    () => formModel.endDate,
    (endDate, previousEndDate) => {
      if (!formModel.id && endDate !== previousEndDate) formModel.accessExpiryDate = endDate
    }
  )

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .contingent-dialog {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__notice {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
      background: var(--default-box-color);
      border: 1px dashed var(--art-card-border);
      border-radius: var(--art-surface-radius);

      svg {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--theme-color);
      }
    }
  }
</style>
