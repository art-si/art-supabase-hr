<template>
  <ArtDrawer :loading="loading" ref="drawerRef">
    <ArtAsyncState
      :error="loadError"
      :empty="missing"
      empty-text="详情记录不可用"
      empty-description="记录可能已删除或不在当前可见范围，请返回列表核对。"
      :min-height="280"
      @retry="retryLoad"
    >
      <div v-if="record" class="compliance-detail">
        <section class="compliance-detail__hero" aria-labelledby="compliance-detail-title">
          <div class="compliance-detail__identity">
            <span class="compliance-detail__hero-icon" aria-hidden="true">
              <ArtSvgIcon
                :icon="entity === 'contract' ? 'ri:file-shield-2-line' : 'ri:award-line'"
              />
            </span>
            <div>
              <small>{{ entity === 'contract' ? '劳动合同档案' : '员工资质档案' }}</small>
              <h3 id="compliance-detail-title">{{ subjectTitle }}</h3>
              <p>{{ employeeText }}</p>
            </div>
          </div>
          <div class="compliance-detail__status">
            <ElTag :type="statusTone" effect="light" round>{{ statusLabel }}</ElTag>
            <ElTag :type="riskTone" effect="plain" round>{{ riskLabel }}</ElTag>
          </div>
        </section>

        <section class="compliance-detail__summary" aria-label="合规记录摘要">
          <dl>
            <div v-for="item in summaryItems" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
              <small>{{ item.hint }}</small>
            </div>
          </dl>
        </section>

        <section class="compliance-detail__section">
          <header>
            <ArtSvgIcon icon="ri:information-2-line" />
            <div><strong>合规资料</strong><small>当前有效版本的业务事实与责任信息</small></div>
          </header>
          <dl class="compliance-detail__facts">
            <div v-for="item in factItems" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
          <a
            v-if="attachmentUrl"
            class="compliance-detail__attachment"
            :href="attachmentUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArtSvgIcon icon="ri:attachment-2" />
            查看授权附件
            <ArtSvgIcon icon="ri:external-link-line" />
          </a>
        </section>

        <section class="compliance-detail__section">
          <header>
            <ArtSvgIcon icon="ri:history-line" />
            <div
              ><strong>合规审计轨迹</strong><small>状态、核验、续签和说明均不可变留痕</small></div
            >
          </header>
          <ElTimeline v-if="record.events?.length" class="compliance-detail__timeline">
            <ElTimelineItem
              v-for="event in record.events"
              :key="event.id"
              :type="eventTone(event.eventType)"
              :timestamp="formatDateTime(event.createTime)"
              placement="top"
            >
              <article>
                <div>
                  <strong>{{
                    userStore.getDictLabelByValue(
                      'hrComplianceEventType',
                      event.eventType,
                      event.eventType ?? '--'
                    )
                  }}</strong>
                  <span>{{ actorText(event) }}</span>
                </div>
                <small v-if="event.fromStatus || event.toStatus">
                  {{ event.fromStatus ? dictStatusLabel(event.fromStatus) : '初始状态' }}
                  <ArtSvgIcon icon="ri:arrow-right-line" />
                  {{ event.toStatus ? dictStatusLabel(event.toStatus) : '未变更' }}
                </small>
                <p v-if="event.comment">{{ event.comment }}</p>
              </article>
            </ElTimelineItem>
          </ElTimeline>
          <ArtEmptyState
            v-else
            title="暂无合规审计记录"
            description="合规状态或处理结果变化后，会在此留下记录。"
            size="compact"
            :visual-size="64"
          />
        </section>
      </div>
    </ArtAsyncState>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import type { TagProps, TimelineItemProps } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { createDateTimeFormatter, formatDateTimeValue as formatDateTime } from '@/utils/ui/format'
  import { useUserStore } from '@/store/modules/user'
  import { fetchComplianceDetail } from '@hr/api'

  type Entity = Api.Hr.ComplianceRecordEntity
  type RecordItem = Api.Hr.ComplianceContract | Api.Hr.ComplianceQualification
  interface DisplayItem {
    label: string
    value: string
    hint?: string
  }

  const drawerRef = ref<ArtDrawerExpose>()
  const {
    detail: record,
    loading,
    missing,
    loadError,
    loadDetail,
    openDetail,
    retryLoad
  } = useDetailRecord<RecordItem>(
    (id) => fetchComplianceDetail(entity.value, id),
    '合规详情暂时无法加载，请重新加载'
  )
  onBeforeUnmount(() => openDetail(''))
  const entity = ref<Entity>('contract')
  const userStore = useUserStore()

  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD' })
  const employeeText = computed(
    () =>
      `${record.value?.employee?.employeeName || '未关联员工'} · ${record.value?.employee?.employeeNo || '未维护工号'}`
  )
  const subjectTitle = computed(() => {
    if (!record.value) return '--'
    return entity.value === 'contract'
      ? (record.value as Api.Hr.ComplianceContract).contractNo
      : (record.value as Api.Hr.ComplianceQualification).qualificationName
  })
  const statusLabel = computed(() => {
    if (!record.value) return '--'
    return entity.value === 'contract'
      ? userStore.getDictLabelByValue(
          'hrContractStatus',
          (record.value as Api.Hr.ComplianceContract).contractStatus,
          (record.value as Api.Hr.ComplianceContract).contractStatus ?? '--'
        )
      : userStore.getDictLabelByValue(
          'hrQualificationStatus',
          (record.value as Api.Hr.ComplianceQualification).status,
          (record.value as Api.Hr.ComplianceQualification).status ?? '--'
        )
  })
  const statusTone = computed<TagProps['type']>(() => {
    if (!record.value) return 'info'
    const status =
      entity.value === 'contract'
        ? (record.value as Api.Hr.ComplianceContract).contractStatus
        : (record.value as Api.Hr.ComplianceQualification).status
    return ['active', 'valid', 'renewed'].includes(status)
      ? 'success'
      : ['terminated', 'revoked', 'expired'].includes(status)
        ? 'danger'
        : 'info'
  })
  const dueDate = computed(() => {
    if (!record.value) return null
    return entity.value === 'contract'
      ? (record.value as Api.Hr.ComplianceContract).endDate
      : (record.value as Api.Hr.ComplianceQualification).expiryDate
  })
  const reminderDays = computed(() => {
    if (!record.value) return 30
    return entity.value === 'contract'
      ? ((record.value as Api.Hr.ComplianceContract).renewalReminderDays ?? 30)
      : ((record.value as Api.Hr.ComplianceQualification).reminderDays ?? 30)
  })
  const resolvedDaysRemaining = computed<number | null>(() => {
    if (record.value?.daysRemaining != null) return record.value.daysRemaining
    if (!dueDate.value) return null
    return Math.ceil(
      (new Date(`${dueDate.value}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) /
        86_400_000
    )
  })
  const resolvedRiskStatus = computed<Api.Hr.ComplianceRiskStatus>(() => {
    if (record.value?.riskStatus) return record.value.riskStatus
    const days = resolvedDaysRemaining.value
    if (days == null) return 'clear'
    if (days < 0) return 'overdue'
    if (days <= 7) return 'critical'
    if (days <= 30) return 'due_soon'
    if (days <= reminderDays.value) return 'watch'
    return 'clear'
  })
  const riskLabel = computed(() =>
    userStore.getDictLabelByValue(
      'hrComplianceRiskStatus',
      resolvedRiskStatus.value,
      resolvedRiskStatus.value ?? '--'
    )
  )
  const riskTone = computed<TagProps['type']>(() =>
    ['overdue', 'critical'].includes(resolvedRiskStatus.value)
      ? 'danger'
      : resolvedRiskStatus.value === 'due_soon'
        ? 'warning'
        : resolvedRiskStatus.value === 'clear'
          ? 'success'
          : 'primary'
  )
  const daysHint = computed(() => {
    const days = resolvedDaysRemaining.value
    if (days == null) return '无固定到期日'
    if (days < 0) return `已逾期 ${Math.abs(days)} 天`
    return `距到期 ${days} 天`
  })

  const summaryItems = computed<DisplayItem[]>(() => {
    if (!record.value) return []
    if (entity.value === 'contract') {
      const item = record.value as Api.Hr.ComplianceContract
      return [
        { label: '合同期限', value: formatDate(item.endDate), hint: daysHint.value },
        {
          label: '续签决策',
          value: userStore.getDictLabelByValue(
            'hrContractRenewalDecision',
            item.renewalDecision,
            item.renewalDecision ?? '--'
          ),
          hint: item.renewalOwner?.employeeName || '尚未指定负责人'
        },
        {
          label: '合同版本',
          value: item.previousContractNo ? '续签版本' : '首个版本',
          hint: item.previousContractNo ? `承接 ${item.previousContractNo}` : '无上游版本'
        },
        {
          label: '工作地点',
          value: item.workLocation || '--',
          hint: userStore.getDictLabelByValue(
            'hrContractType',
            item.contractType,
            item.contractType ?? '--'
          )
        }
      ]
    }
    const item = record.value as Api.Hr.ComplianceQualification
    return [
      { label: '有效期限', value: formatDate(item.expiryDate), hint: daysHint.value },
      {
        label: '核验状态',
        value: userStore.getDictLabelByValue(
          'hrQualificationVerificationStatus',
          item.verificationStatus,
          item.verificationStatus ?? '--'
        ),
        hint: item.verifiedByEmployee?.employeeName || '尚未完成独立核验'
      },
      {
        label: '责任人',
        value: item.responsibleEmployee?.employeeName || '待指定',
        hint: item.responsibleEmployee?.employeeNo || '负责复审与到期处置'
      },
      {
        label: '下次复审',
        value: formatDate(item.nextReviewDate),
        hint: `${item.reminderDays ?? 30} 天前提醒`
      }
    ]
  })

  const factItems = computed<DisplayItem[]>(() => {
    if (!record.value) return []
    if (entity.value === 'contract') {
      const item = record.value as Api.Hr.ComplianceContract
      return [
        { label: '合同编号', value: item.contractNo },
        {
          label: '合同类型',
          value: userStore.getDictLabelByValue(
            'hrContractType',
            item.contractType,
            item.contractType ?? '--'
          )
        },
        { label: '签订日期', value: formatDate(item.signDate) },
        { label: '生效日期', value: formatDate(item.startDate) },
        { label: '结束日期', value: formatDate(item.endDate) },
        { label: '试用期结束', value: formatDate(item.probationEndDate) },
        { label: '续签提醒', value: `${item.renewalReminderDays ?? 30} 天前` },
        {
          label: '终止信息',
          value: item.terminationDate
            ? `${formatDate(item.terminationDate)} · ${item.terminationReason || '未填写原因'}`
            : '未终止'
        }
      ]
    }
    const item = record.value as Api.Hr.ComplianceQualification
    return [
      {
        label: '资质类别',
        value: userStore.getDictLabelByValue(
          'hrQualificationType',
          item.qualificationType,
          item.qualificationType ?? '--'
        )
      },
      { label: '证书编号', value: item.certificateNo || '--' },
      { label: '发证机构', value: item.issuer || '--' },
      { label: '发证日期', value: formatDate(item.issueDate) },
      { label: '有效期至', value: formatDate(item.expiryDate) },
      { label: '核验时间', value: formatDateTime(item.verifiedAt) },
      { label: '核验说明', value: item.verificationNote || '--' },
      {
        label: '撤销信息',
        value: item.revokedAt
          ? `${formatDateTime(item.revokedAt)} · ${item.revocationReason || '未填写原因'}`
          : '未撤销'
      }
    ]
  })
  const attachmentUrl = computed(() => record.value?.attachmentUrl || '')

  const dictStatusLabel = (status: string): string =>
    userStore.getDictLabelByValue(
      entity.value === 'contract' ? 'hrContractStatus' : 'hrQualificationVerificationStatus',
      status,
      status ?? '--'
    )
  const actorText = (event: Api.Hr.ComplianceEvent): string =>
    event.actor?.employeeName || event.createBy || '系统自动处理'
  const eventTone = (type: string): TimelineItemProps['type'] =>
    ['activated', 'renewed', 'verified'].includes(type)
      ? 'success'
      : ['terminated', 'verification_rejected', 'revoked'].includes(type)
        ? 'danger'
        : ['renewal_started'].includes(type)
          ? 'warning'
          : 'primary'

  const handleOpen = async (targetEntity: Entity, id: string): Promise<void> => {
    entity.value = targetEntity
    openDetail(id)
    await drawerRef.value?.handleOpen(undefined, {
      title: targetEntity === 'contract' ? '劳动合同详情' : '员工资质详情',
      subtitle: '查看权威资料、责任信息与完整审计轨迹',
      size: 'lg',
      showFooter: false,
      contentHeight: 'calc(100vh - 116px)',
      onOpen: () => loadDetail(id),
      onClose: () => openDetail('')
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .compliance-detail {
    display: grid;
    gap: 16px;
    min-width: 0;
    padding-bottom: 4px;

    &__hero {
      display: flex;
      gap: 18px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 18px;
      background:
        radial-gradient(
          circle at 92% 12%,
          color-mix(in srgb, var(--theme-color) 12%, transparent),
          transparent 34%
        ),
        color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
    }

    &__identity {
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      min-width: 0;

      small {
        font-size: 11px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.04em;
      }

      h3 {
        margin: 4px 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 18px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      p {
        margin: 5px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__hero-icon {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      font-size: 22px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 11%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, transparent);
      border-radius: var(--art-surface-radius);
    }

    &__status {
      display: flex;
      flex: 0 0 auto;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
    }

    &__summary {
      padding: 4px 16px;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      dl {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin: 0;
      }

      dl > div {
        display: grid;
        min-width: 0;
        padding: 13px 12px;
      }

      dl > div:not(:first-child) {
        border-left: 1px solid var(--art-card-border);
      }

      dt,
      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 5px 0 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        font-weight: 650;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__section {
      padding: 17px;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      > header {
        display: flex;
        gap: 9px;
        align-items: center;
        margin-bottom: 14px;
      }

      > header > :deep(.art-svg-icon) {
        font-size: 18px;
        color: var(--theme-color);
      }

      > header div {
        display: grid;
      }

      > header strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      > header small {
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      margin: 0;
      overflow: hidden;
      background: var(--art-card-border);
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);

      > div {
        display: grid;
        grid-template-columns: 108px minmax(0, 1fr);
        gap: 10px;
        padding: 11px 12px;
        background: var(--default-box-color);
      }

      dt {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 12px;
        color: var(--el-text-color-primary);
        overflow-wrap: anywhere;
      }
    }

    &__attachment {
      display: inline-flex;
      gap: 7px;
      align-items: center;
      min-height: 34px;
      padding: 0 10px;
      margin-top: 12px;
      color: var(--theme-color);
      text-decoration: none;
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    &__attachment:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }

    &__timeline {
      padding-top: 4px;

      article {
        display: grid;
        gap: 6px;
      }

      article > div {
        display: flex;
        gap: 8px;
        align-items: baseline;
        justify-content: space-between;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      article span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      article small {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        width: fit-content;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      p {
        padding: 8px 10px;
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-regular);
        white-space: pre-wrap;
        background: var(--art-gray-100);
        border-radius: var(--el-border-radius-base);
      }
    }
  }

  @media only screen and (width <= 767px) {
    .compliance-detail {
      &__hero {
        flex-direction: column;
      }

      &__status {
        justify-content: flex-start;
      }

      &__summary dl,
      &__facts {
        grid-template-columns: 1fr;
      }

      &__summary dl > div:not(:first-child) {
        border-top: 1px solid var(--art-card-border);
        border-left: 0;
      }

      &__facts > div {
        grid-template-columns: 96px minmax(0, 1fr);
      }
    }
  }
</style>
