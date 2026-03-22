import { create } from 'zustand';

let toastTimerId = null;

export const useUiStore = create((set) => ({
  toast: null,

  showToast: (message, variant = 'info') => {
    clearTimeout(toastTimerId);
    set({ toast: { message, variant } });
    toastTimerId = setTimeout(() => set({ toast: null }), 3000);
  },
}));

export const selectToast     = (s) => s.toast;
export const selectShowToast = (s) => s.showToast;
