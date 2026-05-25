import React, { useState, useEffect, useRef } from 'react';
import { useModalStore } from '../store/modalStore';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, FileQuestion, HelpCircle, X } from 'lucide-react';

export default function ModalProvider() {
  const { currentModal, closeModal } = useModalStore();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentModal && currentModal.type === 'prompt') {
      setInputValue(currentModal.defaultValue || '');
      // Focus after slight delay for animation
      setTimeout(() => {
         inputRef.current?.focus();
      }, 100);
    } else if (currentModal && currentModal.type === 'select') {
      setInputValue(currentModal.defaultValue || (currentModal.options?.[0]?.value ?? ''));
    }
  }, [currentModal]);

  if (!currentModal) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentModal.type === 'prompt' || currentModal.type === 'select') {
      closeModal(inputValue);
    } else if (currentModal.type === 'confirm') {
      closeModal(true);
    } else {
      closeModal();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => closeModal()}
        />
        <motion.div
           initial={{ opacity: 0, scale: 0.95, y: 10 }}
           animate={{ opacity: 1, scale: 1, y: 0 }}
           exit={{ opacity: 0, scale: 0.95, y: 10 }}
           className="relative w-full max-w-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
        >
           <form onSubmit={handleSubmit}>
              <div className="px-6 py-5">
                <div className="flex items-start gap-4 mb-4">
                   <div className={`p-2 rounded-full shrink-0 ${
                       currentModal.type === 'alert' ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 
                       currentModal.type === 'confirm' ? 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-650 dark:text-yellow-405' : 
                       'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                   }`}>
                      {currentModal.type === 'alert' && <AlertCircle className="w-6 h-6" />}
                      {currentModal.type === 'confirm' && <HelpCircle className="w-6 h-6" />}
                      {(currentModal.type === 'prompt' || currentModal.type === 'select') && <FileQuestion className="w-6 h-6" />}
                   </div>
                   <div className="mt-1 flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 leading-tight">{currentModal.title}</h3>
                      {currentModal.message && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{currentModal.message}</p>
                      )}
                   </div>
                </div>

                {currentModal.type === 'prompt' && (
                   <div className="mt-4">
                     <input 
                       ref={inputRef}
                       type="text" 
                       value={inputValue}
                       onChange={(e) => setInputValue(e.target.value)}
                       placeholder={currentModal.placeholder}
                       className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                     />
                   </div>
                )}

                {currentModal.type === 'select' && currentModal.options && (
                   <div className="mt-4">
                     <select
                       value={inputValue}
                       onChange={(e) => setInputValue(e.target.value)}
                       className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                     >
                       {currentModal.options.map((opt) => (
                         <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                           {opt.label}
                         </option>
                       ))}
                     </select>
                   </div>
                )}
              </div>
              
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                 {currentModal.type !== 'alert' && (
                    <button 
                      type="button" 
                      onClick={() => closeModal()}
                      className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-705 rounded-lg text-sm font-medium text-slate-705 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
                    >
                       Отмена
                    </button>
                 )}
                 <button 
                    type="submit"
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-colors cursor-pointer ${
                       currentModal.type === 'alert' ? 'bg-red-600 hover:bg-red-700' :
                       currentModal.type === 'confirm' ? 'bg-emerald-600 hover:bg-emerald-700' :
                       'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                 >
                    {currentModal.type === 'alert' ? 'ОК' :
                     currentModal.type === 'confirm' ? 'Подтвердить' :
                     'Сохранить'}
                 </button>
              </div>
           </form>
           
           <button 
             onClick={() => closeModal()}
             className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
             type="button"
           >
              <X className="w-5 h-5" />
           </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
