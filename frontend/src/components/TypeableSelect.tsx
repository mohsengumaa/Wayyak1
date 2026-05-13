"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type ReactElement,
} from "react";

type OptionItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type TypeableSelectProps = {
  value?: string | number | null;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  onBlur?: (event: ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  children: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  /** نص يظهر فوق الحقل */
  label?: string;
  labelClassName?: string;
  /** عند false: يبقى نص الاختيار الحالي عند الفتح (السلوك القديم) */
  clearSearchOnOpen?: boolean;
  /** عند عدم وجود قيمة، إظهار الحقل فارغاً والاعتماد على placeholder */
  emptyWhenUnselected?: boolean;
};

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return textFromNode(el.props.children);
  }
  return "";
}

function extractOptions(children: ReactNode): OptionItem[] {
  const options: OptionItem[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>;
    if (child.type === "option") {
      options.push({
        value: String(el.props.value ?? ""),
        label: textFromNode(el.props.children) || String(el.props.value ?? ""),
        disabled: Boolean(el.props.disabled),
      });
      return;
    }
    if (child.type === "optgroup") {
      const og = child as ReactElement<{ children?: ReactNode }>;
      Children.forEach(og.props.children, (optionChild) => {
        if (!isValidElement(optionChild) || optionChild.type !== "option") return;
        const oc = optionChild as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>;
        options.push({
          value: String(oc.props.value ?? ""),
          label: textFromNode(oc.props.children) || String(oc.props.value ?? ""),
          disabled: Boolean(oc.props.disabled),
        });
      });
    }
  });
  return options;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

export default function TypeableSelect({
  value,
  onChange,
  onBlur,
  className = "w-full rounded-md border border-zinc-200 px-3 py-2 text-sm",
  children,
  placeholder,
  disabled,
  required,
  name,
  id,
  "aria-label": ariaLabel,
  label,
  labelClassName = "mb-1 block text-xs font-semibold text-zinc-700",
  clearSearchOnOpen = true,
  emptyWhenUnselected = true,
}: TypeableSelectProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const safeValue = value == null ? "" : String(value);
  // Do not memoize on `children` alone — option lists can update while the children wrapper stays referentially stable.
  const options = extractOptions(children);

  const emptyOptionLabel = useMemo(
    () => options.find((o) => o.value === "")?.label?.trim(),
    [options],
  );
  const effectivePlaceholder =
    placeholder ?? (emptyOptionLabel && emptyOptionLabel.length > 0 ? emptyOptionLabel : undefined);

  const selectedOption = options.find((option) => option.value === safeValue);
  const closedDisplay =
    safeValue === ""
      ? emptyWhenUnselected
        ? ""
        : (options.find((o) => o.value === "")?.label ?? "")
      : (selectedOption?.label ?? safeValue);

  const inputValue = isOpen ? draftValue : closedDisplay;

  const filteredOptions = useMemo(() => {
    const searchRaw = String(draftValue || "").trim();
    if (!searchRaw) return options;
    const ns = norm(searchRaw);
    const byPrefix = options.filter((option) => {
      if (option.disabled) return false;
      return norm(option.label).startsWith(ns) || norm(option.value).startsWith(ns);
    });
    return byPrefix.length > 0 ? byPrefix : options.filter((o) => !o.disabled);
  }, [draftValue, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setDraftValue("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const emitChange = (nextValue: string) => {
    onChange?.({ target: { value: nextValue } } as ChangeEvent<HTMLSelectElement>);
  };

  const openAndClearSearch = () => {
    if (clearSearchOnOpen) setDraftValue("");
    else setDraftValue(closedDisplay);
    setIsOpen(true);
  };

  const control = (
    <div className="relative w-full min-w-0">
      <input
        id={id}
        name={name}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        value={inputValue}
        placeholder={effectivePlaceholder}
        disabled={disabled}
        required={required}
        autoComplete="off"
        className={`${className} block w-full max-w-full min-w-0 truncate pr-10`}
        onFocus={() => {
          openAndClearSearch();
        }}
        onChange={(e) => {
          const nextText = e.target.value;
          setDraftValue(nextText);
          setIsOpen(true);
          const normalized = norm(nextText);
          const matched = options.find(
            (option) =>
              !option.disabled &&
              (norm(option.label) === normalized || norm(option.value) === normalized),
          );
          if (matched) emitChange(matched.value);
        }}
        onBlur={(e) => {
          onBlur?.({ target: { value: e.target.value } } as ChangeEvent<HTMLSelectElement>);
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md border-l border-zinc-200 bg-zinc-50 text-zinc-600"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              if (clearSearchOnOpen) setDraftValue("");
              else setDraftValue(closedDisplay);
            } else {
              setDraftValue("");
            }
            return next;
          });
        }}
      >
        <span className="text-xs leading-none">&#9662;</span>
      </button>
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative min-w-0 max-w-full">
      {label ? (
        <label htmlFor={id} className={labelClassName}>
          {label}
        </label>
      ) : null}
      {control}
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute inset-x-0 z-40 mt-1 max-h-56 overflow-auto rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {filteredOptions.map((option) => (
            <button
              key={`${id || name || "typeable"}-${option.value}-${option.label}`}
              type="button"
              disabled={option.disabled}
              className="block w-full truncate px-3 py-2 text-left hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                emitChange(option.value);
                setDraftValue("");
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
