<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1>欢迎回来</h1>
        <p class="subtitle">输入用户名和密码开始使用</p>
      </div>

      <form @submit.prevent="handleSubmit" class="login-form">
        <div class="form-group">
          <label for="username">用户名</label>
          <input
            id="username"
            v-model="formData.username"
            type="text"
            placeholder="请输入用户名"
            required
            :disabled="loading"
          />
        </div>

        <div class="form-group">
          <label for="password">密码</label>
          <input
            id="password"
            v-model="formData.password"
            type="password"
            placeholder="请输入密码"
            required
            :disabled="loading"
          />
        </div>

        <div class="error-message" v-if="error">
          {{ error }}
        </div>

        <button type="submit" class="submit-btn" :disabled="loading">
          <span v-if="loading">处理中...</span>
          <span v-else>登录 / 注册</span>
        </button>
      </form>

      <div class="password-hint">
        <h4>密码要求：</h4>
        <ul>
          <li>至少 8 个字符</li>
          <li>包含以下至少 3 种：大写字母、小写字母、数字、特殊字符</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { login } from '../api';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const formData = ref({
  username: '',
  password: ''
});

const validateForm = () => {
  if (!formData.value.username || formData.value.username.length < 3) {
    error.value = '用户名至少 3 个字符';
    return false;
  }

  if (!formData.value.username.match(/^[a-zA-Z0-9_]+$/)) {
    error.value = '用户名只能包含字母、数字和下划线';
    return false;
  }

  if (formData.value.username.length > 20) {
    error.value = '用户名最多 20 个字符';
    return false;
  }

  if (!formData.value.password || formData.value.password.length < 8) {
    error.value = '密码至少 8 个字符';
    return false;
  }

  if (formData.value.password.length > 128) {
    error.value = '密码最多 128 个字符';
    return false;
  }

  const hasUpperCase = /[A-Z]/.test(formData.value.password);
  const hasLowerCase = /[a-z]/.test(formData.value.password);
  const hasNumbers = /\d/.test(formData.value.password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'/`~]/.test(formData.value.password);

  const strength = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;

  if (strength < 3) {
    error.value = '密码必须包含以下至少 3 种：大写字母、小写字母、数字、特殊字符';
    return false;
  }

  return true;
};

const handleSubmit = async () => {
  if (!validateForm()) {
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const response = await login(formData.value.username, formData.value.password);
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('username', formData.value.username);
    
    if (response.data.isNewUser) {
      alert('欢迎新用户！已自动为您创建账号');
    }
    
    router.push('/');
  } catch (err) {
    error.value = err.response?.data?.error || err.message || '操作失败，请重试';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-box {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  padding: 40px;
  width: 100%;
  max-width: 400px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h1 {
  font-size: 28px;
  font-weight: 600;
  color: #333;
  margin: 0 0 10px 0;
}

.subtitle {
  color: #666;
  font-size: 14px;
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #555;
}

.form-group input {
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-group input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.error-message {
  background-color: #fee;
  color: #c33;
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
}

.submit-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 10px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-mode {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: #666;
}

.toggle-mode a {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
}

.toggle-mode a:hover {
  text-decoration: underline;
}

.password-hint {
  margin-top: 20px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 6px;
  font-size: 13px;
  color: #666;
}

.password-hint h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #333;
}

.password-hint ul {
  margin: 0;
  padding-left: 20px;
}

.password-hint li {
  margin: 5px 0;
}

@media (max-width: 480px) {
  .login-box {
    padding: 30px 20px;
  }

  .login-header h1 {
    font-size: 24px;
  }
}
</style>
