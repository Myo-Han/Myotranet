// api/build.js  (Vercel 서버리스 함수)

export default async function handler(req, res) {
  try {
    // 1. 메서드 체크
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.json({ message: 'POST 메서드만 허용됩니다.' });
    }

    // 2. body / 비밀번호 체크
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});

    const password = (body.password ?? '').toString().trim();
    const branch = (body.branch ?? '').toString().trim();
    const version = (body.version ?? '').toString().trim();
    const memo = (body.memo ?? '').toString().trim();
    const executorName = (body.executorName ?? '알 수 없음').toString().trim();
    const envPassword = (process.env.BUILD_PASSWORD ?? '').toString().trim();

    if (!password) {
      res.statusCode = 400;
      return res.json({ message: '비밀번호가 필요합니다.' });
    }

    if (!envPassword) {
      res.statusCode = 500;
      return res.json({ message: '서버에 빌드 비밀번호가 설정되어 있지 않습니다.' });
    }

    if (password !== envPassword) {
      res.statusCode = 401;
      return res.json({ message: '빌드 비밀번호가 일치하지 않습니다.' });
    }

    // 3. Jenkins 환경 변수 읽기
    const jenkinsUrl = process.env.JENKINS_URL;
    const jenkinsUser = process.env.JENKINS_USER;
    const jenkinsToken = process.env.JENKINS_API_TOKEN;
    const jobName = process.env.JENKINS_JOB_NAME;
    const jobToken = process.env.JENKINS_JOB_TOKEN;

    if (!jenkinsUrl || !jenkinsUser || !jenkinsToken || !jobName || !jobToken) {
      res.statusCode = 500;
      return res.json({
        message: 'Jenkins 설정이 완전히 되어 있지 않습니다.',
        hasUrl: !!jenkinsUrl,
        hasUser: !!jenkinsUser,
        hasToken: !!jenkinsToken,
        hasJobName: !!jobName,
        hasJobToken: !!jobToken,
      });
    }

    const baseUrl = jenkinsUrl.replace(/\/$/, '');
    const auth = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');

    // 4. Crumb 먼저 가져오기
    async function getJenkinsCrumb() {
      const resp = await fetch(`${baseUrl}/crumbIssuer/api/json`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      if (!resp.ok) {
        // CSRF가 아예 꺼져 있으면 보통 404 나옴 → 그땐 Crumb 없이 진행
        if (resp.status === 404) {
          console.log('crumbIssuer 404: CSRF 비활성화로 추정, Crumb 없이 진행');
          return null;
        }

        throw new Error(`Jenkins crumb 발급 실패 (상태코드: ${resp.status})`);
      }

      const data = await resp.json();
      return {
        headerName: data.crumbRequestField,
        crumb: data.crumb,
      };
    }

    const crumbInfo = await getJenkinsCrumb();

    const headers = {
      Authorization: `Basic ${auth}`,
    };

    if (crumbInfo && crumbInfo.headerName && crumbInfo.crumb) {
      headers[crumbInfo.headerName] = crumbInfo.crumb;
    }

    // 5. Jenkins Job 빌드 트리거
    const params = new URLSearchParams({
      token: jobToken,
      BRANCH: branch,
      VERSION: version,
      MEMO: memo,
      EXECUTOR_NAME: executorName,
    });

    const jenkinsBuildUrl =
      `${baseUrl}/job/${encodeURIComponent(jobName)}/buildWithParameters?${params.toString()}`;

    const forwardRes = await fetch(jenkinsBuildUrl, {
      method: 'POST',
      headers,
    });

    const text = await forwardRes.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text || '알 수 없는 응답' };
    }

    res.statusCode = forwardRes.status;
    return res.json(data);
  } catch (err) {
    console.error('Vercel /api/build 에러:', err);
    res.statusCode = 500;
    return res.json({
      message: '빌드 API 중간 포워딩 오류',
      error: String(err),
    });
  }
}