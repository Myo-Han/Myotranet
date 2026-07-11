import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_lib/requireAdmin.js';

const ALLOWED_ORIGINS = [
  'https://myotranet.vercel.app',
  'https://myotranet-myo-han.vercel.app',
  'https://myotranet-git-main-myo-han.vercel.app',
  'http://localhost:5173',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const authCheck = await requireAdmin(supabaseAdmin, req);
    if (authCheck.error) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const {
      email,
      name,
      role = 'User',
      gender,
      hire_date,
      department,
      position,
      project,
      part,
      origin,
    } = req.body || {};

    if (!email || !name) {
      return res.status(400).json({ error: '이메일과 이름은 필수입니다' });
    }

    const redirectOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    // 이미 등록된 이메일인지 확인 (재초대 처리)
    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;

    if (existingProfile) {
      const { data: existingAuthUser, error: existingAuthError } =
        await supabaseAdmin.auth.admin.getUserById(existingProfile.id);

      if (existingAuthError) throw existingAuthError;

      if (existingAuthUser?.user?.last_sign_in_at) {
        return res.status(409).json({ error: '이미 로그인한 적이 있는 계정입니다. 다시 초대할 필요가 없습니다.' });
      }

      const { error: resendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectOrigin,
        data: { name },
      });
      if (resendError) throw resendError;

      return res.status(200).json({ resent: true });
    }

    // 신규 초대: auth 계정 생성 + 초대 메일 발송
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectOrigin,
      data: { name },
    });
    if (inviteError) throw inviteError;

    const newUserId = inviteData.user.id;

    // 직원 프로필 즉시 생성 (초대 수락 전에도 관리자가 배정한 정보가 반영되도록)
    const { data: insertedUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: newUserId,
        email,
        name,
        role,
        gender: gender || null,
        hire_date: hire_date || null,
        department: department || null,
        position: position || null,
        project: project || null,
        part: part || null,
        is_active: true,
        annual_leave_balance: 0,
      })
      .select()
      .single();

    if (insertError) {
      // 롤백: 방금 생성한 auth 계정 삭제 (프로필 없는 유령 계정 방지)
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw insertError;
    }

    return res.status(200).json({ user: insertedUser });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
