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
      <div v-if="record" class="employee-relation-detail">
        <section class="employee-relation-detail__hero" aria-labelledby="employee-relation-title">
          <div class="employee-relation-detail__identity">
            <span aria-hidden="true"><ArtSvgIcon icon="ri:shield-user-line" /></span>
            <div>
              <small>{{ record.caseNo }}</small>
              <h3 id="employee-relation-title">{{ record.title }}</h3>
              <p>{{ subjectIdentity }}</p>
            </div>
          </div>
          <div class="employee-relation-detail__status">
            <ElTag :type="severityTone" effect="light" round>
              {{
                userStore.getDictLabelByValue(
                  'hrEmployeeRelationSeverity',
                  record.severity,
                  record.severity ?? '--'
                )
              }}风险
            </ElTag>
            <ElTag type="primary" effect="plain" round>
              {{
                userStore.getDictLabelByValue(
                  'hrEmployeeRelationCaseStatus',
                  record.status,
                  record.status ?? '--'
                )
              }}
            </ElTag>
          </div>
        </section>

        <div
          v-if="record.sensitiveRestricted"
          class="employee-relation-detail__restricted"
          role="status"
        >
          <ArtSvgIcon icon="ri:lock-2-line" />
          <div>
            <strong>敏感内容已由服务端脱敏</strong>
            <p
              >当前权限只能查看案件状态、本人相关信息和处置进度，报告事实、调查发现、附件与报告人信息不可见。</p
            >
          </div>
        </div>

        <section class="employee-relation-detail__summary" aria-label="案件控制摘要">
          <dl>
            <div v-for="item in summaryItems" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
              <small>{{ item.hint }}</small>
            </div>
          </dl>
        </section>

        <section class="employee-relation-detail__section">
          <header>
            <ArtSvgIcon icon="ri:flow-chart" />
            <div><strong>案件控制阶段</strong><small>从受理到结案的当前进度与控制边界</small></div>
          </header>
          <ol class="employee-relation-detail__rail" aria-label="案件处理阶段">
            <li v-for="(stage, index) in lifecycleStages" :key="stage.status" :class="stage.state">
              <span>{{ index + 1 }}</span>
              <div
                ><strong>{{ stage.label }}</strong
                ><small>{{ stage.hint }}</small></div
              >
            </li>
          </ol>
        </section>

        <section v-if="!record.sensitiveRestricted" class="employee-relation-detail__section">
          <header>
            <ArtSvgIcon icon="ri:file-search-line" />
            <div
              ><strong>调查与解决资料</strong><small>仅向具有敏感查看权限的授权人员展示</small></div
            >
          </header>
          <dl class="employee-relation-detail__narrative">
            <div>
              <dt>报告事实</dt>
              <dd>{{ record.allegationSummary || '--' }}</dd>
            </div>
            <div>
              <dt>调查发现</dt>
              <dd>{{ record.findingsSummary || '尚未形成调查发现' }}</dd>
            </div>
            <div>
              <dt>解决摘要</dt>
              <dd>{{ record.resolutionSummary || '尚未提交解决结论' }}</dd>
            </div>
          </dl>
          <div v-if="record.attachmentUrls?.length" class="employee-relation-detail__attachments">
            <a
              v-for="(url, index) in record.attachmentUrls"
              :key="url"
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ArtSvgIcon icon="ri:attachment-2" />案件附件 {{ index + 1 }}
              <ArtSvgIcon icon="ri:external-link-line" />
            </a>
          </div>
        </section>

        <section class="employee-relation-detail__section">
          <header>
            <ArtSvgIcon icon="ri:route-line" />
            <div
              ><strong>纠正与跟进行动</strong
              ><small>行动只记录建议、责任人与结果，不直接变更任职状态</small></div
            >
          </header>
          <div v-if="record.actions?.length" class="employee-relation-detail__actions">
            <article v-for="action in record.actions" :key="action.id">
              <span :class="`is-${action.status}`"
                ><ArtSvgIcon icon="ri:checkbox-blank-circle-fill"
              /></span>
              <div>
                <div>
                  <strong>{{ action.title }}</strong>
                  <ElTag effect="plain" size="small">
                    {{
                      userStore.getDictLabelByValue(
                        'commonActionProgressStatus',
                        action.status,
                        action.status ?? '--'
                      )
                    }}
                  </ElTag>
                </div>
                <p>
                  {{
                    userStore.getDictLabelByValue(
                      'hrEmployeeRelationActionType',
                      action.actionType,
                      action.actionType ?? '--'
                    )
                  }}
                  · {{ action.ownerEmployee?.employeeName || '未指定负责人' }} · 截止
                  {{ formatDate(action.dueDate) }}
                </p>
                <small v-if="action.completionNote">{{ action.completionNote }}</small>
              </div>
            </article>
          </div>
          <ArtEmptyState
            v-else
            title="暂无处置行动"
            description="添加处置行动后，可在此跟踪进展。"
            size="compact"
            :visual-size="64"
          />
        </section>

        <section class="employee-relation-detail__section">
          <header>
            <ArtSvgIcon icon="ri:history-line" />
            <div
              ><strong>不可变案件轨迹</strong
              ><small>状态变更、分派、行动和说明均保留审计记录</small></div
            >
          </header>
          <ElTimeline v-if="record.events?.length" class="employee-relation-detail__timeline">
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
                      'hrEmployeeRelationEventType',
                      event.eventType,
                      event.eventType ?? '--'
                    )
                  }}</strong>
                  <span>{{ event.actor?.employeeName || event.createBy || '系统自动处理' }}</span>
                </div>
                <small v-if="event.fromStatus || event.toStatus">
                  {{
                    event.fromStatus
                      ? userStore.getDictLabelByValue(
                          'hrEmployeeRelationCaseStatus',
                          event.fromStatus,
                          event.fromStatus ?? '--'
                        )
                      : '初始状态'
                  }}
                  <ArtSvgIcon icon="ri:arrow-right-line" />
                  {{
                    event.toStatus
                      ? userStore.getDictLabelByValue(
                          'hrEmployeeRelationCaseStatus',
                          event.toStatus,
                          event.toStatus ?? '--'
                        )
                      : '状态未变更'
                  }}
                </small>
                <p v-if="event.comment">{{ event.comment }}</p>
              </article>
            </ElTimelineItem>
          </ElTimeline>
          <ArtEmptyState
            v-else
            title="暂无案件审计记录"
            description="案件状态或内容变更后，会在此留下记录。"
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
  import { fetchEmployeeRelationCaseDetail } from '@hr/api'

  interface DisplayItem {
    label: string
    value: string
    hint: string
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
  } = useDetailRecord<Api.Hr.EmployeeRelationCase>(
    fetchEmployeeRelationCaseDetail,
    '案件详情暂时无法加载，请重新加载'
  )
  onBeforeUnmount(() => openDetail(''))
  const userStore = useUserStore()

  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD' })
  const subjectIdentity = computed(
    () =>
      `${record.value?.subjectEmployee?.employeeName || '未关联员工'} · ${record.value?.subjectEmployee?.employeeNo || '未维护工号'} · ${record.value?.subjectEmployee?.positionName || record.value?.subjectEmployee?.jobTitle || '未维护岗位'}`
  )
  const severityTone = computed<TagProps['type']>(() =>
    record.value?.severity === 'critical'
      ? 'danger'
      : record.value?.severity === 'high'
        ? 'warning'
        : record.value?.severity === 'low'
          ? 'info'
          : 'primary'
  )
  const dueHint = computed(() => {
    if (!record.value?.targetResolutionDate) return '尚未完成分级'
    if (record.value.dueStatus === 'overdue') return '目标日期已逾期'
    if (record.value.dueStatus === 'due_soon') return '目标日期临近'
    return '目标日期处于计划内'
  })
  const summaryItems = computed<DisplayItem[]>(() => [
    {
      label: '案件类型',
      value: userStore.getDictLabelByValue(
        'hrEmployeeRelationCaseType',
        record.value?.caseType,
        record.value?.caseType ?? '--'
      ),
      hint: userStore.getDictLabelByValue(
        'hrEmployeeRelationSource',
        record.value?.source,
        record.value?.source ?? '--'
      )
    },
    {
      label: '案件负责人',
      value: record.value?.ownerEmployee?.employeeName || '尚未分派',
      hint: record.value?.ownerEmployee?.employeeNo || '完成分级时指定'
    },
    {
      label: '目标解决日',
      value: formatDate(record.value?.targetResolutionDate),
      hint: dueHint.value
    },
    {
      label: '开放行动',
      value: `${(record.value?.actions ?? []).filter((item) => ['planned', 'in_progress'].includes(item.status)).length} 项`,
      hint: `${record.value?.actions?.length ?? 0} 项行动总计`
    }
  ])

  const lifecycleOrder: Api.Hr.EmployeeRelationCaseStatus[] = [
    'reported',
    'triaged',
    'investigating',
    'action_required',
    'resolved',
    'closed'
  ]
  const lifecycleStages = computed(() => {
    const currentIndex = lifecycleOrder.indexOf(record.value?.status ?? 'reported')
    return [
      { status: 'reported', label: '保密受理', hint: '报告事实与来源建档' },
      { status: 'triaged', label: '分派分级', hint: '责任人与目标日期' },
      { status: 'investigating', label: '事实调查', hint: '证据与调查发现' },
      { status: 'action_required', label: '纠正行动', hint: '负责人、期限与成果' },
      { status: 'resolved', label: '解决结案', hint: '结论确认与审计封存' }
    ].map((stage, index) => ({
      ...stage,
      state:
        record.value?.status === 'cancelled'
          ? 'is-cancelled'
          : index < currentIndex || record.value?.status === 'closed'
            ? 'is-complete'
            : index === currentIndex
              ? 'is-current'
              : ''
    }))
  })
  const eventTone = (type: string): TimelineItemProps['type'] =>
    ['resolved', 'closed', 'action_completed'].includes(type)
      ? 'success'
      : ['cancelled', 'action_cancelled'].includes(type)
        ? 'danger'
        : ['reported', 'action_required', 'reopened'].includes(type)
          ? 'warning'
          : 'primary'

  const handleOpen = async (id: string): Promise<void> => {
    openDetail(id)
    await drawerRef.value?.handleOpen(undefined, {
      title: '员工关系案件详情',
      subtitle: '查看权限范围内的案件事实、处置行动与审计轨迹',
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
  .employee-relation-detail {
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
      background:
        radial-gradient(
          circle at 95% 5%,
          color-mix(in srgb, var(--theme-color) 10%, transparent),
          transparent 34%
        ),
        color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
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
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 12%, transparent);
        border-radius: var(--el-border-radius-base);
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

    &__status {
      display: flex;
      flex: 0 0 auto;
      gap: 7px;
      align-items: center;
    }

    &__restricted {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 11px;
      align-items: start;
      padding: 13px 15px;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-7);
      border-radius: var(--el-border-radius-base);

      > :deep(.art-svg-icon) {
        margin-top: 2px;
        font-size: 20px;
      }

      strong {
        color: var(--el-text-color-primary);
      }

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

        div {
          display: grid;
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

    &__rail {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        min-width: 0;
        padding: 10px;
        background: var(--art-gray-100);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          font-size: 11px;
          font-weight: 700;
          color: var(--el-text-color-secondary);
          background: var(--art-gray-200);
          border-radius: 50%;
        }

        div {
          display: grid;
          min-width: 0;
        }

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 12px;
          color: var(--el-text-color-primary);
        }

        small {
          margin-top: 3px;
          font-size: 10px;
          color: var(--el-text-color-secondary);
        }

        &.is-complete,
        &.is-current {
          background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));

          > span {
            color: var(--theme-color);
            background: color-mix(in srgb, var(--theme-color) 13%, transparent);
          }
        }

        &.is-current {
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 30%, transparent);
        }
      }
    }

    &__narrative {
      display: grid;
      gap: 13px;
      margin: 0;

      div {
        display: grid;
        gap: 5px;
      }

      dt {
        font-size: 11px;
        font-weight: 700;
        color: var(--theme-color);
      }

      dd {
        margin: 0;
        font-size: 13px;
        line-height: 1.7;
        color: var(--el-text-color-primary);
        white-space: pre-wrap;
      }
    }

    &__attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;

      a {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        min-height: 30px;
        padding: 0 10px;
        font-size: 12px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 7%, transparent);
        border-radius: var(--el-border-radius-base);
      }
    }

    &__actions {
      display: grid;
      gap: 8px;

      article {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 8px;
        padding: 11px 12px;
        background: var(--art-gray-100);
        border-radius: var(--el-border-radius-base);

        > span {
          margin-top: 3px;
          font-size: 9px;
          color: var(--el-text-color-secondary);

          &.is-in_progress {
            color: var(--theme-color);
          }

          &.is-completed {
            color: var(--el-color-success);
          }

          &.is-cancelled {
            color: var(--el-text-color-secondary);
          }
        }

        > div > div {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
        }

        strong {
          color: var(--el-text-color-primary);
        }

        p,
        small {
          margin: 4px 0 0;
          font-size: 11px;
          line-height: 1.5;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__timeline {
      :deep(.el-timeline-item__wrapper) {
        padding-left: 20px;
      }

      article > div {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
      }

      article strong {
        color: var(--el-text-color-primary);
      }

      article span,
      article small,
      article p {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      article small {
        display: flex;
        gap: 5px;
        align-items: center;
        margin-top: 5px;
      }

      article p {
        margin: 6px 0 0;
        line-height: 1.55;
      }
    }
  }

  @media only screen and (width <= 900px) {
    .employee-relation-detail {
      &__summary dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__rail {
        grid-template-columns: 1fr;
      }
    }
  }

  @media only screen and (width <= 767px) {
    .employee-relation-detail {
      &__hero {
        flex-direction: column;
      }

      &__summary dl {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
