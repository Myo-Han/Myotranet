// pages/api/build-info.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../supabaseClient';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

type Data =
  | { message: string }
  | {
      projectKey: string;
      projectName: string;
      branches: string[];
      currentVersion: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'GET만 지원합니다.' });
  }

  const projectKey =
    typeof req.query.projectKey === 'string' ? req.query.projectKey : undefined;

  if (!projectKey) {
    return res.status(400).json({ message: 'projectKey가 필요합니다.' });
  }

  try {
    // 1) 프로젝트 버전 정보 조회
    const { data: row, error } = await supabase
      .from('project_versions')
      .select('id, project_key, project_name, current_version, repo_url')
      .eq('project_key', projectKey)
      .maybeSingle();

    if (error) {
      console.error('select project_versions error:', error);
      return res
        .status(500)
        .json({ message: '버전 정보를 조회하지 못했습니다.' });
    }

    let project = row;

    // 2) 없으면 0.0.1로 생성
    if (!project) {
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
        console.error('insert project_versions error:', insertError);
        return res
          .status(500)
          .json({ message: '버전 정보를 생성하지 못했습니다.' });
      }

      project = inserted;
    }

    const repoUrl = project.repo_url as string | null;

    let branches: string[] = [];

    // 3) repo_url 이 있으면 git에서 브랜치 목록 뽑기
    if (repoUrl) {
      try {
        // git ls-remote --heads <repo_url>
        const { stdout } = await execAsync(
          `git ls-remote --heads ${repoUrl}`
        );
        branches = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\t')[1]) // refs/heads/xxx
          .filter((ref) => ref.startsWith('refs/heads/'))
          .map((ref) => ref.replace('refs/heads/', ''));
      } catch (gitErr) {
        console.error('git ls-remote error:', gitErr);
        // git 실패하면 그냥 빈 배열로 둠
        branches = [];
      }
    }

    return res.status(200).json({
      projectKey: project.project_key,
      projectName: project.project_name,
      branches,
      currentVersion: project.current_version,
    });
  } catch (e) {
    console.error('build-info handler error:', e);
    return res
      .status(500)
      .json({ message: 'build-info 처리 중 오류가 발생했습니다.' });
  }
}
