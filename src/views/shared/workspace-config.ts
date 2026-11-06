import type { HrOrganizationFeature } from '@hr/api/modules/organization-options'

export type HrWorkspaceKey = 'personnelChange' | 'headcount' | 'talent' | 'recruitment'

export interface HrWorkspaceColumn {
  key: keyof Api.Hr.WorkspaceRecord | string
  label: string
  secondaryKey?: keyof Api.Hr.WorkspaceRecord | string
  tertiaryKey?: keyof Api.Hr.WorkspaceRecord | string
  minWidth?: number
  width?: number
  dictCode?: string
  dateTime?: boolean
  suffix?: string
}

export interface HrWorkspaceField {
  key: keyof Api.Hr.WorkspaceRecord
  label: string
  type:
    | 'input'
    | 'textarea'
    | 'select'
    | 'treeSelect'
    | 'employeeSelect'
    | 'date'
    | 'number'
    | 'switch'
    | 'timeSelect'
  required?: boolean
  dictCode?: string
  optionEntity?: Api.Hr.WorkspaceEntity
  optionLabelKeys?: Array<keyof Api.Hr.WorkspaceRecord | string>
  span?: number
  props?: Record<string, unknown>
  documentNumberRuleKey?: string
}

export interface HrWorkspaceTab {
  key: string
  label: string
  icon?: string
  description?: string
  entity: Api.Hr.WorkspaceEntity
  statusDict?: string
  statusKey?: keyof Api.Hr.WorkspaceRecord
  columns: HrWorkspaceColumn[]
  fields: HrWorkspaceField[]
  defaults: Api.Hr.WorkspaceRecord
  approvalBusinessType?: string
  canEffect?: boolean
}

export interface HrWorkspaceDefinition {
  organizationFeature: HrOrganizationFeature
  eyebrow: string
  title: string
  description: string
  icon: string
  tags: string[]
  tabs: HrWorkspaceTab[]
}

const employeeField = (): HrWorkspaceField => ({
  key: 'employeeId',
  label: '员工',
  type: 'employeeSelect',
  required: true
})
const positionField = (
  key: 'positionId' | 'fromPositionId' | 'toPositionId',
  label: string
): HrWorkspaceField => ({
  key,
  label,
  type: 'select',
  optionLabelKeys: ['positionCode', 'positionName']
})
const organizationField = (
  key: 'organizationId' | 'fromOrganizationId' | 'toOrganizationId',
  label: string
): HrWorkspaceField => ({
  key,
  label,
  type: 'treeSelect'
})
const input = (
  key: keyof Api.Hr.WorkspaceRecord,
  label: string,
  required = false
): HrWorkspaceField => ({ key, label, type: 'input', required })
const textarea = (
  key: keyof Api.Hr.WorkspaceRecord,
  label: string,
  required = false
): HrWorkspaceField => ({ key, label, type: 'textarea', required, span: 24 })
const numberedInput = (
  key: keyof Api.Hr.WorkspaceRecord,
  label: string,
  documentNumberRuleKey: string
): HrWorkspaceField => ({
  ...input(key, label, true),
  documentNumberRuleKey,
  props: { maxlength: 60 }
})
const date = (
  key: keyof Api.Hr.WorkspaceRecord,
  label: string,
  required = false
): HrWorkspaceField => ({ key, label, type: 'date', required })
const number = (
  key: keyof Api.Hr.WorkspaceRecord,
  label: string,
  required = false
): HrWorkspaceField => ({ key, label, type: 'number', required, props: { min: 0 } })
const dict = (
  key: keyof Api.Hr.WorkspaceRecord,
  label: string,
  dictCode: string,
  required = false
): HrWorkspaceField => ({ key, label, type: 'select', dictCode, required })

