import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_lib/requireAdmin.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId } = req.body || {};

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const supabaseAdmin = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
        );

        const authCheck = await requireAdmin(supabaseAdmin, req);
        if (authCheck.error) {
            return res.status(authCheck.status).json({ error: authCheck.error });
        }

        // 초대 시 미리 만들어둔 직원 프로필(public.users)이 있다면 함께 정리
        await supabaseAdmin.from('users').delete().eq('id', userId);

        await supabaseAdmin
            .from('user_read_logs')
            .delete()
            .eq('target_id', userId)
            .eq('target_type', 'user-invite');

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (error) {
            console.error('Supabase delete error:', error);
            throw error;
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        return res.status(500).json({ error: error.message, stack: error.stack });
    }
}
