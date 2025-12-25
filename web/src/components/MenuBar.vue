<template>
  <nav class="menu-bar" :class="{ 'edit-mode': editMode }">
    <div 
      v-for="menu in menus" 
      :key="menu.id" 
      class="menu-item"
      @mouseenter="showSubMenu(menu.id)"
      @mouseleave="hideSubMenu(menu.id)"
    >
      <button 
        @click="handleMenuClick(menu)" 
        :class="{active: menu.id === activeId}"
      >
        {{ menu.name }}
      </button>
      
      <!-- 编辑模式下的操作按钮 -->
      <div v-if="editMode" class="menu-actions">
        <button class="action-btn edit-btn" @click.stop="$emit('editMenu', menu)" title="编辑">✏️</button>
        <button class="action-btn del-btn" @click.stop="$emit('deleteMenu', menu)" title="删除">🗑️</button>
      </div>
      
      <!-- 二级菜单 -->
      <div 
        v-if="menu.subMenus && menu.subMenus.length > 0 || editMode" 
        class="sub-menu"
        :class="{ 'show': hoveredMenuId === menu.id }"
      >
        <div v-for="subMenu in menu.subMenus" :key="subMenu.id" class="sub-menu-row">
          <button 
            @click="$emit('select', subMenu, menu)"
            :class="{active: subMenu.id === activeSubMenuId}"
            class="sub-menu-item"
          >
            {{ subMenu.name }}
          </button>
          <div v-if="editMode" class="sub-menu-actions">
            <button class="action-btn-sm" @click.stop="$emit('editSubMenu', subMenu, menu)" title="编辑">✏️</button>
            <button class="action-btn-sm" @click.stop="$emit('deleteSubMenu', subMenu, menu)" title="删除">🗑️</button>
          </div>
        </div>
        <!-- 编辑模式下添加子菜单按钮 -->
        <button v-if="editMode" class="add-sub-menu-btn" @click.stop="$emit('addSubMenu', menu)">
          + 添加子菜单
        </button>
      </div>
    </div>
    
    <!-- 编辑模式下添加菜单按钮 -->
    <div v-if="editMode" class="menu-item add-menu-item">
      <button class="add-menu-btn" @click="$emit('addMenu')">+ 添加菜单</button>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({ 
  menus: Array, 
  activeId: Number,
  activeSubMenuId: Number,
  editMode: Boolean
});

const emit = defineEmits(['select', 'addMenu', 'editMenu', 'deleteMenu', 'addSubMenu', 'editSubMenu', 'deleteSubMenu']);

const hoveredMenuId = ref(null);

function handleMenuClick(menu) {
  emit('select', menu);
}

function showSubMenu(menuId) {
  hoveredMenuId.value = menuId;
}

function hideSubMenu(menuId) {
  setTimeout(() => {
    if (hoveredMenuId.value === menuId) {
      hoveredMenuId.value = null;
    }
  }, 100);
}
</script>

<style scoped>
.menu-bar {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  padding: 0 1rem;
  position: relative;
}

.menu-item {
  position: relative;
}

.menu-bar button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  padding: 0.8rem 2rem;
  cursor: pointer;
  transition: all 0.3s ease;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  box-shadow: none;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.menu-bar button::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: #399dff;
  transition: all 0.3s ease;
  transform: translateX(-50%);
}

.menu-bar button:hover {
  color: #399dff;
  transform: translateY(-1px);
}

.menu-bar button.active {
  color: #399dff;
}

.menu-bar button.active::before {
  width: 60%;
}

/* 编辑模式样式 */
.menu-bar.edit-mode .menu-item {
  border: 1px dashed rgba(99, 179, 237, 0.4);
  border-radius: 8px;
  margin: 0 2px;
}

.menu-actions {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  gap: 2px;
  z-index: 10;
}

.action-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  transform: scale(1.1);
}

.action-btn.edit-btn:hover {
  background: rgba(99, 179, 237, 0.8);
}

.action-btn.del-btn:hover {
  background: rgba(245, 101, 101, 0.8);
}

/* 二级菜单样式 */
.sub-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  min-width: 140px;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 1000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  margin-top: -2px;
  padding: 4px 0;
}

.sub-menu.show {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(2px);
}

.sub-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.sub-menu-item {
  flex: 1;
  display: block !important;
  text-align: left !important;
  padding: 0.4rem 0.8rem !important;
  border: none !important;
  background: transparent !important;
  color: #fff !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  border-radius: 4px !important;
  text-shadow: none !important;
  line-height: 1.5 !important;
}

.sub-menu-item:hover {
  background: rgba(57, 157, 255, 0.25) !important;
  color: #399dff !important;
  transform: none !important;
}

.sub-menu-item.active {
  background: rgba(57, 157, 255, 0.35) !important;
  color: #399dff !important;
  font-weight: 500 !important;
}

.sub-menu-item::before {
  display: none;
}

.sub-menu-actions {
  display: flex;
  gap: 2px;
  padding-right: 4px;
}

.action-btn-sm {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn-sm:hover {
  background: rgba(99, 179, 237, 0.6);
}

.add-sub-menu-btn {
  width: 100% !important;
  padding: 0.4rem 0.8rem !important;
  margin-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: rgba(99, 179, 237, 0.8) !important;
  font-size: 12px !important;
  border-radius: 0 !important;
}

.add-sub-menu-btn:hover {
  background: rgba(99, 179, 237, 0.2) !important;
  color: #399dff !important;
}

.add-sub-menu-btn::before {
  display: none;
}

/* 添加菜单按钮 */
.add-menu-item {
  border: 1px dashed rgba(99, 179, 237, 0.6) !important;
}

.add-menu-btn {
  color: rgba(99, 179, 237, 0.8) !important;
  font-size: 14px !important;
}

.add-menu-btn:hover {
  color: #399dff !important;
  background: rgba(99, 179, 237, 0.15) !important;
}

.add-menu-btn::before {
  display: none;
}

@media (max-width: 768px) {
  .menu-bar {
    gap: 0.2rem;
  }
  
  .menu-bar button {
    font-size: 14px;
    padding: .4rem .8rem;
  }
  
  .sub-menu {
    min-width: 120px;
  }
  
  .sub-menu-item {
    font-size: 12px !important;
    padding: 0.3rem 0.6rem !important;
  }
  
  .action-btn {
    width: 18px;
    height: 18px;
    font-size: 8px;
  }
  
  .action-btn-sm {
    width: 16px;
    height: 16px;
    font-size: 8px;
  }
}
</style>
