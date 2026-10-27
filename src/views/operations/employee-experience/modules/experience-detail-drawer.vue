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
      <div v-if="record" class="experience-detail">
        <section class="experience-detail__hero" aria-labelledby="experience-detail-title">
          <div class="experience-detail__identity">
            <span aria-hidden="true"><ArtSvgIcon :icon="heroMeta.icon" /></span>
            <div>
              <small>{{ heroMeta.eyebrow }}</small>
              <h3 id="experience-detail-title">{{ heroMeta.title }}</h3>
              <p>{{ heroMeta.description }}</p>
            </div>
          </div>
          <div class="experience-detail__status">
            <ElTag :type="heroMeta.tone" effect="light" round>{{ heroMeta.status }}</ElTag>
            <ElTag v-if="entity === 'insight'" type="success" effect="plain" round>
              <ArtSvgIcon icon="ri:shield-check-line" />匿名阈值已满足
            </ElTag>
          </div>
        </section>

        <template v-if="surveyDetail">
          <section class="experience-detail__summary" aria-label="调查配置摘要">
            <dl>
              <div v-for="item in surveySummary" :key="item.label">
                <dt>{{ item.label }}</dt
                ><dd>{{ item.value }}</dd
                ><small>{{ item.hint }}</small>
              </div>
            </dl>
          </section>

          <section class="experience-detail__section">
            <header>
              <ArtSvgIcon icon="ri:questionnaire-line" />
              <div><strong>调查题目</strong><small>题目按体验主题与展示顺序组织</small></div>
              <ElButton
                v-if="surveyDetail.status === 'draft'"
                v-auth="'Hr:Experience:Question:Manage'"
                type="primary"
                plain
                size="small"
                @click="emit('add-question', surveyDetail)"
              >
                <ArtSvgIcon icon="ri:add-line" />新增题目
              </ElButton>
            </header>
            <div v-if="surveyDetail.questions?.length" class="experience-detail__questions">
              <article
                v-for="(question, index) in surveyDetail.questions"
                :key="question.id || `${question.dimension}-${question.sort}`"
              >
                <span>{{ String(index + 1).padStart(2, '0') }}</span>
                <div>
                  <div>
                    <strong>{{ question.questionText }}</strong>
                    <ElButton
                      v-if="surveyDetail.status === 'draft'"
                      v-auth="'Hr:Experience:Question:Manage'"
                      link
                      type="primary"
                      @click="emit('edit-question', surveyDetail, question)"
                      >编辑</ElButton
                    >
                  </div>
                  <p>
                    {{
                      userStore.getDictLabelByValue(
                        'hrExperienceDimension',
                        question.dimension,
                        question.dimension ?? '--'
                      )
                    }}
                    ·
                    {{
                      userStore.getDictLabelByValue(
                        'hrExperienceAnswerType',
                        question.answerType,
                        question.answerType ?? '--'
                      )
                    }}
                    ·
                    {{ question.required ? '必答' : '选答' }}
                  </p>
                </div>
                <ElTag :type="question.enabled ? 'success' : 'info'" effect="plain" size="small">
                  {{ question.enabled ? '启用' : '停用' }}
                </ElTag>
              </article>
            </div>
            <ArtEmptyState
              v-else
              title="尚未配置题目"
              description="发布前至少添加一道数值量表题。"
              size="compact"
              :visual-size="64"
            />
          </section>

          <section class="experience-detail__section">
            <header>
              <ArtSvgIcon icon="ri:history-line" />
              <div
                ><strong>调查审计轨迹</strong
                ><small>配置、发布、开放与关闭操作均保留记录</small></div
              >
            </header>
            <ExperienceTimeline :events="surveyDetail.events ?? []" />
          </section>
        </template>

        <template v-else-if="insightDetail">
          <section class="experience-detail__insight-overview" aria-label="主题洞察摘要">
            <div class="experience-detail__score-ring" :style="scoreRingStyle">
              <span
                ><strong>{{ insightScore }}</strong
                ><small>/ 100</small></span
              >
            </div>
            <div>
              <small>AGGREGATED DIMENSION SCORE</small>
              <h4>{{
                userStore.getDictLabelByValue(
                  'hrExperienceDimension',
                  insightDetail.dimension,
                  insightDetail.dimension ?? '--'
                )
              }}</h4>
              <p>
                本主题由 {{ insightDetail.respondentCount }} 名匿名答卷贡献，达到
                {{ insightDetail.minimumGroupSize }} 人阈值。分数只用于识别组织改善方向。
              </p>
            </div>
            <ElButton v-auth="'Hr:Experience:Action:Manage'" type="primary" @click="emitAddAction">
              <ArtSvgIcon icon="ri:route-line" />建立改善行动
            </ElButton>
          </section>

          <section class="experience-detail__section">
            <header>
              <ArtSvgIcon icon="ri:bar-chart-grouped-line" />
              <div
                ><strong>题目得分分布</strong
                ><small>统一换算为 0–100 分，仅展示数值量表题</small></div
              >
            </header>
            <div v-if="insightDetail.questionScores.length" class="experience-detail__score-list">
              <article v-for="item in insightDetail.questionScores" :key="item.questionId">
                <div
                  ><strong>{{ item.questionText }}</strong
                  ><small>{{ item.respondentCount }} 人作答</small></div
                >
                <ElProgress
                  :percentage="item.scorePercent"
                  :status="progressStatus(item.scorePercent)"
                  :stroke-width="8"
                />
              </article>
            </div>
            <ArtEmptyState
              v-else
              title="当前主题没有可计算的量表题结果"
              description="收集量表题反馈后，可在此查看分析结果。"
              size="compact"
              :visual-size="64"
            />
          </section>

          <section class="experience-detail__section">
            <header>
              <ArtSvgIcon icon="ri:organization-chart" />
              <div
                ><strong>阈值安全的组织结果</strong
                ><small>仅返回独立达到匿名阈值的组织群组</small></div
              >
            </header>
            <div v-if="insightDetail.organizationScores.length" class="experience-detail__cohorts">
              <article
                v-for="cohort in insightDetail.organizationScores"
                :key="cohort.organizationId"
              >
                <div
                  ><strong>{{ cohort.organizationName }}</strong
                  ><small>{{ cohort.respondentCount }} 人</small></div
                >
                <span>{{ cohort.scorePercent }}</span>
                <ElProgress
                  :percentage="cohort.scorePercent"
                  :status="progressStatus(cohort.scorePercent)"
                  :show-text="false"
                  :stroke-width="6"
                />
              </article>
            </div>
            <ArtEmptyState
              v-else
              title="暂无可展示的组织结果"
              description="没有组织群组独立达到匿名阈值，系统不会返回细分结果。"
              size="compact"
              :visual-size="64"
            />
          </section>

          <section class="experience-detail__section">
            <header>
              <ArtSvgIcon icon="ri:double-quotes-l" />
              <div
                ><strong>开放反馈</strong
                ><small>文本可能包含敏感语境，需要独立评论查看权限</small></div
              >
            </header>
            <div v-if="insightDetail.commentsRestricted" class="experience-detail__restricted">
              <ArtSvgIcon icon="ri:lock-2-line" />
              <div
                ><strong>开放评论已隐藏</strong
                ><p>当前角色可以查看聚合分数，但没有开放评论查看权限。</p></div
              >
            </div>
            <div v-else-if="insightDetail.comments.length" class="experience-detail__comments">
              <blockquote
                v-for="(comment, index) in insightDetail.comments"
                :key="`${comment.submittedAt}-${index}`"
              >
                <p>{{ comment.text }}</p>
                <footer
                  >{{ comment.questionText }} · {{ formatDateTime(comment.submittedAt) }}</footer
                >
              </blockquote>
            </div>
            <ArtEmptyState
              v-else
              title="当前主题暂无开放文本反馈"
              description="收到开放文本反馈后，可在此查看。"
              size="compact"
              :visual-size="64"
            />
          </section>

          <section class="experience-detail__section">
            <header>
              <ArtSvgIcon icon="ri:route-line" />
              <div><strong>主题改善行动</strong><small>从洞察到负责人、期限与成果验收</small></div>
            </header>
            <div v-if="insightDetail.actions.length" class="experience-detail__actions">
              <article v-for="action in insightDetail.actions" :key="action.id">
                <span :class="`is-${action.status}`"
                  ><ArtSvgIcon icon="ri:checkbox-blank-circle-fill"
                /></span>
                <div>
                  <div
                    ><strong>{{ action.title }}</strong
                    ><ElTag effect="plain" size="small">{{
                      userStore.getDictLabelByValue(
                        'commonActionProgressStatus',
                        action.status,
                        action.status ?? '--'
                      )
                    }}</ElTag></div
                  >
                  <p>计划完成日 {{ formatDate(action.dueDate) }}</p>
                  <small>{{ action.successMeasure }}</small>
                </div>
              </article>
            </div>
            <ArtEmptyState
              v-else
              title="尚未建立改善行动"
              description="创建改善行动并指定负责人后，可在此跟踪进展。"
              size="compact"
              :visual-size="64"
            />
          </section>
        </template>

        <template v-else-if="actionDetail">
          <section class="experience-detail__summary" aria-label="行动控制摘要">
            <dl>
              <div v-for="item in actionSummary" :key="item.label">
                <dt>{{ item.label }}</dt
                ><dd>{{ item.value }}</dd
                ><small>{{ item.hint }}</small>
              </div>
            </dl>
          </section>

          <section class="experience-detail__section">
            <header
              ><ArtSvgIcon icon="ri:flag-line" /><div
                ><strong>成功标准</strong><small>行动完成时必须对照此标准提交可核验成果</small></div
              ></header
            >
            <div class="experience-detail__narrative">
              <div
                ><dt>成功标准</dt><dd>{{ actionDetail.successMeasure }}</dd></div
              >
              <div
                ><dt>当前进展</dt
                ><dd>{{ actionDetail.progressNote || '尚未维护阶段性进展' }}</dd></div
              >
              <div
                ><dt>验收结果</dt
                ><dd>{{ actionDetail.resultSummary || '行动尚未完成验收' }}</dd></div
              >
            </div>
          </section>

          <section class="experience-detail__section">
            <header
              ><ArtSvgIcon icon="ri:history-line" /><div
                ><strong>行动审计轨迹</strong
                ><small>创建、更新、启动、验收和取消均保留记录</small></div
              ></header
            >
            <ExperienceTimeline :events="actionDetail.events ?? []" />
          </section>
        </template>

        <template v-else-if="myDetail">
          <section class="experience-detail__completion">
            <span :class="`is-${myDetail.availability}`"
              ><ArtSvgIcon
                :icon="
                  myDetail.availability === 'completed' ? 'ri:checkbox-circle-line' : 'ri:time-line'
                "
            /></span>
            <div>
              <strong>{{ availabilityLabel }}</strong>
              <p>{{ myDetail.privacyNote }}</p>
            </div>
          </section>
          <section class="experience-detail__summary" aria-label="我的调查状态">
            <dl>
              <div
                ><dt>调查类型</dt
                ><dd>{{
                  userStore.getDictLabelByValue(
                    'hrExperienceSurveyType',
                    myDetail.surveyType,
                    myDetail.surveyType ?? '--'
                  )
                }}</dd
                ><small>{{
                  userStore.getDictLabelByValue(
                    'hrExperienceCadence',
                    myDetail.cadence,
                    myDetail.cadence ?? '--'
                  )
                }}</small></div
              >
              <div
                ><dt>开放周期</dt><dd>{{ formatDate(myDetail.startDate) }}</dd
                ><small>至 {{ formatDate(myDetail.endDate) }}</small></div
              >
              <div
                ><dt>题目数量</dt><dd>{{ myDetail.questionCount }} 题</dd
                ><small>提交后不能再次编辑</small></div
              >
              <div
                ><dt>完成日期</dt><dd>{{ formatDate(myDetail.completedOn) }}</dd
                ><small>仅保留完成状态，不连接答案</small></div
              >
            </dl>
          </section>
        </template>
      </div>
    </ArtAsyncState>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import { ElButton, ElProgress, ElTag, type ProgressProps, type TagProps } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { createDateTimeFormatter, formatDateTimeValue as formatDateTime } from '@/utils/ui/format'
  import { useUserStore } from '@/store/modules/user'
  import { fetchEmployeeExperienceDetail } from '@hr/api'
  import ExperienceTimeline from './experience-timeline.vue'

  interface DisplayItem {
    label: string
    value: string
    hint: string
  }
  interface HeroMeta {
    eyebrow: string
    title: string
    description: string
    status: string
    tone: TagProps['type']
    icon: string
  }

  const emit = defineEmits<{
    'add-question': [survey: Api.Hr.EmployeeExperienceSurvey]
    'edit-question': [
      survey: Api.Hr.EmployeeExperienceSurvey,
      question: Api.Hr.EmployeeExperienceQuestion
    ]
    'add-action': [survey: Api.Hr.EmployeeExperienceReference, dimension: string]
  }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const userStore = useUserStore()
  const entity = ref<Api.Hr.EmployeeExperienceEntity>('survey')
  const dimension = ref<string>()
  const {
    detail: record,
    loading,
    missing,
    loadError,
    loadDetail,
    openDetail,
    retryLoad
  } = useDetailRecord<Api.Hr.EmployeeExperienceRecord>(
    (id) =>
      fetchEmployeeExperienceDetail<Api.Hr.EmployeeExperienceRecord>(
        entity.value,
        id,
        dimension.value
      ),
    '调查详情暂时无法加载，请重新加载'
  )
  onBeforeUnmount(() => openDetail(''))

  const surveyDetail = computed(() =>
    entity.value === 'survey' ? (record.value as Api.Hr.EmployeeExperienceSurvey) : undefined
  )
  const insightDetail = computed(() =>
    entity.value === 'insight'
      ? (record.value as Api.Hr.EmployeeExperienceInsightDetail)
      : undefined
  )
  const actionDetail = computed(() =>
    entity.value === 'action' ? (record.value as Api.Hr.EmployeeExperienceAction) : undefined
  )
  const myDetail = computed(() =>
    entity.value === 'my' ? (record.value as Api.Hr.EmployeeExperienceMySurvey) : undefined
  )

  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD' })
  const statusTone = (status?: string): TagProps['type'] =>
    ['open', 'completed', 'closed'].includes(status || '')
      ? 'success'
      : ['cancelled', 'expired'].includes(status || '')
        ? 'info'
        : ['in_progress', 'scheduled', 'available'].includes(status || '')
          ? 'warning'
          : 'primary'
  const availabilityLabel = computed(
    () =>
      ({
        available: '调查正在开放，请在截止日前完成',
        completed: '您已完成本次匿名调查',
        expired: '本次调查已结束',
        unavailable: '本次调查尚未开放'
      })[myDetail.value?.availability ?? 'unavailable']
  )
  const heroMeta = computed<HeroMeta>(() => {
    if (surveyDetail.value) {
      return {
        eyebrow: surveyDetail.value.surveyCode,
        title: surveyDetail.value.surveyName,
        description: surveyDetail.value.description || '员工体验调查设置、题目、参与进度与审计轨迹',
        status: userStore.getDictLabelByValue(
          'hrExperienceSurveyStatus',
          surveyDetail.value.status,
          surveyDetail.value.status ?? '--'
        ),
        tone: statusTone(surveyDetail.value.status),
        icon: 'ri:survey-line'
      }
    }
    if (insightDetail.value) {
      return {
        eyebrow: `${insightDetail.value.surveyCode} · AGGREGATE INSIGHT`,
        title: insightDetail.value.surveyName,
        description: `${userStore.getDictLabelByValue('hrExperienceDimension', insightDetail.value.dimension, insightDetail.value.dimension ?? '--')}主题的阈值安全聚合洞察`,
        status: `${insightDetail.value.respondentCount} 人安全样本`,
        tone: 'success',
        icon: 'ri:radar-line'
      }
    }
    if (actionDetail.value) {
      return {
        eyebrow: actionDetail.value.survey?.surveyName || 'EMPLOYEE EXPERIENCE ACTION',
        title: actionDetail.value.title,
        description: `${userStore.getDictLabelByValue('hrExperienceDimension', actionDetail.value.dimension, actionDetail.value.dimension ?? '--')} · ${actionDetail.value.organization?.organizationName || '全组织行动'}`,
        status: userStore.getDictLabelByValue(
          'commonActionProgressStatus',
          actionDetail.value.status,
          actionDetail.value.status ?? '--'
        ),
        tone: statusTone(actionDetail.value.status),
        icon: 'ri:route-line'
      }
    }
    return {
      eyebrow: myDetail.value?.surveyCode || 'MY SURVEY',
      title: myDetail.value?.surveyName || '我的员工体验调查',
      description: myDetail.value?.description || '查看本次匿名调查的开放与完成状态',
      status: availabilityLabel.value,
      tone: statusTone(myDetail.value?.availability),
      icon: 'ri:chat-heart-line'
    }
  })
  const surveySummary = computed<DisplayItem[]>(() => [
    {
      label: '调查类型',
      value: userStore.getDictLabelByValue(
        'hrExperienceSurveyType',
        surveyDetail.value?.surveyType,
        surveyDetail.value?.surveyType ?? '--'
      ),
      hint: userStore.getDictLabelByValue(
        'hrExperienceCadence',
        surveyDetail.value?.cadence,
        surveyDetail.value?.cadence ?? '--'
      )
    },
    {
      label: '覆盖范围',
      value:
        surveyDetail.value?.audienceOrganization?.organizationName ||
        userStore.getDictLabelByValue(
          'hrExperienceAudienceType',
          surveyDetail.value?.audienceType,
          surveyDetail.value?.audienceType ?? '--'
        ),
      hint: `最小匿名阈值 ${surveyDetail.value?.minimumGroupSize ?? 5} 人`
    },
    {
      label: '开放周期',
      value: formatDate(surveyDetail.value?.startDate),
      hint: `至 ${formatDate(surveyDetail.value?.endDate)}`
    },
    {
      label: '参与进度',
      value: `${surveyDetail.value?.completedCount ?? 0} / ${surveyDetail.value?.participantCount ?? 0}`,
      hint: `${surveyDetail.value?.questions?.filter((item) => item.enabled).length ?? 0} 道启用题目`
    }
  ])
  const actionSummary = computed<DisplayItem[]>(() => [
    {
      label: '行动负责人',
      value: actionDetail.value?.ownerEmployee?.employeeName || '未指定负责人',
      hint: actionDetail.value?.ownerEmployee?.jobTitle || '未维护职务'
    },
    {
      label: '计划完成日',
      value: formatDate(actionDetail.value?.dueDate),
      hint: actionDetail.value?.status === 'completed' ? '行动已完成验收' : '按计划跟踪推进'
    },
    {
      label: '改善主题',
      value: userStore.getDictLabelByValue(
        'hrExperienceDimension',
        actionDetail.value?.dimension,
        actionDetail.value?.dimension ?? '--'
      ),
      hint: actionDetail.value?.organization?.organizationName || '全组织范围'
    },
    {
      label: '关联调查',
      value: actionDetail.value?.survey?.surveyName || '--',
      hint: actionDetail.value?.survey?.surveyCode || '--'
    }
  ])
  const insightScore = computed(() => {
    const scores = insightDetail.value?.questionScores ?? []
    if (!scores.length) return 0
    return (
      Math.round(
        (scores.reduce((total, item) => total + item.scorePercent, 0) / scores.length) * 10
      ) / 10
    )
  })
  const scoreRingStyle = computed(() => ({
    background: `conic-gradient(${insightScore.value >= 75 ? 'var(--el-color-success)' : insightScore.value >= 60 ? 'var(--el-color-warning)' : 'var(--el-color-danger)'} ${insightScore.value * 3.6}deg, color-mix(in srgb, var(--art-gray-300) 55%, transparent) 0deg)`
  }))
  const progressStatus = (score: number): ProgressProps['status'] =>
    score >= 75 ? 'success' : score < 60 ? 'exception' : 'warning'

  const emitAddAction = (): void => {
    if (!insightDetail.value?.id) return
    emit(
      'add-action',
      {
        id: insightDetail.value.id,
        tenantId: insightDetail.value.tenantId,
        surveyCode: insightDetail.value.surveyCode,
        surveyName: insightDetail.value.surveyName,
        surveyType: insightDetail.value.surveyType
      },
      insightDetail.value.dimension
    )
  }
  const refresh = retryLoad
  const handleOpen = async (
    targetEntity: Api.Hr.EmployeeExperienceEntity,
    id: string,
    targetDimension?: string
  ): Promise<void> => {
    entity.value = targetEntity
    dimension.value = targetDimension
    openDetail(id)
    const titleMap: Record<Api.Hr.EmployeeExperienceEntity, string> = {
      my: '我的调查状态',
      survey: '员工体验调查详情',
      insight: '匿名聚合洞察',
      action: '改善行动详情'
    }
    await drawerRef.value?.handleOpen(undefined, {
      title: titleMap[targetEntity],
      subtitle: '员工身份、匿名答案、聚合洞察与改善行动按权限边界分层展示',
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
  .experience-detail {
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
          circle at 96% 4%,
          color-mix(in srgb, var(--theme-color) 10%, transparent),
          transparent 36%
        ),
        color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 16%, var(--art-card-border));
      border-radius: var(--art-surface-radius);
    }

    &__identity {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      gap: 13px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 12%, transparent);
        border-radius: var(--el-border-radius-base);
      }

      div {
        min-width: 0;
      }

      small {
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.04em;
      }

      h3 {
        margin: 3px 0 0;
        font-size: 18px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &__status {
      display: flex;
      flex: 0 0 auto;
      flex-wrap: wrap;
      gap: 7px;
      justify-content: flex-end;

      :deep(.el-tag) {
        gap: 4px;
      }
    }

    &__summary dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin: 0;
      overflow: hidden;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);
    }

    &__summary dl > div {
      display: grid;
      gap: 2px;
      min-width: 0;
      padding: 13px 14px;
      border-right: 1px solid var(--art-card-border);

      &:last-child {
        border-right: 0;
      }
    }

    &__summary dt {
      font-size: 10px;
      color: var(--el-text-color-secondary);
    }

    &__summary dd {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 14px;
      font-weight: 650;
      color: var(--el-text-color-primary);
      white-space: nowrap;
    }

    &__summary small {
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 10px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__section {
      padding: 16px;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);

      > header {
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr) auto;
        gap: 9px;
        align-items: center;
        margin-bottom: 13px;

        > :deep(.art-svg-icon) {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, transparent);
          border-radius: var(--el-border-radius-base);
        }

        div {
          display: grid;
          min-width: 0;
        }

        strong {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }

        small {
          margin-top: 1px;
          font-size: 10px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__questions,
    &__score-list,
    &__cohorts,
    &__actions,
    &__comments {
      display: grid;
      gap: 8px;
    }

    &__questions article {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 10px 11px;
      background: color-mix(in srgb, var(--art-gray-100) 48%, transparent);
      border: 1px solid color-mix(in srgb, var(--art-card-border) 78%, transparent);
      border-radius: var(--el-border-radius-base);

      > span {
        font-size: 11px;
        font-weight: 700;
        color: var(--theme-color);
      }

      > div {
        min-width: 0;
      }

      > div > div {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        justify-content: space-between;
      }

      strong {
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 2px 0 0;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__insight-overview {
      display: grid;
      grid-template-columns: 108px minmax(0, 1fr) auto;
      gap: 18px;
      align-items: center;
      padding: 18px;
      background: color-mix(in srgb, var(--el-color-success) 4%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--el-color-success) 15%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > div:nth-child(2) {
        min-width: 0;
      }

      > div:nth-child(2) small {
        font-size: 9px;
        font-weight: 750;
        color: var(--el-color-success-dark-2);
        letter-spacing: 0.1em;
      }

      h4 {
        margin: 2px 0 0;
        font-size: 18px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__score-ring {
      position: relative;
      display: grid;
      place-items: center;
      width: 104px;
      height: 104px;
      border-radius: 50%;

      &::after {
        position: absolute;
        width: 78px;
        height: 78px;
        content: '';
        background: var(--default-box-color);
        border-radius: 50%;
      }

      span {
        z-index: 1;
        display: flex;
        align-items: baseline;
      }

      strong {
        font-size: 25px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__score-list article {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(180px, 0.85fr);
      gap: 16px;
      align-items: center;
      padding: 10px 11px;
      border-bottom: 1px dashed var(--art-card-border);

      &:last-child {
        border-bottom: 0;
      }

      > div {
        display: grid;
      }

      strong {
        font-size: 12px;
        line-height: 1.45;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 2px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__cohorts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    &__cohorts article {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px 10px;
      padding: 11px 12px;
      background: color-mix(in srgb, var(--art-gray-100) 45%, transparent);
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);

      > div {
        display: grid;
        min-width: 0;
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      > span {
        font-size: 17px;
        font-weight: 700;
        color: var(--theme-color);
      }

      :deep(.el-progress) {
        grid-column: 1 / -1;
      }
    }

    &__restricted {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 13px;
      color: var(--el-color-warning-dark-2);
      background: color-mix(in srgb, var(--el-color-warning) 8%, transparent);
      border-left: 3px solid var(--el-color-warning);
      border-radius: var(--el-border-radius-base);

      strong {
        font-size: 12px;
      }

      p {
        margin: 2px 0 0;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__comments blockquote {
      padding: 11px 13px;
      margin: 0;
      background: color-mix(in srgb, var(--art-gray-100) 45%, transparent);
      border-left: 3px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
      border-radius: 0 var(--el-border-radius-base) var(--el-border-radius-base) 0;

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-primary);
        white-space: pre-wrap;
      }

      footer {
        margin-top: 5px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__actions article {
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr);
      gap: 9px;
      align-items: flex-start;
      padding: 10px 11px;
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);

      > span {
        margin-top: 3px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      > span.is-in_progress {
        color: var(--el-color-warning);
      }

      > span.is-completed {
        color: var(--el-color-success);
      }

      > div > div {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 2px 0 0;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      small {
        display: block;
        margin-top: 5px;
        font-size: 11px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &__narrative {
      display: grid;
      gap: 10px;
    }

    &__narrative > div {
      padding: 11px 12px;
      background: color-mix(in srgb, var(--art-gray-100) 45%, transparent);
      border-radius: var(--el-border-radius-base);
    }

    &__narrative dt {
      font-size: 10px;
      font-weight: 650;
      color: var(--theme-color);
    }

    &__narrative dd {
      margin: 4px 0 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-primary);
      white-space: pre-wrap;
    }

    &__completion {
      display: grid;
      grid-template-columns: 54px minmax(0, 1fr);
      gap: 13px;
      align-items: center;
      padding: 17px;
      background: color-mix(in srgb, var(--el-color-success) 5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--el-color-success) 15%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 54px;
        height: 54px;
        color: var(--el-color-warning);
        background: color-mix(in srgb, var(--el-color-warning) 11%, transparent);
        border-radius: 50%;
      }

      > span.is-completed {
        color: var(--el-color-success);
        background: color-mix(in srgb, var(--el-color-success) 11%, transparent);
      }

      strong {
        font-size: 15px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 11px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }
  }

  @media only screen and (width <= 900px) {
    .experience-detail__summary dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .experience-detail__summary dl > div:nth-child(2) {
      border-right: 0;
    }

    .experience-detail__summary dl > div:nth-child(-n + 2) {
      border-bottom: 1px solid var(--art-card-border);
    }

    .experience-detail__insight-overview {
      grid-template-columns: 96px minmax(0, 1fr);
    }

    .experience-detail__insight-overview > :deep(.el-button) {
      grid-column: 1 / -1;
      justify-self: start;
    }

    .experience-detail__score-ring {
      width: 92px;
      height: 92px;
    }

    .experience-detail__score-ring::after {
      width: 68px;
      height: 68px;
    }
  }

  @media only screen and (width <= 620px) {
    .experience-detail__hero {
      display: grid;
    }

    .experience-detail__status {
      justify-content: flex-start;
    }

    .experience-detail__summary dl {
      grid-template-columns: 1fr;
    }

    .experience-detail__summary dl > div {
      border-right: 0;
      border-bottom: 1px solid var(--art-card-border);
    }

    .experience-detail__summary dl > div:last-child {
      border-bottom: 0;
    }

    .experience-detail__score-list article {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .experience-detail__cohorts {
      grid-template-columns: 1fr;
    }
  }
</style>
