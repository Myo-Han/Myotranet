import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('Request body:', req.body);

        const { userId } = req.body || {};

        if (!userId) {
            console.error('userId missing');
            return res.status(400).json({ error: 'userId is required' });
        }

        const supabaseAdmin = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
        );

        console.log('Deleting user:', userId);

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