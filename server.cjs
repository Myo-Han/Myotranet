const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');

// .env 강제 로드
const dotenvResult = dotenv.config({
  path: path.join(__dirname, '.env'),
});

if (dotenvResult.error) {
  console.log('dotenv 로드 에러:', dotenvResult.error);
} else {
  console.log('dotenv 로드 성공, 로드된 키:', Object.keys(dotenvResult.parsed || {}));
}

const app = express();

app.use(cors());
app.use(express.json());

// Jenkins Crumb 가져오기
async function getJenkinsCrumb(jenkinsUrl, auth) {
  const baseUrl = jenkinsUrl.replace(/\/$/, '');
  const resp = await fetch(`${baseUrl}/crumbIssuer/api/json`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!resp.ok) {
    console.log('crumb 요청 실패 상태코드:', resp.status);
    return null;
  }

  const data = await resp.json();
  return {
    headerName: data.crumbRequestField,
    crumb: data.crumb,
  };
}

app.post('/api/build', async (req, res) => {
  try {
    const rawPassword = req.body?.password;
    const inputPassword = (rawPassword ?? '').toString().trim();
    const envPassword = (process.env.BUILD_PASSWORD ?? '').toString().trim();

    if (!inputPassword) {
      return res.status(400).json({ message: '비밀번호가 필요합니다.' });
    }

    if (inputPassword !== envPassword) {
      return res
        .status(401)
        .json({ message: '빌드 비밀번호가 일치하지 않습니다.' });
    }

    const jenkinsUrl = process.env.JENKINS_URL;
    const jenkinsUser = process.env.JENKINS_USER;
    const jenkinsToken = process.env.JENKINS_API_TOKEN;
    const jobName = process.env.JENKINS_JOB_NAME;
    const jobToken = process.env.JENKINS_JOB_TOKEN;

    if (!jenkinsUrl || !jenkinsUser || !jenkinsToken || !jobName || !jobToken) {
      console.log('Jenkins env check:', {
        jenkinsUrl,
        jenkinsUser,
        jenkinsTokenSet: !!jenkinsToken,
        jobName,
        jobTokenSet: !!jobToken,
      });

      return res.status(500).json({
        message: 'Jenkins 설정이 완전히 되어 있지 않습니다.',
        hasUrl: !!jenkinsUrl,
        hasUser: !!jenkinsUser,
        hasToken: !!jenkinsToken,
        hasJobName: !!jobName,
        hasJobToken: !!jobToken,
      });
    }

    const auth = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');
    const baseUrl = jenkinsUrl.replace(/\/$/, '');

    // Crumb 먼저 가져오기
    const crumbInfo = await getJenkinsCrumb(baseUrl, auth);

    const headers = {
      Authorization: `Basic ${auth}`,
    };

    // Crumb 있으면 헤더에 추가
    if (crumbInfo && crumbInfo.headerName && crumbInfo.crumb) {
      headers[crumbInfo.headerName] = crumbInfo.crumb;
    }

    const url =
      `${baseUrl}` +
      `/job/${encodeURIComponent(jobName)}/build?token=${encodeURIComponent(jobToken)}`;

    const jenkinsResponse = await fetch(url, {
      method: 'POST',
      headers,
    });

    if (jenkinsResponse.status < 200 || jenkinsResponse.status >= 400) {
      return res
        .status(500)
        .json({ message: `Jenkins 호출 실패 (상태코드: ${jenkinsResponse.status})` });
    }

    return res.json({ message: 'Jenkins 빌드를 시작했습니다.' });
  } catch (err) {
    console.error('빌드 API 에러:', err);
    return res.status(500).json({ message: '빌드 API 처리 중 오류가 발생했습니다.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Build API server listening on port ${PORT}`);
});