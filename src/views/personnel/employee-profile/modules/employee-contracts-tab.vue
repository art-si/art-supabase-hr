<template>
  <ElTabPane name="contracts">
    <template #label>
      劳动合同
      <span class="hr-profile-page__tab-count">{{ contracts.length }}</span>
    </template>
    <HistorySection
      title="劳动合同"
      description="维护合同期限、签署状态、工作地点与薪资信息"
      add-label="新增合同"
      icon="ri:file-list-3-line"
      :count="contracts.length"
      :readonly="isReadonly"
      @add="contracts.push(createContract())"
    >
      <HistoryCard
        v-for="(item, index) in contracts"
        :key="item.id || index"
        :title="item.contractNo || `合同 ${index + 1}`"
        :subtitle="displayDict('hrContractStatus', item.contractStatus)"
        :readonly="isReadonly"
        @remove="contracts.splice(index, 1)"
      >
        <ArtForm
          v-model="contracts[index]"
          :items="contractItems(item, index)"
          :span="formSpan"
          :gutter="18"
          label-position="top"
          root-class="p-0!"
        />
      </HistoryCard>
    </HistorySection>
  </ElTabPane>
</template>

<script setup lang="ts">
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import HistoryCard from './history-card.vue'
  import HistorySection from './history-section.vue'
  import { formatSensitiveNumber } from '@/utils/field-permission'

  interface DictOption {
    label?: string
    value: string
  }

  const props = defineProps<{
    formSpan: number
    isReadonly: boolean
    canViewCompensationDetails: boolean
    canEditCompensationDetails: boolean
    dict: (code: string) => DictOption[]
    displayDict: (code: string, value?: string | null) => string
    validationErrors: Record<string, string>
    contractNumberAutomatic: boolean
    contractNumberLoading: boolean
    contractNumberManualRequired: boolean
    contractNumberDescription: string
  }>()
  const contracts = defineModel<Api.Hr.EmployeeContract[]>({ required: true })

  const fieldKey = (index: number, field: string): string => `contracts.${index}.${field}`
  const fieldError = (index: number, field: string): string =>
    props.validationErrors[fieldKey(index, field)] ?? ''
  const validationProps = (index: number, field: string, required = false) => ({
    required,
    error: fieldError(index, field),
    'data-validation-key': fieldKey(index, field)
  })
  const contractItems = (item: Api.Hr.EmployeeContract, index: number): FormItem[] => {
    const dateProps = {
      type: 'date',
      valueFormat: 'YYYY-MM-DD',
      class: 'w-full!',
      disabled: props.isReadonly
    }
    return [
      {
        key: 'contractNo',
        label: '合同编号',
        type: 'input',
        description: props.contractNumberDescription,
        props: {
          maxlength: 60,
          disabled:
            props.isReadonly ||
            props.contractNumberLoading ||
            Boolean(item.id) ||
            props.contractNumberAutomatic,
          placeholder: props.contractNumberAutomatic ? '保存后自动生成' : '请输入合同编号'
        },
        formItemProps: validationProps(
          index,
          'contractNo',
          Boolean(item.id) || props.contractNumberManualRequired
        )
      },
      {
        key: 'contractType',
        label: '合同类型',
        type: 'select',
        options: props.dict('hrContractType'),
        props: { disabled: props.isReadonly },
        formItemProps: validationProps(index, 'contractType', true)
      },
      {
        key: 'contractStatus',
        label: '合同状态',
        type: 'select',
        options: props.dict('hrContractStatus'),
        props: { disabled: props.isReadonly },
        formItemProps: validationProps(index, 'contractStatus', true)
      },
      { key: 'signDate', label: '签署日期', type: 'date', props: dateProps },
      {
        key: 'startDate',
        label: '开始日期',
        type: 'date',
        props: dateProps,
        formItemProps: validationProps(index, 'startDate', true)
      },
      {
        key: 'endDate',
        label: '结束日期',
        type: 'date',
        props: dateProps,
        formItemProps: validationProps(index, 'endDate')
      },
      { key: 'probationEndDate', label: '试用期结束', type: 'date', props: dateProps },
      {
        key: 'workLocation',
        label: '工作地点',
        type: 'input',
        props: { maxlength: 120, disabled: props.isReadonly }
      },
      {
        key: 'monthlySalary',
        label: '月薪',
        type: props.canEditCompensationDetails ? 'number' : 'text',
        hidden: !props.canViewCompensationDetails,
        props: props.canEditCompensationDetails
          ? { min: 0, precision: 2, controls: false, class: 'w-full!' }
          : { formatter: () => formatSensitiveNumber(item.monthlySalary) }
      },
      {
        key: 'remark',
        label: '合同备注',
        type: 'textarea',
        span: 24,
        props: { rows: 4, maxlength: 300, showWordLimit: true, disabled: props.isReadonly }
      }
    ]
  }
  const createContract = (): Api.Hr.EmployeeContract => ({
    contractNo: '',
    contractType: 'fixed_term',
    contractStatus: 'active',
    signDate: null,
    startDate: '',
    endDate: null,
    probationEndDate: null,
    workLocation: '',
    monthlySalary: null,
    remark: ''
  })
</script>
