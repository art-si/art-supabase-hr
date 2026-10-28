<template>
  <ArtPermissionGuard permission="Hr:Attendance:View">
    <div class="attendance-page business-workspace-page art-full-height">
      <MasterDeleteProcessingNotice :location-ready="locationReady" />
      <BusinessWorkspaceHeader
        eyebrow="TIME & ATTENDANCE CONTROL"
        title="考勤与工时"
        description="把班次、排班、打卡事实、日工时核算、异常修正与月度封账连接为可审计的薪资输入链。"
        icon="ri:calendar-check-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableQueryRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="attendance-page__control" aria-labelledby="attendance-control-title">
        <header class="attendance-page__heading">
          <div>
            <span class="attendance-page__section-icon"
              ><ArtSvgIcon icon="ri:timer-flash-line"
            /></span>
            <span>
              <strong id="attendance-control-title">工时核算控制链</strong>
              <small>计划工时、实际打卡与异常处理分层管理，封账后形成稳定的薪资核算输入</small>
            </span>
          </div>
          <span class="attendance-page__governance">
            <ArtSvgIcon icon="ri:lock-2-line" />异常清零 · 期间封账
          </span>
        </header>

        <ol class="attendance-page__rail" aria-label="考勤工时处理阶段">
          <li v-for="(stage, index) in controlStages" :key="stage.label" :class="stage.state">
            <span class="attendance-page__rail-index">0{{ index + 1 }}</span>
            <span class="attendance-page__rail-icon"><ArtSvgIcon :icon="stage.icon" /></span>
            <div
              ><strong>{{ stage.label }}</strong
              ><small>{{ stage.description }}</small></div
            >
            <b>{{ stage.value }}</b>
          </li>
        </ol>

        <HrEntityNavigation
          v-model="activeEntity"
          :items="navigationItems"
          navigation-label="考勤工时管理分类"
          compact
          @change="handleTabChange"
        />
        <footer class="attendance-page__note">
          <ArtSvgIcon icon="ri:information-line" />
          打卡记录保存后自动按班次时区和宽限规则核算；已封账期间只能由平台超级管理员重新开放，不能直接篡改。
        </footer>
      </section>

      <ArtTableQuery
        :key="activeEntity"
        ref="tableQueryRef"
        v-model="tableState.searchQuery"
        :search-items="searchItems"
        :api-fn="fetchTableData"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 76, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${activeTab.label}`,
          emptyDescription: activeTab.emptyDescription
        }"
        focusable
      />

      <AttendanceDialog ref="dialogRef" @success="handleSaveSuccess" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useHrMasterDeleteLocation } from '@hr/views/shared/use-hr-master-delete-location'
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import type { ColumnOption, DialogType } from '@/types'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import {
    deleteTimeAttendanceRecord,
    fetchTimeAttendanceOverview,
    fetchTimeAttendanceRecords,
    transitionTimeAttendanceCorrection,
    transitionTimeAttendanceDailyRecord,
    transitionTimeAttendancePeriod
  } from '@hr/api'
  import HrEntityNavigation, {
    type HrEntityNavigationItem
  } from '@hr/views/shared/hr-entity-navigation.vue'
  import AttendanceDialog from './modules/attendance-dialog.vue'

  const formatTableDate = createDateTimeFormatter({
    format: 'YYYY 年 MM 月',
    emptyText: '--',
    invalidText: '--'
  })
  const formatTableDateTime = createDateTimeFormatter({
    format: 'MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'HrAttendance' })

  type Entity = Api.Hr.TimeAttendanceEntity
  type RecordItem = Api.Hr.TimeAttendanceRecord
  type TableParams = Api.Hr.TimeAttendanceSearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface Tab extends HrEntityNavigationItem {
    value: Entity
    emptyDescription: string
    statusDict?: string
  }
  interface DialogExpose {
    handleOpen: (payload: {
      entity: Entity
      type: DialogType
      editData?: RecordItem
      preset?: Record<string, unknown>
    }) => Promise<void>
  }

  const tabs: Tab[] = [
    {
      value: 'record',
      label: '日工时核算',
      description: '计划、打卡与估值结果',
      emptyDescription: '录入或导入打卡事实后，系统会按排班自动计算工时和异常。',
      statusDict: 'hrAttendanceExceptionStatus',
      icon: 'ri:timer-flash-line'
    },
    {
      value: 'assignment',
      label: '员工排班',
      description: '员工、日期与班次规则',
      emptyDescription: '为员工建立逐日排班，作为计划工时与异常判断依据。',
      statusDict: 'hrShiftAssignmentStatus',
      icon: 'ri:calendar-schedule-line'
    },
    {
      value: 'correction',
      label: '异常修正',
      description: '补卡、纠偏与审核留痕',
      emptyDescription: '对漏打卡或设备异常发起修正单，批准后系统重新核算。',
      statusDict: 'hrAttendanceCorrectionStatus',
      icon: 'ri:edit-box-line'
    },
    {
      value: 'period',
      label: '月度封账',
      description: '核对、门禁与薪资边界',
      emptyDescription: '为每月创建考勤期间，核对无误后封账并锁定日考勤。',
      statusDict: 'hrAttendancePeriodStatus',
      icon: 'ri:lock-2-line'
    },
    {
      value: 'shift',
      label: '班次规则',
      description: '时区、跨日与宽限规则',
      emptyDescription: '先建立常规、早晚班或跨日班次，再安排员工排班。',
      icon: 'ri:time-line'
    }
  ]

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptText } = useArtFeedback()
  const activeEntity = ref<Entity>('record')
  const activeTab = computed(() => tabs.find((tab) => tab.value === activeEntity.value) ?? tabs[0]!)
  const deleteTables: Record<Entity, string> = {
    record: 'hr_attendance_record',
    assignment: 'hr_shift_assignment',
    correction: 'hr_attendance_correction',
    period: 'hr_attendance_period',
    shift: 'hr_shift'
  }
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard(
    () => deleteTables[activeEntity.value],
    () => activeTab.value.label
  )
  const navigationItems: HrEntityNavigationItem[] = tabs
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const tableState = reactive<{ searchQuery: Api.Hr.TimeAttendanceSearchParams }>({
    searchQuery: {
      tenantId: '',
      status: '',
      keyword: '',
      periodMonth: dayjs().startOf('month').format('YYYY-MM-DD')
    }
  })
  const { locationReady } = useHrMasterDeleteLocation<Entity>(
    {
      hr_attendance_record: 'record',
      hr_shift_assignment: 'assignment',
      hr_attendance_correction: 'correction',
      hr_attendance_period: 'period',
      hr_shift: 'shift'
    },
    activeEntity,
    tableState.searchQuery,
    tableQueryRef,
    () => {
      tableState.searchQuery.periodMonth = ''
    }
  )
  const overview = reactive<Api.Hr.TimeAttendanceOverview>({
    activeShiftCount: 0,
    todayAssignmentCount: 0,
    openExceptionCount: 0,
    pendingCorrectionCount: 0,
    reviewingPeriodCount: 0,
    monthCompletionRate: 0
  })

  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '班次时区', type: 'primary', effect: 'plain' },
    { label: '异常修正审批', type: 'warning', effect: 'light' },
    { label: '月度封账', type: 'success', effect: 'light' }
  ]
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '启用班次',
      value: overview.activeShiftCount,
      description: `${overview.todayAssignmentCount} 人今日有排班`,
      icon: 'ri:time-line',
      tone: 'primary'
    },
    {
      label: '待处理异常',
      value: overview.openExceptionCount,
      description: '封账前必须修正或豁免',
      icon: 'ri:alarm-warning-line',
      tone: overview.openExceptionCount ? 'danger' : 'success'
    },
    {
      label: '待审核修正',
      value: overview.pendingCorrectionCount,
      description: `${overview.reviewingPeriodCount} 个期间正在核对`,
      icon: 'ri:edit-box-line',
      tone: overview.pendingCorrectionCount ? 'warning' : 'info'
    },
    {
      label: '本月无异常率',
      value: `${overview.monthCompletionRate}%`,
      description: '已处理或无异常的日考勤占比',
      icon: 'ri:verified-badge-line',
      tone: overview.monthCompletionRate >= 95 ? 'success' : 'info'
    }
  ])
  const controlStages = computed(() => [
    {
      label: '计划排班',
      description: '班次、时区与员工日历',
      value: `${overview.activeShiftCount} 个班次`,
      icon: 'ri:calendar-schedule-line',
      state: overview.activeShiftCount ? 'is-complete' : 'is-current'
    },
    {
      label: '工时核算',
      description: '计划与打卡自动估值',
      value: `${overview.todayAssignmentCount} 人今日`,
      icon: 'ri:timer-flash-line',
      state: overview.todayAssignmentCount ? 'is-current' : ''
    },
    {
      label: '异常修正',
      description: '补卡、审批与重新估值',
      value: `${overview.openExceptionCount} 条待办`,
      icon: 'ri:edit-box-line',
      state: overview.openExceptionCount ? 'is-risk' : 'is-complete'
    },
    {
      label: '期间封账',
      description: '锁定薪资输入口径',
      value: `${overview.reviewingPeriodCount} 个核对中`,
      icon: 'ri:lock-2-line',
      state: overview.reviewingPeriodCount ? 'is-current' : ''
    }
  ])

  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = []
    if (isPlatformSuper.value)
      items.push({
        label: '租户',
        key: 'tenantId',
        type: 'select',
        options: tenantOptions.value,
        props: {
          clearable: true,
          filterable: true,
          placeholder: '全部租户',
          onChange: () => void refreshOverview()
        }
      })
    if (activeEntity.value !== 'shift')
      items.push({
        label: '月份',
        key: 'periodMonth',
        type: 'date',
        props: {
          type: 'month',
          valueFormat: 'YYYY-MM-01',
          clearable: true,
          placeholder: '全部月份'
        }
      })
    if (activeTab.value.statusDict)
      items.push({
        label: '状态',
        key: 'status',
        type: 'select',
        options: getDictMap.value[activeTab.value.statusDict] ?? [],
        props: { clearable: true, placeholder: '全部状态' }
      })
    items.push({
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: {
          record: '员工、班次或估值说明',
          assignment: '员工或班次',
          correction: '修正单号、员工或原因',
          period: '按月份和状态筛选',
          shift: '班次编码或名称'
        }[activeEntity.value]
      }
    })
    return items
  })

  const minuteText = (minutes?: number | null) => {
    const value = Number(minutes ?? 0)
    if (!value) return '0 分钟'
    const hours = Math.floor(value / 60)
    const rest = value % 60
    return [hours ? `${hours} 小时` : '', rest ? `${rest} 分钟` : ''].filter(Boolean).join(' ')
  }
  const timeText = createDateTimeFormatter({
    format: 'MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })
  const deviation = (item: Api.Hr.TimeAttendanceDailyRecord) => {
    const values = [
      item.lateMinutes ? `迟到 ${item.lateMinutes}` : '',
      item.earlyLeaveMinutes ? `早退 ${item.earlyLeaveMinutes}` : '',
      item.absenceMinutes ? `缺勤 ${item.absenceMinutes}` : '',
      item.overtimeMinutes ? `超计划 ${item.overtimeMinutes}` : ''
    ].filter(Boolean)
    return values.length ? values.join(' · ') + ' 分钟' : '无偏差'
  }

  const columnsFactory = (): ColumnOption<RecordItem>[] => {
    if (activeEntity.value === 'record') return recordColumns()
    if (activeEntity.value === 'assignment') return assignmentColumns()
    if (activeEntity.value === 'correction') return correctionColumns()
    if (activeEntity.value === 'period') return periodColumns()
    return shiftColumns()
  }
  const recordColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '员工 / 日期',
      minWidth: 205,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceDailyRecord
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={`${item.employee?.code ?? '--'} · ${item.workDate}`}
          />
        )
      }
    },
    {
      prop: 'shift',
      label: '执行班次',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceDailyRecord
        return (
          <BusinessTableIdentityCell
            primary={item.shift?.name ?? '未识别班次'}
            secondary={item.shift?.code ?? '无计划规则'}
          />
        )
      }
    },
    {
      prop: 'clock',
      label: '上下班打卡',
      minWidth: 175,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceDailyRecord
        return (
          <BusinessTableIdentityCell
            primary={timeText(item.clockInAt)}
            secondary={`至 ${timeText(item.clockOutAt)}`}
          />
        )
      }
    },
    {
      prop: 'minutes',
      label: '计划 / 实际 / 应付',
      minWidth: 185,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceDailyRecord
        return (
          <BusinessTableIdentityCell
            primary={`${minuteText(item.scheduledMinutes)} / ${minuteText(item.workMinutes)}`}
            secondary={`应付 ${minuteText(item.payableMinutes)}`}
          />
        )
      }
    },
    {
      prop: 'deviation',
      label: '工时偏差',
      minWidth: 190,
      formatter: (row) => deviation(row as Api.Hr.TimeAttendanceDailyRecord)
    },
    {
      prop: 'exceptionStatus',
      label: '异常状态',
      width: 105,
      dict: { code: 'hrAttendanceExceptionStatus', display: 'auto' }
    },
    {
      prop: 'source',
      label: '来源 / 锁定',
      minWidth: 125,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceDailyRecord
        return (
          <BusinessTableIdentityCell
            primary={userStore.getDictLabelByValue(
              'hrAttendanceSource',
              item.source,
              item.source ?? '--'
            )}
            secondary={
              item.lockedAt ? '已封账锁定' : item.pendingCorrection ? '修正审核中' : '可处理'
            }
          />
        )
      }
    },
    actionColumn()
  ]
  const assignmentColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'employee',
      label: '员工 / 工作日',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceAssignment
        return (
          <BusinessTableIdentityCell
            primary={item.employee?.name}
            secondary={`${item.employee?.code ?? '--'} · ${item.workDate}`}
          />
        )
      }
    },
    {
      prop: 'shift',
      label: '执行班次',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceAssignment
        return (
          <BusinessTableIdentityCell
            primary={item.shift?.name}
            secondary={`${item.shift?.startTime ?? '--'} - ${item.shift?.endTime ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'assignmentStatus',
      label: '排班状态',
      width: 110,
      dict: { code: 'hrShiftAssignmentStatus', display: 'auto' }
    },
    { prop: 'remark', label: '排班说明', minWidth: 260, showOverflowTooltip: true },
    actionColumn()
  ]
  const correctionColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'correctionNo',
      label: '修正单 / 员工',
      minWidth: 230,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceCorrection
        return (
          <BusinessTableIdentityCell
            primary={item.correctionNo}
            secondary={`${item.employee?.name ?? '--'} · ${item.record?.workDate ?? '--'}`}
          />
        )
      }
    },
    {
      prop: 'original',
      label: '原始打卡',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceCorrection
        return (
          <BusinessTableIdentityCell
            primary={timeText(item.record?.clockInAt)}
            secondary={`至 ${timeText(item.record?.clockOutAt)}`}
          />
        )
      }
    },
    {
      prop: 'requested',
      label: '修正后打卡',
      minWidth: 165,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceCorrection
        return (
          <BusinessTableIdentityCell
            primary={timeText(item.requestedClockInAt)}
            secondary={`至 ${timeText(item.requestedClockOutAt)}`}
          />
        )
      }
    },
    { prop: 'reason', label: '修正原因', minWidth: 260, showOverflowTooltip: true },
    {
      prop: 'status',
      label: '审核状态',
      width: 105,
      dict: { code: 'hrAttendanceCorrectionStatus', display: 'auto' }
    },
    actionColumn()
  ]
  const periodColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'periodMonth',
      label: '考勤期间',
      minWidth: 165,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendancePeriod
        return (
          <BusinessTableIdentityCell
            primary={formatTableDate(item.periodMonth)}
            secondary={
              item.closedAt ? `封账 ${formatTableDateTime(item.closedAt)}` : '等待期间结算'
            }
          />
        )
      }
    },
    {
      prop: 'recordCount',
      label: '记录 / 异常',
      minWidth: 145,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendancePeriod
        return (
          <BusinessTableIdentityCell
            primary={`${item.recordCount} 条日考勤`}
            secondary={`${item.exceptionCount} 条未清异常`}
          />
        )
      }
    },
    {
      prop: 'totalMinutes',
      label: '计划 / 应付工时',
      minWidth: 190,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendancePeriod
        return (
          <BusinessTableIdentityCell
            primary={minuteText(item.totalScheduledMinutes)}
            secondary={`应付 ${minuteText(item.totalPayableMinutes)}`}
          />
        )
      }
    },
    {
      prop: 'totalOvertimeMinutes',
      label: '超计划工时',
      width: 130,
      formatter: (row) => minuteText((row as Api.Hr.TimeAttendancePeriod).totalOvertimeMinutes)
    },
    { prop: 'closeNote', label: '核对说明', minWidth: 240, showOverflowTooltip: true },
    {
      prop: 'status',
      label: '期间状态',
      width: 105,
      dict: { code: 'hrAttendancePeriodStatus', display: 'auto' }
    },
    actionColumn()
  ]
  const shiftColumns = (): ColumnOption<RecordItem>[] => [
    {
      prop: 'shiftName',
      label: '班次规则',
      minWidth: 215,
      fixed: 'left',
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceShift
        return (
          <BusinessTableIdentityCell
            primary={item.shiftName}
            secondary={`${item.shiftCode} · ${userStore.getDictLabelByValue('hrShiftType', item.shiftType, item.shiftType ?? '--')}`}
          />
        )
      }
    },
    {
      prop: 'time',
      label: '计划时段',
      minWidth: 170,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceShift
        return (
          <BusinessTableIdentityCell
            primary={`${item.startTime} - ${item.endTime}`}
            secondary={`${item.crossDay ? '跨日' : '当日'} · 休息 ${item.breakMinutes} 分钟`}
          />
        )
      }
    },
    {
      prop: 'grace',
      label: '异常宽限',
      minWidth: 155,
      formatter: (row) => {
        const item = row as Api.Hr.TimeAttendanceShift
        return (
          <BusinessTableIdentityCell
            primary={`迟到 ${item.lateGraceMinutes} 分钟`}
            secondary={`早退 ${item.earlyLeaveGraceMinutes} 分钟`}
          />
        )
      }
    },
    { prop: 'timeZone', label: '班次时区', minWidth: 155 },
    {
      prop: 'usageCount',
      label: '排班使用',
      width: 105,
      formatter: (row) => `${(row as Api.Hr.TimeAttendanceShift).usageCount ?? 0} 条`
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      formatter: (row) => (
        <ElTag
          type={(row as Api.Hr.TimeAttendanceShift).enabled ? 'success' : 'info'}
          effect="light"
        >
          {(row as Api.Hr.TimeAttendanceShift).enabled ? '启用' : '停用'}
        </ElTag>
      )
    },
    actionColumn()
  ]

  const transitionActions = (row: RecordItem): ButtonMoreItem[] => {
    if (!row.id) return []
    const actions: ButtonMoreItem[] = []
    if (activeEntity.value === 'record') {
      const item = row as Api.Hr.TimeAttendanceDailyRecord
      if (item.lockedAt) return actions
      actions.push({
        key: 'evaluate',
        label: '重新核算',
        icon: 'ri:refresh-line',
        auth: 'Hr:Attendance:Evaluate'
      })
      if (!item.pendingCorrection)
        actions.push({
          key: 'create_correction',
          label: '发起修正',
          icon: 'ri:file-edit-line',
          auth: 'Hr:Attendance:Add'
        })
      if (item.exceptionStatus === 'open')
        actions.push({
          key: 'waive',
          label: '豁免异常',
          icon: 'ri:shield-check-line',
          auth: 'Hr:Attendance:ReviewCorrection'
        })
      if (['resolved', 'waived'].includes(item.exceptionStatus))
        actions.push({
          key: 'reopen_record',
          label: '重新打开异常',
          icon: 'ri:arrow-go-back-line',
          auth: 'Hr:Attendance:ReviewCorrection'
        })
    }
    if (activeEntity.value === 'correction') {
      const item = row as Api.Hr.TimeAttendanceCorrection
      if (['draft', 'rejected'].includes(item.status))
        actions.push({
          key: 'submit_correction',
          label: '提交审核',
          icon: 'ri:send-plane-line',
          auth: 'Hr:Attendance:Edit'
        })
      if (item.status === 'submitted') {
        actions.push(
          {
            key: 'approve_correction',
            label: '批准修正',
            icon: 'ri:checkbox-circle-line',
            auth: 'Hr:Attendance:ReviewCorrection'
          },
          {
            key: 'reject_correction',
            label: '驳回修正',
            icon: 'ri:close-circle-line',
            color: 'var(--el-color-danger)',
            auth: 'Hr:Attendance:ReviewCorrection'
          },
          {
            key: 'cancel_correction',
            label: '取消修正',
            icon: 'ri:arrow-go-back-line',
            auth: 'Hr:Attendance:Edit'
          }
        )
      }
    }
    if (activeEntity.value === 'period') {
      const item = row as Api.Hr.TimeAttendancePeriod
      if (item.status === 'open')
        actions.push({
          key: 'review_period',
          label: '进入核对',
          icon: 'ri:search-eye-line',
          auth: 'Hr:Attendance:ClosePeriod'
        })
      if (item.status === 'reviewing')
        actions.push({
          key: 'close_period',
          label: '确认封账',
          icon: 'ri:lock-2-line',
          auth: 'Hr:Attendance:ClosePeriod'
        })
      if (item.status === 'closed' && isPlatformSuper.value)
        actions.push({
          key: 'reopen_period',
          label: '重新开放',
          icon: 'ri:lock-unlock-line',
          auth: 'Hr:Attendance:ClosePeriod'
        })
    }
    return actions
  }

  const canEdit = (row: RecordItem) => {
    if (activeEntity.value === 'record') return !(row as Api.Hr.TimeAttendanceDailyRecord).lockedAt
    if (activeEntity.value === 'correction')
      return ['draft', 'rejected'].includes((row as Api.Hr.TimeAttendanceCorrection).status)
    if (activeEntity.value === 'period')
      return (row as Api.Hr.TimeAttendancePeriod).status === 'open'
    return (
      activeEntity.value === 'shift' ||
      (row as Api.Hr.TimeAttendanceAssignment).assignmentStatus === 'scheduled'
    )
  }
  const canDelete = (row: RecordItem) => {
    if (activeEntity.value === 'record') return false
    if (activeEntity.value === 'correction')
      return (row as Api.Hr.TimeAttendanceCorrection).status === 'draft'
    if (activeEntity.value === 'period')
      return (row as Api.Hr.TimeAttendancePeriod).status === 'open'
    if (activeEntity.value === 'assignment')
      return (row as Api.Hr.TimeAttendanceAssignment).assignmentStatus === 'scheduled'
    return ((row as Api.Hr.TimeAttendanceShift).usageCount ?? 0) === 0
  }
  const actionColumn = (): ColumnOption<RecordItem> => ({
    prop: 'action',
    label: '操作',
    width: 112,
    fixed: 'right',
    formatter: (row) => (
      <BusinessTableRowActions>
        {canEdit(row) ? (
          <ArtButtonTable
            type="edit"
            permission="Hr:Attendance:Edit"
            onClick={() => openDialog(activeEntity.value, row)}
          />
        ) : null}
        <ArtButtonMore
          list={() => [
            ...transitionActions(row),
            ...(canDelete(row)
              ? [
                  {
                    key: 'delete',
                    label: '删除记录',
                    icon: 'ri:delete-bin-5-line',
                    color: 'var(--el-color-danger)',
                    auth: 'Hr:Attendance:Delete'
                  }
                ]
              : [])
          ]}
          onClick={(item: ButtonMoreItem) => void handleMoreAction(item, row)}
        />
      </BusinessTableRowActions>
    )
  })

  const handleMoreAction = async (item: ButtonMoreItem, row: RecordItem): Promise<void> => {
    if (!row.id) return
    if (item.key === 'delete') return await handleDelete(row)
    if (activeEntity.value === 'record') {
      const record = row as Api.Hr.TimeAttendanceDailyRecord
      if (item.key === 'create_correction')
        return openDialog('correction', undefined, { attendanceRecordId: record.id })
      if (item.key === 'evaluate') return await handleRecordAction(record, 'evaluate')
      if (item.key === 'waive') return await handleRecordAction(record, 'waive')
      if (item.key === 'reopen_record') return await handleRecordAction(record, 'reopen')
    }
    if (activeEntity.value === 'correction') {
      const correction = row as Api.Hr.TimeAttendanceCorrection
      if (item.key === 'submit_correction')
        return await handleCorrectionAction(correction, 'submit')
      if (item.key === 'approve_correction')
        return await handleCorrectionAction(correction, 'approve')
      if (item.key === 'reject_correction')
        return await handleCorrectionAction(correction, 'reject')
      if (item.key === 'cancel_correction')
        return await handleCorrectionAction(correction, 'cancel')
    }
    if (activeEntity.value === 'period') {
      const period = row as Api.Hr.TimeAttendancePeriod
      if (item.key === 'review_period') return await handlePeriodAction(period, 'review')
      if (item.key === 'close_period') return await handlePeriodAction(period, 'close')
      if (item.key === 'reopen_period') return await handlePeriodAction(period, 'reopen')
    }
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: {
        record: '新增日考勤',
        assignment: '新增员工排班',
        correction: '新增修正单',
        period: '新增考勤期间',
        shift: '新增班次规则'
      }[activeEntity.value],
      permission: 'Hr:Attendance:Add',
      onClick: () => openDialog(activeEntity.value)
    }
  ])

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchTimeAttendanceRecords(activeEntity.value, { ...params, from, to })
  }
  const refreshOverview = async () => {
    const response = await fetchTimeAttendanceOverview(tableState.searchQuery.tenantId)
    if (response.data) Object.assign(overview, response.data)
  }
  const openDialog = (entityValue: Entity, row?: RecordItem, preset?: Record<string, unknown>) =>
    void dialogRef.value?.handleOpen({
      entity: entityValue,
      type: row ? 'edit' : 'add',
      editData: row,
      preset: { tenantId: tableState.searchQuery.tenantId || undefined, ...preset }
    })
  const handleSaveSuccess = (type: DialogType) => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    void refreshOverview()
  }
  const handleTabChange = () => Object.assign(tableState.searchQuery, { keyword: '', status: '' })
  const refreshAfterAction = async () => {
    await tableQueryRef.value?.getData()
    await refreshOverview()
  }

  const handleDelete = async (row: RecordItem) => {
    if (!row.id || activeEntity.value === 'record') return
    const entity = activeEntity.value
    const label =
      entity === 'shift'
        ? `${(row as Api.Hr.TimeAttendanceShift).shiftName}（${(row as Api.Hr.TimeAttendanceShift).shiftCode}）`
        : entity === 'period'
          ? (row as Api.Hr.TimeAttendancePeriod).periodMonth
          : entity === 'correction'
            ? ((row as Api.Hr.TimeAttendanceCorrection).correctionNo ?? '考勤修正单')
            : `${(row as Api.Hr.TimeAttendanceAssignment).employee?.name ?? '员工'} · ${(row as Api.Hr.TimeAttendanceAssignment).workDate}`
    await deleteRecord({
      resource: { id: row.id, label },
      resourceLabel: activeTab.value.label,
      permission: 'Hr:Attendance:Delete',
      remove: () => deleteTimeAttendanceRecord(entity, row.id!),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
        await refreshOverview()
      }
    })
  }

  const handleRecordAction = async (
    row: Api.Hr.TimeAttendanceDailyRecord,
    action: Api.Hr.TimeAttendanceRecordAction
  ) => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action !== 'evaluate')
        comment = await promptText(
          action === 'waive'
            ? '请输入豁免异常的业务原因，内容将保留在估值记录中。'
            : '请输入重新打开异常的原因。',
          action === 'waive' ? '豁免考勤异常' : '重新打开异常',
          { minLength: 2, maxLength: 500 }
        )
      else
        await confirmAction('系统将按当前班次、排班和打卡事实重新计算日工时。', '重新核算日考勤', {
          confirmButtonText: '开始核算',
          cancelButtonText: '取消',
          type: 'info'
        })
      await transitionTimeAttendanceDailyRecord(row.id, action, comment)
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '日考勤处理失败，请刷新记录后重试')
    }
  }

  const handleCorrectionAction = async (
    row: Api.Hr.TimeAttendanceCorrection,
    action: Api.Hr.TimeAttendanceCorrectionAction
  ) => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'reject')
        comment = await promptText('请输入驳回原因，申请人可修改后重新提交。', '驳回考勤修正', {
          minLength: 2,
          maxLength: 500
        })
      else
        await confirmAction(
          action === 'approve'
            ? '批准后将回写打卡事实、重新核算工时并保留原始快照。'
            : action === 'submit'
              ? '提交后进入待审核状态，不能直接修改。'
              : '取消后修正单结束，不会改写日考勤。',
          action === 'approve' ? '批准考勤修正' : action === 'submit' ? '提交修正单' : '取消修正单',
          {
            confirmButtonText: '确认',
            cancelButtonText: '取消',
            type: action === 'cancel' ? 'warning' : 'info'
          }
        )
      await transitionTimeAttendanceCorrection(row.id, action, comment)
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '考勤修正处理失败，请刷新申请后重试')
    }
  }

  const handlePeriodAction = async (
    row: Api.Hr.TimeAttendancePeriod,
    action: Api.Hr.TimeAttendancePeriodAction
  ) => {
    if (!row.id) return
    try {
      let comment: string | undefined
      if (action === 'close')
        comment = await promptText(
          '封账后期间内日考勤将锁定，请填写复核与结算说明。',
          '确认考勤封账',
          { minLength: 2, maxLength: 1000 }
        )
      else if (action === 'reopen')
        comment = await promptText(
          '重新开放会解除期间内考勤锁定，请填写充分原因。',
          '重新开放考勤期间',
          { minLength: 2, maxLength: 1000 }
        )
      else
        await confirmAction(
          '系统会重新汇总记录数、异常数及计划、应付和超计划工时。',
          '进入月度核对',
          { confirmButtonText: '开始核对', cancelButtonText: '取消', type: 'info' }
        )
      await transitionTimeAttendancePeriod(row.id, action, comment)
      await refreshAfterAction()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '考勤期间处理失败，请刷新期间状态后重试')
    }
  }

  onMounted(async () => {
    if (isPlatformSuper.value) {
      const tenants = await fetchEnabledTenantList()
      tenantOptions.value = (tenants.data ?? [])
        .filter((tenant): tenant is typeof tenant & { id: string } => Boolean(tenant.id))
        .map((tenant) => ({ label: tenant.tenantName, value: tenant.id }))
    }
    await refreshOverview()
  })
