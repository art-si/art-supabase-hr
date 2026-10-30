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
      <div v-if="record" class="benefit-detail">
        <section class="benefit-detail__hero" aria-labelledby="benefit-detail-title">
          <div class="benefit-detail__identity">
            <span
              aria-hidden="true"
              class="grid size-[46px] place-items-center text-[var(--theme-color)] rounded-[var(--el-border-radius-base)]"
            >
              <ArtSvgIcon :icon="hero.icon" />
            </span>
            <div>
              <small>{{ hero.eyebrow }}</small>
              <h3 id="benefit-detail-title">{{ hero.title }}</h3>
              <p>{{ hero.subtitle }}</p>
            </div>
          </div>
          <ElTag type="primary" effect="plain" round>{{ hero.status }}</ElTag>
        </section>

        <div v-if="restrictedMessage" class="benefit-detail__restricted" role="status">
          <ArtSvgIcon icon="ri:lock-2-line" />
          <div
            ><strong>敏感福利信息已隐藏</strong><p>{{ restrictedMessage }}</p></div
          >
        </div>

        <section class="benefit-detail__summary" aria-label="福利记录摘要">
          <dl>
            <div v-for="item in summaryItems" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
              <small>{{ item.hint }}</small>
            </div>
          </dl>
        </section>

        <section v-if="isPlan" class="benefit-detail__section">
          <header>
            <ArtSvgIcon icon="ri:stack-line" />
            <div
              ><strong>覆盖方案与缴费规则</strong
              ><small>员工参保时复制当前规则形成历史快照</small></div
            >
            <ArtButtonTable
              v-auth="'Hr:Benefits:Amount:Edit'"
              type="add"
              button-text="新增方案"
              permission="Hr:Benefits:Plan:Manage"
              @click="emitAddOption"
            />
          </header>
          <div v-if="planRecord.options?.length" class="benefit-detail__options">
            <article v-for="option in planRecord.options" :key="option.id">
              <span><ArtSvgIcon icon="ri:shield-check-line" /></span>
              <div>
                <div
                  ><strong>{{ option.optionName }}</strong
                  ><ElTag size="small" effect="plain">{{ option.optionCode }}</ElTag></div
                >
                <p
                  >{{
                    userStore.getDictLabelByValue(
                      'hrBenefitCoverageLevel',
                      option.coverageLevel,
                      option.coverageLevel ?? '--'
                    )
                  }}
                  · {{ contributionText(option) }}</p
                >
                <small>{{ option.description || '未填写方案说明' }}</small>
              </div>
              <ArtButtonTable
                v-auth="'Hr:Benefits:Amount:Edit'"
                type="edit"
                permission="Hr:Benefits:Plan:Manage"
                @click="$emit('edit-option', planRecord, option)"
              />
            </article>
          </div>
          <ArtEmptyState
            v-else
            title="尚未配置覆盖方案"
            description="配置方案后，计划才能生效。"
            size="compact"
            :visual-size="64"
          />
        </section>

        <section v-if="isEnrollment" class="benefit-detail__section">
          <header>
            <ArtSvgIcon icon="ri:money-cny-circle-line" />
            <div
              ><strong>参保与薪资边界</strong><small>审核后的缴费快照仅作为薪资受控输入</small></div
            >
          </header>
          <dl class="benefit-detail__narrative">
            <div
              ><dt>保障方案</dt><dd>{{ enrollmentRecord.option?.optionName || '--' }}</dd></div
            >
            <div
              ><dt>人生事件</dt><dd>{{ lifeEventText }}</dd></div
            >
            <div
              ><dt>薪资同步</dt
              ><dd>{{
                userStore.getDictLabelByValue(
                  'hrBenefitPayrollSyncStatus',
                  enrollmentRecord.payrollSyncStatus,
                  enrollmentRecord.payrollSyncStatus ?? '--'
                )
              }}</dd></div
            >
            <div
              ><dt>审核信息</dt
              ><dd
                >{{ enrollmentRecord.approvedBy || '尚未审核' }} ·
                {{ formatDateTime(enrollmentRecord.approvedAt) }}</dd
              ></div
            >
          </dl>
        </section>

        <section v-if="isLifeEvent" class="benefit-detail__section">
          <header>
            <ArtSvgIcon icon="ri:file-shield-2-line" />
            <div
              ><strong>证明材料与关联参保</strong
              ><small>材料查看独立授权，避免普通福利经办权限扩大</small></div
            >
          </header>
          <div v-if="lifeEventRecord.evidenceUrls?.length" class="benefit-detail__attachments">
            <a
              v-for="(url, index) in lifeEventRecord.evidenceUrls"
              :key="url"
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
              ><ArtSvgIcon icon="ri:attachment-2" />证明材料 {{ index + 1
              }}<ArtSvgIcon icon="ri:external-link-line"
            /></a>
          </div>
          <ArtEmptyState
            v-else
            :title="
              lifeEventRecord.evidenceRestricted ? '当前权限不可查看证明材料' : '未上传证明材料'
            "
            :description="
              lifeEventRecord.evidenceRestricted
                ? '请联系具备证明材料查看权限的管理员。'
                : '补充证明材料后可在此查看。'
            "
            size="compact"
            :visual-size="64"
          />
          <div v-if="lifeEventRecord.enrollments?.length" class="benefit-detail__linked">
            <article v-for="item in lifeEventRecord.enrollments" :key="item.id">
              <strong>{{ item.planName }}</strong
              ><span>{{ item.optionName }}</span>
              <ElTag size="small" effect="plain">{{
                userStore.getDictLabelByValue(
                  'hrBenefitEnrollmentStatus',
                  item.status,
                  item.status ?? '--'
                )
              }}</ElTag>
            </article>
          </div>
        </section>

        <section class="benefit-detail__section">
          <header>
            <ArtSvgIcon icon="ri:history-line" />
            <div
              ><strong>不可变福利轨迹</strong
              ><small>计划、参保与人生事件的关键动作均保留审计记录</small></div
            >
          </header>
          <ElTimeline v-if="auditEvents.length" class="benefit-detail__timeline">
            <ElTimelineItem
              v-for="event in auditEvents"
              :key="event.id"
              :type="eventTone(event.eventType)"
              :timestamp="formatDateTime(event.createTime)"
              placement="top"
            >
              <article>
                <div
                  ><strong>{{ event.summary }}</strong
                  ><span>{{ event.actorName || '系统自动处理' }}</span></div
                >
                <small v-if="event.fromStatus || event.toStatus">
                  {{ event.fromStatus || '初始状态' }}<ArtSvgIcon icon="ri:arrow-right-line" />{{
                    event.toStatus || '状态未变更'
                  }}
                </small>
              </article>
            </ElTimelineItem>
          </ElTimeline>
          <ArtEmptyState
            v-else
            title="暂无审计记录"
            description="操作记录产生后会显示在此。"
            size="compact"
            :visual-size="64"
          />
        </section>
      </div>
    </ArtAsyncState>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { formatCurrencyCodeValue } from '@/utils/ui/format'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import type { TimelineItemProps } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { createDateTimeFormatter, formatDateTimeValue as formatDateTime } from '@/utils/ui/format'
  import { useUserStore } from '@/store/modules/user'
  import { fetchBenefitDetail } from '@hr/api'

  interface DisplayItem {
    label: string
    value: string
    hint: string
  }

  const emit = defineEmits<{
    'add-option': [plan: Api.Hr.BenefitPlan]
    'edit-option': [plan: Api.Hr.BenefitPlan, option: Api.Hr.BenefitOption]
  }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const {
    detail: record,
    loading,
    missing,
    loadError,
    loadDetail,
    openDetail,
    retryLoad
  } = useDetailRecord<Api.Hr.BenefitRecord>(
    (id) => fetchBenefitDetail(activeEntity.value, id),
    '福利详情暂时无法加载，请重新加载'
  )
  onBeforeUnmount(() => openDetail(''))
  const activeEntity = ref<Api.Hr.BenefitEntity>('plan')
  const userStore = useUserStore()

  const isPlan = computed(() => activeEntity.value === 'plan')
  const isEnrollment = computed(() => activeEntity.value === 'enrollment')
  const isLifeEvent = computed(() => activeEntity.value === 'event')
  const planRecord = computed(() => record.value as Api.Hr.BenefitPlan)
  const enrollmentRecord = computed(() => record.value as Api.Hr.BenefitEnrollment)
  const lifeEventRecord = computed(() => record.value as Api.Hr.BenefitLifeEvent)
  const auditEvents = computed(() => record.value?.events ?? [])

  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD' })

  const hero = computed(() => {
    if (isPlan.value)
      return {
        icon: 'ri:heart-pulse-line',
        eyebrow: planRecord.value.planCode,
        title: planRecord.value.planName,
        subtitle: planRecord.value.providerName || '未维护服务机构',
        status: userStore.getDictLabelByValue(
          'hrBenefitPlanStatus',
          planRecord.value.status,
          planRecord.value.status ?? '--'
        )
      }
    if (isEnrollment.value)
      return {
        icon: 'ri:user-heart-line',
        eyebrow: enrollmentRecord.value.enrollmentNo,
        title: enrollmentRecord.value.employee?.employeeName || '员工参保',
        subtitle: `${enrollmentRecord.value.plan?.planName || '--'} · ${enrollmentRecord.value.option?.optionName || '--'}`,
        status: userStore.getDictLabelByValue(
          'hrBenefitEnrollmentStatus',
          enrollmentRecord.value.status,
          enrollmentRecord.value.status ?? '--'
        )
      }
    return {
      icon: 'ri:calendar-event-line',
      eyebrow: formatDate(lifeEventRecord.value.eventDate),
      title: userStore.getDictLabelByValue(
        'hrBenefitLifeEventType',
        lifeEventRecord.value.eventType,
        lifeEventRecord.value.eventType ?? '--'
      ),
      subtitle: `${lifeEventRecord.value.employee?.employeeName || '--'} · 窗口截至 ${formatDate(lifeEventRecord.value.enrollmentWindowEnd)}`,
      status: userStore.getDictLabelByValue(
        'hrBenefitLifeEventStatus',
        lifeEventRecord.value.status,
        lifeEventRecord.value.status ?? '--'
      )
    }
  })

  const restrictedMessage = computed(() => {
    if (
      (isPlan.value || isEnrollment.value) &&
      record.value &&
      'amountVisible' in record.value &&
      !record.value.amountVisible
    ) {
      return '当前权限可查看保障状态，但员工与雇主缴费金额已由服务端隐藏。'
    }
    if (isLifeEvent.value && lifeEventRecord.value.evidenceRestricted) {
      return '当前权限可查看事件与窗口，但证明材料地址已由服务端隐藏。'
    }
    return ''
  })

  const summaryItems = computed<DisplayItem[]>(() => {
    if (isPlan.value)
      return [
        {
          label: '计划类型',
          value: userStore.getDictLabelByValue(
            'hrBenefitPlanType',
            planRecord.value.planType,
            planRecord.value.planType ?? '--'
          ),
          hint: userStore.getDictLabelByValue(
            'hrBenefitEnrollmentMethod',
            planRecord.value.enrollmentMethod,
            planRecord.value.enrollmentMethod ?? '--'
          )
        },
        {
          label: '有效期',
          value: formatDate(planRecord.value.effectiveFrom),
          hint: `至 ${formatDate(planRecord.value.effectiveTo)}`
        },
        {
          label: '覆盖方案',
          value: `${planRecord.value.options?.length ?? 0} 项`,
          hint: '至少一项后可生效'
        },
        {
          label: '在保员工',
          value: `${planRecord.value.activeEnrollmentCount ?? 0} 人`,
          hint: '当前生效参保'
        }
      ]
    if (isEnrollment.value)
      return [
        {
          label: '员工',
          value: enrollmentRecord.value.employee?.employeeName || '--',
          hint: enrollmentRecord.value.employee?.employeeNo || '--'
        },
        {
          label: '保障期',
          value: formatDate(enrollmentRecord.value.coverageFrom),
          hint: `至 ${formatDate(enrollmentRecord.value.coverageTo)}`
        },
        {
          label: '员工缴费',
          value: formatCurrencyCodeValue(
            enrollmentRecord.value.employeeContribution,
            enrollmentRecord.value.currencyCode
          ),
          hint: '月度缴费快照'
        },
        {
          label: '雇主缴费',
          value: formatCurrencyCodeValue(
            enrollmentRecord.value.employerContribution,
            enrollmentRecord.value.currencyCode
          ),
          hint: '月度雇主成本'
        }
      ]
    return [
      {
        label: '员工',
        value: lifeEventRecord.value.employee?.employeeName || '--',
        hint: lifeEventRecord.value.employee?.employeeNo || '--'
      },
      {
        label: '事件日期',
        value: formatDate(lifeEventRecord.value.eventDate),
        hint: userStore.getDictLabelByValue(
          'hrBenefitLifeEventType',
          lifeEventRecord.value.eventType,
          lifeEventRecord.value.eventType ?? '--'
        )
      },
      {
        label: '窗口截止',
        value: formatDate(lifeEventRecord.value.enrollmentWindowEnd),
        hint: lifeEventRecord.value.dueStatus === 'expired' ? '窗口已过期' : '可办理参保变更'
      },
      {
        label: '关联参保',
        value: `${lifeEventRecord.value.enrollments?.length ?? 0} 项`,
        hint: '由本事件触发'
      }
    ]
  })
  const lifeEventText = computed(() =>
    enrollmentRecord.value.lifeEvent
      ? `${userStore.getDictLabelByValue('hrBenefitLifeEventType', enrollmentRecord.value.lifeEvent.eventType, enrollmentRecord.value.lifeEvent.eventType ?? '--')} · ${formatDate(enrollmentRecord.value.lifeEvent.eventDate)}`
      : '未关联人生事件'
  )
  const contributionText = (option: Api.Hr.BenefitOption): string => {
    if (!planRecord.value.amountVisible) return '缴费金额权限受限'
    if (option.contributionType === 'salary_rate') {
      return `员工 ${(Number(option.employeeRate || 0) * 100).toFixed(2)}% · 雇主 ${(Number(option.employerRate || 0) * 100).toFixed(2)}%`
    }
    return `员工 ${formatCurrencyCodeValue(option.employeeContribution, planRecord.value.currencyCode)} · 雇主 ${formatCurrencyCodeValue(option.employerContribution, planRecord.value.currencyCode)}`
  }
  const eventTone = (type: string): TimelineItemProps['type'] =>
    ['activated', 'approved', 'processed'].includes(type)
      ? 'success'
      : ['cancelled', 'deactivated', 'ended'].includes(type)
        ? 'warning'
        : 'primary'

  const emitAddOption = (): void => emit('add-option', planRecord.value)
  const refresh = retryLoad
  const handleOpen = async (entity: Api.Hr.BenefitEntity, id: string): Promise<void> => {
    activeEntity.value = entity
    openDetail(id)
    await drawerRef.value?.handleOpen(undefined, {
      title: '福利与参保详情',
      subtitle: '查看计划、员工保障、人生事件与审计轨迹',
      size: 'lg',
      showFooter: false,
      contentHeight: 'calc(100vh - 116px)',
      onOpen: () => loadDetail(id),
      onClose: () => openDetail('')
    })
  }

  defineExpose({ handleOpen, refresh })
