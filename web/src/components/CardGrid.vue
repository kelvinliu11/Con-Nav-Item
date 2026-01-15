<template>
  <div ref="cardGridRef" class="container card-grid">
    <div v-for="(card, index) in cards" :key="card.id"
         class="link-item" 
         :class="{ 
           'selected': isCardSelected(card),
           'dragging': isDragging
         }"
         :data-card-id="card.id"
         :style="getCardStyle(index)"
         @contextmenu.prevent="handleContextMenu($event, card)"
         @mousedown="handleMouseDown($event, card)"
         @touchstart="handleTouchStart($event, card)"
         @click="handleCardClick($event, card)">
      <a :href="isDragging ? 'javascript:void(0)' : card.url" 
         :target="isDragging ? '' : '_blank'" 
         :title="getTooltip(card)" 
         @click="handleLinkClick($event)"
         class="card-link">
        <img class="link-icon" :src="getLogo(card)" alt="" @error="onImgError($event, card)" loading="lazy">
        <span class="link-text">{{ truncate(card.title) }}</span>
      </a>
      <div v-if="isCardSelected(card)" class="card-selected-badge">✓</div>
    </div>
    
    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenuVisible" 
           class="context-menu"
           :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
           @click.stop>
        <div class="context-menu-item" @click="onContextEdit">
          <span class="context-menu-icon">✏️</span>
          <span>编辑</span>
        </div>
        <div class="context-menu-item" @click="onContextDelete">
          <span class="context-menu-icon">🗑️</span>
          <span>删除</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onContextSelect">
          <span class="context-menu-icon">☑️</span>
          <span>{{ isCardSelected(contextMenuCard) ? '取消选中' : '选中' }}</span>
        </div>
        <div class="context-menu-item" @click="onContextMove">
          <span class="context-menu-icon">📁</span>
          <span>移动到...</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onContextOpen">
          <span class="context-menu-icon">🔗</span>
          <span>在新标签页打开</span>
        </div>
        <div class="context-menu-item" @click="onContextCopyUrl">
          <span class="context-menu-icon">📋</span>
          <span>复制链接</span>
        </div>
      </div>
    </Teleport>
    
    <!-- 长按提示 -->
    <Teleport to="body">
      <div v-if="showDragHint" class="drag-hint">
        松开开始拖拽排序
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import Sortable from 'sortablejs';

const props = defineProps({ 
  cards: Array,
  selectedCards: Array,
  categoryId: Number,
  subCategoryId: [Number, null]
});

const emit = defineEmits([
  'cardsReordered', 
  'contextEdit', 
  'contextDelete',
  'toggleCardSelection',
  'openMovePanel'
]);

const cardGridRef = ref(null);
let sortableInstance = null;

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuCard = ref(null);

const isDragging = ref(false);
const showDragHint = ref(false);
let longPressTimer = null;
let longPressCard = null;
const LONG_PRESS_DURATION = 500;

function handleContextMenu(event, card) {
  contextMenuCard.value = card;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextMenuVisible.value = true;
}

function closeContextMenu() {
  contextMenuVisible.value = false;
  contextMenuCard.value = null;
}