</script>

<style scoped lang="scss">
  @use '../../shared/hr-table-workspace-layout' as *;

  .attendance-page {
    @include hr-table-workspace-layout(360px);

    &__control {
      flex: 0 0 auto;
      padding: 18px 20px 0;
      overflow: hidden;
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--theme-color) 5%, transparent),
          transparent 48%
        ),
        var(--default-box-color);
      border: 1px solid var(--art-surface-border);
      border-radius: var(--el-border-radius-base);
      box-shadow: var(--art-surface-shadow);
    }

    &__heading,
    &__heading > div,
    &__rail li,
    &__actions {
      display: flex;
      align-items: center;
    }

    &__heading {
      gap: 16px;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    &__heading > div {
      gap: 11px;
      min-width: 0;
    }

    &__heading strong,
    &__heading small {
      display: block;
    }

    &__heading strong {
      font-size: 16px;
      color: var(--art-gray-900);
    }

    &__heading small {
      margin-top: 3px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--art-gray-600);
    }

    &__section-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 20%, var(--art-border-color));
      border-radius: var(--el-border-radius-base);
    }

    &__governance {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border-radius: 999px;
    }

    &__rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      padding: 0;
      margin: 0 0 14px;
      list-style: none;
      border: 1px solid var(--art-border-color);
      border-radius: var(--el-border-radius-base);
    }

    &__rail li {
      position: relative;
      gap: 10px;
      min-width: 0;
      padding: 13px 14px;
      background: color-mix(in srgb, var(--art-gray-100) 55%, transparent);
    }

    &__rail li + li {
      border-left: 1px solid var(--art-border-color);
    }

    &__rail li.is-current {
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
    }

    &__rail li.is-risk {
      background: color-mix(in srgb, var(--el-color-danger) 7%, var(--default-box-color));
    }

    &__rail-index {
      font-size: 10px;
      font-weight: 700;
      color: var(--art-gray-500);
    }

    &__rail-icon {
      display: grid;
      flex: 0 0 32px;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--theme-color);
      background: var(--default-box-color);
      border-radius: var(--el-border-radius-base);
    }

    &__rail div {
      min-width: 0;
    }

    &__rail strong,
    &__rail small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__rail strong {
      font-size: 13px;
      color: var(--art-gray-900);
    }

    &__rail small {
      margin-top: 3px;
      font-size: 11px;
      color: var(--art-gray-600);
    }

    &__rail b {
      margin-left: auto;
      font-size: 11px;
      color: var(--art-gray-700);
      white-space: nowrap;
    }

    &__note {
      display: flex;
      gap: 7px;
      align-items: center;
      padding: 10px 0 12px;
      font-size: 11px;
      line-height: 1.55;
      color: var(--art-gray-600);
    }

    &__actions {
      gap: 2px;
      white-space: nowrap;
    }

    :deep(.hr-entity-navigation) {
      margin-inline: -4px;
    }

    @media (width <= 1200px) {
      &__rail {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__rail li:nth-child(3) {
        border-top: 1px solid var(--art-border-color);
        border-left: 0;
      }

      &__rail li:nth-child(4) {
        border-top: 1px solid var(--art-border-color);
      }
    }

    @media (width <= 760px) {
      &__control {
        padding-inline: 14px;
      }

      &__heading {
        align-items: flex-start;
      }

      &__governance {
        display: none;
      }

      &__rail {
        grid-template-columns: 1fr;
      }

      &__rail li + li,
      &__rail li:nth-child(3) {
        border-top: 1px solid var(--art-border-color);
        border-left: 0;
      }
    }
  }
</style>
