import { ref } from 'vue'

// Toast state
const toasts = ref([])
let toastId = 0

// Confirm dialog state
const confirmDialog = ref({
    visible: false,
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Hủy',
    type: 'warning', // 'warning', 'danger', 'info'
    resolve: null,
})

// Add toast notification
function toast(message, type = 'info', duration = 3000) {
    const id = ++toastId
    toasts.value.push({ id, message, type })

    if (duration > 0) {
        setTimeout(() => {
            removeToast(id)
        }, duration)
    }

    return id
}

function removeToast(id) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
        toasts.value.splice(index, 1)
    }
}

// Shorthand methods
toast.success = (message, duration) => toast(message, 'success', duration)
toast.error = (message, duration) => toast(message, 'error', duration)
toast.warning = (message, duration) => toast(message, 'warning', duration)
toast.info = (message, duration) => toast(message, 'info', duration)

// Custom confirm dialog (returns Promise)
function confirm(message, options = {}) {
    return new Promise((resolve) => {
        confirmDialog.value = {
            visible: true,
            title: options.title || 'Xác nhận',
            message,
            confirmText: options.confirmText || 'OK',
            cancelText: options.cancelText || 'Hủy',
            type: options.type || 'warning',
            resolve,
        }
    })
}

function resolveConfirm(result) {
    if (confirmDialog.value.resolve) {
        confirmDialog.value.resolve(result)
    }
    confirmDialog.value.visible = false
}

export function useToast() {
    return {
        toasts,
        toast,
        removeToast,
        confirmDialog,
        confirm,
        resolveConfirm,
    }
}
