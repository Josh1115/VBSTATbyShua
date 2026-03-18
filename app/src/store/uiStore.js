import { create } from 'zustand';

export const useUiStore = create((set) => ({
  toast: null,
  serveZonePending: null, // null | contactId

  showToast: (message, variant = 'info') => {
    set({ toast: { message, variant } });
    setTimeout(() => set({ toast: null }), 3000);
  },
  showServeZonePicker: (contactId) => set({ serveZonePending: contactId }),
  clearServeZonePicker: () => set({ serveZonePending: null }),
}));

export const selectToast               = (s) => s.toast;
export const selectShowToast           = (s) => s.showToast;
export const selectServeZonePending    = (s) => s.serveZonePending;
export const selectShowServeZonePicker = (s) => s.showServeZonePicker;
export const selectClearServeZonePicker = (s) => s.clearServeZonePicker;
