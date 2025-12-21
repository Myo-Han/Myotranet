import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';

interface LettersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LettersModal: React.FC<LettersModalProps> = ({ isOpen, onClose }) => {
  const handleClose = () => {
    setForm({ title: '', content: '', isAnonymous: true });
    onClose();
  };
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ title: '', content: '', isAnonymous: true });

  const submitLetter = async () => {
    if (!form.title || !form.content) return;
    try {
      const { error } = await supabase.from('letters').insert([{
        ...form,
        user_id: user?.id,
        to_use_id: form.isAnonymous ? '익명' : user?.name
      }]);
      if (error) throw error;
      setSuccess('편지가 전송되었습니다.');
      setForm({ title: '', content: '', isAnonymous: false });
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-2xl font-bold text-black">마음의 편지</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        {error && <ErrorMessage message={error} />}
        {success && <SuccessMessage message={success} />}

        <div className="mb-6">
          <p className="text-gray-600 text-sm">고충이나 불편사항, 칭찬 등 어떠한 이야기라도 좋습니다.</p>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border mb-6">
          <input
            className="w-full mb-2 p-2 border rounded"
            placeholder="제목"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            className="w-full mb-2 p-2 border rounded h-32"
            placeholder="내용"
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
          />
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="anonymous"
              checked={form.isAnonymous}
              onChange={e => setForm({ ...form, isAnonymous: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="anonymous" className="text-sm">익명으로 보내기</label>
          </div>
          <div className="flex">
            <button
              onClick={submitLetter}
              style={{ backgroundColor: '#4b4d51' }}
              className="flex-1 text-white py-2 rounded font-bold"
            >
              보내기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LettersModal;