import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_lib/requireAdmin.js';

const ALLOWED_ORIGINS = [
  'https://myotranet.vercel.app',
  'https://myotranet-myo-han.vercel.app',
  'https://myotranet-git-main-myo-han.vercel.app',
  'http://localhost:5173',
];

// auth.users는 PostgREST로 직접 조회할 수 없어서, 이메일로 기존 auth 계정을 찾을 때
// admin.listUsers()를 페이지별로 순회하며 이메일을 대조한다. (소규모 조직 기준으로 충분)
async function findAuthUserByEmail(supabaseAdmin, email) {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = (data?.users || []).find((u) => (u.email || '').toLowerCase() === target);
    if (found) return found;
    if (!data?.users || data.users.length < perPage) return null;
    page += 1;
  }
}

async function createProfile(supabaseAdmin, { id, email, name, role, gender, hire_date, department, position, project, part }) {
  return supabaseAdmin
    .from('users')
    .insert({
      id,
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
}

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

    // 이미 프로필(public.users)이 있는 이메일인지 확인 (재초대 처리)
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

    if (inviteError) {
      // "이미 가입된 이메일입니다" 류의 에러: public.users엔 프로필이 없지만
      // auth.users엔 이미 (예전 구글 로그인 등으로) 계정이 남아있는 경우.
      // -> 새로 초대 메일을 보낼 필요 없이, 기존 auth 계정에 프로필만 다시 연결해준다.
      const looksLikeAlreadyRegistered =
        /already.*(registered|exists)/i.test(inviteError.message || '') ||
        inviteError.code === 'email_exists';

      if (!looksLikeAlreadyRegistered) throw inviteError;

      const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email);
      if (!existingAuthUser) throw inviteError;

      const { data: insertedUser, error: insertError } = await createProfile(supabaseAdmin, {
        id: existingAuthUser.id,
        email,
        name,
        role,
        gender,
        hire_date,
        department,
        position,
        project,
        part,
      });

      if (insertError) throw insertError;

      return res.status(200).json({ user: insertedUser, linkedExisting: true });
    }

    const newUserId = inviteData.user.id;

    // 직원 프로필 즉시 생성 (초대 수락 전에도 관리자가 배정한 정보가 반영되도록)
    const { data: insertedUser, error: insertError } = await createProfile(supabaseAdmin, {
      id: newUserId,
      email,
      name,
      role,
      gender,
      hire_date,
      department,
      position,
      project,
      part,
    });

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
