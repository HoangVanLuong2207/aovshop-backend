<template>
  <!-- Toast Container -->
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div 
          v-for="t in toasts" 
          :key="t.id" 
          :class="['toast', `toast-${t.type}`]"
          @click="removeToast(t.id)"
        >
          <span class="toast-icon">
            <svg v-if="t.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <svg v-else-if="t.type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <svg v-else-if="t.type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </span>
          <span class="toast-message">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>

    <!-- Confirm Dialog -->
    <Transition name="confirm-overlay">
      <div v-if="confirmDialog.visible" class="confirm-overlay" @click.self="resolveConfirm(false)">
        <Transition name="confirm-modal" appear>
          <div class="confirm-modal" :class="`confirm-${confirmDialog.type}`">
            <div class="confirm-icon">
              <svg v-if="confirmDialog.type === 'danger'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <h3 class="confirm-title">{{ confirmDialog.title }}</h3>
            <p class="confirm-message">{{ confirmDialog.message }}</p>
            <div class="confirm-actions">
              <button class="btn btn-secondary" @click="resolveConfirm(false)">
                {{ confirmDialog.cancelText }}
              </button>
              <button 
                :class="['btn', confirmDialog.type === 'danger' ? 'btn-danger' : 'btn-primary']" 
                @click="resolveConfirm(true)"
              >
                {{ confirmDialog.confirmText }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { useToast } from '../composables/useToast'

const { toasts, removeToast, confirmDialog, resolveConfirm } = useToast()
</script>

<style scoped>
/* Toast Container */
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 400px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transition: all 0.2s;
}

.toast:hover {
  transform: translateX(-4px);
}

.toast-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.toast-icon svg {
  width: 100%;
  height: 100%;
}

.toast-message {
  font-size: 0.9375rem;
  color: var(--text, #f8fafc);
  line-height: 1.4;
}

/* Toast Types */
.toast-success {
  border-left: 4px solid #10b981;
}
.toast-success .toast-icon { color: #10b981; }

.toast-error {
  border-left: 4px solid #ef4444;
}
.toast-error .toast-icon { color: #ef4444; }

.toast-warning {
  border-left: 4px solid #f59e0b;
}
.toast-warning .toast-icon { color: #f59e0b; }

.toast-info {
  border-left: 4px solid #6366f1;
}
.toast-info .toast-icon { color: #6366f1; }

/* Toast Animations */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

/* Confirm Overlay */
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 1rem;
}

.confirm-modal {
  background: linear-gradient(135deg, var(--bg-secondary, #1a1a2e), var(--bg-tertiary, #252540));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 2rem;
  width: 100%;
  max-width: 380px;
  text-align: center;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.confirm-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto 1.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-icon svg {
  width: 32px;
  height: 32px;
}

.confirm-warning .confirm-icon {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.confirm-danger .confirm-icon {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.confirm-info .confirm-icon {
  background: rgba(99, 102, 241, 0.15);
  color: #6366f1;
}

.confirm-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text, #f8fafc);
  margin: 0 0 0.5rem;
}

.confirm-message {
  color: var(--text-secondary, #94a3b8);
  margin: 0 0 1.5rem;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.confirm-actions .btn {
  flex: 1;
  padding: 0.875rem 1.5rem;
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  border: none;
}

.btn-danger:hover {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
}

/* Confirm Animations */
.confirm-overlay-enter-active,
.confirm-overlay-leave-active {
  transition: opacity 0.25s ease;
}

.confirm-overlay-enter-from,
.confirm-overlay-leave-to {
  opacity: 0;
}

.confirm-modal-enter-active,
.confirm-modal-leave-active {
  transition: all 0.25s ease;
}

.confirm-modal-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

.confirm-modal-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
}
</style>
