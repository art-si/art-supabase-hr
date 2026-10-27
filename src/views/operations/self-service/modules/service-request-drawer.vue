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
      <div v-if="request" class="service-request-drawer">
        <section class="service-request-drawer__hero" aria-labelledby="service-request-title">
          <div>
            <span>{{ request.requestNo }}</span>
            <h3 id="service-request-title">{{ request.title }}</h3>
            <p>{{ request.service?.name || '历史员工申请' }}</p>
          </div>
          <div class="service-request-drawer__hero-status">
            <ElTag :type="statusType(request.status)" effect="light" round>
              {{
                userStore.getDictLabelByValue(
                  'hrServiceRequestStatus',
                  request.status,
                  request.status ?? '--'
                )
              }}
            </ElTag>
            <ElTag :type="slaType(resolvedSlaStatus(request))" effect="plain" round>
              {{ slaLabel(resolvedSlaStatus(request)) }}
            </ElTag>
          </div>
        </section>

        <section class="service-request-drawer__summary" aria-label="工单交付摘要">
          <dl>
            <div>
              <dt>申请员工</dt>
              <dd>{{ request.requester?.name || '--' }}</dd>
              <small>{{ request.requester?.code || '未关联工号' }}</small>
            </div>
            <div>
              <dt>处理人</dt>
              <dd>{{ request.assignee?.name || '待分派' }}</dd>
              <small>{{ request.service?.routingGroup || 'HR 服务台' }}</small>
            </div>
            <div>
              <dt>解决时限</dt>
              <dd>{{ formatDateTime(request.resolutionDueAt) }}</dd>
              <small>{{
                request.waitingStartedAt ? 'SLA 暂停中' : slaLabel(resolvedSlaStatus(request))
              }}</small>
            </div>
            <div>
              <dt>优先级</dt>
              <dd>{{
                userStore.getDictLabelByValue(
                  'hrServicePriority',
                  request.priority,
                  request.priority ?? '--'
                )
              }}</dd>
              <small>{{
                userStore.getDictLabelByValue(
                  'hrServiceChannel',
                  request.channel,
                  request.channel ?? '--'
                )
              }}</small>
            </div>
          </dl>
        </section>

        <section class="service-request-drawer__section">
          <header>
            <ArtSvgIcon icon="ri:file-text-line" />
            <div><strong>问题与处理结果</strong><small>员工诉求和 HR 最终交付结论</small></div>
          </header>
          <div class="service-request-drawer__narrative">
            <div
              ><span>问题说明</span><p>{{ request.reason }}</p></div
            >
            <div v-if="request.waitingReason" class="is-warning">
              <span>待补充内容</span><p>{{ request.waitingReason }}</p>
            </div>
            <div v-if="request.resolution" class="is-success">
              <span>解决结果</span><p>{{ request.resolution }}</p>
            </div>
          </div>
        </section>

        <section v-if="request.attachmentUrls.length" class="service-request-drawer__section">
          <header>
            <ArtSvgIcon icon="ri:attachment-2" />
            <div><strong>工单附件</strong><small>仅访问已授权的业务文件</small></div>
          </header>
          <ul class="service-request-drawer__attachments">
            <li v-for="(url, index) in request.attachmentUrls" :key="url">
              <a :href="url" target="_blank" rel="noopener noreferrer">
                <ArtSvgIcon icon="ri:file-transfer-line" />
                附件 {{ index + 1 }}
                <ArtSvgIcon icon="ri:external-link-line" />
              </a>
            </li>
          </ul>
        </section>

        <section class="service-request-drawer__section">
          <header>
            <ArtSvgIcon icon="ri:history-line" />
            <div><strong>服务交付记录</strong><small>状态、分派和沟通均不可变留痕</small></div>
          </header>
          <ElTimeline v-if="request.events?.length" class="service-request-drawer__timeline">
            <ElTimelineItem
              v-for="event in request.events"
              :key="event.id"
              :type="eventTone(event.eventType)"
              :timestamp="formatDateTime(event.createTime)"
              placement="top"
            >
              <article>
                <strong>{{ eventLabel(event.eventType) }}</strong>
                <span>{{ event.actor?.name || event.createBy || '系统' }}</span>
                <p v-if="event.comment">{{ event.comment }}</p>
              </article>
            </ElTimelineItem>
          </ElTimeline>
          <ArtEmptyState
            v-else
            title="暂无服务交付记录"
            description="服务处理后，可在此查看交付过程。"
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
  import { formatDateTimeValue as formatDateTime } from '@/utils/ui/format'
  import { useUserStore } from '@/store/modules/user'
  import { fetchServiceRequestDetail } from '@hr/api'

  const drawerRef = ref<ArtDrawerExpose>()
  const {
    detail: request,
    loading,
    missing,
    loadError,
    loadDetail,
    openDetail,
    retryLoad
  } = useDetailRecord(fetchServiceRequestDetail, '服务工单暂时无法加载，请重新加载')
  onBeforeUnmount(() => openDetail(''))
  const userStore = useUserStore()

  const statusType = (status: Api.Hr.ServiceRequestStatus): TagProps['type'] =>
    ['resolved', 'closed'].includes(status)
      ? 'success'
      : ['submitted', 'waiting_employee'].includes(status)
        ? 'warning'
        : ['assigned', 'in_progress'].includes(status)
          ? 'primary'
          : 'info'
  const slaType = (status?: Api.Hr.ServiceRequestSlaStatus): TagProps['type'] =>
    status === 'breached'
      ? 'danger'
      : status === 'at_risk'
        ? 'warning'
        : status === 'on_track'
          ? 'success'
          : 'info'
  const slaLabel = (status?: Api.Hr.ServiceRequestSlaStatus): string =>
    ({ clear: '已停止计时', on_track: 'SLA 正常', at_risk: 'SLA 临近', breached: 'SLA 超时' })[
      status || 'clear'
    ]
  const resolvedSlaStatus = (item: Api.Hr.ServiceRequest): Api.Hr.ServiceRequestSlaStatus => {
    if (!['submitted', 'assigned', 'in_progress', 'waiting_employee'].includes(item.status)) {
      return 'clear'
    }
    if (item.slaStatus) return item.slaStatus
    if (!item.resolutionDueAt) return 'clear'
    const remaining = new Date(item.resolutionDueAt).getTime() - Date.now()
    if (remaining < 0) return 'breached'
    return remaining <= 4 * 60 * 60 * 1000 ? 'at_risk' : 'on_track'
  }
  const eventLabel = (type: string): string =>
    ({
      created: '创建工单',
      submitted: '提交服务工单',
      assigned: '分派处理人',
      started: '开始处理',
      waiting: '等待员工补充',
      resumed: '恢复处理',
      resolved: '提交解决结果',
      closed: '关闭工单',
      reopened: '重新打开',
      cancelled: '取消工单',
      commented: '添加沟通记录',
      updated: '更新工单信息'
    })[type] ?? '更新服务记录'
  const eventTone = (type: string): TimelineItemProps['type'] =>
    ['resolved', 'closed'].includes(type)
      ? 'success'
      : ['waiting', 'reopened'].includes(type)
        ? 'warning'
        : ['cancelled'].includes(type)
          ? 'info'
          : 'primary'

  const handleOpen = async (id: string): Promise<void> => {
    openDetail(id)
    await drawerRef.value?.handleOpen(undefined, {
      title: '员工服务工单',
      subtitle: '查看 SLA、解决结果与完整交付轨迹',
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
  .service-request-drawer {
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
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > div:first-child {
        min-width: 0;
      }

      span {
        font-size: 11px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.04em;
      }

      h3 {
        margin: 5px 0 0;
        font-size: 18px;
        line-height: 1.35;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 6px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      &-status {
        display: flex;
        flex: 0 0 auto;
        gap: 6px;
      }
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

        &:not(:first-child) {
          border-left: 1px solid var(--art-card-border);
        }
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

        > :deep(.art-svg-icon) {
          font-size: 18px;
          color: var(--theme-color);
        }

        div {
          display: grid;
        }

        strong {
          font-size: 13px;
          color: var(--el-text-color-primary);
        }

        small {
          margin-top: 2px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__narrative {
      display: grid;
      gap: 9px;

      > div {
        padding: 11px 12px;
        background: var(--art-gray-100);
        border-left: 3px solid var(--art-gray-300);
        border-radius: var(--el-border-radius-base);

        &.is-warning {
          background: var(--el-color-warning-light-9);
          border-left-color: var(--el-color-warning);
        }

        &.is-success {
          background: var(--el-color-success-light-9);
          border-left-color: var(--el-color-success);
        }
      }

      span {
        font-size: 11px;
        font-weight: 650;
        color: var(--el-text-color-secondary);
      }

      p {
        margin: 5px 0 0;
        font-size: 13px;
        line-height: 1.65;
        color: var(--el-text-color-primary);
        white-space: pre-wrap;
      }
    }

    &__attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0;
      margin: 0;
      list-style: none;

      a {
        display: inline-flex;
        gap: 7px;
        align-items: center;
        min-height: 34px;
        padding: 0 10px;
        color: var(--theme-color);
        text-decoration: none;
        background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
        border-radius: var(--el-border-radius-base);

        &:focus-visible {
          outline: 2px solid var(--theme-color);
          outline-offset: 2px;
        }
      }
    }

    &__timeline {
      padding-top: 4px;

      article {
        display: grid;
        gap: 4px;

        strong {
          font-size: 13px;
          color: var(--el-text-color-primary);
        }

        span {
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }

        p {
          padding: 8px 10px;
          margin: 3px 0 0;
          font-size: 12px;
          line-height: 1.6;
          color: var(--el-text-color-regular);
          background: var(--art-gray-100);
          border-radius: var(--el-border-radius-base);
        }
      }
    }
  }

  @media only screen and (width <= 767px) {
    .service-request-drawer {
      &__hero {
        flex-direction: column;
      }

      &__summary dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__summary dl > div {
        &:nth-child(odd) {
          border-left: 0;
        }

        &:nth-child(n + 3) {
          border-top: 1px solid var(--art-card-border);
        }
      }
    }
  }
</style>
