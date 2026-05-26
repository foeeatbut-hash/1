import React, { useState, useEffect, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  className?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "-- выбрать --",
  className = "",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Sync focused index with selected value when opened
  useEffect(() => {
    if (isOpen) {
      const selectedIndex = options.findIndex((opt) => opt.value === value);
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, value, options]);

  const handleToggle = () => setIsOpen(!isOpen);

  const handleSelectOption = (optVal: string) => {
    onChange(optVal);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      if (isOpen) {
        setIsOpen(false);
      }
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          handleSelectOption(options[focusedIndex].value);
        }
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setFocusedIndex((prev) => (prev + 1) % options.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setFocusedIndex((prev) => (prev - 1 + options.length) % options.length);
      }
    }
  };

  // Scroll focused option into view
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (isOpen && focusedIndex >= 0) {
      const focusedButton = optionRefs.current[focusedIndex];
      if (focusedButton) {
        focusedButton.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex, isOpen]);

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`relative inline-block w-full text-left ${className}`}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-850/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-left min-h-8 font-medium"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 z-[999] mt-1 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1 max-h-60 overflow-y-auto style-scrollbar"
            role="listbox"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isFocused = idx === focusedIndex;

              return (
                <button
                  key={opt.value}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectOption(opt.value)}
                  className={`w-full text-left px-3 py-1.5 my-0.5 text-sm rounded-lg transition-all duration-100 flex items-center justify-between border-none cursor-pointer ${
                    isSelected
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold"
                      : isFocused
                      ? "bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-medium"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/60 font-medium"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-450 dark:text-slate-500 italic text-center">
                Нет доступных вариантов
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
