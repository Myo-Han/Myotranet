import { supabase } from '../src/supabaseClient';

/**
 * 특정 항목을 '읽음' 상태로 기록하는 공통 함수
 * @param userId 현재 로그인한 유저의 ID
 * @param type 항목 구분 (예: 'notice', 'todo', 'letter')
 * @param id 해당 항목의 고유 ID
 */
export const markAsRead = async (userId: string, type: string, id: string) => {
  if (!userId || !id) return;

  try {
    // upsert를 사용하면 이미 읽은 기록이 있을 경우 무시하고, 없을 경우에만 새로 생성합니다.
    const { error } = await supabase
      .from('user_read_logs')
      .upsert(
        { 
          user_id: userId, 
          target_type: type, 
          target_id: id 
        }, 
        { onConflict: 'user_id,target_type,target_id' } // 중복 기록 방지
      );

    if (error) {
      console.error(`[${type}] 읽음 처리 실패:`, error.message);
    }
  } catch (err) {
    console.error('읽음 처리 중 오류 발생:', err);
  }
};