export const hrWorkspaceDefinitions: Record<HrWorkspaceKey, HrWorkspaceDefinition> = {
  personnelChange: {
    organizationFeature: 'personnelChange',
    eyebrow: 'PEOPLE LIFECYCLE',
    title: '人事异动中心',
    icon: 'ri:swap-box-line',
    description:
      '集中管理转正、调动、晋升、停复职与离职，审批通过后按生效日期更新员工当前任职快照。',
    tags: ['审批留痕', '变更前后快照', '到期生效'],
    tabs: [
      {
        key: 'changes',
        label: '异动单',
        entity: 'personnelChange',
        statusDict: 'hrApprovalStatus',
        statusKey: 'status',
        approvalBusinessType: 'hr_personnel_change',
        canEffect: true,
        columns: [
          {
            key: 'employee.employeeName',
            secondaryKey: 'changeNo',
            label: '员工 / 异动单号',
            minWidth: 190
          },
          { key: 'changeType', label: '异动类型', width: 110, dictCode: 'hrPersonnelChangeType' },
          { key: 'effectiveDate', label: '生效日期', width: 120 },
          { key: 'status', label: '状态', width: 110, dictCode: 'hrApprovalStatus' },
          { key: 'reason', label: '异动原因', minWidth: 220 }
        ],
        fields: [
          numberedInput('changeNo', '异动单号', 'hr.personnel_change'),
          employeeField(),
          dict('changeType', '异动类型', 'hrPersonnelChangeType', true),
          date('effectiveDate', '生效日期', true),
          organizationField('fromOrganizationId', '原组织'),
          organizationField('toOrganizationId', '新组织'),
          positionField('fromPositionId', '原岗位'),
          positionField('toPositionId', '新岗位'),
          dict('fromEmploymentStatus', '原任职状态', 'hrEmploymentStatus'),
          dict('toEmploymentStatus', '新任职状态', 'hrEmploymentStatus'),
          input('fromJobTitle', '原职务'),
          input('toJobTitle', '新职务'),
          textarea('reason', '异动原因', true),
          textarea('remark', '备注')
        ],
        defaults: { status: 'draft' }
      }
    ]
  },
  headcount: {
    organizationFeature: 'headcount',
    eyebrow: 'WORKFORCE PLAN',
    title: '编制管理',
    icon: 'ri:organization-chart',
    description: '按组织与岗位维护核定编制和有效期，为招聘需求和岗位缺口提供统一依据。',
    tags: ['组织岗位口径', '有效期控制', '缺编依据'],
    tabs: [
      {
        key: 'headcount',
        label: '岗位编制',
        entity: 'headcount',
        columns: [
          {
            key: 'position.positionName',
            secondaryKey: 'organization.organizationName',
            label: '岗位 / 组织',
            minWidth: 200
          },
          { key: 'approvedCount', label: '核定人数', width: 110 },
          { key: 'occupiedCount', label: '在岗人数', width: 110 },
          { key: 'vacancyCount', label: '编制缺口', width: 110 },
          { key: 'effectiveFrom', label: '生效日期', width: 120 },
          { key: 'effectiveTo', label: '失效日期', width: 120 },
          { key: 'enabled', label: '启用', width: 90, dictCode: 'commonBoolean' }
        ],
        fields: [
          organizationField('organizationId', '组织'),
          positionField('positionId', '岗位'),
          number('approvedCount', '核定人数', true),
          date('effectiveFrom', '生效日期', true),
          date('effectiveTo', '失效日期'),
          { key: 'enabled', label: '启用', type: 'switch' },
          textarea('remark', '备注')
        ],
        defaults: {
          approvedCount: 0,
          effectiveFrom: new Date().toISOString().slice(0, 10),
          enabled: true
        }
      }
    ]
  },
  talent: {
    organizationFeature: 'talent',
    eyebrow: 'TALENT DEVELOPMENT',
    title: '培训与能力',
    icon: 'ri:book-open-line',
    description: '从培训计划延伸到参与结果、岗位能力要求与员工能力评估，形成发展闭环。',
    tags: ['培训计划', '能力矩阵', '岗位匹配'],
    tabs: [
      {
        key: 'plans',
        label: '培训计划',
        icon: 'ri:calendar-todo-line',
        description: '规划培训主题、预算与执行周期',
        entity: 'trainingPlan',
        statusDict: 'hrTrainingPlanStatus',
        statusKey: 'status',
        columns: [
          { key: 'planName', secondaryKey: 'planCode', label: '计划 / 编码', minWidth: 200 },
          { key: 'trainingType', label: '培训类型', width: 120, dictCode: 'hrTrainingType' },
          { key: 'startDate', label: '开始日期', width: 120 },
          { key: 'budget', label: '预算', width: 110 },
          { key: 'status', label: '状态', width: 110, dictCode: 'hrTrainingPlanStatus' }
        ],
        fields: [
          input('planCode', '计划编码', true),
          input('planName', '计划名称', true),
          dict('trainingType', '培训类型', 'hrTrainingType', true),
          date('startDate', '开始日期', true),
          date('endDate', '结束日期'),
          input('providerName', '培训机构'),
          number('budget', '预算'),
          dict('status', '计划状态', 'hrTrainingPlanStatus', true),
          textarea('objective', '培训目标')
        ],
        defaults: { status: 'draft' }
      },
      {
        key: 'enrollments',
        label: '培训参与',
        icon: 'ri:user-follow-line',
        description: '跟踪员工参与、成绩与证书结果',
        entity: 'trainingEnrollment',
        statusDict: 'hrTrainingEnrollmentStatus',
        statusKey: 'status',
        columns: [
          {
            key: 'employee.employeeName',
            secondaryKey: 'plan.planName',
            label: '员工 / 培训计划',
            minWidth: 200
          },
          { key: 'status', label: '参与状态', width: 110, dictCode: 'hrTrainingEnrollmentStatus' },
          { key: 'score', label: '成绩', width: 90 },
          { key: 'certificateNo', label: '证书编号', minWidth: 140 }
        ],
        fields: [
          {
            key: 'planId',
            label: '培训计划',
            type: 'select',
            required: true,
            optionEntity: 'trainingPlan',
            optionLabelKeys: ['planCode', 'planName']
          },
          employeeField(),
          dict('status', '参与状态', 'hrTrainingEnrollmentStatus', true),
          number('score', '成绩'),
          input('result', '培训结果'),
          input('certificateNo', '证书编号'),
          textarea('remark', '备注')
        ],
        defaults: { status: 'enrolled' }
      },
      {
        key: 'competencies',
        label: '能力字典',
        icon: 'ri:book-2-line',
        description: '统一维护组织能力项与分类口径',
        entity: 'competency',
        columns: [
          {
            key: 'competencyName',
            secondaryKey: 'competencyCode',
            label: '能力 / 编码',
            minWidth: 190
          },
          { key: 'category', label: '能力类别', width: 120, dictCode: 'hrCompetencyCategory' },
          { key: 'enabled', label: '启用', width: 90, dictCode: 'commonBoolean' },
          { key: 'description', label: '说明', minWidth: 220 }
        ],
        fields: [
          input('competencyCode', '能力编码', true),
          input('competencyName', '能力名称', true),
          dict('category', '能力类别', 'hrCompetencyCategory', true),
          { key: 'enabled', label: '启用', type: 'switch' },
          textarea('description', '能力说明')
        ],
        defaults: { enabled: true }
      },
      {
        key: 'positionMatrix',
        label: '岗位能力',
        icon: 'ri:briefcase-4-line',
        description: '配置岗位要求等级与能力权重',
        entity: 'positionCompetency',
        columns: [
          {
            key: 'position.positionName',
            secondaryKey: 'competency.competencyName',
            label: '岗位 / 能力项',
            minWidth: 210
          },
          {
            key: 'requiredLevel',
            label: '要求等级',
            width: 120,
            dictCode: 'commonCompetencyLevel'
          },
          { key: 'weight', label: '权重', width: 90, suffix: '%' }
        ],
        fields: [
          positionField('positionId', '岗位'),
          {
            key: 'competencyId',
            label: '能力项',
            type: 'select',
            required: true,
            optionEntity: 'competency',
            optionLabelKeys: ['competencyCode', 'competencyName']
          },
          dict('requiredLevel', '要求等级', 'commonCompetencyLevel', true),
          number('weight', '权重（%）')
        ],
        defaults: { weight: 0 }
      },
      {
        key: 'employeeMatrix',
        label: '员工能力',
        icon: 'ri:user-search-line',
        description: '沉淀员工评估等级与事实依据',
        entity: 'employeeCompetency',
        columns: [
          {
            key: 'employee.employeeName',
            secondaryKey: 'competency.competencyName',
            label: '员工 / 能力项',
            minWidth: 200
          },
          { key: 'currentLevel', label: '当前等级', width: 120, dictCode: 'commonCompetencyLevel' },
          { key: 'assessedDate', label: '评估日期', width: 120 },
          { key: 'evidence', label: '评估依据', minWidth: 200 }
        ],
        fields: [
          employeeField(),
          {
            key: 'competencyId',
            label: '能力项',
            type: 'select',
            required: true,
            optionEntity: 'competency',
            optionLabelKeys: ['competencyCode', 'competencyName']
          },
          dict('currentLevel', '当前等级', 'commonCompetencyLevel', true),
          date('assessedDate', '评估日期', true),
          textarea('evidence', '评估依据')
        ],
        defaults: { assessedDate: new Date().toISOString().slice(0, 10) }
      }
    ]
  },
  recruitment: {
    organizationFeature: 'recruitment',
    eyebrow: 'RECRUITMENT PIPELINE',
    title: '招聘工作台',
    icon: 'ri:user-add-line',
    description: '从招聘需求审批到候选人筛选、面试、Offer 和入职转化，形成可追踪招聘漏斗。',
    tags: ['需求审批', '候选人阶段', '入职转化'],
    tabs: [
      {
        key: 'requisitions',
        label: '招聘需求',
        icon: 'ri:file-list-3-line',
        description: '管理用人缺口、审批与到岗目标',
        entity: 'recruitmentRequisition',
        statusDict: 'hrRecruitmentStatus',
        statusKey: 'status',
        approvalBusinessType: 'hr_recruitment_requisition',
        canEffect: true,
        columns: [
          {
            key: 'position.positionName',
            secondaryKey: 'requisitionNo',
            tertiaryKey: 'organization.organizationName',
            label: '岗位 / 需求编号',
            minWidth: 210
          },
          { key: 'openingCount', label: '需求人数', width: 100 },
          { key: 'hiredCount', label: '已录用', width: 90 },
          { key: 'expectedOnboardDate', label: '期望到岗', width: 120 },
          { key: 'status', label: '状态', width: 110, dictCode: 'hrRecruitmentStatus' }
        ],
        fields: [
          numberedInput('requisitionNo', '需求编号', 'hr.recruitment_requisition'),
          organizationField('organizationId', '招聘组织'),
          positionField('positionId', '招聘岗位'),
          number('openingCount', '需求人数', true),
          number('hiredCount', '已录用人数'),
          date('expectedOnboardDate', '期望到岗日期'),
          dict('employmentType', '用工类型', 'hrEmploymentType', true),
          textarea('reason', '招聘原因', true),
          textarea('requirements', '任职要求')
        ],
        defaults: { status: 'draft', openingCount: 1, hiredCount: 0, employmentType: 'full_time' }
      },
      {
        key: 'candidates',
        label: '候选人',
        icon: 'ri:user-add-line',
        description: '跟踪筛选、面试、Offer 与入职转化',
        entity: 'candidate',
        statusDict: 'hrCandidateStage',
        statusKey: 'stage',
        columns: [
          {
            key: 'candidateName',
            secondaryKey: 'requisition.requisitionNo',
            label: '候选人 / 招聘需求',
            minWidth: 200
          },
          { key: 'phone', label: '联系电话', width: 130 },
          { key: 'source', label: '来源', width: 110, dictCode: 'hrCandidateSource' },
          { key: 'stage', label: '阶段', width: 110, dictCode: 'hrCandidateStage' },
          { key: 'expectedSalary', label: '期望薪资', width: 110 }
        ],
        fields: [
          {
            key: 'requisitionId',
            label: '招聘需求',
            type: 'select',
            required: true,
            optionEntity: 'recruitmentRequisition',
            optionLabelKeys: ['requisitionNo', 'position.positionName']
          },
          input('candidateName', '候选人姓名', true),
          input('phone', '联系电话'),
          input('email', '电子邮箱'),
          dict('source', '候选人来源', 'hrCandidateSource', true),
          dict('stage', '候选人阶段', 'hrCandidateStage', true),
          number('expectedSalary', '期望薪资'),
          input('resumeUrl', '简历附件地址'),
          date('offerDate', 'Offer 日期'),
          textarea('interviewFeedback', '面试反馈'),
          textarea('remark', '备注')
        ],
        defaults: { source: 'referral', stage: 'new' }
      }
    ]
  }
}
