import React from 'react';
import { useToastStore } from '../store/toastStore';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export default function ToastProvider() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-20 right-4 z-[10000] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            onClick={() => {
              if (toast.onClick) {
                toast.onClick();
                removeToast(toast.id);
              }
            }}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-[400px] text-sm font-medium border transition-all duration-200 select-none
              ${toast.onClick ? 'cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-95' : ''}
              ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900/50 hover:border-emerald-450' : 
                toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900/50 hover:border-red-450' : 
                'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900/50 hover:border-emerald-450'}`}
          >
            <div className="mt-0.5 shrink-0">
                {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-emerald-500" />}
            </div>
            <p className="flex-1 whitespace-pre-wrap leading-relaxed">{toast.message}</p>
            <button onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }} className="opacity-50 hover:opacity-100 flex-shrink-0 mt-0.5 text-slate-500 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