function onContextEdit() {
  if (contextMenuCard.value) {
    emit('contextEdit', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextDelete() {
  if (contextMenuCard.value) {
    emit('contextDelete', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextSelect() {
  if (contextMenuCard.value) {
    emit('toggleCardSelection', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextMove() {
  if (contextMenuCard.value) {
    if (!isCardSelected(contextMenuCard.value)) {
      emit('toggleCardSelection', contextMenuCard.value);
    }
    emit('openMovePanel');
  }
  closeContextMenu();
}

function onContextOpen() {
  if (contextMenuCard.value) {
    window.open(contextMenuCard.value.url, '_blank');
  }
  closeContextMenu();
}

function onContextCopyUrl() {
  if (contextMenuCard.value) {
    navigator.clipboard.writeText(contextMenuCard.value.url);
  }
  closeContextMenu();
}

function handleClickOutside(event) {
  if (contextMenuVisible.value) {
    closeContextMenu();
  }
}

function handleCardClick(event, card) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    emit('toggleCardSelection', card);
  }
}

function handleLinkClick(event) {
  if (isDragging.value || event.ctrlKey || event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function handleMouseDown(event, card) {
  if (event.button !== 0) return;
  if (event.ctrlKey || event.metaKey) return;
  
  longPressCard = card;
  const startX = event.clientX;
  const startY = event.clientY;
  
  longPressTimer = setTimeout(() => {
    showDragHint.value = true;
    enableDragMode();
  }, LONG_PRESS_DURATION);
  
  const handleMouseMove = (e) => {
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 5 || dy > 5) {
      clearLongPress();
    }
  };
  
  const handleMouseUp = () => {
    clearLongPress();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleTouchStart(event, card) {
  longPressCard = card;
  const touch = event.touches[0];
  const startX = touch.clientX;
  const startY = touch.clientY;
  
  longPressTimer = setTimeout(() => {
    showDragHint.value = true;
    enableDragMode();
  }, LONG_PRESS_DURATION);
  
  const handleTouchMove = (e) => {
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startX);
    const dy = Math.abs(t.clientY - startY);
    if (dx > 10 || dy > 10) {
      clearLongPress();
    }
  };
  
  const handleTouchEnd = () => {
    clearLongPress();
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  };
  
  document.addEventListener('touchmove', handleTouchMove, { passive: true });
  document.addEventListener('touchend', handleTouchEnd);
}

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  showDragHint.value = false;
}

function enableDragMode() {
  isDragging.value = true;
  showDragHint.value = false;
  initSortable();
  
  setTimeout(() => {
    if (!sortableInstance) return;
    const container = cardGridRef.value;
    if (!container || !longPressCard) return;
    
    const cardEl = container.querySelector(`[data-card-id="${longPressCard.id}"]`);
    if (cardEl) {
      cardEl.classList.add('sortable-chosen');
    }
  }, 50);
}

function disableDragMode() {
  isDragging.value = false;
  destroySortable();
}

function initSortable() {
  if (sortableInstance) return;
  
  const container = cardGridRef.value;
  if (!container) return;
  
  sortableInstance = new Sortable(container, {
    animation: 150,
    group: 'cards',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    delay: 0,
    delayOnTouchOnly: false,
    onStart: () => {
      isDragging.value = true;
    },
    onEnd: (evt) => {
      const targetContainer = evt.to;
      const cardIds = Array.from(targetContainer.children).map((el) => {
        return parseInt(el.getAttribute('data-card-id'));
      }).filter(id => !isNaN(id));
      
      emit('cardsReordered', cardIds, props.categoryId, props.subCategoryId);
      
      setTimeout(() => {
        disableDragMode();
      }, 100);
    }
  });
}

function destroySortable() {
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('scroll', closeContextMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('scroll', closeContextMenu);
  destroySortable();
  clearLongPress();
});

watch(() => props.cards, (newCards, oldCards) => {
  if (newCards && newCards.length > 0) {
    const isDataChanged = !oldCards || oldCards.length === 0 || JSON.stringify(newCards) !== JSON.stringify(oldCards);
    if (isDataChanged) {
      nextTick(() => {
        if (isDragging.value) {
          destroySortable();
          nextTick(() => initSortable());
        }
      });
    }
  }
}, { deep: true, immediate: false });

function getCardStyle(index) {
  return {};
}

function getOriginUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return null;
  }
}

function getLogo(card) {
  if (card.logo_url) {
    return card.logo_url;
  }
  
  const originUrl = getOriginUrl(card.url);
  if (originUrl) {
    return `https://api.xinac.net/icon/?url=${originUrl}&sz=128`;
  }
  
  return '/default-favicon.png';
}

const CDN_PROVIDERS = [
  (url) => `https://api.xinac.net/icon/?url=${url}&sz=128`,
  (url) => `https://api.afmax.cn/so/ico/index.php?r=${url}&sz=128`,
  (url) => `https://icon.horse/icon/${url}`,
  (url) => `https://www.google.com/s2/favicons?domain=${url}&sz=128`,
  (url) => `https://favicon.im/${url}?larger=true`,
];

function onImgError(e, card) {
  const currentSrc = e.target.src;
  const originUrl = getOriginUrl(card.url);
  
  if (!originUrl) {
    e.target.src = '/default-favicon.png';
    return;
  }
  
  if (e.target._cdnIndex === undefined) e.target._cdnIndex = 0;
  
  for (let i = 0; i < CDN_PROVIDERS.length; i++) {
    const cdnUrl = CDN_PROVIDERS[i](originUrl);
    if (currentSrc.includes('api.xinac.net') && i === 0 ||
        currentSrc.includes('api.afmax.cn') && i === 1 ||
        currentSrc.includes('icon.horse') && i === 2 ||
        currentSrc.includes('www.google.com/s2/favicons') && i === 3 ||
        currentSrc.includes('favicon.im') && i === 4) {
      if (i + 1 < CDN_PROVIDERS.length) {
        e.target._cdnIndex = i + 1;
        e.target.src = CDN_PROVIDERS[i + 1](originUrl);
        return;
      }
      break;
    }
  }
  
  e.target.src = '/default-favicon.png';
}

function getTooltip(card) {
  let tip = '';
  if (card.desc) tip += card.desc + '\n';
  if (card.tags && card.tags.length > 0) {
    tip += '标签: ' + card.tags.map(t => t.name).join(', ') + '\n';
  }
  tip += card.url;
  return tip;
}

function truncate(str) {
  if (!str) return '';
  return str.length > 20 ? str.slice(0, 20) + '...' : str;
}

function isCardSelected(card) {
  return props.selectedCards?.some(c => c.id === card.id) || false;
}
</script>

<style scoped>
.container {
  max-width: 68rem;
  margin: 0 auto;
  margin-top: 2.5vh;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 16px;
  position: relative;
  z-index: 1;
  padding: 0 1rem;
}

@media (max-width: 1200px) {
  .container { 
    grid-template-columns: repeat(5, 1fr); 
    gap: 14px;
  }
}
@media (max-width: 768px) {
  .container { 
    grid-template-columns: repeat(4, 1fr); 
    gap: 12px;
    padding: 0 0.8rem;
  }
}
@media (max-width: 480px) {
  .container { 
    grid-template-columns: repeat(3, 1fr); 
    gap: 10px;
    padding: 0 0.6rem;
  }
}

.link-item {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  min-height: 88px;
  height: 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  user-select: none;
}

.link-item:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-6px) scale(1.02);
  border-color: rgba(255, 255, 255, 0.35);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
}

.link-item:active {
  transform: translateY(-4px) scale(0.98);
  transition: transform 0.1s ease;
}

.link-item.selected {
  border: 2px solid rgba(99, 179, 237, 0.8);
  box-shadow: 0 0 0 3px rgba(99, 179, 237, 0.3), 0 4px 16px rgba(0, 0, 0, 0.1);
}

.link-item.dragging {
  cursor: grab;
}

.link-item.dragging:active {
  cursor: grabbing;
}

.card-link {
  text-decoration: none;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 8px 6px;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

.link-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2));
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 6px;
}

.link-item:hover .link-icon {
  transform: scale(1.15);
}

.link-text {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  max-width: 100%;
  padding: 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
  letter-spacing: 0.02em;
}

.card-selected-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(99, 179, 237, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: bold;
  z-index: 10;
}

.sortable-ghost {
  opacity: 0.4;
}

.sortable-chosen {
  box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.6);
  transform: scale(1.05);
}

.sortable-drag {
  opacity: 0.9;
  transform: rotate(1deg) scale(1.02);
}

.context-menu {
  position: fixed;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 6px 0;
  min-width: 160px;
  z-index: 9999;
  animation: contextMenuFadeIn 0.15s ease;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
  transition: background 0.15s ease;
}

.context-menu-item:hover {
  background: rgba(99, 179, 237, 0.3);
}

.context-menu-icon {
  margin-right: 10px;
  font-size: 14px;
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

.drag-hint {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
