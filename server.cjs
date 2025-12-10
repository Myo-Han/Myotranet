// E:\Unreal\HNGAMES\server.cjs

const path = require('path');
const dotenvResult = require('dotenv').config({
  path: path.join(__dirname, '.env'),
});

if (dotenvResult.error) {
  console.log('dotenv 로드 에러:', dotenvResult.error);
} else {
  console.log('dotenv 로드 성공, 로드된 키:', Object.keys(dotenvResult.parsed || {}));
}

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/build', async (req, res) => {
  try {
    const { password } = req.body;

    const inputPassword = (password ?? '').toString().trim();
    const envPassword = (process.env.BUILD_PASSWORD ?? '').toString().trim();

    if (!inputPassword) {
      return res.status(400).json({ message: '비밀번호가 필요합니다.' });
    }

    if (inputPassword !== envPassword) {
      return res.status(401).json({ message: '빌드 비밀번호가 일치하지 않습니다.' });
    }

    const jenkinsUrl = process.env.JENKINS_URL;
    const jenkinsUser = process.env.JENKINS_USER;
    const jenkinsToken = process.env.JENKINS_API_TOKEN;
    const jobName = process.env.JENKINS_JOB_NAME;
    const jobToken = process.env.JENKINS_JOB_TOKEN;

    // 어떤 값이 비었는지 확인용
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
    const url =
      `${jenkinsUrl.replace(/\/$/, '')}` +
      `/job/${encodeURIComponent(jobName)}/build?token=${encodeURIComponent(jobToken)}`;

    const jenkinsResponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
      },
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
