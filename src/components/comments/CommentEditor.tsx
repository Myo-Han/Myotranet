import React, { useEffect, useMemo, useState } from 'react';

type Props = {
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onSubmit: (content: string) => Promise<void> | void;
  onCancel?: () => void;
  maxLength?: number;
};

const CommentEditor: React.FC<Props> = ({
  placeholder = '댓글을 입력하세요',
  initialValue = '',
  submitLabel = '등록',
  cancelLabel = '취소',
  autoFocus = false,
  disabled = false,
  onSubmit,
  onCancel,
  maxLength = 2000,
}) => {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const trimmed = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const submit = async () => {
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSubmit(trimmed);
      setValue('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <textarea
        className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled || saving}
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {value.length}/{maxLength}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
              onClick={onCancel}
              disabled={disabled || saving}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={submit}
            disabled={disabled || saving || !trimmed}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentEditor;
