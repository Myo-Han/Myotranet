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

    // 3) Jenkins에서 브랜치 목록 가져오기
    let branches = [];
    try {
      const jenkinsUrl = process.env.JENKINS_URL;
      const jenkinsUser = process.env.JENKINS_USER;
      const jenkinsToken = process.env.JENKINS_API_TOKEN;
      const jobName = process.env.JENKINS_JOB_NAME;

      if (jenkinsUrl && jenkinsUser && jenkinsToken && jobName) {
        const auth = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');
        const baseUrl = jenkinsUrl.replace(/\/$/, '');
        const jobUrl = `${baseUrl}/job/${encodeURIComponent(jobName)}/api/json?tree=scm[branches[name]]`;

        console.log('🔗 Jenkins API 호출:', jobUrl);

        const response = await fetch(jobUrl, {
          headers: { Authorization: `Basic ${auth}` }
        });

        if (response.ok) {
          const jobData = await response.json();

          console.log('📦 Jenkins 응답:', JSON.stringify(jobData, null, 2));

          // SCM에서 브랜치 추출
          if (jobData.scm && jobData.scm.branches) {
            branches = jobData.scm.branches.map(b => b.name);
            console.log('✅ 브랜치 추출 성공:', branches);
          }
        } else {
          console.error('❌ Jenkins API 실패:', response.status, response.statusText);
        }
      } else {
        console.log('⚠️ Jenkins 환경 변수 부족');
      }

      // Jenkins에서 못 가져왔으면 기본값
      if (branches.length === 0) {
        branches = ['dev', 'main'];
        console.log('⚠️ 기본 브랜치 사용');
      }

      // Git에서 사용하는 형식으로 변환 (*/브랜치명 제거)
      branches = branches.map(b => b.replace(/^\*\//, ''));
    } catch (err) {
      console.error('❌ Jenkins 브랜치 조회 실패:', err);
      branches = ['*/dev', '*/main'];
    }

    console.log('✅ 최종 응답:', { project, branches });

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