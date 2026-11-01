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
    <div class="service-delivery-dialog">
      <ArtEntitySummary
        :icon="context.icon"
        :title="context.title"
        :description="context.description"
      />

      <ArtForm
        ref="formRef"
        v-model:active-tab="activeTab"
        v-model="form.model"
        :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id) || parentTenantLocked)"
        :rules="form.rules"
        :span="12"
        :gutter="24"
        label-position="top"
      >
        <template #employeeId>
          <ArtEmployeeSelect
            v-model="form.model.employeeId"
            v-model:selected-data="employeeSelection"
            :tenant-id="form.model.tenantId"
            placeholder="请选择代建工单的员工"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { uniqBy } from 'lodash-es'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
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
  import { useDocumentNumberRule } from '@/hooks/core/useDocumentNumberRule'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { fetchServiceDeliveryRecords, saveServiceCatalog, saveServiceRequest } from '@hr/api'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.ServiceDeliveryEntity
  type RecordItem = Api.Hr.ServiceDeliveryRecord

  interface FormModel {
    id?: string
    tenantId?: string
    requestNo: string
    employeeId?: string
    serviceId?: string
    title: string
    reason: string
    priority: Api.Hr.ServiceRequestPriority
    channel: Api.Hr.ServiceRequestChannel
    attachmentLinks: string
    serviceCode: string
    serviceName: string
    category: string
    description?: string | null
    serviceMode: Api.Hr.ServiceDeliveryMode
    routePath?: string | null
    routingGroup?: string | null
    firstResponseHours: number
    resolutionHours: number
    enabled: boolean
    sort: number
  }

  interface OpenPayload {
    entity: Entity
    type: DialogType
    managerView: boolean
    editData?: RecordItem
    preset?: Partial<Api.Hr.ServiceRequest>
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [type: DialogType, entity: Entity] }>()
  const userStore = useUserStore()
  const serviceModeOptions = useDictionaryOptions('hrServiceDeliveryMode')
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const activeTab = ref('')
  const formRef = ref<ArtFormExpose>()
  const entity = ref<Entity>('request')
  const managerView = ref(false)
  const editing = ref(false)
  const parentTenantLocked = ref(false)
  const tenantOptions = ref<FormItemOption[]>([])
  const serviceOptions = ref<FormItemOption[]>([])
  const selectedService = shallowRef<Api.Hr.ServiceDeliveryReference>()
  let serviceRequest = 0
  onBeforeUnmount(() => {
    serviceRequest++
  })
  const employeeSelection = ref<EmployeeIntegrationItem[]>([])

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    requestNo: '',
    employeeId: undefined,
    serviceId: undefined,
    title: '',
    reason: '',
    priority: 'normal',
    channel: 'self_service',
    attachmentLinks: '',
    serviceCode: '',
    serviceName: '',
    category: 'certificate',
    description: null,
    serviceMode: 'case',
    routePath: null,
    routingGroup: null,
    firstResponseHours: 8,
    resolutionHours: 40,
    enabled: true,
    sort: 0
  })
  const formModel = reactive<FormModel>(createInitialModel())
  const numberRule = useDocumentNumberRule('hr.self_service_request', () => formModel.tenantId)

  const tenantItems = computed<FormItem[]>(() =>
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

  const requestItems = computed<FormItem[]>(() => [
    ...tenantItems.value,
    { label: '工单识别', key: 'requestIdentity', type: 'divider', span: 24 },
    {
      label: '工单编号',
      key: 'requestNo',
      type: 'input',
      props: numberRule.inputProps(editing.value, '请输入工单编号', true),
      help: numberRule.description.value
    },
    ...(managerView.value
      ? [{ label: '申请员工', key: 'employeeId', type: 'input' as const }]
      : []),
    {
      label: '服务项目',
      key: 'serviceId',
      type: 'select',
      options: serviceOptions.value,
      props: { filterable: true, placeholder: '请选择需要办理的服务' }
    },
    {
      label: '优先级',
      key: 'priority',
      type: 'select',
      options: getDictMap.value.hrServicePriority ?? []
    },
    ...(managerView.value
      ? [
          {
            label: '受理渠道',
            key: 'channel',
            type: 'select' as const,
            options: getDictMap.value.hrServiceChannel ?? []
          }
        ]
      : []),
    { label: '工单主题', key: 'title', type: 'input', span: 24, props: { maxlength: 120 } },
    {
      label: '问题说明',
      key: 'reason',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 1200,
        showWordLimit: true,
        placeholder: '说明需要协助的问题、期望结果及必要背景'
      }
    },
    {
      label: '附件链接',
      key: 'attachmentLinks',
      type: 'input',
      span: 24,
      help: '每行填写一个已授权的文件链接，不要粘贴包含账号口令的地址。',
      props: { type: 'textarea', rows: 2, placeholder: '可选：每行一个附件链接' }
    }
  ])

  const catalogItems = computed<FormItem[]>(() => [
    ...tenantItems.value,
    {
      label: '服务定义',
      key: 'serviceIdentity',
      type: formModel.serviceMode === 'case' ? 'tab' : 'divider',
      span: 24
    },
    { label: '服务编码', key: 'serviceCode', type: 'input', props: { maxlength: 60 } },
    { label: '服务名称', key: 'serviceName', type: 'input', props: { maxlength: 100 } },
    {
      label: '服务类别',
      key: 'category',
      type: 'select',
      options: getDictMap.value.hrServiceCategory ?? []
    },
    {
      label: '交付方式',
      key: 'serviceMode',
      type: 'select',
      options: serviceModeOptions
    },
    {
      label: '服务说明',
      key: 'description',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true }
    },
    ...(formModel.serviceMode === 'redirect'
      ? [
          {
            label: '专业流程地址',
            key: 'routePath',
            type: 'input' as const,
            span: 24,
            props: { placeholder: '如 /hr/operations/absence' }
          }
        ]
      : [
          { key: 'serviceSla', label: '受理与时限', type: 'tab' as const },
          {
            label: '受理组',
            key: 'routingGroup',
            type: 'input' as const,
            props: { placeholder: '如 员工档案服务组' }
          },
          {
            label: '首次响应（小时）',
            key: 'firstResponseHours',
            type: 'number' as const,
            props: { min: 0, max: 720, controls: false }
          },
          {
            label: '解决时限（小时）',
            key: 'resolutionHours',
            type: 'number' as const,
            props: { min: 0, max: 2160, controls: false }
          }
        ]),
    { label: '启用服务', key: 'enabled', type: 'switch' },
    { label: '显示顺序', key: 'sort', type: 'number', props: { min: 0, max: 999 } }
  ])

  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model: formModel,
    items: computed(() => (entity.value === 'request' ? requestItems.value : catalogItems.value)),
    rules: computed(() => {
      const rules: FormRules<FormModel> = {
        tenantId: isPlatformSuper.value
          ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
          : []
      }
      if (entity.value === 'request') {
        Object.assign(rules, {
          requestNo:
            numberRule.manualRequired(editing.value) || editing.value
              ? [{ required: true, message: '请输入工单编号', trigger: 'blur' }]
              : [],
          employeeId: managerView.value
            ? [{ required: true, message: '请选择申请员工', trigger: 'change' }]
            : [],
          serviceId: [{ required: true, message: '请选择服务项目', trigger: 'change' }],
          title: [{ required: true, message: '请输入工单主题', trigger: 'blur' }],
          reason: [{ required: true, message: '请输入问题说明', trigger: 'blur' }]
        })
      } else {
        Object.assign(rules, {
          serviceCode: [{ required: true, message: '请输入服务编码', trigger: 'blur' }],
          serviceName: [{ required: true, message: '请输入服务名称', trigger: 'blur' }],
          category: [{ required: true, message: '请选择服务类别', trigger: 'change' }],
          serviceMode: [{ required: true, message: '请选择交付方式', trigger: 'change' }],
          routePath:
            formModel.serviceMode === 'redirect'
              ? [{ required: true, message: '请输入专业流程地址', trigger: 'blur' }]
              : []
        })
      }
      return rules
    })
  })

  const context = computed(() =>
    entity.value === 'request'
      ? {
          icon: 'ri:customer-service-2-line',
          title: '一次问题，一张工单',
          description: '请选择最匹配的服务项目。提交后系统按目录固化响应和解决时限。'
        }
      : {
          icon: 'ri:function-add-line',
          title: '服务目录是员工入口',
          description: '专业流程使用跳转方式，只有需要 HR 人工受理的问题才创建服务工单。'
        }
  )

  const resetModel = (): void => {
    serviceRequest++
    selectedService.value = undefined
    serviceOptions.value = []
    Object.assign(formModel, createInitialModel())
    employeeSelection.value = []
  }

  const loadServices = async (): Promise<void> => {
    const request = ++serviceRequest
    const tenantId = formModel.tenantId
    serviceOptions.value = []
    if (!tenantId) {
      return
    }
    const response = await fetchServiceDeliveryRecords<Api.Hr.ServiceCatalog>('service', {
      from: 0,
      to: 499,
      tenantId,
      status: 'enabled'
    })
    if (request !== serviceRequest || tenantId !== formModel.tenantId) return
    if (response.error) throw response.error
    const options = response.data
      .filter((service) => service.serviceMode === 'case')
      .map((service) => ({
        label: `${service.serviceName} · ${service.routingGroup || 'HR 服务台'}`,
        value: service.id!
      }))
    const current = selectedService.value
    if (current && current.id === formModel.serviceId && current.tenantId === tenantId) {
      options.push({
        label: `${current.name ?? '未命名服务'} · ${current.routingGroup || 'HR 服务台'}`,
        value: current.id
      })
    }
    serviceOptions.value = uniqBy(options, 'value')
  }

  const handleTenantChange = async (): Promise<void> => {
    selectedService.value = undefined
    formModel.employeeId = undefined
    formModel.serviceId = undefined
    employeeSelection.value = []
    await Promise.all([loadServices(), numberRule.loadRule()])
  }

  const validateBusiness = (): void => {
    if (
      entity.value === 'service' &&
      formModel.serviceMode === 'case' &&
      formModel.resolutionHours < formModel.firstResponseHours
    ) {
      throw new Error('解决时限不能短于首次响应时限')
    }
  }

  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      validateBusiness()
      const type: DialogType = editing.value ? 'edit' : 'add'
      if (entity.value === 'service') {
        await saveServiceCatalog({
          id: formModel.id,
          tenantId: formModel.tenantId,
          serviceCode: formModel.serviceCode,
          serviceName: formModel.serviceName,
          category: formModel.category,
          description: formModel.description,
          serviceMode: formModel.serviceMode,
          routePath: formModel.routePath,
          routingGroup: formModel.routingGroup,
          firstResponseHours: formModel.serviceMode === 'case' ? formModel.firstResponseHours : 0,
          resolutionHours: formModel.serviceMode === 'case' ? formModel.resolutionHours : 0,
          enabled: formModel.enabled,
          sort: Number(formModel.sort)
        })
      } else {
        await saveServiceRequest({
          id: formModel.id,
          tenantId: formModel.tenantId,
          requestNo: formModel.requestNo || 'AUTO',
          employeeId: formModel.employeeId || '',
          serviceId: formModel.serviceId!,
          requestType: '',
          title: formModel.title,
          reason: formModel.reason,
          priority: formModel.priority,
          channel: managerView.value ? formModel.channel : 'self_service',
          status: 'draft',
          attachmentUrls: formModel.attachmentLinks
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
          reopenCount: 0
        })
      }
      emit('success', type, entity.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    parentTenantLocked.value = Boolean(payload.preset?.tenantId)
    entity.value = payload.entity
    managerView.value = payload.managerView
    editing.value = payload.type === 'edit'
    resetModel()

    if (payload.entity === 'request' && payload.preset) {
      Object.assign(formModel, {
        tenantId: payload.preset.tenantId ?? formModel.tenantId,
        employeeId: payload.preset.employeeId,
        serviceId: payload.preset.serviceId,
        title: payload.preset.title ?? '',
        reason: payload.preset.reason ?? '',
        priority: payload.preset.priority ?? 'normal',
        channel: payload.preset.channel ?? 'self_service'
      })
    }

    if (payload.entity === 'request' && payload.editData) {
      const record = payload.editData as Api.Hr.ServiceRequest
      selectedService.value = record.service
        ? { ...record.service, tenantId: record.service.tenantId ?? record.tenantId }
        : undefined
      Object.assign(formModel, {
        id: record.id,
        tenantId: record.tenantId,
        requestNo: record.requestNo,
        employeeId: record.employeeId,
        serviceId: record.serviceId,
        title: record.title,
        reason: record.reason,
        priority: record.priority,
        channel: record.channel,
        attachmentLinks: record.attachmentUrls.join('\n')
      })
      employeeSelection.value = employeeReferenceSelection(record.requester, formModel.tenantId)
    }
    if (payload.entity === 'service' && payload.editData) {
      const record = payload.editData as Api.Hr.ServiceCatalog
      Object.assign(formModel, {
        id: record.id,
        tenantId: record.tenantId,
        serviceCode: record.serviceCode,
        serviceName: record.serviceName,
        category: record.category,
        description: record.description,
        serviceMode: record.serviceMode,
        routePath: record.routePath,
        routingGroup: record.routingGroup,
        firstResponseHours: record.firstResponseHours,
        resolutionHours: record.resolutionHours,
        enabled: record.enabled,
        sort: record.sort
      })
    }

    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${editing.value ? '编辑' : '新增'}${payload.entity === 'request' ? '服务工单' : '服务项目'}`,
      subtitle:
        payload.entity === 'request'
          ? '工单提交后进入员工服务交付队列'
          : '服务目录决定员工入口、受理队列与 SLA',
      confirmText: editing.value
        ? '保存更改'
        : payload.entity === 'request'
          ? '保存草稿'
          : '创建服务',
      contentMaxHeight: 'calc(100vh - 184px)',
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          await Promise.all([
            ...(isPlatformSuper.value && !tenantOptions.value.length
              ? [
                  fetchEnabledTenantList().then((response) => {
                    tenantOptions.value = (response.data ?? []).map((tenant) => ({
                      label: `${tenant.tenantName}（${tenant.tenantCode}）`,
                      value: tenant.id!
                    }))
                  })
                ]
              : []),
            ...(payload.entity === 'request' ? [loadServices(), numberRule.loadRule()] : [])
          ])
          if (
            payload.entity === 'request' &&
            !editing.value &&
            numberRule.automatic.value &&
            !formModel.requestNo
          ) {
            formModel.requestNo = 'AUTO'
          }
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
  .service-delivery-dialog {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
</style>
