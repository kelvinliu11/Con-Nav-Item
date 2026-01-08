<template>
  <div class="error-log-comp" :class="{ 'has-errors': errors && errors.length > 0 }">
    <div class="error-header">
      <div class="header-left">
        <span class="title">失败列表 ({{ errors ? errors.length : 0 }})</span>
        <span class="hint" v-if="errors && errors.length > 0">可点击右侧按钮单独重试</span>
      </div>
      <button 
        v-if="errors && errors.length > 0" 
        class="btn-retry-all" 
        @click="$emit('retry-all')" 
        :disabled="disabled"
      >
        🔄 重试全部失败
      </button>
    </div>
    
    <div class="error-body">
      <template v-if="errors && errors.length > 0">
        <div v-for="(err, i) in errors" :key="i" class="error-item">
          <div class="error-info">
            <div class="error-row">
              <span class="error-title" :title="err.cardTitle">{{ err.cardTitle || '未知卡片' }}</span>
              <span class="error-time">{{ formatTime(err.time) }}</span>
            </div>
            <div class="error-msg" :title="err.error">{{ err.error || '未知错误原因' }}</div>
          </div>
          <button 
            class="btn-retry-single" 
            @click="$emit('retry-single', err)" 
            :disabled="disabled"
            title="重试此卡片"
          >
            重试
          </button>
        </div>
      </template>
      <div v-else class="error-empty">
        <div class="empty-icon">✨</div>
        <p>{{ emptyText }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ErrorLogList',
  props: {
    errors: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false },
    emptyText: { type: String, default: '处理完成，无失败项' }
  },
  emits: ['retry-all', 'retry-single'],
  methods: {
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
    }
  }
};
</script>

<style scoped>
.error-log-comp { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #fff; }
.error-log-comp.has-errors { border-color: #fee2e2; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.05); }

.error-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
.has-errors .error-header { background: #fef2f2; border-bottom-color: #fee2e2; }

.header-left { display: flex; flex-direction: column; }
.title { font-size: 13px; font-weight: 600; color: #374151; }
.has-errors .title { color: #b91c1c; }
.hint { font-size: 11px; color: #9ca3af; font-weight: normal; }
.has-errors .hint { color: #f87171; }

.error-body { max-height: 240px; overflow-y: auto; }
.error-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f3f4f6; gap: 12px; }
.has-errors .error-item { border-bottom-color: #fef2f2; }
.error-item:last-child { border-bottom: none; }

.error-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.error-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.error-title { font-size: 13px; font-weight: 600; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.error-time { font-size: 11px; color: #9ca3af; font-family: monospace; }
.error-msg { font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4; }

.btn-retry-all { padding: 4px 10px; font-size: 12px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-retry-all:hover:not(:disabled) { background: #2563eb; }
.btn-retry-all:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-retry-single { padding: 4px 8px; font-size: 11px; border: 1px solid #fecaca; color: #ef4444; background: transparent; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
.btn-retry-single:hover:not(:disabled) { background: #fef2f2; border-color: #f87171; }
.btn-retry-single:disabled { opacity: 0.5; cursor: not-allowed; }

.error-empty { padding: 32px 16px; text-align: center; color: #9ca3af; }
.empty-icon { font-size: 24px; margin-bottom: 8px; }
.error-empty p { margin: 0; font-size: 13px; font-style: italic; }

:root.dark .error-log-comp { background: #1f2937; border-color: #374151; }
:root.dark .error-header { background: #111827; border-color: #374151; }
:root.dark .has-errors .error-header { background: #450a0a; border-color: #450a0a; }
:root.dark .title { color: #e5e7eb; }
:root.dark .error-item { border-color: #374151; }
:root.dark .error-title { color: #e5e7eb; }
:root.dark .error-msg { color: #9ca3af; }
</style>
