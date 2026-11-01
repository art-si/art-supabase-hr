<template>
  <ArtDialog
    ref="dialogRef"
    @open="
      () => {
        activeTab = ''
      }
    "
  >
    <div class="recruitment-dialog">
      <ArtEntitySummary
        :icon="context.icon"
        :title="context.title"
        :description="context.description"
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
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, {
    type FormItem,
    type FormItemOption
  } from '@/components/core/forms/art-form/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import { toHrOrganizationTreeOptions } from '../../../shared/hr-organization-tree-field'
  import {
    fetchHrOrganizationTree,
    fetchOrganizationPositionDirectory,
    fetchRecruitmentOptions,
    saveRecruitmentRecord
  } from '@hr/api'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.RecruitmentEntity
  type RecordItem = Api.Hr.RecruitmentRecord

  interface FormModel {
    id?: string
    tenantId?: string
    requisitionNo: string
    organizationId?: string
    positionId?: string
    openingCount: number
    expectedOnboardDate?: string | null
    employmentType: Api.Hr.EmploymentType
    reason: string
    requirements?: string | null
    requisitionId?: string
    candidateName: string
    phone?: string | null
    email?: string | null
    source: string
    expectedSalary?: number | null
    resumeUrl?: string | null
    remark?: string | null
    consentStatus: string
    consentAt?: string | null
    retentionUntil?: string | null
    candidateId?: string
    roundNo: number
    interviewType: string
    scheduledStartAt: string
    scheduledEndAt: string
    location?: string | null
    interviewerEmployeeId?: string
    offerNo: string
    monthlySalary?: number
    targetBonus: number
    currency: string
    probationMonths: number
    proposedOnboardDate: string
    expiresOn: string
    offerId?: string
    plannedOnboardDate: string
    ownerEmployeeId?: string
    buddyEmployeeId?: string
    onboardEmployeeId?: string
    handoffNote?: string | null
    handoffId?: string
    taskCategory: string
    taskTitle: string
    taskDescription?: string | null
    dueDate: string
    status?: string
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<void>
  }

  interface EmployeeSelectionState {
    interviewer: EmployeeIntegrationItem[]
    owner: EmployeeIntegrationItem[]
    buddy: EmployeeIntegrationItem[]
    onboard: EmployeeIntegrationItem[]
  }

  const emit = defineEmits<{ success: [type: DialogType] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const activeTab = ref('')
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('requisition')
  const tenantOptions = shallowRef<FormItemOption[]>([])
  const employeeSelection = reactive<EmployeeSelectionState>({
    interviewer: [],
    owner: [],
    buddy: [],
    onboard: []
  })

  const createInitialModel = (): FormModel => ({
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    requisitionNo: '',
    organizationId: undefined,
    positionId: undefined,
    openingCount: 1,
    expectedOnboardDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    employmentType: 'full_time',
    reason: '',
    requirements: null,
    requisitionId: undefined,
    candidateName: '',
    phone: null,
    email: null,
    source: 'referral',
    expectedSalary: null,
    resumeUrl: null,
    remark: null,
    consentStatus: 'pending',
    consentAt: null,
    retentionUntil: dayjs().add(180, 'day').format('YYYY-MM-DD'),
    candidateId: undefined,
    roundNo: 1,
    interviewType: 'structured',
    scheduledStartAt: dayjs()
      .add(1, 'day')
      .hour(10)
      .minute(0)
      .second(0)
      .format('YYYY-MM-DD HH:mm:ss'),
    scheduledEndAt: dayjs()
      .add(1, 'day')
      .hour(11)
      .minute(0)
      .second(0)
      .format('YYYY-MM-DD HH:mm:ss'),
    location: null,
    interviewerEmployeeId: undefined,
    offerNo: '',
    monthlySalary: undefined,
    targetBonus: 0,
    currency: 'CNY',
    probationMonths: 3,
    proposedOnboardDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    expiresOn: dayjs().add(7, 'day').format('YYYY-MM-DD'),
    offerId: undefined,
    plannedOnboardDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    ownerEmployeeId: undefined,
    buddyEmployeeId: undefined,
    onboardEmployeeId: undefined,
    handoffNote: null,
    handoffId: undefined,
    taskCategory: 'documentation',
    taskTitle: '',
    taskDescription: null,
    dueDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
    status: 'pending'
  })

  const model = reactive<FormModel>(createInitialModel())
  const commonTenantItem = computed<FormItem[]>((): FormItem[] =>
    isPlatformSuper.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select',
            options: tenantOptions.value,
            props: { filterable: true, placeholder: '请选择所属租户', onChange: handleTenantChange }
          }
        ]
      : []
  )

  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model,
    items: computed((): FormItem[] => {
      if (entity.value === 'requisition')
        return [
          ...commonTenantItem.value,
          input('requisitionNo', '需求编号', '如 REC-2026-001'),
          {
            label: '招聘组织',
            key: 'organizationId',
            type: 'treeSelect',
            api: async () => {
              const response = await fetchHrOrganizationTree('recruitment', {
                tenantId: model.tenantId
              })
              return { ...response, data: toHrOrganizationTreeOptions(response.data ?? []) }
            },
            resultField: 'data',
            props: {
              filterable: true,
              checkStrictly: true,
              renderAfterExpand: false,
              defaultExpandAll: true,
              placeholder: '请选择招聘组织',
              onChange: handleOrganizationChange
            }
          },
          {
            label: '招聘岗位',
            key: 'positionId',
            type: 'select',
            immediate: false,
            api: () =>
              model.organizationId
                ? fetchOrganizationPositionDirectory(model.organizationId)
                : Promise.resolve({ data: { positions: [] } }),
            resultField: 'data.positions',
            labelFn: (option) => `${option.positionName} · ${option.positionCode}`,
            valueField: 'id',
            props: {
              filterable: true,
              disabled: !model.organizationId,
              placeholder: model.organizationId ? '请选择招聘岗位' : '请先选择招聘组织'
            }
          },
          number('openingCount', '需求人数', { min: 1, max: 999, precision: 0 }),
          date('expectedOnboardDate', '期望到岗日期'),
          dict('employmentType', '用工类型', 'hrEmploymentType'),
          textarea('reason', '招聘原因', '说明增员、补缺或业务扩张背景'),
          textarea('requirements', '任职要求', '说明经验、能力与资格要求')
        ]
      if (entity.value === 'candidate')
        return [
          ...commonTenantItem.value,
          { key: 'candidateIdentity', label: '候选人资料', type: 'tab' },
          remoteSelect('requisitionId', '招聘需求', 'requisition', '请选择招聘中的有效需求'),
          input('candidateName', '候选人姓名'),
          input('phone', '联系电话'),
          input('email', '电子邮箱'),
          dict('source', '候选人来源', 'hrCandidateSource'),
          number('expectedSalary', '期望月薪', { min: 0, precision: 2 }),
          { key: 'candidateConsent', label: '简历与授权', type: 'tab' },
          input('resumeUrl', '简历附件地址'),
          dict('consentStatus', '信息授权状态', 'hrCandidateConsentStatus'),
          date('consentAt', '授权时间', 'datetime'),
          date('retentionUntil', '资料保留至'),
          textarea('remark', '候选人备注', '仅记录与招聘评估直接相关的信息')
        ]
      if (entity.value === 'interview')
        return [
          ...commonTenantItem.value,
          remoteSelect('candidateId', '候选人', 'candidate', '请选择筛选中或面试中的候选人'),
          number('roundNo', '面试轮次', { min: 1, max: 20, precision: 0 }),
          dict('interviewType', '面试类型', 'hrInterviewType'),
          date('scheduledStartAt', '开始时间', 'datetime'),
          date('scheduledEndAt', '结束时间', 'datetime'),
          input('location', '面试地点 / 会议链接'),
          {
            props: {
              selectedData: employeeSelection.interviewer,
              'onUpdate:selectedData': ($event: typeof employeeSelection.interviewer) => {
                employeeSelection.interviewer = $event
              },
              tenantId: form.model.tenantId
            },
            label: '面试官',
            key: 'interviewerEmployeeId',
            type: 'employeeSelect'
          }
        ]
      if (entity.value === 'offer')
        return [
          ...commonTenantItem.value,
          remoteSelect('candidateId', '候选人', 'candidate', '请选择面试中或 Offer 阶段候选人'),
          input('offerNo', 'Offer 编号', '留空时系统自动生成'),
          dict('employmentType', '用工类型', 'hrEmploymentType'),
          number('monthlySalary', '月度固定薪资', { min: 0.01, precision: 2 }),
          number('targetBonus', '目标奖金', { min: 0, precision: 2 }),
          input('currency', '币种', 'CNY'),
          number('probationMonths', '试用期（月）', { min: 0, max: 12, precision: 0 }),
          date('proposedOnboardDate', '拟入职日期'),
          date('expiresOn', 'Offer 有效期至')
        ]
      if (entity.value === 'handoff')
        return [
          ...commonTenantItem.value,
          remoteSelect('offerId', '已接受 Offer', 'accepted_offer', '请选择已接受的 Offer'),
          date('plannedOnboardDate', '计划入职日期'),
          {
            props: {
              selectedData: employeeSelection.owner,
              'onUpdate:selectedData': ($event: typeof employeeSelection.owner) => {
                employeeSelection.owner = $event
              },
              tenantId: form.model.tenantId
            },
            label: '交接负责人',
            key: 'ownerEmployeeId',
            type: 'employeeSelect'
          },
          {
            props: {
              selectedData: employeeSelection.buddy,
              'onUpdate:selectedData': ($event: typeof employeeSelection.buddy) => {
                employeeSelection.buddy = $event
              },
              tenantId: form.model.tenantId
            },
            label: '入职伙伴',
            key: 'buddyEmployeeId',
            type: 'employeeSelect'
          },
          {
            props: {
              selectedData: employeeSelection.onboard,
              'onUpdate:selectedData': ($event: typeof employeeSelection.onboard) => {
                employeeSelection.onboard = $event
              },
              tenantId: form.model.tenantId
            },
            label: '关联员工档案',
            key: 'onboardEmployeeId',
            type: 'employeeSelect',
            span: 24
          },
          textarea('handoffNote', '交接说明', '记录报到安排、特殊准备事项和已确认信息')
        ]
      return [
        ...commonTenantItem.value,
        remoteSelect('handoffId', '入职交接', 'handoff', '请选择待处理的入职交接'),
        dict('taskCategory', '任务分类', 'hrOnboardingTaskCategory'),
        input('taskTitle', '任务名称'),
        {
          props: {
            selectedData: employeeSelection.owner,
            'onUpdate:selectedData': ($event: typeof employeeSelection.owner) => {
              employeeSelection.owner = $event
            },
            tenantId: form.model.tenantId
          },
          label: '任务负责人',
          key: 'ownerEmployeeId',
          type: 'employeeSelect'
        },
        date('dueDate', '截止日期'),
        {
          label: '任务状态',
          key: 'status',
          type: 'select',
          options: (getDictMap.value.hrOnboardingTaskStatus ?? []).filter((item) =>
            ['pending', 'in_progress'].includes(item.value)
          ),
          props: { placeholder: '请选择任务状态' }
        },
        textarea('taskDescription', '任务说明', '说明交付物、验收标准和必要协作人')
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<FormModel> = {
        tenantId: isPlatformSuper.value ? required('请选择所属租户', 'change') : []
      }
      const fields: Partial<Record<Entity, Array<keyof FormModel>>> = {
        requisition: [
          'requisitionNo',
          'organizationId',
          'positionId',
          'openingCount',
          'employmentType',
          'reason'
        ],
        candidate: ['requisitionId', 'candidateName', 'source', 'consentStatus'],
        interview: [
          'candidateId',
          'roundNo',
          'interviewType',
          'scheduledStartAt',
          'scheduledEndAt',
          'interviewerEmployeeId'
        ],
        offer: [
          'candidateId',
          'employmentType',
          'monthlySalary',
          'currency',
          'proposedOnboardDate',
          'expiresOn'
        ],
        handoff: ['offerId', 'plannedOnboardDate'],
        task: ['handoffId', 'taskCategory', 'taskTitle', 'dueDate', 'status']
      }
      fields[entity.value]?.forEach((key) => {
        rules[key] = required(`请填写${labelMap[key] ?? '必填信息'}`, 'change')
      })
      return rules
    })
  })

  const labelMap: Partial<Record<keyof FormModel, string>> = {
    requisitionNo: '需求编号',
    organizationId: '招聘组织',
    positionId: '招聘岗位',
    openingCount: '需求人数',
    employmentType: '用工类型',
    reason: '招聘原因',
    requisitionId: '招聘需求',
    candidateName: '候选人姓名',
    source: '候选人来源',
    consentStatus: '授权状态',
    candidateId: '候选人',
    roundNo: '面试轮次',
    interviewType: '面试类型',
    scheduledStartAt: '开始时间',
    scheduledEndAt: '结束时间',
    interviewerEmployeeId: '面试官',
    monthlySalary: '月度固定薪资',
    currency: '币种',
    proposedOnboardDate: '拟入职日期',
    expiresOn: 'Offer 有效期',
    offerId: '已接受 Offer',
    plannedOnboardDate: '计划入职日期',
    handoffId: '入职交接',
    taskCategory: '任务分类',
    taskTitle: '任务名称',
    dueDate: '截止日期',
    status: '任务状态'
  }

  const context = computed(
    () =>
      ({
        requisition: {
          icon: 'ri:file-list-3-line',
          title: '需求先审批、后招聘',
          description: '招聘组织和岗位必须来自正式组织岗位体系，需求人数达成后自动关闭。'
        },
        candidate: {
          icon: 'ri:user-search-line',
          title: '候选人隐私最小化',
          description: '联系方式和薪资仅向敏感信息权限开放，并记录授权状态与资料保留期限。'
        },
        interview: {
          icon: 'ri:calendar-event-line',
          title: '按轮次独立留痕',
          description: '同轮多位面试官分别记录评价，完成后不能覆盖历史反馈。'
        },
        offer: {
          icon: 'ri:mail-send-line',
          title: 'Offer 版本与审批分离',
          description: '薪酬方案先保存草稿，再经过审批、发送和候选人反馈状态流转。'
        },
        handoff: {
          icon: 'ri:exchange-box-line',
          title: '录用不等于入职',
          description: '候选人接受 Offer 后进入交接，关联正式员工档案并完成任务后才计入已录用。'
        },
        task: {
          icon: 'ri:task-line',
          title: '入职准备可验收',
          description: '每项任务明确负责人、截止日期和交付标准，支持完成或有理由跳过。'
        }
      })[entity.value]
  )

  const required = (message: string, trigger: 'blur' | 'change') => [
    { required: true, message, trigger }
  ]
  const input = (key: keyof FormModel, label: string, placeholder?: string): FormItem => ({
    label,
    key: String(key),
    type: 'input',
    props: { placeholder, clearable: true }
  })
  const number = (
    key: keyof FormModel,
    label: string,
    props: Record<string, unknown>
  ): FormItem => ({
    label,
    key: String(key),
    type: 'number',
    props: { controls: false, class: '!w-full', ...props }
  })
  const date = (
    key: keyof FormModel,
    label: string,
    type: 'date' | 'datetime' = 'date'
  ): FormItem => ({
    label,
    key: String(key),
    type: 'date',
    props: {
      type,
      valueFormat: type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss',
      class: '!w-full'
    }
  })
  const textarea = (key: keyof FormModel, label: string, placeholder?: string): FormItem => ({
    label,
    key: String(key),
    type: 'textarea',
    span: 24,
    props: { rows: 3, maxlength: 800, showWordLimit: true, placeholder }
  })
  const dict = (key: keyof FormModel, label: string, code: string): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: getDictMap.value[code] ?? [],
    props: { placeholder: `请选择${label}` }
  })
  const remoteSelect = (
    key: keyof FormModel,
    label: string,
    kind: 'requisition' | 'candidate' | 'accepted_offer' | 'handoff',
    placeholder: string
  ): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    api: () => fetchRecruitmentOptions(kind, model.tenantId),
    resultField: 'data',
    valueField: 'id',
    labelFn: (option) =>
      [option.name, option.code, option.positionName].filter(Boolean).join(' · '),
    props: { filterable: true, placeholder }
  })

  const resetEmployeeSelections = (): void => {
    Object.assign(employeeSelection, { interviewer: [], owner: [], buddy: [], onboard: [] })
  }

  const loadEditSelections = (row?: RecordItem): void => {
    resetEmployeeSelections()
    if (!row) return
    if (entity.value === 'interview') {
      const interview = row as Api.Hr.RecruitmentInterview
      employeeSelection.interviewer = employeeReferenceSelection(
        interview.interviewer,
        interview.tenantId
      )
    }
    if (entity.value === 'handoff') {
      const handoff = row as Api.Hr.RecruitmentHandoff
      employeeSelection.owner = employeeReferenceSelection(handoff.owner, handoff.tenantId)
      employeeSelection.buddy = employeeReferenceSelection(handoff.buddy, handoff.tenantId)
      employeeSelection.onboard = employeeReferenceSelection(
        handoff.onboardEmployee,
        handoff.tenantId
      )
    }
    if (entity.value === 'task') {
      const task = row as Api.Hr.RecruitmentTask
      employeeSelection.owner = employeeReferenceSelection(task.owner, task.tenantId)
    }
  }

  const replaceModel = (next: FormModel): void => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof FormModel])
    Object.assign(form.model, next)
  }
  const reloadOptions = async (): Promise<void> => {
    await nextTick()
    await formRef.value?.reloadOptions()
  }
  const handleTenantChange = async (): Promise<void> => {
    Object.assign(form.model, {
      organizationId: undefined,
      positionId: undefined,
      requisitionId: undefined,
      candidateId: undefined,
      offerId: undefined,
      handoffId: undefined,
      interviewerEmployeeId: undefined,
      ownerEmployeeId: undefined,
      buddyEmployeeId: undefined,
      onboardEmployeeId: undefined
    })
    resetEmployeeSelections()
    await reloadOptions()
  }
  const handleOrganizationChange = async (): Promise<void> => {
    form.model.positionId = undefined
    await nextTick()
    await formRef.value?.reloadOptions('positionId')
  }

  const validateBusiness = (): string | null => {
    if (entity.value === 'interview' && form.model.scheduledEndAt <= form.model.scheduledStartAt)
      return '面试结束时间必须晚于开始时间'
    if (entity.value === 'offer' && form.model.expiresOn > form.model.proposedOnboardDate)
      return 'Offer 有效期不能晚于拟入职日期'
    if (
      entity.value === 'candidate' &&
      form.model.consentStatus === 'granted' &&
      !form.model.consentAt
    )
      return '候选人已授权时必须记录授权时间'
    return null
  }

  const toRecord = (): RecordItem => {
    const common = { id: form.model.id, tenantId: form.model.tenantId }
    if (entity.value === 'requisition')
      return {
        ...common,
        requisitionNo: form.model.requisitionNo,
        organizationId: form.model.organizationId!,
        positionId: form.model.positionId!,
        openingCount: Number(form.model.openingCount),
        expectedOnboardDate: form.model.expectedOnboardDate,
        employmentType: form.model.employmentType,
        status: form.model.status ?? 'draft',
        reason: form.model.reason,
        requirements: form.model.requirements
      }
    if (entity.value === 'candidate')
      return {
        ...common,
        requisitionId: form.model.requisitionId!,
        candidateName: form.model.candidateName,
        phone: form.model.phone,
        email: form.model.email,
        source: form.model.source,
        stage: form.model.status ?? 'new',
        expectedSalary: form.model.expectedSalary,
        resumeUrl: form.model.resumeUrl,
        remark: form.model.remark,
        consentStatus: form.model.consentStatus,
        consentAt: form.model.consentAt,
        retentionUntil: form.model.retentionUntil
      }
    if (entity.value === 'interview')
      return {
        ...common,
        candidateId: form.model.candidateId!,
        roundNo: Number(form.model.roundNo),
        interviewType: form.model.interviewType,
        scheduledStartAt: form.model.scheduledStartAt,
        scheduledEndAt: form.model.scheduledEndAt,
        location: form.model.location,
        interviewerEmployeeId: form.model.interviewerEmployeeId!,
        status: form.model.status ?? 'scheduled'
      }
    if (entity.value === 'offer')
      return {
        ...common,
        candidateId: form.model.candidateId!,
        offerNo: form.model.offerNo,
        versionNo: 1,
        employmentType: form.model.employmentType,
        monthlySalary: Number(form.model.monthlySalary),
        targetBonus: Number(form.model.targetBonus),
        currency: form.model.currency,
        probationMonths: Number(form.model.probationMonths),
        proposedOnboardDate: form.model.proposedOnboardDate,
        expiresOn: form.model.expiresOn,
        status: form.model.status ?? 'draft'
      }
    if (entity.value === 'handoff')
      return {
        ...common,
        candidateId: '',
        offerId: form.model.offerId!,
        organizationId: '',
        positionId: '',
        plannedOnboardDate: form.model.plannedOnboardDate,
        ownerEmployeeId: form.model.ownerEmployeeId,
        buddyEmployeeId: form.model.buddyEmployeeId,
        onboardEmployeeId: form.model.onboardEmployeeId,
        status: form.model.status ?? 'pending',
        handoffNote: form.model.handoffNote
      }
    return {
      ...common,
      handoffId: form.model.handoffId!,
      taskCategory: form.model.taskCategory,
      taskTitle: form.model.taskTitle,
      taskDescription: form.model.taskDescription,
      ownerEmployeeId: form.model.ownerEmployeeId,
      dueDate: form.model.dueDate,
      status: form.model.status ?? 'pending'
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const validationMessage = validateBusiness()
      if (validationMessage) {
        ElMessage.warning(validationMessage)
        return false
      }
      const type: DialogType = form.model.id ? 'edit' : 'add'
      await saveRecruitmentRecord(entity.value, toRecord())
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
    if (row)
      replaceModel({
        ...createInitialModel(),
        ...(structuredClone(toRaw(row)) as Partial<FormModel>)
      })
    loadEditSelections(row)
    await nextTick()
    formRef.value?.clearValidate()
    const label = {
      requisition: '招聘需求',
      candidate: '候选人',
      interview: '面试安排',
      offer: 'Offer',
      handoff: '入职交接',
      task: '入职任务'
    }[nextEntity]
    await dialogRef.value?.handleOpen(undefined, {
      title: `${row ? '编辑' : '新增'}${label}`,
      subtitle: '招聘数据按租户隔离，关键阶段通过受控动作推进并保留审计记录',
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
          await reloadOptions()
          if (nextEntity === 'requisition' && form.model.organizationId)
            await formRef.value?.reloadOptions('positionId')
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
  .recruitment-dialog {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
</style>