</script>

<style scoped lang="scss">
  .benefit-detail {
    display: grid;
    gap: 16px;
    min-width: 0;
    padding-bottom: 4px;

    &__hero {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 18px;
      background: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 16%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
    }

    &__identity {
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr);
      gap: 13px;
      align-items: center;
      min-width: 0;

      > span {
        background: color-mix(in srgb, var(--theme-color) 12%, transparent);
      }

      div {
        min-width: 0;
      }

      small {
        font-size: 11px;
        font-weight: 700;
        color: var(--theme-color);
      }

      h3 {
        margin: 3px 0 0;
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

    &__restricted {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 11px;
      padding: 13px 15px;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-7);
      border-radius: var(--el-border-radius-base);

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
      }
    }

    &__summary dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      margin: 0;
      overflow: hidden;
      background: var(--art-card-border);
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);

      div {
        min-width: 0;
        padding: 13px;
        background: var(--default-box-color);
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
        font-weight: 700;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__section {
      padding: 16px;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      > header {
        display: flex;
        gap: 9px;
        align-items: flex-start;
        margin-bottom: 14px;

        > :deep(.art-svg-icon) {
          margin-top: 1px;
          font-size: 18px;
          color: var(--theme-color);
        }

        > div {
          display: grid;
          min-width: 0;
          margin-right: auto;
        }

        strong {
          color: var(--el-text-color-primary);
        }

        small {
          margin-top: 2px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__options {
      display: grid;
      gap: 8px;

      article {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 12px;
        background: var(--art-gray-100);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 10%, transparent);
          border-radius: var(--el-border-radius-small);
        }

        > div > div {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        p {
          margin: 4px 0;
          font-size: 12px;
          color: var(--el-text-color-regular);
        }

        small {
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__narrative {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 0;

      div {
        min-width: 0;
        padding: 12px;
        background: var(--art-gray-100);
        border-radius: var(--el-border-radius-base);
      }

      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 6px 0 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }
    }

    &__attachments,
    &__linked {
      display: grid;
      gap: 8px;
    }

    &__attachments a,
    &__linked article {
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 38px;
      padding: 0 11px;
      color: var(--el-text-color-primary);
      text-decoration: none;
      background: var(--art-gray-100);
      border-radius: var(--el-border-radius-small);
    }

    &__linked {
      margin-top: 10px;
    }

    &__linked article span {
      flex: 1;
      color: var(--el-text-color-secondary);
    }

    &__timeline article > div {
      display: flex;
      gap: 10px;
      justify-content: space-between;
    }

    &__timeline article span,
    &__timeline article small {
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }
  }

  @media only screen and (width <= 767px) {
    .benefit-detail {
      &__hero {
        flex-direction: column;
      }

      &__summary dl,
      &__narrative {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__options article {
        grid-template-columns: 34px minmax(0, 1fr);
      }

      &__options article > :last-child {
        grid-column: 2;
        justify-self: start;
      }
    }
  }
</style>
