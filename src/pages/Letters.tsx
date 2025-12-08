import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Letter } from '../types';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';

const Letters: React.FC = () => {
  const { user } = useAuth();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    isAnonymous: false,
  });

  useEffect(() => {
    fetchLetters();
  }, []);

  const fetchLetters = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('letters')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLetters(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load letters');
    } finally {
      setLoading(false);
    }
  };

  const submitLetter = async () => {
    if (!user || !form.title || !form.content) {
      setError('제목과 내용을 입력해주세요');
      return;
    }

    try {
      const { error } = await supabase.from('letters').insert({
        from_user_id: user.id,
        to_user_id: null,
        title: form.title,
        body: form.content,
        is_anonymous: form.isAnonymous,
      });

      if (error) throw error;

      setSuccess('편지가 작성되었습니다');
      setShowModal(false);
      setForm({ title: '', content: '', isAnonymous: false });
      fetchLetters();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit letter');
    }
  };

  const deleteLetter = async (letterId: string) => {
    if (!confirm('정말 이 편지를 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('letters')
        .delete()
        .eq('id', letterId);

      if (error) throw error;

      setSuccess('편지가 삭제되었습니다');
      fetchLetters();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete letter');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">마음의 편지</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          편지 작성
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="space-y-4">
        {letters.map((letter) => (
          <div key={letter.id} className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center space-x-3">
                {letter.author_picture && !letter.is_anonymous && (
                  <img src={letter.author_picture} alt={letter.author_name || ''} className="h-10 w-10 rounded-full" />
                )}
                {letter.is_anonymous && (
                  <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                    <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {letter.is_anonymous ? '익명' : letter.author_name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(letter.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
              </div>
              {(user?.role === 'Admin' || user?.role === 'Manager') && (
                <button
                  onClick={() => deleteLetter(letter.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  삭제
                </button>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{letter.title}</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{letter.content}</p>
          </div>
        ))}

        {letters.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">아직 작성된 편지가 없습니다.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">편지 작성</h3>
            <div className="space-y-4">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={form.isAnonymous}
                    onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">익명으로 작성</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="제목을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={8}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="내용을 입력하세요"
                />
              </div>
            </div>
            <div className="mt-6 flex space-x-2">
              <button
                onClick={submitLetter}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                작성
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Letters;
