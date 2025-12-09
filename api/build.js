// api/build.js
// Vercel 서버리스 함수용 백엔드

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.json({ message: 'POST 메서드만 허용됩니다.' });
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyString = Buffer.concat(chunks).toString('utf8');
    let body = {};
    try {
      body = JSON.parse(bodyString || '{}');
    } catch {
      body = {};
    }

    const password = body.password;

    if (!password) {
      res.statusCode = 400;
      return res.json({ message: '비밀번호가 필요합니다.' });
    }

    if (password !== process.env.BUILD_PASSWORD) {
      res.statusCode = 401;
      return res.json({ message: '빌드 비밀번호가 일치하지 않습니다.' });
    }

    const jenkinsUrl = process.env.JENKINS_URL;
    const jenkinsUser = process.env.JENKINS_USER;
    const jenkinsToken = process.env.JENKINS_API_TOKEN;
    const jobName = process.env.JENKINS_JOB_NAME;
    const jobToken = process.env.JENKINS_JOB_TOKEN;

    if (!jenkinsUrl || !jenkinsUser || !jenkinsToken || !jobName || !jobToken) {
      res.statusCode = 500;
      return res.json({ message: 'Jenkins 환경변수가 부족합니다.' });
    }

    const auth = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');
    const url =
      `${jenkinsUrl.replace(/\/$/, '')}` +
      `/job/${encodeURIComponent(jobName)}/build?token=${encodeURIComponent(jobToken)}`;

    const jenkinsResponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (
      !jenkinsResponse.ok &&
      jenkinsResponse.status !== 201 &&
      jenkinsResponse.status !== 202
    ) {
      res.statusCode = 500;
      return res.json({
        message: `Jenkins 호출 실패 (상태코드: ${jenkinsResponse.status})`,
      });
    }

    res.statusCode = 200;
    return res.json({ message: 'Jenkins 빌드를 시작했습니다.' });
  } catch (err) {
    console.error('빌드 API 에러:', err);
    res.statusCode = 500;
    return res.json({ message: '빌드 API 처리 중 오류가 발생했습니다.' });
  }
};
