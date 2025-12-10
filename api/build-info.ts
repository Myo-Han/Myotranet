// api/build-info.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'GET만 지원합니다.' });
  }

  const projectKey =
    typeof req.query.projectKey === 'string' ? req.query.projectKey : undefined;

  if (!projectKey) {
    return res.status(400).json({ message: 'projectKey가 필요합니다.' });
  }

  try {
    // Supabase 클라이언트 생성
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase 환경 변수 없음');
      return res.status(500).json({ message: 'Supabase 설정이 없습니다.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 프로젝트 조회:', projectKey);

    // 1) 프로젝트 버전 정보 조회
    const { data: row, error } = await supabase
      .from('project_versions')
      .select('id, project_key, project_name, current_version, repo_url')
      .eq('project_key', projectKey)
      .maybeSingle();

    if (error) {
      console.error('❌ select error:', error);
      return res.status(500).json({ 
        message: '버전 정보를 조회하지 못했습니다.',
        error: error.message 
      });
    }

    let project = row;

    // 2) 없으면 0.0.1로 생성
    if (!project) {
      console.log('📝 프로젝트 생성');
      const { data: inserted, error: insertError } = await supabase
        .from('project_versions')
        .insert({
          project_key: projectKey,
          project_name: projectKey,
          current_version: '0.0.1',
          repo_url: null,
        })
        .select('id, project_key, project_name, current_version, repo_url')
        .single();

      if (insertError) {
        console.error('❌ insert error:', insertError);
        return res.status(500).json({ 
          message: '버전 정보를 생성하지 못했습니다.',
          error: insertError.message 
        });
      }

      project = inserted;
    }

    // 3) 브랜치는 일단 빈 배열
    const branches = [];

    console.log('✅ 성공:', project);

    return res.status(200).json({
      projectKey: project.project_key,
      projectName: project.project_name,
      branches,
      currentVersion: project.current_version,
    });
  } catch (e) {
    console.error('❌ handler error:', e);
    return res.status(500).json({ 
      message: 'build-info 처리 중 오류가 발생했습니다.',
      error: String(e)
    });
  }
}