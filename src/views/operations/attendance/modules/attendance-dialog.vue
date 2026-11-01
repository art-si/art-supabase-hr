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
    <div class="attendance-dialog">
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
        <template #employeeId>
          <ArtEmployeeSelect
            v-model="form.model.employeeId"
            v-model:selected-data="employeeSelection"
            :tenant-id="form.model.tenantId"
            :api-fn="fetchAttendanceEmployeeSelector"
            :display-fields="[]"
            placeholder="请选择排班或考勤员工"
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
  import { fetchTimeAttendanceOptions, saveTimeAttendanceRecord } from '@hr/api'
  import { fetchAttendanceEmployeeSelector } from '@hr/api/modules/attendance'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.TimeAttendanceEntity
  type RecordItem = Api.Hr.TimeAttendanceRecord

  interface FormModel {
    id?: string
    tenantId?: string
    shiftCode: string
    shiftName: string
    shiftType: string
    startTime: string
    endTime: string
    breakMinutes: number
    crossDay: boolean
    enabled: boolean
    timeZone: string
    lateGraceMinutes: number
    earlyLeaveGraceMinutes: number
    employeeId?: string
    shiftId?: string
    workDate: string
    assignmentStatus: 'scheduled' | 'worked' | 'leave' | 'cancelled'
    clockInAt?: string
    clockOutAt?: string
    attendanceStatus: string
    source: string
    sourceReference?: string
    attendanceRecordId?: string
    requestedClockInAt?: string
    requestedClockOutAt?: string
    reason: string
    proofUrl?: string
    correctionStatus: Api.Hr.TimeAttendanceCorrectionStatus
    periodMonth: string
    closeNote?: string
    remark?: string
  }

  interface OpenPayload {
    entity: Entity
    type: DialogType
    editData?: RecordItem
    preset?: Partial<FormModel>
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [type: DialogType, entity: Entity] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const activeTab = ref('')
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('record')
  const tenantOptions = ref<FormItemOption[]>([])
  const shiftOptions = shallowRef<Api.Hr.TimeAttendanceReference[]>([])
  const recordOptions = shallowRef<Api.Hr.TimeAttendanceReference[]>([])
  const employeeSelection = ref<EmployeeIntegrationItem[]>([])

  const createInitialModel = (): FormModel => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    shiftCode: '',
    shiftName: '',
    shiftType: 'regular',
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    crossDay: false,
    enabled: true,
    timeZone: 'Asia/Shanghai',
    lateGraceMinutes: 5,
    earlyLeaveGraceMinutes: 5,
    employeeId: undefined,
    shiftId: undefined,
    workDate: dayjs().format('YYYY-MM-DD'),
    assignmentStatus: 'scheduled',
    clockInAt: undefined,
    clockOutAt: undefined,
    attendanceStatus: 'normal',
    source: 'manual',
    sourceReference: undefined,
    attendanceRecordId: undefined,
    requestedClockInAt: undefined,
    requestedClockOutAt: undefined,
    reason: '',
    proofUrl: undefined,
    correctionStatus: 'draft',
    periodMonth: dayjs().startOf('month').format('YYYY-MM-DD'),
    closeNote: undefined,
    remark: undefined
  })
  const formModel = reactive<FormModel>(createInitialModel())

  const recordSelectOptions = computed<FormItemOption[]>(() =>
    recordOptions.value.map((item) => ({
      label: `${item.name ?? '未命名员工'} · ${item.workDate ?? item.code ?? ''}`,
      value: item.id
    }))
  )

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
              placeholder: '请选择所属租户',
              onChange: handleTenantChange
            }
          }
        ]
      : []
  )

  const shiftItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '班次识别', key: 'shiftIdentity', type: 'tab', span: 24 },
    { label: '班次编码', key: 'shiftCode', type: 'input', props: { maxlength: 40 } },
    { label: '班次名称', key: 'shiftName', type: 'input', props: { maxlength: 80 } },
    {
      label: '班次类型',
      key: 'shiftType',
      type: 'select',
      options: getDictMap.value.hrShiftType ?? []
    },
    { label: '启用班次', key: 'enabled', type: 'switch' },
    { label: '工时与异常规则', key: 'shiftRule', type: 'tab', span: 24 },
    {
      label: '上班时间',
      key: 'startTime',
      type: 'timeSelect',
      props: { start: '00:00', step: '00:15', end: '23:45', placeholder: '请选择上班时间' }
    },
    {
      label: '下班时间',
      key: 'endTime',
      type: 'timeSelect',
      props: { start: '00:00', step: '00:15', end: '23:45', placeholder: '请选择下班时间' }
    },
    { label: '休息分钟', key: 'breakMinutes', type: 'number', props: { min: 0, max: 720 } },
    { label: '跨日班次', key: 'crossDay', type: 'switch' },
    {
      label: '迟到宽限（分钟）',
      key: 'lateGraceMinutes',
      type: 'number',
      props: { min: 0, max: 240 }
    },
    {
      label: '早退宽限（分钟）',
      key: 'earlyLeaveGraceMinutes',
      type: 'number',
      props: { min: 0, max: 240 }
    },
    {
      label: '班次时区',
      key: 'timeZone',
      type: 'input',
      props: { maxlength: 80, placeholder: '如 Asia/Shanghai' },
      description: '用于把本地班次时间转换成统一时间点，避免跨时区打卡误判。'
    },
    {
      label: '规则说明',
      key: 'remark',
      type: 'textarea',
      span: 24,
      props: { maxlength: 500, placeholder: '说明适用岗位、地点或特殊轮班要求' }
    }
  ])

  const assignmentItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '排班对象', key: 'assignmentScope', type: 'divider', span: 24 },
    { label: '员工', key: 'employeeId', type: 'input' },
    {
      label: '执行班次',
      key: 'shiftId',
      type: 'select',
      options: shiftOptions.value.map(toNameCodeOption),
      props: { filterable: true, placeholder: '请选择启用班次' }
    },
    {
      label: '工作日期',
      key: 'workDate',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', placeholder: '请选择工作日期' }
    },
    {
      label: '排班状态',
      key: 'assignmentStatus',
      type: 'select',
      options: getDictMap.value.hrShiftAssignmentStatus ?? []
    },
    {
      label: '排班说明',
      key: 'remark',
      type: 'textarea',
      span: 24,
      props: { maxlength: 500, placeholder: '记录临时调班、替班或特殊安排' }
    }
  ])

  const recordItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '日考勤事实', key: 'recordScope', type: 'divider', span: 24 },
    { label: '员工', key: 'employeeId', type: 'input' },
    {
      label: '执行班次',
      key: 'shiftId',
      type: 'select',
      options: shiftOptions.value.map(toNameCodeOption),
      props: { clearable: true, filterable: true, placeholder: '可按员工排班自动识别' }
    },
    {
      label: '工作日期',
      key: 'workDate',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', placeholder: '请选择工作日期' }
    },
    {
      label: '上班打卡',
      key: 'clockInAt',
      type: 'date',
      props: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        placeholder: '请选择上班打卡时间'
      }
    },
    {
      label: '下班打卡',
      key: 'clockOutAt',
      type: 'date',
      props: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        placeholder: '请选择下班打卡时间'
      }
    },
    {
      label: '业务状态',
      key: 'attendanceStatus',
      type: 'select',
      options: getDictMap.value.hrAttendanceStatus ?? [],
      description: '普通出勤由系统核算；休假或出差可作为已确认的非出勤状态。'
    },
    {
      label: '数据来源',
      key: 'source',
      type: 'select',
      options: getDictMap.value.hrAttendanceSource ?? []
    },
    { label: '来源引用', key: 'sourceReference', type: 'input', props: { maxlength: 120 } },
    {
      label: '考勤备注',
      key: 'remark',
      type: 'textarea',
      span: 24,
      props: { maxlength: 500, placeholder: '记录设备、导入批次或人工补录背景' }
    }
  ])

  const correctionItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '修正对象', key: 'correctionScope', type: 'divider', span: 24 },
    {
      label: '日考勤记录',
      key: 'attendanceRecordId',
      type: 'select',
      options: recordSelectOptions.value,
      props: { filterable: true, placeholder: '请选择未封账且无在途修正单的考勤记录' }
    },
    {
      label: '修正后上班时间',
      key: 'requestedClockInAt',
      type: 'date',
      props: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        placeholder: '可留空表示清除打卡'
      }
    },
    {
      label: '修正后下班时间',
      key: 'requestedClockOutAt',
      type: 'date',
      props: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        placeholder: '可留空表示清除打卡'
      }
    },
    {
      label: '修正原因',
      key: 'reason',
      type: 'textarea',
      span: 24,
      props: { maxlength: 1000, placeholder: '说明漏打卡、设备故障或人工纠偏原因' }
    },
    {
      label: '证据链接',
      key: 'proofUrl',
      type: 'input',
      span: 24,
      props: { maxlength: 1000, placeholder: '可填写门禁、审批或其他证据地址' }
    }
  ])

  const periodItems = computed<FormItem[]>(() => [
    ...tenantItem.value,
    { label: '月度考勤期间', key: 'periodScope', type: 'divider', span: 24 },
    {
      label: '期间月份',
      key: 'periodMonth',
      type: 'date',
      props: { type: 'month', valueFormat: 'YYYY-MM-01', placeholder: '请选择考勤月份' }
    },
    {
      label: '期间说明',
      key: 'closeNote',
      type: 'textarea',
      span: 24,
      props: { maxlength: 1000, placeholder: '可记录结算口径或本月特殊事项' }
    }
  ])

  const formItems = computed<FormItem[]>(() => {
    if (entity.value === 'shift') return shiftItems.value
    if (entity.value === 'assignment') return assignmentItems.value
    if (entity.value === 'record') return recordItems.value
    if (entity.value === 'correction') return correctionItems.value
    return periodItems.value
  })
  const required = (message: string, trigger: 'blur' | 'change') => [
    { required: true, message, trigger }
  ]
  const formRules = computed<FormRules>(() => {
    if (entity.value === 'shift')
      return {
        shiftCode: required('请输入班次编码', 'blur'),
        shiftName: required('请输入班次名称', 'blur'),
        shiftType: required('请选择班次类型', 'change'),
        startTime: required('请选择上班时间', 'change'),
        endTime: required('请选择下班时间', 'change'),
        timeZone: required('请输入班次时区', 'blur')
      }
    if (entity.value === 'assignment')
      return {
        employeeId: required('请选择员工', 'change'),
        shiftId: required('请选择班次', 'change'),
        workDate: required('请选择工作日期', 'change'),
        assignmentStatus: required('请选择排班状态', 'change')
      }
    if (entity.value === 'record')
      return {
        employeeId: required('请选择员工', 'change'),
        workDate: required('请选择工作日期', 'change'),
        attendanceStatus: required('请选择业务状态', 'change'),
        source: required('请选择数据来源', 'change')
      }
    if (entity.value === 'correction')
      return {
        attendanceRecordId: required('请选择日考勤记录', 'change'),
        reason: required('请输入修正原因', 'blur')
      }
    return { periodMonth: required('请选择考勤月份', 'change') }
  })
  const form = computed(() => ({
    model: formModel,
    items: formItems.value,
    rules: formRules.value
  }))

  const context = computed(() => {
    const notes: Record<Entity, { icon: string; title: string; description: string }> = {
      shift: {
        icon: 'ri:time-line',
        title: '班次是工时核算的唯一计划口径',
        description: '时区、跨日、休息时长和宽限规则共同决定迟到、早退与应出勤分钟。'
      },
      assignment: {
        icon: 'ri:calendar-schedule-line',
        title: '排班把员工、日期与班次规则连接起来',
        description: '已封账月份不能改排班；已有日考勤事实的排班也不能直接删除。'
      },
      record: {
        icon: 'ri:fingerprint-line',
        title: '保存后立即执行日工时核算',
        description: '系统依据排班计算计划、实到、迟到、早退、缺勤和超出计划工时。'
      },
      correction: {
        icon: 'ri:edit-box-line',
        title: '考勤事实通过修正单纠偏，不直接覆盖',
        description: '提交与审核分离；批准后回写打卡、重新估值并保留原始快照。'
      },
      period: {
        icon: 'ri:lock-2-line',
        title: '期间封账前必须清零待处理异常',
        description: '核对阶段固化汇总快照，封账后锁定日考勤，作为薪资核算的受控输入。'
      }
    }
    return notes[entity.value]
  })

  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = formModel.tenantId
    const kind = entity.value
    shiftOptions.value = []
    recordOptions.value = []
    if (isPlatformSuper.value && !tenantId) return
    const [shifts, records] = await Promise.all([
      kind === 'assignment' || kind === 'record'
        ? fetchTimeAttendanceOptions('shift', tenantId)
        : undefined,
      kind === 'correction' ? fetchTimeAttendanceOptions('record', tenantId) : undefined
    ])
    if (request !== referenceRequest || tenantId !== formModel.tenantId || kind !== entity.value)
      return
    shiftOptions.value = shifts?.data ?? []
    recordOptions.value = records?.data ?? []
  }

  const handleTenantChange = async (): Promise<void> => {
    Object.assign(formModel, {
      employeeId: undefined,
      shiftId: undefined,
      attendanceRecordId: undefined
    })
    employeeSelection.value = []
    await loadReferences()
  }

  const toRecord = (): RecordItem => {
    if (entity.value === 'shift')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        shiftCode: formModel.shiftCode,
        shiftName: formModel.shiftName,
        shiftType: formModel.shiftType,
        startTime: formModel.startTime,
        endTime: formModel.endTime,
        breakMinutes: Number(formModel.breakMinutes),
        crossDay: formModel.crossDay,
        enabled: formModel.enabled,
        timeZone: formModel.timeZone,
        lateGraceMinutes: Number(formModel.lateGraceMinutes),
        earlyLeaveGraceMinutes: Number(formModel.earlyLeaveGraceMinutes),
        remark: formModel.remark
      }
    if (entity.value === 'assignment')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        employeeId: formModel.employeeId!,
        shiftId: formModel.shiftId!,
        workDate: formModel.workDate,
        assignmentStatus: formModel.assignmentStatus,
        remark: formModel.remark
      }
    if (entity.value === 'record')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        employeeId: formModel.employeeId!,
        shiftId: formModel.shiftId,
        workDate: formModel.workDate,
        clockInAt: formModel.clockInAt,
        clockOutAt: formModel.clockOutAt,
        workMinutes: 0,
        overtimeMinutes: 0,
        scheduledMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        absenceMinutes: 0,
        payableMinutes: 0,
        attendanceStatus: formModel.attendanceStatus,
        exceptionStatus: 'clear',
        source: formModel.source,
        sourceReference: formModel.sourceReference,
        remark: formModel.remark
      }
    if (entity.value === 'correction')
      return {
        id: formModel.id,
        tenantId: formModel.tenantId,
        attendanceRecordId: formModel.attendanceRecordId!,
        requestedClockInAt: formModel.requestedClockInAt,
        requestedClockOutAt: formModel.requestedClockOutAt,
        reason: formModel.reason,
        proofUrls: formModel.proofUrl ? [formModel.proofUrl] : [],
        status: formModel.correctionStatus
      }
    return {
      id: formModel.id,
      tenantId: formModel.tenantId,
      periodMonth: formModel.periodMonth,
      status: 'open',
      recordCount: 0,
      exceptionCount: 0,
      totalScheduledMinutes: 0,
      totalPayableMinutes: 0,
      totalOvertimeMinutes: 0,
      closeNote: formModel.closeNote
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const type: DialogType = formModel.id ? 'edit' : 'add'
      await saveTimeAttendanceRecord(entity.value, toRecord())
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
    if (record && entity.value === 'correction') {
      const correction = record as Api.Hr.TimeAttendanceCorrection
      formModel.correctionStatus = correction.status
      formModel.proofUrl = correction.proofUrls?.[0]
    }
    const employeeRecord =
      record && (entity.value === 'assignment' || entity.value === 'record')
        ? (record as Api.Hr.TimeAttendanceAssignment | Api.Hr.TimeAttendanceDailyRecord)
        : undefined
    employeeSelection.value = employeeReferenceSelection(
      employeeRecord?.employee,
      formModel.tenantId
    )
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    entity.value = payload.entity
    employeeSelection.value = []
    initializeModel(payload)
    const titles: Record<Entity, string> = {
      record: '日考勤记录',
      assignment: '员工排班',
      correction: '考勤修正单',
      period: '考勤期间',
      shift: '班次规则'
    }
    await dialogRef.value?.handleOpen(payload, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}${titles[payload.entity]}`,
      subtitle: '企业工时管理 · 计划、事实、异常、修正与封账全程留痕',
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
