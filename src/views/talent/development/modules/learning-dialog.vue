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
    <div class="learning-dialog">
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
            v-model:selected-data="employeeSelection.owner"
            :tenant-id="form.model.tenantId"
            placeholder="请选择计划负责人"
          />
        </template>
        <template #employeeId>
          <ArtEmployeeSelect
            v-model="form.model.employeeId"
            v-model:selected-data="employeeSelection.learner"
            :tenant-id="form.model.tenantId"
            :clearable="false"
            title="安排员工学习"
          />
        </template>
        <template #nominatedByEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.nominatedByEmployeeId"
            v-model:selected-data="employeeSelection.nominator"
            :tenant-id="form.model.tenantId"
            placeholder="可选：选择学习安排人"
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
  import { fetchLearningOptions, fetchLearningRecords, saveLearningRecord } from '@hr/api'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.LearningEntity
  type RecordItem = Api.Hr.LearningRecord

  interface FormModel {
    id?: string
    tenantId?: string
    planCode: string
    planName: string
    trainingType: string
    startDate: string
    endDate?: string | null
    providerName?: string | null
    budget?: number | null
    objective?: string | null
    remark?: string | null
    ownerEmployeeId?: string
    targetAudience?: string | null
    mandatory: boolean
    courseCode: string
    courseName: string
    category: string
    deliveryMode: string
    durationHours: number
    creditHours: number
    passingScore?: number | null
    minimumAttendancePercent: number
    certificateEnabled: boolean
    certificateValidMonths?: number | null
    description?: string | null
    learningObjectives?: string | null
    courseId?: string
    competencyId?: string
    targetLevel: string
    sessionCode: string
    planId?: string
    startAt: string
    endAt: string
    enrollmentDeadline?: string | null
    capacity: number
    instructorName?: string | null
    location?: string | null
    meetingUrl?: string | null
    estimatedCost?: number | null
    sessionId?: string
    employeeId?: string
    nominatedByEmployeeId?: string
    credentialUrl?: string | null
    enrollmentId?: string
    certificateNo?: string
    certificateName?: string
    issuedOn?: string
    expiresOn?: string | null
    status: string
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
  const entity = ref<Entity>('plan')
  const tenantOptions = ref<FormItemOption[]>([])
  const planOptions = shallowRef<Api.Hr.LearningReference[]>([])
  const courseOptions = shallowRef<Api.Hr.LearningReference[]>([])
  const draftCourseOptions = shallowRef<Api.Hr.LearningReference[]>([])
  const sessionOptions = shallowRef<Api.Hr.LearningReference[]>([])
  const competencyOptions = shallowRef<Api.Hr.LearningReference[]>([])
  const employeeSelection = reactive<{
    owner: EmployeeIntegrationItem[]
    learner: EmployeeIntegrationItem[]
    nominator: EmployeeIntegrationItem[]
  }>({ owner: [], learner: [], nominator: [] })

  const createInitialModel = (): FormModel => ({
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    planCode: '',
    planName: '',
    trainingType: 'skill',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(3, 'month').format('YYYY-MM-DD'),
    providerName: null,
    budget: null,
    objective: null,
    remark: null,
    ownerEmployeeId: undefined,
    targetAudience: null,
    mandatory: false,
    courseCode: '',
    courseName: '',
    category: 'professional',
    deliveryMode: 'classroom',
    durationHours: 8,
    creditHours: 8,
    passingScore: 60,
    minimumAttendancePercent: 80,
    certificateEnabled: false,
    certificateValidMonths: null,
    description: null,
    learningObjectives: null,
    courseId: undefined,
    competencyId: undefined,
    targetLevel: 'intermediate',
    sessionCode: '',
    planId: undefined,
    startAt: dayjs().add(1, 'week').hour(9).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
    endAt: dayjs().add(1, 'week').hour(17).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
    enrollmentDeadline: dayjs()
      .add(5, 'day')
      .hour(18)
      .minute(0)
      .second(0)
      .format('YYYY-MM-DD HH:mm:ss'),
    capacity: 30,
    instructorName: null,
    location: null,
    meetingUrl: null,
    estimatedCost: null,
    sessionId: undefined,
    employeeId: undefined,
    nominatedByEmployeeId: undefined,
    credentialUrl: null,
    status: 'draft'
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
                disabled: Boolean(form.model.id),
                placeholder: '请选择所属租户',
                onChange: handleTenantChange
              }
            }
          ]
        : []
      if (entity.value === 'plan')
        return [
          ...common,
          { key: 'planIdentity', label: '计划定义', type: 'tab' },
          input('planCode', '计划编码', '如 FY27_LEADERSHIP'),
          input('planName', '计划名称', '如 年度基层主管培养计划'),
          dict('trainingType', '培训类型', 'hrTrainingType'),
          { label: '计划负责人', key: 'ownerEmployeeId', type: 'input' },
          { key: 'planArrangement', label: '周期与执行', type: 'tab' },
          date('startDate', '开始日期'),
          date('endDate', '结束日期'),
          input('providerName', '培训供应方', '可填写内训团队或外部机构'),
          number('budget', '计划预算', { min: 0, precision: 2 }),
          input('targetAudience', '目标人群', '如 新任基层主管 / 关键岗位员工'),
          { label: '设为必修计划', key: 'mandatory', type: 'switch' },
          textarea('objective', '计划目标', '说明业务目标、能力目标与预期产出'),
          textarea('remark', '补充说明', '记录审批口径、范围边界或执行说明')
        ]
      if (entity.value === 'course')
        return [
          ...common,
          { key: 'courseIdentity', label: '课程定义', type: 'tab' },
          input('courseCode', '课程编码', '如 LDR_ESSENTIALS_01'),
          input('courseName', '课程名称', '如 一线主管管理基础'),
          dict('category', '课程类别', 'hrLearningCourseCategory'),
          dict('deliveryMode', '授课方式', 'hrLearningDeliveryMode'),
          number('durationHours', '课程时长（小时）', { min: 0.5, precision: 1 }),
          number('creditHours', '获得学分', { min: 0, precision: 1 }),
          input('providerName', '课程供应方', '可填写内部讲师团队或外部机构'),
          input('targetAudience', '适用人群', '明确岗位、职级或人才群体'),
          { key: 'courseAssessment', label: '考核与说明', type: 'tab' },
          number('passingScore', '通过分数', { min: 0, max: 100, precision: 1 }),
          number('minimumAttendancePercent', '最低出勤率（%）', {
            min: 0,
            max: 100,
            precision: 1
          }),
          { label: '通过后签发证书', key: 'certificateEnabled', type: 'switch' },
          ...(formModel.certificateEnabled
            ? [
                number('certificateValidMonths', '证书有效期（月）', {
                  min: 1,
                  max: 600,
                  precision: 0
                })
              ]
            : []),
          textarea('learningObjectives', '学习目标', '课程发布前必须填写可验证的学习目标'),
          textarea('description', '课程说明', '说明课程内容、先修要求与交付边界')
        ]
      if (entity.value === 'course_competency')
        return [
          ...common,
          select('courseId', '草稿课程', draftCourseOptions.value, '请选择待配置课程'),
          select('competencyId', '目标能力', competencyOptions.value, '请选择能力项'),
          dict('targetLevel', '完成目标等级', 'commonCompetencyLevel')
        ]
      if (entity.value === 'session')
        return [
          ...common,
          { key: 'sessionIdentity', label: '班次与时间', type: 'tab' },
          input('sessionCode', '班次编码', '如 LDR_2027_01'),
          select('planId', '已发布计划', planOptions.value, '请选择培训计划'),
          select('courseId', '已发布课程', courseOptions.value, '请选择课程'),
          dateTime('startAt', '开始时间'),
          dateTime('endAt', '结束时间'),
          dateTime('enrollmentDeadline', '报名截止时间'),
          { key: 'sessionDelivery', label: '授课与资源', type: 'tab' },
          number('capacity', '班次容量', { min: 1, max: 100000, precision: 0 }),
          input('instructorName', '讲师 / 教练', '填写主讲人或带教负责人'),
          input('location', '培训地点', '线下或混合课程填写'),
          input('meetingUrl', '在线地址', '在线或混合课程填写'),
          number('estimatedCost', '预计成本', { min: 0, precision: 2 })
        ]
      if (entity.value === 'enrollment')
        return [
          ...common,
          select('sessionId', '开放班次', sessionOptions.value, '请选择可报名班次'),
          { label: '学习员工', key: 'employeeId', type: 'input' },
          { label: '安排人', key: 'nominatedByEmployeeId', type: 'input' },
          textarea('remark', '安排说明', '记录安排来源、培养目标或员工确认情况')
        ]
      return [
        ...common,
        input('certificateNo', '证书编号', undefined, true),
        input('certificateName', '证书名称', undefined, true),
        input('credentialUrl', '电子凭证地址', '请输入可验证的 HTTPS 地址'),
        date('issuedOn', '签发日期', true),
        date('expiresOn', '到期日期', true)
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<FormModel> = {
        tenantId: isPlatformSuper.value ? required('请选择所属租户', 'change') : []
      }
      if (entity.value === 'plan')
        Object.assign(rules, {
          planCode: required('请输入计划编码', 'blur'),
          planName: required('请输入计划名称', 'blur'),
          trainingType: required('请选择培训类型', 'change'),
          startDate: required('请选择开始日期', 'change')
        })
      if (entity.value === 'course')
        Object.assign(rules, {
          courseCode: required('请输入课程编码', 'blur'),
          courseName: required('请输入课程名称', 'blur'),
          category: required('请选择课程类别', 'change'),
          deliveryMode: required('请选择授课方式', 'change'),
          durationHours: required('请输入课程时长', 'blur'),
          learningObjectives: required('请输入学习目标', 'blur'),
          certificateValidMonths:
            formModel.certificateEnabled && !formModel.certificateValidMonths
              ? required('请输入证书有效期', 'blur')
              : []
        })
      if (entity.value === 'course_competency')
        Object.assign(rules, {
          courseId: required('请选择草稿课程', 'change'),
          competencyId: required('请选择能力项', 'change'),
          targetLevel: required('请选择完成目标等级', 'change')
        })
      if (entity.value === 'session')
        Object.assign(rules, {
          sessionCode: required('请输入班次编码', 'blur'),
          planId: required('请选择培训计划', 'change'),
          courseId: required('请选择课程', 'change'),
          startAt: required('请选择开始时间', 'change'),
          endAt: required('请选择结束时间', 'change'),
          capacity: required('请输入班次容量', 'blur')
        })
      if (entity.value === 'enrollment')
        Object.assign(rules, {
          sessionId: required('请选择开放班次', 'change'),
          employeeId: required('请选择学习员工', 'change')
        })
      return rules
    })
  })

  const contextNote = computed(
    () =>
      ({
        plan: {
          icon: 'ri:calendar-check-line',
          title: '先明确培养目标与预算责任',
          description: '计划发布后进入受控执行，完成时自动汇总所属班次的实际成本。'
        },
        course: {
          icon: 'ri:book-open-line',
          title: '课程是可复用的学习产品',
          description: '通过标准、出勤要求和证书规则在发布前固化，避免班次间口径漂移。'
        },
        course_competency: {
          icon: 'ri:focus-3-line',
          title: '把课程结果连接到岗位能力',
          description: '员工通过课程后，目标能力等级和证据会自动回写个人能力档案。'
        },
        session: {
          icon: 'ri:presentation-line',
          title: '班次承载真实交付与成本',
          description: '时间、容量、讲师和交付渠道完整后才能开放报名，并按学习结果结班。'
        },
        enrollment: {
          icon: 'ri:user-follow-line',
          title: '学习安排必须落到具体员工与班次',
          description: '后续出勤、成绩、证书和员工培训履历都由这条记录形成闭环。'
        },
        certificate: {
          icon: 'ri:award-line',
          title: '证书由通过结果自动签发',
          description: '这里只维护外部可验证凭证地址；证书状态、签发与撤销均受审计控制。'
        }
      })[entity.value]
  )

  const required = (message: string, trigger: 'blur' | 'change') => [
    { required: true, message, trigger }
  ]
  const input = (
    key: keyof FormModel,
    label: string,
    placeholder?: string,
    disabled = false
  ): FormItem => ({
    label,
    key: String(key),
    type: 'input',
    props: { placeholder, disabled }
  })
  const number = (
    key: keyof FormModel,
    label: string,
    props: Record<string, unknown>
  ): FormItem => ({ label, key: String(key), type: 'number', props: { controls: false, ...props } })
  const date = (key: keyof FormModel, label: string, disabled = false): FormItem => ({
    label,
    key: String(key),
    type: 'date',
    props: { type: 'date', valueFormat: 'YYYY-MM-DD', disabled, class: '!w-full' }
  })
  const dateTime = (key: keyof FormModel, label: string): FormItem => ({
    label,
    key: String(key),
    type: 'date',
    props: {
      type: 'datetime',
      valueFormat: 'YYYY-MM-DD HH:mm:ss',
      clearable: key === 'enrollmentDeadline',
      class: '!w-full'
    }
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
    options: Api.Hr.LearningReference[],
    placeholder: string
  ): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: options.map(toNameCodeOption),
    props: { filterable: true, placeholder }
  })

  const replaceModel = (next: FormModel): void => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof FormModel])
    Object.assign(form.model, next)
  }
  const resetEmployeeSelections = (): void => {
    employeeSelection.owner = []
    employeeSelection.learner = []
    employeeSelection.nominator = []
  }

  let referenceRequest = 0
  const loadReferences = async (): Promise<void> => {
    const request = ++referenceRequest
    const tenantId = form.model.tenantId
    const kind = entity.value
    planOptions.value = []
    courseOptions.value = []
    draftCourseOptions.value = []
    sessionOptions.value = []
    competencyOptions.value = []
    if (isPlatformSuper.value && !tenantId) {
      return
    }
    const [plans, courses, sessions, competencies, draftCourses] = await Promise.all([
      kind === 'session' ? fetchLearningOptions('plan', tenantId) : undefined,
      kind === 'session' ? fetchLearningOptions('course', tenantId) : undefined,
      kind === 'enrollment' ? fetchLearningOptions('session', tenantId) : undefined,
      kind === 'course_competency' ? fetchLearningOptions('competency', tenantId) : undefined,
      kind === 'course_competency'
        ? fetchLearningRecords<Api.Hr.LearningCourse>('course', {
            tenantId,
            status: 'draft',
            from: 0,
            to: 499
          })
        : undefined
    ])
    if (request !== referenceRequest || tenantId !== form.model.tenantId || kind !== entity.value)
      return
    planOptions.value = plans?.data ?? []
    courseOptions.value = courses?.data ?? []
    sessionOptions.value = sessions?.data ?? []
    competencyOptions.value = competencies?.data ?? []
    draftCourseOptions.value = (draftCourses?.data ?? []).map((course) => ({
      id: course.id!,
      tenantId: course.tenantId,
      code: course.courseCode,
      name: course.courseName,
      status: course.status
    }))
  }
  const reloadReferences = async (): Promise<void> => {
    await nextTick()
    await Promise.all(
      ['planId', 'courseId', 'sessionId', 'competencyId'].map((key) =>
        formRef.value?.reloadOptions(key)
      )
    )
  }
  const handleTenantChange = async (): Promise<void> => {
    Object.assign(formModel, {
      ownerEmployeeId: undefined,
      planId: undefined,
      courseId: undefined,
      sessionId: undefined,
      employeeId: undefined,
      nominatedByEmployeeId: undefined,
      competencyId: undefined
    })
    resetEmployeeSelections()
    await loadReferences()
    await reloadReferences()
  }

  const validateBusiness = (): void => {
    if (entity.value === 'plan' && form.model.endDate && form.model.endDate < form.model.startDate)
      throw new Error('计划结束日期不能早于开始日期')
    if (entity.value === 'course' && !form.model.certificateEnabled)
      form.model.certificateValidMonths = null
    if (entity.value === 'session') {
      if (
        dayjs(form.model.endAt).isBefore(dayjs(form.model.startAt)) ||
        dayjs(form.model.endAt).isSame(dayjs(form.model.startAt))
      )
        throw new Error('班次结束时间必须晚于开始时间')
      if (
        form.model.enrollmentDeadline &&
        dayjs(form.model.enrollmentDeadline).isAfter(dayjs(form.model.startAt))
      )
        throw new Error('报名截止时间不能晚于班次开始时间')
      if (!form.model.location?.trim() && !form.model.meetingUrl?.trim())
        throw new Error('培训地点与在线地址至少填写一项')
    }
    if (
      entity.value === 'certificate' &&
      form.model.credentialUrl &&
      !/^https:\/\//i.test(form.model.credentialUrl.trim())
    )
      throw new Error('电子凭证地址必须使用 HTTPS')
  }

  const toRecord = (): RecordItem => {
    const common = { id: form.model.id, tenantId: form.model.tenantId }
    if (entity.value === 'plan')
      return {
        ...common,
        planCode: form.model.planCode,
        planName: form.model.planName,
        trainingType: form.model.trainingType,
        startDate: form.model.startDate,
        endDate: form.model.endDate,
        providerName: form.model.providerName,
        budget: form.model.budget,
        status: 'draft',
        objective: form.model.objective,
        remark: form.model.remark,
        ownerEmployeeId: form.model.ownerEmployeeId,
        targetAudience: form.model.targetAudience,
        mandatory: form.model.mandatory
      }
    if (entity.value === 'course')
      return {
        ...common,
        courseCode: form.model.courseCode,
        courseName: form.model.courseName,
        category: form.model.category,
        deliveryMode: form.model.deliveryMode,
        durationHours: Number(form.model.durationHours),
        creditHours: Number(form.model.creditHours),
        providerName: form.model.providerName,
        passingScore: form.model.passingScore,
        minimumAttendancePercent: Number(form.model.minimumAttendancePercent),
        certificateEnabled: form.model.certificateEnabled,
        certificateValidMonths: form.model.certificateValidMonths,
        status: 'draft',
        description: form.model.description,
        learningObjectives: form.model.learningObjectives,
        targetAudience: form.model.targetAudience
      }
    if (entity.value === 'course_competency')
      return {
        ...common,
        courseId: form.model.courseId!,
        competencyId: form.model.competencyId!,
        targetLevel: form.model.targetLevel
      }
    if (entity.value === 'session')
      return {
        ...common,
        sessionCode: form.model.sessionCode,
        planId: form.model.planId!,
        courseId: form.model.courseId!,
        startAt: form.model.startAt,
        endAt: form.model.endAt,
        enrollmentDeadline: form.model.enrollmentDeadline,
        capacity: Number(form.model.capacity),
        instructorName: form.model.instructorName,
        location: form.model.location,
        meetingUrl: form.model.meetingUrl,
        estimatedCost: form.model.estimatedCost,
        status: 'planned'
      }
    if (entity.value === 'enrollment')
      return {
        ...common,
        planId: form.model.planId ?? '',
        sessionId: form.model.sessionId!,
        employeeId: form.model.employeeId!,
        status: 'enrolled',
        nominatedByEmployeeId: form.model.nominatedByEmployeeId,
        remark: form.model.remark
      }
    return {
      ...common,
      enrollmentId: form.model.enrollmentId!,
      employeeId: form.model.employeeId!,
      courseId: form.model.courseId!,
      certificateNo: form.model.certificateNo!,
      certificateName: form.model.certificateName!,
      issuedOn: form.model.issuedOn!,
      expiresOn: form.model.expiresOn,
      credentialUrl: form.model.credentialUrl,
      status: form.model.status as Api.Hr.LearningCertificateStatus
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      validateBusiness()
      const type: DialogType = form.model.id ? 'edit' : 'add'
      await saveLearningRecord(entity.value, toRecord())
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
    resetEmployeeSelections()
    if (row) {
      replaceModel({
        ...createInitialModel(),
        ...(structuredClone(toRaw(row)) as Partial<FormModel>)
      })
      if ('owner' in row)
        employeeSelection.owner = employeeReferenceSelection(row.owner, form.model.tenantId)
      if ('employee' in row)
        employeeSelection.learner = employeeReferenceSelection(row.employee, form.model.tenantId)
      if ('nominator' in row)
        employeeSelection.nominator = employeeReferenceSelection(row.nominator, form.model.tenantId)
    }
    await nextTick()
    formRef.value?.clearValidate()
    const label = {
      plan: '培训计划',
      course: '课程',
      course_competency: '课程能力映射',
      session: '培训班次',
      enrollment: '学习安排',
      certificate: '证书凭证'
    }[nextEntity]
    await dialogRef.value?.handleOpen(undefined, {
      title: `${row ? '编辑' : '新增'}${label}`,
      subtitle: '学习发展数据按租户隔离，并通过独立业务权限与状态机访问',
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
  .learning-dialog {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
</style>
