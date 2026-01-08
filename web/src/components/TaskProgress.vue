<template>
  <div class="task-progress-comp">
    <div class="progress-header">
      <span class="status-text">
        <span v-if="task.running" class="spinner">⏳</span>
        <span v-else>✅</span>
        {{ task.running ? '正在处理...' : '任务已完成' }}
      </span>
      <span class="progress-count">{{ task.current }} / {{ task.total }}</span>
    </div>
    
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: percent + '%' }"></div>
    </div>
    
    <div class="progress-meta">
      <span class="current-card" v-if="task.currentCard" :title="task.currentCard">
        当前: {{ task.currentCard }}
      </span>
      <span class="eta" v-if="task.running && eta">预计剩余: {{ eta }}</span>
    </div>

    <div class="task-stats">
      <div class="stat success">✓ 成功 {{ task.successCount || 0 }}</div>
      <div class="stat fail">✗ 失败 {{ task.failCount || 0 }}</div>
      <div class="concurrency" v-if="task.running && task.concurrency">
        并发: {{ task.concurrency }}
        <span v-if="task.isRateLimited" class="rate-limit">限流中</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TaskProgress',
  props: {
    task: {
      type: Object,
      required: true,
      default: () => ({
        running: false,
        current: 0,
        total: 0,
        successCount: 0,
        failCount: 0,
        currentCard: '',
        startTime: 0,
        concurrency: 0,
        isRateLimited: false
      })
    }
  },
  computed: {
    percent() {
      if (!this.task.total) return 0;
      return Math.round((this.task.current / this.task.total) * 100);
    },
    eta() {
      if (!this.task.startTime || this.task.current < 2) return '';
      const elapsed = Date.now() - this.task.startTime;
      const avg = elapsed / this.task.current;
      const remain = (this.task.total - this.task.current) * avg;
      if (remain <= 0) return '';
      return remain < 60000 ? `${Math.round(remain / 1000)}秒` : `${Math.round(remain / 60000)}分钟`;
    }
  }
};
</script>

<style scoped>
.task-progress-comp { width: 100%; }
.progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 500; font-size: 14px; }
.status-text { display: flex; align-items: center; gap: 6px; }
.progress-bar { height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; margin-bottom: 8px; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); transition: width 0.3s; border-radius: 5px; }
.progress-meta { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 12px; }
.current-card { max-width: 65%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-stats { display: flex; align-items: center; gap: 16px; font-size: 13px; }
.stat.success { color: #10b981; font-weight: 500; }
.stat.fail { color: #ef4444; font-weight: 500; }
.concurrency { margin-left: auto; color: #9ca3af; font-size: 11px; display: flex; align-items: center; gap: 4px; }
.rate-limit { color: #f59e0b; background: #fef3c7; padding: 1px 4px; border-radius: 4px; font-weight: 600; animation: blink 1s infinite; }

@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

:root.dark .progress-bar { background: #374151; }
:root.dark .rate-limit { background: #451a03; color: #fbbf24; }
</style>
